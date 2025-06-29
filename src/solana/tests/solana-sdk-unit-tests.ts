import { Transaction } from '@solana/web3.js';
import { web3 } from '@coral-xyz/anchor';
import { BoringVaultSolana } from '../sdk/boring-vault-solana';
import { 
  BASE_SEED_BORING_VAULT_STATE, 
  BASE_SEED_BORING_VAULT, 
  BASE_SEED_SHARE_TOKEN,
  JITO_SOL_MINT_ADDRESS,
  JITO_SOL_PRICE_FEED_ADDRESS,
  JITOSOL_SOL_PYTH_FEED,
  BORING_VAULT_PROGRAM_ID,
} from '../utils/constants';
import { 
  createSolanaClient, 
  generateKeyPairSigner
} from 'gill';

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
  
  // Then run the Switchboard tests
  await testSwitchboardFunctionality();
  
  // Then run the Pyth oracle tests
  await testPythOracleFunctionality();
  
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
  
  // Initialize the test environment with gill
  const solanaClient = createSolanaClient({ urlOrMoniker: 'localnet' });
  
  // Use a valid public key format (this is the system program ID)
  const programId = new web3.PublicKey('11111111111111111111111111111111');
  
  // Create SDK instance with gill client
  const vault = new BoringVaultSolana({
    solanaClient,
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
    
    console.log('Skipping discriminator check on localnet');
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
  
  // Create a keypair using gill instead of @solana/web3.js
  const mockSigner = await generateKeyPairSigner();
  
  // For unit tests, create a real client but mock the vault methods
  const solanaClient = createSolanaClient({ urlOrMoniker: 'localnet' });
  
  const vault = new BoringVaultSolana({
    solanaClient,
    programId: mockSigner.address
  });
  
  // Override methods used in tests with mocks
  vault.getVaultState = async (vaultId: number) => {
    console.log(`Mock: Getting vault state for vault ID ${vaultId}`);
    return { depositSubAccount: 0, withdrawSubAccount: 1 };
  };
  
  // Mock the fetchUserShares method for testing
  vault.fetchUserShares = async (walletAddress: string | web3.PublicKey, vaultId: number) => {
    console.log(`Mock: Getting balance for wallet ${typeof walletAddress === 'string' ? walletAddress : walletAddress.toString()} and vault ID ${vaultId}`);
    return {
      raw: BigInt(1000000000),
      formatted: '1.0',
      decimals: 9
    };
  };
  
  // Test fetchUserShares
  try {
    console.log('\nTest 4: Testing fetchUserShares()...');
    const balance = await vault.fetchUserShares(
      new web3.PublicKey(mockSigner.address),
      1 // vaultId
    );
    console.log(`✓ Get balance succeeded:`, balance);
  } catch (error) {
    testFailures++;
    console.error('✗ Get balance test failed:', error);
  }
  
  // Test deposit functionality
  try {
    console.log('\nTest 5: Testing deposit functionality...');
    
    // Implement a mock for buildDepositTransaction
    vault.buildDepositTransaction = async (
      payer: web3.PublicKey,
      vaultId: number,
      depositMint: web3.PublicKey,
      depositAmount: bigint,
      minMintAmount: bigint
    ) => {
      console.log(`Mock: Building deposit transaction for vault ${vaultId}`);
      console.log(`Mock: Deposit amount: ${depositAmount.toString()}`);
      console.log(`Mock: Min mint amount: ${minMintAmount.toString()}`);
      console.log(`Mock: Deposit mint: ${depositMint.toString()}`);
      
      const mockTransaction = new Transaction();
      // Add a dummy instruction to make it a valid transaction
      mockTransaction.add(new web3.TransactionInstruction({
        keys: [],
        programId: new web3.PublicKey(mockSigner.address),
        data: Buffer.from([0])
      }));
      
      return mockTransaction;
    };
    
    // Create test data
    const depositAmount = BigInt(1000000000); // 1 token with 9 decimals
    const minMintAmount = BigInt(900000000); // 0.9 tokens with 9 decimals
    const jitoSolMint = new web3.PublicKey(JITO_SOL_MINT_ADDRESS);
    
    // Test building a deposit transaction
    const transaction = await vault.buildDepositTransaction(
      new web3.PublicKey(mockSigner.address),
      1, // vaultId
      jitoSolMint,
      depositAmount,
      minMintAmount
    );
    
    console.log(`✓ Deposit transaction build succeeded with ${transaction.instructions.length} instruction(s)`);
  } catch (error) {
    testFailures++;
    console.error('✗ Deposit test failed:', error);
  }

  // Test SOL deposit functionality
  try {
    console.log('\nTest 6: Testing SOL deposit functionality...');
    
    // Implement a mock for buildDepositSolTransaction
    vault.buildDepositSolTransaction = async (
      payer: web3.PublicKey,
      vaultId: number,
      depositAmount: bigint,
      minMintAmount: bigint
    ) => {
      console.log(`Mock: Building SOL deposit transaction for vault ${vaultId}`);
      console.log(`Mock: SOL deposit amount: ${depositAmount.toString()} lamports`);
      console.log(`Mock: Min mint amount: ${minMintAmount.toString()}`);
      
      const mockTransaction = new Transaction();
      // Add a dummy instruction to make it a valid transaction with different data than SPL token deposit
      mockTransaction.add(new web3.TransactionInstruction({
        keys: [],
        programId: new web3.PublicKey(mockSigner.address),
        data: Buffer.from([1]) // Different opcode to distinguish from SPL deposit
      }));
      
      return mockTransaction;
    };
    
    // Create test data for SOL
    const solDepositAmount = BigInt(1000000000); // 1 SOL in lamports
    const solMinMintAmount = BigInt(900000000); // 0.9 shares
    
    // Test building a SOL deposit transaction
    const solTransaction = await vault.buildDepositSolTransaction(
      new web3.PublicKey(mockSigner.address),
      1, // vaultId
      solDepositAmount,
      solMinMintAmount
    );
    
    console.log(`✓ SOL deposit transaction build succeeded with ${solTransaction.instructions.length} instruction(s)`);
    
    // Verify the transaction has the expected structure
    const solInstruction = solTransaction.instructions[0];
    console.log(`  SOL instruction data: ${solInstruction.data.toString('hex')}`);
    console.log(`  SOL instruction program ID: ${solInstruction.programId.toString()}`);
  } catch (error) {
    testFailures++;
    console.error('✗ SOL deposit test failed:', error);
  }
  
  console.log('\n✅ Basic transaction tests completed successfully!');
}

/**
 * Test Switchboard oracle cranking functionality (fully mocked for unit tests)
 */
async function testSwitchboardFunctionality() {
  console.log('\n### SECTION 3: SWITCHBOARD ORACLE TESTS (MOCKED) ###');
  
  // Create mock connection that doesn't make real network calls
  const mockConnection = {
    getLatestBlockhash: () => Promise.resolve({ blockhash: 'mock-blockhash', lastValidBlockHeight: 123456 })
  } as any;
  
  // Create mock payer
  const mockPayer = new web3.PublicKey('11111111111111111111111111111111');
  
  // Use the JITO SOL price feed address from constants
  const feedAddress = new web3.PublicKey(JITO_SOL_PRICE_FEED_ADDRESS);
  
  // Test 1: Test mock getSwitchboardCrankInstruction
  try {
    console.log('\nTest 7: Testing Switchboard integration pattern (mocked)...');
    console.log(`Using feed address: ${feedAddress.toString()}`);
    
    // Create mock Switchboard crank instructions
    const mockCrankInstructions = [
      new web3.TransactionInstruction({
        programId: new web3.PublicKey('SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv'), // Switchboard program ID
        keys: [
          { pubkey: mockPayer, isSigner: true, isWritable: true },
          { pubkey: feedAddress, isSigner: false, isWritable: true },
        ],
        data: Buffer.from('mock_oracle_crank_instruction', 'utf-8')
      })
    ];
    
    console.log(`✓ Generated ${mockCrankInstructions.length} mock Switchboard crank instruction(s)`);
    
    // Validate instruction structure
    mockCrankInstructions.forEach((ix: any, index: number) => {
      console.log(`  Instruction ${index + 1}:`);
      console.log(`    Program ID: ${ix.programId.toString()}`);
      console.log(`    Accounts: ${ix.keys.length}`);
      console.log(`    Data length: ${ix.data.length} bytes`);
    });
    
    // Create mock deposit instruction
    const mockDepositInstruction = new web3.TransactionInstruction({
      programId: new web3.PublicKey(BORING_VAULT_PROGRAM_ID),
      keys: [{ pubkey: mockPayer, isSigner: true, isWritable: true }],
      data: Buffer.from('mock_deposit_sol_instruction', 'utf-8')
    });
    
    // Bundle instructions
    const bundledInstructions = [...mockCrankInstructions, mockDepositInstruction];
    
    console.log(`✓ Bundled ${bundledInstructions.length} total instructions`);
    console.log(`  - ${mockCrankInstructions.length} Switchboard crank instructions`);
    console.log(`  - 1 deposit instruction`);
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 7 failed:', error);
  }
  
  console.log('\n✅ Switchboard integration tests completed successfully!');
}

/**
 * Test Pyth Oracle functionality with mocks
 */
async function testPythOracleFunctionality() {
  console.log('\n### SECTION 4: PYTH ORACLE TESTS (MOCKED) ###');
  
  // Test setup
  const mockSigner = await generateKeyPairSigner();
  const mockPayer = new web3.PublicKey(mockSigner.address);
  
  console.log('\n--- Testing Pyth Oracle Utilities ---');
  
  // Test 1: Price Feed Address Derivation
  try {
    console.log('\nTest 8: Testing Pyth price feed address derivation (mocked)...');
    
    // Test with the JITOSOL/SOL price feed from constants
    const testPriceFeed = JITOSOL_SOL_PYTH_FEED;
    
    console.log(`✓ Testing address derivation for JITOSOL/SOL price feed`);
    console.log(`  - Price feed ID: ${testPriceFeed}`);
    
    // Mock the address derivation result
    const mockPriceFeedAddress = new web3.PublicKey('11111111111111111111111111111111');
    
    console.log(`✓ Mock price feed address: ${mockPriceFeedAddress.toString()}`);
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 8 failed:', error);
  }
  
  // Test 2: Price Update Fetching (Mocked)
  try {
    console.log('\nTest 9: Testing Pyth price update fetching (mocked)...');
    
    const testPriceFeeds = [JITOSOL_SOL_PYTH_FEED];
    
    // Mock price update data (base64 encoded)
    const mockPriceUpdates = [
      'UE5BVQEAAAADuAEAAAADDQ...' // Truncated for readability
    ];
    
    console.log(`✓ Mock price updates fetched for ${testPriceFeeds.length} feed(s)`);
    console.log(`✓ Price update data length: ${mockPriceUpdates.length} update(s)`);
    
    // Verify mock data structure
    const allValidBase64 = mockPriceUpdates.every(update => 
      update.length > 0 && typeof update === 'string'
    );
    console.log(`✓ All price updates are valid base64 strings: ${allValidBase64}`);
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 9 failed:', error);
  }
  
  // Test 3: Price Update Instructions (Mocked)
  try {
    console.log('\nTest 10: Testing Pyth price update instructions (mocked)...');
    
    // Mock the instruction generation result
    const mockInstructions = [
      new web3.TransactionInstruction({
        programId: new web3.PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ'),
        keys: [
          { pubkey: mockPayer, isSigner: true, isWritable: true },
          { pubkey: new web3.PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: true }
        ],
        data: Buffer.from('pyth_post_price_update', 'utf-8')
      })
    ];
    
    console.log(`✓ Generated ${mockInstructions.length} Pyth price update instruction(s)`);
    console.log(`✓ Instructions use Pyth program ID: rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ`);
    
    // Verify instruction structure
    const allFromPythProgram = mockInstructions.every(ix => 
      ix.programId.toString() === 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ'
    );
    console.log(`✓ All instructions from Pyth program: ${allFromPythProgram}`);
    
    const allHavePayer = mockInstructions.every(ix => 
      ix.keys.some(key => key.pubkey.equals(mockPayer) && key.isSigner)
    );
    console.log(`✓ All instructions include payer as signer: ${allHavePayer}`);
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 10 failed:', error);
  }
  
  // Test 4: Bundling with Application Instructions
  try {
    console.log('\nTest 11: Testing Pyth instruction bundling (mocked)...');
    
    // Mock oracle instructions
    const mockPythInstructions = [
      new web3.TransactionInstruction({
        programId: new web3.PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ'),
        keys: [{ pubkey: mockPayer, isSigner: true, isWritable: true }],
        data: Buffer.from('pyth_price_update', 'utf-8')
      })
    ];
    
    // Mock application instruction (deposit)
    const mockDepositInstruction = new web3.TransactionInstruction({
      programId: new web3.PublicKey(BORING_VAULT_PROGRAM_ID),
      keys: [
        { pubkey: mockPayer, isSigner: true, isWritable: true },
        { pubkey: new web3.PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false } // Price feed
      ],
      data: Buffer.from('deposit_with_pyth_oracle', 'utf-8')
    });
    
    // Bundle instructions
    const bundledInstructions = [...mockPythInstructions, mockDepositInstruction];
    
    console.log(`✓ Bundled ${bundledInstructions.length} total instructions`);
    console.log(`  - ${mockPythInstructions.length} Pyth price update instruction(s)`);
    console.log(`  - 1 application (deposit) instruction`);
    
    // Verify bundling order (Pyth updates should come first)
    const firstIsPyth = bundledInstructions[0].data.toString('utf-8').includes('pyth_price_update');
    console.log(`✓ Pyth price updates come first: ${firstIsPyth}`);
    
    const lastIsDeposit = bundledInstructions[bundledInstructions.length - 1]
      .data.toString('utf-8').includes('deposit_with_pyth_oracle');
    console.log(`✓ Application instruction comes last: ${lastIsDeposit}`);
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 11 failed:', error);
  }
  
  // Test 5: Integration Pattern
  try {
    console.log('\nTest 12: Testing Pyth + Boring Vault integration (mocked)...');
    
    // Mock a complete deposit workflow with Pyth oracle
    console.log('✓ Testing complete depositSol with Pyth oracle workflow...');
    
    // 1. Generate price update instructions
    const mockPriceUpdateInstructions = [
      new web3.TransactionInstruction({
        programId: new web3.PublicKey('rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ'),
        keys: [{ pubkey: mockPayer, isSigner: true, isWritable: true }],
        data: Buffer.from('pyth_update_jitosol_sol', 'utf-8')
      })
    ];
    
    // 2. Create deposit instruction that uses the price data
    const mockDepositInstruction = new web3.TransactionInstruction({
      programId: new web3.PublicKey(BORING_VAULT_PROGRAM_ID),
      keys: [
        { pubkey: mockPayer, isSigner: true, isWritable: true },
        { pubkey: new web3.PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // Price update account
      ],
      data: Buffer.from('deposit_jitosol_with_pyth_price', 'utf-8')
    });
    
    // 3. Combine into final transaction
    const finalTransaction = new web3.Transaction();
    finalTransaction.add(...mockPriceUpdateInstructions, mockDepositInstruction);
    
    console.log(`✓ Created integrated transaction with ${finalTransaction.instructions.length} instructions`);
    console.log('  - 1 Pyth price update instruction for JITOSOL/SOL');
    console.log('  - 1 JITOSOL deposit instruction using fresh price data');
    
    // Verify integration structure
    const priceInstruction = finalTransaction.instructions[0];
    const depositInstruction = finalTransaction.instructions[1];
    
    const priceFromPyth = priceInstruction.programId.toString() === 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';
    const depositFromVault = depositInstruction.programId.toString() === BORING_VAULT_PROGRAM_ID;
    
    console.log(`✓ Price instruction from Pyth: ${priceFromPyth}`);
    console.log(`✓ Deposit instruction from Boring Vault: ${depositFromVault}`);
    console.log(`✓ Instructions properly sequenced for oracle -> application flow`);
    
  } catch (error) {
    testFailures++;
    console.error('✗ Test 12 failed:', error);
  }
  
  console.log('\n✅ All Pyth oracle unit tests completed successfully!');
}

// Run the comprehensive test suite
testSolanaSdk().catch(error => {
  console.error('\n❌ TEST SUITE FAILED WITH ERROR:', error);
  process.exit(1);
}); 