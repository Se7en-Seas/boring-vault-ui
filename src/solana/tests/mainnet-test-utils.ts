import { web3 } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { 
  createSolanaClient, 
  Address,
  createKeyPairSignerFromPrivateKeyBytes,
  type KeyPairSigner
} from 'gill';

import { 
  JITO_SOL_MINT_ADDRESS
} from '../utils/constants';

// Load environment variables
dotenv.config();

// Add token mint IDs
export const TOKEN_MINTS = {
  JITO_SOL: new web3.PublicKey(JITO_SOL_MINT_ADDRESS)
};

// Create readline interface for user interaction
export const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question for async/await
export function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// Configuration
export const MAINNET_CONFIG = {
  // Use Alchemy RPC endpoint from environment variable
  rpcUrl: process.env.ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com',
  // The vault you have admin access to
  vaultPubkey: new web3.PublicKey(process.env.VAULT_PUBKEY || ''),
  // Default token mint for operations (jitoSOL)
  tokenMint: new web3.PublicKey(JITO_SOL_MINT_ADDRESS),
};

// Create Solana client
export const solanaClient = createSolanaClient({ 
  urlOrMoniker: MAINNET_CONFIG.rpcUrl 
});

/**
 * Load keypair from file using gill's keypair signer
 */
export async function loadKeypair(keypairPath?: string): Promise<KeyPairSigner> {
  const path = keypairPath || process.env.KEYPAIR_PATH || '';
  
  if (!path) {
    throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
  }
  
  try {
    // Load key data using fs and create a keypair signer
    const keyData = JSON.parse(fs.readFileSync(path, 'utf-8'));
    const secretKey = new Uint8Array(keyData);
    
    // Validate that the secret key is the correct size (64 bytes for Solana keypairs)
    if (secretKey.length !== 64) {
      throw new Error(`Invalid keypair format: Expected 64 bytes but got ${secretKey.length} bytes`);
    }
    
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
 * Helper function to check if an account exists on chain
 */
export async function getAccountExistenceStatus(pubkey: web3.PublicKey): Promise<string> {
  const address = pubkey.toBase58() as Address;
  try {
    const response = await solanaClient.rpc.getAccountInfo(
      address,
      { encoding: 'base64' }
    ).send();
    
    if (!response.value) {
      return '❌ ACCOUNT DOES NOT EXIST';
    }
    
    return `✅ ACCOUNT EXISTS (Owner: ${response.value.owner}, Size: ${
      response.value.data[0] ? Buffer.from(response.value.data[0], 'base64').length : 0
    } bytes)`;
  } catch (error) {
    return `❌ ERROR CHECKING ACCOUNT: ${error}`;
  }
}

/**
 * Creates a web3.js connection with appropriate configuration
 * Avoids websocket connections for better reliability
 */
export function createConnection(): web3.Connection {
  return new web3.Connection(
    process.env.ALCHEMY_RPC_URL || MAINNET_CONFIG.rpcUrl,
    {
      commitment: 'confirmed',
      wsEndpoint: undefined // Avoid websocket connections
    }
  );
} 