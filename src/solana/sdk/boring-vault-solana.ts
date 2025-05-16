import { 
  Connection, 
  PublicKey,
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  getAssociatedTokenAddress
} from '@solana/spl-token';
import BN from 'bn.js';
import { 
  BASE_SEED_BORING_VAULT_STATE, 
  BASE_SEED_BORING_VAULT, 
  BASE_SEED_SHARE_TOKEN 
} from '../utils/constants';
import { BalanceInfo, BoringVaultSolanaConfig } from '../types';
import { parseFullVaultData } from './vault-state';
import { BorshCoder } from '@coral-xyz/anchor';
import idl from './boring-vault-svm-idl.json';

/**
 * Service for interacting with the BoringVault Solana smart contract
 */
export class BoringVaultSolana {
  private connection: Connection;
  private programId: PublicKey;
  private coder: BorshCoder;
  
  constructor({ connection, programId }: BoringVaultSolanaConfig) {
    this.connection = connection;
    this.programId = new PublicKey(programId);
    this.coder = new BorshCoder(idl as any);
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
    
    // Use parseFullVaultData from vault-state.ts, which already uses the Anchor coder
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
    
    // Get share token decimals - throw error if we can't get this critical information
    let decimals: number;
    const mintInfo = await this.connection.getAccountInfo(shareMintPDA);
    if (!mintInfo) {
      throw new Error(`Share token mint account not found at ${shareMintPDA.toString()}`);
    }
    
    // Mint data layout has decimals at position 44
    decimals = mintInfo.data[44];
    
    // Get user's balance - throw error if we can't get token account info
    let rawBalance = new BN(0);
    try {
      const tokenAccount = await this.connection.getAccountInfo(userShareATA);
      if (tokenAccount) {
        // This is correct for token accounts owned by SPL Token Program
        const accountData = AccountLayout.decode(tokenAccount.data);
        rawBalance = new BN(accountData.amount.toString());
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