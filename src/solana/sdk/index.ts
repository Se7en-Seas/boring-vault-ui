import { Connection, PublicKey } from '@solana/web3.js';
import { BoringVaultSolana } from './boring-vault-solana';
import { AccountLayout } from '../utils/spl-token-utils';
import { parseFullVaultData, FullVaultData } from './vault-state';
import * as boringVaultIdl from './boring-vault-svm-idl.json';

/**
 * Interface for token account data
 */
export interface TokenAccount {
  pubkey: PublicKey;
  mint: PublicKey;
  amount: string;
}

/**
 * Vault SDK adapter for mainnet testing
 * Wraps the existing BoringVaultSolana class
 */
export class VaultSDK {
  private connection: Connection;
  private boringVault: BoringVaultSolana;
  private programId: PublicKey;
  
  constructor(connection: Connection) {
    this.connection = connection;
    
    // Get program ID from env or IDL
    this.programId = new PublicKey(
      process.env.BORING_VAULT_PROGRAM_ID || 
      boringVaultIdl.address || 
      '5ZRnXG4GsUMLaN7w2DtJV1cgLgcXHmuHCmJ2MxoorWCE'
    );
    
    // Initialize the BoringVaultSolana with the connection
    this.boringVault = new BoringVaultSolana({
      connection,
      programId: this.programId.toString()
    });
  }

  /**
   * Get vault data for a given vault
   */
  async getVaultData(vaultPubkey: PublicKey): Promise<FullVaultData> {
    // Use vault ID from environment variable or default to 4
    const vaultId = process.env.VAULT_ID ? parseInt(process.env.VAULT_ID) : 4;
    
    // Get the account directly 
    const accountInfo = await this.connection.getAccountInfo(vaultPubkey);
    if (!accountInfo) {
      throw new Error(`Vault account not found: ${vaultPubkey.toString()}`);
    }
    
    // Parse the full vault data using our comprehensive parser
    const vaultData = parseFullVaultData(accountInfo.data);
    
    // For convenience, also return the token mint, which might be in the assetData
    let tokenMint = new PublicKey('So11111111111111111111111111111111111111112'); // Default to SOL
    if (vaultData.assetData?.baseAsset) {
      tokenMint = vaultData.assetData.baseAsset;
    }
    
    return {
      ...vaultData,
      tokenMint
    };
  }

  /**
   * Get the current balance of a vault
   */
  async getVaultBalance(vaultPubkey: PublicKey): Promise<string> {
    // Get vault data using the proper parser
    const vaultData = await this.getVaultData(vaultPubkey);
    const vaultId = vaultData.vaultState.vaultId.toNumber();
    
    // Use the depositSubAccount from the parsed data
    const depositSubAccount = vaultData.vaultState.depositSubAccount;
    
    // Check vault token account using the deposit sub-account value
    const depositPDA = await this.boringVault.getVaultPDA(vaultId, depositSubAccount);
    
    // Check if token account exists
    const depositInfo = await this.connection.getAccountInfo(depositPDA);
    if (depositInfo) {
      // Parse token account data
      const accountData = AccountLayout.decode(depositInfo.data);
      return accountData.amount.toString();
    }
    
    // If no token account exists, return 0
    return '0';
  }
}

/**
 * Token service for SPL token operations
 */
export class TokenService {
  private connection: Connection;
  
  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Get all token accounts owned by a wallet address
   */
  async getTokenAccountsByOwner(owner: PublicKey): Promise<TokenAccount[]> {
    try {
      const response = await this.connection.getTokenAccountsByOwner(
        owner,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );
      
      return response.value.map(account => {
        const accountData = AccountLayout.decode(account.account.data);
        
        return {
          pubkey: account.pubkey,
          mint: accountData.mint,
          amount: accountData.amount
        };
      });
    } catch (error) {
      console.error('Error fetching token accounts:', error);
      return [];
    }
  }
  
  /**
   * Find the associated token address for a given owner and mint
   */
  async findAssociatedTokenAddress(
    owner: PublicKey,
    mint: PublicKey
  ): Promise<PublicKey> {
    // Reuse the existing function from your spl-token-utils
    return await require('../utils/spl-token-utils').getAssociatedTokenAddress(
      mint,
      owner,
      false
    );
  }
} 