import { type SolanaClient } from 'gill';

export interface BalanceInfo {
  raw: bigint;
  formatted: string;
  decimals: number;
}

export interface BoringVaultSolanaConfig {
  solanaClient: SolanaClient;
  programId: string;
}
