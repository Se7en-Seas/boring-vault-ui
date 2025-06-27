import { config } from "dotenv";
import path from "path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

config({ path: path.resolve(process.cwd(), ".env") });

// Get project root (two levels up from this config file)
export const PROJECT_ROOT = path.join(__dirname, "..", "..");

export const DIR = process.cwd();
export const FULLNODE_URL = process.env.FULLNODE_URL!;
export const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY!;
export const VLBTC_VAULT_ID = process.env.VLBTC_VAULT_ID!;
export const DENY_LIST_ID = process.env.DENY_LIST_ID!;
export const ACCOUNTANT_ID = process.env.ACCOUNTANT_ID!;
export const AUTH_ID = process.env.AUTH_ID!;
export const GUARD_MANAGER_ID = process.env.GUARD_MANAGER_ID!;
export const ACTIVE_NETWORK = (process.env.NETWORK || "localnet") as
  | "mainnet"
  | "testnet"
  | "devnet"
  | "localnet";

// Create admin keypair and get address
const adminKeypair = Ed25519Keypair.fromSecretKey(ADMIN_PRIVATE_KEY);
export const ADMIN_ADDRESS = adminKeypair.getPublicKey().toSuiAddress();

export const TEST_ASSET_TREASURY_CAP = process.env.TEST_ASSET_TREASURY_CAP!;
