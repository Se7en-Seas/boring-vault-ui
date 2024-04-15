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
import WETHABI from "../abis/tokens/WETHABI";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ConnectKitButton,
  ConnectKitProvider,
  getDefaultConfig,
} from "connectkit";
import { ethers } from "ethers";

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
  const { fetchTotalAssets, isBoringV1ContextReady, fetchUserShares, fetchShareValue, fetchUserUnlockTime } =
    useBoringVaultV1();

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
          <Text fontSize="l">{`TVL (ETH): ${assets}`}</Text>
          <Text fontSize="md">{`Share (1 unit) Value (ETH): ${shareValue}`}</Text>
          <Text fontSize="md">{`User Share Balance: ${userShares}`}</Text>
          <Text fontSize="md">{`User Share Lock Duration Remaining: ${userUnlockTime}`}</Text>
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
              vaultContract="0xc79cC44DC8A91330872D7815aE9CFB04405952ea"
              tellerContract="0xbBe07e335235b5be21d9Ef413fc52aA250a6C125"
              accountantContract="0xc6f89cc0551c944CEae872997A4060DC95622D8F"
              lensContract="0xe12Eef08bfef01579D22895CD790F32d94faA54A"
              ethersProvider={ethersInfuraProvider}
              depositTokens={[
                {
                  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                  abi: WETHABI,
                  decimals: 18,
                  image:
                    "https://logowik.com/content/uploads/images/ethereum-eth7803.logowik.com.webp",
                  displayName: "WETH",
                },
                {
                  displayName: "USDC",
                  image:
                    "https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=031",
                  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                  abi: WETHABI,
                  decimals: 6,
                },
              ]}
              baseAsset={{
                address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                abi: WETHABI,
                decimals: 18,
                image:
                  "https://logowik.com/content/uploads/images/ethereum-eth7803.logowik.com.webp",
                displayName: "WETH",
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
