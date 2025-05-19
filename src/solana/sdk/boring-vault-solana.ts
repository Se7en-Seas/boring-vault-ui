import { web3 } from '@coral-xyz/anchor';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  MintLayout
} from '@solana/spl-token';
import { 
  BASE_SEED_BORING_VAULT_STATE, 
  BASE_SEED_BORING_VAULT,
  BASE_SEED_SHARE_TOKEN 
} from '../utils/constants';
import { BalanceInfo, BoringVaultSolanaConfig } from '../types';
import { parseFullVaultData } from './vault-state';
import { type SolanaClient, Address, createSolanaClient } from 'gill';

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
  async getBalance(
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
        rawBalance = BigInt(accountData.amount.readBigUInt64LE(0));
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