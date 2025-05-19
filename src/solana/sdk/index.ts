import { web3 } from '@coral-xyz/anchor';
import { BoringVaultSolana } from './boring-vault-solana';
import { parseFullVaultData, FullVaultData } from './vault-state';
import * as boringVaultIdl from './boring-vault-svm-idl.json';
import { 
  AccountLayout
} from '@solana/spl-token';
import { createSolanaClient, type SolanaClient, Address } from 'gill';

/**
 * Vault SDK adapter for mainnet testing
 * Wraps the existing BoringVaultSolana class
 */
export class VaultSDK {
  private rpc: SolanaClient['rpc'];
  private boringVault: BoringVaultSolana;
  private programId: web3.PublicKey;
  private solanaClient: SolanaClient;
  
  constructor(urlOrMoniker: string) {
    this.solanaClient = createSolanaClient({ urlOrMoniker });
    this.rpc = this.solanaClient.rpc;
    
    // Get program ID from env or IDL
    this.programId = new web3.PublicKey(
      process.env.BORING_VAULT_PROGRAM_ID || 
      boringVaultIdl.address 
    );
    
    // Initialize the BoringVaultSolana with the solanaClient
    this.boringVault = new BoringVaultSolana({
      solanaClient: this.solanaClient,
      programId: this.programId.toString()
    });
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
    if (!response.value) {
      throw new Error(`Vault account not found: ${vaultPubkey.toString()}`);
    }
    
    // Extract data from the gill response
    const data = Buffer.from(response.value.data[0], 'base64');
    
    // Parse the full vault data using our comprehensive parser
    const vaultData = parseFullVaultData(data);
    
    // For convenience, also return the token mint, which might be in the assetData
    let tokenMint;
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
}
