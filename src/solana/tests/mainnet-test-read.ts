import { web3 } from '@coral-xyz/anchor';
import { 
  AccountLayout, 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress
} from '@solana/spl-token';
import { Address } from 'gill';

// Import shared utilities
import { 
  solanaClient, 
  MAINNET_CONFIG, 
  loadKeypair, 
  getAccountExistenceStatus, 
  createConnection
} from './mainnet-test-utils';

// Import services and constants
import { VaultSDK } from '../sdk';
import { 
  JITO_SOL_MINT_ADDRESS, 
  BORING_VAULT_PROGRAM_ID,
  CONFIG_SEED,
  KNOWN_MINTS,
  SYSTEM_PROGRAM_ID,
} from '../utils/constants';

/**
 * Scan and analyze a Solana account to understand its structure
 */
export async function analyzeVaultAccount(): Promise<void> {
  try {
    console.log('\n=== ANALYZING VAULT ACCOUNT ===');
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    console.log(`Fetching data for vault: ${vaultPubkey.toString()}`);
    
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const boringVault = vaultService.getBoringVault();
    
    // Fetch vault data
    console.log('\n--- Basic Account Data ---');
    // Get the account directly
    const address = vaultPubkey.toBase58() as Address;
    const response = await solanaClient.rpc.getAccountInfo(
      address,
      { encoding: 'base64' }
    ).send();
    
    if (!response.value) {
      console.log('❌ Vault account not found');
      return;
    }
    
    console.log('✅ Vault account found');
    console.log(`Owner: ${response.value.owner}`);
    
    // Get the data buffer from base64 encoded data
    const data = Buffer.from(response.value.data[0], 'base64');
    console.log(`Size: ${data.length} bytes`);
    
    // Get the discriminator for verification
    const discriminator = data.slice(0, 8);
    const discriminatorHex = Buffer.from(discriminator).toString('hex');
    console.log(`Discriminator: ${discriminatorHex}`);
    
    // Use the VaultSDK to parse the vault data
    console.log('\n--- Parsed Vault Data ---');
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    const vaultId = Number(vaultData.config.vaultId);
    
    console.log(`Vault ID: ${vaultData.config.vaultId.toString()}`);
    console.log(`Authority: ${vaultData.config.authority.toString()}`);
    console.log(`Pending Authority: ${vaultData.config.pendingAuthority.toString()}`);
    console.log(`Share Mint: ${vaultData.config.shareMint.toString()}`);
    console.log(`Deposit Sub-Account: ${vaultData.config.depositSubAccount}`);
    console.log(`Withdraw Sub-Account: ${vaultData.config.withdrawSubAccount}`);
    console.log(`Paused: ${vaultData.config.paused}`);
    
    // Display asset data if available
    if (vaultData.teller) {
      console.log('\n--- Teller State ---');
      const baseAssetMint = vaultData.teller.baseAsset.toString();
      const baseAssetName = KNOWN_MINTS[baseAssetMint] || "Unknown";
      console.log(`Base Asset: ${baseAssetMint} (${baseAssetName})`);
      console.log(`Decimals: ${vaultData.teller.decimals}`);
      console.log(`Exchange Rate Provider: ${vaultData.teller.exchangeRateProvider.toString()}`);
      console.log(`Exchange Rate: ${vaultData.teller.exchangeRate.toString()}`);
      console.log(`Exchange Rate High Water Mark: ${vaultData.teller.exchangeRateHighWaterMark.toString()}`);
      console.log(`Fees Owed In Base Asset: ${vaultData.teller.feesOwedInBaseAsset.toString()}`);
      console.log(`Total Shares Last Update: ${vaultData.teller.totalSharesLastUpdate.toString()}`);
      console.log(`Last Update Timestamp: ${new Date(Number(vaultData.teller.lastUpdateTimestamp) * 1000).toISOString()}`);
      console.log(`Payout Address: ${vaultData.teller.payoutAddress.toString()}`);
      console.log(`Allowed Exchange Rate Change Upper Bound: ${vaultData.teller.allowedExchangeRateChangeUpperBound / 100}%`);
      console.log(`Allowed Exchange Rate Change Lower Bound: ${vaultData.teller.allowedExchangeRateChangeLowerBound / 100}%`);
      console.log(`Minimum Update Delay In Seconds: ${vaultData.teller.minimumUpdateDelayInSeconds}`);
      console.log(`Platform Fee: ${vaultData.teller.platformFeeBps / 100}%`);
      console.log(`Performance Fee: ${vaultData.teller.performanceFeeBps / 100}%`);
      console.log(`Withdraw Authority: ${vaultData.teller.withdrawAuthority.toString()}`);
    }
    
    // Derive and check important PDAs related to the vault
    console.log('\n--- Related PDAs and Accounts ---');

    // 1. Vault State PDA
    const vaultStatePDA = await boringVault.getVaultStatePDA(vaultId);
    console.log(`\nVault State PDA: ${vaultStatePDA.toString()}`);
    
    // 2. Deposit Vault PDA
    const depositVaultPDA = await boringVault.getVaultPDA(vaultId, vaultData.config.depositSubAccount);
    console.log(`\nDeposit Vault PDA (sub-account ${vaultData.config.depositSubAccount}): ${depositVaultPDA.toString()}`);
    const depositVaultInfo = await getAccountExistenceStatus(depositVaultPDA);
    console.log(`Status: ${depositVaultInfo}`);
    
    // 3. Withdraw Vault PDA
    const withdrawVaultPDA = await boringVault.getVaultPDA(vaultId, vaultData.config.withdrawSubAccount);
    console.log(`\nWithdraw Vault PDA (sub-account ${vaultData.config.withdrawSubAccount}): ${withdrawVaultPDA.toString()}`);
    const withdrawVaultInfo = await getAccountExistenceStatus(withdrawVaultPDA);
    console.log(`Status: ${withdrawVaultInfo}`);
    
    // 4. Share Token Mint PDA - We get this directly from vaultData but can also derive it
    const shareMintPDA = vaultData.config.shareMint;
    console.log(`\nShare Token Mint: ${shareMintPDA.toString()}`);
    const shareMintInfo = await getAccountExistenceStatus(shareMintPDA);
    console.log(`Status: ${shareMintInfo}`);
    
    // 5. Asset Data PDAs - If we have a base asset, check the related asset data
    if (vaultData.teller && vaultData.teller.baseAsset) {
      const baseAsset = vaultData.teller.baseAsset;
      console.log(`\nBase Asset: ${baseAsset.toString()}`);
      
      const assetDataPDA = await boringVault.getAssetDataPDA(vaultStatePDA, baseAsset);
      console.log(`Asset Data PDA: ${assetDataPDA.toString()}`);
      const assetDataInfo = await getAccountExistenceStatus(assetDataPDA);
      console.log(`Status: ${assetDataInfo}`);
      
      // 6. Check if the vault has token accounts for jitoSOL
      const jitoSolMint = new web3.PublicKey(JITO_SOL_MINT_ADDRESS);
      console.log(`\nChecking jitoSOL accounts...`);
      
      // Load signer for account lookups
      const signer = await loadKeypair();
      
      // Vault deposit account's jitoSOL account
      const depositVaultJitoSolATA = await getAssociatedTokenAddress(
        jitoSolMint,
        depositVaultPDA,
        true // allowOwnerOffCurve - this is crucial for PDAs
      );
      console.log(`Deposit Vault's jitoSOL Account: ${depositVaultJitoSolATA.toString()}`);
      const depositJitoSolInfo = await getAccountExistenceStatus(depositVaultJitoSolATA);
      console.log(`Status: ${depositJitoSolInfo}`);
      
      // Vault withdraw account's jitoSOL account
      const withdrawVaultJitoSolATA = await getAssociatedTokenAddress(
        jitoSolMint,
        withdrawVaultPDA,
        true // allowOwnerOffCurve - this is crucial for PDAs
      );
      console.log(`Withdraw Vault's jitoSOL Account: ${withdrawVaultJitoSolATA.toString()}`);
      const withdrawJitoSolInfo = await getAccountExistenceStatus(withdrawVaultJitoSolATA);
      console.log(`Status: ${withdrawJitoSolInfo}`);
      
      // 7. Check related jitoSOL Asset Data PDA
      const jitoSolAssetDataPDA = await boringVault.getAssetDataPDA(vaultStatePDA, jitoSolMint);
      console.log(`\njitoSOL Asset Data PDA: ${jitoSolAssetDataPDA.toString()}`);
      const jitoSolAssetDataInfo = await getAccountExistenceStatus(jitoSolAssetDataPDA);
      console.log(`Status: ${jitoSolAssetDataInfo}`);
    }
    
    // 8. Check program configuration if applicable
    console.log(`\nProgram Configuration PDA:`);
    // Use the new CONFIG_SEED constant
    const programId = new web3.PublicKey(BORING_VAULT_PROGRAM_ID);
    const [configPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from(CONFIG_SEED)],
      programId
    );
    console.log(`Config PDA: ${configPDA.toString()}`);
    const configInfo = await getAccountExistenceStatus(configPDA);
    console.log(`Status: ${configInfo}`);
    
    console.log('\n=== VAULT ANALYSIS COMPLETE ===');
    return;
  } catch (error) {
    console.error('Error analyzing vault account:', error);
  }
}

