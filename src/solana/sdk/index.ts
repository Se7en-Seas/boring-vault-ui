import { web3 } from '@coral-xyz/anchor';
import { BoringVaultSolana } from './boring-vault-solana';
import { BoringOnchainQueue, BoringQueueStatus } from './boring-onchain-queue';
import { parseFullVaultData } from './vault-state';
import { FullVaultData } from '../types';
import vaultIdl from '../idls/boring_vault_svm.json';
import {
  AccountLayout
} from '@solana/spl-token';
import { createSolanaClient, type SolanaClient, Address } from 'gill';
import {
  JITO_SOL_MINT_ADDRESS,
  DEFAULT_DECIMALS,
} from '../utils/constants';

/**
 * Vault SDK adapter for mainnet testing
 * Wraps the existing BoringVaultSolana class
 */
export class VaultSDK {
  private rpc: SolanaClient['rpc'];
  private boringVault: BoringVaultSolana;
  private boringQueue: BoringOnchainQueue;
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

    // Initialize the BoringOnchainQueue with the solanaClient
    this.boringQueue = new BoringOnchainQueue({
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
   * Get the BoringOnchainQueue instance
   */
  getBoringOnchainQueue(): BoringOnchainQueue {
    return this.boringQueue;
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

    // For convenience, also return the token mint, which is in the teller state
    let tokenMint;
    if (vaultData.teller?.baseAsset) {
      tokenMint = vaultData.teller.baseAsset;
    }

    return {
      ...vaultData,
      tokenMint
    } as FullVaultData & { tokenMint?: web3.PublicKey };
  }

  /**
   * Get the current balance of a vault
   */
  async getVaultBalance(vaultPubkey: web3.PublicKey): Promise<string> {
    // Get vault data using the proper parser
    const vaultData = await this.getVaultData(vaultPubkey);
    const vaultId = Number(vaultData.config.vaultId);

    // Use the depositSubAccount from the parsed data
    const depositSubAccount = vaultData.config.depositSubAccount;

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
   * Deposits native SOL into a vault
   * 
   * @param wallet The wallet that will sign the transaction (supports both keypairs and wallet adapters)
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
      // Build the deposit transaction
      const transaction = await this.boringVault.buildDepositSolTransaction(
        wallet.publicKey,
        vaultId,
        amount,
        minAmount
      );

      // Add recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;

      console.log('📤 Sending transaction...');

      // Sign the transaction
      let signedTransaction: web3.Transaction;
      if ('signTransaction' in wallet) {
        // Using wallet adapter (browser extension)
        signedTransaction = await wallet.signTransaction(transaction);
      } else {
        // Using keypair directly
        transaction.sign(wallet);
        signedTransaction = transaction;
      }

      // Send transaction
      const signature = await this.connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: options.skipPreflight || false,
        preflightCommitment: 'confirmed'
      });

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
      const rawAmount = BigInt(Math.floor(humanReadableAmount * 10 ** DEFAULT_DECIMALS));
      console.log(`Converting ${humanReadableAmount} shares to raw amount: ${rawAmount} (using fixed ${DEFAULT_DECIMALS} decimals)`);

      // Build the transaction using the core implementation
      const transaction = await this.boringVault.buildQueueWithdrawTransaction(
        payerPublicKey,
        vaultId,
        withdrawMint,
        rawAmount,
        discountBasisPoints,
        secondsToDeadline
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

  /**
   * Get the decimal adjusted (human readable) numerical value of vault shares that a user owns
   * 
   * @param userAddress The address of the user in the vault you'd like to get the shares for
   * @param vaultId The vault ID to check shares for
   * @returns A promise that returns the decimal adjusted (human readable) total numerical value of all shares of a vault a user owns
   */
  async fetchUserShares(
    userAddress: string | web3.PublicKey,
    vaultId: number
  ): Promise<number> {
    const result = await this.boringVault.fetchUserShares(userAddress, vaultId);
    return parseFloat(result.formatted);
  }

  /**
   * Get the value for 1 share of the vault in terms of the underlying baseAsset
   * 
   * @param vaultId The vault ID to get the share value for
   * @returns A promise that returns the decimal adjusted (human readable) numerical value for 1 share in terms of the underlying baseAsset
   */
  async fetchShareValue(vaultId: number): Promise<number> {
    const result = await this.boringVault.fetchShareValue(vaultId);
    
    // Format the raw exchange rate with the base asset decimals
    // The exchange rate represents how much base asset 1 share is worth
    const formattedValue = Number(result.raw) / Math.pow(10, result.decimals);
    
    return formattedValue;
  }

  /**
   * Get all NON-EXPIRED withdraw requests for a user
   * This function retrieves a list of all NON EXPIRED withdraw intents.
   * 
   * @param userAddress The user's wallet address (string or PublicKey)
   * @param vaultId Optional vault ID filter
   * @returns A promise that returns a list of BoringQueueStatus objects
   */
  async boringQueueStatuses(
    userAddress: string | web3.PublicKey,
    vaultId?: number
  ): Promise<BoringQueueStatus[]> {
    return await this.boringQueue.boringQueueStatuses(userAddress, vaultId);
  }
}

// Export types for user consumption
export type { BoringQueueStatus, TokenMetadata, WithdrawRequestInfo } from './boring-onchain-queue';
