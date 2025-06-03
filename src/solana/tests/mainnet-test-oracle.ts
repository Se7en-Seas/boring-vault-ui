import { web3 } from '@coral-xyz/anchor';
import * as fs from 'fs';

// Import shared utilities
import { 
  MAINNET_CONFIG, 
  loadKeypair,
  createConnection,
} from './mainnet-test-utils';

// Import Switchboard utilities
import {
  getSwitchboardCrankInstruction,
  type SwitchboardCrankConfig
} from '../utils/switchboard-crank';

// Import constants
import { 
  JITO_SOL_PRICE_FEED_ADDRESS,
} from '../utils/constants';

/**
 * Test Switchboard oracle cranking independently with 3 responses
 */
export async function testOracleCrank(): Promise<string | undefined> {
  console.log('\n=== TESTING SWITCHBOARD ORACLE CRANKING ===');
  
  try {
    // Print constants for debugging
    console.log('Oracle Configuration:');
    console.log(`JITO_SOL_PRICE_FEED_ADDRESS: ${JITO_SOL_PRICE_FEED_ADDRESS}`);
    
    // Load signer for transaction signing
    const signer = await loadKeypair();
    console.log(`Using signer: ${signer.address}`);
    
    // Load keypair from file for signing
    const keypairPath = process.env.KEYPAIR_PATH || '';
    if (!keypairPath) {
      throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
    }
    
    const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    
    // Create a direct web3.js connection for transaction sending
    const connection = createConnection();
    
    console.log('\nGenerating Switchboard crank instructions for 3 oracle responses...');
    
    // Configure Switchboard cranking for jitoSOL price feed with 3 responses
    const switchboardConfig: SwitchboardCrankConfig = {
      connection: connection,
      feedAddress: new web3.PublicKey(JITO_SOL_PRICE_FEED_ADDRESS),
      payer: keypair.publicKey,
      maxStaleness: 300, // 5 minutes
      numResponses: 3 // Require 3 oracle responses for proper price aggregation
    };
    
    try {
      // Get Switchboard crank instructions (returns object with instructions and lookup tables)
      const crankResult = await getSwitchboardCrankInstruction(switchboardConfig);
      
      console.log(`✓ Generated ${crankResult.instructions.length} Switchboard crank instructions for 3 oracle responses`);
      console.log(`✓ Got ${crankResult.lookupTables.length} lookup tables`);
      
      // Create transaction with just the crank instructions
      const transaction = new web3.Transaction();
      transaction.add(...crankResult.instructions);
      
      // Add recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      
      // Check if we need versioned transaction for size optimization
      const serializedSize = transaction.serialize({ requireAllSignatures: false }).length;
      console.log(`Transaction size: ${serializedSize} bytes`);
      
      let signature: string;
      
      if (serializedSize > 1232 && crankResult.lookupTables.length > 0) {
        console.log('🔄 Using Versioned Transaction with lookup tables...');
        
        // Create versioned transaction message
        const message = new web3.TransactionMessage({
          payerKey: keypair.publicKey,
          recentBlockhash: blockhash,
          instructions: crankResult.instructions,
        }).compileToV0Message(crankResult.lookupTables);
        
        // Create versioned transaction
        const versionedTx = new web3.VersionedTransaction(message);
        versionedTx.sign([keypair]);
        
        // Send versioned transaction
        signature = await connection.sendRawTransaction(versionedTx.serialize(), {
          skipPreflight: true, // Skip preflight to avoid rejections for valid transactions
          preflightCommitment: 'confirmed'
        });
        
      } else {
        console.log('🔄 Using Legacy Transaction...');
        
        // Sign the legacy transaction
        transaction.sign(keypair);
        
        // Send legacy transaction
        signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: true, // Skip preflight to avoid rejections for valid transactions
          preflightCommitment: 'confirmed'
        });
      }
      
      console.log(`Transaction sent! Signature: ${signature}`);
      console.log(`View on explorer: https://solscan.io/tx/${signature}`);
      
      // Poll for transaction status
      console.log('Polling for transaction status...');
      const maxAttempts = 30;
      
      // Poll transaction status
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await connection.getSignatureStatuses([signature]);
          const status = response.value[0];
          
          if (status) {
            if (status.err) {
              console.error(`Transaction failed: ${JSON.stringify(status.err)}`);
              console.log('❌ Oracle crank transaction failed - stopping polling');
              return signature;
            }
            
            if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
              console.log(`Oracle crank transaction ${status.confirmationStatus}!`);
              
              // Get transaction details for debugging
              try {
                const txDetails = await connection.getTransaction(signature, {
                  maxSupportedTransactionVersion: 0,
                });
                
                if (txDetails && txDetails.meta) {
                  if (txDetails.meta.err) {
                    console.error(`Transaction error: ${JSON.stringify(txDetails.meta.err)}`);
                  } else {
                    console.log('✅ Oracle crank transaction successful!');
                    
                    // Log compute units used
                    if (txDetails.meta.computeUnitsConsumed) {
                      console.log(`Compute units consumed: ${txDetails.meta.computeUnitsConsumed}`);
                    }
                    
                    // Log fee
                    if (txDetails.meta.fee) {
                      console.log(`Transaction fee: ${txDetails.meta.fee} lamports`);
                    }
                  }
                }
              } catch (detailsError) {
                console.warn(`Could not fetch transaction details: ${detailsError}`);
              }
              
              return signature;
            }
          }
          
          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, 1000));
          process.stdout.write('.');
        } catch (error) {
          console.warn(`Error checking transaction status (attempt ${attempt + 1}/${maxAttempts}): ${error}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // If we reach here, polling finished without confirmation
      console.error('\n❌ Oracle crank transaction polling timed out - transaction may have failed or not been processed');
      throw new Error(`Oracle crank transaction polling timed out after ${maxAttempts} attempts. Signature: ${signature}`);
      
    } catch (switchboardError) {
      console.error('❌ Switchboard cranking failed:', switchboardError);
      throw switchboardError;
    }
    
  } catch (error) {
    console.error('Error testing oracle crank:', error);
    return undefined;
  }
} 