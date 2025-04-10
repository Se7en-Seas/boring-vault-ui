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
  BoringQueueStatus,
  MerkleClaimStatus,
  BoringQueueAssetParams
} from "../../types";
import BoringVaultABI from "../../abis/v1/BoringVaultABI";
import BoringTellerABI from "../../abis/v1/BoringTellerABI";
import BoringAccountantABI from "../../abis/v1/BoringAccountantABI";
import BoringLensABI from "../../abis/v1/BoringLensABI";
import BoringWithdrawQueueContractABI from "../../abis/v1/BoringWithdrawQueueContractABI";
import BoringQueueABI from "../../abis/v1/BoringQueueABI";
import IncentiveDistributorABI from "../../abis/v1/IncentiveDistributorABI";
import {
  Provider,
  Contract,
  JsonRpcSigner,
  ContractTransactionReceipt,
  Signature,
} from "ethers";
import { erc20Abi, parseUnits, type TypedDataDomain } from "viem";
import BigNumber from "bignumber.js";
import BoringDelayWithdrawContractABI from "../../abis/v1/BoringDelayWithdrawContractABI";
import { ethers } from 'ethers';
import { splitSignature } from "@ethersproject/bytes";
import { checkContractForPermit } from "../../utils/permit/check-contract-for-pemit";
import { USDC_ABI } from "./USDC-abi";

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
  incentiveDistributorEthersContract: Contract | null;
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
  depositWithPermit: (
    signer: JsonRpcSigner,
    amountHumanReadable: string,
    token: Token,
    deadline?: number
  ) => Promise<DepositStatus>;
  previewDeposit: (
    amount: string,
    token: Token
  ) => Promise<string>;
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
    discountPercent?: string,
    daysValid?: string
  ) => Promise<WithdrawStatus>;
  boringQueueCancel: (
    signer: JsonRpcSigner,
    token: Token
  ) => Promise<WithdrawStatus>;
  boringQueueStatuses: (
    signer: JsonRpcSigner
  ) => Promise<BoringQueueStatus[]>;
  fetchBoringQueueAssetParams: (
    token: Token
  ) => Promise<BoringQueueAssetParams>;
  /* Statuses */
  depositStatus: DepositStatus;
  withdrawStatus: WithdrawStatus;
  isBoringV1ContextReady: boolean;
  children: ReactNode;
  merkleClaim: (
    signer: JsonRpcSigner,
    merkleData: {
      rootHashes: string[];
      tokens: string[];
      balances: string[];
      merkleProofs: string[][];
    }
  ) => Promise<MerkleClaimStatus>;
  merkleClaimStatus: MerkleClaimStatus;
  checkClaimStatuses: (
    address: string,
    rootHashes: string[],
    balances: string[]
  ) => Promise<Array<{ rootHash: string; claimed: boolean; balance: string }>>;
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
  incentiveDistributorContract?: string;
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
  incentiveDistributorContract,
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
    const [incentiveDistributorEthersContract, setIncentiveDistributorEthersContract] =
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

    // Add new state for merkle claim status
    const [merkleClaimStatus, setMerkleClaimStatus] = useState<MerkleClaimStatus>({
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

        if (incentiveDistributorContract) {
          const incentiveDistributorEthersContract = new Contract(
            incentiveDistributorContract,
            IncentiveDistributorABI,
            ethersProvider
          );
          setIncentiveDistributorEthersContract(incentiveDistributorEthersContract);
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
          incentiveDistributorContract,
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
      incentiveDistributorContract,
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

          const temp = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          };
          setDepositStatus(temp);
          return temp;
        }
        console.log("Depositing ...");

        const temp = {
          initiated: true,
          loading: true,
        };
        setDepositStatus(temp);

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
            const tempApproving = {
              initiated: true,
              loading: true,
            };
            setDepositStatus(tempApproving);
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
              const tempError = {
                initiated: false,
                loading: false,
                success: false,
                error: "Token approval reverted",
              };
              setDepositStatus(tempError);
              return tempError;
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
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Deposit reverted",
            };
            setDepositStatus(tempError);
            return tempError;
          }
          console.log("Deposit hash: ", depositReceipt.hash);

          // Set status
          const tempSuccess = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: depositReceipt.hash,
          };
          setDepositStatus(tempSuccess);
          return tempSuccess;
        } catch (error: any) {
          console.error("Error depositing", error);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          };
          setDepositStatus(tempError);
          return tempError;
        }
      },
      [
        vaultEthersContract,
        tellerEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
      ]
    );

    /**
     * Creates an EIP-2612 permit signature for gasless token approvals
     * Read more about EIP-2612 here: https://eips.ethereum.org/EIPS/eip-2612
     * @throws If signature fails or token contract is invalid
     */
    const signPermit = async ({
      value,
      signer,
      spender,
      deadline,
      tokenAddress,
    }: {
      value: bigint;
      deadline: number;
      spender: string;
      signer: JsonRpcSigner;
      tokenAddress: `0x${string}`;
    }): Promise<{ v: number; r: string; s: string }> => {
      try {
        // Minimal ABI for EIP-2612 permit
        const PERMIT_ABI = [
          'function name() view returns (string)',
          'function version() view returns (string)',
          'function nonces(address) view returns (uint256)',
        ] as const;

        const tokenContract = new Contract(
          tokenAddress,
          PERMIT_ABI,
          signer
        );

        const userAddress = await signer.getAddress();

        // Get token details
        const [name, nonce, version, chainId] = await Promise.all([
          tokenContract.name(),
          tokenContract.nonces(userAddress),
          tokenContract.version().catch(() => '1'),
          signer.provider.getNetwork().then(network => Number(network.chainId))
        ]);

        // Build domain separator
        const domain: TypedDataDomain = {
          name,
          version,
          chainId,
          verifyingContract: tokenAddress,
        };

        // Standard EIP-2612 types
        const types = {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: 'nonce', type: 'uint256' },
            { name: "deadline", type: "uint256" },
          ],
        };

        const message = {
          owner: userAddress,
          spender,
          value,
          nonce,
          deadline,
        };

        const signature = await signer.signTypedData(domain, types, message);
        return splitSignature(signature);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("signPermit failed:", errorMessage);

        throw new Error(
          `Permit signing failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    };

    /**
     * Deposits tokens using EIP-2612 permit for gasless approvals
     * List of tested tokens that support EIP-2612 permits: USDC, USDe, deUSD, LBTC, cbBTC
     * @throws If token doesn't support permits or transaction fails
     */
    const depositWithPermit = useCallback(
      async (
        signer: JsonRpcSigner,
        amountHumanReadable: string,
        token: Token,
        initialDeadline?: number
      ): Promise<DepositStatus> => {
        // Calculate maximum deadline as current timestamp + 15 minutes (900 seconds)
        const FIFTEEN_MINUTES = 900;
        const deadline = initialDeadline ?? Math.floor(Date.now() / 1000) + FIFTEEN_MINUTES;

        // Validate context and inputs
        if (!vaultEthersContract || !isBoringV1ContextReady || !decimals || !signer || !tellerContract || !vaultContract) {
          const error = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts, or user not ready",
          };
          setDepositStatus(error);
          return error;
        }

        try {
          setDepositStatus({
            initiated: true,
            loading: true,
            success: false,
            error: undefined
          });

          // Check if the token supports EIP-2612 permits
          const { hasPermit } = await checkContractForPermit(signer.provider, token);

          // Token doesn't implement EIP-2612 permit functionality, return error
          if (hasPermit === 'No') {
            const error = {
              initiated: false,
              loading: false,
              success: false,
              error: "Token does not support EIP-2612 permits",
            };
            setDepositStatus(error);
            return error;
          }

          // Convert human-readable amount to token's base units
          const value = parseUnits(amountHumanReadable, token.decimals);

          // Generate EIP-2612 permit signature
          const { v, r, s } = await signPermit({
            value,
            signer,
            deadline,
            spender: vaultContract,
            tokenAddress: token.address as `0x${string}`,
          });

          // Set up Teller contract
          const tellerContractWithSigner = new Contract(
            tellerContract,
            BoringTellerABI,
            signer
          );

          // Deposit with permit
          const minimumMint = 0;
          const depositWithPermitTx = await tellerContractWithSigner.depositWithPermit(
            token.address,
            value,
            minimumMint,
            deadline,
            v,
            r,
            s
          );

          // Wait for confirmation
          const receipt = await depositWithPermitTx.wait();
          console.log("Deposit with permit tx: ", receipt);

          if (!receipt.hash) {
            const error = {
              initiated: false,
              loading: false,
              success: false,
              error: "Deposit transaction reverted",
            };
            setDepositStatus(error);
            return error;
          }

          const success = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: receipt.hash,
          };

          setDepositStatus(success);
          return success;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error("depositWithPermit failed:", errorMessage);

          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: errorMessage,
          };
          setDepositStatus(tempError);
          return tempError;
        }
      },
      [
        vaultEthersContract,
        tellerEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
        vaultContract
      ]
    );

    const previewDeposit = useCallback(
      async (
        amountHumanReadable: string,
        token: Token
      ) => {
        if (
          !vaultEthersContract ||
          !isBoringV1ContextReady ||
          !lensEthersContract ||
          !decimals
        ) {
          console.error("Contracts or user not ready", {
            /* Dependencies here */
          });
          return Promise.reject("Contracts or user not ready");
        }

        try {
          const bigNumAmt = new BigNumber(amountHumanReadable);
          console.warn(amountHumanReadable);
          console.warn("Amount to deposit: ", bigNumAmt.toNumber());
          const amountDepositBaseDenom = bigNumAmt.multipliedBy(
            new BigNumber(10).pow(token.decimals)
          );
          console.warn("Amount to deposit: ", amountDepositBaseDenom.toNumber());

          // Preview the deposit
          console.log(token.address);
          console.log(amountDepositBaseDenom.toFixed(0));
          console.log(vaultContract);
          console.log(accountantContract);
          const depositPreviewAmt = await lensEthersContract.previewDeposit(
            token.address,
            amountDepositBaseDenom.toFixed(0),
            outputTokenContract ? outputTokenContract : vaultContract,
            accountantContract
          );
          console.log("Deposit preview: ", depositPreviewAmt);

          const humanReadablePreviewAmt = Number(depositPreviewAmt) / Math.pow(10, decimals);

          console.log("Deposit preview: ", humanReadablePreviewAmt);
          return String(humanReadablePreviewAmt);
        } catch (error: any) {
          console.error("Error previewing deposit: ", error);
          return Promise.reject("Error previewing deposit");
        }
      },
      [
        vaultEthersContract,
        tellerEthersContract,
        decimals,
        ethersProvider,
        isBoringV1ContextReady,
        lensEthersContract,
        outputTokenContract,
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

          const temp = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          };
          setWithdrawStatus(temp);
          return temp;
        }
        console.log("Beginning delay withdraw ...");

        const temp = {
          initiated: true,
          loading: true,
        };
        setWithdrawStatus(temp);

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
            const tempApproving = {
              initiated: true,
              loading: true,
            };
            setWithdrawStatus(tempApproving);
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
              const tempError = {
                initiated: false,
                loading: false,
                success: false,
                error: "Token approval reverted",
              };
              setWithdrawStatus(tempError);
              return tempError;
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
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw reverted",
            };
            setWithdrawStatus(tempError);
            return tempError;
          }
          console.log("Withdraw Request hash: ", withdrawReceipt.hash);

          // Set status
          const tempSuccess = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: withdrawReceipt.hash,
          };
          setWithdrawStatus(tempSuccess);
          return tempSuccess;
        } catch (error: any) {
          console.error("Error withdrawing", error);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }
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

          const temp = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          };
          setWithdrawStatus(temp);
          return temp;
        }

        console.log("Cancelling delay withdraw ...");
        const delayWithdrawContractWithSigner = new Contract(
          delayWithdrawContract!,
          BoringDelayWithdrawContractABI,
          signer
        );

        const temp = {
          initiated: true,
          loading: true,
        };
        setWithdrawStatus(temp);

        try {
          const cancelTx = await delayWithdrawContractWithSigner.cancelWithdraw(
            tokenOut.address
          );

          // Wait for confirmation
          const cancelReceipt: ContractTransactionReceipt = await cancelTx.wait();

          console.log("Withdraw Cancelled in tx: ", cancelReceipt);
          if (!cancelReceipt.hash) {
            console.error("Withdraw Cancel failed");
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Cancel reverted",
            };
            setWithdrawStatus(tempError);
            return tempError;
          }
          console.log("Withdraw Cancel hash: ", cancelReceipt.hash);

          // Set status
          const tempSuccess = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: cancelReceipt.hash,
          };
          setWithdrawStatus(tempSuccess);
          return tempSuccess;
        } catch (error: any) {
          console.error("Error cancelling withdraw", error);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }
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

          const temp = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          };
          setWithdrawStatus(temp);
          return temp;
        }

        try {
          const delayWithdrawContractWithSigner = new Contract(
            delayWithdrawContract!,
            BoringDelayWithdrawContractABI,
            signer
          );

          console.log("Completing delay withdraw ...");

          const temp = {
            initiated: true,
            loading: true,
          };
          setWithdrawStatus(temp);

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
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Complete reverted",
            };
            setWithdrawStatus(tempError);
            return tempError;
          }

          console.log("Withdraw Complete hash: ", completeReceipt.hash);

          // Set status
          const tempSuccess = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: completeReceipt.hash,
          };
          setWithdrawStatus(tempSuccess);
          return tempSuccess;
        } catch (error: any) {
          console.error("Error completing withdraw", error);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }
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

          const temp = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          };
          setWithdrawStatus(temp);
          return temp;
        }

        console.log("Queueing withdraw ...");
        const withdrawQueueContractWithSigner = new Contract(
          withdrawQueueContract!,
          BoringWithdrawQueueContractABI,
          signer
        );

        const temp = {
          initiated: true,
          loading: true,
        };
        setWithdrawStatus(temp);

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
            const tempApproving = {
              initiated: true,
              loading: true,
            };
            setWithdrawStatus(tempApproving);
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
              const tempError = {
                initiated: false,
                loading: false,
                success: false,
                error: "Token approval reverted",
              };
              setWithdrawStatus(tempError);
              return tempError;
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
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Queue reverted",
            };
            setWithdrawStatus(tempError);
            return tempError;
          }
          console.log("Withdraw Queue hash: ", queueReceipt.hash);

          // Set status
          const tempSuccess = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: queueReceipt.hash,
          };
          setWithdrawStatus(tempSuccess);
          return tempSuccess;
        } catch (error: any) {
          console.error("Error queueing withdraw", error);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }
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

          const temp = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          };
          setWithdrawStatus(temp);
          return temp;
        }

        console.log("Cancelling withdraw queue ...");
        const withdrawQueueContractWithSigner = new Contract(
          withdrawQueueContract!,
          BoringWithdrawQueueContractABI,
          signer
        );

        const temp = {
          initiated: true,
          loading: true,
        };
        setWithdrawStatus(temp);

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
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Cancel reverted",
            };
            setWithdrawStatus(tempError);
            return tempError;
          }
          console.log("Withdraw Cancel hash: ", cancelReceipt.hash);

          // Set status
          const tempSuccess = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: cancelReceipt.hash,
          };
          setWithdrawStatus(tempSuccess);
          return tempSuccess;
        } catch (error: any) {
          console.error("Error cancelling withdraw", error);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }
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

          const withdrawURL = `${SEVEN_SEAS_BASE_API_URL}/withdrawRequests/${chainName}/${vaultContract}/${await signer.getAddress()}?string_values=true`;
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
        discountPercent?: string,
        daysValid?: string
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

          const temp = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          };
          setWithdrawStatus(temp);
          return temp;
        }

        // Check if user unlock time has passed
        const userUnlockTime = await fetchUserUnlockTime(await signer.getAddress());
        console.log("User unlock time: ", userUnlockTime);
        // Compare to current time
        const currentTime = new Date().getTime() / 1000;
        console.log("Current time: ", currentTime);
        if (currentTime <= userUnlockTime) {
          console.log(`User shares are locked until ${new Date(userUnlockTime * 1000).toLocaleString()}`);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: `User shares are locked until ${new Date(userUnlockTime * 1000).toLocaleString()}`,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }

        const assetParams = await fetchBoringQueueAssetParams(token);
        console.log("Asset params: ", assetParams);

        //! Verify minimumShares is gucci
        if (Number(assetParams.minimumShares) > Number(amountHumanReadable) * 10 ** vaultDecimals) {
          console.error("Minimum shares is greater than amount to withdraw");
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: `You must withdraw at least ${assetParams.minimumShares / 10 ** vaultDecimals} shares (vault tokens)`,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }

        //! Verify minimumSecondsToDeadline
        // Use default days valid from asset params if none was set
        if (!daysValid) {
          daysValid = (BigNumber(assetParams.minimumSecondsToDeadline).dividedBy(86400)).toString();
          console.warn("No days valid set, using default minimum seconds to deadline: ", daysValid, "days");
        } else if (Number(daysValid) * 86400 < assetParams.minimumSecondsToDeadline) {
          console.error(`Minimum seconds to deadline is too low, must be ${assetParams.minimumSecondsToDeadline} seconds (${assetParams.minimumSecondsToDeadline / 86400} days).`);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: `Days valid must be at least ${assetParams.minimumSecondsToDeadline} seconds (${assetParams.minimumSecondsToDeadline / 86400} days).`,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }

        //! Verify discount
        // Use default min discount from asset params if none was set
        if (!discountPercent) {
          discountPercent = (BigNumber(assetParams.minDiscount).dividedBy(100)).toString();
          console.warn("No discount percent set, using default min discount: ", discountPercent, "%");
        }

        let formattedDiscountPercent = new BigNumber(discountPercent).multipliedBy(
          new BigNumber(100) // 1% = 100
        )

        // Disct must be a min of 1 bps
        if (formattedDiscountPercent.lt(1)) {
          // Set discount to 1 bps, and warn it was too low
          console.warn("Discount percent was too low, setting to 1 bps");
          formattedDiscountPercent = new BigNumber(1);
        }

        // Verify min and max otherwise
        if (formattedDiscountPercent.lt(assetParams.minDiscount) || formattedDiscountPercent.gt(assetParams.maxDiscount)) {
          console.error(`Discount percent must be between ${assetParams.minDiscount} and ${assetParams.maxDiscount}`);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: `Discount percent must be between ${assetParams.minDiscount / 100}% and ${assetParams.maxDiscount / 100}% (currently ${formattedDiscountPercent.toNumber() / 100}%)`,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }

        const boringQueueContractWithSigner = new Contract(
          boringQueueContract!,
          BoringQueueABI,
          signer
        );

        const temp = {
          initiated: true,
          loading: true,
        };
        setWithdrawStatus(temp);

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

          const tempSigning = {
            initiated: true,
            loading: true,
          };
          setWithdrawStatus(tempSigning);

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
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Error signing permit",
            };
            setWithdrawStatus(tempError);
            return tempError;
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
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Queue reverted",
            };
            setWithdrawStatus(tempError);
            return tempError;
          }
          console.log("Withdraw Queue hash: ", queueReceipt.hash);

          // Set status
          const tempSuccess = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: queueReceipt.hash,
          };
          setWithdrawStatus(tempSuccess);
          return tempSuccess;
        } catch (error: any) {
          console.error("Error queueing withdraw", error);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }
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

          const temp = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or user not ready",
          };
          setWithdrawStatus(temp);
          return temp;
        }

        console.log("Cancelling withdraw queue ...");
        const boringQueueContractWithSigner = new Contract(
          boringQueueContract!,
          BoringQueueABI,
          signer
        );

        const temp = {
          initiated: true,
          loading: true,
        };
        setWithdrawStatus(temp);

        try {
          // Call API for relevant metadata
          let chainName = chain.toLowerCase();
          if (chain === "mainnet") {
            chainName = "ethereum";
          }

          const userAddress = await signer.getAddress();

          const withdrawURL = `${SEVEN_SEAS_BASE_API_URL}/boringQueue/${chainName}/${vaultContract}/${userAddress}?string_values=true`;
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
          // Parse on ["Response"]["open_requests"] and ["Response"]["expired_requests"]
          const openRequests = response["Response"]["open_requests"];
          const expiredRequests = response["Response"]["expired_requests"];

          // Concatenate the requests
          const allRequests = [...openRequests, ...expiredRequests];

          // Filter the requests on the token
          const request = allRequests.find((request: any) => {
            return request["wantToken"].toLowerCase() === token.address.toLowerCase();
          });

          if (!request) {
            console.error("No request found for token", token.address);
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "No request found for token",
            };
            setWithdrawStatus(tempError);
            return tempError;
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
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Withdraw Cancel reverted",
            };
            setWithdrawStatus(tempError);
            return tempError;
          }
          console.log("Withdraw Cancel hash: ", cancelReceipt.hash);

          // Set status
          const tempSuccess = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: cancelReceipt.hash,
          };
          setWithdrawStatus(tempSuccess);
          return tempSuccess;
        } catch (error: any) {
          console.error("Error cancelling withdraw", error);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          };
          setWithdrawStatus(tempError);
          return tempError;
        }
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

          const withdrawURL = `${SEVEN_SEAS_BASE_API_URL}/boringQueue/${chainName}/${vaultContract}/${await signer.getAddress()}?string_values=true`;
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
          const expiredRequests = response["Response"]["expired_requests"];
          const allRequests = [...openRequests, ...expiredRequests];

          // Format the status object
          return allRequests.map((request: any) => {
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

    // Add the new merkleClaim method
    const merkleClaim = useCallback(
      async (
        signer: JsonRpcSigner,
        merkleData: {
          rootHashes: string[];
          tokens: string[];
          balances: string[];
          merkleProofs: string[][];
        }
      ) => {
        if (!isBoringV1ContextReady || !signer || !incentiveDistributorEthersContract) {
          console.error("Contracts or signer not ready for merkle claim");
          const temp = {
            initiated: false,
            loading: false,
            success: false,
            error: "Contracts or signer not ready",
          };
          setMerkleClaimStatus(temp);
          return temp;
        }

        console.log("Claiming merkle rewards...");
        const temp = {
          initiated: true,
          loading: true,
        };
        setMerkleClaimStatus(temp);

        try {
          const userAddress = await signer.getAddress();

          const incentiveDistributorContractWithSigner = new Contract(
            incentiveDistributorEthersContract,
            IncentiveDistributorABI,
            signer
          );

          const ensureHexPrefix = (value: string) =>
            value?.startsWith("0x") ? value : `0x${value}`;

          const rootHashes = merkleData.rootHashes.map((hash: string) => {
            const prefixedHash = ensureHexPrefix(hash);
            return prefixedHash;
          });

          const merkleProofs = merkleData.merkleProofs.map((proofArray: string[]) =>
            proofArray.map((proof: string) => ensureHexPrefix(proof))
          );

          const tx = await incentiveDistributorContractWithSigner.claim(
            userAddress,
            rootHashes,
            merkleData.tokens,
            merkleData.balances,
            merkleProofs
          );

          const receipt = await tx.wait();

          console.log("Merkle claimed in tx: ", receipt);
          if (!receipt.hash) {
            console.error("Merkle claim failed");
            const tempError = {
              initiated: false,
              loading: false,
              success: false,
              error: "Merkle claim reverted",
            };
            setMerkleClaimStatus(tempError);
            return tempError;
          }

          const tempSuccess = {
            initiated: false,
            loading: false,
            success: true,
            tx_hash: receipt.hash,
          };
          setMerkleClaimStatus(tempSuccess);
          return tempSuccess;
        } catch (error: any) {
          console.error("Error claiming merkle rewards", error);
          const tempError = {
            initiated: false,
            loading: false,
            success: false,
            error: (error as Error).message,
          };
          setMerkleClaimStatus(tempError);
          return tempError;
        }
      },
      [isBoringV1ContextReady, incentiveDistributorEthersContract]
    );

    const fetchBoringQueueAssetParams = useCallback(
      async (token: Token) => {
        if (!boringQueueEthersContract) {
          console.error("Boring queue contract not initialized");
          return Promise.reject("Boring queue contract not initialized");
        }
        const rawAssetParams = await boringQueueEthersContract.withdrawAssets(token.address);

        if (!rawAssetParams || rawAssetParams.length === 0) {
          console.error("Asset not supported for queue");
          return Promise.reject("Asset not supported for queue");
        }

        // Destructure and name the values for clarity
        const assetParams = {
          allowWithdraws: rawAssetParams[0],
          secondsToMaturity: Number(rawAssetParams[1]),
          minimumSecondsToDeadline: Number(rawAssetParams[2]),
          minDiscount: Number(rawAssetParams[3]),
          maxDiscount: Number(rawAssetParams[4]),
          minimumShares: Number(rawAssetParams[5]),
        } as BoringQueueAssetParams;

        console.log("Asset params: ", assetParams);
        return assetParams;
      },
      [boringQueueEthersContract]
    );

    // Add this new method
    const checkClaimStatuses = useCallback(
      async (
        address: string,
        rootHashes: string[],
        balances: string[]
      ): Promise<Array<{ rootHash: string; claimed: boolean; balance: string }>> => {
        if (!incentiveDistributorEthersContract) {
          throw new Error("Incentive distributor contract not initialized");
        }

        return Promise.all(
          rootHashes.map(async (rootHash: string, index: number) => ({
            rootHash,
            claimed: await incentiveDistributorEthersContract.claimed(
              ethers.zeroPadValue("0x" + rootHash.replace("0x", ""), 32),
              address
            ),
            balance: balances[index]
          }))
        );
      },
      [incentiveDistributorEthersContract]
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
          incentiveDistributorEthersContract,
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
          depositWithPermit,
          previewDeposit,
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
          fetchBoringQueueAssetParams,
          depositStatus,
          withdrawStatus,
          isBoringV1ContextReady,
          children,
          merkleClaim,
          merkleClaimStatus,
          checkClaimStatuses,
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

