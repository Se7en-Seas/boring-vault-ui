import { web3 } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Import shared utilities
import {
  rl,
  question
} from './mainnet-test-utils';

// Import read operations
import {
  analyzeVaultAccount,
  testReadOperations,
  testUserBalances,
  fetchUserShares
} from './mainnet-test-read';

// Import write operations
import {
  testDeposit
} from './mainnet-test-write';

// Load environment variables
dotenv.config();

/**
 * Main function to run all tests sequentially
 */
async function main() {
  try {
    // Explain available commands
    console.log('\n=== BORING VAULT MAINNET TEST ===');
    console.log('Available commands:');
    console.log('  - analyze: Scan and analyze vault account');
    console.log('  - read: Show vault data details');
    console.log('  - balance: Check your balance in the vault');
    console.log('  - accounts: List all token accounts and balances');
    console.log('  - deposit: Test jitoSOL deposit functionality');
    console.log('  - exit: Exit the program');
    
    const command = await question('\nEnter command (or "exit" to quit): ');
    
    switch (command.toLowerCase()) {
      case 'analyze':
        await analyzeVaultAccount();
        break;
      case 'read':
        await testReadOperations();
        break;
      case 'balance':
      case 'shares':
        await fetchUserShares();
        break;
      case 'accounts':
      case 'tokens':
        await testUserBalances();
        break;
      case 'deposit':
        await testDeposit();
        break;
      case 'exit':
        console.log('Exiting...');
        break;
      default:
        console.log('Unknown command. Try again.');
    }
    
    rl.close();
    
  } catch (error) {
    console.error('\nTesting failed with error:', error);
    rl.close();
    process.exit(1);
  }
}

// Execute the appropriate function based on arguments if this file is run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Function to execute a test and gracefully close
  const executeTest = async (testFn: () => Promise<any>) => {
    try {
      const result = await testFn();
      return result;
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      rl.close();
    }
  };
  
  if (command === 'analyze') {
    executeTest(() => analyzeVaultAccount());
  } else if (command === 'read') {
    executeTest(() => testReadOperations());
  } else if (command === 'fetchshares' || command === 'shares' || command === 'balance') {
    executeTest(() => fetchUserShares());
  } else if (command === 'accounts' || command === 'tokens' || command === 'list' || command === 'balances') {
    executeTest(() => testUserBalances());
  } else if (command === 'deposit') {
    executeTest(() => testDeposit());
  } else if (!command) {
    // Interactive mode if no command is provided
    main().catch(console.error);
  } else {
    // Show error for unrecognized commands
    console.error(`Unrecognized command: ${command}`);
    console.log('\nAvailable commands:');
    console.log('  - analyze: Scan and analyze vault account');
    console.log('  - read: Show vault data details');
    console.log('  - balance: Check your balance in the vault');
    console.log('  - accounts: List all token accounts and balances');
    console.log('  - deposit: Test jitoSOL deposit functionality');
    console.log('\nOr run without arguments for interactive mode.');
    process.exit(1);
  }
} else {
  // If this file is imported, export the test functions
  module.exports = {
    analyzeVaultAccount,
    testReadOperations,
    testUserBalances,
    fetchUserShares,
    testDeposit,
    main
  };
}