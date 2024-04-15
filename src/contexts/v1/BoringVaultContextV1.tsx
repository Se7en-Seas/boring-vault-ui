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
import { DepositStatus, Token } from "../../types";
import BoringVaultABI from "../../abis/v1/BoringVaultABI";
import BoringTellerABI from "../../abis/v1/BoringTellerABI";
import BoringAccountantABI from "../../abis/v1/BoringAccountantABI";
import BoringLensABI from "../../abis/v1/BoringLensABI";
import {
  Provider,
  Contract,
  JsonRpcSigner,
  ContractTransactionReceipt,
} from "ethers";
import { erc20Abi } from "viem";
import BigNumber from "bignumber.js";

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
  fetchUserShares: () => Promise<number>;
  fetchShareValue: () => Promise<number>;
  fetchUserUnlockTime: () => Promise<number>;
  deposit: (
    signer: JsonRpcSigner,
    amount: string,
    token: Token
  ) => Promise<DepositStatus>;
  depositStatus: DepositStatus;
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
  const [tellerEthersContract, setTellerContract] = useState<Contract | null>(
    null
  );
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
  const [depositStatus, setDepositStatus] = useState<DepositStatus>({
    initiated: false,
    loading: false,
  });

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
      setTellerContract(tellerEthersContract);
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
    console.log("Fetching total assets...");

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

  const fetchUserShares = useCallback(async () => {
    if (
      !vaultEthersContract ||
      !lensEthersContract ||
      !baseToken ||
      !isBoringV1ContextReady ||
      !userAddress
    ) {
      console.error("Contracts or user not ready", {
        /* Dependencies here */
      });
      return Promise.reject("Contracts or user not ready");
    }
    console.log("Fetching user balance ...");

    try {
      const balance = await lensEthersContract.balanceOf(
        userAddress,
        vaultContract
      );
      console.log("User balance from contract: ", balance);
      return Number(balance) / Math.pow(10, decimals!);
    } catch (error) {
      console.error("Error fetching user balance", error);
      throw error;
    }
  }, [
    vaultEthersContract,
    lensEthersContract,
    baseToken,
    isBoringV1ContextReady,
    userAddress,
  ]);

  const fetchShareValue = useCallback(async () => {
    if (
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
    console.log("Fetching share value ...");

    try {
      const shareValue = await lensEthersContract.exchangeRate(
        accountantContract
      );
      console.log("Share value from contract: ", shareValue);
      return Number(shareValue) / Math.pow(10, baseToken.decimals);
    } catch (error) {
      console.error("Error fetching share value from contract", error);
      throw error;
    }
  }, [
    lensEthersContract,
    accountantEthersContract,
    baseToken,
    isBoringV1ContextReady,
  ]);

  const fetchUserUnlockTime = useCallback(async () => {
    if (
      !lensEthersContract ||
      !tellerEthersContract ||
      !isBoringV1ContextReady ||
      !userAddress
    ) {
      console.error("Contracts or user not ready", {
        /* Dependencies here */
      });
      return Promise.reject("Contracts or user not ready");
    }
    console.log("Fetching user unlock time...");

    try {
      const userUnlockTime = await lensEthersContract.userUnlockTime(
        userAddress,
        tellerContract
      );
      console.log("User unlock time from contract: ", userUnlockTime);
      return Number(userUnlockTime);
    } catch (error) {
      console.error("Error fetching user unlock time from contract", error);
      throw error;
    }
  }, [
    lensEthersContract,
    accountantEthersContract,
    userAddress,
    isBoringV1ContextReady,
  ]);

  const deposit = useCallback(
    async (
      signer: JsonRpcSigner,
      amountHumanReadable: string,
      token: Token
    ) => {
      if (
        !vaultEthersContract ||
        !isBoringV1ContextReady ||
        !userAddress ||
        !decimals ||
        !signer
      ) {
        console.error("Contracts or user not ready", {
          /* Dependencies here */
        });

        setDepositStatus({
          initiated: false,
          loading: false,
          success: false,
          error: "Contracts or user not ready",
        });

        return depositStatus;
      }
      console.log("Depositing ...");

      setDepositStatus({
        initiated: true,
        loading: true,
      });

      try {
        // First check if the token is approved for at least the amount
        const erc20Contract = new Contract(token.address, erc20Abi, signer);
        const allowance = Number(
          await erc20Contract.allowance(userAddress, vaultContract)
        );
        const bigNumAmt = new BigNumber(amountHumanReadable);
        console.warn(amountHumanReadable);
        console.warn("Amount to deposit: ", bigNumAmt.toNumber());
        const amountDepositBaseDenom = bigNumAmt.multipliedBy(
          new BigNumber(10).pow(token.decimals)
        );
        console.warn("Amount to deposit: ", amountDepositBaseDenom.toNumber());

        if (allowance < amountDepositBaseDenom.toNumber()) {
          console.log("Approving token ...");
          const approveTx = await erc20Contract.approve(
            vaultContract,
            amountDepositBaseDenom.toNumber()
          );

          // Wait for confirmation
          const approvedReceipt: ContractTransactionReceipt =
            await approveTx.wait();
          console.log("Token approved in tx: ", approvedReceipt);

          if (!approvedReceipt) {
            console.error("Token approval not seen on chain, retry later");
            setDepositStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Token approval not seen on chain, retry later",
            });
            return depositStatus;
          } else if (!approvedReceipt.hash) {
            console.error("Token approval failed");
            setDepositStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Token approval reverted",
            });
            return depositStatus;
          }
          console.log("Approved hash: ", approvedReceipt.hash);
        }

        console.log("Depositing token ...");
















        
      } catch (error: any) {
        console.error("Error depositing", error);
        setDepositStatus({
          initiated: false,
          loading: false,
          success: false,
          error: (error as Error).message,
        });
        return depositStatus;
      }

      return depositStatus;
    },
    [
      vaultEthersContract,
      userAddress,
      decimals,
      ethersProvider,
      isBoringV1ContextReady,
    ]
  );

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
        fetchUserShares,
        fetchShareValue,
        fetchUserUnlockTime,
        deposit,
        depositStatus,
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
