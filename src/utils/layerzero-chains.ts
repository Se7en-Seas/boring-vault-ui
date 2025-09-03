// LayerZero Chain ID mappings
// Based on LayerZero V2 endpoint IDs
export const LAYERZERO_CHAIN_IDS = {
  ethereum: 30101,
  arbitrum: 30110,
  optimism: 30111,
  base: 30184,
  linea: 30183,
  scroll: 30214,
  corn: 30331,
  sonic: 30332,
  swell: 30335,
  berachain: 30362,
  bob: 30279,
  flare: 30295,
  plume: 30370,
  unichain: 30320,
  tac: 30377,
} as const;

export type LayerZeroChain = keyof typeof LAYERZERO_CHAIN_IDS;

// Helper function to encode destination chain as bridgeWildCard bytes
export function encodeBridgeWildCard(chain: LayerZeroChain): string {
  const chainId = LAYERZERO_CHAIN_IDS[chain];
  // Encode as uint32 - just the value, no padding to 32 bytes
  // Use encode(['uint32'], [destination_wildcard])
  // which creates a 32-byte encoding with the uint32 at the beginning
  const hex = chainId.toString(16).padStart(8, '0');
  return `0x${hex.padStart(64, '0')}`;
}

// Get chain display name
export function getChainDisplayName(chain: LayerZeroChain): string {
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}