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
  loading: boolean;
  success?: boolean;
  error?: string;
  tx_hash?: string;
}

export interface WithdrawStatus {
  initiated: boolean;
  loading: boolean;
  success?: boolean;
  error?: string;
  tx_hash?: string;
}

export interface DelayWithdrawStatus {
  allowThirdPartyToComplete: boolean;
  maxLoss: number;
  maturity: number;
  shares: number;
  exchangeRateAtTimeOfRequest: number;
  token: Token;
}
