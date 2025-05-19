import { web3 } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { 
  createSolanaClient, 
  Address,
  createKeyPairSignerFromPrivateKeyBytes,
  type KeyPairSigner
} from 'gill';

// Import services from SDK location
import { VaultSDK } from '../sdk';

// Load environment variables
dotenv.config();

// Add token mint IDs
const TOKEN_MINTS = {
  JITO_SOL: new web3.PublicKey('J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn')
};

// Create readline interface for user interaction
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question for async/await
function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// Configuration
const MAINNET_CONFIG = {
  // Use Alchemy RPC endpoint from environment variable
  rpcUrl: process.env.ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com',
  // The vault you have admin access to
  vaultPubkey: new web3.PublicKey(process.env.VAULT_PUBKEY || ''),
  // Default token mint for operations (jitoSOL)
  tokenMint: TOKEN_MINTS.JITO_SOL,
};

// Create Solana client
const solanaClient = createSolanaClient({ 
  urlOrMoniker: MAINNET_CONFIG.rpcUrl 
});

/**
 * Load keypair from file using gill's keypair signer
 */
async function loadKeypair(keypairPath?: string): Promise<KeyPairSigner> {
  const path = keypairPath || process.env.KEYPAIR_PATH || '';
  
  if (!path) {
    throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
  }
  
  try {
    // Load key data using fs and create a keypair signer
    const keyData = JSON.parse(fs.readFileSync(path, 'utf-8'));
    const secretKey = new Uint8Array(keyData);
    
    // Solana keypair JSON has 64 bytes: first 32 are private key, last 32 are public key
    // Extract just the private key (first 32 bytes)
    const privateKeyBytes = secretKey.slice(0, 32);
    
    // Create keypair signer using just the private key bytes
    const keypairSigner = await createKeyPairSignerFromPrivateKeyBytes(privateKeyBytes);
    
    console.log(`Loaded keypair with address: ${keypairSigner.address}`);
    
    return keypairSigner;
  } catch (error) {
    console.error('Failed to load keypair:', error);
    throw new Error('Failed to load keypair from file');
  }
}

/**
 * Scan and analyze a Solana account to understand its structure
 */
async function analyzeVaultAccount(): Promise<void> {
  try {
    console.log('\n=== ANALYZING VAULT ACCOUNT ===');
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    console.log(`Fetching data for vault: ${vaultPubkey.toString()}`);
    
    // Try using the address directly without converting to string first
    // Also enable `encoding: 'base64'` to satisfy the error message
    const address = vaultPubkey.toBase58() as Address;
    const response = await solanaClient.rpc.getAccountInfo(
      address,
      { encoding: 'base64' }
    ).send();
    
    if (!response.value) {
      console.log('❌ Vault account not found');
      return;
    }
    
    console.log('✅ Vault account found');
    console.log(`Owner: ${response.value.owner}`);
    console.log(`Size: ${response.value.data[1]} bytes`);
    
    // Get the discriminator for verification
    const data = Buffer.from(response.value.data[0], 'base64');
    const discriminator = data.slice(0, 8);
    const discriminatorHex = Buffer.from(discriminator).toString('hex');
    console.log(`Discriminator: ${discriminatorHex}`);
    
    return;
  } catch (error) {
    console.error('Error analyzing vault account:', error);
  }
}

/**
 * Run read-only tests against the vault
 */
async function testReadOperations() {
  console.log('\n=== VAULT DATA DETAILS ===');
  
  try {
    // Create service instances - passing RPC URL directly
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    // Fetch vault data
    console.log(`Fetching data for vault: ${vaultPubkey.toString()}`);
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    
    // Display vault data in a clean format
    console.log('\n=== VAULT STATE ===');
    console.log(`Vault ID: ${vaultData.vaultState.vaultId.toString()}`);
    console.log(`Authority: ${vaultData.vaultState.authority.toString()}`);
    console.log(`Share Mint: ${vaultData.vaultState.shareMint.toString()}`);
    console.log(`Deposit Sub-Account: ${vaultData.vaultState.depositSubAccount}`);
    console.log(`Withdraw Sub-Account: ${vaultData.vaultState.withdrawSubAccount}`);
    console.log(`Paused: ${vaultData.vaultState.paused}`);
    
    // Display asset data if available
    if (vaultData.assetData) {
      console.log('\n=== ASSET DATA ===');
      console.log(`Base Asset: ${vaultData.assetData.baseAsset.toString()}`);
      console.log(`Platform Fee: ${vaultData.assetData.platformFeeBps / 100}%`);
      console.log(`Performance Fee: ${vaultData.assetData.performanceFeeBps / 100}%`);
    }
    
    // Fetch vault balance
    console.log('\n=== VAULT BALANCE ===');
    
    const balance = await vaultService.getVaultBalance(vaultPubkey);
    console.log(`Balance: ${balance} lamports`);
    
    return vaultData;
  } catch (error) {
    console.error('Read-only tests failed:', error);
    throw error;
  } finally {
    console.log('\nVault data analysis completed');
  }
}

/**
 * Test user balances in the vault
 */
