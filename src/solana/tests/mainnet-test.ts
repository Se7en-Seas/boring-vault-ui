import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { 
  solanaClient, 
  MAINNET_CONFIG,
  loadKeypair
} from './mainnet-test-utils';
import { 
  testDeposit,
  testQueueWithdraw,
  checkQueueConfig,
} from './mainnet-test-write';

// Import read operations
import {
  analyzeVaultAccount,
  testReadOperations,
  testUserBalances,
  fetchUserShares
} from './mainnet-test-read';

// Load environment variables
dotenv.config();

// Helper function to execute a test function and handle errors
async function executeTest(testFn: () => Promise<any>) {
  try {
    console.log('\n=== EXECUTING TEST ===');
    await testFn();
    console.log('\n=== TEST COMPLETED ===');
    process.exit(0); // Exit successfully after test completes
  } catch (error) {
    console.error('\nTest failed with error:', error);
    process.exit(1);
  }
}

// Main function to run the tests
async function main() {
  try {
    // Parse command line args
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase();
    
    // Route commands to the appropriate test function
    if (command === 'analyze-vault' || command === 'analyze') {
      executeTest(() => analyzeVaultAccount());
    } else if (command === 'read-vault' || command === 'read') {
      executeTest(() => testReadOperations());
    } else if (command === 'check-balance' || command === 'balance') {
      executeTest(() => fetchUserShares());
    } else if (command === 'deposit') {
      executeTest(() => testDeposit());
    } else if (command === 'queue-withdraw') {
      executeTest(() => testQueueWithdraw());
    } else if (command === 'check-queue-config') {
      executeTest(() => checkQueueConfig());
    } else if (!command) {
      // Show help instead of entering interactive mode
      console.log('\n=== BORING VAULT MAINNET TEST ===');
      console.log('Available commands:');
      console.log('  1. analyze-vault - Analyze all vault accounts for debugging');
      console.log('  2. read-vault - Read the vault data');
      console.log('  3. check-balance - Check the JITOSOL and share token balances');
      console.log('  4. deposit - Test deposit functionality');
      console.log('  5. queue-withdraw - Test queue withdraw functionality');
      console.log('  6. check-queue-config - Check the queue program configuration');
      console.log('\nRun with a command to execute that test. Example: node dist/src/solana/tests/mainnet-test.js queue-withdraw');
      process.exit(0);
    } else {
      console.error(`Unrecognized command: ${command}`);
      console.log('\nAvailable commands:');
      console.log('  1. analyze-vault - Analyze all vault accounts for debugging');
      console.log('  2. read-vault - Read the vault data');
      console.log('  3. check-balance - Check the JITOSOL and share token balances');
      console.log('  4. deposit - Test deposit functionality');
      console.log('  5. queue-withdraw - Test queue withdraw functionality');
      console.log('  6. check-queue-config - Check the queue program configuration');
      console.log('\nRun with a command to execute that test. Example: node dist/src/solana/tests/mainnet-test.js queue-withdraw');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error in main:', error);
    process.exit(1);
  }
}

// Execute the main function if this file is run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
} else {
  // If this file is imported, export the test functions
  module.exports = {
    analyzeVaultAccount,
    testReadOperations,
    testUserBalances,
    fetchUserShares,
    testDeposit,
    testQueueWithdraw,
    checkQueueConfig,
    main
  };
}