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

// Program ID
export const BORING_VAULT_PROGRAM_ID = '5ZRnXG4GsUMLaN7w2DtJV1cgLgcXHmuHCmJ2MxoorWCE'; 
export const BORING_QUEUE_PROGRAM_ID = '4yfE2VJQmxmcnUhrb8vdz7H8w313EZ3eJh5DbANBgtmd';
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'; 

export const KNOWN_MINTS: { [key: string]: string } = {
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn": "JITO SOL",
  // Add more known mints here if needed
}; 