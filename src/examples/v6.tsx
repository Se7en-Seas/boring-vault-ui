// src/examples/v5.tsx
import React, { useEffect } from "react";
import {
  ChakraProvider,
  extendTheme,
  Box,
  VStack,
  HStack,
  Text,
} from "@chakra-ui/react";
import DepositWithReferralButton from "../components/v1/DepositWithReferralButton";
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
import InstantWithdrawButton from "../components/v1/InstantWithdrawButton";

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
    appName: "Boring Vault Deposit Referral/Instant Withdraw Example",

    // Optional App Info
    appDescription: "Example app showcasing Deposit Referral/Instant Withdraw with USD Vault",
    appUrl: "http://localhost:9000", // your app's url
    appIcon: "https://family.co/logo.png", // your app's logo,no bigger than 1024x1024px (max. 1MB)
  })
);
const ethersInfuraProvider = new ethers.InfuraProvider(
  "mainnet",
  process.env.INFURA_API_KEY
);

console.warn(process.env.WALLETCONNECT_PROJECT_ID);

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
  const [userShares, setUserShares] = React.useState<number>(0);
  const [shareValue, setShareValue] = React.useState<number>(0);
  
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
    if (!isBoringV1ContextReady || !signer) return;
    
    const fetchData = async () => {
      try {
        const signerAddress = await signer.getAddress();
        const [totalAssets, userSharesResult, shareValueResult] = await Promise.all([
          fetchTotalAssets(),
          fetchUserShares(signerAddress),
          fetchShareValue()
        ]);
        
        setAssets(totalAssets);
        setUserShares(userSharesResult);
        setShareValue(shareValueResult);
        
        console.log("Total assets: ", totalAssets);
        console.log("User shares: ", userSharesResult);
        console.log("Share value: ", shareValueResult);
      } catch (error) {
        console.error("Error fetching vault data:", error);
      }
    };
    
    fetchData();
  }, [isBoringV1ContextReady, signer]);

  return (
    <VStack spacing={8} align="center" justify="center" minH="100vh" p={8}>
      <Text fontSize="3xl" fontWeight="bold" color="blue.500">
        USD Vault - Deposit Referral/Instant Withdraw Demo
      </Text>
      
      <ConnectKitButton />
      
      {/* Vault Stats */}
      <VStack spacing={4} align="center">
        <Text fontSize="xl" fontWeight="semibold">
          Vault Statistics
        </Text>
        <HStack spacing={8}>
          <Text>Total Assets: ${assets.toFixed(2)}</Text>
          <Text>Your Shares: {userShares.toFixed(6)}</Text>
          <Text>Share Value: ${shareValue.toFixed(4)}</Text>
        </HStack>
      </VStack>

      {/* Action Buttons */}
      <VStack spacing={6} align="center">
        <Text fontSize="xl" fontWeight="semibold">
          Vault Actions
        </Text>
        
        {/* Standard Deposit */}
        <DepositWithReferralButton
          buttonText="Deposit with Referral"
          popupText="Deposit assets into the USD Vault"
          title="Deposit Assets"
          bottomText="Standard deposit - shares will remain on current chain"
          buttonProps={{
            colorScheme: "blue",
            size: "lg",
            width: "200px"
          }}
        />

        <InstantWithdrawButton
          buttonText="Instant Withdraw"
          popupText="Withdraw assets from the USD Vault"
          title="Instant Withdraw"
          bottomText="Instant withdraw - shares will be withdrawn immediately"
          buttonProps={{
            colorScheme: "blue",
            size: "lg",
            width: "200px"
          }}
        />
      </VStack>

      {/* Info Section */}
      <Box maxW="600px" textAlign="center">
        <Text fontSize="md" color="gray.600">
          This example demonstrates Deposit Referral/Instant Withdraw capabilities with the USD Vault.
        </Text>
      </Box>
    </VStack>
  );
};

const App = () => {
  // USD Vault Configuration
  const USD_VAULT_ADDRESS = "0x71b9601d96B7e43C434d07D4AE1Aa26650920aA7"; 
  
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          <ChakraProvider theme={theme}>
            <BoringVaultV1Provider
              chain="mainnet"
              vaultContract={USD_VAULT_ADDRESS}
              tellerContract="0x8b2a2E239E6ee763990A7C587c451f93135858e9"
              accountantContract="0x33c347C1fce477356Aa5118461De617894415FfB"
              lensContract="0xA2c83e64990C6C53b76390678436d63d006534fB"
              isTellerReferralEnabled={true}
              ethersProvider={ethersInfuraProvider}
              depositTokens={[
                {
                  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 
                  decimals: 6,
                  displayName: "USDC",
                  image: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
                },
              ]}
              withdrawTokens={[
                {
                  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
                  decimals: 6,
                  displayName: "USDC",
                  image: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
                },
              ]}
              baseAsset={{
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC as base
                decimals: 6,
                displayName: "USDC",
                image: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
              }}
              vaultDecimals={6} // Share token decimals
            >
              <VaultWidget />
            </BoringVaultV1Provider>
          </ChakraProvider>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

// Render the app
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}