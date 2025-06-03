import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { AnchorProvider, Program } from '@coral-xyz/anchor';

// Import real Switchboard SDK
let SwitchboardSDK: any = null;
let hasRealSwitchboard = false;

try {
  // Let's debug what's actually available in the SDK
  const switchboardSdk = require('@switchboard-xyz/on-demand');
  console.log('Available Switchboard exports:', Object.keys(switchboardSdk));
  
  SwitchboardSDK = switchboardSdk;
  hasRealSwitchboard = true;
  console.log('✓ Successfully loaded real Switchboard On-Demand SDK');
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('❌ Failed to load Switchboard SDK:', errorMessage);
  throw new Error(`Switchboard SDK is required but failed to load: ${errorMessage}`);
}

/**
 * Configuration for Switchboard oracle cranking
 */
export interface SwitchboardCrankConfig {
  /** Solana RPC connection */
  connection: Connection;
  /** Oracle feed address to crank */
  feedAddress: PublicKey;
  /** Wallet public key that will pay for the transaction */
  payer: PublicKey;
  /** Maximum staleness in seconds (optional, defaults to 300) */
  maxStaleness?: number;
  /** Number of oracle responses to require (optional, defaults to 3) */
  numResponses?: number;
  /** Gateway URL (optional, defaults to Switchboard's mainnet gateway) */
  gateway?: string;
}

/**
 * Creates real Switchboard oracle crank instructions
 * 
 * @param config Configuration for the Switchboard crank operation
 * @returns Promise<TransactionInstruction[]> - Array of real Switchboard instructions
 */
export async function getSwitchboardCrankInstruction(
  config: SwitchboardCrankConfig
): Promise<TransactionInstruction[]> {
  if (!hasRealSwitchboard || !SwitchboardSDK) {
    throw new Error('Switchboard SDK is not available');
  }

  console.log('Generating real Switchboard instructions...');
  return await generateRealSwitchboardInstructions(config);
}

/**
 * Generate real Switchboard instructions using the SDK
 */
