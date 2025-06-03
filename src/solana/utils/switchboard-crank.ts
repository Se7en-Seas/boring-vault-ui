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
  /** Number of oracle responses to require (optional, defaults to 3) */
  numResponses?: number;
  /** Gateway URL (optional, defaults to Switchboard's mainnet gateway) */
  gateway?: string;
}

/**
 * Creates real Switchboard oracle crank instructions
 * 
 * @param config Configuration for the Switchboard crank operation
 * @returns Promise<{instructions: TransactionInstruction[], lookupTables: any[]}> - Instructions and lookup tables
 */
export async function getSwitchboardCrankInstruction(
  config: SwitchboardCrankConfig
): Promise<{instructions: TransactionInstruction[], lookupTables: any[]}> {
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
): Promise<{instructions: TransactionInstruction[], lookupTables: any[]}> {
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
    
    // Extract instructions and lookup tables from the result
    // The fetchUpdateIx returns [instructions, responses, numSuccess, luts, errors]
    let instructions: TransactionInstruction[];
    let lookupTables: any[] = [];
    
    if (Array.isArray(updateResult) && updateResult.length >= 1) {
      const [instructionsArray, responses, numSuccess, luts, errors] = updateResult;
      if (Array.isArray(instructionsArray)) {
        instructions = instructionsArray;
        lookupTables = luts || [];
        console.log(`✓ Extracted ${instructions.length} instructions from fetchUpdateIx result`);
        console.log(`Responses: ${responses ? responses.length : 'none'}, Success: ${numSuccess}, LUTs: ${lookupTables.length}`);
      } else {
        throw new Error(`Expected instructions array as first element, got: ${typeof instructionsArray}`);
      }
    } else if (updateResult && updateResult.pullIx) {
      // Fallback: maybe it returns an object with pullIx property
      instructions = Array.isArray(updateResult.pullIx) ? updateResult.pullIx : [updateResult.pullIx];
      lookupTables = updateResult.luts || [];
    } else {
      throw new Error(`Unexpected update result format: ${JSON.stringify(updateResult)}`);
    }
    
    console.log(`✓ Generated ${instructions.length} real Switchboard update instructions`);
    return {
      instructions,
      lookupTables,
    };
    
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
 * @returns Promise<{instructions: TransactionInstruction[], lookupTables: any[]}> - Array of all instructions and lookup tables
 */
export async function bundleSwitchboardCrank(
  config: SwitchboardCrankConfig,
  otherInstructions: TransactionInstruction[]
): Promise<{instructions: TransactionInstruction[], lookupTables: any[]}> {
  const { instructions: crankInstructions, lookupTables } = await getSwitchboardCrankInstruction(config);
  
  // Bundle the crank instructions at the beginning to ensure fresh price data
  console.log(`Bundling ${crankInstructions.length} Switchboard instructions with ${otherInstructions.length} other instructions`);
  return {
    instructions: [...crankInstructions, ...otherInstructions],
    lookupTables
  };
} 