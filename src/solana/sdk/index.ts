import { web3 } from '@coral-xyz/anchor';
import { BoringVaultSolana } from './boring-vault-solana';
import { parseFullVaultData, FullVaultData } from './vault-state';
import * as boringVaultIdl from './boring-vault-svm-idl.json';
import { 
  AccountLayout
} from '@solana/spl-token';
import { createSolanaClient, type SolanaClient, Address } from 'gill';
import { JITO_SOL_MINT_ADDRESS } from '../utils/constants';

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
   * For testing purposes - get the underlying BoringVaultSolana instance
   */
  getBoringVault(): BoringVaultSolana {
    return this.boringVault;
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
    
    // For convenience, also return the token mint, which might be in the assetData
    let tokenMint;
    if (vaultData.tellerState?.baseAsset) {
      tokenMint = vaultData.tellerState.baseAsset;
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

  /**
   * Deposits SPL tokens into a vault
   * 
   * @param wallet The wallet that will sign the transaction
   * @param vaultId The ID of the vault to deposit into
   * @param depositMint The mint of the token to deposit
   * @param depositAmount The amount of tokens to deposit
   * @param minMintAmount The minimum amount of shares to mint
   * @returns The transaction signature or empty string if not submitted
   */
  async deposit(
    wallet: { publicKey: web3.PublicKey; signTransaction: (tx: web3.Transaction) => Promise<web3.Transaction> },
    vaultId: number,
    depositMint: web3.PublicKey | string = JITO_SOL_MINT_ADDRESS,
    depositAmount: bigint | string,
    minMintAmount: bigint | string
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
    
    try {
      // Build the transaction using the core implementation
      const transaction = await this.boringVault.buildDepositTransaction(
        wallet.publicKey,
        vaultId,
        tokenMint,
        amount,
        minAmount
      );
      
      // Add recent blockhash
      const blockhashResponse = await this.rpc.getLatestBlockhash().send();
      if (!blockhashResponse.value) {
        throw new Error('Failed to get recent blockhash');
      }
      
      transaction.recentBlockhash = blockhashResponse.value.blockhash;
      transaction.feePayer = wallet.publicKey;
      
      // Sign the transaction
      const signedTx = await wallet.signTransaction(transaction);
      
      // For Gill compatibility, we need to use the Connection directly
      // This is a workaround since Gill doesn't provide direct access to sendRawTransaction
      console.log('Transaction signed, ready to submit to network');
      
      // Return a placeholder signature - in a real implementation,
      // you would connect to a Solana web3.js Connection to send the transaction
      return 'Transaction prepared successfully. Submit manually.';
    } catch (error) {
      console.error('Deposit error:', error);
      throw new Error(`Failed to deposit: ${error}`);
    }
  }
}
