import { web3 } from '@coral-xyz/anchor';
import { HermesClient } from '@pythnetwork/hermes-client';
import { PythSolanaReceiver } from '@pythnetwork/pyth-solana-receiver';
import {
  PYTH_HERMES_URL,
  PYTH_COMPUTE_UNIT_PRICE,
  PYTH_SHARD_ID,
  PYTH_MAX_RETRIES,
  TX_POLL_MAX_ATTEMPTS,
  TX_POLL_INTERVAL_MS,
  TX_POLL_ERROR_INTERVAL_MS,
  COMPUTE_UNIT_PRICES
} from './constants';

/**
 * Configuration for Pyth oracle integration
 */
export interface PythOracleConfig {
  /** Solana RPC connection */
  connection: web3.Connection;
  /** Wallet public key that will pay for the transaction */
  payer: web3.PublicKey;
  /** Price feed IDs to fetch updates for */
  priceFeedIds: string[];
  /** Hermes endpoint URL (optional, defaults to Pyth's public instance) */
  hermesUrl?: string;
  /** Whether to close update accounts after use to reclaim rent */
  closeUpdateAccounts?: boolean;
  /** Shard ID for price feed accounts (default: 0) */
  shardId?: number;
  /** Compute unit price in micro-lamports (optional, defaults to network-appropriate value) */
  computeUnitPrice?: number;
}

/**
 * Creates Pyth price feed account addresses for fixed-address price feeds
 * This approach uses continuously updated accounts maintained by Pyth
 */
export async function getPythPriceFeedAddresses(
  connection: web3.Connection,
  priceFeedIds: string[],
  shardId: number = 0
): Promise<{ [priceFeedId: string]: web3.PublicKey }> {
  try {
    // Create a minimal wallet interface for PythSolanaReceiver
    const dummyWallet = {
      publicKey: web3.Keypair.generate().publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };

    const pythSolanaReceiver = new PythSolanaReceiver({ 
      connection, 
      wallet: dummyWallet as any 
    });

    const addresses: { [priceFeedId: string]: web3.PublicKey } = {};
    
    for (const priceFeedId of priceFeedIds) {
      const priceFeedAccount = pythSolanaReceiver.getPriceFeedAccountAddress(
        shardId, 
        priceFeedId
      );
      addresses[priceFeedId] = priceFeedAccount;
      console.log(`✓ Price feed account for ${priceFeedId}: ${priceFeedAccount.toString()}`);
    }

    return addresses;
  } catch (error) {
    console.error('Failed to get Pyth price feed addresses:', error);
    throw error;
  }
}

/**
 * Fetches latest price updates from Hermes for the specified price feed IDs
 */
export async function fetchPythPriceUpdates(
  priceFeedIds: string[],
  hermesUrl: string = 'https://hermes.pyth.network/'
): Promise<string[]> {
  try {
    console.log(`Fetching price updates for ${priceFeedIds.length} price feeds from Hermes...`);
    
    const hermesClient = new HermesClient(hermesUrl, {});
    
    const priceUpdateResponse = await hermesClient.getLatestPriceUpdates(
      priceFeedIds,
      { encoding: 'base64' }
    );

    const priceUpdateData = priceUpdateResponse.binary.data;
    
    console.log(`✓ Fetched ${priceUpdateData.length} price updates from Hermes`);
    console.log(`First update preview: ${priceUpdateData[0]?.substring(0, 100)}...`);
    
    return priceUpdateData;
  } catch (error) {
    console.error('Failed to fetch price updates from Hermes:', error);
    throw error;
  }
}

/**
 * Creates Pyth price update instructions using legacy transactions
 * This approach is much more reliable than extracting from versioned transactions
 */
