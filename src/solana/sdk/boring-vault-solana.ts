import { web3, BorshCoder, Idl, BN } from '@coral-xyz/anchor';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  MintLayout,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction
} from '@solana/spl-token';
import { 
  BASE_SEED_BORING_VAULT_STATE, 
  BASE_SEED_BORING_VAULT,
  BASE_SEED_SHARE_TOKEN,
  BASE_SEED_ASSET_DATA,
  BASE_SEED_USER_WITHDRAW_STATE,
  BORING_VAULT_PROGRAM_ID,
  BORING_QUEUE_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  NATIVE_SOL_MINT,
  DEFAULT_DECIMALS
} from '../utils/constants';
import { BalanceInfo, BoringVaultSolanaConfig } from '../types';
import { parseFullVaultData, parseAssetData } from './vault-state';
import { type SolanaClient, Address, createSolanaClient } from 'gill';
import vaultIdl from '../idls/boring_vault_svm.json';
import queueIdl from '../idls/boring_onchain_queue.json';

/**
 * Service for interacting with the BoringVault Solana smart contract
 */
export class BoringVaultSolana {
  private rpc: SolanaClient['rpc'];
  private programId: web3.PublicKey;
  private vaultCoder: BorshCoder;
  private queueCoder: BorshCoder;
  