/**
 * Get user balance in the vault
 */
export async function fetchUserShares(userAddress?: string, vaultId?: number): Promise<void> {
  console.log('\n=== TESTING USER SHARES FETCH ===');
  
  try {
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    
    // Use provided address or load from keypair
    let targetUser: string;
    if (userAddress) {
      targetUser = userAddress;
    } else {
      const signer = await loadKeypair();
      targetUser = signer.address;
    }
    
    // Use provided vault ID or default from config
    const targetVaultId = vaultId ?? 12; // Default to vault 12 which is commonly used in tests
    
    console.log(`Fetching shares for user: ${targetUser}`);
    console.log(`Vault ID: ${targetVaultId}`);
    
    // Use the simplified SDK method directly - no need to fetch full vault data
    const userShares = await vaultService.fetchUserShares(targetUser, targetVaultId);
    
    console.log(`✅ User shares: ${userShares}`);
    
    if (userShares > 0) {
      console.log(`User owns ${userShares} shares in vault ${targetVaultId}`);
    } else {
      console.log('User has no shares in this vault');
    }
    
  } catch (error) {
    console.error('Error fetching user shares:', error);
  }
}

/**
 * Test fetching the value of 1 share in terms of the underlying base asset
 */
export async function testFetchShareValue(vaultId?: number): Promise<void> {
  console.log('\n=== TESTING FETCH SHARE VALUE ===');
  
  try {
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    
    // Use provided vault ID or default to 12
    const targetVaultId = vaultId ?? 12;
    console.log(`Testing vault ID: ${targetVaultId}`);
    
    // Test high-level VaultSDK API
    console.log('\n--- Testing VaultSDK.fetchShareValue() ---');
    const shareValue = await vaultService.fetchShareValue(targetVaultId);
    console.log(`✅ Share value: ${shareValue}`);
    console.log(`1 share = ${shareValue} base asset units`);
    
    // Test low-level BoringVaultSolana API for detailed info
    console.log('\n--- Testing BoringVaultSolana.fetchShareValue() ---');
    const boringVault = vaultService.getBoringVault();
    const shareValueInfo = await boringVault.fetchShareValue(targetVaultId);
    
    console.log(`Raw exchange rate: ${shareValueInfo.raw.toString()}`);
    console.log(`Formatted exchange rate: ${shareValueInfo.formatted}`);
    console.log(`Base asset decimals: ${shareValueInfo.decimals}`);
    
    // Validate that both APIs return consistent values
    // Low-level API returns raw data, high-level API formats it
    const lowLevelFormattedValue = Number(shareValueInfo.raw) / Math.pow(10, shareValueInfo.decimals);
    if (Math.abs(shareValue - lowLevelFormattedValue) < 0.000000001) {
      console.log(`✅ High-level and low-level APIs return consistent values`);
      console.log(`   High-level: ${shareValue} (formatted)`);
      console.log(`   Low-level: ${shareValueInfo.raw} raw → ${lowLevelFormattedValue} formatted`);
    } else {
      console.log(`❌ API inconsistency: ${shareValue} vs ${lowLevelFormattedValue}`);
    }
    
  } catch (error) {
    console.error('Error fetching share value:', error);
  }
}