export async function getPythPriceUpdateInstructions(
  config: PythOracleConfig
): Promise<{
  instructions: web3.TransactionInstruction[],
  lookupTables: web3.AddressLookupTableAccount[],
  getPriceUpdateAccount: (priceFeedId: string) => web3.PublicKey
}> {
  const { 
    connection, 
    payer, 
    priceFeedIds, 
    hermesUrl = 'https://hermes.pyth.network/',
    closeUpdateAccounts = false 
  } = config;

  try {
    console.log(`Generating Pyth price update instructions for ${priceFeedIds.length} price feeds...`);

    // Fetch price updates from Hermes
    const priceUpdateData = await fetchPythPriceUpdates(priceFeedIds, hermesUrl);

    // Create wallet interface for PythSolanaReceiver
    const payerWallet = {
      publicKey: payer,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };

    const pythSolanaReceiver = new PythSolanaReceiver({ 
      connection, 
      wallet: payerWallet as any 
    });

    // Create transaction builder
    const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts
    });

    // Add partially verified price update posting instructions (requires fewer transactions)
    await transactionBuilder.addPostPartiallyVerifiedPriceUpdates(priceUpdateData);

    // Store references to important functions
    let priceUpdateAccountGetter: ((priceFeedId: string) => web3.PublicKey) | null = null;
    const instructions: web3.TransactionInstruction[] = [];

    // Add consumer instructions to capture the getPriceUpdateAccount function
    await transactionBuilder.addPriceConsumerInstructions(
      async (getPriceUpdateAccount) => {
        priceUpdateAccountGetter = getPriceUpdateAccount;
        return []; // Return empty array - we just want the getter function
      }
    );

    // Build as LEGACY transactions for simpler instruction extraction
    const legacyTxs = await transactionBuilder.buildLegacyTransactions({
      computeUnitPriceMicroLamports: 50000,
    });

    // Extract instructions from legacy transactions (much cleaner!)
    for (const txWithSigners of legacyTxs) {
      const transaction = txWithSigners.tx;
      instructions.push(...transaction.instructions);
    }

    console.log(`✓ Generated ${instructions.length} Pyth price update instructions`);

    // Create a safe getter function
    const safeGetPriceUpdateAccount = (priceFeedId: string): web3.PublicKey => {
      if (!priceUpdateAccountGetter) {
        throw new Error('Price update account getter not initialized');
      }
      return priceUpdateAccountGetter(priceFeedId);
    };

    return {
      instructions,
      lookupTables: [], // Legacy transactions don't use lookup tables
      getPriceUpdateAccount: safeGetPriceUpdateAccount
    };

  } catch (error) {
    console.error('Failed to generate Pyth price update instructions:', error);
    throw error;
  }
}

/**
 * Bundles Pyth price update instructions with other instructions
 */
export async function bundlePythPriceUpdates(
  config: PythOracleConfig,
  otherInstructions: web3.TransactionInstruction[]
): Promise<{
  instructions: web3.TransactionInstruction[],
  lookupTables: web3.AddressLookupTableAccount[],
  getPriceUpdateAccount: (priceFeedId: string) => web3.PublicKey
}> {
  const { instructions: priceUpdateInstructions, lookupTables, getPriceUpdateAccount } = 
    await getPythPriceUpdateInstructions(config);
  
  console.log(`Bundling ${priceUpdateInstructions.length} Pyth instructions with ${otherInstructions.length} other instructions`);
  
  return {
    instructions: [...priceUpdateInstructions, ...otherInstructions],
    lookupTables,
    getPriceUpdateAccount
  };
}

/**
 * Simple helper to get a single price feed account address
 */
export async function getPythPriceFeedAccount(
  connection: web3.Connection,
  priceFeedId: string,
  shardId: number = 0
): Promise<web3.PublicKey> {
  const addresses = await getPythPriceFeedAddresses(connection, [priceFeedId], shardId);
  return addresses[priceFeedId];
}

/**
 * Polls for transaction confirmation using the same pattern as the rest of the codebase
 */
