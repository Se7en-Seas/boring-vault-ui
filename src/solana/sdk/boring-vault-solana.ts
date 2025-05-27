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
  BASE_SEED_ASSET_DATA
} from '../utils/constants';
import { BalanceInfo, BoringVaultSolanaConfig } from '../types';
import { parseFullVaultData } from './vault-state';
import { type SolanaClient, Address, createSolanaClient } from 'gill';
import idl from './boring-vault-svm-idl.json';

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
    const [address] = await web3.PublicKey.findProgramAddress(
      [
        owner.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    return address;
  }

  /**
   * Extracts the instruction discriminator from the IDL for a given instruction name
   */
  private getInstructionDiscriminator(instructionName: string): Buffer {
    const instruction = (idl.instructions as any[]).find(
      (instr) => instr.name === instructionName
    );
    
    if (!instruction || !instruction.discriminator) {
      throw new Error(`Instruction '${instructionName}' or its discriminator not found in IDL`);
    }
    
    return Buffer.from(instruction.discriminator);
  }

  /**
   * Extracts the deposit instruction discriminator from the IDL
   */
  private getDepositInstructionDiscriminator(): Buffer {
    return this.getInstructionDiscriminator('deposit');
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
        this.getDepositInstructionDiscriminator(),
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
   * Helper to write a uint64 to a buffer in little-endian format
   */
  private writeUint64LE(buffer: Buffer, value: bigint, offset: number): void {
    const low = Number(value & BigInt(0xffffffff));
    const high = Number(value >> BigInt(32) & BigInt(0xffffffff));
    
    buffer.writeUint32LE(low, offset);
    buffer.writeUint32LE(high, offset + 4);
  }

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