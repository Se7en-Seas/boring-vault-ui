import { config } from "dotenv";
import path from "path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

config({ path: path.resolve(process.cwd(), ".env") });

// Get project root (two levels up from this config file)
export const PROJECT_ROOT = path.join(__dirname, "..", "..");

export const DIR = process.cwd();
export const FULLNODE_URL = process.env.FULLNODE_URL as string;
if (!FULLNODE_URL) {
  throw new Error("FULLNODE_URL is not set");
}
export const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY as string;
if (!ADMIN_PRIVATE_KEY) {
  throw new Error("ADMIN_PRIVATE_KEY is not set");
}
export const DENY_LIST_ID = "0x403";
export const ACTIVE_NETWORK = (process.env.NETWORK || "localnet") as
  | "mainnet"
  | "testnet"
  | "devnet"
  | "localnet";

// Create admin keypair and get address
const adminKeypair = Ed25519Keypair.fromSecretKey(ADMIN_PRIVATE_KEY);
export const ADMIN_ADDRESS = adminKeypair.getPublicKey().toSuiAddress();
