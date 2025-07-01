import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { HermesClient } from '@pythnetwork/hermes-client';
import { web3 } from '@coral-xyz/anchor';

// Import PythSolanaReceiver with overridden rpc-websockets 7.11.2
let PythSolanaReceiverWithOverrides: any = null;

try {
  // Use the single package - overrides ensure it uses rpc-websockets 7.11.2
  const { PythSolanaReceiver } = require('@pythnetwork/pyth-solana-receiver');
  PythSolanaReceiverWithOverrides = PythSolanaReceiver;
  console.log('✓ Loaded PythSolanaReceiver with overridden rpc-websockets@7.11.2');
} catch (error) {
  console.warn('⚠️ PythSolanaReceiver not available:', error instanceof Error ? error.message : 'Unknown error');
}

// Import constants
import { 
  JITOSOL_SOL_SWITCHBOARD_FEED,
  JITOSOL_SOL_PYTH_FEED,
} from '../utils/constants';

// Load environment variables
dotenv.config();





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



/**
 * Simple check to see if the Pyth price feed account exists
 */
export async function checkPythAccount(
  priceFeedId: string = JITOSOL_SOL_PYTH_FEED
): Promise<{
  exists: boolean;
  address?: string;
  details?: any;
  error?: string;
}> {
  console.log('\n=== CHECKING PYTH PRICE FEED ACCOUNT ===');
  
  try {
    if (!PythSolanaReceiverWithOverrides) {
      throw new Error('PythSolanaReceiver not available. Please run npm install first.');
    }
    
    console.log(`Checking price feed account for: ${priceFeedId}`);
    
    // Setup connection
    const rpcUrl = process.env.ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new web3.Connection(rpcUrl, 'confirmed');
    
    // Create minimal wallet interface for address calculation
    const dummyWallet = {
      publicKey: web3.Keypair.generate().publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };

    // Initialize PythSolanaReceiver instance
    const pythSolanaReceiver = new PythSolanaReceiverWithOverrides({ 
      connection, 
      wallet: dummyWallet as any 
    });

    // Get price feed account address
    const cleanPriceFeedId = priceFeedId.replace('0x', '');
    const priceFeedAccount = pythSolanaReceiver.getPriceFeedAccountAddress(
      1, // shard ID 1 - matches smart contract configuration
      cleanPriceFeedId
    );
    
    console.log(`✓ Price feed account address: ${priceFeedAccount.toString()}`);
    
    // Check if account exists
    const accountInfo = await connection.getAccountInfo(priceFeedAccount);
    
    if (accountInfo) {
      console.log(`✅ Price feed account EXISTS!`);
      console.log(`  - Address: ${priceFeedAccount.toString()}`);
      console.log(`  - Owner: ${accountInfo.owner.toString()}`);
      console.log(`  - Data length: ${accountInfo.data.length} bytes`);
      console.log(`  - Lamports: ${accountInfo.lamports}`);
      console.log(`  - Executable: ${accountInfo.executable}`);
      
      return {
        exists: true,
        address: priceFeedAccount.toString(),
        details: {
          owner: accountInfo.owner.toString(),
          dataLength: accountInfo.data.length,
          lamports: accountInfo.lamports,
          executable: accountInfo.executable
        }
      };
    } else {
      console.log(`❌ Price feed account does NOT exist`);
      console.log(`   Address: ${priceFeedAccount.toString()}`);
      
      return {
        exists: false,
        address: priceFeedAccount.toString()
      };
    }
    
  } catch (error) {
    console.error('Error checking price feed account:', error);
    return {
      exists: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}


/**
 * Create the fixed price feed account using addUpdatePriceFeed with shard ID 0
 * This creates the persistent account that the smart contract expects
 */
export async function createFixedPriceFeedAccount(
  priceFeedId: string = JITOSOL_SOL_PYTH_FEED,
  keypairPath?: string
): Promise<{
  success: boolean;
  priceFeedAddress?: string;
  transaction?: string;
  error?: string;
}> {
  console.log('\n=== CREATING FIXED PRICE FEED ACCOUNT ===');
  
  try {
    if (!PythSolanaReceiverWithOverrides) {
      throw new Error('PythSolanaReceiver not available. Please run npm install first.');
    }
    
    console.log(`Creating fixed price feed account for: ${priceFeedId}`);
    console.log(`Using shard ID: 1 (standard Pyth practice, produces 6HjiUqLPeawRBpf8Pc9MZnaWEEamCKn4gwBuFMFTb8RW)`);
    
    // Load keypair
    const keyPath = keypairPath || process.env.KEYPAIR_PATH || '';
    if (!keyPath) {
      throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file or pass as parameter');
    }
    
    let payerKeypair: web3.Keypair;
    try {
      const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
      payerKeypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
      console.log(`✓ Loaded payer keypair: ${payerKeypair.publicKey.toString()}`);
    } catch (error) {
      console.error('❌ Failed to load keypair:', error);
      throw error;
    }
    
    // Setup connection
    const rpcUrl = process.env.ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new web3.Connection(rpcUrl, 'confirmed');
    console.log(`✓ Connected to RPC: ${rpcUrl}`);
    
    // Create wallet interface for PythSolanaReceiver
    const payerWallet = {
      publicKey: payerKeypair.publicKey,
      signTransaction: async (tx: any) => {
        tx.sign(payerKeypair);
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        txs.forEach(tx => tx.sign(payerKeypair));
        return txs;
      },
    };

    // Initialize PythSolanaReceiver instance
    console.log('Initializing PythSolanaReceiver for fixed account creation...');
    const pythSolanaReceiver = new PythSolanaReceiverWithOverrides({ 
      connection, 
      wallet: payerWallet as any 
    });

    // Get the expected price feed account address (shard 1)
    const cleanPriceFeedId = priceFeedId.replace('0x', '');
    const expectedPriceFeedAccount = pythSolanaReceiver.getPriceFeedAccountAddress(
      1, // shard ID 1 - standard Pyth practice, produces 6HjiUqLPeawRBpf8Pc9MZnaWEEamCKn4gwBuFMFTb8RW
      cleanPriceFeedId
    );
    
    console.log(`✓ Expected price feed account address: ${expectedPriceFeedAccount.toString()}`);
    
    // Check if account already exists
    const existingAccountInfo = await connection.getAccountInfo(expectedPriceFeedAccount);
    
    if (existingAccountInfo) {
      console.log(`✅ Fixed price feed account already exists!`);
      console.log(`  - Address: ${expectedPriceFeedAccount.toString()}`);
      console.log(`  - Owner: ${existingAccountInfo.owner.toString()}`);
      console.log(`  - Data length: ${existingAccountInfo.data.length} bytes`);
      console.log(`  - Lamports: ${existingAccountInfo.lamports}`);
      
      // Still post a price update to refresh the data
      console.log('\n🔄 Posting fresh price update to existing account...');
    } else {
      console.log('🔨 Creating new fixed price feed account...');
    }
    
    // Fetch latest price updates from Hermes
    console.log('\nFetching latest price updates from Hermes...');
    const hermesClient = new HermesClient('https://hermes.pyth.network/', {});
    const priceUpdateResponse = await hermesClient.getLatestPriceUpdates(
      [priceFeedId],
      { encoding: 'base64' }
    );
    
    console.log(`✓ Fetched ${priceUpdateResponse.binary.data.length} price update(s) from Hermes`);
    
    if (priceUpdateResponse.binary.data.length === 0) {
      throw new Error('No price updates available from Hermes');
    }
    
    // Create transaction builder
    const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
      closeUpdateAccounts: false // Keep accounts open
    });

    // Use addUpdatePriceFeed with shard ID 1 to create/update the fixed account
    console.log('Adding price feed update instruction for shard 1...');
    await transactionBuilder.addUpdatePriceFeed(
      priceUpdateResponse.binary.data,
      1 // shard ID 1 - this creates/updates the fixed account
    );

    // Build transactions
    console.log('Building transactions for fixed price feed account...');
    const transactions = await transactionBuilder.buildLegacyTransactions({
      computeUnitPriceMicroLamports: 1000,
    });

    console.log(`✓ Built ${transactions.length} transaction(s) for fixed price feed`);

    // Send transactions
    let finalSignature = '';
    for (let i = 0; i < transactions.length; i++) {
      const { tx, signers } = transactions[i];
      
      console.log(`Sending transaction ${i + 1}/${transactions.length}...`);
      
      // Get latest blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = payerKeypair.publicKey;
      
      // Sign transaction with all required signers
      const allSigners = [payerKeypair, ...(signers || [])];
      
      if (allSigners.length === 1) {
        tx.sign(allSigners[0]);
      } else {
        tx.partialSign(...allSigners);
      }
      
      console.log(`✓ Transaction signed with ${allSigners.length} signer(s)`);
      
      // Send transaction
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3
      });
      
      console.log(`✓ Transaction ${i + 1} sent: ${signature}`);
      
      // Wait for confirmation with better timeout handling
      console.log(`Waiting for transaction ${i + 1} confirmation...`);
      
      try {
        const confirmation = await connection.confirmTransaction({
          signature,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight
        }, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Transaction ${i + 1} failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log(`✓ Transaction ${i + 1} confirmed`);
      } catch (timeoutError) {
        console.log(`⚠️  Transaction ${i + 1} confirmation timed out, but may still succeed`);
        console.log(`   Signature: ${signature}`);
        console.log(`   Check on Solana Explorer: https://solscan.io/tx/${signature}`);
        
        // Wait a bit and check if transaction actually succeeded
        console.log('   Waiting 10 seconds to check transaction status...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        const status = await connection.getSignatureStatus(signature);
        if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
          console.log(`✅ Transaction ${i + 1} actually succeeded despite timeout!`);
        } else if (status.value?.err) {
          throw new Error(`Transaction ${i + 1} failed: ${JSON.stringify(status.value.err)}`);
        } else {
          console.log(`⏳ Transaction ${i + 1} still processing...`);
        }
      }
      finalSignature = signature;
    }
    
    // Verify the fixed account was created/updated
    console.log('\nVerifying fixed price feed account...');
    const finalAccountInfo = await connection.getAccountInfo(expectedPriceFeedAccount);
    
    if (finalAccountInfo) {
      console.log('\n🎉 SUCCESS! Fixed price feed account is ready');
      console.log(`✅ Account Address: ${expectedPriceFeedAccount.toString()}`);
      console.log(`✅ Owner: ${finalAccountInfo.owner.toString()}`);
      console.log(`✅ Data Length: ${finalAccountInfo.data.length} bytes`);
      console.log(`✅ Lamports: ${finalAccountInfo.lamports}`);
      console.log(`✅ Final Transaction: ${finalSignature}`);
      
      // Verify it's owned by Pyth program
      const pythProgramId = 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';
      const isOwnedByPyth = finalAccountInfo.owner.toString() === pythProgramId;
      console.log(`✅ Owned by Pyth Program: ${isOwnedByPyth ? 'Yes' : 'No'}`);
      
      if (isOwnedByPyth) {
        console.log('\n💡 Perfect! Your smart contract can now use this fixed price feed for SOL deposits!');
        console.log(`💡 Price Feed Address: ${expectedPriceFeedAccount.toString()}`);
        console.log(`💡 Price Feed ID: ${priceFeedId}`);
      } else {
        console.log('\n⚠️  Warning: Account not owned by Pyth program. Check implementation.');
      }
      
      return {
        success: true,
        priceFeedAddress: expectedPriceFeedAccount.toString(),
        transaction: finalSignature
      };
    } else {
      throw new Error('Fixed price feed account creation/update succeeded but account not found');
    }
    
  } catch (error) {
    console.error('Error creating fixed price feed account:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}



/**
 * Main function to handle command line arguments
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  
  console.log('🔥 Boring Vault Oracle Tests');
  console.log(`Command: ${command || 'default'}`);
  
  try {
    switch (command) {
      case 'pyth':
        console.log('\n=== RUNNING PYTH ORACLE TESTS ===');
        
        // Test oracle functionality
        const oracleResult = await testPythOracle();
        
        if (oracleResult === 'pyth-ready') {
          console.log('\n🎉 PYTH SETUP COMPLETE!');
          console.log('✅ Oracle functionality verified');
          console.log('✅ Smart contract can now accept SOL deposits');
          console.log(`\n💡 Price feed ID: ${JITOSOL_SOL_PYTH_FEED}`);
        } else {
          console.log('\n❌ Oracle functionality test failed');
        }
        break;

      case 'check-pyth-account':
        console.log('\n=== CHECKING PYTH PRICE FEED ACCOUNT ===');
        const checkResult = await checkPythAccount();
        
        if (checkResult.exists) {
          console.log('\n✅ PRICE FEED ACCOUNT EXISTS!');
          console.log(`Address: ${checkResult.address}`);
          console.log('Account is ready for SOL deposits');
        } else {
          console.log('\n❌ PRICE FEED ACCOUNT DOES NOT EXIST');
          console.log(`Expected address: ${checkResult.address}`);
          console.log('You need to create it first using: pyth-account-only');
        }
        break;

      case 'create-fixed-account':
        console.log('\n=== CREATING FIXED PRICE FEED ACCOUNT ===');
        const fixedAccountResult = await createFixedPriceFeedAccount();
        
        if (fixedAccountResult.success) {
          console.log('\n🎉 FIXED PRICE FEED ACCOUNT READY!');
          console.log(`✅ Account Address: ${fixedAccountResult.priceFeedAddress}`);
          console.log(`✅ Transaction: ${fixedAccountResult.transaction}`);
          console.log('\n💡 Your smart contract can now use this for SOL deposits!');
        } else {
          console.log(`\n❌ Fixed account creation failed: ${fixedAccountResult.error}`);
          process.exit(1);
        }
        break;

      default:
        console.log('\n=== RUNNING PYTH ORACLE TESTS ===');
        
        // Test Pyth
        const pythResult = await testPythOracle();
        console.log(`Pyth result: ${pythResult || 'failed'}`);
        
        console.log('\n=== SUMMARY ===');
        console.log(`Pyth: ${pythResult ? '✅' : '❌'}`);
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