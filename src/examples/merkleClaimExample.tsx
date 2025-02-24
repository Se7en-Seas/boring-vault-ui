// src/examples/merkleClaimExample.tsx
import React, { useEffect } from "react";
import {
  ChakraProvider,
  extendTheme,
  Box,
  VStack,
  HStack,
  Text,
} from "@chakra-ui/react";
import DepositButton from "../components/v1/DepositButton";
import BoringQueueButton from "../components/v1/BoringQueueButton";
import PendingBoringQueueStatuses from "../components/v1/BoringQueuePendingStatuses";
import { createRoot } from "react-dom/client";
import {
  BoringVaultV1Provider,
  useBoringVaultV1,
} from "../contexts/v1/BoringVaultContextV1";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ConnectKitButton,
  ConnectKitProvider,
  getDefaultConfig,
} from "connectkit";
import { ethers } from "ethers";
import { useEthersSigner } from "../hooks/ethers";
import MerkleClaimButton from "../components/v1/MerkleClaimButton";

const config = createConfig(
  getDefaultConfig({
    // Your dApps chains
    chains: [mainnet],
    transports: {
      // RPC URL for each chain
      [mainnet.id]: http(
        `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`
      ),
    },

    // Required API Keys
    // ! https://cloud.walletconnect.com/sign-in
    walletConnectProjectId: process.env.WALLETCONNECT_PROJECT_ID!,

    // Required App Info
    appName: "Boring Vault Arbitrm Example App with Direct Withdraws",

    // Optional App Info
    appDescription: "An example app for the Boring Vault V1",
    appUrl: "http://localhost:9000", // your app's url
  })
);
const ethersInfuraProvider = new ethers.InfuraProvider(
  "mainnet",
  process.env.INFURA_API_KEY
);

const queryClient = new QueryClient();

// Customize the theme to fit your branding or design needs
const theme = extendTheme({
  colors: {
    brand: {
      100: "#f7fafc",
      // ... (provide your brand colors)
    },
  },
  components: {
    Modal: {
      baseStyle: (props: any) => ({
        dialog: {
          bg: "brand.100",
        },
      }),
    },
  },
});

