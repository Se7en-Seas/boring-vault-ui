import { 
  Connection, 
  PublicKey,
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
// Import our custom implementations
import { getAssociatedTokenAddress, AccountLayout } from '../utils/spl-token-utils';
import BN from 'bn.js';
import { 
  BASE_SEED_BORING_VAULT_STATE, 
  BASE_SEED_BORING_VAULT, 
  BASE_SEED_SHARE_TOKEN 
} from '../utils/constants';
import { BalanceInfo, BoringVaultSolanaConfig } from '../types';
import { parseFullVaultData } from './vault-state';

/**
 * Service for interacting with the BoringVault Solana smart contract
 */
export class BoringVaultSolana {
  private connection: Connection;
  private programId: PublicKey;
  
  constructor({ connection, programId }: BoringVaultSolanaConfig) {
    this.connection = connection;
    this.programId = new PublicKey(programId);
  }

  /**
   * Find program address for the given seeds
   */
  private async findProgramAddress(seeds: Buffer[]): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(seeds, this.programId);
  }

  /**
   * Get the PDA for the vault state account
   */
  async getVaultStatePDA(vaultId: number): Promise<PublicKey> {
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
  async getVaultPDA(vaultId: number, subAccount: number): Promise<PublicKey> {
    const vaultIdBuffer = Buffer.alloc(8);
    vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
    
    // Use "vault-" prefix as the base seed
    const [pda] = await PublicKey.findProgramAddress(
      [
        Buffer.from(BASE_SEED_BORING_VAULT),
        vaultIdBuffer,
        Buffer.from([subAccount])
      ],
      new PublicKey(this.programId)
    );
    
    return pda;
  }

  /**
   * Get the PDA for the share token mint
   */
  async getShareTokenPDA(vaultStatePDA: PublicKey): Promise<PublicKey> {
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
    const accountInfo = await this.connection.getAccountInfo(vaultStatePDA);
    
    if (!accountInfo) {
      throw new Error(`Vault state not found for vault ID ${vaultId}`);
    }
    
    // Only use the proper parser based on IDL structure
    const fullVaultData = parseFullVaultData(accountInfo.data);
    return { 
      depositSubAccount: fullVaultData.vaultState.depositSubAccount,
      withdrawSubAccount: fullVaultData.vaultState.withdrawSubAccount
    };
  }

  /**
   * Get user's balance of vault shares
   */
  async getBalance(
    walletAddress: string | PublicKey,
    vaultId: number
  ): Promise<BalanceInfo> {
    const walletPubkey = typeof walletAddress === 'string'
      ? new PublicKey(walletAddress)
      : walletAddress;
    
    // Get necessary PDAs
    const vaultStatePDA = await this.getVaultStatePDA(vaultId);
    const shareMintPDA = await this.getShareTokenPDA(vaultStatePDA);
    
    // Get user's share token account
    const userShareATA = await getTokenAccount(
      walletPubkey,
      shareMintPDA
    );
    
    // Get share token decimals
    let decimals = 9; // Default to 9 decimals
    try {
      const mintInfo = await this.connection.getAccountInfo(shareMintPDA);
      if (mintInfo) {
        // Mint data layout has decimals at position 44
        decimals = mintInfo.data[44];
      }
    } catch (error) {
      console.error('Error fetching share token mint info:', error);
    }
    
    // Get user's balance
    let rawBalance = new BN(0);
    try {
      const tokenAccount = await this.connection.getAccountInfo(userShareATA);
      if (tokenAccount) {
        // In v0.1.8, the decode method returns a slightly different structure
        const accountData = AccountLayout.decode(tokenAccount.data);
        // Make sure to handle any differences in the returned object structure
        rawBalance = new BN(accountData.amount.toString());
      }
    } catch (error) {
      // Account may not exist if user has no balance
      console.error('Error fetching token account:', error);
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
  private formatBalance(amount: BN, decimals: number): string {
    const amountStr = amount.toString().padStart(decimals + 1, '0');
    const integerPart = amountStr.slice(0, -decimals) || '0';
    const decimalPart = amountStr.slice(-decimals);
    return `${integerPart}.${decimalPart}`;
  }
}

// Export a function to create a BoringVaultSolana instance
export const createBoringVaultSolana = (config: BoringVaultSolanaConfig): BoringVaultSolana => {
  return new BoringVaultSolana(config);
};

async function getTokenAccount(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
  // Use our custom utility instead of reimplementing the logic
  return await getAssociatedTokenAddress(
    mint,
    owner,
    false, // allowOwnerOffCurve
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
} 