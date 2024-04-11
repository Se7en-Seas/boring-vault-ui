// src/examples/v1.tsx
import React from "react";
import { ChakraProvider, extendTheme, Box } from "@chakra-ui/react";
import DepositButton from "../components/v1/DepositButton";
import { createRoot } from "react-dom/client";
import { BoringVaultV1Provider } from "../contexts/v1/BoringVaultContextV1";
import WETHABI from "../abis/tokens/wethABI";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitButton, ConnectKitProvider, getDefaultConfig } from "connectkit";

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

const App = () => (
  <ChakraProvider theme={theme}>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          <ConnectKitButton />
          <BoringVaultV1Provider
            vaultContract="0xc79cC44DC8A91330872D7815aE9CFB04405952ea"
            tellerContract="0xbBe07e335235b5be21d9Ef413fc52aA250a6C125"
            accountantContract="0xc6f89cc0551c944CEae872997A4060DC95622D8F"
            depositTokens={[
              {
                address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                abi: WETHABI,
                decimals: 18,
                image:
                  "https://logowik.com/content/uploads/images/ethereum-eth7803.logowik.com.webp",
                displayName: "WETH",
              },
            ]}
          >
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              height="100vh"
              bg="gray.100"
            >
              <DepositButton
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
            </Box>
          </BoringVaultV1Provider>
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </ChakraProvider>
);

const element = document.getElementById("root");
const root = createRoot(element!);
root.render(<App />);
