// src/examples/v1.tsx
import React, { useEffect } from "react";
import {
  ChakraProvider,
  extendTheme,
  Box,
  VStack,
  Text,
} from "@chakra-ui/react";
import DepositButton from "../components/v1/DepositButton";
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
import PendingWithdrawQueueStatuses from "../components/v1/PendingWithdrawQueueStatuses";
import WithdrawQueueButton from "../components/v1/WithdrawQueueButton";

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
    appName: "Boring Vault Example App",

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
    if (!isBoringV1ContextReady) return;
    fetchUserShares().then((shares) => {
      console.log("User shares: ", shares);
      setUserShares(shares);
    });
  }, [isBoringV1ContextReady]);

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
    if (!isBoringV1ContextReady) return;
    fetchUserUnlockTime().then((time) => {
      console.log("User Unlock time: ", time);
      setUserUnlockTime(time);
    });
  }, [isBoringV1ContextReady]);

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
          <Text fontSize="l">{`TVL (USD): ${assets}`}</Text>
          <Text fontSize="md">{`Share (1 unit) Value (USD): ${shareValue}`}</Text>
          <Text fontSize="md">{`User Share Balance: ${userShares}`}</Text>
          <Text fontSize="md">{`User Share Unlock Unix seconds timestamp: ${userUnlockTime}`}</Text>
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
          <WithdrawQueueButton
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
          <PendingWithdrawQueueStatuses title="Pending Withdraw Queue Statuses" />
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
              chain="ethereum"
              vaultContract="0x08c6F91e2B681FaF5e17227F2a44C307b3C1364C"
              tellerContract="0x221Ea02d409074546265CCD1123050F4D498ef64"
              accountantContract="0xc315D6e14DDCDC7407784e2Caf815d131Bc1D3E7"
              lensContract="0x5232bc0F5999f8dA604c42E1748A13a170F94A1B"
              withdrawQueueContract="0xD45884B592E316eB816199615A95C182F75dea07"
              ethersProvider={ethersInfuraProvider}
              depositTokens={[
                {
                  displayName: "USDC",
                  image:
                    "https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=031",
                  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                  decimals: 6,
                },
              ]}
              withdrawTokens={[
                {
                  displayName: "USDC",
                  image:
                    "https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=031",
                  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                  decimals: 6,
                },
                {
                  displayName: "USDe",
                  image:
                    "https://s2.coinmarketcap.com/static/img/coins/64x64/29470.png",
                  address: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
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
