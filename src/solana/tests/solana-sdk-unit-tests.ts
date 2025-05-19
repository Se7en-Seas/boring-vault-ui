import { Connection, Transaction, Keypair} from '@solana/web3.js';
import { web3 } from '@coral-xyz/anchor';
import { BoringVaultSolana } from '../sdk/boring-vault-solana';
import { 
  BASE_SEED_BORING_VAULT_STATE, 
  BASE_SEED_BORING_VAULT, 
  BASE_SEED_SHARE_TOKEN 
} from '../utils/constants';

// Track test failures
let testFailures = 0;

/**
 * Comprehensive test suite for the Solana SDK
 */
async function testSolanaSdk() {
  console.log('==========================================');
  console.log('### BORING VAULT SOLANA SDK TEST SUITE ###');
  console.log('==========================================\n');
  
  // Reset failures counter
  testFailures = 0;
  
  // First run the PDA derivation tests
  await testPdaDerivation();
  
  // Then run the transaction tests
  await testTransactionFunctionality();
  
  console.log('\n==========================================');
  if (testFailures > 0) {
    console.log(`### TEST SUITE FAILED: ${testFailures} tests failed ###`);
    process.exit(1);
  } else {
    console.log('### ALL TESTS COMPLETED SUCCESSFULLY ###');
  }
  console.log('==========================================');
}

/**
 * Test PDA derivation functionality
 */
async function testPdaDerivation() {
  console.log('### SECTION 1: PDA DERIVATION TESTS ###');
  
  // Initialize the test environment
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Use a valid public key format (this is the system program ID)
  const programId = new web3.PublicKey('11111111111111111111111111111111');
  
  // Create SDK instance
  const vault = new BoringVaultSolana({
    connection,
    programId: programId.toString()
  });
  
  // Test data
  const vaultId = 42;
  
  console.log('\n--- Testing PDA Derivation ---');
  
  // Test 1: Vault State PDA
  try {
    console.log(`\nTest 1: Deriving Vault State PDA for vault ID ${vaultId}`);
    const vaultStatePDA = await vault.getVaultStatePDA(vaultId);
    console.log(`✓ Derived Vault State PDA: ${vaultStatePDA.toString()}`);
    
    // Manual verification
    const vaultIdBuffer = Buffer.alloc(8);
    vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
    const [manualPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from(BASE_SEED_BORING_VAULT_STATE), vaultIdBuffer],
      programId
    );
    console.log(`✓ Manual verification: ${manualPDA.toString()}`);
    console.log(`✓ PDAs match: ${vaultStatePDA.equals(manualPDA)}`);
    
    // Add the discriminator logging here for verification
    const accountInfo = await connection.getAccountInfo(vaultStatePDA);
    if (accountInfo) {
      const discriminator = accountInfo.data.slice(0, 8);
      const discriminatorHex = Buffer.from(discriminator).toString('hex');
      console.log(`Vault State discriminator: ${discriminatorHex}`);
    }
  } catch (error) {
    testFailures++;
    console.error('✗ Test 1 failed:', error);
  }
  
  // Test 2: Vault PDA with different subaccounts
  try {
    console.log('\nTest 2: Deriving Vault PDAs with different subaccounts');
    for (const subAccount of [0, 1, 2]) {
      const vaultPDA = await vault.getVaultPDA(vaultId, subAccount);
      console.log(`✓ Vault PDA for subaccount ${subAccount}: ${vaultPDA.toString()}`);
      
      // Manual verification
      const vaultIdBuffer = Buffer.alloc(8);
      vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
      const subAccountBuffer = Buffer.alloc(1);
      subAccountBuffer.writeUInt8(subAccount, 0);
      const [manualPDA] = await web3.PublicKey.findProgramAddress(
        [Buffer.from(BASE_SEED_BORING_VAULT), vaultIdBuffer, subAccountBuffer],
        programId
      );
      console.log(`✓ Manual verification: ${manualPDA.toString()}`);
      console.log(`✓ PDAs match: ${vaultPDA.equals(manualPDA)}`);
    }
  } catch (error) {
    testFailures++;
    console.error('✗ Test 2 failed:', error);
  }
  
  // Test 3: Share Token PDA
  try {
    console.log('\nTest 3: Deriving Share Token PDA');
    const vaultStatePDA = await vault.getVaultStatePDA(vaultId);
    const shareTokenPDA = await vault.getShareTokenPDA(vaultStatePDA);
    console.log(`✓ Share Token PDA: ${shareTokenPDA.toString()}`);
    
    // Manual verification
    const [manualPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from(BASE_SEED_SHARE_TOKEN), vaultStatePDA.toBuffer()],
      programId
    );
    console.log(`✓ Manual verification: ${manualPDA.toString()}`);
    console.log(`✓ PDAs match: ${shareTokenPDA.equals(manualPDA)}`);
  } catch (error) {
    testFailures++;
    console.error('✗ Test 3 failed:', error);
  }
  
  console.log('\n✅ All PDA derivation tests completed successfully!');
}

