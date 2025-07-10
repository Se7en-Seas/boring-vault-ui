import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { 
  solanaClient, 
  MAINNET_CONFIG,
  loadKeypair
} from './mainnet-test-utils';
import { 
  testDeposit,
  testDepositSol,
  testQueueWithdraw,
} from './mainnet-test-write';

// Import read operations
import {
  analyzeVaultAccount,
  testReadOperations,
  testUserBalances,
  fetchUserShares,
  testFetchShareValue,
  checkQueueConfig,
  testQueueWithdrawStatus,
} from './mainnet-test-read';

// Import oracle operations
import {
  testPythOracle,
  testOracleCranking
} from './mainnet-test-oracle';

// Load environment variables
dotenv.config();

/**
 * Displays help text showing available commands
 * @param errorMessage Optional error message to display before help text
 */
function displayHelpText(errorMessage?: string): void {
  if (errorMessage) {
    console.error(errorMessage);
  }
  console.log('\n=== BORING VAULT MAINNET TEST ===');
  console.log('Available commands:');
  console.log('  1. analyze-vault - Analyze all vault accounts for debugging');
  console.log('  2. read-vault - Read the vault data');
  console.log('  3. fetch-user-shares [vault-id] - Fetch user\'s vault share balance (default: vault 12)');
  console.log('  4. fetch-share-value [vault-id] - Get the value of 1 share in terms of base asset (default: vault 12)');
  console.log('  5. deposit - Test deposit functionality');
  console.log('  6. deposit-sol - Test SOL deposit functionality');
  console.log('  7. queue-withdraw - Test queue withdraw functionality');
  console.log('  8. check-queue-config [vault-id] - Check the queue program configuration for a specific vault (default: vault from .env)');
  console.log('  9. test-queue-status [vault-id] - Test queue withdraw status functionality (default: vault from .env)');
  console.log('  10. pyth-oracle - Test Pyth oracle integration (price feeds and updates)');
  console.log('  11. pyth-crank - Test Pyth oracle cranking specifically');
  console.log('\nRun with a command to execute that test. Example: node dist/src/solana/tests/mainnet-test.js queue-withdraw');
  console.log('For fetch-user-shares, optionally specify vault ID: node dist/src/solana/tests/mainnet-test.js fetch-user-shares 12');
  console.log('For fetch-share-value, optionally specify vault ID: node dist/src/solana/tests/mainnet-test.js fetch-share-value 12');
  console.log('For check-queue-config, optionally specify vault ID: node dist/src/solana/tests/mainnet-test.js check-queue-config 9');
  console.log('For test-queue-status, optionally specify vault ID: node dist/src/solana/tests/mainnet-test.js test-queue-status 9');
}

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
    } else if (command === 'fetch-user-shares' || command === 'user-shares' || command === 'check-balance' || command === 'balance') {
      // Parse optional vault ID parameter
      const vaultIdArg = args[1];
      let vaultId: number | undefined;
      
      if (vaultIdArg) {
        const parsedVaultId = parseInt(vaultIdArg, 10);
        if (isNaN(parsedVaultId)) {
          console.error(`Invalid vault ID: ${vaultIdArg}. Must be a number.`);
          process.exit(1);
        }
        vaultId = parsedVaultId;
      }
      
      executeTest(() => fetchUserShares(undefined, vaultId));
    } else if (command === 'fetch-share-value' || command === 'share-value') {
      // Parse optional vault ID parameter
      const vaultIdArg = args[1];
      let vaultId: number | undefined;
      
      if (vaultIdArg) {
        const parsedVaultId = parseInt(vaultIdArg, 10);
        if (isNaN(parsedVaultId)) {
          console.error(`Invalid vault ID: ${vaultIdArg}. Must be a number.`);
          process.exit(1);
        }
        vaultId = parsedVaultId;
      }
      
      executeTest(() => testFetchShareValue(vaultId));
    } else if (command === 'deposit') {
      executeTest(() => testDeposit());
    } else if (command === 'deposit-sol') {
      // Parse the amount argument
      const amountArg = args[1];
      let amount = 0.001; // default
      
      if (amountArg) {
        const parsedAmount = parseFloat(amountArg);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          console.error(`Invalid amount: ${amountArg}. Must be a positive number.`);
          process.exit(1);
        }
        amount = parsedAmount;
      }
      
      executeTest(() => testDepositSol(amount));
    } else if (command === 'queue-withdraw') {
      executeTest(() => testQueueWithdraw());
    } else if (command === 'check-queue-config') {
      // Parse optional vault ID parameter
      const vaultIdArg = args[1];
      let vaultId: number | undefined;
      
      if (vaultIdArg) {
        const parsedVaultId = parseInt(vaultIdArg, 10);
        if (isNaN(parsedVaultId)) {
          console.error(`Invalid vault ID: ${vaultIdArg}. Must be a number.`);
          process.exit(1);
        }
        vaultId = parsedVaultId;
      }
      
      executeTest(() => checkQueueConfig(vaultId));
    } else if (command === 'test-queue-status') {
      // Parse optional vault ID parameter
      const vaultIdArg = args[1];
      let vaultId: number | undefined;
      
      if (vaultIdArg) {
        const parsedVaultId = parseInt(vaultIdArg, 10);
        if (isNaN(parsedVaultId)) {
          console.error(`Invalid vault ID: ${vaultIdArg}. Must be a number.`);
          process.exit(1);
        }
        vaultId = parsedVaultId;
      }
      
      executeTest(() => testQueueWithdrawStatus(vaultId));
    } else if (command === 'pyth-oracle' || command === 'pyth') {
      executeTest(() => testPythOracle());
    } else if (command === 'pyth-crank') {
      executeTest(() => testOracleCranking());
    } else if (!command) {
      // Show help instead of entering interactive mode
      displayHelpText();
      process.exit(0);
    } else {
      displayHelpText(`Unrecognized command: ${command}`);
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
    testFetchShareValue,
    testDeposit,
    testDepositSol,
    testQueueWithdraw,
    checkQueueConfig,
    testQueueWithdrawStatus,
    main
  };
}