/**
 * Test fetching the total assets (TVL) of a vault in terms of the base asset
 */
export async function testFetchTotalAssets(vaultId?: number): Promise<void> {
  console.log('\n=== TESTING FETCH TOTAL ASSETS (TVL) ===');
  
  try {
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    
    // Use provided vault ID or default to 12
    const targetVaultId = vaultId ?? 12;
    console.log(`Testing vault ID: ${targetVaultId}`);
    
    // Test high-level VaultSDK API
    console.log('\n--- Testing VaultSDK.fetchTotalAssets() ---');
    const totalAssets = await vaultService.fetchTotalAssets(targetVaultId);
    console.log(`✅ Total assets (TVL): ${totalAssets}`);
    console.log(`Vault TVL: ${totalAssets} base asset units`);
    
    // Test low-level BoringVaultSolana API for detailed info
    console.log('\n--- Testing BoringVaultSolana.fetchTotalAssets() ---');
    const boringVault = vaultService.getBoringVault();
    const totalAssetsInfo = await boringVault.fetchTotalAssets(targetVaultId);
    
    console.log(`Raw total assets: ${totalAssetsInfo.raw.toString()}`);
    console.log(`Formatted total assets: ${totalAssetsInfo.formatted}`);
    console.log(`Base asset decimals: ${totalAssetsInfo.decimals}`);
    
    // Validate that both APIs return consistent values
    // Low-level API returns raw data, high-level API formats it
    const lowLevelFormattedAssets = Number(totalAssetsInfo.raw) / Math.pow(10, totalAssetsInfo.decimals);
    if (Math.abs(totalAssets - lowLevelFormattedAssets) < 0.000000001) {
      console.log(`✅ High-level and low-level APIs return consistent values`);
      console.log(`   High-level: ${totalAssets} (formatted)`);
      console.log(`   Low-level: ${totalAssetsInfo.raw} raw → ${lowLevelFormattedAssets} formatted`);
    } else {
      console.log(`❌ API inconsistency: ${totalAssets} vs ${lowLevelFormattedAssets}`);
    }
    
    // Additional validation
    if (totalAssets > 0) {
      console.log(`✅ Total assets is positive: ${totalAssets}`);
    } else {
      console.log(`⚠️  Total assets is zero or negative: ${totalAssets}`);
    }
    
    // Show the calculation breakdown for transparency
    console.log('\n--- Calculation Breakdown ---');
    const shareSupply = await vaultService.fetchShareMintSupply(targetVaultId);
    const shareValue = await vaultService.fetchShareValue(targetVaultId);
    const calculatedTVL = shareSupply * shareValue;
    
    console.log(`Share supply: ${shareSupply}`);
    console.log(`Share value: ${shareValue}`);
    console.log(`Calculated TVL: ${shareSupply} × ${shareValue} = ${calculatedTVL}`);
    console.log(`Direct TVL fetch: ${totalAssets}`);
    
    if (Math.abs(calculatedTVL - totalAssets) < 0.000000001) {
      console.log(`✅ Manual calculation matches fetchTotalAssets result`);
    } else {
      console.log(`⚠️  Manual calculation (${calculatedTVL}) differs from fetchTotalAssets (${totalAssets})`);
    }
    
  } catch (error) {
    console.error('Error fetching total assets:', error);
  }
}

