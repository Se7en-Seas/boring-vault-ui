import { Connection, PublicKey } from '@solana/web3.js';
import { BoringVaultSolana } from './boring-vault-solana';
import { parseFullVaultData, FullVaultData } from './vault-state';
import * as boringVaultIdl from './boring-vault-svm-idl.json';
import { 
  AccountLayout
} from '@solana/spl-token';

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
      boringVaultIdl.address 
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
    // Get the account directly for the vaultPubkey parameter 
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
    const vaultId = Number(vaultData.vaultState.vaultId);
    
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
