import { web3 } from '@coral-xyz/anchor';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Address } from 'gill';

// Import shared utilities
import { 
  solanaClient, 
  MAINNET_CONFIG, 
  loadKeypair, 
  getAccountExistenceStatus, 
  getTokenAccount,
  TOKEN_MINTS,
  createConnection
} from './mainnet-test-utils';

// Import services and constants
import { VaultSDK } from '../sdk';
import { 
  JITO_SOL_MINT_ADDRESS, 
  BORING_VAULT_PROGRAM_ID, 
  CONFIG_SEED 
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
    const vaultId = Number(vaultData.vaultState.vaultId);
    
    console.log(`Vault ID: ${vaultData.vaultState.vaultId.toString()}`);
    console.log(`Authority: ${vaultData.vaultState.authority.toString()}`);
    console.log(`Pending Authority: ${vaultData.vaultState.pendingAuthority.toString()}`);
    console.log(`Share Mint: ${vaultData.vaultState.shareMint.toString()}`);
    console.log(`Deposit Sub-Account: ${vaultData.vaultState.depositSubAccount}`);
    console.log(`Withdraw Sub-Account: ${vaultData.vaultState.withdrawSubAccount}`);
    console.log(`Paused: ${vaultData.vaultState.paused}`);
    
    // Display asset data if available
    if (vaultData.assetData) {
      console.log('\n--- Asset Data ---');
      console.log(`Base Asset: ${vaultData.assetData.baseAsset.toString()}`);
      console.log(`Base Asset Minimum: ${vaultData.assetData.baseAssetMinimum.toString()}`);
      console.log(`Share Precision: ${vaultData.assetData.sharePrecision}`);
      console.log(`Exchange Rate Provider: ${vaultData.assetData.exchangeRateProvider.toString()}`);
      console.log(`Exchange Rate: ${vaultData.assetData.exchangeRate.toString()}`);
      console.log(`Exchange Rate High Water Mark: ${vaultData.assetData.exchangeRateHighWaterMark.toString()}`);
      console.log(`Fees Owed In Base Asset: ${vaultData.assetData.feesOwedInBaseAsset.toString()}`);
      console.log(`Total Shares Last Update: ${vaultData.assetData.totalSharesLastUpdate.toString()}`);
      console.log(`Last Update Timestamp: ${new Date(Number(vaultData.assetData.lastUpdateTimestamp) * 1000).toISOString()}`);
      console.log(`Payout Address: ${vaultData.assetData.payoutAddress.toString()}`);
      console.log(`Allowed Exchange Rate Change Upper Bound: ${vaultData.assetData.allowedExchangeRateChangeUpperBound / 100}%`);
      console.log(`Allowed Exchange Rate Change Lower Bound: ${vaultData.assetData.allowedExchangeRateChangeLowerBound / 100}%`);
      console.log(`Minimum Update Delay In Seconds: ${vaultData.assetData.minimumUpdateDelayInSeconds}`);
      console.log(`Platform Fee: ${vaultData.assetData.platformFeeBps / 100}%`);
      console.log(`Performance Fee: ${vaultData.assetData.performanceFeeBps / 100}%`);
      console.log(`Withdraw Authority: ${vaultData.assetData.withdrawAuthority.toString()}`);
    }
    
    // Derive and check important PDAs related to the vault
    console.log('\n--- Related PDAs and Accounts ---');

    // 1. Vault State PDA
    const vaultStatePDA = await boringVault.getVaultStatePDA(vaultId);
    console.log(`\nVault State PDA: ${vaultStatePDA.toString()}`);
    
    // 2. Deposit Vault PDA
    const depositVaultPDA = await boringVault.getVaultPDA(vaultId, vaultData.vaultState.depositSubAccount);
    console.log(`\nDeposit Vault PDA (sub-account ${vaultData.vaultState.depositSubAccount}): ${depositVaultPDA.toString()}`);
    const depositVaultInfo = await getAccountExistenceStatus(depositVaultPDA);
    console.log(`Status: ${depositVaultInfo}`);
    
    // 3. Withdraw Vault PDA
    const withdrawVaultPDA = await boringVault.getVaultPDA(vaultId, vaultData.vaultState.withdrawSubAccount);
    console.log(`\nWithdraw Vault PDA (sub-account ${vaultData.vaultState.withdrawSubAccount}): ${withdrawVaultPDA.toString()}`);
    const withdrawVaultInfo = await getAccountExistenceStatus(withdrawVaultPDA);
    console.log(`Status: ${withdrawVaultInfo}`);
    
    // 4. Share Token Mint PDA - We get this directly from vaultData but can also derive it
    const shareMintPDA = vaultData.vaultState.shareMint;
    console.log(`\nShare Token Mint: ${shareMintPDA.toString()}`);
    const shareMintInfo = await getAccountExistenceStatus(shareMintPDA);
    console.log(`Status: ${shareMintInfo}`);
    
    // 5. Asset Data PDAs - If we have a base asset, check the related asset data
    if (vaultData.assetData && vaultData.assetData.baseAsset) {
      const baseAsset = vaultData.assetData.baseAsset;
      console.log(`\nBase Asset: ${baseAsset.toString()}`);
      
      const assetDataPDA = await boringVault.getAssetDataPDA(vaultStatePDA, baseAsset);
      console.log(`Asset Data PDA: ${assetDataPDA.toString()}`);
      const assetDataInfo = await getAccountExistenceStatus(assetDataPDA);
      console.log(`Status: ${assetDataInfo}`);
      
      // 6. Check if the vault has token accounts for jitoSOL
      const jitoSolMint = new web3.PublicKey(JITO_SOL_MINT_ADDRESS);
      console.log(`\nChecking jitoSOL accounts...`);
      
      // Vault deposit account's jitoSOL account
      const depositVaultJitoSolATA = await getTokenAccount(depositVaultPDA, jitoSolMint);
      console.log(`Deposit Vault's jitoSOL Account: ${depositVaultJitoSolATA.toString()}`);
      const depositJitoSolInfo = await getAccountExistenceStatus(depositVaultJitoSolATA);
      console.log(`Status: ${depositJitoSolInfo}`);
      
      // Vault withdraw account's jitoSOL account
      const withdrawVaultJitoSolATA = await getTokenAccount(withdrawVaultPDA, jitoSolMint);
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
    console.log(`Vault ID: ${vaultData.vaultState.vaultId.toString()}`);
    console.log(`Authority: ${vaultData.vaultState.authority.toString()}`);
    console.log(`Share Mint: ${vaultData.vaultState.shareMint.toString()}`);
    console.log(`Deposit Sub-Account: ${vaultData.vaultState.depositSubAccount}`);
    console.log(`Withdraw Sub-Account: ${vaultData.vaultState.withdrawSubAccount}`);
    console.log(`Paused: ${vaultData.vaultState.paused}`);
    
    // Display asset data if available
    if (vaultData.assetData) {
      console.log('\n=== ASSET DATA ===');
      console.log(`Base Asset: ${vaultData.assetData.baseAsset.toString()}`);
      console.log(`Platform Fee: ${vaultData.assetData.platformFeeBps / 100}%`);
      console.log(`Performance Fee: ${vaultData.assetData.performanceFeeBps / 100}%`);
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
        amount: accountData.amount.readBigUInt64LE(0).toString()
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
export async function fetchUserShares(): Promise<any> {
  console.log('\n=== CHECKING USER BALANCE IN VAULT ===');
  
  try {
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    const signer = await loadKeypair();
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    
    console.log(`Vault: ${vaultPubkey.toString()}`);
    console.log(`Share Token Mint: ${vaultData.vaultState.shareMint.toString()}`);
    
    // Use gill to get token accounts with base64 encoding
    const signerAddress = signer.address;
    const tokenAccountsResponse = await solanaClient.rpc.getTokenAccountsByOwner(
      signerAddress,
      { programId: TOKEN_PROGRAM_ID.toString() as Address },
      { encoding: 'base64' }
    ).send();
    
    // Convert shareMint to string for comparison
    const shareMintString = vaultData.vaultState.shareMint.toString();
    
    // Look for share token account
    const shareTokenAccount = tokenAccountsResponse.value.find(item => {
      const data = Buffer.from(item.account.data[0], 'base64');
      const accountData = AccountLayout.decode(data);
      const mintString = new web3.PublicKey(accountData.mint).toString();
      return mintString === shareMintString;
    });
    
    if (shareTokenAccount) {
      const data = Buffer.from(shareTokenAccount.account.data[0], 'base64');
      const accountData = AccountLayout.decode(data);
      const amount = accountData.amount.readBigUInt64LE(0).toString();
      
      console.log(`✅ User has ${amount} shares of this vault`);
      console.log(`Share token account: ${shareTokenAccount.pubkey}`);
      return amount;
    } else {
      console.log(`❌ User does not have share tokens for this vault`);
      return 0;
    }
  } catch (error) {
    console.error('Error checking user balance:', error);
    throw error;
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
    const vaultId = Number(vaultData.vaultState.vaultId);
    const depositSubAccount = vaultData.vaultState.depositSubAccount;
    
    console.log(`Vault ID: ${vaultId}`);
    console.log(`Authority: ${vaultData.vaultState.authority.toString()}`);
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
    const vaultJitoSolATA = await getTokenAccount(vaultPDA, jitoSolMint);
    
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