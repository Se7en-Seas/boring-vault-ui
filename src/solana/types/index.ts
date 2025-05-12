import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

export interface Wallet {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

export interface BalanceInfo {
  raw: BN;
  formatted: string;
  decimals: number;
}

export interface BoringVaultSolanaConfig {
  connection: Connection;
  programId: string;
}
