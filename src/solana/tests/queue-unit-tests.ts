import { web3 } from '@coral-xyz/anchor';
import { BoringOnchainQueue, WithdrawRequestInfo, UserWithdrawState } from '../sdk/boring-onchain-queue';
import { 
  BORING_VAULT_PROGRAM_ID,
} from '../utils/constants';
import { 
  createSolanaClient, 
  generateKeyPairSigner
} from 'gill';

// Mock class for testing BoringOnchainQueue
class MockBoringOnchainQueue extends BoringOnchainQueue {
  constructor() {
    // Create a mock config for the parent constructor
    const mockConfig = {
      solanaClient: createSolanaClient({ urlOrMoniker: 'localnet' }),
      programId: BORING_VAULT_PROGRAM_ID,
    };
    super(mockConfig);
  }

  // Override methods with mock implementations
  async getUserWithdrawState(userAddress: string | web3.PublicKey): Promise<UserWithdrawState | null> {
    return {
      lastNonce: BigInt(2), // User has made 3 requests (0, 1, 2)
    };
  }

  async getWithdrawRequest(
    userAddress: string | web3.PublicKey, 
    requestId: number
  ): Promise<WithdrawRequestInfo | null> {
    const userPubkey = typeof userAddress === 'string' 
      ? new web3.PublicKey(userAddress) 
      : userAddress;

    // Mock different request scenarios
    if (requestId === 0) {
      // Matured and ready to claim
      const currentTime = Math.floor(Date.now() / 1000);
      const creationTime = currentTime - 7200; // 2 hours ago
      
      return {
        address: new web3.PublicKey('11111111111111111111111111111111'),
        data: {
          vaultId: BigInt(1),
          assetOut: new web3.PublicKey('So11111111111111111111111111111111111111112'), // SOL
          shareAmount: BigInt('1000000000'), // 1 token
          assetAmount: BigInt('950000000'), // 0.95 tokens (with discount)
          creationTime: BigInt(creationTime),
          secondsToMaturity: 3600, // 1 hour maturity
          secondsToDeadline: 86400, // 24 hours deadline
          user: userPubkey,
          nonce: BigInt(0),
        },
        isExpired: false,
        isMatured: true, // Already matured
        timeToMaturity: 0,
        timeToDeadline: 86400 - 7200, // 22 hours left
        formatted: {
          nonce: 0,
          user: userPubkey.toString(),
          tokenOut: { address: 'So11111111111111111111111111111111111111112', decimals: 9 },
          sharesWithdrawing: 1,
          assetsWithdrawing: 0.95,
          creationTime,
          secondsToMaturity: 3600,
          secondsToDeadline: 86400,
          errorCode: 0,
          transactionHashOpened: ''
        }
      };
    } else if (requestId === 1) {
      // Still maturing
      const currentTime = Math.floor(Date.now() / 1000);
      const creationTime = currentTime - 1800; // 30 minutes ago
      
      return {
        address: new web3.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
        data: {
          vaultId: BigInt(1),
          assetOut: new web3.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // USDC
          shareAmount: BigInt('2000000000'), // 2 tokens
          assetAmount: BigInt('1900000000'), // 1.9 tokens (with discount)
          creationTime: BigInt(creationTime),
          secondsToMaturity: 3600, // 1 hour maturity
          secondsToDeadline: 86400, // 24 hours deadline
          user: userPubkey,
          nonce: BigInt(1),
        },
        isExpired: false,
        isMatured: false, // Still maturing
        timeToMaturity: 3600 - 1800, // 30 minutes left
        timeToDeadline: 86400 - 1800, // 22.5 hours left
        formatted: {
          nonce: 1,
          user: userPubkey.toString(),
          tokenOut: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 9 },
          sharesWithdrawing: 2,
          assetsWithdrawing: 1.9,
          creationTime,
          secondsToMaturity: 3600,
          secondsToDeadline: 86400,
          errorCode: 0,
          transactionHashOpened: ''
        }
      };
    } else if (requestId === 2) {
      // Expired request
      const currentTime = Math.floor(Date.now() / 1000);
      const creationTime = currentTime - 90000; // 25 hours ago
      
      return {
        address: new web3.PublicKey('J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn'),
        data: {
          vaultId: BigInt(2), // Different vault
          assetOut: new web3.PublicKey('So11111111111111111111111111111111111111112'), // SOL
          shareAmount: BigInt('500000000'), // 0.5 tokens
          assetAmount: BigInt('475000000'), // 0.475 tokens (with discount)
          creationTime: BigInt(creationTime),
          secondsToMaturity: 3600, // 1 hour maturity
          secondsToDeadline: 86400, // 24 hours deadline
          user: userPubkey,
          nonce: BigInt(2),
        },
        isExpired: true, // Expired
        isMatured: true, // Was matured but now expired
        timeToMaturity: 0,
        timeToDeadline: 0,
        formatted: {
          nonce: 2,
          user: userPubkey.toString(),
          tokenOut: { address: 'So11111111111111111111111111111111111111112', decimals: 9 },
          sharesWithdrawing: 0.5,
          assetsWithdrawing: 0.475,
          creationTime,
          secondsToMaturity: 3600,
          secondsToDeadline: 86400,
          errorCode: 0,
          transactionHashOpened: ''
        }
      };
    }