/**
 * Test getting vault balance (deposit account balance)
 */
export async function testGetVaultBalance(vaultId?: number): Promise<void> {
  console.log('\n=== TESTING GET VAULT BALANCE ===');
  
  try {
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    
    // Use provided vault ID or default to 12
    const targetVaultId = vaultId ?? 12;
    console.log(`Testing vault ID: ${targetVaultId}`);
    
    // Get vault pubkey from vault ID
    const vaultPubkey = await vaultService.getBoringVault().getVaultStatePDA(targetVaultId);
    console.log(`Vault pubkey: ${vaultPubkey.toString()}`);
    
    // Debug: Get vault data for context
    console.log('\n--- Vault Context Information ---');
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    console.log(`Vault ID: ${vaultData.config.vaultId.toString()}`);
    console.log(`Base Asset: ${vaultData.teller.baseAsset.toString()}`);
    console.log(`Deposit Sub-Account: ${vaultData.config.depositSubAccount}`);
    console.log(`Withdraw Sub-Account: ${vaultData.config.withdrawSubAccount}`);
    
    // Debug: Calculate and show deposit PDA
    const depositPDA = await vaultService.getBoringVault().getVaultPDA(targetVaultId, vaultData.config.depositSubAccount);
    console.log(`Calculated deposit PDA: ${depositPDA.toString()}`);
    
    // Debug: Get account info for the deposit PDA
    console.log('\n--- Account Analysis ---');
    const response = await vaultService['rpc'].getAccountInfo(
      depositPDA.toBase58() as any,
      { encoding: 'base64' }
    ).send();
    
    if (response.value) {
      console.log(`✅ Account exists:`);
      console.log(`  - Owner: ${response.value.owner}`);
      console.log(`  - Lamports: ${response.value.lamports}`);
      console.log(`  - Data length: ${response.value.data.length}`);
      console.log(`  - Data array length: ${response.value.data[0]?.length || 'N/A'}`);
      console.log(`  - Executable: ${response.value.executable}`);
      
      // Determine account type
      const owner = response.value.owner;
      if (owner === SYSTEM_PROGRAM_ID) {
        console.log(`  - Account Type: System Program (native SOL)`);
      } else if (owner === TOKEN_PROGRAM_ID.toString()) {
        console.log(`  - Account Type: Token Program (SPL token)`);
      } else {
        console.log(`  - Account Type: Unknown (${owner})`);
      }
      } else {
      console.log(`❌ Account does not exist`);
    }
    
    // Test getVaultBalance function
    console.log('\n--- Testing VaultSDK.getVaultBalance() ---');
    const balance = await vaultService.getVaultBalance(vaultPubkey);
    console.log(`✅ Raw vault balance: ${balance}`);
    
    // Convert to human-readable format
    const balanceNum = parseFloat(balance);
    if (balanceNum > 0) {
      // For System Program accounts, this is lamports (SOL)
      // For Token Program accounts, this depends on the token decimals
      const balanceInSol = balanceNum / Math.pow(10, 9);
      console.log(`✅ Vault balance (assuming SOL): ${balanceInSol} SOL`);
      console.log(`✅ Vault has deposits: ${balance} units`);
      console.log(`✅ Equivalent to: ${balanceInSol.toFixed(6)} SOL`);
          } else {
      console.log(`⚠️  Vault has no deposits in deposit account`);
      console.log(`This could mean:`);
      console.log(`  - No deposits have been made yet`);
      console.log(`  - All deposits have been withdrawn`);
      console.log(`  - Assets are in other vault accounts (not the deposit account)`);
    }
    
  } catch (error) {
    console.error('Error getting vault balance:', error);
  }
}

