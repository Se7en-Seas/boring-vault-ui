// src/types/index.ts
export interface Token {
  address: string;
  abi: any;
  decimals: number;
  image: string;
}

export interface ContractConfig {
  address: string;
  abi: any;
}

export interface DepositButtonProps {
  contractConfig: ContractConfig;
  tokenConfig: Token;
  onDeposit: (amount: string) => void;
  style?: React.CSSProperties;
}