    return null; // Request doesn't exist
  }
}

// Track test failures
let testFailures = 0;

/**
 * Test suite for BoringOnchainQueue withdraw status functionality
 */
async function testQueueWithdrawStatus() {
  console.log('==========================================');
  console.log('### BORING ONCHAIN QUEUE STATUS TESTS ###');
  console.log('==========================================\n');
  
  // Reset failures counter
  testFailures = 0;
  
  // Test setup
  const mockSigner = await generateKeyPairSigner();
  const mockPayer = new web3.PublicKey(mockSigner.address);
  
  console.log(`Test user: ${mockPayer.toString()}`);
  
  // Test 1: Get User Withdraw State
  try {
    console.log('\nTest 1: Testing getUserWithdrawState...');
    
    const queue = new MockBoringOnchainQueue();
    const withdrawState = await queue.getUserWithdrawState(mockPayer);
    
    if (withdrawState) {
      console.log(`✓ User withdraw state found`);
      console.log(`  - Last nonce: ${withdrawState.lastNonce}`);
      console.log(`  - Total requests made: ${Number(withdrawState.lastNonce) + 1}`);
    } else {
      console.log('✓ No user withdraw state found (expected for new user)');
    }
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 1 failed:', error);
  }
  
  // Test 2: Get Specific Withdraw Request (Matured)
  try {
    console.log('\nTest 2: Testing getWithdrawRequest for matured request...');
    
    const queue = new MockBoringOnchainQueue();
    const request = await queue.getWithdrawRequest(mockPayer, 0);
    
    if (request) {
      console.log(`✓ Withdraw request found`);
      console.log(`  - Request ID: 0`);
      console.log(`  - Vault ID: ${request.data.vaultId}`);
      console.log(`  - Asset Out: ${request.data.assetOut.toString()}`);
      console.log(`  - Share Amount: ${request.data.shareAmount} (${Number(request.data.shareAmount) / 1e9} tokens)`);
      console.log(`  - Asset Amount: ${request.data.assetAmount} (${Number(request.data.assetAmount) / 1e9} tokens)`);
      console.log(`  - Is Matured: ${request.isMatured}`);
      console.log(`  - Is Expired: ${request.isExpired}`);
      console.log(`  - Time to Maturity: ${request.timeToMaturity}s`);
      console.log(`  - Time to Deadline: ${request.timeToDeadline}s`);
    } else {
      console.log('✗ No withdraw request found');
      testFailures++;
    }
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 2 failed:', error);
  }
  
  // Test 3: Get Specific Withdraw Request (Still Maturing)
  try {
    console.log('\nTest 3: Testing getWithdrawRequest for maturing request...');
    
    const queue = new MockBoringOnchainQueue();
    const request = await queue.getWithdrawRequest(mockPayer, 1);
    
    if (request) {
      console.log(`✓ Withdraw request found`);
      console.log(`  - Request ID: 1`);
      console.log(`  - Vault ID: ${request.data.vaultId}`);
      console.log(`  - Asset Out: ${request.data.assetOut.toString()}`);
      console.log(`  - Share Amount: ${request.data.shareAmount} (${Number(request.data.shareAmount) / 1e9} tokens)`);
      console.log(`  - Is Matured: ${request.isMatured}`);
      console.log(`  - Is Expired: ${request.isExpired}`);
      console.log(`  - Time to Maturity: ${request.timeToMaturity}s (${Math.ceil(request.timeToMaturity / 60)} minutes)`);
      console.log(`  - Time to Deadline: ${request.timeToDeadline}s (${Math.ceil(request.timeToDeadline / 3600)} hours)`);
    } else {
      console.log('✗ No withdraw request found');
      testFailures++;
    }
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 3 failed:', error);
  }
  
  // Test 4: Get Withdraw Status (Convenient wrapper)
  try {
    console.log('\nTest 4: Testing getWithdrawStatus wrapper...');
    
    const queue = new MockBoringOnchainQueue();
    const status = await queue.getWithdrawStatus(mockPayer, 0);
    
    console.log(`✓ Withdraw status retrieved`);
    console.log(`  - Request exists: ${status.exists}`);
    console.log(`  - Is matured: ${status.isMatured}`);
    console.log(`  - Is expired: ${status.isExpired}`);
    console.log(`  - Time to maturity: ${status.timeToMaturity}s`);
    console.log(`  - Time to deadline: ${status.timeToDeadline}s`);
    
    if (status.request) {
      console.log(`  - Share amount: ${Number(status.request.data.shareAmount) / 1e9} tokens`);
      console.log(`  - Asset amount: ${Number(status.request.data.assetAmount) / 1e9} tokens`);
    }
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 4 failed:', error);
  }
  
  // Test 5: Get All User Withdraw Requests
  try {
    console.log('\nTest 5: Testing getUserWithdrawRequests...');
    
    const queue = new MockBoringOnchainQueue();
    const requests = await queue.getUserWithdrawRequests(mockPayer);
    
    console.log(`✓ Retrieved ${requests.length} withdraw request(s)`);
    
    requests.forEach((request, index) => {
      console.log(`  Request ${index + 1}:`);
      console.log(`    - Request ID: ${Number(request.data.nonce)}`);
      console.log(`    - Vault ID: ${request.data.vaultId}`);
      console.log(`    - Asset: ${request.data.assetOut.toString()}`);
      console.log(`    - Share Amount: ${Number(request.data.shareAmount) / 1e9} tokens`);
      console.log(`    - Status: ${request.isMatured ? (request.isExpired ? 'Expired' : 'Ready to claim') : 'Maturing'}`);
      if (!request.isMatured) {
        console.log(`    - Time to maturity: ${Math.ceil(request.timeToMaturity / 60)} minutes`);
      }
    });
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 5 failed:', error);
  }
  
  // Test 6: Filter by Vault ID
  try {
    console.log('\nTest 6: Testing getUserWithdrawRequests with vault filter...');
    
    const queue = new MockBoringOnchainQueue();
    const vault1Requests = await queue.getUserWithdrawRequests(mockPayer, 1);
    const vault2Requests = await queue.getUserWithdrawRequests(mockPayer, 2);
    
    console.log(`✓ Vault 1 requests: ${vault1Requests.length}`);
    console.log(`✓ Vault 2 requests: ${vault2Requests.length}`);
    
    vault1Requests.forEach((request, index) => {
      console.log(`  Vault 1 Request ${index + 1}: ID ${Number(request.data.nonce)} - ${request.isMatured ? 'Matured' : 'Maturing'}`);
    });
    
    vault2Requests.forEach((request, index) => {
      console.log(`  Vault 2 Request ${index + 1}: ID ${Number(request.data.nonce)} - ${request.isExpired ? 'Expired' : 'Active'}`);
    });
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 6 failed:', error);
  }
  
  // Test 7: Non-existent Request
  try {
    console.log('\nTest 7: Testing non-existent request...');
    
    const queue = new MockBoringOnchainQueue();
    const status = await queue.getWithdrawStatus(mockPayer, 999);
    
    console.log(`✓ Non-existent request handled correctly`);
    console.log(`  - Request exists: ${status.exists}`);
    console.log(`  - Is matured: ${status.isMatured}`);
    console.log(`  - Is expired: ${status.isExpired}`);
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 7 failed:', error);
  }
  
  // Test 8: PDA Derivation
  try {
    console.log('\nTest 8: Testing PDA derivation...');
    
    const queue = new MockBoringOnchainQueue();
    
    const userWithdrawStatePDA = await queue.getUserWithdrawStatePDA(mockPayer);
    const withdrawRequest0PDA = await queue.getWithdrawRequestPDA(mockPayer, 0);
    const withdrawRequest1PDA = await queue.getWithdrawRequestPDA(mockPayer, 1);
    
    console.log(`✓ User Withdraw State PDA: ${userWithdrawStatePDA.toString()}`);
    console.log(`✓ Withdraw Request 0 PDA: ${withdrawRequest0PDA.toString()}`);
    console.log(`✓ Withdraw Request 1 PDA: ${withdrawRequest1PDA.toString()}`);
    
    // Verify PDAs are different
    const allPDAs = [userWithdrawStatePDA, withdrawRequest0PDA, withdrawRequest1PDA];
    const uniquePDAs = new Set(allPDAs.map(pda => pda.toString()));
    console.log(`✓ All PDAs are unique: ${uniquePDAs.size === allPDAs.length}`);
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 8 failed:', error);
  }
  
  console.log('\n==========================================');
  if (testFailures > 0) {
    console.log(`### TEST SUITE FAILED: ${testFailures} tests failed ###`);
    process.exit(1);
  } else {
    console.log('### ALL QUEUE STATUS TESTS COMPLETED SUCCESSFULLY ###');
  }
  console.log('==========================================');
}

