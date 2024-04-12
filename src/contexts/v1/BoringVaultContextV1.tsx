// BoringVaultContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWalletClient,
  WagmiProvider,
  useSendTransaction,
} from "wagmi";
import { ContractConfig, Token } from "../../types";
import BoringVaultABI from "../../abis/v1/BoringVaultABI";
import BoringTellerABI from "../../abis/v1/BoringTellerABI";
import BoringAccountantABI from "../../abis/v1/BoringAccountantABI";
import { Provider } from 'ethers'; 

interface BoringVaultV1ContextProps {
  vaultContractConfig: ContractConfig | null;
  tellerContractConfig: ContractConfig | null;
  accountantContractConfig: ContractConfig | null;
  depositTokens: Token[];
  isConnected: boolean;
  userAddress: string | null;
  // Any ethers provider
  ethersProvider: Provider; // Accept any Ethers provider
  // Add other states and functions that consumers can read and use
  children: ReactNode;
}

const BoringVaultV1Context = createContext<BoringVaultV1ContextProps | null>(
  null
);

export const BoringVaultV1Provider: React.FC<{
  vaultContract: string;
  tellerContract: string;
  accountantContract: string;
  depositTokens: Token[];
  ethersProvider: Provider;
  children: ReactNode;
}> = ({
  children,
  depositTokens,
  vaultContract,
  tellerContract,
  ethersProvider,
  accountantContract,
}) => {
  const { address } = useAccount();
  const isConnected = !!address;

  const [vaultContractConfig, setVaultContractConfig] =
    useState<ContractConfig | null>(null);
  const [tellerContractConfig, setTellerContractConfig] =
    useState<ContractConfig | null>(null);
  const [accountantContractConfig, setAccountantContractConfig] =
    useState<ContractConfig | null>(null);

  const [tokens, setTokens] = useState<Token[]>(depositTokens);
  const [userAddress, setUserAddress] = useState<string | null>(null);

  useEffect(() => {
    if (
      vaultContract &&
      tellerContract &&
      accountantContract &&
      depositTokens.length > 0
    ) {
      setVaultContractConfig({
        address: vaultContract,
        abi: BoringVaultABI,
      });
      setTellerContractConfig({
        address: tellerContract,
        abi: BoringTellerABI,
      });
      setAccountantContractConfig({
        address: accountantContract,
        abi: BoringAccountantABI,
      });
    } else {
      console.warn("Boring vault contracts not initialized");
    }
  }, [vaultContract, tellerContract, accountantContract, depositTokens]);

  // Effect to handle updates on user address if needed
  useEffect(() => {
    if (isConnected) {
      console.log("Connected to wallet: ", address);
      setUserAddress(address);
    } else {
      console.warn("Not connected to a wallet");
    }
  }, [isConnected, address]);

  // Effect to handle updates on acceptedTokens if needed
  useEffect(() => {
    setTokens(depositTokens);
  }, [depositTokens]);

  return (
    <BoringVaultV1Context.Provider
      value={{
        vaultContractConfig,
        tellerContractConfig,
        accountantContractConfig,
        depositTokens: tokens,
        isConnected,
        userAddress,
        ethersProvider: ethersProvider,
        children,
      }}
    >
      {children}
    </BoringVaultV1Context.Provider>
  );
};

export const useBoringVaultV1 = () => {
  const context = useContext(BoringVaultV1Context);
  if (context === null) {
    throw new Error("useBoringVault must be used within a BoringVaultProvider");
  }
  return context;
};
