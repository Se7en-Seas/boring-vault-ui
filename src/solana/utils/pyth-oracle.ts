import { web3 } from '@coral-xyz/anchor';
import { HermesClient } from '@pythnetwork/hermes-client';
import { PythSolanaReceiver } from '@pythnetwork/pyth-solana-receiver';

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

    // Add price update posting instructions
    await transactionBuilder.addPostPriceUpdates(priceUpdateData);

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