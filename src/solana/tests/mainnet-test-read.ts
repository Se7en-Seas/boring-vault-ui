import { web3 } from '@coral-xyz/anchor';
import { 
  AccountLayout, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync
} from '@solana/spl-token';
import { Address } from 'gill';

// Import shared utilities
import { 
  solanaClient, 
  MAINNET_CONFIG, 
  loadKeypair, 
  getAccountExistenceStatus, 
  TOKEN_MINTS,
  createConnection
} from './mainnet-test-utils';

// Import services and constants
import { VaultSDK } from '../sdk';
import { 
  JITO_SOL_MINT_ADDRESS, 
  BORING_VAULT_PROGRAM_ID,
  BORING_QUEUE_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  CONFIG_SEED,
  KNOWN_MINTS
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
 * Run read-only tests against the vault
 */
export async function testReadOperations() {
  console.log('\n=== VAULT DATA DETAILS ===');
  
  try {
    // Create service instances - passing RPC URL directly
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    // Fetch vault data
    console.log(`Fetching data for vault: ${vaultPubkey.toString()}`);
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    
    // Display vault data in a clean format
    console.log('\n=== VAULT STATE ===');
    console.log(`Vault ID: ${vaultData.config.vaultId.toString()}`);
    console.log(`Authority: ${vaultData.config.authority.toString()}`);
    console.log(`Share Mint: ${vaultData.config.shareMint.toString()}`);
    console.log(`Deposit Sub-Account: ${vaultData.config.depositSubAccount}`);
    console.log(`Withdraw Sub-Account: ${vaultData.config.withdrawSubAccount}`);
    console.log(`Paused: ${vaultData.config.paused}`);
    
    // Display asset data if available
    if (vaultData.teller) {
      console.log('\n=== ASSET DATA ===');
      console.log(`Base Asset: ${vaultData.teller.baseAsset.toString()}`);
      console.log(`Platform Fee: ${vaultData.teller.platformFeeBps / 100}%`);
      console.log(`Performance Fee: ${vaultData.teller.performanceFeeBps / 100}%`);
    }
    
    // Fetch vault balance
    console.log('\n=== VAULT BALANCE ===');
    
    const balance = await vaultService.getVaultBalance(vaultPubkey);
    console.log(`Balance: ${balance} lamports`);
    
    return vaultData;
  } catch (error) {
    console.error('Read-only tests failed:', error);
    throw error;
  } finally {
    console.log('\nVault data analysis completed');
  }
}

/**
 * Test user balances in the vault
 */
export async function testUserBalances(): Promise<any[] | undefined> {
  console.log('\n=== TESTING USER BALANCES ===');
  
  try {
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const signer = await loadKeypair();
    
    // Use signer.address instead of signer.publicKey.toString()
    console.log(`Checking balances for wallet: ${signer.address}`);
    
    // Get native SOL balance with base64 encoding
    const signerAddress = signer.address;
    const solBalanceResponse = await solanaClient.rpc.getBalance(signerAddress).send();
    const solBalance = Number(solBalanceResponse.value);
    console.log(`\nNative SOL Balance: ${solBalance / 1_000_000_000} SOL (${solBalance} lamports)`);
    
    // Use gill to get token accounts with base64 encoding
    const tokenAccountsResponse = await solanaClient.rpc.getTokenAccountsByOwner(
      signerAddress,
      { programId: TOKEN_PROGRAM_ID.toString() as Address },
      { encoding: 'base64' }
    ).send();
    
    const tokenAccounts = tokenAccountsResponse.value.map(item => {
      // Convert the account data Buffer to the format we need
      const data = Buffer.from(item.account.data[0], 'base64');
      const accountData = AccountLayout.decode(data);

      return {
        pubkey: item.pubkey,
        mint: new web3.PublicKey(accountData.mint),
        owner: new web3.PublicKey(accountData.owner),
        amount: accountData.amount.toString()
      };
    });
    
    console.log('Token accounts:');
    tokenAccounts.forEach((account, i) => {
      console.log(`[${i+1}] Mint: ${account.mint.toString()}`);
      console.log(`    Balance: ${account.amount}`);
    });
    
    return tokenAccounts;
  } catch (error) {
    console.error('Error testing user balances:', error);
    throw error;
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
 * Verify the existence of a specific Vault PDA and check its transaction history
 */
export async function verifyVaultPDA(): Promise<void> {
  try {
    console.log('\n=== VERIFYING VAULT PDA EXISTENCE ===');
    
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    // Load admin keypair
    const signer = await loadKeypair();
    console.log(`Using signer: ${signer.address}`);
    
    // Get vault data to extract vault ID
    console.log(`\nFetching data for vault: ${vaultPubkey.toString()}`);
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    const vaultId = Number(vaultData.config.vaultId);
    const depositSubAccount = vaultData.config.depositSubAccount;
    
    console.log(`Vault ID: ${vaultId}`);
    console.log(`Authority: ${vaultData.config.authority.toString()}`);
    console.log(`Deposit Sub-Account: ${depositSubAccount}`);
    
    // Create direct Solana connection for checking accounts
    console.log(`\nChecking account with three different methods:`);
    
    // Method 1: Use the VaultSDK to derive the PDA
    const boringVault = vaultService.getBoringVault();
    const vaultPDA = await boringVault.getVaultPDA(vaultId, depositSubAccount);
    console.log(`\nDerived Vault PDA: ${vaultPDA.toString()}`);
    
    // Method 2: Manual derivation to verify
    const vaultIdBuffer = Buffer.alloc(8);
    vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
    const subAccountBuffer = Buffer.from([depositSubAccount]);
    
    const [manualPDA, bump] = await web3.PublicKey.findProgramAddress(
      [
        Buffer.from("boring-vault"),
        vaultIdBuffer,
        subAccountBuffer
      ],
      new web3.PublicKey(BORING_VAULT_PROGRAM_ID)
    );
    
    console.log(`Manually derived PDA: ${manualPDA.toString()}`);
    console.log(`Bump: ${bump}`);
    console.log(`Matches SDK-derived PDA? ${manualPDA.equals(vaultPDA) ? 'Yes' : 'No'}`);
    
    // Method 3: Direct connection with web3.js
    console.log(`\nChecking account existence with different RPC endpoints:`);
    
    // Create a connection without websockets
    const connection = createConnection();
    
    try {
      console.log(`\n1. Using Alchemy RPC:`);
      const accountInfo = await connection.getAccountInfo(vaultPDA);
      if (accountInfo) {
        console.log(`✅ Account EXISTS via Alchemy`);
        console.log(`Owner: ${accountInfo.owner.toString()}`);
        console.log(`Data Size: ${accountInfo.data.length} bytes`);
        console.log(`Executable: ${accountInfo.executable}`);
        console.log(`Lamports: ${accountInfo.lamports}`);
      } else {
        console.log(`❌ Account DOES NOT EXIST via Alchemy`);
      }
    } catch (error) {
      console.error(`Error checking with Alchemy: ${error}`);
    }
    
    // Check with public RPC
    const publicConnection = new web3.Connection(
      'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    
    try {
      console.log(`\n2. Using Public RPC:`);
      const publicInfo = await publicConnection.getAccountInfo(vaultPDA);
      if (publicInfo) {
        console.log(`✅ Account EXISTS via Public RPC`);
        console.log(`Owner: ${publicInfo.owner.toString()}`);
        console.log(`Data Size: ${publicInfo.data.length} bytes`);
      } else {
        console.log(`❌ Account DOES NOT EXIST via Public RPC`);
      }
    } catch (error) {
      console.error(`Error checking with Public RPC: ${error}`);
    }
    
    // Check for transaction history
    console.log(`\n3. Checking for transaction history:`);
    
    try {
      const signatures = await connection.getSignaturesForAddress(vaultPDA, { limit: 5 });
      if (signatures && signatures.length > 0) {
        console.log(`✅ Found ${signatures.length} transactions for this account`);
        signatures.forEach((sig, i) => {
          const date = sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'unknown time';
          console.log(`[${i+1}] ${sig.signature} (${date})`);
          if (sig.err) {
            console.log(`   Error: ${JSON.stringify(sig.err)}`);
          } else {
            console.log(`   Success`);
          }
        });
      } else {
        console.log(`❌ No transactions found for this account`);
      }
    } catch (error) {
      console.error(`Error fetching transaction history: ${error}`);
    }
    
    // Check the jitoSOL token account for this vault PDA
    const jitoSolMint = new web3.PublicKey(JITO_SOL_MINT_ADDRESS);
    const vaultJitoSolATA = await getAssociatedTokenAddress(
      jitoSolMint,
      vaultPDA,
      true // allowOwnerOffCurve - this is crucial for PDAs
    );
    
    console.log(`\n4. Checking Vault's jitoSOL token account: ${vaultJitoSolATA.toString()}`);
    
    try {
      const ataInfo = await connection.getAccountInfo(vaultJitoSolATA);
      if (ataInfo) {
        console.log(`✅ jitoSOL token account EXISTS`);
        console.log(`Owner: ${ataInfo.owner.toString()}`);
        console.log(`Data Size: ${ataInfo.data.length} bytes`);
        
        // Parse token account data to extract owner and amount
        if (ataInfo.data.length >= 165) { // Minimum size for a token account
          const accountData = AccountLayout.decode(ataInfo.data);
          console.log(`Token Amount: ${accountData.amount.toString()}`);
          console.log(`Token Owner: ${new web3.PublicKey(accountData.owner).toString()}`);
          console.log(`Token Mint: ${new web3.PublicKey(accountData.mint).toString()}`);
        }
      } else {
        console.log(`❌ jitoSOL token account DOES NOT EXIST`);
      }
    } catch (error) {
      console.error(`Error checking jitoSOL token account: ${error}`);
    }
    
    console.log(`\n=== ACCOUNT VERIFICATION COMPLETE ===`);
    console.log(`\nConclusion: If you're seeing the account on Solscan but not via our RPCs,`);
    console.log(`it could be due to one of the following reasons:`);
    console.log(`1. The RPC providers we're using might not be fully synced or have issues`);
    console.log(`2. The account may have been recreated/deleted since your last check`);
    console.log(`3. There might be a caching issue with the RPC providers`);
    console.log(`4. In rare cases, Solana network partition issues can cause different nodes to see different states`);
    
    return;
  } catch (error) {
    console.error('Error verifying vault PDA:', error);
  }
}

/**
 * Check the queue program configuration and get comprehensive queue information for a specific vault
 */
export async function checkQueueConfig(vaultId?: number): Promise<string | undefined> {
  console.log('\n=== CHECKING COMPREHENSIVE QUEUE PROGRAM INFORMATION ===');
  console.log(`Queue Program ID: ${BORING_QUEUE_PROGRAM_ID}`);
  
  try {
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const boringVault = vaultService.getBoringVault();
    
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
    
    // Create connection
    const connection = createConnection();
    const queueProgramId = new web3.PublicKey(BORING_QUEUE_PROGRAM_ID);
    
    // Load signer for user-specific data
    const signer = await loadKeypair();
    console.log(`Current signer: ${signer.address}`);
    
    // ============= 1. PROGRAM CONFIG =============
    console.log('\n=== 1. PROGRAM CONFIG ===');
    const configPDA = await boringVault.getQueueConfigPDA();
    console.log(`Queue Config PDA: ${configPDA.toString()}`);
    
    const configExists = await boringVault.doesAccountExist(configPDA);
    if (!configExists) {
      console.log('❌ Queue program not initialized yet!');
      return;
    }
    
    const configAccountInfo = await connection.getAccountInfo(configPDA);
    if (configAccountInfo && configAccountInfo.data.length >= 40) {
      const authorityBytes = configAccountInfo.data.slice(8, 40);
      const authority = new web3.PublicKey(authorityBytes);
      console.log(`✓ Config Authority: ${authority.toString()}`);
      console.log(`  Current signer is authority: ${authority.toString() === signer.address}`);
    }
    
    // ============= 2. QUEUE STATE FOR VAULT ${targetVaultId} =============
    console.log(`\n=== 2. QUEUE STATE FOR VAULT ${targetVaultId} ===`);
    const queueStatePDA = await boringVault.getQueueStatePDA(targetVaultId);
    console.log(`Queue State PDA: ${queueStatePDA.toString()}`);
    
    const queueStateExists = await boringVault.doesAccountExist(queueStatePDA);
    if (!queueStateExists) {
      console.log(`❌ Queue state not deployed for vault ${targetVaultId} yet!`);
      return;
    }
    
    const queueStateAccountInfo = await connection.getAccountInfo(queueStatePDA);
    if (queueStateAccountInfo) {
      console.log(`✓ Queue State Account found (${queueStateAccountInfo.data.length} bytes)`);
      
      // Parse QueueState struct (after 8-byte discriminator)
      let offset = 8;
      const queueAuthority = new web3.PublicKey(queueStateAccountInfo.data.slice(offset, offset + 32));
      offset += 32;
      const boringVaultProgram = new web3.PublicKey(queueStateAccountInfo.data.slice(offset, offset + 32));
      offset += 32;
      const queueVaultId = queueStateAccountInfo.data.readBigUInt64LE(offset);
      offset += 8;
      const shareMint = new web3.PublicKey(queueStateAccountInfo.data.slice(offset, offset + 32));
      offset += 32;
      const solveAuthority = new web3.PublicKey(queueStateAccountInfo.data.slice(offset, offset + 32));
      offset += 32;
      const paused = queueStateAccountInfo.data[offset] === 1;
      
      console.log(`  Authority: ${queueAuthority.toString()}`);
      console.log(`  Boring Vault Program: ${boringVaultProgram.toString()}`);
      console.log(`  Vault ID: ${queueVaultId.toString()}`);
      console.log(`  Share Mint: ${shareMint.toString()}`);
      console.log(`  Solve Authority: ${solveAuthority.toString()}`);
      console.log(`  Paused: ${paused}`);
      console.log(`  Current signer is queue authority: ${queueAuthority.toString() === signer.address}`);
      
      // Verify vault IDs match
      if (Number(queueVaultId) !== targetVaultId) {
        console.warn(`⚠️ Queue state vault ID (${queueVaultId}) doesn't match requested vault ID (${targetVaultId})`);
      }
    }
    
    // ============= 3. QUEUE PDA FOR VAULT ${targetVaultId} =============
    console.log(`\n=== 3. QUEUE PDA FOR VAULT ${targetVaultId} ===`);
    const queuePDA = await boringVault.getQueuePDA(targetVaultId);
    console.log(`Queue PDA: ${queuePDA.toString()}`);
    
    const queueExists = await boringVault.doesAccountExist(queuePDA);
    console.log(`Queue PDA exists: ${queueExists}`);
    
    if (queueExists) {
      const queueAccountInfo = await connection.getAccountInfo(queuePDA);
      if (queueAccountInfo) {
        console.log(`  Owner: ${queueAccountInfo.owner.toString()}`);
        console.log(`  Lamports: ${queueAccountInfo.lamports}`);
        console.log(`  Data length: ${queueAccountInfo.data.length} bytes`);
      }
    }
    
    // ============= 4. WITHDRAW ASSET DATA FOR VAULT ${targetVaultId} =============
    console.log(`\n=== 4. WITHDRAW ASSET DATA FOR VAULT ${targetVaultId} ===`);
    
    // Check withdraw asset data for jitoSOL
    const jitoSolMint = new web3.PublicKey(JITO_SOL_MINT_ADDRESS);
    const [withdrawAssetDataPDA] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("boring-queue-withdraw-asset-data"), Buffer.from(targetVaultId.toString().padStart(8, '0')).subarray(0, 8), jitoSolMint.toBuffer()],
      queueProgramId
    );
    
    // Fix the PDA derivation using the correct byte format
    const vaultIdBuffer = Buffer.alloc(8);
    vaultIdBuffer.writeBigUInt64LE(BigInt(targetVaultId), 0);
    const [withdrawAssetDataPDAFixed] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("boring-queue-withdraw-asset-data"), vaultIdBuffer, jitoSolMint.toBuffer()],
      queueProgramId
    );
    
    console.log(`jitoSOL Withdraw Asset Data PDA: ${withdrawAssetDataPDAFixed.toString()}`);
    
    const withdrawAssetExists = await boringVault.doesAccountExist(withdrawAssetDataPDAFixed);
    console.log(`jitoSOL withdraw asset data exists: ${withdrawAssetExists}`);
    
    if (withdrawAssetExists) {
      const withdrawAssetAccountInfo = await connection.getAccountInfo(withdrawAssetDataPDAFixed);
      if (withdrawAssetAccountInfo) {
        console.log(`✓ jitoSOL Withdraw Asset Data found (${withdrawAssetAccountInfo.data.length} bytes)`);
        
        // Parse WithdrawAssetData struct (after 8-byte discriminator)
        let offset = 8;
        const allowWithdrawals = withdrawAssetAccountInfo.data[offset] === 1;
        offset += 1;
        const secondsToMaturity = withdrawAssetAccountInfo.data.readUInt32LE(offset);
        offset += 4;
        const minimumSecondsToDeadline = withdrawAssetAccountInfo.data.readUInt32LE(offset);
        offset += 4;
        const minimumDiscount = withdrawAssetAccountInfo.data.readUInt16LE(offset);
        offset += 2;
        const maximumDiscount = withdrawAssetAccountInfo.data.readUInt16LE(offset);
        offset += 2;
        const minimumShares = withdrawAssetAccountInfo.data.readBigUInt64LE(offset);
        
        console.log(`  Allow Withdrawals: ${allowWithdrawals}`);
        console.log(`  Seconds to Maturity: ${secondsToMaturity} (${secondsToMaturity / 3600} hours)`);
        console.log(`  Minimum Seconds to Deadline: ${minimumSecondsToDeadline} (${minimumSecondsToDeadline / 3600} hours)`);
        console.log(`  Minimum Discount: ${minimumDiscount} BPS (${minimumDiscount / 100}%)`);
        console.log(`  Maximum Discount: ${maximumDiscount} BPS (${maximumDiscount / 100}%)`);
        console.log(`  Minimum Shares: ${minimumShares.toString()} (${Number(minimumShares) / 1e9} shares)`);
      }
    }
    
    // ============= 5. USER WITHDRAW STATE =============
    console.log('\n=== 5. USER WITHDRAW STATE ===');
    const userWithdrawStatePDA = await boringVault.getUserWithdrawStatePDA(new web3.PublicKey(signer.address));
    console.log(`User Withdraw State PDA: ${userWithdrawStatePDA.toString()}`);
    
    const userWithdrawStateExists = await boringVault.doesAccountExist(userWithdrawStatePDA);
    console.log(`User withdraw state exists: ${userWithdrawStateExists}`);
    
    if (userWithdrawStateExists) {
      const userWithdrawStateAccountInfo = await connection.getAccountInfo(userWithdrawStatePDA);
      if (userWithdrawStateAccountInfo) {
        console.log(`✓ User Withdraw State found (${userWithdrawStateAccountInfo.data.length} bytes)`);
        
        // Parse UserWithdrawState struct (after 8-byte discriminator)
        const lastNonce = userWithdrawStateAccountInfo.data.readBigUInt64LE(8);
        console.log(`  Last Nonce: ${lastNonce.toString()}`);
        
        // ============= 6. CHECK FOR EXISTING WITHDRAW REQUESTS FOR VAULT ${targetVaultId} =============
        console.log(`\n=== 6. EXISTING WITHDRAW REQUESTS FOR VAULT ${targetVaultId} ===`);
        console.log(`Checking for withdraw requests (nonce 0 to ${lastNonce})...`);
        
        let foundRequests = 0;
        let vaultSpecificRequests = 0;
        for (let nonce = 0; nonce <= Number(lastNonce); nonce++) {
          const nonceBuffer = Buffer.alloc(8);
          nonceBuffer.writeBigUInt64LE(BigInt(nonce), 0);
          
          const [withdrawRequestPDA] = await web3.PublicKey.findProgramAddress(
            [Buffer.from("boring-queue-withdraw-request"), new web3.PublicKey(signer.address).toBuffer(), nonceBuffer],
            queueProgramId
          );
          
          const requestExists = await boringVault.doesAccountExist(withdrawRequestPDA);
          if (requestExists) {
            foundRequests++;
            
            const requestAccountInfo = await connection.getAccountInfo(withdrawRequestPDA);
            if (requestAccountInfo) {
              // Parse WithdrawRequest struct (after 8-byte discriminator)
              let offset = 8;
              const reqVaultId = requestAccountInfo.data.readBigUInt64LE(offset);
              offset += 8;
              const assetOut = new web3.PublicKey(requestAccountInfo.data.slice(offset, offset + 32));
              offset += 32;
              const shareAmount = requestAccountInfo.data.readBigUInt64LE(offset);
              offset += 8;
              const assetAmount = requestAccountInfo.data.readBigUInt64LE(offset);
              offset += 8;
              const creationTime = requestAccountInfo.data.readBigUInt64LE(offset);
              offset += 8;
              const reqSecondsToMaturity = requestAccountInfo.data.readUInt32LE(offset);
              offset += 4;
              const reqSecondsToDeadline = requestAccountInfo.data.readUInt32LE(offset);
              
              // Only show details for the target vault ID
              if (Number(reqVaultId) === targetVaultId) {
                vaultSpecificRequests++;
                console.log(`  ✓ Active request ${nonce} for vault ${targetVaultId}: ${withdrawRequestPDA.toString()}`);
                
                const maturityTime = Number(creationTime) + reqSecondsToMaturity;
                const deadlineTime = maturityTime + reqSecondsToDeadline;
                const currentTime = Math.floor(Date.now() / 1000);
                
                console.log(`    Vault ID: ${reqVaultId.toString()}`);
                console.log(`    Asset Out: ${assetOut.toString()}`);
                console.log(`    Share Amount: ${shareAmount.toString()} (${Number(shareAmount) / 1e9} shares)`);
                console.log(`    Asset Amount: ${assetAmount.toString()}`);
                console.log(`    Created: ${new Date(Number(creationTime) * 1000).toISOString()}`);
                console.log(`    Maturity: ${new Date(maturityTime * 1000).toISOString()}`);
                console.log(`    Deadline: ${new Date(deadlineTime * 1000).toISOString()}`);
                console.log(`    Status: ${currentTime < maturityTime ? 'Maturing' : currentTime <= deadlineTime ? 'Ready to fulfill' : 'Expired'}`);
              }
            }
          }
        }
        
        if (vaultSpecificRequests === 0) {
          console.log(`  No active withdraw requests found for vault ${targetVaultId}`);
        } else {
          console.log(`  Found ${vaultSpecificRequests} active withdraw request(s) for vault ${targetVaultId}`);
        }
        
        if (foundRequests > vaultSpecificRequests) {
          console.log(`  (${foundRequests - vaultSpecificRequests} request(s) exist for other vaults)`);
        }
      }
    }
    
    // ============= 7. QUEUE TOKEN BALANCES FOR VAULT ${targetVaultId} =============
    console.log(`\n=== 7. QUEUE TOKEN BALANCES FOR VAULT ${targetVaultId} ===`);
    
    // We need to get the share mint for this specific vault
    // Try to get it from the queue state we already fetched
    let shareMintFromVault: web3.PublicKey;
    if (queueStateAccountInfo) {
      // Parse the share mint from queue state (already done above)
      let offset = 8 + 32 + 32 + 8; // Skip discriminator, authority, boring vault program, vault id
      shareMintFromVault = new web3.PublicKey(queueStateAccountInfo.data.slice(offset, offset + 32));
    } else {
      console.log(`❌ Cannot get share mint - queue state not found for vault ${targetVaultId}`);
      return configPDA.toString();
    }
    
    // Check queue's share token balance
    try {
      const queueSharesATA = getAssociatedTokenAddressSync(
        shareMintFromVault,
        queuePDA,
        true, // allowOwnerOffCurve
        new web3.PublicKey(TOKEN_2022_PROGRAM_ID)
      );
      console.log(`Queue Shares ATA: ${queueSharesATA.toString()}`);
      
      const queueSharesExists = await boringVault.doesAccountExist(queueSharesATA);
      console.log(`Queue shares ATA exists: ${queueSharesExists}`);
      
      if (queueSharesExists) {
        const queueSharesAccountInfo = await connection.getAccountInfo(queueSharesATA);
        if (queueSharesAccountInfo) {
          // Parse token account data
          const accountData = AccountLayout.decode(queueSharesAccountInfo.data);
          const queueShareBalance = accountData.amount;
          console.log(`  Queue Share Balance: ${queueShareBalance.toString()} (${Number(queueShareBalance) / 1e9} shares)`);
        }
      }
    } catch (error) {
      console.log(`Error checking queue share balance: ${error}`);
    }
    
    // Check queue's jitoSOL balance if it has an ATA
    try {
      const queueJitoSolATA = getAssociatedTokenAddressSync(
        jitoSolMint,
        queuePDA,
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID
      );
      console.log(`Queue jitoSOL ATA: ${queueJitoSolATA.toString()}`);
      
      const queueJitoSolExists = await boringVault.doesAccountExist(queueJitoSolATA);
      console.log(`Queue jitoSOL ATA exists: ${queueJitoSolExists}`);
      
      if (queueJitoSolExists) {
        const queueJitoSolAccountInfo = await connection.getAccountInfo(queueJitoSolATA);
        if (queueJitoSolAccountInfo) {
          const accountData = AccountLayout.decode(queueJitoSolAccountInfo.data);
          const queueJitoSolBalance = accountData.amount;
          console.log(`  Queue jitoSOL Balance: ${queueJitoSolBalance.toString()} (${Number(queueJitoSolBalance) / 1e9} jitoSOL)`);
        }
      }
    } catch (error) {
      console.log(`Error checking queue jitoSOL balance: ${error}`);
    }
    
    console.log(`\n=== QUEUE ANALYSIS COMPLETE FOR VAULT ${targetVaultId} ===`);
    return configPDA.toString();
    
  } catch (error) {
    console.error('Error checking comprehensive queue information:', error);
    return undefined;
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