// src/types/index.ts
export interface Token {
  address: string;
  abi: any;
  decimals: number;
  image: string;
  displayName: string;
}

export interface DepositButtonProps {
  acceptedDepositTokens: Token[];
  onDeposit: (amount: string) => void;
  style?: React.CSSProperties;
}

// types.ts
export interface UserState {
  account: string | null;
  loading: boolean;
}

export interface ContractConfig {
  address: string;
  abi: any;
}
export interface VaultState {
  vaultAddress: string;
  accountantAddress: string;
  tellerAddress: string;
  loading: boolean;
}

export interface BoringVaultContextProps {
  userState: UserState;
  vaultState: VaultState;
  connectWallet: () => void; // Function to connect the user's wallet
  // Add more functions as needed to interact with the vault
}
