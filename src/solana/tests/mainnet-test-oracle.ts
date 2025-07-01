import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { HermesClient } from '@pythnetwork/hermes-client';
import { web3 } from '@coral-xyz/anchor';

// Import PythSolanaReceiver
let PythSolanaReceiverWithOverrides: any = null;

try {
  const { PythSolanaReceiver } = require('@pythnetwork/pyth-solana-receiver');
  PythSolanaReceiverWithOverrides = PythSolanaReceiver;
  console.log('✓ Loaded PythSolanaReceiver');
} catch (error) {
  console.warn('⚠️ PythSolanaReceiver not available:', error instanceof Error ? error.message : 'Unknown error');
}

// Import constants
import { 
  JITOSOL_SOL_PYTH_FEED,
  PYTH_PROGRAM_ID,
  PYTH_HERMES_URL,
  PYTH_SHARD_ID,
  DEFAULT_RPC_URL,
  SYSTEM_PROGRAM_ID,
  PRICE_UPDATE_MIN_SIZE,
  INSTRUCTION_SIZE_THRESHOLD_KB
} from '../utils/constants';

// Import the main oracle cranking function
import { crankPythPriceFeeds } from '../utils/pyth-oracle';

// Load environment variables
dotenv.config();

/**
 * Simple test to verify Pyth oracle data fetching
 */
export async function testPythOracle(): Promise<string | undefined> {
  console.log('\n=== TESTING PYTH ORACLE DATA FETCHING ===');
  
  try {
    console.log(`Testing price feed: ${JITOSOL_SOL_PYTH_FEED}`);
    
    // Test 1: Fetch price updates from Hermes
    console.log('\nFetching price updates from Hermes...');
    const hermesClient = new HermesClient(PYTH_HERMES_URL, {});
    
    const priceUpdateResponse = await hermesClient.getLatestPriceUpdates(
      [JITOSOL_SOL_PYTH_FEED],
      { encoding: 'base64' }
    );
    
    const priceUpdateData = priceUpdateResponse.binary.data;
    
    console.log(`✓ Fetched ${priceUpdateData.length} price update(s)`);
    console.log(`✓ First update length: ${priceUpdateData[0]?.length} characters`);
    
    // Validate the updates
    const allValidBase64 = priceUpdateData.every(update => {
      try {
        const decoded = Buffer.from(update, 'base64');
        return decoded.length >= PRICE_UPDATE_MIN_SIZE;
      } catch {
        return false;
      }
    });
    
    console.log(`✓ All price updates valid: ${allValidBase64}`);
    
    // Test 2: Check transaction size estimation
    const totalDataSize = priceUpdateData.reduce((sum, update) => sum + update.length, 0);
    const estimatedSizeKB = totalDataSize / 1000;
    
    console.log(`✓ Estimated data size: ${estimatedSizeKB.toFixed(2)} KB`);
    
    if (estimatedSizeKB > INSTRUCTION_SIZE_THRESHOLD_KB) {
      console.log('💡 Large transaction - will use versioned transaction');
    } else {
      console.log('💡 Small transaction - legacy transaction suitable');
    }
    
    console.log('\n✅ Oracle data fetching test completed successfully!');
    return 'pyth-ready';
    
  } catch (error) {
    console.error('❌ Oracle test failed:', error);
    return undefined;
  }
}

/**
 * Test the integrated oracle cranking functionality
 */
