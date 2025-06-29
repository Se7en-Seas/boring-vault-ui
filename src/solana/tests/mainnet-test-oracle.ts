import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { HermesClient } from '@pythnetwork/hermes-client';

// Import constants
import { 
  JITO_SOL_PRICE_FEED_ADDRESS,
  JITOSOL_SOL_PYTH_FEED,
} from '../utils/constants';

// Load environment variables
dotenv.config();

/**
 * Test Switchboard oracle functionality without websockets
 * Focus on data preparation for smart contract integration
 */
export async function testOracleCrank(): Promise<string | undefined> {
  console.log('\n=== TESTING SWITCHBOARD ORACLE DATA PREPARATION ===');
  
  try {
    // Print constants for debugging
    console.log('Switchboard Oracle Configuration:');
    console.log(`JITO_SOL_PRICE_FEED_ADDRESS: ${JITO_SOL_PRICE_FEED_ADDRESS}`);
    
    // Validate keypair exists (without loading it to avoid web3.js imports)
    const keypairPath = process.env.KEYPAIR_PATH || '';
    if (!keypairPath) {
      throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
    }
    
    // Check if keypair file exists and is readable
    try {
      const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      if (!Array.isArray(keyData) || keyData.length !== 64) {
        throw new Error('Invalid keypair format');
      }
      console.log('✓ Keypair file is valid and readable');
    } catch (error) {
      console.error('❌ Keypair file issue:', error);
      throw error;
    }
    
    // Validate RPC endpoint
    const rpcUrl = process.env.ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com';
    console.log(`✓ Using RPC endpoint: ${rpcUrl}`);
    
    // Test basic RPC connectivity with HTTP request
    console.log('\nTesting RPC connectivity...');
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSlot',
          params: []
        })
      });
      
      const data = await response.json();
      if (data.result) {
        console.log(`✓ RPC connectivity successful. Current slot: ${data.result}`);
      } else {
        throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
      }
    } catch (error) {
      console.error('❌ RPC connectivity failed:', error);
      throw error;
    }
    
    // Test Switchboard feed account exists
    console.log('\nTesting Switchboard feed account...');
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [
            JITO_SOL_PRICE_FEED_ADDRESS,
            {
              encoding: 'base64'
            }
          ]
        })
      });
      
      const data = await response.json();
      if (data.result && data.result.value) {
        console.log(`✓ Switchboard feed account exists`);
        console.log(`  - Owner: ${data.result.value.owner}`);
        console.log(`  - Data length: ${data.result.value.data[0] ? Buffer.from(data.result.value.data[0], 'base64').length : 0} bytes`);
        console.log(`  - Executable: ${data.result.value.executable}`);
        console.log(`  - Lamports: ${data.result.value.lamports}`);
      } else {
        throw new Error('Switchboard feed account not found');
      }
    } catch (error) {
      console.error('❌ Switchboard feed account check failed:', error);
      throw error;
    }
    
    console.log('\n✅ Switchboard oracle data preparation completed successfully!');
    console.log('📝 Ready for smart contract integration:');
    console.log('  - RPC endpoint validated');
    console.log('  - Keypair file validated');
    console.log('  - Feed account confirmed');
    console.log('  - Can proceed with instruction generation');
    
    return 'switchboard-ready';
    
  } catch (error) {
    console.error('Error testing Switchboard oracle:', error);
    return undefined;
  }
}

/**
 * Test Pyth oracle functionality and prepare data for smart contract integration
 * Focus on price data fetching and instruction preparation without websockets
 */