  constructor({ solanaClient, programId }: BoringVaultSolanaConfig) {
    this.rpc = solanaClient.rpc;
    this.programId = new web3.PublicKey(programId);
    this.vaultCoder = new BorshCoder(vaultIdl as Idl);
    this.queueCoder = new BorshCoder(queueIdl as Idl);
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
      depositSubAccount: fullVaultData.config.depositSubAccount,
      withdrawSubAccount: fullVaultData.config.withdrawSubAccount
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
   * Get the value of 1 share in terms of the underlying base asset
   * Uses the exchange_rate stored in the vault state
   */
  async fetchShareValue(vaultId: number): Promise<BalanceInfo> {
    try {
      // Get the vault state PDA and fetch the vault data
      const vaultStatePDA = await this.getVaultStatePDA(vaultId);
      
      // Convert web3.PublicKey to Address type for gill
      const address = vaultStatePDA.toBase58() as Address;
      const response = await this.rpc.getAccountInfo(
        address,
        { encoding: 'base64' }
      ).send();
      
      if (!response.value || !response.value.data || !response.value.data.length) {
        throw new Error(`Vault state not found for vault ID ${vaultId}`);
      }
      
      // Parse the vault data to get the exchange rate
      const data = Buffer.from(response.value.data[0], 'base64');
      const fullVaultData = parseFullVaultData(data);
      
      if (!fullVaultData.teller) {
        throw new Error(`Teller state not found in vault ${vaultId}`);
      }
      
      // Get the exchange rate from the teller state
      const rawExchangeRate = fullVaultData.teller.exchangeRate;
      
      // Get the base asset decimals from the teller state
      const baseAssetDecimals = fullVaultData.teller.decimals;
      
      // Return raw data - formatting will be done in the high-level API
      return {
        raw: rawExchangeRate,
        formatted: rawExchangeRate.toString(), // Just return the raw string for now
        decimals: baseAssetDecimals
      };
      
    } catch (error) {
      console.error('Error fetching share value:', error);
      throw new Error(`Failed to fetch share value for vault ${vaultId}: ${error}`);
    }
  }
  
  /**
   * Get the total supply of share tokens for a vault
   * @param vaultId - The vault ID
   * @returns BalanceInfo with the total supply of share tokens
   */
  async fetchShareMintSupply(vaultId: number): Promise<BalanceInfo> {
    try {
      // Get the vault state PDA and share token mint PDA
      const vaultStatePDA = await this.getVaultStatePDA(vaultId);
      const shareMintPDA = await this.getShareTokenPDA(vaultStatePDA);
      
      // Get the share token mint account info
      const shareMintAddress = shareMintPDA.toBase58() as Address;
      const mintResponse = await this.rpc.getAccountInfo(
        shareMintAddress,
        { encoding: 'base64' }
      ).send();
      
      if (!mintResponse.value || !mintResponse.value.data || !mintResponse.value.data.length) {
        throw new Error(`Share token mint account not found for vault ${vaultId}`);
      }
      
      // Decode the mint data to get the supply
      const mintData = MintLayout.decode(Buffer.from(mintResponse.value.data[0], 'base64'));
      
      // Return raw data - formatting will be done in the high-level API
      return {
        raw: mintData.supply,
        formatted: mintData.supply.toString(), // Just return the raw string for now
        decimals: mintData.decimals
      };
      
    } catch (error) {
      console.error('Error fetching share mint supply:', error);
      throw new Error(`Failed to fetch share mint supply for vault ${vaultId}: ${error}`);
    }
  }

  /**
   * Get the total assets (TVL) of a vault in terms of the base asset
   * Calculated as: total share supply * exchange rate
   * @param vaultId - The vault ID
   * @returns BalanceInfo with the total assets value in terms of the base asset
   */
  async fetchTotalAssets(vaultId: number): Promise<BalanceInfo> {
    try {
      // Get both the share supply and share value
      const [shareSupply, shareValue] = await Promise.all([
        this.fetchShareMintSupply(vaultId),
        this.fetchShareValue(vaultId)
      ]);
      
      // Calculate total assets = total shares * share value
      // Both values are in their respective decimal formats, so we need to handle the math carefully
      // shareSupply.raw is in share token decimals
      // shareValue.raw is in base asset decimals (exchange rate)
      
      // The exchange rate represents how much base asset 1 share is worth
      // So: totalAssets = (shareSupply.raw * shareValue.raw) / (10^shareSupply.decimals)
      // This gives us the result in base asset decimals
      
      const totalAssetsRaw = (shareSupply.raw * shareValue.raw) / BigInt(Math.pow(10, shareSupply.decimals));
      
      // Return raw data - formatting will be done in the high-level API
      return {
        raw: totalAssetsRaw,
        formatted: totalAssetsRaw.toString(), // Just return the raw string for now
        decimals: shareValue.decimals // Use base asset decimals
      };
      
    } catch (error) {
      console.error('Error fetching total assets:', error);
      throw new Error(`Failed to fetch total assets for vault ${vaultId}: ${error}`);
    }
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
   * Generic serialization function for instruction arguments using BorshCoder
   */
  private serializeArgs<T>(typeName: string, args: T, idl: 'vault' | 'queue' = 'vault'): Buffer {
    const coder = idl === 'vault' ? this.vaultCoder : this.queueCoder;
    return coder.types.encode(typeName, args);
  }

  /**
   * Helper function to fetch common vault PDAs and state information
   */
  private async getCommonVaultInfo(vaultId: number): Promise<{
    vaultStatePDA: web3.PublicKey;
    vaultState: { depositSubAccount: number; withdrawSubAccount: number };
    vaultPDA: web3.PublicKey;
    shareMintPDA: web3.PublicKey;
    shareMintProgram: web3.PublicKey;
  }> {
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
    
    let shareMintProgram;
    
    if (shareMintResponse.value) {
      // Extract the owner (token program) from the account info
      shareMintProgram = new web3.PublicKey(shareMintResponse.value.owner);
      console.log(`DEBUG: Share Mint Program: ${shareMintProgram.toString()}`);
    } else {
      throw new Error(`Could not retrieve share mint info for ${shareMintPDA.toString()}`);
    }

    return {
      vaultStatePDA,
      vaultState,
      vaultPDA,
      shareMintPDA,
      shareMintProgram
    };
  }

  /**
   * Helper function to get user's share token account
   */
  private async getUserSharesAccount(
    payer: web3.PublicKey,
    shareMintPDA: web3.PublicKey,
    shareMintProgram: web3.PublicKey
  ): Promise<web3.PublicKey> {
    // Get the user's associated token account for the share token using the standard SPL token function
    const userSharesATA = await getAssociatedTokenAddress(
      shareMintPDA,    // mint
      payer,           // owner
      true,            // allowOwnerOffCurve
      shareMintProgram, // programId - use shareMintProgram
      ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId
    );
    console.log(`DEBUG: User's Share Token Account: ${userSharesATA.toString()}`);
    return userSharesATA;
  }

  /**
   * Helper function to fetch asset data and price feed information
   */
  private async getAssetDataInfo(
    vaultStatePDA: web3.PublicKey,
    assetMint: web3.PublicKey,
    assetType: string
  ): Promise<{
    assetDataPDA: web3.PublicKey;
    priceFeedAddress: web3.PublicKey;
  }> {
    // Get the asset data PDA
    const assetDataPDA = await this.getAssetDataPDA(vaultStatePDA, assetMint);
    console.log(`DEBUG: ${assetType} Asset Data PDA: ${assetDataPDA.toString()}`);
    
    // Fetch the asset data to get the price feed
    const assetDataAddress = assetDataPDA.toBase58() as Address;
    const assetDataResponse = await this.rpc.getAccountInfo(
      assetDataAddress,
      { encoding: 'base64' }
    ).send();
    
    if (!assetDataResponse.value || !assetDataResponse.value.data.length) {
      throw new Error(`Asset data not found for ${assetType} deposits`);
    }
    
    // Parse asset data using the parseAssetData function
    const assetDataBuffer = Buffer.from(assetDataResponse.value.data[0], 'base64');
    const parsedAssetData = parseAssetData(assetDataBuffer);

    // Get price feed address from the parsed asset data
    if (!parsedAssetData.priceFeed) {
      throw new Error(`Price feed not found in asset data for ${assetType} deposits`);
    }
    
    const priceFeedAddress = parsedAssetData.priceFeed;
    console.log(`DEBUG: Price Feed Address: ${priceFeedAddress.toString()}`);

    return {
      assetDataPDA,
      priceFeedAddress
    };
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
    // Validate input parameters
    if (depositAmount <= BigInt(0)) {
      throw new Error(`Invalid depositAmount: ${depositAmount.toString()}. Must be a positive non-zero value.`);
    }
    if (minMintAmount <= BigInt(0)) {
      throw new Error(`Invalid minMintAmount: ${minMintAmount.toString()}. Must be a positive non-zero value.`);
    }

    // Get common vault information
    const {
      vaultStatePDA,
      vaultPDA,
      shareMintPDA,
      shareMintProgram
    } = await this.getCommonVaultInfo(vaultId);
    
    // Get asset data and price feed information
    const { assetDataPDA, priceFeedAddress } = await this.getAssetDataInfo(
      vaultStatePDA,
      depositMint,
      depositMint.toString()
    );
    
    // Get the user's associated token account for the deposit mint
    const userATA = await this.getTokenAccount(payer, depositMint);
    console.log(`DEBUG: User's Token Account: ${userATA.toString()}`);
    
    // Get the vault's associated token account for the deposit mint
    const vaultATA = await this.getTokenAccount(vaultPDA, depositMint);
    console.log(`DEBUG: Vault's Token Account: ${vaultATA.toString()}`);
    
    // Get user's share token account
    const userSharesATA = await this.getUserSharesAccount(payer, shareMintPDA, shareMintProgram);
    
    // Determine token program for the deposit mint
    const mintAddress = depositMint.toBase58() as Address;
    const mintResponse = await this.rpc.getAccountInfo(
      mintAddress,
      { encoding: 'base64' }
    ).send();
    
    let tokenProgram = TOKEN_PROGRAM_ID;
    if (mintResponse.value) {
      tokenProgram = new web3.PublicKey(mintResponse.value.owner);
    }
    
    // Create a new transaction
    const transaction = new web3.Transaction();
    
    // Check if accounts exist and create them if needed
    const accountsToCheck = [
      { address: userATA, owner: payer, mint: depositMint, tokenProgram, description: "User's deposit token account" },
      { address: vaultATA, owner: vaultPDA, mint: depositMint, tokenProgram, description: "Vault's deposit token account" },
    ];
    
    for (const account of accountsToCheck) {
      const exists = await this.doesAccountExist(account.address);
      if (!exists) {
        console.log(`Creating ${account.description}: ${account.address.toString()}`);
        
        const createATAInstruction = createAssociatedTokenAccountIdempotentInstruction(
          payer,           // payer
          account.address, // associatedToken
          account.owner,   // owner
          account.mint,    // mint
          account.tokenProgram, // programId
          ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId
        );
        
        transaction.add(createATAInstruction);
      } else {
        console.log(`${account.description} already exists: ${account.address.toString()}`);
      }
    }
    
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
    
    // Add the deposit instruction to the transaction
    transaction.add(depositInstruction);
    
    return transaction;
  }

  /**
   * Serializes deposit arguments using BorshCoder
   */
  private serializeDepositArgs(vaultId: number, depositAmount: bigint, minMintAmount: bigint): Buffer {
    const depositArgs = {
      vault_id: new BN(vaultId),
      deposit_amount: new BN(depositAmount.toString()),
      min_mint_amount: new BN(minMintAmount.toString())
    };
    
    return this.serializeArgs('DepositArgs', depositArgs, 'vault');
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
   * Serializes request_withdraw arguments using BorshCoder
   */
  private serializeRequestWithdrawArgs(
    vaultId: number, 
    shareAmount: bigint, 
    discount: number,
    secondsToDeadline: number
  ): Buffer {
    const requestWithdrawArgs = {
      vault_id: new BN(vaultId),
      share_amount: new BN(shareAmount.toString()),
      discount: discount,
      seconds_to_deadline: secondsToDeadline
    };
    
    return this.serializeArgs('RequestWithdrawArgs', requestWithdrawArgs, 'queue');
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
   * @returns An unsigned transaction
   */
  async buildQueueWithdrawTransaction(
    ownerAddress: web3.PublicKey,
    vaultId: number,
    tokenOut: web3.PublicKey,
    shareAmount: bigint,
    discount: number = 0.01, // Default to 0 discount
    secondsToDeadline: number = 86400 * 7 // Default to 7 days
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
    
    // Create a new transaction
    const transaction = new web3.Transaction();
    
    // Check if user withdraw state exists, and create it if it doesn't
    const userWithdrawStateExists = await this.doesAccountExist(userWithdrawStatePDA);
    if (!userWithdrawStateExists) {
      console.log(`Creating user withdraw state for ${ownerAddress.toString()}`);
      
      // Create setup_user_withdraw_state instruction
      const setupUserWithdrawStateInstruction = new web3.TransactionInstruction({
        programId: new web3.PublicKey(BORING_QUEUE_PROGRAM_ID),
        keys: [
          { pubkey: ownerAddress, isSigner: true, isWritable: true },
          { pubkey: userWithdrawStatePDA, isSigner: false, isWritable: true },
          { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: this.getInstructionDiscriminator('setup_user_withdraw_state', queueIdl)
      });
      
      transaction.add(setupUserWithdrawStateInstruction);
    } else {
      console.log(`User withdraw state already exists for ${ownerAddress.toString()}`);
    }
    
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
    
    // Always derive the queue shares account automatically
    const queueSharesATA = await web3.PublicKey.findProgramAddress(
      [
        queuePDA.toBuffer(),
        new web3.PublicKey(TOKEN_2022_PROGRAM_ID).toBuffer(),
        shareMintPDA.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
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
    const parsedAssetData = parseAssetData(assetDataBuffer);
    const priceFeedAddress = parsedAssetData.priceFeed;
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
        { pubkey: queueSharesATA[0], isSigner: false, isWritable: true },
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
    
    // Add the request_withdraw instruction to the transaction
    transaction.add(requestWithdrawInstruction);
    return transaction;
  }

  /**
   * Builds a deposit transaction for native SOL
   */
  async buildDepositSolTransaction(
    payer: web3.PublicKey,
    vaultId: number,
    depositAmount: bigint,
    minMintAmount: bigint
  ): Promise<web3.Transaction> {
    // Validate input parameters
    if (depositAmount <= BigInt(0)) {
      throw new Error(`Invalid depositAmount: ${depositAmount.toString()}. Must be a positive non-zero value.`);
    }
    if (minMintAmount <= BigInt(0)) {
      throw new Error(`Invalid minMintAmount: ${minMintAmount.toString()}. Must be a positive non-zero value.`);
    }

    // Get common vault information
    const {
      vaultStatePDA,
      vaultPDA,
      shareMintPDA,
      shareMintProgram
    } = await this.getCommonVaultInfo(vaultId);
    
    // For SOL deposits, use the native SOL mint constant (zero address)
    // This matches the IDL constant value for native SOL
    const solAssetMint = new web3.PublicKey(NATIVE_SOL_MINT);
    
    // Get asset data and price feed information for SOL
    const { assetDataPDA, priceFeedAddress } = await this.getAssetDataInfo(
      vaultStatePDA,
      solAssetMint,
      'SOL'
    );
    
    // Get user's share token account
    const userSharesATA = await this.getUserSharesAccount(payer, shareMintPDA, shareMintProgram);
    
    // Create deposit_sol instruction
    const depositSolInstruction = new web3.TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: new web3.PublicKey(TOKEN_2022_PROGRAM_ID), isSigner: false, isWritable: false },
        { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: vaultStatePDA, isSigner: false, isWritable: false },
        { pubkey: vaultPDA, isSigner: false, isWritable: true },
        { pubkey: assetDataPDA, isSigner: false, isWritable: false },
        { pubkey: shareMintPDA, isSigner: false, isWritable: true },
        { pubkey: userSharesATA, isSigner: false, isWritable: true },
        { pubkey: priceFeedAddress, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        this.getInstructionDiscriminator('deposit_sol'),
        this.serializeDepositArgs(vaultId, depositAmount, minMintAmount)
      ])
    });
    
    console.log(`DEBUG: SOL Deposit Instruction accounts:`);
    depositSolInstruction.keys.forEach((key, index) => {
      console.log(`  [${index}] ${key.pubkey.toString()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
    });
    
    // Create a new transaction
    const transaction = new web3.Transaction();
    
    // Add the deposit_sol instruction to the transaction
    transaction.add(depositSolInstruction);
    
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