// src/examples/v2.tsx
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
import PendingDelayedWithdraws from "../components/v1/PendingDelayedWithdraws";
import DelayWithdrawButton from "../components/v1/DelayWithdrawButton";
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
    appName: "Boring Vault Alt Token Example App with Direct Withdraws",

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
            <DelayWithdrawButton
              title="Example Vault"
              bottomText="
                  Once you request a withdraw you will be able to claim your shares after some time, please come back to check on the status of your withdraw and claim your funds when ready.
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
          <PendingDelayedWithdraws title="Pending Delay Withdraws" />
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
              outputTokenContract="0xE6829d9a7eE3040e1276Fa75293Bde931859e8fA"
              vaultContract="0x33272D40b247c4cd9C646582C9bbAD44e85D4fE4"
              tellerContract="0xB6f7D38e3EAbB8f69210AFc2212fe82e0f1912b0"
              accountantContract="0x6049Bd892F14669a4466e46981ecEd75D610a2eC"
              lensContract="0x5232bc0F5999f8dA604c42E1748A13a170F94A1B"
              delayWithdrawContract="0x12Be34bE067Ebd201f6eAf78a861D90b2a66B113"
              ethersProvider={ethersInfuraProvider}
              depositTokens={[
                {
                  displayName: "mETH",
                  image:
                    "https://cryptologos.cc/logos/mantle-mnt-logo.png?v=035",
                  address: "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa",
                  decimals: 18,
                },
              ]}
              withdrawTokens={[
                {
                  displayName: "mETH",
                  image:
                    "https://cryptologos.cc/logos/mantle-mnt-logo.png?v=035",
                  address: "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa",
                  decimals: 18,
                },
              ]}
              baseAsset={{
                displayName: "mETH",
                image:
                  "https://cryptologos.cc/logos/mantle-mnt-logo.png?v=035",
                address: "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa",
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