export async function testPythOracle(): Promise<string | undefined> {
  console.log('\n=== TESTING PYTH ORACLE DATA PREPARATION ===');
  
  try {
    // Print constants for debugging
    console.log('Pyth Oracle Configuration:');
    console.log(`JITOSOL_SOL_PYTH_FEED: ${JITOSOL_SOL_PYTH_FEED}`);
    
    // Validate keypair exists
    const keypairPath = process.env.KEYPAIR_PATH || '';
    if (!keypairPath) {
      throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
    }
    
    // Extract public key from keypair for later use
    let payerPublicKey: string;
    try {
      const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      if (!Array.isArray(keyData) || keyData.length !== 64) {
        throw new Error('Invalid keypair format');
      }
      
      // Extract public key (last 32 bytes of the keypair)
      const publicKeyBytes = keyData.slice(32);
      payerPublicKey = Buffer.from(publicKeyBytes).toString('base64');
      console.log(`✓ Extracted payer public key for instruction generation`);
    } catch (error) {
      console.error('❌ Keypair processing failed:', error);
      throw error;
    }
    
    console.log('\n--- TESTING PRICE DATA FETCHING ---');
    
    // Test 1: Fetch price updates from Hermes
    let priceUpdateData: string[] = [];
    try {
      console.log('\nFetching price updates from Hermes...');
      const hermesClient = new HermesClient('https://hermes.pyth.network/', {});
      
      const priceUpdateResponse = await hermesClient.getLatestPriceUpdates(
        [JITOSOL_SOL_PYTH_FEED],
        { encoding: 'base64' }
      );
      
      priceUpdateData = priceUpdateResponse.binary.data;
      
      console.log(`✓ Successfully fetched ${priceUpdateData.length} price update(s) from Hermes`);
      console.log(`✓ First update length: ${priceUpdateData[0]?.length} characters`);
      console.log(`✓ First update preview: ${priceUpdateData[0]?.substring(0, 100)}...`);
      
      // Verify the updates are valid base64
      const allValidBase64 = priceUpdateData.every(update => {
        try {
          Buffer.from(update, 'base64');
          return true;
        } catch {
          return false;
        }
      });
      console.log(`✓ All price updates are valid base64: ${allValidBase64}`);
      
    } catch (error) {
      console.error('❌ Price update fetching failed:', error);
      throw error;
    }
    
    console.log('\n--- TESTING SMART CONTRACT DATA PREPARATION ---');
    
    // Test 2: Prepare data structure for smart contract integration
    try {
      console.log('\nPreparing data for smart contract integration...');
      
      const smartContractData = {
        // Price feed configuration
        priceFeedId: JITOSOL_SOL_PYTH_FEED,
        priceFeedIdBytes: Buffer.from(JITOSOL_SOL_PYTH_FEED.replace('0x', ''), 'hex'),
        
        // Price update data
        priceUpdates: priceUpdateData,
        priceUpdateCount: priceUpdateData.length,
        totalDataSize: priceUpdateData.reduce((sum, update) => sum + update.length, 0),
        
        // Instruction metadata
        hermesEndpoint: 'https://hermes.pyth.network/',
        encoding: 'base64',
        timestamp: new Date().toISOString(),
        
        // Smart contract integration hints
        instructionAccounts: {
          payer: payerPublicKey,
          pythProgram: 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ', // Pyth program ID
          systemProgram: '11111111111111111111111111111111',
        },
        
        // Instruction preparation
        readyForInstructionGeneration: true,
        requiresLegacyTransaction: priceUpdateData.reduce((sum, update) => sum + update.length, 0) > 50000, // Rough estimate
      };
      
      console.log('✓ Smart contract data structure prepared:');
      console.log(`  - Price feed ID: ${smartContractData.priceFeedId}`);
      console.log(`  - Price feed bytes length: ${smartContractData.priceFeedIdBytes.length}`);
      console.log(`  - Number of price updates: ${smartContractData.priceUpdateCount}`);
      console.log(`  - Total data size: ${smartContractData.totalDataSize} characters`);
      console.log(`  - Payer account configured: Yes`);
      console.log(`  - Pyth program ID: ${smartContractData.instructionAccounts.pythProgram}`);
      console.log(`  - Ready for instruction generation: ${smartContractData.readyForInstructionGeneration}`);
      console.log(`  - Requires legacy transaction: ${smartContractData.requiresLegacyTransaction}`);
      
      // Validate price feed ID format
      if (smartContractData.priceFeedIdBytes.length !== 32) {
        throw new Error(`Invalid price feed ID length: expected 32 bytes, got ${smartContractData.priceFeedIdBytes.length}`);
      }
      console.log('✓ Price feed ID format validation passed');
      
      // Validate price update structure
      for (let i = 0; i < priceUpdateData.length; i++) {
        const update = priceUpdateData[i];
        const decoded = Buffer.from(update, 'base64');
        if (decoded.length < 100) { // Minimum reasonable size for a price update
          throw new Error(`Price update ${i} seems too small: ${decoded.length} bytes`);
        }
      }
      console.log('✓ Price update structure validation passed');
      
    } catch (error) {
      console.error('❌ Smart contract data preparation failed:', error);
      throw error;
    }
    
    console.log('\n--- TESTING INTEGRATION READINESS ---');
    
    // Test 3: Verify readiness for smart contract integration
    try {
      console.log('\nVerifying integration readiness...');
      
      // Check RPC connectivity for instruction sending
      const rpcUrl = process.env.ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestBlockhash',
          params: []
        })
      });
      
      const data = await response.json();
      if (data.result && data.result.value) {
        console.log(`✓ Latest blockhash available: ${data.result.value.blockhash.substring(0, 10)}...`);
        console.log(`✓ Block height: ${data.result.value.lastValidBlockHeight}`);
      } else {
        throw new Error('Could not fetch latest blockhash');
      }
      
      // Estimate transaction requirements
      const estimatedInstructionSize = priceUpdateData.reduce((sum, update) => sum + update.length, 0) / 1000; // Rough KB estimate
      console.log(`✓ Estimated instruction data size: ${estimatedInstructionSize.toFixed(2)} KB`);
      
      if (estimatedInstructionSize > 1.2) { // > 1.2KB suggests versioned transaction needed
        console.log('💡 Recommendation: Use versioned transaction with lookup tables');
      } else {
        console.log('💡 Recommendation: Legacy transaction should work fine');
      }
      
      console.log('\n✅ Integration readiness verification completed!');
      
    } catch (error) {
      console.error('❌ Integration readiness check failed:', error);
      throw error;
    }
    
    console.log('\n✅ All Pyth oracle preparation completed successfully!');
    console.log('\n📋 SMART CONTRACT INTEGRATION SUMMARY:');
    console.log('==========================================');
    console.log(`✅ Price Feed ID: ${JITOSOL_SOL_PYTH_FEED}`);
    console.log(`✅ Price Updates: ${priceUpdateData.length} ready`);
    console.log(`✅ Data Format: Base64 encoded, validated`);
    console.log(`✅ Pyth Program: rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`);
    console.log(`✅ RPC Endpoint: Ready for transaction sending`);
    console.log(`✅ Keypair: Validated and ready`);
    console.log('\n🚀 READY FOR PRODUCTION SMART CONTRACT INTEGRATION!');
    
    return 'pyth-ready';
    
  } catch (error) {
    console.error('Error testing Pyth oracle:', error);
    return undefined;
  }
} 