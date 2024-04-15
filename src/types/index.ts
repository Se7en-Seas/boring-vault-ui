// src/types/index.ts
export interface Token {
  address: string;
  decimals: number;
  abi?: any;
  image?: string;
  displayName?: string;
}

export interface VaultState {
  vaultAddress: string;
  accountantAddress: string;
  tellerAddress: string;
  lensAddress: string;
}

export interface DepositStatus {
  initiated: boolean;
  loading: boolean
  success?: boolean;
  error?: string;
  tx_hash?: string;
}