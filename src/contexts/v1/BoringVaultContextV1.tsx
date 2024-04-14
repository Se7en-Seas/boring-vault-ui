// BoringVaultContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { useAccount } from "wagmi";
import { ContractConfig, Token } from "../../types";
import BoringVaultABI from "../../abis/v1/BoringVaultABI";
import BoringTellerABI from "../../abis/v1/BoringTellerABI";
import BoringAccountantABI from "../../abis/v1/BoringAccountantABI";
import BoringLensABI from "../../abis/v1/BoringLensABI";
import { Provider, Contract, ethers } from "ethers";
import { base } from "viem/chains";

interface BoringVaultV1ContextProps {
  vaultEthersContract: Contract | null;
  tellerEthersContract: Contract | null;
  accountantEthersContract: Contract | null;
  lensEthersContract: Contract | null;
  depositTokens: Token[];
  isConnected: boolean;
  userAddress: string | null;
  // Any ethers provider
  ethersProvider: Provider; // Accept any Ethers provider
  baseToken: Token | null;
  vaultDecimals: number | null;
  // Add other states and functions that consumers can read and use
  // fetch Total Assets
  fetchTotalAssets: () => Promise<number>;
  isBoringV1ContextReady: boolean;
  children: ReactNode;
}

const BoringVaultV1Context = createContext<BoringVaultV1ContextProps | null>(
  null
);

export const BoringVaultV1Provider: React.FC<{
  vaultContract: string;
  tellerContract: string;
  accountantContract: string;
  lensContract: string;
  depositTokens: Token[];
  ethersProvider: Provider;
  baseAsset: Token;
  vaultDecimals: number;
  children: ReactNode;
}> = ({
  children,
  depositTokens,
  vaultContract,
  tellerContract,
  accountantContract,
  lensContract,
  ethersProvider,
  vaultDecimals,
  baseAsset,
}) => {
  const { address } = useAccount();
  const isConnected = !!address;

  const [vaultEthersContract, setVaultEthersContract] =
    useState<Contract | null>(null);
  const [tellerEthersContract, setTellerContractConfig] =
    useState<Contract | null>(null);
  const [accountantEthersContract, setAccountantEthersContract] =
    useState<Contract | null>(null);
  const [lensEthersContract, setLensEthersContract] = useState<Contract | null>(
    null
  );
  const [baseToken, setBaseToken] = useState<Token | null>(null);

  const [tokens, setTokens] = useState<Token[]>(depositTokens);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [isBoringV1ContextReady, setIsBoringV1ContextReady] =
    useState<boolean>(false);

  useEffect(() => {
    if (
      vaultContract &&
      tellerContract &&
      accountantContract &&
      lensContract &&
      ethersProvider &&
      baseAsset &&
      vaultDecimals &&
      depositTokens.length > 0
    ) {
      const vaultEthersContract = new Contract(
        vaultContract,
        BoringVaultABI,
        ethersProvider
      );
      const tellerEthersContract = new Contract(
        tellerContract,
        BoringTellerABI,
        ethersProvider
      );
      const accountantEthersContract = new Contract(
        accountantContract,
        BoringAccountantABI,
        ethersProvider
      );
      const lensEthersContract = new Contract(
        lensContract,
        BoringLensABI,
        ethersProvider
      );
      setVaultEthersContract(vaultEthersContract);
      setTellerContractConfig(tellerEthersContract);
      setAccountantEthersContract(accountantEthersContract);
      setLensEthersContract(lensEthersContract);
      setBaseToken(baseAsset);
      setDecimals(vaultDecimals);
      setIsBoringV1ContextReady(true);
      console.warn("Boring vault contracts initialized");
    } else {
      console.warn("Boring vault contracts not initialized");
      console.warn("Missing: ", {
        vaultContract,
        tellerContract,
        accountantContract,
        lensContract,
        ethersProvider,
        baseAsset,
        decimals,
        depositTokens,
      });
    }
  }, [
    vaultContract,
    tellerContract,
    accountantContract,
    lensContract,
    baseAsset,
    vaultDecimals,
    ethersProvider,
    depositTokens,
  ]);

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

  const [totalAssets, setTotalAssets] = useState<number>(0);

  const fetchTotalAssets = useCallback(async () => {
    if (
      !vaultEthersContract ||
      !lensEthersContract ||
      !accountantEthersContract ||
      !baseToken ||
      !isBoringV1ContextReady
    ) {
      console.error("Contracts not ready", {
        /* Dependencies here */
      });
      return Promise.reject("Contracts not ready");
    }
    console.log("Fetching total assets...")

    try {
      const assets = await lensEthersContract.totalAssets(
        vaultContract,
        accountantContract
      );
      console.log("Total assets from contract: ", assets);
      return Number(assets[1]) / Math.pow(10, baseToken.decimals);
    } catch (error) {
      console.error("Error fetching total assets", error);
      throw error;
    }
  }, [
    vaultEthersContract,
    lensEthersContract,
    accountantEthersContract,
    baseToken,
    isBoringV1ContextReady,
  ]);

  return (
    <BoringVaultV1Context.Provider
      value={{
        vaultEthersContract,
        tellerEthersContract,
        accountantEthersContract,
        lensEthersContract,
        depositTokens: tokens,
        isConnected,
        userAddress,
        ethersProvider: ethersProvider,
        baseToken,
        vaultDecimals,
        fetchTotalAssets,
        isBoringV1ContextReady,
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