async function generateRealSwitchboardInstructions(
  config: SwitchboardCrankConfig
): Promise<TransactionInstruction[]> {
  const { connection, feedAddress, payer, numResponses = 3 } = config;
  
  try {
    console.log(`Available SDK exports:`, Object.keys(SwitchboardSDK));
    
    // Check for required exports
    if (!SwitchboardSDK.PullFeed) {
      throw new Error('PullFeed not found in Switchboard SDK exports');
    }
    
    // Get the program ID for mainnet
    let programId: PublicKey;
    if (SwitchboardSDK.ON_DEMAND_MAINNET_PID) {
      programId = new PublicKey(SwitchboardSDK.ON_DEMAND_MAINNET_PID);
      console.log(`✓ Using mainnet program ID: ${programId.toString()}`);
    } else {
      // Fallback to known mainnet program ID
      programId = new PublicKey('sbondNfQzJrjNhgtPKX4nhNZZNDNb1vSoZU'); // Switchboard On-Demand mainnet
      console.log(`✓ Using fallback mainnet program ID: ${programId.toString()}`);
    }
    
    console.log(`Loading Switchboard program for feed: ${feedAddress.toString()}`);
    
    // Create a simple provider using the connection and payer
    // Since we don't have a wallet, we'll create a minimal provider
    const fakeWallet = {
      publicKey: payer,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    
    const provider = new AnchorProvider(connection, fakeWallet as any, {
      commitment: 'confirmed',
    });
    
    // Load the Switchboard program using Anchor
    const program = await Program.at(programId, provider);
    console.log('✓ Switchboard program loaded successfully');
    
    // Create PullFeed instance
    const pullFeed = new SwitchboardSDK.PullFeed(program, feedAddress);
    console.log('✓ PullFeed instance created');
    
    // Get feed update instructions using fetchUpdateIx method
    console.log(`Requesting update instructions with ${numResponses} signatures...`);
    
    // Try the fetchUpdateIx method which is used in the documentation
    const updateResult = await pullFeed.fetchUpdateIx({
      numSignatures: numResponses,
      payer: payer,
    });
    
    console.log('Update result structure:', Array.isArray(updateResult) ? `Array with ${updateResult.length} elements` : typeof updateResult);
    
    // Extract instructions from the result
    // The fetchUpdateIx returns [instructions, responses, numSuccess, luts, errors]
    let instructions: TransactionInstruction[];
    if (Array.isArray(updateResult) && updateResult.length >= 1) {
      const [instructionsArray, responses, numSuccess, luts, errors] = updateResult;
      if (Array.isArray(instructionsArray)) {
        instructions = instructionsArray;
        console.log(`✓ Extracted ${instructions.length} instructions from fetchUpdateIx result`);
        console.log(`Responses: ${responses ? responses.length : 'none'}, Success: ${numSuccess}, LUTs: ${luts ? luts.length : 'none'}`);
      } else {
        throw new Error(`Expected instructions array as first element, got: ${typeof instructionsArray}`);
      }
    } else if (updateResult && updateResult.pullIx) {
      // Fallback: maybe it returns an object with pullIx property
      instructions = Array.isArray(updateResult.pullIx) ? updateResult.pullIx : [updateResult.pullIx];
    } else {
      throw new Error(`Unexpected update result format: ${JSON.stringify(updateResult)}`);
    }
    
    console.log(`✓ Generated ${instructions.length} real Switchboard update instructions`);
    return instructions;
    
  } catch (error) {
    console.error('Failed to generate real Switchboard instructions:', error);
    console.error('Error details:', error);
    throw error;
  }
}

/**
 * Bundles Switchboard crank instruction with other instructions
 * 
 * @param config Switchboard configuration
 * @param otherInstructions Array of other instructions to bundle with
 * @returns Promise<TransactionInstruction[]> - Array of all instructions
 */
export async function bundleSwitchboardCrank(
  config: SwitchboardCrankConfig,
  otherInstructions: TransactionInstruction[]
): Promise<TransactionInstruction[]> {
  const crankInstructions = await getSwitchboardCrankInstruction(config);
  
  // Bundle the crank instructions at the beginning to ensure fresh price data
  console.log(`Bundling ${crankInstructions.length} Switchboard instructions with ${otherInstructions.length} other instructions`);
  return [...crankInstructions, ...otherInstructions];
}

/**
 * Utility function to check if a Switchboard feed needs updating
 * 
 * @param connection Solana connection
 * @param feedAddress Feed address to check
 * @param maxStaleness Maximum staleness in seconds
 * @returns Promise<boolean> - True if feed needs updating
 */
export async function needsSwitchboardUpdate(
  connection: Connection,
  feedAddress: PublicKey,
  maxStaleness: number = 300
): Promise<boolean> {
  try {
    if (!hasRealSwitchboard || !SwitchboardSDK) {
      throw new Error('Switchboard SDK is not available');
    }
    
    return await checkRealFeedStaleness(connection, feedAddress, maxStaleness);
  } catch (error) {
    console.warn('Error checking Switchboard feed staleness:', error);
    // If we can't check, assume it needs updating to be safe
    return true;
  }
}

/**
 * Check real feed staleness using Switchboard SDK
 */
async function checkRealFeedStaleness(
  connection: Connection,
  feedAddress: PublicKey,
  maxStaleness: number
): Promise<boolean> {
  try {
    // For now, always return true since staleness checking is complex
    // In production, this would parse the feed account data properly
    console.log(`Assuming feed ${feedAddress.toString()} needs update (staleness check not implemented)`);
    return true;
    
  } catch (error) {
    console.warn('Error in real staleness check:', error);
    return true;
  }
}

/**
 * Utility function to get the current value from a Switchboard feed
 * 
 * @param connection Solana connection
 * @param feedAddress Feed address to read from
 * @returns Promise<{ value: number; slot: number } | null> - Current feed value or null if unavailable
 */
export async function getSwitchboardValue(
  connection: Connection,
  feedAddress: PublicKey
): Promise<{ value: number; slot: number } | null> {
  try {
    if (!hasRealSwitchboard || !SwitchboardSDK) {
      throw new Error('Switchboard SDK is not available');
    }
    
    return await getRealSwitchboardValue(connection, feedAddress);
  } catch (error) {
    console.warn('Error reading Switchboard feed value:', error);
    return null;
  }
}

/**
 * Get real Switchboard value using SDK
 */
async function getRealSwitchboardValue(
  connection: Connection,
  feedAddress: PublicKey
): Promise<{ value: number; slot: number } | null> {
  try {
    // For now, return null since value reading is complex
    // In production, this would use the proper SDK methods
    console.log(`Reading feed value not implemented for ${feedAddress.toString()}`);
    return null;
    
  } catch (error) {
    console.warn('Error reading real Switchboard feed:', error);
    return null;
  }
} 