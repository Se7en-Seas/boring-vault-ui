import { AnchorProvider, Program, web3 } from '@coral-xyz/anchor';
import { PullFeed, ON_DEMAND_MAINNET_PID } from '@switchboard-xyz/on-demand';

/**
 * Configuration for Switchboard oracle cranking
 */
export interface SwitchboardCrankConfig {
  /** Solana RPC connection */
  connection: web3.Connection;
  /** Oracle feed address to crank */
  feedAddress: web3.PublicKey;
  /** Wallet public key that will pay for the transaction */
  payer: web3.PublicKey;
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
): Promise<{instructions: web3.TransactionInstruction[], lookupTables: any[]}> {

  const { connection, feedAddress, payer, numResponses = 3 } = config;
  
  try {
    // Get the program ID for mainnet
    let programId: web3.PublicKey;
    programId = new web3.PublicKey(ON_DEMAND_MAINNET_PID);
    console.log(`✓ Using mainnet program ID: ${programId.toString()}`);

    console.log(`Loading Switchboard program for feed: ${feedAddress.toString()}`);
    
    // Minimal read-only wallet Anchor can use as the payer
    const payerWallet = {
      publicKey: payer,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    
    const provider = new AnchorProvider(connection, payerWallet as any, {
      commitment: 'confirmed',
    });
    
    // Load the Switchboard program using Anchor
    const program = await Program.at(programId, provider);
    console.log('✓ Switchboard program loaded successfully');
    
    // Create PullFeed instance
    const pullFeed = new PullFeed(program, feedAddress);
    console.log('✓ PullFeed instance created');
    
    // Build options for the current SDK (does not accept `payer`)
    const fetchOpts: Parameters<typeof pullFeed.fetchUpdateIx>[0] = {
      numSignatures: numResponses,
    } as any;
    if (config.gateway) (fetchOpts as any).gateway = config.gateway;

    const updateResult = await pullFeed.fetchUpdateIx(fetchOpts);
    
    console.log('Update result structure:', Array.isArray(updateResult) ? `Array with ${updateResult.length} elements` : typeof updateResult);
    
    // Extract instructions and lookup tables from the result
    // The fetchUpdateIx returns [instructions, responses, numSuccess, luts, errors]
    let instructions: web3.TransactionInstruction[];
    let lookupTables: any[];
    
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
  otherInstructions: web3.TransactionInstruction[]
): Promise<{instructions: web3.TransactionInstruction[], lookupTables: any[]}> {
  const { instructions: crankInstructions, lookupTables } = await getSwitchboardCrankInstruction(config);
  
  // Bundle the crank instructions at the beginning to ensure fresh price data
  console.log(`Bundling ${crankInstructions.length} Switchboard instructions with ${otherInstructions.length} other instructions`);
  return {
    instructions: [...crankInstructions, ...otherInstructions],
    lookupTables
  };
} 