async function testUserBalances(): Promise<any[] | undefined> {
  console.log('\n=== TESTING USER BALANCES ===');
  
  try {
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const signer = await loadKeypair();
    
    // Use signer.address instead of signer.publicKey.toString()
    console.log(`Checking balances for wallet: ${signer.address}`);
    
    // Get native SOL balance with base64 encoding
    const signerAddress = signer.address;
    const solBalanceResponse = await solanaClient.rpc.getBalance(signerAddress).send();
    const solBalance = Number(solBalanceResponse.value);
    console.log(`\nNative SOL Balance: ${solBalance / 1_000_000_000} SOL (${solBalance} lamports)`);
    
    // Use gill to get token accounts with base64 encoding
    const tokenAccountsResponse = await solanaClient.rpc.getTokenAccountsByOwner(
      signerAddress,
      { programId: TOKEN_PROGRAM_ID.toString() as Address },
      { encoding: 'base64' }
    ).send();
    
    const tokenAccounts = tokenAccountsResponse.value.map(item => {
      // Convert the account data Buffer to the format we need
      const data = Buffer.from(item.account.data[0], 'base64');
      const accountData = AccountLayout.decode(data);

      return {
        pubkey: item.pubkey,
        mint: new web3.PublicKey(accountData.mint),
        owner: new web3.PublicKey(accountData.owner),
        amount: accountData.amount.readBigUInt64LE(0).toString()
      };
    });
    
    console.log('Token accounts:');
    tokenAccounts.forEach((account, i) => {
      console.log(`[${i+1}] Mint: ${account.mint.toString()}`);
      console.log(`    Balance: ${account.amount}`);
    });
    
    return tokenAccounts;
  } catch (error) {
    console.error('Error testing user balances:', error);
    throw error;
  }
}

/**
 * Get user balance in the vault
 */
async function getBalance(): Promise<any> {
  console.log('\n=== CHECKING USER BALANCE IN VAULT ===');
  
  try {
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    const signer = await loadKeypair();
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    
    console.log(`Vault: ${vaultPubkey.toString()}`);
    console.log(`Share Token Mint: ${vaultData.vaultState.shareMint.toString()}`);
    
    // Use gill to get token accounts with base64 encoding
    const signerAddress = signer.address;
    const tokenAccountsResponse = await solanaClient.rpc.getTokenAccountsByOwner(
      signerAddress,
      { programId: TOKEN_PROGRAM_ID.toString() as Address },
      { encoding: 'base64' }
    ).send();
    
    // Convert shareMint to string for comparison
    const shareMintString = vaultData.vaultState.shareMint.toString();
    
    // Look for share token account
    const shareTokenAccount = tokenAccountsResponse.value.find(item => {
      const data = Buffer.from(item.account.data[0], 'base64');
      const accountData = AccountLayout.decode(data);
      const mintString = new web3.PublicKey(accountData.mint).toString();
      return mintString === shareMintString;
    });
    
    if (shareTokenAccount) {
      const data = Buffer.from(shareTokenAccount.account.data[0], 'base64');
      const accountData = AccountLayout.decode(data);
      const amount = accountData.amount.readBigUInt64LE(0).toString();
      
      console.log(`✅ User has ${amount} shares of this vault`);
      console.log(`Share token account: ${shareTokenAccount.pubkey}`);
      return amount;
    } else {
      console.log(`❌ User does not have share tokens for this vault`);
      return 0;
    }
  } catch (error) {
    console.error('Error checking user balance:', error);
    throw error;
  }
}

/**
 * Main function to run all tests sequentially
 */
async function main() {
  try {
    // Explain available commands
    console.log('\n=== BORING VAULT MAINNET TEST ===');
    console.log('Available commands:');
    console.log('  - analyze: Scan and analyze vault account');
    console.log('  - read: Show vault data details');
    console.log('  - balance: Check your balance in the vault');
    console.log('  - accounts: List all token accounts and balances');
    console.log('  - exit: Exit the program');
    
    const command = await question('\nEnter command (or "exit" to quit): ');
    
    switch (command.toLowerCase()) {
      case 'analyze':
        await analyzeVaultAccount();
        break;
      case 'read':
        await testReadOperations();
        break;
      case 'balance':
        await getBalance();
        break;
      case 'accounts':
      case 'tokens':
        await testUserBalances();
        break;
      case 'exit':
        console.log('Exiting...');
        break;
      default:
        console.log('Unknown command. Try again.');
    }
    
    rl.close();
    
  } catch (error) {
    console.error('\nTesting failed with error:', error);
    rl.close();
    process.exit(1);
  }
}

// Execute the appropriate function based on arguments if this file is run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'analyze') {
    analyzeVaultAccount().then(() => rl.close()).catch(error => {
      console.error(error);
      rl.close();
    });
  } else if (command === 'read') {
    testReadOperations().then(() => rl.close()).catch(error => {
      console.error(error);
      rl.close();
    });
  } else if (command === 'getbalance' || command === 'balance') {
    getBalance().then(() => rl.close()).catch(error => {
      console.error(error);
      rl.close();
    });
  } else if (command === 'accounts' || command === 'tokens' || command === 'list') {
    testUserBalances().then(() => rl.close()).catch(error => {
      console.error(error);
      rl.close();
    });
  } else {
    // Interactive mode
    main().catch(console.error);
  }
} else {
  // If this file is imported, export the test functions
  module.exports = {
    analyzeVaultAccount,
    testReadOperations,
    testUserBalances,
    getBalance,
    main
  };
}