/**
 * Test queue withdraw status functionality against mainnet
 */
export async function testQueueWithdrawStatus(vaultId?: number): Promise<void> {
  console.log('\n=== TESTING QUEUE WITHDRAW STATUS FUNCTIONALITY ===');
  
  try {
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    
    // If no vault ID provided, get it from the configured vault
    let targetVaultId: number;
    if (vaultId !== undefined) {
      targetVaultId = vaultId;
      console.log(`Using specified Vault ID: ${targetVaultId}`);
    } else {
      const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
      console.log(`Fetching vault data for: ${vaultPubkey.toString()}`);
      const vaultData = await vaultService.getVaultData(vaultPubkey);
      targetVaultId = Number(vaultData.config.vaultId);
      console.log(`Using Vault ID from .env: ${targetVaultId}`);
    }
    
    // Load signer for user-specific data
    const signer = await loadKeypair();
    console.log(`Testing with user: ${signer.address}`);
    
    // Get the queue instance
    const queue = vaultService.getBoringOnchainQueue();
    
    // Test 1: Get User Withdraw State
    console.log('\n=== 1. USER WITHDRAW STATE ===');
    const userWithdrawState = await queue.getUserWithdrawState(signer.address);
    
    if (userWithdrawState) {
      console.log(`✓ User has withdraw state`);
      console.log(`  Last Nonce: ${userWithdrawState.lastNonce}`);
      console.log(`  Total requests made: ${Number(userWithdrawState.lastNonce) + 1}`);
    } else {
      console.log(`❌ User has no withdraw state (no requests made yet)`);
      console.log(`This is expected if the user hasn't made any queue withdraw requests.`);
      return;
    }
    
    // Test 2: Get All User Withdraw Requests
    console.log('\n=== 2. ALL USER WITHDRAW REQUESTS ===');
    const allRequests = await queue.getUserWithdrawRequests(signer.address);
    console.log(`✓ Found ${allRequests.length} total withdraw request(s)`);
    
    if (allRequests.length === 0) {
      console.log(`No withdraw requests found for user ${signer.address}`);
      return;
    }
    
    // Display all requests
    allRequests.forEach((request: any, index: number) => {
      console.log(`\nRequest ${index + 1}:`);
      console.log(`  - Nonce: ${Number(request.data.nonce)}`);
      console.log(`  - Vault ID: ${request.data.vaultId}`);
      console.log(`  - Asset Out: ${request.data.assetOut.toString()}`);
      console.log(`  - Share Amount: ${request.data.shareAmount.toString()} (${Number(request.data.shareAmount) / 1e9} shares)`);
      console.log(`  - Asset Amount: ${request.data.assetAmount.toString()}`);
      console.log(`  - Created: ${new Date(Number(request.data.creationTime) * 1000).toISOString()}`);
      console.log(`  - Seconds to Maturity: ${request.data.secondsToMaturity}`);
      console.log(`  - Seconds to Deadline: ${request.data.secondsToDeadline}`);
      console.log(`  - Is Matured: ${request.isMatured}`);
      console.log(`  - Is Expired: ${request.isExpired}`);
      console.log(`  - Time to Maturity: ${request.timeToMaturity}s`);
      console.log(`  - Time to Deadline: ${request.timeToDeadline}s`);
      
      // Status summary
      let status = 'Unknown';
      if (request.isExpired) {
        status = 'Expired';
      } else if (request.isMatured) {
        status = 'Ready to fulfill';
      } else {
        status = `Maturing (${Math.ceil(request.timeToMaturity / 60)} minutes left)`;
      }
      console.log(`  - Status: ${status}`);
    });
    
    // Test 3: Filter by Target Vault ID
    console.log(`\n=== 3. REQUESTS FOR VAULT ${targetVaultId} ===`);
    const vaultRequests = await queue.getUserWithdrawRequests(signer.address, targetVaultId);
    console.log(`✓ Found ${vaultRequests.length} withdraw request(s) for vault ${targetVaultId}`);
    
    if (vaultRequests.length > 0) {
      vaultRequests.forEach((request: any, index: number) => {
        console.log(`\nVault ${targetVaultId} Request ${index + 1}:`);
        console.log(`  - Nonce: ${Number(request.data.nonce)}`);
        console.log(`  - Share Amount: ${Number(request.data.shareAmount) / 1e9} shares`);
        console.log(`  - Asset Out: ${request.data.assetOut.toString()}`);
        console.log(`  - Status: ${request.isExpired ? 'Expired' : request.isMatured ? 'Ready to fulfill' : 'Maturing'}`);
      });
    }
    
    // Test 4: Test boringQueueStatuses function (user-facing API)
    console.log(`\n=== 4. BORING QUEUE STATUSES (USER-FACING API) ===`);
    const queueStatuses = await queue.boringQueueStatuses(signer.address);
    console.log(`✓ Retrieved ${queueStatuses.length} non-expired queue status(es)`);
    
    if (queueStatuses.length > 0) {
      queueStatuses.forEach((status: any, index: number) => {
        console.log(`\nStatus ${index + 1}:`);
        console.log(`  - Nonce: ${status.nonce}`);
        console.log(`  - User: ${status.user}`);
        console.log(`  - Token Out: ${status.tokenOut.address} (${status.tokenOut.decimals} decimals)`);
        console.log(`  - Shares Withdrawing: ${status.sharesWithdrawing}`);
        console.log(`  - Assets Withdrawing: ${status.assetsWithdrawing}`);
        console.log(`  - Creation Time: ${new Date(status.creationTime * 1000).toISOString()}`);
        console.log(`  - Seconds to Maturity: ${status.secondsToMaturity}`);
        console.log(`  - Seconds to Deadline: ${status.secondsToDeadline}`);
        console.log(`  - Error Code: ${status.errorCode}`);
        console.log(`  - Transaction Hash: ${status.transactionHashOpened || 'N/A'}`);
      });
        } else {
      console.log(`No non-expired queue statuses found (expired requests are filtered out)`);
    }
    
    // Test 5: Test boringQueueStatuses with vault filter
    console.log(`\n=== 5. BORING QUEUE STATUSES FOR VAULT ${targetVaultId} ===`);
    const vaultStatuses = await queue.boringQueueStatuses(signer.address, targetVaultId);
    console.log(`✓ Retrieved ${vaultStatuses.length} non-expired queue status(es) for vault ${targetVaultId}`);
    
    if (vaultStatuses.length > 0) {
      vaultStatuses.forEach((status: any, index: number) => {
        console.log(`\nVault ${targetVaultId} Status ${index + 1}:`);
        console.log(`  - Nonce: ${status.nonce}`);
        console.log(`  - Shares Withdrawing: ${status.sharesWithdrawing}`);
        console.log(`  - Assets Withdrawing: ${status.assetsWithdrawing}`);
        console.log(`  - Token Out: ${status.tokenOut.address}`);
        console.log(`  - Creation Time: ${new Date(status.creationTime * 1000).toISOString()}`);
      });
    }
    
    // Test 6: Test individual request lookup
    if (allRequests.length > 0) {
      console.log(`\n=== 6. INDIVIDUAL REQUEST LOOKUP ===`);
      const firstRequest = allRequests[0];
      const requestNonce = Number(firstRequest.data.nonce);
      
      console.log(`Testing getWithdrawRequest for nonce ${requestNonce}...`);
      const individualRequest = await queue.getWithdrawRequest(signer.address, requestNonce);
      
      if (individualRequest) {
        console.log(`✓ Successfully retrieved request ${requestNonce}`);
        console.log(`  - Vault ID: ${individualRequest.data.vaultId}`);
        console.log(`  - Asset Out: ${individualRequest.data.assetOut.toString()}`);
        console.log(`  - Share Amount: ${Number(individualRequest.data.shareAmount) / 1e9} shares`);
        console.log(`  - Is Matured: ${individualRequest.isMatured}`);
        console.log(`  - Is Expired: ${individualRequest.isExpired}`);
      } else {
        console.log(`❌ Failed to retrieve request ${requestNonce}`);
      }
      
      // Test getWithdrawStatus convenience wrapper
      console.log(`\nTesting getWithdrawStatus wrapper for nonce ${requestNonce}...`);
      const withdrawStatus = await queue.getWithdrawStatus(signer.address, requestNonce);
      
      console.log(`✓ Withdraw status retrieved`);
      console.log(`  - Request exists: ${withdrawStatus.exists}`);
      console.log(`  - Is matured: ${withdrawStatus.isMatured}`);
      console.log(`  - Is expired: ${withdrawStatus.isExpired}`);
      console.log(`  - Time to maturity: ${withdrawStatus.timeToMaturity}s`);
      console.log(`  - Time to deadline: ${withdrawStatus.timeToDeadline}s`);
    }
    
    // Test 7: Test non-existent request
    console.log(`\n=== 7. NON-EXISTENT REQUEST TEST ===`);
    const nonExistentStatus = await queue.getWithdrawStatus(signer.address, 999);
    console.log(`✓ Non-existent request handled correctly`);
    console.log(`  - Request exists: ${nonExistentStatus.exists}`);
    console.log(`  - Is matured: ${nonExistentStatus.isMatured}`);
    console.log(`  - Is expired: ${nonExistentStatus.isExpired}`);
    
    console.log('\n=== QUEUE WITHDRAW STATUS TEST COMPLETE ===');
    
  } catch (error) {
    console.error('Error testing queue withdraw status:', error);
    throw error;
  }
} 