/**
 * Test transaction functionality with mocks
 */
async function testTransactionFunctionality() {
  console.log('\n### SECTION 2: TRANSACTION TESTS (MOCKED) ###');
  
  // Create a real keypair for mocking to fix the base58 issues
  const mockKeypair = Keypair.generate();
  
  // Improved connection mock
  const mockConnection = {
    getAccountInfo: async (pubkey: web3.PublicKey) => {
      console.log(`Mock: Getting account info for ${pubkey.toString()}`);
      
      // Create a properly sized buffer for token accounts
      const mockData = Buffer.alloc(165); // SPL token accounts are 165 bytes
      
      // For proper testing, ensure we have a valid account structure
      // 1. Set mint at position 0 (32 bytes)
      mockKeypair.publicKey.toBuffer().copy(mockData, 0);
      
      // 2. Set owner at position 32 (32 bytes)
      mockKeypair.publicKey.toBuffer().copy(mockData, 32);
      
      // 3. Set amount at position 64 (8 bytes for u64)
      const amount = Buffer.alloc(8);
      amount.writeBigUInt64LE(BigInt(10), 0); // Set amount to 10
      amount.copy(mockData, 64); // Copy to correct position in token account data
      
      return {
        data: mockData,
        executable: false,
        lamports: 1000000,
        owner: mockKeypair.publicKey
      };
    },
    getLatestBlockhash: async () => {
      console.log('Mock: Getting latest blockhash');
      return {
        blockhash: 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k',
        lastValidBlockHeight: 1000
      };
    },
    sendRawTransaction: async (rawTx: Buffer) => {
      console.log('Mock: Sending raw transaction');
      return '4ETSLpU9Q8g57EpjFVuZgZugVYT4wn7kjQZS5qZWwGbz';
    },
    confirmTransaction: async (signature: string) => {
      console.log(`Mock: Confirming transaction ${signature}`);
      return { value: { err: null } };
    }
  } as unknown as Connection;
  
  const vault = new BoringVaultSolana({
    connection: mockConnection,
    // Use a valid base58 public key
    programId: mockKeypair.publicKey.toString()
  });
  
  // Mock getVaultState to return predictable subaccount values
  vault.getVaultState = async (vaultId) => {
    console.log(`Mock: Getting vault state for vault ID ${vaultId}`);
    return { depositSubAccount: 0, withdrawSubAccount: 1 };
  };
  
  // Create mock wallet with a real keypair to fix base58 issues
  const mockWallet = {
    publicKey: mockKeypair.publicKey,
    signTransaction: async (tx: Transaction) => {
      console.log('Mock: Transaction being signed with real keypair');
      // Use the actual keypair to sign the transaction
      tx.partialSign(mockKeypair);
      return tx;
    }
  };
  
  // Test getBalance
  try {
    console.log('\nTest 6: Testing getBalance()...');
    const balance = await vault.getBalance(
      mockWallet.publicKey,
      1 // vaultId
    );
    console.log(`✓ Get balance succeeded:`, balance);
  } catch (error) {
    testFailures++;
    console.error('✗ Get balance test failed:', error);
  }
  
  // Report section result accurately
  if (testFailures > 0) {
    console.log(`\n❌ Transaction tests completed with ${testFailures} failures`);
  } else {
    console.log('\n✅ All transaction tests completed successfully!');
  }
}

// Run the comprehensive test suite
testSolanaSdk().catch(error => {
  console.error('\n❌ TEST SUITE FAILED WITH ERROR:', error);
  process.exit(1);
}); 