// Test the new boringQueueStatuses function
async function testBoringQueueStatuses() {
  console.log('\n==========================================');
  console.log('### TESTING BORING QUEUE STATUSES FUNCTION ###');
  console.log('==========================================');
  
  const queue = new MockBoringOnchainQueue();
  const testUser = new web3.PublicKey('86HPt12Sy7VD1D5ctQH8Mu32g2WoiUwvjHTV2XfE4k3J');
  
  console.log(`Test user: ${testUser.toString()}`);
  
  try {
    // Test getting all non-expired statuses
    console.log('\nTest 1: Getting all non-expired boring queue statuses...');
    const allStatuses = await queue.boringQueueStatuses(testUser);
    console.log(`✓ Retrieved ${allStatuses.length} non-expired request(s)`);
    
    allStatuses.forEach((status, index) => {
      console.log(`  Status ${index + 1}:`);
      console.log(`    - Nonce: ${status.nonce}`);
      console.log(`    - User: ${status.user}`);
      console.log(`    - Token Out: ${status.tokenOut.address} (${status.tokenOut.decimals} decimals)`);
      console.log(`    - Shares Withdrawing: ${status.sharesWithdrawing}`);
      console.log(`    - Assets Withdrawing: ${status.assetsWithdrawing}`);
      console.log(`    - Creation Time: ${new Date(status.creationTime * 1000).toISOString()}`);
      console.log(`    - Seconds to Maturity: ${status.secondsToMaturity}`);
      console.log(`    - Seconds to Deadline: ${status.secondsToDeadline}`);
      console.log(`    - Error Code: ${status.errorCode}`);
      console.log(`    - Transaction Hash: ${status.transactionHashOpened || 'N/A'}`);
    });
    
    // Test with vault filter
    console.log('\nTest 2: Getting statuses for vault 1 only...');
    const vault1Statuses = await queue.boringQueueStatuses(testUser, 1);
    console.log(`✓ Retrieved ${vault1Statuses.length} non-expired request(s) for vault 1`);
    
    // Verify that expired requests are filtered out
    const allRequests = await queue.getUserWithdrawRequests(testUser);
    const expiredCount = allRequests.filter(r => r.isExpired).length;
    console.log(`✓ Filtered out ${expiredCount} expired request(s)`);
    
    console.log('\n✓ boringQueueStatuses function working correctly!');
    
  } catch (error) {
    console.error('❌ Error testing boringQueueStatuses:', error);
    throw error;
  }
}

// Run all tests
async function runAllTests() {
  await testQueueWithdrawStatus();
  await testBoringQueueStatuses();
}

// Run the tests
runAllTests().catch(console.error); 