const VaultWidget = () => {
  const [assets, setAssets] = React.useState<number>(0);
  const {
    fetchTotalAssets,
    isBoringV1ContextReady,
    fetchUserShares,
    fetchShareValue,
    fetchUserUnlockTime,
    checkClaimStatuses,
  } = useBoringVaultV1();
  const signer = useEthersSigner();

  useEffect(() => {
    console.warn("ready: ", isBoringV1ContextReady);
    if (!isBoringV1ContextReady) return;
    fetchTotalAssets().then((assets) => {
      console.log("Total assets: ", assets);
      setAssets(assets);
    });
  }, [isBoringV1ContextReady]);

  const [userShares, setUserShares] = React.useState<number>(0);
  useEffect(() => {
    if (!isBoringV1ContextReady || !signer) return;
    const fetchShares = async () => {
      const address = await signer.getAddress();
      fetchUserShares(address)
        .then((shares) => {
          console.log("User shares: ", shares);
          setUserShares(shares);
        })
        .catch((error) => console.error("Failed to fetch user shares:", error));
    };

    fetchShares();
  }, [isBoringV1ContextReady, signer]);

  const [shareValue, setShareValue] = React.useState<number>(0);
  useEffect(() => {
    if (!isBoringV1ContextReady) return;
    fetchShareValue().then((value) => {
      console.log("Share value: ", value);
      setShareValue(value);
    });
  }, [isBoringV1ContextReady]);

  const [userUnlockTime, setUserUnlockTime] = React.useState<number>(0);
  useEffect(() => {
    if (!isBoringV1ContextReady || !signer) return;

    const fetchUnlockTime = async () => {
      const address = await signer.getAddress();
      fetchUserUnlockTime(address)
        .then((unlockTime) => {
          console.log("User unlock time: ", unlockTime);
          setUserUnlockTime(unlockTime);
        })
        .catch((error) =>
          console.error("Failed to fetch user unlock time:", error)
        );
    };

    fetchUnlockTime();
  }, [isBoringV1ContextReady, signer]);

  // Add these new state variables for merkle claims
  const [claimableAmount, setClaimableAmount] = React.useState<string | null>(null);
  const [merkleData, setMerkleData] = React.useState<any>(null);

  useEffect(() => {
    const fetchMerkleData = async () => {
      if (!signer) return;
      
      try {
        const address = await signer.getAddress();
        const response = await fetch(`https://api.sevenseas.capital/usual-bera/ethereum/merkle/${address}`);
        const data = await response.json();
        console.log("Merkle data: ", data);

        if (data.Response) {
          const totalBalance = data.Response.total_balance;
          if (totalBalance && parseFloat(totalBalance) > 0) {
            const claimStatuses = await checkClaimStatuses(
              address,
              data.Response.tx_data.rootHashes,
              data.Response.tx_data.balances
            );

            // Filter out claimed rewards
            const unclaimedData = {
              ...data.Response.tx_data,
              rootHashes: [],
              balances: [],
              merkleProofs: [],
              tokens: []
            };

            let totalUnclaimedBalance = BigInt(0);

            claimStatuses.forEach((status, index) => {
              if (!status.claimed) {
                unclaimedData.rootHashes.push(data.Response.tx_data.rootHashes[index]);
                unclaimedData.balances.push(data.Response.tx_data.balances[index]);
                unclaimedData.merkleProofs.push(data.Response.tx_data.merkleProofs[index]);
                unclaimedData.tokens.push(data.Response.tx_data.tokens[index]);
                totalUnclaimedBalance += BigInt(status.balance);
              }
            });

            if (totalUnclaimedBalance > BigInt(0)) {
              const roundedBalance = String(Number(ethers.formatUnits(totalUnclaimedBalance.toString(), 18)));
              setClaimableAmount(roundedBalance);
              setMerkleData(unclaimedData);
            } else {
              setClaimableAmount("0.00");
              setMerkleData(null);
            }
          } else {
            setClaimableAmount("0.00");
            setMerkleData(null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch Merkle data:", error);
        setClaimableAmount("0.00");
        setMerkleData(null);
      }
    };

    fetchMerkleData();
  }, [signer, checkClaimStatuses]);

  return (
    <>
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height="100vh"
        bg="gray.100"
      >
        <VStack>
          <Text fontSize="xl" fontWeight={"bold"}>
            Boring Vault Example
          </Text>
          <Text fontSize="l">{`TVL (USDC): ${assets}`}</Text>
          <Text fontSize="md">{`Share (1 unit) Value (USDC): ${shareValue}`}</Text>
          <Text fontSize="md">{`User Share Balance: ${userShares}`}</Text>
          <Text fontSize="md">{`User Share Unlock Unix seconds timestamp: ${userUnlockTime}`}</Text>
          
          {/* Add this new section for merkle claims */}
          <VStack spacing={2} paddingBottom={"2em"}>
            <Text fontSize="md" fontWeight="bold">
              {claimableAmount && claimableAmount !== "0.00"
                ? `Claimable Rewards: ${claimableAmount} USUAL`
                : "No rewards to claim"}
            </Text>
            <MerkleClaimButton
              buttonText={claimableAmount && claimableAmount !== "0.00" 
                ? `Claim ${claimableAmount} USUAL` 
                : "Nothing to Claim"}
              popupText="Claim your USUAL rewards"
              title="Claim Rewards"
              bottomText="Claiming will transfer your USUAL rewards to your wallet"
              merkleData={merkleData}
              claimAmount={claimableAmount || "0.00"}
              claimToken={{
                displayName: "USUAL",
                image:
                  "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=032",
                address: "0x35d8949372d46b7a3d5a56006ae77b215fc69bc0",
                decimals: 18,
              }}
              buttonProps={{
                colorScheme: "teal",
                size: "lg",
                shadow: "md",
                isDisabled: !claimableAmount || claimableAmount === "0.00",
                _hover: {
                  bg: "teal.600",
                },
              }}
              modalOverlayProps={{
                bg: "blackAlpha.300",
              }}
              modalContentProps={{
                mx: 4,
                rounded: "lg",
                shadow: "xl",
              }}
              modalBodyProps={{
                p: 6,
              }}
              modalCloseButtonProps={{
                size: "lg",
                _focus: {
                  boxShadow: "none",
                },
              }}
            />
          </VStack>

          <HStack spacing="2" paddingBottom={"2em"}>
            <DepositButton
              title="Example Vault"
              bottomText="
                  All vaults contain smart contract risk and various degrees of economic risk. This includes, but is not limited to, liquidity provisioning which can result in impermanent loss and use of leverage, meaning there is liquidation risk
                "
              buttonText="Deposit Funds"
              popupText="Welcome to the deposit interface!"
              buttonProps={{
                colorScheme: "teal",
                size: "lg",
                shadow: "md",
                _hover: {
                  bg: "teal.600",
                },
              }}
              modalOverlayProps={{
                bg: "blackAlpha.300",
              }}
              modalContentProps={{
                mx: 4,
                rounded: "lg",
                shadow: "xl",
              }}
              modalBodyProps={{
                p: 6,
              }}
              modalCloseButtonProps={{
                size: "lg",
                _focus: {
                  boxShadow: "none",
                },
              }}
            />
          </HStack>
        </VStack>
      </Box>
    </>
  );
};

const App = () => {
  return (
    <ChakraProvider theme={theme}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ConnectKitProvider>
            <ConnectKitButton />
            <BoringVaultV1Provider
              chain="mainnet"
              vaultContract="0x165c62448015d96c920dDA001Ae27733AF2C36c7"
              tellerContract="0x16454063CA71085e0EF2622CA30d7c371441d1C8"
              accountantContract="0x2E0e8cF5FE97423f6929403246eBa88de4b2811D"
              lensContract="0x5232bc0F5999f8dA604c42E1748A13a170F94A1B"
              incentiveDistributorContract="0x4a610757352d63d45b0a1680e95158887955582c"
              ethersProvider={ethersInfuraProvider}
              depositTokens={[
                {
                  displayName: "USD0++",
                  image:
                    "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=032",
                  address: "0x35d8949372d46b7a3d5a56006ae77b215fc69bc0",
                  decimals: 18,
                },
              ]}
              withdrawTokens={[
                {
                  displayName: "USD0++",
                  image:
                    "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=032",
                  address: "0x35d8949372d46b7a3d5a56006ae77b215fc69bc0",
                  decimals: 18,
                },
              ]}
              baseAsset={{
                displayName: "USDC",
                image:
                  "https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=031",
                address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                decimals: 6,
              }}
              vaultDecimals={6}
            >
              <VaultWidget />
            </BoringVaultV1Provider>
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ChakraProvider>
  );
};

const element = document.getElementById("root");
const root = createRoot(element!);
root.render(<App />);
