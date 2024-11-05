// BoringVaultContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import {
  DepositStatus,
  WithdrawStatus,
  DelayWithdrawStatus,
  WithdrawQueueStatus,
  Token,
  BoringQueueStatus
} from "../../types";
import BoringVaultABI from "../../abis/v1/BoringVaultABI";
import BoringTellerABI from "../../abis/v1/BoringTellerABI";
import BoringAccountantABI from "../../abis/v1/BoringAccountantABI";
import BoringLensABI from "../../abis/v1/BoringLensABI";
import BoringWithdrawQueueContractABI from "../../abis/v1/BoringWithdrawQueueContractABI";
import BoringQueueABI from "../../abis/v1/BoringQueueABI";
import {
  Provider,
  Contract,
  JsonRpcSigner,
  ContractTransactionReceipt,
  Signature,
} from "ethers";
import { erc20Abi } from "viem";
import BigNumber from "bignumber.js";
import BoringDelayWithdrawContractABI from "../../abis/v1/BoringDelayWithdrawContractABI";
import { ethers } from 'ethers';

const SEVEN_SEAS_BASE_API_URL = "https://api.sevenseas.capital";

interface BoringVaultV1ContextProps {
  chain: string;
  vaultEthersContract: Contract | null;
  outputTokenEthersContract: Contract | null;
  tellerEthersContract: Contract | null;
  accountantEthersContract: Contract | null;
  lensEthersContract: Contract | null;
  delayWithdrawEthersContract: Contract | null;
  withdrawQueueEthersContract: Contract | null;
  boringQueueEthersContract: Contract | null;
  depositTokens: Token[];
  withdrawTokens: Token[];
  // Any ethers provider
  ethersProvider: Provider; // Accept any Ethers provider
  baseToken: Token | null;
  vaultDecimals: number | null;
  // Add other states and functions that consumers can read and use
  // fetch Total Assets
  fetchTotalAssets: () => Promise<number>;
  fetchUserShares: (userAddress: string) => Promise<number>;
  fetchShareValue: () => Promise<number>;
  fetchUserUnlockTime: (userAddress: string) => Promise<number>;
  deposit: (
    signer: JsonRpcSigner,
    amount: string,
    token: Token
  ) => Promise<DepositStatus>;
  /* Delay Withdraws */
  delayWithdraw: (
    signer: JsonRpcSigner,
    shareAmount: string,
    tokenOut: Token,
    maxLoss: string,
    thirdPartyClaimer: boolean
  ) => Promise<WithdrawStatus>;
  delayWithdrawStatuses: (
    signer: JsonRpcSigner
  ) => Promise<DelayWithdrawStatus[]>;
  delayWithdrawCancel: (
    signer: JsonRpcSigner,
    tokenOut: Token
  ) => Promise<WithdrawStatus>;
  delayWithdrawComplete: (
    signer: JsonRpcSigner,
    tokenOut: Token
  ) => Promise<WithdrawStatus>;
  /* withdrawQueue */
  queueWithdraw: (
    signer: JsonRpcSigner,
    amount: string,
    token: Token,
    discountPercent: string,
    daysValid: string
  ) => Promise<WithdrawStatus>;
  withdrawQueueCancel: (
    signer: JsonRpcSigner,
    token: Token
  ) => Promise<WithdrawStatus>;
  withdrawQueueStatuses: (
    Signer: JsonRpcSigner
  ) => Promise<WithdrawQueueStatus[]>;
  /* Boring Queue */
  queueBoringWithdraw: (
    signer: JsonRpcSigner,
    amount: string,
    token: Token,
    discountPercent: string,
    daysValid: string
  ) => Promise<WithdrawStatus>;
  boringQueueCancel: (
    signer: JsonRpcSigner,
    token: Token
  ) => Promise<WithdrawStatus>;
  boringQueueStatuses: (
    signer: JsonRpcSigner
  ) => Promise<BoringQueueStatus[]>;
  /* Statuses */
  depositStatus: DepositStatus;
  withdrawStatus: WithdrawStatus;
  isBoringV1ContextReady: boolean;
  children: ReactNode;
}

const BoringVaultV1Context = createContext<BoringVaultV1ContextProps | null>(
  null
);

