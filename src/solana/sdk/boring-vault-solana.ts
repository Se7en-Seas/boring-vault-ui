import { web3 } from '@coral-xyz/anchor';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  MintLayout,
  getAssociatedTokenAddress
} from '@solana/spl-token';
import { 
  BASE_SEED_BORING_VAULT_STATE, 
  BASE_SEED_BORING_VAULT,
  BASE_SEED_SHARE_TOKEN,
  BASE_SEED_ASSET_DATA,
  BASE_SEED_USER_WITHDRAW_STATE,
  BORING_VAULT_PROGRAM_ID,
  BORING_QUEUE_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from '../utils/constants';
import { BalanceInfo, BoringVaultSolanaConfig } from '../types';
import { parseFullVaultData } from './vault-state';
import { type SolanaClient, Address, createSolanaClient } from 'gill';
import vaultIdl from '../idls/boring-vault-svm-idl.json';
import queueIdl from '../idls/boring-queue-svm-idl.json';

/**
 * Service for interacting with the BoringVault Solana smart contract
 */
export class BoringVaultSolana {
  private rpc: SolanaClient['rpc'];
  private programId: web3.PublicKey;
  
  constructor({ solanaClient, programId }: BoringVaultSolanaConfig) {
    this.rpc = solanaClient.rpc;
    this.programId = new web3.PublicKey(programId);
  }

  /**
   * Find program address for the given seeds
   */
  private async findProgramAddress(seeds: Buffer[]): Promise<[web3.PublicKey, number]> {
    return await web3.PublicKey.findProgramAddress(seeds, this.programId);
  }

  /**
   * Get the PDA for the vault state account
   */
  async getVaultStatePDA(vaultId: number): Promise<web3.PublicKey> {
    const vaultIdBuffer = Buffer.alloc(8);
    vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
    
    const [pda] = await this.findProgramAddress([
      Buffer.from(BASE_SEED_BORING_VAULT_STATE),
      vaultIdBuffer
    ]);
    
    return pda;
  }

  /**
   * Get the PDA for a vault subaccount
   */
  async getVaultPDA(vaultId: number, subAccount: number): Promise<web3.PublicKey> {
    const vaultIdBuffer = Buffer.alloc(8);
    vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
    
    // Use "vault-" prefix as the base seed
    const [pda] = await this.findProgramAddress([
      Buffer.from(BASE_SEED_BORING_VAULT),
      vaultIdBuffer,
      Buffer.from([subAccount])
    ]);
    
    return pda;
  }

  /**
   * Get the PDA for the share token mint
   */
  async getShareTokenPDA(vaultStatePDA: web3.PublicKey): Promise<web3.PublicKey> {
    const [pda] = await this.findProgramAddress([
      Buffer.from(BASE_SEED_SHARE_TOKEN),
      vaultStatePDA.toBuffer()
    ]);
    
    return pda;
  }

  /**
   * Get the PDA for the asset data account
   */
  async getAssetDataPDA(vaultStatePDA: web3.PublicKey, assetMint: web3.PublicKey): Promise<web3.PublicKey> {
    const [pda] = await this.findProgramAddress([
      Buffer.from(BASE_SEED_ASSET_DATA),
      vaultStatePDA.toBuffer(),
      assetMint.toBuffer()
    ]);
    
    return pda;
  }

  /**
   * Fetch and parse the vault state account
   * Returns the deposit and withdraw subaccount indices
   */
  async getVaultState(vaultId: number): Promise<{ depositSubAccount: number, withdrawSubAccount: number }> {
    const vaultStatePDA = await this.getVaultStatePDA(vaultId);
    // Convert web3.PublicKey to Address type for gill
    const address = vaultStatePDA.toBase58() as Address;
    const response = await this.rpc.getAccountInfo(
      address,
      { encoding: 'base64' }
    ).send();
    
    if (!response.value) {
      throw new Error(`Vault state not found for vault ID ${vaultId}`);
    }
    
    // Validate that data exists and is not empty
    if (!response.value.data || !response.value.data.length) {
      throw new Error(`No data found in vault state for vault ID ${vaultId}`);
    }
    
    // The data structure is different in gill, we need to extract the data properly
    const data = Buffer.from(response.value.data[0], 'base64');
    
    // Use parseFullVaultData from vault-state.ts, which already uses the Anchor coder
    const fullVaultData = parseFullVaultData(data);
    return { 
      depositSubAccount: fullVaultData.vaultState.depositSubAccount,
      withdrawSubAccount: fullVaultData.vaultState.withdrawSubAccount
    };
  }

  /**
   * Get user's balance of vault shares
   */
  async fetchUserShares(
    walletAddress: string | web3.PublicKey,
    vaultId: number
  ): Promise<BalanceInfo> {
    const walletPubkey = typeof walletAddress === 'string'
      ? new web3.PublicKey(walletAddress)
      : walletAddress;
    
    // Get necessary PDAs
    const vaultStatePDA = await this.getVaultStatePDA(vaultId);
    const shareMintPDA = await this.getShareTokenPDA(vaultStatePDA);
    
    // Get user's share token account
    const userShareATA = await this.getTokenAccount(
      walletPubkey,
      shareMintPDA
    );
    
    // Get share token decimals - throw error if we can't get this critical information
    let decimals: number;
    // Convert web3.PublicKey to Address type for gill
    const shareMintAddress = shareMintPDA.toBase58() as Address;
    const mintResponse = await this.rpc.getAccountInfo(
      shareMintAddress,
      { encoding: 'base64' }
    ).send();
    if (!mintResponse.value) {
      throw new Error(`Share token mint account not found at ${shareMintPDA.toString()}`);
    }
    
    // Validate that data exists and is not empty
    if (!mintResponse.value.data || !mintResponse.value.data.length) {
      throw new Error(`No data found in share token mint at ${shareMintPDA.toString()}`);
    }
    
    // Extract data from the gill response
    const mintData = MintLayout.decode(Buffer.from(mintResponse.value.data[0], 'base64'));
    decimals = mintData.decimals;
    
    // Get user's balance - throw error if we can't get token account info
    let rawBalance = BigInt(0);
    try {
      // Convert web3.PublicKey to Address type for gill
      const userShareAddress = userShareATA.toBase58() as Address;
      const tokenResponse = await this.rpc.getAccountInfo(
        userShareAddress,
        { encoding: 'base64' }
      ).send();
      if (tokenResponse.value) {
        // Validate that data exists and is not empty
        if (!tokenResponse.value.data || !tokenResponse.value.data.length) {
          throw new Error(`No data found in token account at ${userShareATA.toString()}`);
        }
        
        // Extract data from the gill response
        const accountData = AccountLayout.decode(Buffer.from(tokenResponse.value.data[0], 'base64'));
        rawBalance = accountData.amount; // amount is already a bigint in newer versions
      }
    } catch (error) {
      // Rethrow with additional context
      throw new Error(`Failed to fetch token account ${userShareATA.toString()}: ${error}`);
    }
    
    // Format the balance with proper decimals
    const formattedBalance = this.formatBalance(rawBalance, decimals);
    
    return {
      raw: rawBalance,
      formatted: formattedBalance,
      decimals
    };
  }
  
  /**
   * Helper to format raw balance with decimals
   */
  private formatBalance(amount: bigint, decimals: number): string {
    const amountStr = amount.toString().padStart(decimals + 1, '0');
    const integerPart = amountStr.slice(0, -decimals) || '0';
    const decimalPart = amountStr.slice(-decimals);
    return `${integerPart}.${decimalPart}`;
  }

  /**
   * Helper to find the associated token address
   */
  private async getTokenAccount(owner: web3.PublicKey, mint: web3.PublicKey): Promise<web3.PublicKey> {
    // Get the mint account info to determine the token program
    const mintAddress = mint.toBase58() as Address;
    const mintResponse = await this.rpc.getAccountInfo(
      mintAddress,
      { encoding: 'base64' }
    ).send();
    
    let tokenProgram = TOKEN_PROGRAM_ID;
    
    if (mintResponse.value) {
      // Extract the owner (token program) from the account info
      tokenProgram = new web3.PublicKey(mintResponse.value.owner);
    }
    
    // Derive the token account with the correct token program
    const userATA = await getAssociatedTokenAddress(
      mint,
      owner,
      true, // allowOwnerOffCurve
      tokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    return userATA;
  }

  /**
   * Extracts the instruction discriminator from the IDL for a given instruction name
   */
  private getInstructionDiscriminator(instructionName: string, idl: any = vaultIdl): Buffer {
    const instruction = (idl.instructions as any[]).find(
      (instr) => instr.name === instructionName
    );
    if (!instruction || !instruction.discriminator) {
      throw new Error(`Instruction '${instructionName}' or its discriminator not found in IDL`);
    }
    return Buffer.from(instruction.discriminator);
  }

  /**
   * Builds a deposit transaction for SPL tokens
   */
  async buildDepositTransaction(
    payer: web3.PublicKey,
    vaultId: number,
    depositMint: web3.PublicKey,
    depositAmount: bigint,
    minMintAmount: bigint
  ): Promise<web3.Transaction> {
    // Get the vault state PDA
    const vaultStatePDA = await this.getVaultStatePDA(vaultId);
    console.log(`DEBUG: Vault State PDA: ${vaultStatePDA.toString()}`);
    
    // Get the vault state to find deposit subaccount
    const vaultState = await this.getVaultState(vaultId);
    
    // Get the vault PDA for the deposit subaccount
    const vaultPDA = await this.getVaultPDA(vaultId, vaultState.depositSubAccount);
    console.log(`DEBUG: Vault PDA (deposit sub-account ${vaultState.depositSubAccount}): ${vaultPDA.toString()}`);
    
    // Get the share token mint PDA
    const shareMintPDA = await this.getShareTokenPDA(vaultStatePDA);
    console.log(`DEBUG: Share Token Mint PDA: ${shareMintPDA.toString()}`);
    
    // Get the share mint account info to find the token program
    const shareMintAddress = shareMintPDA.toBase58() as Address;
    const shareMintResponse = await this.rpc.getAccountInfo(
      shareMintAddress,
      { encoding: 'base64' }
    ).send();
    
    // Default to TOKEN_PROGRAM_ID if we can't retrieve the share mint info
    let shareMintProgram;
    
    if (shareMintResponse.value) {
      // Extract the owner (token program) from the account info
      shareMintProgram = new web3.PublicKey(shareMintResponse.value.owner);
      console.log(`DEBUG: Share Mint Program: ${shareMintProgram.toString()}`);
    } else {
      throw new Error(`Could not retrieve share mint info for ${shareMintPDA.toString()}`);
    }
    
    // Get the asset data PDA
    const assetDataPDA = await this.getAssetDataPDA(vaultStatePDA, depositMint);
    console.log(`DEBUG: Asset Data PDA: ${assetDataPDA.toString()}`);
    
    // Get the user's associated token account for the deposit mint
    const userATA = await this.getTokenAccount(payer, depositMint);
    console.log(`DEBUG: User's Token Account: ${userATA.toString()}`);
    
    // Get the vault's associated token account for the deposit mint
    const vaultATA = await this.getTokenAccount(vaultPDA, depositMint);
    console.log(`DEBUG: Vault's Token Account: ${vaultATA.toString()}`);
    
    // Get the user's associated token account for the share token using the standard SPL token function
    const userSharesATA = await getAssociatedTokenAddress(
      shareMintPDA,    // mint
      payer,           // owner
      true,            // allowOwnerOffCurve
      shareMintProgram, // programId - use shareMintProgram
      ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId
    );
    console.log(`DEBUG: User's Share Token Account: ${userSharesATA.toString()}`);
    
    // Fetch the asset data to get the price feed
    const assetDataAddress = assetDataPDA.toBase58() as Address;
    const assetDataResponse = await this.rpc.getAccountInfo(
      assetDataAddress,
      { encoding: 'base64' }
    ).send();
    
    if (!assetDataResponse.value || !assetDataResponse.value.data.length) {
      throw new Error(`Asset data not found for mint ${depositMint.toString()}`);
    }
    
    // Parse asset data using the parseFullVaultData function
    const assetDataBuffer = Buffer.from(assetDataResponse.value.data[0], 'base64');
    const parsedAssetData = parseFullVaultData(assetDataBuffer);

    // Get price feed address from the parsed asset data
    if (!parsedAssetData.assetData || !parsedAssetData.assetData.priceFeed) {
      throw new Error(`Price feed not found in asset data for mint ${depositMint.toString()}`);
    }
    
    const priceFeedAddress = parsedAssetData.assetData.priceFeed;
    console.log(`DEBUG: Price Feed Address: ${priceFeedAddress.toString()}`);
    
    // Create deposit instruction
    const depositInstruction = new web3.TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: vaultStatePDA, isSigner: false, isWritable: false },
        { pubkey: vaultPDA, isSigner: false, isWritable: false },
        { pubkey: depositMint, isSigner: false, isWritable: false },
        { pubkey: assetDataPDA, isSigner: false, isWritable: false },
        { pubkey: userATA, isSigner: false, isWritable: true },
        { pubkey: vaultATA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: new web3.PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'), isSigner: false, isWritable: false },
        { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: shareMintPDA, isSigner: false, isWritable: true },
        { pubkey: userSharesATA, isSigner: false, isWritable: true },
        { pubkey: priceFeedAddress, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        this.getInstructionDiscriminator('deposit'),
        this.serializeDepositArgs(vaultId, depositAmount, minMintAmount)
      ])
    });
    
    console.log(`DEBUG: Instruction accounts:`);
    depositInstruction.keys.forEach((key, index) => {
      console.log(`  [${index}] ${key.pubkey.toString()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
    });
    
    // Create a new transaction
    const transaction = new web3.Transaction();
    
    // Add the deposit instruction to the transaction
    transaction.add(depositInstruction);
    
    return transaction;
  }

  /**
   * Serializes deposit arguments into a buffer
   */
  private serializeDepositArgs(vaultId: number, depositAmount: bigint, minMintAmount: bigint): Buffer {
    const buffer = Buffer.alloc(24); // 8 bytes for each u64
    
    // Write vaultId as u64 LE
    this.writeUint64LE(buffer, BigInt(vaultId), 0);
    
    // Write depositAmount as u64 LE
    this.writeUint64LE(buffer, depositAmount, 8);
    
    // Write minMintAmount as u64 LE
    this.writeUint64LE(buffer, minMintAmount, 16);
    
    return buffer;
  }

  /**
   * Helper to write a uint64 to a buffer in little-endian format
   */
  private writeUint64LE(buffer: Buffer, value: bigint, offset: number): void {
    const low = Number(value & BigInt(0xffffffff));
    const high = Number(value >> BigInt(32) & BigInt(0xffffffff));
    
    buffer.writeUint32LE(low, offset);
    buffer.writeUint32LE(high, offset + 4);
  }

  /**
   * Deposits SPL tokens into the vault
   */
  async deposit(
    payer: web3.PublicKey,
    vaultId: number,
    depositMint: web3.PublicKey,
    depositAmount: bigint,
    minMintAmount: bigint
  ): Promise<string> {
    // Build the deposit transaction
    const transaction = await this.buildDepositTransaction(
      payer,
      vaultId,
      depositMint,
      depositAmount,
      minMintAmount
    );
    
    // Add recent blockhash
    const blockhashResponse = await this.rpc.getLatestBlockhash().send();
    if (!blockhashResponse.value) {
      throw new Error('Failed to get recent blockhash');
    }
    
    transaction.recentBlockhash = blockhashResponse.value.blockhash;
    transaction.feePayer = payer;
    
    // Return the serialized transaction for signing
    return transaction.serialize({ requireAllSignatures: false }).toString('base64');
  }

  /**
   * Serializes request_withdraw arguments into a buffer
   */
  private serializeRequestWithdrawArgs(
    vaultId: number, 
    shareAmount: bigint, 
    discount: number,
    secondsToDeadline: number
  ): Buffer {
    // From the IDL: vault_id (u64), share_amount (u64), discount (u16), seconds_to_deadline (u32)
    const buffer = Buffer.alloc(22); // 8 + 8 + 2 + 4 bytes
    
    console.log(`DEBUG: Serializing request_withdraw args:`);
    console.log(`  - vaultId: ${vaultId} (${typeof vaultId})`);
    console.log(`  - shareAmount: ${shareAmount.toString()} (${typeof shareAmount})`);
    console.log(`  - discount: ${discount} (${typeof discount})`);
    console.log(`  - secondsToDeadline: ${secondsToDeadline} (${typeof secondsToDeadline})`);
    
    // Write vaultId as u64 LE
    this.writeUint64LE(buffer, BigInt(vaultId), 0);
    
    // Write shareAmount as u64 LE
    this.writeUint64LE(buffer, shareAmount, 8);
    
    // Write discount as u16 LE
    buffer.writeUInt16LE(discount, 16);
    
    // Write secondsToDeadline as u32 LE
    buffer.writeUInt32LE(secondsToDeadline, 18);
    
    return buffer;
  }

  /**
   * Get the queue state PDA for a vault
   */
  async getQueueStatePDA(vaultId: number): Promise<web3.PublicKey> {
    // Create a dedicated queue program ID instance
    const queueProgramId = new web3.PublicKey(BORING_QUEUE_PROGRAM_ID);

    // Convert vaultId to buffer
    const vaultIdBuffer = Buffer.alloc(8);
    vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
    
    // Find the queue state PDA using the queue program ID
    // Using "boring-queue-state" instead of "queue-state" to match the contract
    const [pda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("boring-queue-state"), vaultIdBuffer],
      queueProgramId
    );
    
    return pda;
  }

  /**
   * Get the queue PDA
   */
  async getQueuePDA(vaultId: number): Promise<web3.PublicKey> {
    // Create a dedicated queue program ID instance
    const queueProgramId = new web3.PublicKey(BORING_QUEUE_PROGRAM_ID);

    // Convert vaultId to buffer
    const vaultIdBuffer = Buffer.alloc(8);
    vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
    
    // Find the queue PDA using the queue program ID
    // Using "boring-queue" instead of "queue" to match the contract
    const [pda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("boring-queue"), vaultIdBuffer],
      queueProgramId
    );
    
    return pda;
  }

  /**
   * Get the withdraw asset data PDA
   */
  async getWithdrawAssetDataPDA(queueStatePDA: web3.PublicKey, withdrawMint: web3.PublicKey): Promise<web3.PublicKey> {
    // Create a dedicated queue program ID instance
    const queueProgramId = new web3.PublicKey(BORING_QUEUE_PROGRAM_ID);
    
    // We need to extract the vault ID from the queue state PDA or get it from context
    // This is a temporary workaround - in a real implementation, you'd have the vault ID directly
    let vaultId: number = 0;
    
    // Check if we can get the vault ID from the context (cache)
    if (this._lastVaultId !== undefined) {
      vaultId = this._lastVaultId;
    } else {
      // If we don't have the vault ID cached, we need to derive it
      // This is inefficient but necessary for this implementation
      
      // Try vault IDs 0-100 to find the one that creates a queue state PDA matching what we received
      for (let id = 0; id < 100; id++) {
        const vaultIdBuffer = Buffer.alloc(8);
        vaultIdBuffer.writeBigUInt64LE(BigInt(id), 0);
        
        const [derivedPDA] = await web3.PublicKey.findProgramAddress(
          [Buffer.from("boring-queue-state"), vaultIdBuffer],
          queueProgramId
        );
        
        if (derivedPDA.equals(queueStatePDA)) {
          vaultId = id;
          this._lastVaultId = id; // Cache for future calls
          console.log(`Found matching vault ID: ${vaultId}`);
          break;
        }
      }
    }
    
    // Convert vault ID to buffer
    const vaultIdBuffer = Buffer.alloc(8);
    vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
    
    // Find the withdraw asset data PDA using the correct seeds
    // The seed is "boring-queue-withdraw-asset-data" + vaultIdBuffer + withdrawMint
    const [pda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("boring-queue-withdraw-asset-data"), vaultIdBuffer, withdrawMint.toBuffer()],
      queueProgramId
    );
    
    return pda;
  }

  /**
   * Get the user withdraw state PDA
   */
  async getUserWithdrawStatePDA(owner: web3.PublicKey): Promise<web3.PublicKey> {
    // Create a dedicated queue program ID instance
    const queueProgramId = new web3.PublicKey(BORING_QUEUE_PROGRAM_ID);
    
    // Find the user withdraw state PDA using the queue program ID
    const [pda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from(BASE_SEED_USER_WITHDRAW_STATE), owner.toBuffer()],
      queueProgramId
    );
    
    return pda;
  }

  /**
   * Get the withdraw request PDA
   */
  async getWithdrawRequestPDA(owner: web3.PublicKey, requestId: number): Promise<web3.PublicKey> {
    // Create a dedicated queue program ID instance
    const queueProgramId = new web3.PublicKey(BORING_QUEUE_PROGRAM_ID);
    
    // Convert requestId to buffer
    const requestIdBuffer = Buffer.alloc(8);
    requestIdBuffer.writeBigUInt64LE(BigInt(requestId), 0);
    
    // Find the withdraw request PDA using the queue program ID
    // Using the correct seed format as defined in the contract:
    // [BASE_SEED_WITHDRAW_REQUEST, owner.key().as_ref(), &user_withdraw_state.last_nonce.to_le_bytes()[..]]
    const [pda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("boring-queue-withdraw-request"), owner.toBuffer(), requestIdBuffer],
      queueProgramId
    );
    
    return pda;
  }

  /**
   * Check if an account exists at the given address (public method)
   */
  async doesAccountExist(address: web3.PublicKey): Promise<boolean> {
    const addressStr = address.toBase58() as Address;
    const response = await this.rpc.getAccountInfo(
      addressStr,
      { encoding: 'base64' }
    ).send();
    
    return !!response.value;
  }

  /**
   * Gets the PDA for the config account of the queue program
   */
  async getQueueConfigPDA(): Promise<web3.PublicKey> {
    // Create a dedicated queue program ID instance
    const queueProgramId = new web3.PublicKey(BORING_QUEUE_PROGRAM_ID);
    
    // Find the config PDA using the queue program ID
    const [pda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("config")],
      queueProgramId
    );
    
    return pda;
  }

  /**
   * Builds a transaction to queue a withdraw request from a Boring Vault through the Boring Queue program
   * 
   * @param ownerAddress Public key of the vault share token owner
   * @param vaultId The ID of the vault
   * @param tokenOut Mint address of the token to withdraw
   * @param shareAmount Amount of share tokens to queue for withdrawal
   * @param discount Discount rate in basis points (BPS)
   * @param secondsToDeadline Number of seconds until the withdraw request expires
   * @param queueSharesAccount Optional custom queue shares account
   * @returns An unsigned transaction
   */
  async buildQueueWithdrawTransaction(
    ownerAddress: web3.PublicKey,
    vaultId: number,
    tokenOut: web3.PublicKey,
    shareAmount: bigint,
    discount: number = 0.01, // Default to 0 discount
    secondsToDeadline: number = 86400 * 7, // Default to 7 days
    queueSharesAccount?: web3.PublicKey // Optional custom queue shares account
  ): Promise<web3.Transaction> {
    // Get the vault state PDA
    const vaultStatePDA = await this.getVaultStatePDA(vaultId);
    // Get the share token mint PDA
    const shareMintPDA = await this.getShareTokenPDA(vaultStatePDA);
    // Get queue state PDA
    const queueStatePDA = await this.getQueueStatePDA(vaultId);
    // Get queue PDA
    const queuePDA = await this.getQueuePDA(vaultId);
    // Get withdraw asset data PDA
    const withdrawAssetDataPDA = await this.getWithdrawAssetDataPDA(queueStatePDA, tokenOut);
    // Get user withdraw state PDA
    const userWithdrawStatePDA = await this.getUserWithdrawStatePDA(ownerAddress);
    // Get current user withdraw state to determine next request ID
    // Fetch the actual nonce from the user withdraw state account
    let requestId = 0;
    try {
      const userWithdrawStateAddress = userWithdrawStatePDA.toBase58() as Address;
      const response = await this.rpc.getAccountInfo(
        userWithdrawStateAddress,
        { encoding: 'base64' }
      ).send();
      if (response.value && response.value.data.length) {
        const data = Buffer.from(response.value.data[0], 'base64');
        // Skip the 8-byte discriminator, the next 8 bytes are the nonce
        requestId = Number(data.readBigUInt64LE(8));
      }
    } catch (error) {
      // If we can't fetch, just use 0 (should not happen if setup is correct)
    }
    // Get withdraw request PDA
    const withdrawRequestPDA = await this.getWithdrawRequestPDA(ownerAddress, requestId);
    // Get the user's token 2022 account for the share token
    const userSharesATA = await web3.PublicKey.findProgramAddress(
      [
        ownerAddress.toBuffer(),
        new web3.PublicKey(TOKEN_2022_PROGRAM_ID).toBuffer(),
        shareMintPDA.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    // Get or use the provided queue shares account
    let queueSharesAccountPubkey;
    if (queueSharesAccount) {
      queueSharesAccountPubkey = queueSharesAccount;
    } else {
      const queueSharesATA = await web3.PublicKey.findProgramAddress(
        [
          queuePDA.toBuffer(),
          new web3.PublicKey(TOKEN_2022_PROGRAM_ID).toBuffer(),
          shareMintPDA.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      queueSharesAccountPubkey = queueSharesATA[0];
    }
    // Get the asset data PDA from the Boring Vault program
    const assetDataPDA = await this.getAssetDataPDA(vaultStatePDA, tokenOut);
    // Fetch the asset data to get the price feed
    const assetDataAddress = assetDataPDA.toBase58() as Address;
    const assetDataResponse = await this.rpc.getAccountInfo(
      assetDataAddress,
      { encoding: 'base64' }
    ).send();
    if (!assetDataResponse.value || !assetDataResponse.value.data.length) {
      throw new Error(`Asset data not found for mint ${tokenOut.toString()}`);
    }
    // Parse asset data to get the price feed
    const assetDataBuffer = Buffer.from(assetDataResponse.value.data[0], 'base64');
    const parsedAssetData = parseFullVaultData(assetDataBuffer);
    const priceFeedAddress = parsedAssetData.assetData?.priceFeed;
    if (!priceFeedAddress) {
      throw new Error(`Price feed not found in asset data for mint ${tokenOut.toString()}`);
    }
    // Create request_withdraw instruction
    const requestWithdrawInstruction = new web3.TransactionInstruction({
      programId: new web3.PublicKey(BORING_QUEUE_PROGRAM_ID),
      keys: [
        { pubkey: ownerAddress, isSigner: true, isWritable: true },
        { pubkey: queueStatePDA, isSigner: false, isWritable: false },
        { pubkey: tokenOut, isSigner: false, isWritable: false },
        { pubkey: withdrawAssetDataPDA, isSigner: false, isWritable: false },
        { pubkey: userWithdrawStatePDA, isSigner: false, isWritable: true },
        { pubkey: withdrawRequestPDA, isSigner: false, isWritable: true },
        { pubkey: queuePDA, isSigner: false, isWritable: false },
        { pubkey: shareMintPDA, isSigner: false, isWritable: false },
        { pubkey: userSharesATA[0], isSigner: false, isWritable: true },
        { pubkey: queueSharesAccountPubkey, isSigner: false, isWritable: true },
        { pubkey: new web3.PublicKey(TOKEN_2022_PROGRAM_ID), isSigner: false, isWritable: false },
        { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: new web3.PublicKey(BORING_VAULT_PROGRAM_ID), isSigner: false, isWritable: false },
        { pubkey: vaultStatePDA, isSigner: false, isWritable: false },
        { pubkey: assetDataPDA, isSigner: false, isWritable: false },
        { pubkey: priceFeedAddress, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        this.getInstructionDiscriminator('request_withdraw', queueIdl),
        this.serializeRequestWithdrawArgs(vaultId, shareAmount, discount, secondsToDeadline)
      ])
    });
    // Create a new transaction
    const transaction = new web3.Transaction();
    // Add the request_withdraw instruction to the transaction
    transaction.add(requestWithdrawInstruction);
    return transaction;
  }

  // Add a private property to cache the last vault ID
  private _lastVaultId?: number;
}

// Export a function to create a BoringVaultSolana instance
export const createBoringVaultSolana = (config: {
  urlOrMoniker: string;
  programId: string;
}): BoringVaultSolana => {
  const solanaClient = createSolanaClient({ urlOrMoniker: config.urlOrMoniker });
  return new BoringVaultSolana({
    solanaClient,
    programId: config.programId
  });
}; 