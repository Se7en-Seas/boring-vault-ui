import { web3 } from '@coral-xyz/anchor';
import * as dotenv from 'dotenv';
import { solanaClient } from './mainnet-test-utils';
import { fetchUserShares } from './mainnet-test-read';

// Load environment variables
dotenv.config();

// Override the vault pubkey in the mainnet config
// Use your actual vault pubkey here
const VAULT_PUBKEY = new web3.PublicKey('BoRiNgQJqLMmZ3wBshCXS6jpqfKwCiRGwKkuJUqgpeZ5');

// Override the config for testing
import { MAINNET_CONFIG } from './mainnet-test-utils';
MAINNET_CONFIG.vaultPubkey = VAULT_PUBKEY;

async function main() {
  try {
    console.log(`Using Vault: ${VAULT_PUBKEY.toString()}`);
    await fetchUserShares();
  } catch (error) {
    console.error('Error running test:', error);
  }
}

main().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 