export const BoringVaultV1Provider: React.FC<{
  chain: string;
  outputTokenContract?: string;
  vaultContract: string;
  tellerContract: string;
  accountantContract: string;
  lensContract: string;
  delayWithdrawContract?: string;
  withdrawQueueContract?: string;
  boringQueueContract?: string;
  depositTokens: Token[];
  withdrawTokens: Token[];
  ethersProvider: Provider;
  baseAsset: Token;
  vaultDecimals: number;
  children: ReactNode;
}> = ({
  children,
  chain,
  outputTokenContract,
  depositTokens,
  withdrawTokens,
  vaultContract,
  tellerContract,
  accountantContract,
  lensContract,
  delayWithdrawContract,
  withdrawQueueContract,
  boringQueueContract,
  ethersProvider,
  vaultDecimals,
  baseAsset,
}) => {
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
    const [delayWithdrawEthersContract, setDelayWithdrawEthersContract] =
      useState<Contract | null>(null);
    const [withdrawQueueEthersContract, setWithdrawQueueEthersContract] =
      useState<Contract | null>(null);
    const [boringQueueEthersContract, setBoringQueueEthersContract] =
      useState<Contract | null>(null);
    const [outputTokenEthersContract, setOutputTokenEthersContract] =
      useState<Contract | null>(null);

    const [baseToken, setBaseToken] = useState<Token | null>(null);

    const [vaultDepositTokens, setVaultDepositTokens] =
      useState<Token[]>(depositTokens);
    const [vaultWithdrawTokens, setVaultWithdrawTokens] =
      useState<Token[]>(withdrawTokens);

    const [decimals, setDecimals] = useState<number | null>(null);
    const [isBoringV1ContextReady, setIsBoringV1ContextReady] =
      useState<boolean>(false);
    const [depositStatus, setDepositStatus] = useState<DepositStatus>({
      initiated: false,
      loading: false,
    });
    const [withdrawStatus, setWithdrawStatus] = useState<WithdrawStatus>({
      initiated: false,
      loading: false,
    });

    useEffect(() => {
      if (
        chain &&
        vaultContract &&
        tellerContract &&
        accountantContract &&
        lensContract &&
        ethersProvider &&
        baseAsset &&
        vaultDecimals &&
        depositTokens.length > 0 &&
        withdrawTokens.length > 0
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

        if (delayWithdrawContract) {
          const delayWithdrawEthersContract = new Contract(
            delayWithdrawContract,
            BoringDelayWithdrawContractABI,
            ethersProvider
          );
          setDelayWithdrawEthersContract(delayWithdrawEthersContract);
        }

        if (withdrawQueueContract) {
          const withdrawQueueEthersContract = new Contract(
            withdrawQueueContract,
            BoringWithdrawQueueContractABI,
            ethersProvider
          );
          setWithdrawQueueEthersContract(withdrawQueueEthersContract);
        }

        if (boringQueueContract) {
          const boringQueueEthersContract = new Contract(
            boringQueueContract,
            BoringQueueABI,
            ethersProvider
          );
          setBoringQueueEthersContract(boringQueueEthersContract);
        }

        if (outputTokenContract) {
          const outputTokenEthersContract = new Contract(
            outputTokenContract,
            erc20Abi,
            ethersProvider
          );
          setOutputTokenEthersContract(outputTokenEthersContract);
        }

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
          chain,
          vaultContract,
          tellerContract,
          accountantContract,
          lensContract,
          ethersProvider,
          baseAsset,
          decimals,
          depositTokens,
          withdrawTokens,
        });
      }
    }, [
      chain,
      vaultContract,
      tellerContract,
      accountantContract,
      lensContract,
      baseAsset,
      vaultDecimals,
      ethersProvider,
      depositTokens,
      withdrawTokens,
      delayWithdrawContract,
      outputTokenContract,
    ]);

    // Effect to handle updates on acceptedTokens if needed
    useEffect(() => {
      setVaultDepositTokens(depositTokens);
    }, [depositTokens]);

    // Effect to handle updates on withdrawTokens if needed
    useEffect(() => {
      setVaultWithdrawTokens(withdrawTokens);
    }, [withdrawTokens]);

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
          outputTokenEthersContract
            ? outputTokenEthersContract
            : vaultEthersContract,
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

    const fetchUserShares = useCallback(
      async (userAddress: string) => {
        if (
          !vaultEthersContract ||
          !lensEthersContract ||
          !baseToken ||
          !isBoringV1ContextReady ||
          !userAddress
        ) {
          console.error("Contracts or user not ready", {
            vaultEthersContract,
            lensEthersContract,
            baseToken,
            isBoringV1ContextReady,
            userAddress,
          });
          return Promise.reject("Contracts or user not ready");
        }
        console.log("Fetching user balance ...");

        try {
          const balance = await lensEthersContract.balanceOf(
            userAddress,
            outputTokenContract ? outputTokenContract : vaultContract
          );
          console.log("User balance from contract: ", balance);
          return Number(balance) / Math.pow(10, decimals!);
        } catch (error) {
          console.error("Error fetching user balance", error);
          throw error;
        }
      },
      [vaultEthersContract, lensEthersContract, baseToken, isBoringV1ContextReady]
    );

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

    const fetchUserUnlockTime = useCallback(
      async (userAddress: string) => {
        if (
          !lensEthersContract ||
          !tellerEthersContract ||
          !isBoringV1ContextReady ||
          !userAddress
        ) {
          console.error("Contracts or user not ready", {
            lensEthersContract,
            tellerEthersContract,
            isBoringV1ContextReady,
            userAddress,
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
      },
      [lensEthersContract, accountantEthersContract, isBoringV1ContextReady]
    );

    const deposit = useCallback(
      async (
        signer: JsonRpcSigner,
        amountHumanReadable: string,
        token: Token
      ) => {
        if (
          !vaultEthersContract ||
          !isBoringV1ContextReady ||
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
            await erc20Contract.allowance(
              await signer.getAddress(),
              vaultContract
            )
          );
          const bigNumAmt = new BigNumber(amountHumanReadable);
          console.warn(amountHumanReadable);
          console.warn("Amount to deposit: ", bigNumAmt.toNumber());
          const amountDepositBaseDenom = bigNumAmt.multipliedBy(
            new BigNumber(10).pow(token.decimals)
          );
          console.warn("Amount to deposit: ", amountDepositBaseDenom.toNumber());

          if (allowance < amountDepositBaseDenom.toNumber()) {
            setDepositStatus({
              initiated: true,
              loading: true,
            });
            console.log("Approving token ...");
            const approveTx = await erc20Contract.approve(
              vaultContract,
              amountDepositBaseDenom.toFixed(0)
            );

            // Wait for confirmation
            const approvedReceipt: ContractTransactionReceipt =
              await approveTx.wait();
            console.log("Token approved in tx: ", approvedReceipt);

            if (!approvedReceipt.hash) {
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
          // Get teller contract ready
          const tellerContractWithSigner = new Contract(
            tellerContract,
            BoringTellerABI,
            signer
          );

          // Deposit, but specifically only set the fields depositAsset and depositAmount
          // TODO: Set the other fields as well (payableAmount -- relevant for vanilla ETH deposits, and minimumMint)
          // TODO: Allow for custom gas limits
          const depositTx = await tellerContractWithSigner.deposit(
            token.address,
            amountDepositBaseDenom.toFixed(0),
            0
          );

          // Wait for confirmation
          const depositReceipt: ContractTransactionReceipt =
            await depositTx.wait();

          console.log("Token deposited in tx: ", depositReceipt);
          if (!depositReceipt.hash) {
            console.error("Deposit failed");
            setDepositStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Deposit reverted",
            });
            return depositStatus;
          }
          console.log("Deposit hash: ", depositReceipt.hash);

          // Set status
          setDepositStatus({
            initiated: false,
            loading: false,
            success: true,
            tx_hash: depositReceipt.hash,
          });
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
        tellerEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
      ]
    );

    /* Delay Withdraws */

    const delayWithdraw = useCallback(
      async (
        signer: JsonRpcSigner,
        shareAmountHumanReadable: string,
        tokenOut: Token,
        maxLossHumanReadable: string,
        thirdPartyClaimer: boolean
      ) => {
        if (
          !delayWithdrawEthersContract ||
          !vaultEthersContract ||
          !isBoringV1ContextReady ||
          !decimals ||
          !signer
        ) {
          console.error("Contracts or user not ready", {
            delayWithdrawEthersContract,
            isBoringV1ContextReady,
            decimals,
            signer,
          });

          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          });

          return withdrawStatus;
        }
        console.log("Beginning delay withdraw ...");

        setWithdrawStatus({
          initiated: true,
          loading: true,
        });

        try {
          // First check if the delay withdraw is approved for at least the amount
          const vaultContractWithSigner = new Contract(
            outputTokenContract ? outputTokenContract : vaultContract,
            BoringVaultABI,
            signer
          );

          const allowance = Number(
            await vaultContractWithSigner.allowance(
              await signer.getAddress(),
              delayWithdrawContract
            )
          );
          const bigNumAmt = new BigNumber(shareAmountHumanReadable);
          console.warn(shareAmountHumanReadable);
          console.warn("Amount to withdraw: ", bigNumAmt.toNumber());
          const amountWithdrawBaseDenom = bigNumAmt.multipliedBy(
            new BigNumber(10).pow(vaultDecimals)
          );
          console.warn(
            "Amount to withdraw: ",
            amountWithdrawBaseDenom.toNumber()
          );

          if (allowance < amountWithdrawBaseDenom.toNumber()) {
            setWithdrawStatus({
              initiated: true,
              loading: true,
            });
            console.log("Approving token ...");
            const approveTx = await vaultContractWithSigner.approve(
              delayWithdrawContract,
              amountWithdrawBaseDenom.toFixed(0)
            );

            // Wait for confirmation
            const approvedReceipt: ContractTransactionReceipt =
              await approveTx.wait();
            console.log("Token approved in tx: ", approvedReceipt);

            if (!approvedReceipt.hash) {
              console.error("Token approval failed");
              setWithdrawStatus({
                initiated: false,
                loading: false,
                success: false,
                error: "Token approval reverted",
              });
              return withdrawStatus;
            }
            console.log("Approved hash: ", approvedReceipt.hash);
          }

          console.log("Withdrawing token ...");
          // Get withdraw contract ready
          const delayWithdrawContractWithSigner = new Contract(
            delayWithdrawContract!,
            BoringDelayWithdrawContractABI,
            signer
          );

          // Max loss is truncated(human readable * 100)
          const maxLossBaseDenom = new BigNumber(maxLossHumanReadable)
            .multipliedBy(100)
            .decimalPlaces(0, BigNumber.ROUND_DOWN);

          const withdrawTx =
            await delayWithdrawContractWithSigner.requestWithdraw(
              tokenOut.address,
              amountWithdrawBaseDenom.toFixed(0),
              maxLossBaseDenom.toFixed(0),
              thirdPartyClaimer
            );

          // Wait for confirmation
          const withdrawReceipt: ContractTransactionReceipt =
            await withdrawTx.wait();

          console.log("Withdraw Requested in tx: ", withdrawReceipt);
          if (!withdrawReceipt.hash) {
            console.error("Withdraw Request failed");
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw reverted",
            });
            return withdrawStatus;
          }
          console.log("Withdraw Request hash: ", withdrawReceipt.hash);

          // Set status
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: true,
            tx_hash: withdrawReceipt.hash,
          });
        } catch (error: any) {
          console.error("Error withdrawing", error);
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          });
          return withdrawStatus;
        }

        return withdrawStatus;
      },
      [
        vaultEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
        delayWithdrawEthersContract,
      ]
    );

    const delayWithdrawStatuses = useCallback(
      async (signer: JsonRpcSigner) => {
        if (
          !delayWithdrawEthersContract ||
          !isBoringV1ContextReady ||
          !decimals ||
          !signer
        ) {
          console.error("Contracts or user not ready for withdraw statuses...", {
            delayWithdrawEthersContract,
            isBoringV1ContextReady,
            decimals,
            signer,
          });

          return [];
        }
        console.log("Fetching delay withdraw statuses ...");

        try {
          // Create a request per token
          const statuses = await Promise.all(
            withdrawTokens.map(async (token) => {
              const status = await delayWithdrawEthersContract.withdrawRequests(
                await signer.getAddress(),
                token.address
              );
              console.log("Status from contract: ", status);
              // Format the status object

              if (Number(status.shares) === 0) {
                // Skip if no shares
                return null;
              }

              return {
                allowThirdPartyToComplete: status.allowThirdPartyToComplete,
                maxLoss: Number(status.maxLoss) / 100,
                maturity: Number(status.maturity),
                shares: Number(status.shares) / Math.pow(10, vaultDecimals),
                exchangeRateAtTimeOfRequest:
                  Number(status.exchangeRateAtTimeOfRequest) /
                  Math.pow(10, vaultDecimals),
                token: token,
              } as DelayWithdrawStatus;
            })
          );
          console.log("All statuses: ", statuses);

          // Drop null statuses
          return statuses.filter(
            (status): status is DelayWithdrawStatus => status !== null
          );
        } catch (error) {
          console.error("Error fetching delay withdraw statuses", error);
          return []; // Return an empty array in case of an error
        }
      },
      [
        delayWithdrawEthersContract,
        decimals,
        isBoringV1ContextReady,
        withdrawTokens,
      ]
    );

    const delayWithdrawCancel = useCallback(
      async (signer: JsonRpcSigner, tokenOut: Token) => {
        if (
          !delayWithdrawEthersContract ||
          !isBoringV1ContextReady ||
          !decimals ||
          !signer
        ) {
          console.error("Contracts or user not ready to cancel withdraw", {
            delayWithdrawEthersContract,
            isBoringV1ContextReady,
            decimals,
            signer,
          });

          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          });

          return withdrawStatus;
        }

        console.log("Cancelling delay withdraw ...");
        const delayWithdrawContractWithSigner = new Contract(
          delayWithdrawContract!,
          BoringDelayWithdrawContractABI,
          signer
        );

        setWithdrawStatus({
          initiated: true,
          loading: true,
        });

        try {
          const cancelTx = await delayWithdrawContractWithSigner.cancelWithdraw(
            tokenOut.address
          );

          // Wait for confirmation
          const cancelReceipt: ContractTransactionReceipt = await cancelTx.wait();

          console.log("Withdraw Cancelled in tx: ", cancelReceipt);
          if (!cancelReceipt.hash) {
            console.error("Withdraw Cancel failed");
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Cancel reverted",
            });
            return withdrawStatus;
          }
          console.log("Withdraw Cancel hash: ", cancelReceipt.hash);

          // Set status
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: true,
            tx_hash: cancelReceipt.hash,
          });
        } catch (error: any) {
          console.error("Error cancelling withdraw", error);
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          });
          return withdrawStatus;
        }
        return withdrawStatus;
      },
      [
        delayWithdrawEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
      ]
    );

    const delayWithdrawComplete = useCallback(
      async (signer: JsonRpcSigner, tokenOut: Token) => {
        if (
          !delayWithdrawEthersContract ||
          !isBoringV1ContextReady ||
          !decimals ||
          !signer
        ) {
          console.error("Contracts or user not ready to complete withdraw", {
            delayWithdrawEthersContract,
            isBoringV1ContextReady,
            decimals,
            signer,
          });

          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          });

          return withdrawStatus;
        }

        try {
          const delayWithdrawContractWithSigner = new Contract(
            delayWithdrawContract!,
            BoringDelayWithdrawContractABI,
            signer
          );

          console.log("Completing delay withdraw ...");

          setWithdrawStatus({
            initiated: true,
            loading: true,
          });

          const completeTx =
            await delayWithdrawContractWithSigner.completeWithdraw(
              tokenOut.address,
              await signer.getAddress()
            );

          // Wait for confirmation
          const completeReceipt: ContractTransactionReceipt =
            await completeTx.wait();

          console.log("Withdraw Completed in tx: ", completeReceipt);

          if (!completeReceipt.hash) {
            console.error("Withdraw Complete failed");
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Complete reverted",
            });
            return withdrawStatus;
          }

          console.log("Withdraw Complete hash: ", completeReceipt.hash);

          // Set status
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: true,
            tx_hash: completeReceipt.hash,
          });
        } catch (error: any) {
          console.error("Error completing withdraw", error);
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          });
          return withdrawStatus;
        }
        return withdrawStatus;
      },
      [
        delayWithdrawEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
      ]
    );

    /* withdrawQueue */
    const queueWithdraw = useCallback(
      async (
        signer: JsonRpcSigner,
        amountHumanReadable: string,
        token: Token,
        discountPercent: string,
        daysValid: string
      ) => {
        if (
          !withdrawQueueEthersContract ||
          !vaultEthersContract ||
          !isBoringV1ContextReady ||
          !lensEthersContract ||
          !accountantContract ||
          !decimals ||
          !signer
        ) {
          console.error("Contracts or user not ready", {
            withdrawQueueEthersContract,
            isBoringV1ContextReady,
            decimals,
            signer,
          });

          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          });

          return withdrawStatus;
        }

        console.log("Queueing withdraw ...");
        const withdrawQueueContractWithSigner = new Contract(
          withdrawQueueContract!,
          BoringWithdrawQueueContractABI,
          signer
        );

        setWithdrawStatus({
          initiated: true,
          loading: true,
        });

        // Get the amount in base denomination
        const bigNumAmt = new BigNumber(amountHumanReadable);
        console.warn(amountHumanReadable);
        console.warn("Amount to withdraw: ", bigNumAmt.toNumber());
        const amountWithdrawBaseDenom = bigNumAmt
          .multipliedBy(new BigNumber(10).pow(vaultDecimals))
          .decimalPlaces(0, BigNumber.ROUND_DOWN);

        try {
          // First check if the delay withdraw is approved for at least the amount
          const vaultContractWithSigner = new Contract(
            outputTokenContract ? outputTokenContract : vaultContract,
            BoringVaultABI,
            signer
          );

          const allowance = Number(
            await vaultContractWithSigner.allowance(
              await signer.getAddress(),
              withdrawQueueContract
            )
          );

          if (allowance < amountWithdrawBaseDenom.toNumber()) {
            setWithdrawStatus({
              initiated: true,
              loading: true,
            });
            console.log("Approving token ...");
            const approveTx = await vaultContractWithSigner.approve(
              withdrawQueueContract,
              amountWithdrawBaseDenom.toFixed(0)
            );

            // Wait for confirmation
            const approvedReceipt: ContractTransactionReceipt =
              await approveTx.wait();
            console.log("Token approved in tx: ", approvedReceipt);

            if (!approvedReceipt.hash) {
              console.error("Token approval failed");
              setWithdrawStatus({
                initiated: false,
                loading: false,
                success: false,
                error: "Token approval reverted",
              });
              return withdrawStatus;
            }
            console.log("Approved hash: ", approvedReceipt.hash);
          }

          console.warn(
            "Amount to withdraw: ",
            amountWithdrawBaseDenom.toNumber()
          );

          // Get the current share price
          const sharePrice = await lensEthersContract.exchangeRate(
            accountantContract
          );

          // Discounted share price
          /*
          const discountedSharePrice = new BigNumber(sharePrice)
            .multipliedBy(
              new BigNumber(100)
                .minus(new BigNumber(discountPercent))
                .dividedBy(100)
            )
            .decimalPlaces(0, BigNumber.ROUND_DOWN);
            */

          // Get the days valid
          const daysValidSeconds = new BigNumber(daysValid).multipliedBy(
            new BigNumber(86400) // 1 day in seconds
          );
          // Get the current unix time seconds and add the days valid
          const deadline = new BigNumber(
            Math.floor(Date.now() / 1000) +
            Math.floor(daysValidSeconds.toNumber())
          ).decimalPlaces(0, BigNumber.ROUND_DOWN);

          const formattedDiscountPercent = new BigNumber(discountPercent).multipliedBy(
            new BigNumber(10000) // 1% = 10000
          )

          const queueTx =
            await withdrawQueueContractWithSigner.safeUpdateAtomicRequest(
              outputTokenContract ? outputTokenContract : vaultContract, // offer
              token.address, // want
              [
                deadline.toFixed(0), // Deadline
                Number(0),//discountedSharePrice.toNumber(), // atomicPrice, this is actually overriden in safeUpdateAtomicRequest
                amountWithdrawBaseDenom.toFixed(0), // offerAmount
                false, // inSolver
              ],
              accountantContract, // accountant
              formattedDiscountPercent.toFixed(0)
            );

          // Wait for confirmation
          const queueReceipt: ContractTransactionReceipt = await queueTx.wait();

          console.log("Withdraw Queued in tx: ", queueReceipt);
          if (!queueReceipt.hash) {
            console.error("Withdraw Queue failed");
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Queue reverted",
            });
            return withdrawStatus;
          }
          console.log("Withdraw Queue hash: ", queueReceipt.hash);

          // Set status
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: true,
            tx_hash: queueReceipt.hash,
          });
        } catch (error: any) {
          console.error("Error queueing withdraw", error);
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          });
          return withdrawStatus;
        }

        return withdrawStatus;
      },
      [
        withdrawQueueEthersContract,
        lensEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
        accountantContract,
      ]
    );

    const withdrawQueueCancel = useCallback(
      async (signer: JsonRpcSigner, token: Token) => {
        if (
          !withdrawQueueEthersContract ||
          !isBoringV1ContextReady ||
          !decimals ||
          !signer
        ) {
          console.error("Contracts or user not ready to cancel withdraw", {
            withdrawQueueEthersContract,
            isBoringV1ContextReady,
            decimals,
            signer,
          });

          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          });

          return withdrawStatus;
        }

        console.log("Cancelling withdraw queue ...");
        const withdrawQueueContractWithSigner = new Contract(
          withdrawQueueContract!,
          BoringWithdrawQueueContractABI,
          signer
        );

        setWithdrawStatus({
          initiated: true,
          loading: true,
        });

        try {
          // Update request with same token, but 0 amount
          const cancelTx =
            await withdrawQueueContractWithSigner.updateAtomicRequest(
              outputTokenContract ? outputTokenContract : vaultContract, // Offer
              token.address, // Want
              [
                0, // Deadline
                0, // atomicPrice
                0, // offerAmount
                false, // inSolver
              ],

            );

          // Wait for confirmation
          const cancelReceipt: ContractTransactionReceipt = await cancelTx.wait();

          console.log("Withdraw Cancelled in tx: ", cancelReceipt);
          if (!cancelReceipt.hash) {
            console.error("Withdraw Cancel failed");
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Cancel reverted",
            });
            return withdrawStatus;
          }
          console.log("Withdraw Cancel hash: ", cancelReceipt.hash);

          // Set status
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: true,
            tx_hash: cancelReceipt.hash,
          });
        } catch (error: any) {
          console.error("Error cancelling withdraw", error);
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          });
          return withdrawStatus;
        }

        return withdrawStatus;
      },
      [
        withdrawQueueEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
      ]
    );

    const withdrawQueueStatuses = useCallback(
      async (signer: JsonRpcSigner) => {
        if (
          !withdrawQueueEthersContract ||
          !isBoringV1ContextReady ||
          !decimals ||
          !signer
        ) {
          console.error(
            "Contracts or user not ready for withdraw queue statuses...",
            {
              withdrawQueueEthersContract,
              isBoringV1ContextReady,
              decimals,
              signer,
            }
          );
          return [];
        }
        console.log("Fetching withdraw queue statuses ...");

        try {
          let chainName = chain.toLowerCase();
          if (chain === "mainnet") {
            chainName = "ethereum";
          }

          const withdrawURL = `${SEVEN_SEAS_BASE_API_URL}/withdrawRequests/${chainName}/${vaultContract}/${await signer.getAddress()}`;
          const response = await fetch(withdrawURL)
            .then((response) => {
              return response.json();
            })
            .catch((error) => {
              console.error("Error fetching withdraw queue statuses", error);
              return [];
            });
          console.log("Response from Withdraw API: ", response);
          // Parse on ["Response"]["open_requests"]
          const openRequests = response["Response"]["open_requests"];

          // Format the status object
          return openRequests.map((request: any) => {
            return {
              sharesWithdrawing: Number(request["amount"]) / 10 ** vaultDecimals,
              blockNumberOpened: Number(request["blockNumber"]),
              deadlineUnixSeconds: Number(request["deadline"]),
              errorCode: Number(request["errorCode"]),
              minSharePrice: Number(request["minPrice"]) / 10 ** vaultDecimals,
              timestampOpenedUnixSeconds: Number(request["timestamp"]),
              transactionHashOpened: request["transactionHash"],
              tokenOut: withdrawTokens.find(
                (token) =>
                  token.address.toLowerCase() ===
                  request["wantToken"].toLowerCase()
              )!,
            } as WithdrawQueueStatus;
          });
        } catch (error) {
          console.error("Error fetching withdraw queue statuses", error);
          return []; // Return an empty array in case of an error
        }
      },
      [
        withdrawQueueEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
      ]
    );

    /* boringQueue */
    const queueBoringWithdraw = useCallback(
      async (
        signer: JsonRpcSigner,
        amountHumanReadable: string,
        token: Token,
        discountPercent: string,
        daysValid: string
      ) => {
        if (
          !boringQueueEthersContract ||
          !vaultEthersContract ||
          !isBoringV1ContextReady ||
          !lensEthersContract ||
          !accountantContract ||
          !decimals ||
          !signer
        ) {
          console.error("Contracts or user not ready", {
            boringQueueEthersContract,
            isBoringV1ContextReady,
            decimals,
            signer,
          });

          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          });

          return withdrawStatus;
        }

        console.log("Queueing boring withdraw ...");
        const boringQueueContractWithSigner = new Contract(
          boringQueueContract!,
          BoringQueueABI,
          signer
        );

        setWithdrawStatus({
          initiated: true,
          loading: true,
        });

        // Get the amount in base denomination
        const bigNumAmt = new BigNumber(amountHumanReadable);
        console.warn(amountHumanReadable);
        console.warn("Amount to withdraw: ", bigNumAmt.toNumber());
        const amountWithdrawBaseDenom = bigNumAmt
          .multipliedBy(new BigNumber(10).pow(vaultDecimals))
          .decimalPlaces(0, BigNumber.ROUND_DOWN);

        try {
          // First check if the delay withdraw is approved for at least the amount
          const vaultContractWithSigner = new Contract(
            outputTokenContract ? outputTokenContract : vaultContract,
            BoringVaultABI,
            signer
          );

          console.warn(
            "Amount to withdraw: ",
            amountWithdrawBaseDenom.toNumber()
          );

          // Get the current share price
          const sharePrice = await lensEthersContract.exchangeRate(
            accountantContract
          );

          // Discounted share price
          /*
          const discountedSharePrice = new BigNumber(sharePrice)
            .multipliedBy(
              new BigNumber(100)
                .minus(new BigNumber(discountPercent))
                .dividedBy(100)
            )
            .decimalPlaces(0, BigNumber.ROUND_DOWN);
            */

          // Get the days valid
          const daysValidSeconds = new BigNumber(daysValid).multipliedBy(
            new BigNumber(86400) // 1 day in seconds
          );
          // Get the current unix time seconds and add the days valid
          const deadline = new BigNumber(
            Math.floor(Date.now() / 1000) +
            Math.floor(daysValidSeconds.toNumber())
          ).decimalPlaces(0, BigNumber.ROUND_DOWN);

          const formattedDiscountPercent = new BigNumber(discountPercent).multipliedBy(
            new BigNumber(10000) // 1% = 10000
          )

          // Disct can be a min of 1 bps
          if (formattedDiscountPercent.lt(1)) {
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Discount percent must be at least 1 bps",
            });
            return withdrawStatus;
          }

          // Generate permit data
          const userAddress = await signer.getAddress();
          const nonce = await vaultContractWithSigner.nonces(userAddress);
          const name = await vaultContractWithSigner.name();
          const chainId = (await ethersProvider.getNetwork()).chainId;

          const domain = {
            name: name,
            version: '1',
            chainId: chainId,
            verifyingContract: outputTokenContract ? outputTokenContract : vaultContract
          };

          const types = {
            Permit: [
              { name: 'owner', type: 'address' },
              { name: 'spender', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' }
            ]
          };

          const value = {
            owner: userAddress,
            spender: boringQueueContract,
            value: amountWithdrawBaseDenom.toFixed(0),
            nonce: nonce.toString(),
            deadline: deadline.toFixed(0)
          };

          setWithdrawStatus({
            initiated: true,
            loading: true,
          });

          // Sign the permit
          let v: number;
          let r: string;
          let s: string;
          try {
            const signature = await signer.signTypedData(domain, types, value);
            const sig = Signature.from(signature);
            v = sig.v;
            r = sig.r;
            s = sig.s;
          } catch (error) {
            console.error("Error signing permit", error);
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Error signing permit",
            });
            return withdrawStatus;
          }

          // Execute the transaction with the permit
          const queueTx =
            await boringQueueContractWithSigner.requestOnChainWithdrawWithPermit(
              token.address, // assetOut
              amountWithdrawBaseDenom.toFixed(0), // amountOfShares
              formattedDiscountPercent.toFixed(0), // Discount in bps
              daysValidSeconds.toFixed(0), // secondsToDeadline
              deadline.toFixed(0), // permitDeadline (keep permit valid as duration of withdraw)
              v, // permit v
              r, // permit r
              s  // permit s
            );

          // Wait for confirmation
          const queueReceipt: ContractTransactionReceipt = await queueTx.wait();

          console.log("Withdraw Queued in tx: ", queueReceipt);
          if (!queueReceipt.hash) {
            console.error("Withdraw Queue failed");
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Queue reverted",
            });
            return withdrawStatus;
          }
          console.log("Withdraw Queue hash: ", queueReceipt.hash);

          // Set status
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: true,
            tx_hash: queueReceipt.hash,
          });
        } catch (error: any) {
          console.error("Error queueing withdraw", error);
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          });
          return withdrawStatus;
        }

        return withdrawStatus;
      },
      [
        boringQueueEthersContract,
        vaultEthersContract,
        lensEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
        accountantContract,
        boringQueueContract,
        vaultContract,
        outputTokenContract,
      ]
    );

    const boringQueueCancel = useCallback(
      async (signer: JsonRpcSigner, token: Token) => {
        if (
          !boringQueueEthersContract ||
          !isBoringV1ContextReady ||
          !decimals ||
          !signer
        ) {
          console.error("Contracts or user not ready to cancel withdraw", {
            boringQueueEthersContract,
            isBoringV1ContextReady,
            decimals,
            signer,
          });

          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          });

          return withdrawStatus;
        }

        console.log("Cancelling withdraw queue ...");
        const boringQueueContractWithSigner = new Contract(
          boringQueueContract!,
          BoringQueueABI,
          signer
        );

        setWithdrawStatus({
          initiated: true,
          loading: true,
        });

        try {
          // Call API for relevant metadata
          let chainName = chain.toLowerCase();
          if (chain === "mainnet") {
            chainName = "ethereum";
          }

          const userAddress = await signer.getAddress();

          const withdrawURL = `${SEVEN_SEAS_BASE_API_URL}/boringQueue/${chainName}/${vaultContract}/${userAddress}`;
          console.log("Fetching withdraw queue statuses from: ", withdrawURL);
          const response = await fetch(withdrawURL)
            .then((response) => {
              return response.json();
            })
            .catch((error) => {
              console.error("Error fetching withdraw queue statuses", error);
              return [];
            });
          console.log("Response from Withdraw API: ", response);
          // Parse on ["Response"]["open_requests"]
          const openRequests = response["Response"]["open_requests"];

          // Filter the requests on the token
          const request = openRequests.find((request: any) => {
            return request["wantToken"].toLowerCase() === token.address.toLowerCase();
          });

          if (!request) {
            console.error("No request found for token", token.address);
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "No request found for token",
            });
            return withdrawStatus;
          }

          const metadata = request["metadata"];

          const cancelTx =
            await boringQueueContractWithSigner.cancelOnChainWithdraw(
              [
                metadata["nonce"].toString(), // nonce
                metadata["user"].toString(), // user
                token.address, // assetOut
                metadata["amountOfShares"].toString(), // amountOfShares
                metadata["amountOfAssets"].toString(), // amountOfAssets
                metadata["creationTime"].toString(), // creationTime
                metadata["secondsToMaturity"].toString(), // secondsToMaturity
                metadata["secondsToDeadline"].toString() // secondsToDeadline
              ]
            );

          // Wait for confirmation
          const cancelReceipt: ContractTransactionReceipt = await cancelTx.wait();

          console.log("Withdraw Cancelled in tx: ", cancelReceipt);
          if (!cancelReceipt.hash) {
            console.error("Withdraw Cancel failed");
            setWithdrawStatus({
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Cancel reverted",
            });
            return withdrawStatus;
          }
          console.log("Withdraw Cancel hash: ", cancelReceipt.hash);

          // Set status
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: true,
            tx_hash: cancelReceipt.hash,
          });
        } catch (error: any) {
          console.error("Error cancelling withdraw", error);
          setWithdrawStatus({
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          });
          return withdrawStatus;
        }

        return withdrawStatus;
      },
      [
        boringQueueEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
      ]
    );

    const boringQueueStatuses = useCallback(
      async (signer: JsonRpcSigner) => {
        if (
          !boringQueueEthersContract ||
          !isBoringV1ContextReady ||
          !decimals ||
          !signer
        ) {
          console.error(
            "Contracts or user not ready for withdraw queue statuses...",
            {
              boringQueueEthersContract,
              isBoringV1ContextReady,
              decimals,
              signer,
            }
          );
          return [];
        }
        console.log("Fetching withdraw queue statuses ...");

        try {
          let chainName = chain.toLowerCase();
          if (chain === "mainnet") {
            chainName = "ethereum";
          }

          const withdrawURL = `${SEVEN_SEAS_BASE_API_URL}/boringQueue/${chainName}/${vaultContract}/${await signer.getAddress()}`;
          console.log("Fetching withdraw queue statuses from: ", withdrawURL);
          const response = await fetch(withdrawURL)
            .then((response) => {
              return response.json();
            })
            .catch((error) => {
              console.error("Error fetching withdraw queue statuses", error);
              return [];
            });
          console.log("Response from Withdraw API: ", response);
          // Parse on ["Response"]["open_requests"]
          const openRequests = response["Response"]["open_requests"];

          // Format the status object
          return openRequests.map((request: any) => {
            return {
              nonce: Number(request["metadata"]["nonce"]),
              user: request["user"],
              tokenOut: withdrawTokens.find(
                (token) =>
                  token.address.toLowerCase() ===
                  request["wantToken"].toLowerCase()
              )!,
              sharesWithdrawing: Number(request["metadata"]["amountOfShares"]) / 10 ** vaultDecimals,
              assetsWithdrawing: Number(request["metadata"]["amountOfAssets"]) / 10 ** vaultDecimals,
              creationTime: Number(request["metadata"]["creationTime"]),
              secondsToMaturity: Number(request["metadata"]["secondsToMaturity"]),
              secondsToDeadline: Number(request["metadata"]["secondsToDeadline"]),
              errorCode: Number(request["errorCode"]),
              transactionHashOpened: request["transaction_hash"],
            } as BoringQueueStatus;
          });
        } catch (error) {
          console.error("Error fetching withdraw queue statuses", error);
          return []; // Return an empty array in case of an error
        }
      },
      [
        boringQueueEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
      ]
    );

    return (
      <BoringVaultV1Context.Provider
        value={{
          chain,
          vaultEthersContract,
          outputTokenEthersContract,
          tellerEthersContract,
          accountantEthersContract,
          lensEthersContract,
          delayWithdrawEthersContract,
          withdrawQueueEthersContract,
          boringQueueEthersContract,
          depositTokens: depositTokens,
          withdrawTokens: withdrawTokens,
          ethersProvider: ethersProvider,
          baseToken,
          vaultDecimals,
          fetchTotalAssets,
          fetchUserShares,
          fetchShareValue,
          fetchUserUnlockTime,
          deposit,
          delayWithdraw,
          delayWithdrawStatuses,
          delayWithdrawCancel,
          delayWithdrawComplete,
          queueWithdraw,
          withdrawQueueCancel,
          withdrawQueueStatuses,
          queueBoringWithdraw,
          boringQueueCancel,
          boringQueueStatuses,
          depositStatus,
          withdrawStatus,
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

