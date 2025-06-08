import { web3 } from '@coral-xyz/anchor';
import { BoringVaultSolana } from './boring-vault-solana';
import { parseFullVaultData, FullVaultData } from './vault-state';
import vaultIdl from '../idls/boring-vault-svm-idl.json';
import { 
  AccountLayout
} from '@solana/spl-token';
import { createSolanaClient, type SolanaClient, Address } from 'gill';
import { 
  JITO_SOL_MINT_ADDRESS,
  DEFAULT_DECIMALS,
  JITO_SOL_PRICE_FEED_ADDRESS
} from '../utils/constants';
import {
  bundleSwitchboardCrank,
  type SwitchboardCrankConfig
} from '../utils/switchboard-crank';

/**
 * Vault SDK adapter for mainnet testing
 * Wraps the existing BoringVaultSolana class
 */
export class VaultSDK {
  private rpc: SolanaClient['rpc'];
  private boringVault: BoringVaultSolana;
  private programId: web3.PublicKey;
  private solanaClient: SolanaClient;
  private rpcUrl: string;
  private connection: web3.Connection;
  
  constructor(urlOrMoniker: string) {
    this.rpcUrl = urlOrMoniker;
    this.solanaClient = createSolanaClient({ urlOrMoniker });
    this.rpc = this.solanaClient.rpc;
    
    // Get program ID from env or IDL
    this.programId = new web3.PublicKey(
      process.env.BORING_VAULT_PROGRAM_ID || 
      vaultIdl.address 
    );
    
    // Initialize the BoringVaultSolana with the solanaClient
    this.boringVault = new BoringVaultSolana({
      solanaClient: this.solanaClient,
      programId: this.programId.toString()
    });
    
    // Initialize the shared connection
    this.connection = new web3.Connection(
      process.env.ALCHEMY_RPC_URL || this.rpcUrl,
      { commitment: 'confirmed' }
    );
  }

  /**
   * For testing purposes - get the underlying BoringVaultSolana instance
   */
  getBoringVault(): BoringVaultSolana {
    return this.boringVault;
  }

  /**
   * Get vault data for a given vault
   */
  async getVaultData(vaultPubkey: web3.PublicKey): Promise<FullVaultData> {
    // Convert web3.PublicKey to Address type for gill
    const address = vaultPubkey.toBase58() as Address;
    // Get the account directly for the vaultPubkey parameter 
    const response = await this.rpc.getAccountInfo(
      address,
      { encoding: 'base64' }
    ).send();
    if (!response.value || !response.value.data.length) {
      throw new Error(`Vault account not found: ${vaultPubkey.toString()}`);
    }
    
    // Extract data from the gill response
    const data = Buffer.from(response.value.data[0], 'base64');
    
    // Parse the full vault data using our comprehensive parser
    const vaultData = parseFullVaultData(data);
    
    // For convenience, also return the token mint, which might be in the assetData
    let tokenMint;
    if (vaultData.tellerState?.baseAsset) {
      tokenMint = vaultData.tellerState.baseAsset;
    }
    
    return {
      ...vaultData,
      tokenMint
    };
  }

  /**
   * Get the current balance of a vault
   */
  async getVaultBalance(vaultPubkey: web3.PublicKey): Promise<string> {
    // Get vault data using the proper parser
    const vaultData = await this.getVaultData(vaultPubkey);
    const vaultId = Number(vaultData.vaultState.vaultId);
    
    // Use the depositSubAccount from the parsed data
    const depositSubAccount = vaultData.vaultState.depositSubAccount;
    
    // Check vault token account using the deposit sub-account value
    const depositPDA = await this.boringVault.getVaultPDA(vaultId, depositSubAccount);
    
    // Convert web3.PublicKey to Address type for gill
    const depositAddress = depositPDA.toBase58() as Address;
    // Check if token account exists
    const response = await this.rpc.getAccountInfo(
      depositAddress,
      { encoding: 'base64' }
    ).send();
    if (response.value) {
      // Extract data from the gill response
      const data = Buffer.from(response.value.data[0], 'base64');
      // Parse token account data
      const accountData = AccountLayout.decode(data);
      return accountData.amount.toString();
    }
    
    // If no token account exists, return 0
    return '0';
  }