export async function testOracleCranking(): Promise<boolean> {
  console.log('\n=== TESTING ORACLE CRANKING ===');
  
  try {
    // Load keypair
    const keypairPath = process.env.KEYPAIR_PATH || '';
    if (!keypairPath) {
      throw new Error('KEYPAIR_PATH not set in environment');
    }
    
    const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const payerKeypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    console.log(`✓ Loaded keypair: ${payerKeypair.publicKey.toString()}`);
    
    // Setup connection
    const rpcUrl = process.env.ALCHEMY_RPC_URL || DEFAULT_RPC_URL;
    const connection = new web3.Connection(rpcUrl, 'confirmed');
    console.log(`✓ Connected to RPC`);
    
    // Test oracle cranking
    console.log('\nCranking oracle...');
    const signature = await crankPythPriceFeeds(
      connection,
      payerKeypair,
      [JITOSOL_SOL_PYTH_FEED]
    );
    
    console.log(`✅ Oracle cranking successful!`);
    console.log(`✓ Transaction: ${signature}`);
    console.log(`✓ Explorer: https://solscan.io/tx/${signature}`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Oracle cranking test failed:', error);
    return false;
  }
}

/**
 * Check if the Pyth price feed account exists
 */
export async function checkPythAccount(): Promise<boolean> {
  console.log('\n=== CHECKING PYTH PRICE FEED ACCOUNT ===');
  
  try {
    if (!PythSolanaReceiverWithOverrides) {
      throw new Error('PythSolanaReceiver not available');
    }
    
    const rpcUrl = process.env.ALCHEMY_RPC_URL || DEFAULT_RPC_URL;
    const connection = new web3.Connection(rpcUrl, 'confirmed');
    
    // Create minimal wallet interface
    const dummyWallet = {
      publicKey: web3.Keypair.generate().publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };

    const pythSolanaReceiver = new PythSolanaReceiverWithOverrides({ 
      connection, 
      wallet: dummyWallet as any 
    });

    // Get price feed account address
    const priceFeedAccount = pythSolanaReceiver.getPriceFeedAccountAddress(
      PYTH_SHARD_ID,
      JITOSOL_SOL_PYTH_FEED.replace('0x', '')
    );
    
    console.log(`✓ Price feed address: ${priceFeedAccount.toString()}`);
    
    // Check if account exists
    const accountInfo = await connection.getAccountInfo(priceFeedAccount);
    
    if (accountInfo) {
      console.log(`✅ Price feed account EXISTS!`);
      console.log(`  - Owner: ${accountInfo.owner.toString()}`);
      console.log(`  - Data length: ${accountInfo.data.length} bytes`);
      console.log(`  - Owned by Pyth: ${accountInfo.owner.toString() === PYTH_PROGRAM_ID ? 'Yes' : 'No'}`);
      return true;
    } else {
      console.log(`❌ Price feed account does NOT exist`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error checking price feed account:', error);
    return false;
  }
}

/**
 * Main function to handle command line arguments
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('🔮 Boring Vault Oracle Tests');
  console.log(`Command: ${command || 'default'}`);
  
  try {
    switch (command) {
      case 'fetch':
        console.log('\n=== TESTING ORACLE DATA FETCHING ===');
        const fetchResult = await testPythOracle();
        console.log(`Result: ${fetchResult || 'failed'}`);
        break;

      case 'crank':
        console.log('\n=== TESTING ORACLE CRANKING ===');
        const crankResult = await testOracleCranking();
        console.log(`Result: ${crankResult ? 'success' : 'failed'}`);
        break;

      case 'check':
        console.log('\n=== CHECKING PRICE FEED ACCOUNT ===');
        const checkResult = await checkPythAccount();
        console.log(`Account exists: ${checkResult ? 'Yes' : 'No'}`);
        break;

      default:
        console.log('\n=== RUNNING ALL ORACLE TESTS ===');
        
        // Test data fetching
        const oracleResult = await testPythOracle();
        console.log(`✓ Data fetching: ${oracleResult ? 'success' : 'failed'}`);
        
        // Check account existence
        const accountExists = await checkPythAccount();
        console.log(`✓ Account check: ${accountExists ? 'exists' : 'missing'}`);
        
        // Test cranking
        const crankingResult = await testOracleCranking();
        console.log(`✓ Oracle cranking: ${crankingResult ? 'success' : 'failed'}`);
        
        console.log('\n=== SUMMARY ===');
        console.log(`Oracle ready: ${oracleResult && crankingResult ? '✅' : '❌'}`);
        break;
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run main function if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}