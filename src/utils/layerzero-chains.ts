import { EndpointId } from "@layerzerolabs/lz-definitions";

// Helper function to encode destination chain as bridgeWildCard bytes
export function encodeBridgeWildCard(chainId: number): string {
  // Encode as uint32 - just the value, no padding to 32 bytes
  // Use encode(['uint32'], [destination_wildcard])
  // which creates a 32-byte encoding with the uint32 at the beginning
  const hex = chainId.toString(16).padStart(8, '0');
  return `0x${hex.padStart(64, '0')}`;
}

// Get chain display name from endpoint ID
export function getChainDisplayName(endpointId: number): string {
  // Find the chain name from the EndpointId enum
  const entry = Object.entries(EndpointId).find(([_, value]) => value === endpointId);
  if (!entry) return `Chain ${endpointId}`;
  
  // Clean up the name (remove V2_MAINNET suffix and format)
  const name = entry[0]
    .replace(/_V2_MAINNET$/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
  
  return name;
}

// Export the EndpointId directly so users can access all chains
export { EndpointId } from "@layerzerolabs/lz-definitions";

// For backward compatibility, export commonly used chains
export const CommonChains = {
  ETHEREUM: EndpointId.ETHEREUM_V2_MAINNET,
  ARBITRUM: EndpointId.ARBITRUM_V2_MAINNET,
  OPTIMISM: EndpointId.OPTIMISM_V2_MAINNET,
  BASE: EndpointId.BASE_V2_MAINNET,
  LINEA: EndpointId.ZKCONSENSYS_V2_MAINNET,
  SCROLL: EndpointId.SCROLL_V2_MAINNET,
  CORN: EndpointId.MP1_V2_MAINNET,
  SONIC: EndpointId.SONIC_V2_MAINNET,
  SWELL: EndpointId.SWELL_V2_MAINNET,
  BERACHAIN: EndpointId.BERA_V2_MAINNET,
  BOB: EndpointId.BOB_V2_MAINNET,
  FLARE: EndpointId.FLARE_V2_MAINNET,
  PLUME: EndpointId.PLUMEPHOENIX_V2_MAINNET,
  UNICHAIN: EndpointId.UNICHAIN_V2_MAINNET,
  TAC: EndpointId.TAC_V2_MAINNET,
} as const;

export type CommonChainName = keyof typeof CommonChains;