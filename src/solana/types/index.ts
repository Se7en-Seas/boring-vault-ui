import { Connection } from '@solana/web3.js';

export interface BalanceInfo {
  raw: bigint;
  formatted: string;
  decimals: number;
}

export interface BoringVaultSolanaConfig {
  connection: Connection;
  programId: string;
}