  /**
   * Deposits SPL tokens into a vault
   * 
   * @param wallet The wallet that will sign the transaction
   * @param vaultId The ID of the vault to deposit into
   * @param depositMint The mint of the token to deposit
   * @param depositAmount The amount of tokens to deposit
   * @param minMintAmount The minimum amount of shares to mint
   * @param options Additional options for the deposit transaction
   * @returns The transaction signature
   */
  async deposit(
    wallet: { publicKey: web3.PublicKey; signTransaction: (tx: web3.Transaction) => Promise<web3.Transaction> } | web3.Keypair,
    vaultId: number,
    depositMint: web3.PublicKey | string = JITO_SOL_MINT_ADDRESS,
    depositAmount: bigint | string,
    minMintAmount: bigint | string,
    options: {
      skipPreflight?: boolean;
      maxRetries?: number;
      skipStatusCheck?: boolean;
    } = {}
  ): Promise<string> {
    // Convert string inputs to proper types
    const tokenMint = typeof depositMint === 'string' 
      ? new web3.PublicKey(depositMint) 
      : depositMint;
    
    const amount = typeof depositAmount === 'string' 
      ? BigInt(depositAmount) 
      : depositAmount;
    
    const minAmount = typeof minMintAmount === 'string' 
      ? BigInt(minMintAmount) 
      : minMintAmount;
    
    // Validate input parameters
    if (amount <= BigInt(0)) {
      throw new Error(`Invalid depositAmount: ${amount.toString()}. Must be a positive non-zero value.`);
    }
    if (minAmount <= BigInt(0)) {
      throw new Error(`Invalid minMintAmount: ${minAmount.toString()}. Must be a positive non-zero value.`);
    }
    
    try {
      // Get the wallet's public key
      const payerPublicKey = 'signTransaction' in wallet 
        ? wallet.publicKey 
        : wallet.publicKey;
      
      // Build the deposit transaction using the core implementation
      const transaction = await this.boringVault.buildDepositTransaction(
        payerPublicKey,
        vaultId,
        tokenMint,
        amount,
        minAmount
      );
      
      // Add recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payerPublicKey;
      
      // Sign the transaction
      let signedTx: web3.Transaction;
      if ('signTransaction' in wallet) {
        // Using wallet adapter
        signedTx = await wallet.signTransaction(transaction);
      } else {
        // Using keypair
        transaction.sign(wallet);
        signedTx = transaction;
      }
      
      console.log('Transaction signed, sending to network...');
      
      // Send transaction
      const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: options.skipPreflight || false,
        preflightCommitment: 'confirmed'
      });
      
      console.log(`Transaction sent! Signature: ${signature}`);
      console.log(`View on explorer: https://solscan.io/tx/${signature}`);