async function pollTransactionStatus(
  connection: web3.Connection, 
  signature: string,
  silent: boolean = true
): Promise<void> {
  for (let attempt = 0; attempt < TX_POLL_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await connection.getSignatureStatuses([signature]);
      const status = response.value[0];
      
      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        
        if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
          return; // Success!
        }
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, TX_POLL_INTERVAL_MS));
      if (!silent) {
        process.stdout.write('.');
      }
    } catch (error) {
      // Check if this is a transaction failure error that should stop polling
      if (error instanceof Error && error.message.includes('Transaction failed:')) {
        throw error;
      }
      
      // This is a network/API error, continue polling but warn
      if (!silent && attempt >= TX_POLL_MAX_ATTEMPTS - 3) {
        throw new Error(`Polling failed after ${attempt + 1} attempts: ${error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, TX_POLL_ERROR_INTERVAL_MS));
    }
  }
  
  // If we reach here, polling finished without confirmation
  throw new Error(`Transaction polling timed out after ${TX_POLL_MAX_ATTEMPTS} attempts. Signature: ${signature}`);
}

/**
 * Cranks Pyth price feeds using addUpdatePriceFeed with shard ID 1
 * This creates the fixed price feed accounts that the smart contract expects
 * 
 * @param connection - Solana RPC connection
 * @param wallet - Either a Keypair or wallet adapter interface (e.g., Phantom, Solflare)
 * @param priceFeedIds - Array of Pyth price feed IDs to update
 * @param hermesUrl - Hermes endpoint URL for fetching price updates
 * @param computeUnitPrice - Compute unit price in micro-lamports (defaults to oracle-optimized price)
 * @returns Transaction signature of the final oracle crank transaction
 */
export async function crankPythPriceFeeds(
  connection: web3.Connection,
  wallet: { publicKey: web3.PublicKey; signTransaction: (tx: web3.Transaction) => Promise<web3.Transaction> } | web3.Keypair,
  priceFeedIds: string[],
  hermesUrl: string = PYTH_HERMES_URL,
  computeUnitPrice: number = COMPUTE_UNIT_PRICES.PYTH_ORACLE_CRANK
): Promise<string> {
  // Suppress console errors temporarily to avoid noisy RPC logs
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  // Only suppress specific RPC/websocket errors
  console.error = (...args) => {
    const message = args.join(' ');
    if (message.includes('JSON-RPC error') || 
        message.includes('signatureSubscribe') || 
        message.includes('WebSocket') ||
        message.includes('rpc-websockets')) {
      return; // Suppress these errors
    }
    originalConsoleError(...args);
  };
  
  console.warn = (...args) => {
    const message = args.join(' ');
    if (message.includes('JSON-RPC error') || 
        message.includes('signatureSubscribe') || 
        message.includes('WebSocket') ||
        message.includes('rpc-websockets')) {
      return; // Suppress these warnings
    }
    originalConsoleWarn(...args);
  };

  try {
    // Get the public key regardless of wallet type
    const payerPublicKey = wallet.publicKey;

    // Create wallet interface for PythSolanaReceiver
    const payerWallet = {
      publicKey: payerPublicKey,
      signTransaction: async (tx: any) => {
        if ('signTransaction' in wallet) {
          // Using wallet adapter
          return await wallet.signTransaction(tx);
        } else {
          // Using keypair
          tx.sign(wallet);
          return tx;
        }
      },
      signAllTransactions: async (txs: any[]) => {
        if ('signTransaction' in wallet) {
          // For wallet adapters, we need to sign each transaction individually
          // since most wallet adapters don't support signAllTransactions
          const signedTxs = [];
          for (const tx of txs) {
            const signedTx = await wallet.signTransaction(tx);
            signedTxs.push(signedTx);
          }
          return signedTxs;
        } else {
          // Using keypair
          txs.forEach(tx => tx.sign(wallet));
          return txs;
        }
      },
    };

    // Initialize PythSolanaReceiver
    const pythSolanaReceiver = new PythSolanaReceiver({ 
      connection, 
      wallet: payerWallet as any 
    });

    // Fetch price updates from Hermes
    const hermesClient = new HermesClient(hermesUrl, {});
    const priceUpdateResponse = await hermesClient.getLatestPriceUpdates(
      priceFeedIds,
      { encoding: 'base64' }
    );

    const priceUpdateData = priceUpdateResponse.binary.data;

    // Create transaction builder
    const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({});
    
    // Update the price feed accounts for the feed ids in priceUpdateData and shard id 1
    await transactionBuilder.addUpdatePriceFeed(priceUpdateData, PYTH_SHARD_ID);

    await transactionBuilder.addPriceConsumerInstructions(
      async (
        getPriceUpdateAccount: (priceFeedId: string) => web3.PublicKey
      ): Promise<any[]> => {
        // Generate instructions here that use the price updates posted above.
        // getPriceUpdateAccount(<price feed id>) will give you the account for each price update.
        return [];
      }
    );

    // Build legacy transactions for better compatibility
    const legacyTxs = await transactionBuilder.buildLegacyTransactions({
      computeUnitPriceMicroLamports: computeUnitPrice,
    });

    // Send transactions
    let finalSignature = '';
    for (let i = 0; i < legacyTxs.length; i++) {
      const { tx, signers } = legacyTxs[i];
      
      // Get latest blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = payerPublicKey;
      
      // Sign transaction
      if ('signTransaction' in wallet) {
        // Using wallet adapter - sign the main transaction
        const signedTx = await wallet.signTransaction(tx);
        
        // If there are additional signers (ephemeral keypairs), we need to add their signatures
        if (signers && signers.length > 0) {
          signedTx.partialSign(...signers);
        }
        
        // Send the signed transaction
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: PYTH_MAX_RETRIES
        });
        
        // Use the same polling pattern as the rest of the codebase
        await pollTransactionStatus(connection, signature, true);
        
        finalSignature = signature;
      } else {
        // Using keypair - sign with all required signers
        const allSigners = [wallet, ...(signers || [])];
        if (allSigners.length === 1) {
          tx.sign(allSigners[0]);
        } else {
          tx.partialSign(...allSigners);
        }
        
        // Send transaction
        const signature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: PYTH_MAX_RETRIES
        });
        
        // Use the same polling pattern as the rest of the codebase
        await pollTransactionStatus(connection, signature, true);
        
        finalSignature = signature;
      }
    }

    return finalSignature;

  } catch (error) {
    throw error;
  } finally {
    // Restore original console methods
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
} 