import { config } from "dotenv";
import path from "path";
import { readFileSync } from "fs";
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

const getEnvValue = (key: string): string => {
  try {
    const envContent = readFileSync(".env", "utf8");
    const lines = envContent.split("\n");
    const line = lines.find((line) => line.startsWith(`${key}=`));
    if (!line) throw new Error(`Environment variable ${key} not found`);
    return line.split("=")[1];
  } catch (error) {
    throw new Error(`Failed to read environment variable ${key}: ${error}`);
  }
};

export const PACKAGE_ID = process.env.PACKAGE_ID!;  
export const TEST_ASSET_TREASURY_CAP = process.env.TEST_ASSET_TREASURY_CAP!;

// Exported constants for mainnet test contract
export const VSUI_VAULT_ID = process.env.VSUI_VAULT_ID!;
export const REGISTRY_ID = process.env.REGISTRY_ID!;
export const SUILEND_PACKAGE__ID = process.env.SUILEND_PACKAGE_ID!;
export const LENDING_MARKET_ID = process.env.LENDING_MARKET_ID!;
export const USDC_INDEX = process.env.USDC_INDEX!;
export const SUI_INDEX = process.env.SUI_INDEX!;
export const OBLIGATION_ID = process.env.OBLIGATION_ID!;
export const SUI_PRICE_INFO_OBJECT = process.env.SUI_PRICE_INFO_OBJECT!;
export const USDC_PRICE_INFO_OBJECT = process.env.USDC_PRICE_INFO_OBJECT!;
export const MARKET_TYPE = "0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::suilend::MAIN_POOL"
export const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
export const SPRING_SUI_TYPE = "0x83556891f4a0f233ce7b05cfe7f957d4020492a34f5405b2cb9377d060bef4bf::spring_sui::SPRING_SUI"