      return signature;
    } catch (error) {
      console.error('Deposit error:', error);
      throw new Error(`Failed to deposit: ${error}`);
    }
  }

  /**
   * Deposits native SOL into a vault with automatic oracle cranking
   * 
   * @param wallet The wallet that will sign the transaction
   * @param vaultId The ID of the vault to deposit into
   * @param depositAmount The amount of SOL to deposit (in lamports)
   * @param minMintAmount The minimum amount of shares to mint
   * @param options Additional options for the deposit transaction
   * @returns The transaction signature
   */
  async depositSol(
    wallet: { publicKey: web3.PublicKey; signTransaction: (tx: web3.Transaction) => Promise<web3.Transaction> } | web3.Keypair,
    vaultId: number,
    depositAmount: bigint | string,
    minMintAmount: bigint | string,
    options: {
      skipPreflight?: boolean;
      maxRetries?: number;
      skipStatusCheck?: boolean;
      enableOracleCrank?: boolean; // New option to enable/disable oracle cranking
    } = {}
  ): Promise<string> {
    // Convert string inputs to proper types
    const amount = typeof depositAmount === 'string' 
      ? BigInt(depositAmount) 
      : depositAmount;
    
    const minAmount = typeof minMintAmount === 'string' 
      ? BigInt(minMintAmount) 
      : minMintAmount;
    
    // Validate input parameters
    if (amount <= BigInt(0)) {
      throw new Error(`Invalid depositAmount: ${amount.toString()}. Must be a positive non-zero value.`);
    }
    if (minAmount <= BigInt(0)) {
      throw new Error(`Invalid minMintAmount: ${minAmount.toString()}. Must be a positive non-zero value.`);
    }
    
    try {
      // Get the wallet's public key
      const payerPublicKey = 'signTransaction' in wallet 
        ? wallet.publicKey 
        : wallet.publicKey;
      
      // Build the base deposit transaction
      const baseTransaction = await this.boringVault.buildDepositSolTransaction(
        payerPublicKey,
        vaultId,
        amount,
        minAmount
      );
      
      let finalTransaction: web3.Transaction;
      let lookupTables: any[] = [];
      
      // Add oracle cranking (enabled by default)
      if (options.enableOracleCrank !== false) {
        console.log('Adding automatic oracle cranking to SOL deposit with 3 responses...');
        
        try {
          // Configure Switchboard cranking for jitoSOL price feed with 3 responses
          const switchboardConfig: SwitchboardCrankConfig = {
            connection: this.connection,
            feedAddress: new web3.PublicKey(JITO_SOL_PRICE_FEED_ADDRESS),
            payer: payerPublicKey,
            numResponses: 3 // Always use 3 oracle responses
          };
          
          // Bundle the oracle crank with the deposit transaction
          const bundledResult = await bundleSwitchboardCrank(
            switchboardConfig,
            baseTransaction.instructions
          );
          
          console.log(`✓ Added ${bundledResult.instructions.length - baseTransaction.instructions.length} oracle crank instructions`);
          
          // Create a new transaction with bundled instructions
          finalTransaction = new web3.Transaction();
          finalTransaction.add(...bundledResult.instructions);
          lookupTables = bundledResult.lookupTables;
          
        } catch (oracleError) {
          console.warn('Oracle cranking failed, proceeding with deposit only:', oracleError);
          // Fallback to base transaction if oracle cranking fails
          finalTransaction = baseTransaction;
        }
      } else {
        console.log('Oracle cranking disabled, using deposit-only transaction');
        finalTransaction = baseTransaction;
      }
      
      // Add recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      finalTransaction.recentBlockhash = blockhash;
      finalTransaction.feePayer = payerPublicKey;
      
      console.log('🔄 Using Versioned Transaction with lookup tables...');
        
        // Create versioned transaction message
        const message = new web3.TransactionMessage({
          payerKey: payerPublicKey,
          recentBlockhash: blockhash,
          instructions: finalTransaction.instructions,
        }).compileToV0Message(lookupTables);
        
        // Create versioned transaction
        const versionedTx = new web3.VersionedTransaction(message);
        
        // Sign the versioned transaction
      let signedTransaction: any;
        if ('signTransaction' in wallet) {
        // Using wallet adapter (browser extension)
        // Cast to any to handle the type compatibility between Transaction and VersionedTransaction
        signedTransaction = await wallet.signTransaction(versionedTx as any);
        } else {
        // Using keypair directly
          versionedTx.sign([wallet]);
        signedTransaction = versionedTx;
        }
        
        // Send versioned transaction
      const signature = await this.connection.sendRawTransaction(signedTransaction.serialize(), {
          skipPreflight: options.skipPreflight || false,
          preflightCommitment: 'confirmed'
        });
      
      console.log(`SOL deposit transaction sent! Signature: ${signature}`);
      console.log(`View on explorer: https://solscan.io/tx/${signature}`);

      return signature;
    } catch (error) {
      console.error('SOL deposit error:', error);
      throw new Error(`Failed to deposit SOL: ${error}`);
    }
  }

  /**
   * Queues a withdraw request from a Boring Vault, which can later be fulfilled by external parties (solvers) at a discount
   * 
   * @param wallet The wallet that will sign the transaction
   * @param vaultId The ID of the vault to withdraw from
   * @param tokenOut The mint of the token to withdraw
   * @param shareAmount The human-readable amount of share tokens to queue for withdrawal (e.g., 1.0 for 1 share)
   * @param discountPercent The discount rate in percentage (e.g., 2.5 for 2.5%)
   * @param secondsToDeadline The number of seconds until the withdraw request expires
   * @param queueSharesAccount Optional queue shares account address
   * @param options Additional options for the transaction
   * @returns The transaction signature
   */
  async queueBoringWithdraw(
    wallet: { publicKey: web3.PublicKey; signTransaction: (tx: web3.Transaction) => Promise<web3.Transaction> } | web3.Keypair,
    vaultId: number,
    tokenOut: web3.PublicKey | string,
    shareAmount: number | string,
    discountPercent: number = 0,
    secondsToDeadline: number = 86400 * 7, // Default to 7 days
    queueSharesAccount?: web3.PublicKey,
    options: {
      skipPreflight?: boolean;
      maxRetries?: number;
      skipStatusCheck?: boolean;
    } = {}
  ): Promise<string> {
    // Convert string inputs to proper types
    const withdrawMint = typeof tokenOut === 'string' 
      ? new web3.PublicKey(tokenOut) 
      : tokenOut;
    
    // Convert the human-readable shareAmount to a number
    const humanReadableAmount = typeof shareAmount === 'string'
      ? parseFloat(shareAmount)
      : shareAmount;
    
    try {
      // Validate inputs and convert percentage to basis points
      if (discountPercent < 0 || discountPercent > 5) {
        throw new Error('Discount percentage must be between 0% and 5%');
      }
      
      // Convert percentage to basis points (100 basis points = 1%)
      const discountBasisPoints = Math.round(discountPercent * 100);
      console.log(`Converting discount ${discountPercent}% to ${discountBasisPoints} basis points`);
      
      // Ensure the basis points value is an integer
      if (!Number.isInteger(discountBasisPoints)) {
        throw new Error('Discount percentage must convert to an integer number of basis points');
      }
      
      if (humanReadableAmount <= 0) {
        throw new Error('Share amount must be greater than 0');
      }
      
      if (secondsToDeadline < 3600) {
        throw new Error('Deadline must be at least 1 hour');
      }
      
      // Get the wallet's public key
      const payerPublicKey = 'signTransaction' in wallet 
        ? wallet.publicKey 
        : wallet.publicKey;
      
      // Convert human-readable amount to raw amount with fixed 9 decimals (like SOL)
      // 1.0 share becomes 1,000,000,000 raw units
      const rawAmount = BigInt(Math.floor(humanReadableAmount * 10**DEFAULT_DECIMALS));
      console.log(`Converting ${humanReadableAmount} shares to raw amount: ${rawAmount} (using fixed ${DEFAULT_DECIMALS} decimals)`);
      
      // Build the transaction using the core implementation
      const transaction = await this.boringVault.buildQueueWithdrawTransaction(
        payerPublicKey,
        vaultId,
        withdrawMint,
        rawAmount,
        discountBasisPoints,
        secondsToDeadline,
        queueSharesAccount
      );
      
      // Add recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payerPublicKey;
      
      // Sign the transaction
      let signedTx: web3.Transaction;
      if ('signTransaction' in wallet) {
        // Using wallet adapter
        signedTx = await wallet.signTransaction(transaction);
      } else {
        // Using keypair
        transaction.sign(wallet);
        signedTx = transaction;
      }
      
      console.log('Transaction signed, sending to network...');
      
      // Send transaction
      const signature = await this.connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: options.skipPreflight || false,
        preflightCommitment: 'confirmed'
      });
      
      console.log(`Transaction sent! Signature: ${signature}`);
      console.log(`View on explorer: https://solscan.io/tx/${signature}`);

      return signature;
    } catch (error) {
      console.error('Queue Withdraw error:', error);
      throw new Error(`Failed to queue withdraw: ${error}`);
    }
  }
}
