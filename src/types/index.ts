import { off } from "process";

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

export interface WithdrawQueueStatus {
  sharesWithdrawing: number;
  blockNumberOpened: number;
  deadlineUnixSeconds: number;
  errorCode: number;
  minSharePrice: number;
  timestampOpenedUnixSeconds: number;
  transactionHashOpened: string;
  tokenOut: Token;
}

export interface BoringQueueStatus {
  nonce: number;
  user: string;
  tokenOut: Token;
  sharesWithdrawing: number;
  assetsWithdrawing: number;
  creationTime: number;
  secondsToMaturity: number;
  secondsToDeadline: number;
  errorCode: number;
  transactionHashOpened: string;
}

export interface MerkleClaimStatus {
  initiated: boolean;
  loading: boolean;
  success?: boolean;
  error?: string;
  tx_hash?: string;
};

export interface BoringQueueAssetParams {
  allowWithdraws: boolean,
  secondsToMaturity: number,
  minimumSecondsToDeadline: number,
  minDiscount: number,
  maxDiscount: number,
  minimumShares: number
}
