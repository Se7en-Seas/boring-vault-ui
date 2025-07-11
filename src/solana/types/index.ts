import { type SolanaClient } from 'gill';
import { web3 } from '@coral-xyz/anchor';

export interface BalanceInfo {
  raw: bigint;
  formatted: string;
  decimals: number;
}

export interface BoringVaultSolanaConfig {
  solanaClient: SolanaClient;
  programId: string;
}

// Vault state interfaces - cleaned up from vault-state.ts
export interface VaultState {
  vaultId: bigint;
  authority: web3.PublicKey;
  pendingAuthority: web3.PublicKey;
  paused: boolean;
  shareMint: web3.PublicKey;
  depositSubAccount: number;
  withdrawSubAccount: number;
}

export interface TellerState {
  baseAsset: web3.PublicKey;
  decimals: number;
  exchangeRateProvider: web3.PublicKey;
  exchangeRate: bigint;
  exchangeRateHighWaterMark: bigint;
  feesOwedInBaseAsset: bigint;
  totalSharesLastUpdate: bigint;
  lastUpdateTimestamp: bigint;
  payoutAddress: web3.PublicKey;
  allowedExchangeRateChangeUpperBound: number;
  allowedExchangeRateChangeLowerBound: number;
  minimumUpdateDelayInSeconds: number;
  platformFeeBps: number;
  performanceFeeBps: number;
  withdrawAuthority: web3.PublicKey;
}

export interface ManagerState {
  strategist: web3.PublicKey;
}

export interface AssetData {
  allowDeposits: boolean;
  allowWithdrawals: boolean;
  sharePremiumBps: number;
  isPeggedToBaseAsset: boolean;
  priceFeed: web3.PublicKey;
  inversePriceFeed: boolean;
  maxStaleness: bigint;
  minSamples: number;
  oracleSource: OracleSource;
  feedId?: number[];
}

export type OracleSource = 
  | { switchboardV2: {} }
  | { pyth: {} }
  | { pythV2: {} };

export interface FullVaultData {
  config: VaultState;
  teller: TellerState;
  manager: ManagerState;
}
