// src/examples/v3.tsx
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
          <Text fontSize="l">{`TVL (ETH): ${assets}`}</Text>
          <Text fontSize="md">{`Share (1 unit) Value (ETH): ${shareValue}`}</Text>
          <Text fontSize="md">{`User Share Balance: ${userShares}`}</Text>
          <Text fontSize="md">{`User Share Unlock Unix seconds timestamp: ${userUnlockTime}`}</Text>
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
            <BoringQueueButton
              title="Example Vault"
              bottomText="
                  Once you request a withdraw a solver will need to process your request. This can take some time depending on the current queue length and the gas price you are willing to pay. You can check the status of your withdraw request below.
                "
              buttonText="Withdraw"
              popupText="Welcome to the delay withdraw interface!"
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
          <PendingBoringQueueStatuses title="Pending Withdraws" />
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
              vaultContract="0x84Fd06FaA5a6B6b2386d84e42152d1A1147De558"
              tellerContract="0x87A8cc52505142Ec289C5Ce28D665fC6F8c5d857"
              accountantContract="0x175DfFe76295A11C7d4f32Ce0589a6c630ee49b1"
              lensContract="0x73EF093847094114D59871c5929Bb0735FCf2429"
              boringQueueContract="0x3CD067A9B958D36613bE176a02929973B6890eB7"
              ethersProvider={ethersInfuraProvider}
              depositTokens={[
                {
                  displayName: "WETH",
                  image:
                    "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=032",
                  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                  decimals: 18,
                },
              ]}
              withdrawTokens={[
                {
                  displayName: "WETH",
                  image:
                    "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=032",
                  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                  decimals: 18,
                },
              ]}
              baseAsset={{
                displayName: "WETH",
                image:
                  "https://cryptologos.cc/logos/ethereum-eth-logo.png?v=032",
                address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
                decimals: 18,
              }}
              vaultDecimals={18}
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
