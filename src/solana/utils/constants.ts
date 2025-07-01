// Seeds from the smart contract
export const BASE_SEED_BORING_VAULT_STATE = 'boring-vault-state';
export const BASE_SEED_BORING_VAULT = 'boring-vault';
export const BASE_SEED_SHARE_TOKEN = 'share-token';
export const BASE_SEED_ASSET_DATA = 'asset-data';
export const CONFIG_SEED = 'config';

// User withdraw state seed for Boring Queue
export const BASE_SEED_USER_WITHDRAW_STATE = 'boring-queue-user-withdraw-state';

// Default values
export const DEFAULT_DECIMALS = 9; 

// Special addresses
export const NATIVE_SOL_MINT = new Uint8Array(32); // Zero address for native SOL

// Token addresses
export const JITO_SOL_MINT_ADDRESS = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';

// Switchboard Price Feed Address - JITOSOL/SOL
export const JITOSOL_SOL_SWITCHBOARD_FEED = '4Z1SLH9g4ikNBV8uP2ZctEouqjYmVqB2Tz5SZxKYBN7z';

// Pyth Price Feed ID (hex format) - JITOSOL/SOL
export const JITOSOL_SOL_PYTH_FEED = '0x01d577b07031e12635d2fb86af6ae938bdc2b6dba9602d8e8af34d44587566fc';

// Pyth Price Feed Account Address (computed from above ID)
export const JITOSOL_SOL_PYTH_ACCOUNT = 'CmGnCwUEYC7Kp9Sca4ULJRckSR8eJKLFTk1ed3wwGc78';

// Pyth Oracle Constants
export const PYTH_PROGRAM_ID = 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';
export const PYTH_HERMES_URL = 'https://hermes.pyth.network/';
export const PYTH_COMPUTE_UNIT_PRICE = 50000;
export const PYTH_SHARD_ID = 1; // Standard shard ID for price feeds
export const PYTH_MAX_RETRIES = 3;

// Network-specific compute unit prices (micro-lamports)
export const COMPUTE_UNIT_PRICES = {
  // Mainnet prices - higher due to congestion
  MAINNET_LOW: 10000,      // Low priority
  MAINNET_MEDIUM: 50000,   // Medium priority (current default)
  MAINNET_HIGH: 100000,    // High priority for urgent transactions
  MAINNET_CRITICAL: 200000, // Critical priority for time-sensitive operations
  
  // Devnet/Testnet prices - generally lower
  DEVNET_DEFAULT: 5000,
  TESTNET_DEFAULT: 5000,
  
  // Pyth-specific defaults
  PYTH_DEFAULT: 50000,
  PYTH_ORACLE_CRANK: 75000, // Slightly higher for oracle operations
} as const;

// Transaction polling constants
export const TX_POLL_MAX_ATTEMPTS = 30;
export const TX_POLL_INTERVAL_MS = 1000;
export const TX_POLL_ERROR_INTERVAL_MS = 2000;

// Solana system constants
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const DEFAULT_RPC_URL = 'https://api.mainnet-beta.solana.com';

// Oracle test constants
export const PRICE_UPDATE_MIN_SIZE = 100; // Minimum size for a valid price update
export const LARGE_TX_THRESHOLD = 50000; // Size threshold for requiring legacy transaction
export const INSTRUCTION_SIZE_THRESHOLD_KB = 1.2; // KB threshold for versioned transactions

// Program ID
export const BORING_VAULT_PROGRAM_ID = '5ZRnXG4GsUMLaN7w2DtJV1cgLgcXHmuHCmJ2MxoorWCE'; 
export const BORING_QUEUE_PROGRAM_ID = '4yfE2VJQmxmcnUhrb8vdz7H8w313EZ3eJh5DbANBgtmd';
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'; 

export const KNOWN_MINTS: { [key: string]: string } = {
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": "JITO SOL",
  // Add more known mints here if needed
}; 