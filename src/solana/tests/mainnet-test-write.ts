import { web3 } from '@coral-xyz/anchor';
import { AccountLayout } from '@solana/spl-token';
import { Address } from 'gill';
import * as fs from 'fs';

// Import shared utilities
import { 
  solanaClient, 
  MAINNET_CONFIG, 
  loadKeypair, 
  getTokenAccount,
  TOKEN_MINTS,
  createConnection,
  createAssociatedTokenAccountInstruction
} from './mainnet-test-utils';

// Import services and constants
import { VaultSDK } from '../sdk';
import { 
  JITO_SOL_MINT_ADDRESS,
  BORING_VAULT_PROGRAM_ID
} from '../utils/constants';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

/**
 * Test deposit functionality with jitoSOL
 */
export async function testDeposit(): Promise<string | undefined> {
  console.log('\n=== TESTING DEPOSIT WITH JITO-SOL ===');
  
  try {
    // Print constants for debugging
    console.log('Constants used in test:');
    console.log(`JITO_SOL_MINT_ADDRESS: ${JITO_SOL_MINT_ADDRESS}`);
    console.log(`JITO_SOL_PRICE_FEED_ADDRESS: ${require('../utils/constants').JITO_SOL_PRICE_FEED_ADDRESS}`);
    console.log(`BORING_VAULT_PROGRAM_ID: ${BORING_VAULT_PROGRAM_ID}`);
    
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    // Print key configuration
    console.log('\nTest Configuration:');
    console.log(`RPC URL: ${MAINNET_CONFIG.rpcUrl}`);
    console.log(`Vault Pubkey (from .env): ${vaultPubkey.toString()}`);
    
    // Load signer for transaction signing
    const signer = await loadKeypair();
    console.log(`Using signer: ${signer.address}`);
    
    // Get vault data to extract vault ID
    console.log(`\nFetching data for vault: ${vaultPubkey.toString()}`);
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    const vaultId = Number(vaultData.vaultState.vaultId);
    console.log(`Vault ID: ${vaultId}`);
    console.log(`Vault Authority: ${vaultData.vaultState.authority.toString()}`);
    console.log(`Paused: ${vaultData.vaultState.paused}`);
    console.log(`Deposit Sub-Account: ${vaultData.vaultState.depositSubAccount}`);
    console.log(`Withdraw Sub-Account: ${vaultData.vaultState.withdrawSubAccount}`);
    
    // Check asset data if available
    if (vaultData.assetData) {
      console.log('\nAsset Data:');
      console.log(`Base Asset: ${vaultData.assetData.baseAsset.toString()}`);
      console.log(`Exchange Rate: ${vaultData.assetData.exchangeRate.toString()}`);
      console.log(`Exchange Rate Provider: ${vaultData.assetData.exchangeRateProvider.toString()}`);
    }
    
    // Create a direct web3.js connection for transaction sending
    const connection = createConnection();
    
    // Check user's jitoSOL balance
    const signerAddress = signer.address;
    const tokenAccountsResponse = await solanaClient.rpc.getTokenAccountsByOwner(
      signerAddress,
      { programId: TOKEN_PROGRAM_ID.toString() as Address },
      { encoding: 'base64' }
    ).send();
    
    // Find jitoSOL token account
    const jitoSolMintStr = TOKEN_MINTS.JITO_SOL.toString();
    let jitoSolBalance = BigInt(0);
    
    const jitoSolAccount = tokenAccountsResponse.value.find(item => {
      const data = Buffer.from(item.account.data[0], 'base64');
      const accountData = AccountLayout.decode(data);
      const mintString = new web3.PublicKey(accountData.mint).toString();
      return mintString === jitoSolMintStr;
    });
    
    if (jitoSolAccount) {
      const data = Buffer.from(jitoSolAccount.account.data[0], 'base64');
      const accountData = AccountLayout.decode(data);
      jitoSolBalance = accountData.amount.readBigUInt64LE(0);
      console.log(`> Found jitoSOL balance: ${jitoSolBalance.toString()} (${Number(jitoSolBalance) / 1e9} jitoSOL)`);
    } else {
      console.log('❌ No jitoSOL token account found. Please acquire some jitoSOL first.');
      return;
    }
    
    // Always use fixed amount of 0.001 jitoSOL
    const depositAmount = 0.001;
    const maxDepositAmount = Number(jitoSolBalance) / 1e9;
    
    // Validate the amount is within limits
    if (depositAmount > maxDepositAmount) {
      console.log(`❌ Insufficient jitoSOL balance. Need ${depositAmount} jitoSOL but only have ${maxDepositAmount}`);
      return;
    }
    
    console.log(`Using amount: ${depositAmount} jitoSOL`);
    
    // Convert to lamports
    const depositLamports = BigInt(Math.floor(depositAmount * 1e9));
    console.log(`Deposit amount: ${depositAmount} jitoSOL (${depositLamports} lamports)`);
    
    // Calculate minimum shares to receive (applying 5% slippage tolerance)
    const minMintAmount = depositLamports * BigInt(95) / BigInt(100);
    console.log(`Minimum shares to receive: ${minMintAmount} (5% slippage tolerance)`);
    
    // Create the wallet adapter with web3.js PublicKey for the boring vault SDK
    const walletPublicKey = new web3.PublicKey(signerAddress);
    
    // Get key PDAs for transaction preparation
    const boringVault = vaultService.getBoringVault();
    const vaultStatePDA = await boringVault.getVaultStatePDA(vaultId);
    const vaultPDA = await boringVault.getVaultPDA(vaultId, vaultData.vaultState.depositSubAccount);
    const shareMintPDA = vaultData.vaultState.shareMint;
    const userSharesATA = await getTokenAccount(walletPublicKey, shareMintPDA);
    
    // IMPORTANT: Check accounts but don't break on missing vault PDA
    console.log('\nVerifying required accounts...');
    
    // Log all the accounts for debugging
    console.log('Important accounts for deposit transaction:');
    console.log(`Vault State PDA: ${vaultStatePDA.toString()}`);
    console.log(`Deposit Sub-Account: ${vaultData.vaultState.depositSubAccount}`);
    console.log(`Vault PDA: ${vaultPDA.toString()}`);
    console.log(`Share Mint: ${shareMintPDA.toString()}`);
    console.log(`User's Share ATA: ${userSharesATA.toString()}`);
    
    // Just check the vault PDA but don't block on it
    const vaultPDAInfo = await connection.getAccountInfo(vaultPDA);
    if (!vaultPDAInfo) {
      console.log(`⚠️ Vault PDA does not appear to exist: ${vaultPDA.toString()}`);
      console.log('However, we will continue with the deposit since the jitoSOL token account exists');
      console.log('The program may handle creating the PDA as part of the deposit transaction');
      
      // Log PDA derivation for clarity
      const vaultIdBuffer = Buffer.alloc(8);
      vaultIdBuffer.writeBigUInt64LE(BigInt(vaultId), 0);
      const subAccount = vaultData.vaultState.depositSubAccount;
      
      console.log(`\nPDA Derivation Info:`);
      console.log(`Vault ID: ${vaultId}`);
      console.log(`Sub-account: ${subAccount}`);
      console.log(`BASE_SEED_BORING_VAULT: "${require('../utils/constants').BASE_SEED_BORING_VAULT}"`);
      
      // Check jitoSOL token account
      const jitoSolMint = new web3.PublicKey(JITO_SOL_MINT_ADDRESS);
      const vaultJitoSolATA = await getTokenAccount(vaultPDA, jitoSolMint);
      console.log(`Vault's jitoSOL token account: ${vaultJitoSolATA.toString()}`);
      
      const jitoSolAtaInfo = await connection.getAccountInfo(vaultJitoSolATA);
      if (jitoSolAtaInfo) {
        console.log(`✅ Vault's jitoSOL token account exists`);
        const accountData = AccountLayout.decode(jitoSolAtaInfo.data);
        console.log(`Token Owner: ${new web3.PublicKey(accountData.owner).toString()}`);
        console.log(`Token Mint: ${new web3.PublicKey(accountData.mint).toString()}`);
      } else {
        console.log(`❌ Vault's jitoSOL token account does not exist`);
      }
    } else {
      console.log(`✅ Vault PDA exists: ${vaultPDA.toString()}`);
      console.log(`Owner: ${vaultPDAInfo.owner.toString()}`);
      console.log(`Data Size: ${vaultPDAInfo.data.length} bytes`);
      console.log(`Executable: ${vaultPDAInfo.executable}`);
      console.log(`Lamports: ${vaultPDAInfo.lamports}`);
    }
    
    // 2. Check if the user's share token account exists
    const userSharesATAInfo = await connection.getAccountInfo(userSharesATA);
    if (!userSharesATAInfo) {
      console.log(`⚠️ User's share token account does not exist: ${userSharesATA.toString()}`);
      console.log('Creating user share token account...');
      
      // Use the locally defined createAssociatedTokenAccountInstruction function
      const createATAIx = createAssociatedTokenAccountInstruction(
        walletPublicKey, // payer
        userSharesATA, // associated token account
        walletPublicKey, // owner
        shareMintPDA // mint
      );
      
      // Create and send transaction to create the ATA
      const createATATx = new web3.Transaction().add(createATAIx);
      const { blockhash } = await connection.getLatestBlockhash();
      createATATx.recentBlockhash = blockhash;
      createATATx.feePayer = walletPublicKey;
      
      // Load keypair from file for signing
      const keypairPath = process.env.KEYPAIR_PATH || '';
      if (!keypairPath) {
        throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
      }
      const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
      
      // Sign and send the transaction
      createATATx.sign(keypair);
      const createATATxSig = await connection.sendRawTransaction(createATATx.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'confirmed'
      });
      
      console.log(`Create ATA transaction sent: ${createATATxSig}`);
      console.log('Waiting for confirmation...');
      
      // Wait for confirmation with polling
      let confirmed = false;
      let attempts = 0;
      const maxAttempts = 15;
      
      while (!confirmed && attempts < maxAttempts) {
        attempts++;
        try {
          console.log(`Polling attempt ${attempts}/${maxAttempts}...`);
          const status = await connection.getSignatureStatus(createATATxSig);
          
          if (status.value) {
            if (status.value.err) {
              console.log(`❌ Failed to create share token account: ${JSON.stringify(status.value.err)}`);
              return undefined;
            } else if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
              console.log(`✅ User's share token account created!`);
              confirmed = true;
            } else {
              console.log(`Status: ${status.value.confirmationStatus || 'processing'}`);
            }
          } else {
            console.log(`Transaction not found yet. Continuing to poll...`);
          }
          
          if (!confirmed) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error('Error checking transaction status:', error);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (!confirmed) {
        console.log('❌ Failed to create share token account. Please try again.');
        return undefined;
      }
    } else {
      console.log(`✅ User's share token account exists: ${userSharesATA.toString()}`);
    }
    
    console.log('\nBuilding and executing deposit...');
    
    // Get the vault's jitoSOL token account
    const vaultATA = await getTokenAccount(vaultPDA, new web3.PublicKey(jitoSolMintStr));
    console.log(`Vault's jitoSOL token account: ${vaultATA.toString()}`);
    
    // Get the jitoSOL asset data account
    const assetDataPDA = await boringVault.getAssetDataPDA(vaultStatePDA, new web3.PublicKey(jitoSolMintStr));
    console.log(`jitoSOL asset data account: ${assetDataPDA.toString()}`);
    
    // Check if the asset data account exists
    const assetDataInfo = await connection.getAccountInfo(assetDataPDA);
    if (!assetDataInfo) {
      console.log(`❌ jitoSOL asset data account does not exist: ${assetDataPDA.toString()}`);
      return undefined;
    } else {
      console.log(`✅ jitoSOL asset data account exists`);
      
      // Examine asset data to get price feed
      console.log('\nExamining asset data:');
      const assetDataBuffer = assetDataInfo.data;
      
      // If there's a price feed field in the asset data (offset depends on the struct layout)
      if (assetDataBuffer.length >= 72) { // Assuming price feed is at offset 40-72 (32 bytes Pubkey)
        const priceFeedBytes = assetDataBuffer.slice(40, 72);
        const priceFeedAddress = new web3.PublicKey(priceFeedBytes);
        console.log(`Asset Data Price Feed: ${priceFeedAddress.toString()}`);
        const constantsPriceFeed = require('../utils/constants').JITO_SOL_PRICE_FEED_ADDRESS;
        console.log(`Does it match JITO_SOL_PRICE_FEED_ADDRESS? ${priceFeedAddress.toString() === constantsPriceFeed ? 'Yes' : 'No'}`);
      }
    }
    
    // Build the transaction using boring vault SDK
    let txSignature: string | undefined;
    
    try {
      console.log('\nBuilding deposit transaction...');
      console.log('Deposit Arguments:');
      console.log(`- Wallet Public Key: ${walletPublicKey.toString()}`);
      console.log(`- Vault ID: ${vaultId}`);
      console.log(`- Deposit Mint: ${jitoSolMintStr}`);
      console.log(`- Deposit Amount: ${depositLamports.toString()}`);
      console.log(`- Min Mint Amount: ${minMintAmount.toString()}`);
      
      const tx = await boringVault.buildDepositTransaction(
        walletPublicKey,
        vaultId,
        new web3.PublicKey(jitoSolMintStr),
        depositLamports,
        minMintAmount
      );
      
      console.log('\nTransaction built successfully with instructions:');
      tx.instructions.forEach((ix, index) => {
        console.log(`Instruction ${index + 1}:`);
        console.log(`  Program ID: ${ix.programId.toString()}`);
        console.log(`  Data length: ${ix.data.length} bytes`);
        console.log(`  Accounts (${ix.keys.length}):`);
        ix.keys.forEach((key, i) => {
          console.log(`    [${i}] ${key.pubkey.toString()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
        });
      });
      
      // Get recent blockhash from direct connection
      console.log('\nGetting recent blockhash...');
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = walletPublicKey;
      
      console.log('Signing transaction...');
      
      // Load keypair from file for signing
      const keypairPath = process.env.KEYPAIR_PATH || '';
      if (!keypairPath) {
        throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
      }
      
      const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
      
      // Sign the transaction
      tx.sign(keypair);
      
      console.log('\nSending transaction...');
      
      txSignature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'confirmed'
      });
      
      console.log(`\n✅ Transaction sent! Signature: ${txSignature}`);
      console.log(`View on explorer: https://solscan.io/tx/${txSignature}`);
      
      // Wait for confirmation with polling
      console.log('\nWaiting for confirmation...');
      let confirmed = false;
      let attempts = 0;
      const maxAttempts = 20;
      const pollingIntervalMs = 2000;
      
      while (!confirmed && attempts < maxAttempts) {
        attempts++;
        try {
          console.log(`\nPolling attempt ${attempts}/${maxAttempts}...`);
          
          // Poll for transaction status
          const signatureStatus = await connection.getSignatureStatus(txSignature);
          
          if (signatureStatus && signatureStatus.value) {
            if (signatureStatus.value.err) {
              console.log(`\n❌ Transaction failed with error:`);
              console.log(JSON.stringify(signatureStatus.value.err, null, 2));
              
              // Try to fetch detailed logs
              try {
                console.log('\nFetching transaction details...');
                const txDetails = await connection.getTransaction(txSignature, {
                  maxSupportedTransactionVersion: 0,
                  commitment: 'confirmed'
                });
                
                if (txDetails && txDetails.meta && txDetails.meta.logMessages) {
                  console.log('\nTransaction logs:');
                  txDetails.meta.logMessages.forEach((log, i) => {
                    console.log(`[${i}] ${log}`);
                  });
                }
              } catch (logError) {
                console.log(`Error fetching transaction details: ${logError}`);
              }
              
              break;
            } else if (signatureStatus.value.confirmationStatus === 'confirmed' || 
                      signatureStatus.value.confirmationStatus === 'finalized') {
              console.log(`\n✅ Transaction confirmed with status: ${signatureStatus.value.confirmationStatus}`);
              confirmed = true;
              break;
            } else {
              console.log(`Status: ${signatureStatus.value.confirmationStatus || 'processing'}`);
            }
          } else {
            console.log('Transaction not found yet. Still processing...');
          }
          
          // Wait before next poll
          if (!confirmed) {
            await new Promise(resolve => setTimeout(resolve, pollingIntervalMs));
          }
        } catch (statusError) {
          console.error(`Error checking transaction status: ${statusError}`);
          await new Promise(resolve => setTimeout(resolve, pollingIntervalMs));
        }
      }
      
      if (!confirmed && attempts >= maxAttempts) {
        console.log(`\n⚠️ Transaction confirmation timed out - check explorer for final status:`);
        console.log(`https://solscan.io/tx/${txSignature}`);
      }
      
      // Verify if the deposit was successful
      console.log('\nChecking if deposit was successful...');
      
      // Try to check for created accounts
      const newVaultPDAInfo = await connection.getAccountInfo(vaultPDA);
      if (newVaultPDAInfo) {
        console.log(`✅ Vault PDA now exists: ${vaultPDA.toString()}`);
        console.log(`Owner: ${newVaultPDAInfo.owner.toString()}`);
        console.log(`Data Size: ${newVaultPDAInfo.data.length} bytes`);
      }
      
      // Check user's share token balance
      try {
        const userSharesATAInfo = await connection.getAccountInfo(userSharesATA);
        if (userSharesATAInfo) {
          const accountData = AccountLayout.decode(userSharesATAInfo.data);
          const shareBalance = accountData.amount.readBigUInt64LE(0);
          console.log(`User's share token balance: ${shareBalance.toString()}`);
          
          if (shareBalance > 0) {
            console.log(`\n🎉 Deposit appears to be successful! You received ${shareBalance.toString()} share tokens.`);
          } else {
            console.log(`\n⚠️ Deposit may not have been successful. Share balance is 0.`);
          }
        }
      } catch (balanceError) {
        console.error(`Error checking share balance: ${balanceError}`);
      }
      
      return txSignature;
    } catch (error: any) {
      console.error('\nError executing deposit:', error);
      
      if (error.logs) {
        console.log('\nTransaction logs:');
        error.logs.forEach((log: string, i: number) => {
          console.log(`[${i}] ${log}`);
        });
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Error testing deposit:', error);
    return undefined;
  }
}

/**
 * Initialize the vault deposit sub-account
 * This function is for vault administrators to create the deposit sub-account
 */
export async function initVaultDepositAccount(): Promise<void> {
  try {
    console.log('\n=== INITIALIZING VAULT DEPOSIT ACCOUNT ===');
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    // Load admin keypair (the vault administrator)
    const signer = await loadKeypair();
    
    // Create SDK instances
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    const vaultId = Number(vaultData.vaultState.vaultId);
    const depositSubAccount = vaultData.vaultState.depositSubAccount;
    
    console.log(`Vault ID: ${vaultId}`);
    console.log(`Authority: ${vaultData.vaultState.authority.toString()}`);
    console.log(`Signer: ${signer.address}`);
    console.log(`Deposit Sub-Account: ${depositSubAccount}`);
    
    // Verify the signer is the vault authority or strategist
    if (vaultData.vaultState.authority.toString() !== signer.address) {
      if (vaultData.assetData?.exchangeRateProvider.toString() !== signer.address) {
        console.log('\n❌ Error: Signer is not the vault authority or strategist');
        console.log(`Vault Authority: ${vaultData.vaultState.authority.toString()}`);
        console.log(`Signer: ${signer.address}`);
        console.log('\nYou must use the vault administrator or strategist wallet to create the deposit sub-account.');
        return;
      }
    }
    
    // Create direct Solana connection for creating the transaction
    const connection = createConnection();
    
    // Derive the vault PDAs
    const boringVault = vaultService.getBoringVault();
    const vaultStatePDA = await boringVault.getVaultStatePDA(vaultId);
    const depositVaultPDA = await boringVault.getVaultPDA(vaultId, depositSubAccount);
    
    // Check if the deposit vault account already exists
    const depositVaultInfo = await connection.getAccountInfo(depositVaultPDA);
    if (depositVaultInfo) {
      console.log(`\n✅ Deposit vault account already exists: ${depositVaultPDA.toString()}`);
      return;
    }

    console.log(`\nAttempting to initialize deposit vault account: ${depositVaultPDA.toString()}`);
    console.log(`This account is a Program Derived Address (PDA) and must be initialized by the program.`);
    
    console.log(`\nThe proper approach is to call the program with specific instructions to initialize this account.`);
    console.log(`Since jitoSOL deposits are enabled, we can try to create an Associated Token Account (ATA) for it:`);
    
    // Get jitoSOL mint for deposit
    const jitoSolMint = new web3.PublicKey(JITO_SOL_MINT_ADDRESS);
    console.log(`\njitoSOL Mint: ${jitoSolMint.toString()}`);
    
    // Get the vault's associated token account for jitoSOL
    const vaultJitoSolATA = await getTokenAccount(depositVaultPDA, jitoSolMint);
    console.log(`Vault's jitoSOL ATA: ${vaultJitoSolATA.toString()}`);
    
    // Check if the ATA already exists
    const ataInfo = await connection.getAccountInfo(vaultJitoSolATA);
    if (ataInfo) {
      console.log(`\n✅ Vault's jitoSOL ATA already exists: ${vaultJitoSolATA.toString()}`);
      
      // Try to run a deposit with 0 amount to trigger vault creation
      console.log(`\nRunning a deposit with 0 amount to check if this triggers vault account creation...`);
      
      // Implement deposit logic here
      return;
    }
    
    console.log(`\nCreating Associated Token Account for jitoSOL to initialize deposit mechanism...`);
    
    // Create instruction to create the ATA
    const createATAIx = createAssociatedTokenAccountInstruction(
      new web3.PublicKey(signer.address), // payer
      vaultJitoSolATA, // ata 
      depositVaultPDA, // owner
      jitoSolMint // mint
    );
    
    // Create transaction
    const transaction = new web3.Transaction().add(createATAIx);
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = new web3.PublicKey(signer.address);
    
    // Load keypair from file for signing
    const keypairPath = process.env.KEYPAIR_PATH || '';
    if (!keypairPath) {
      throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
    }
    const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    
    // Sign and send the transaction
    try {
      transaction.sign(keypair);
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'confirmed'
      });
      console.log(`\n✅ Transaction sent with signature: ${signature}`);
      console.log(`View on explorer: https://solscan.io/tx/${signature}`);
      
      // Wait for confirmation with polling
      console.log(`\nWaiting for confirmation...`);
      let confirmed = false;
      let attempts = 0;
      const maxAttempts = 15;
      
      while (!confirmed && attempts < maxAttempts) {
        attempts++;
        try {
          console.log(`Polling attempt ${attempts}/${maxAttempts}...`);
          const status = await connection.getSignatureStatus(signature);
          
          if (status.value) {
            if (status.value.err) {
              console.log(`❌ Transaction failed: ${JSON.stringify(status.value.err)}`);
              break;
            } else if (status.value.confirmationStatus === 'confirmed' || 
                       status.value.confirmationStatus === 'finalized') {
              console.log(`✅ Transaction confirmed!`);
              confirmed = true;
              break;
            } else {
              console.log(`Status: ${status.value.confirmationStatus || 'processing'}`);
            }
          } else {
            console.log('Transaction not found yet. Continuing to poll...');
          }
          
          if (!confirmed) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error(`Error checking status: ${error}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (!confirmed && attempts >= maxAttempts) {
        console.log('❌ Confirmation timed out. Please check explorer for final status.');
        return;
      }
      
      // Verify the ATA was created
      const newATAInfo = await connection.getAccountInfo(vaultJitoSolATA);
      if (newATAInfo) {
        console.log(`✅ Vault's jitoSOL ATA created successfully: ${vaultJitoSolATA.toString()}`);
        console.log(`Now you can try making a deposit to this vault.`);
      } else {
        console.log(`❌ Failed to create Vault's jitoSOL ATA: ${vaultJitoSolATA.toString()}`);
      }
      
      // Check if the vault PDA was created as a side effect
      const newVaultInfo = await connection.getAccountInfo(depositVaultPDA);
      if (newVaultInfo) {
        console.log(`✅ Deposit vault account created as a side effect: ${depositVaultPDA.toString()}`);
      } else {
        console.log(`⚠️ The deposit vault account was not created yet: ${depositVaultPDA.toString()}`);
        console.log(`It may be created during the first deposit operation.`);
      }
    } catch (error: any) {
      console.error(`\nError sending transaction: ${error}`);
      console.log(`\n⚠️ Important: The vault deposit account and ATA creation requires special privileges.`);
      console.log(`This functionality should be done by the vault administrator through the program's intended instructions.`);
      console.log(`If you are the vault administrator but still see this error, please check that your keypair has the correct permissions.`);
    }
  } catch (error) {
    console.error('Error initializing vault deposit account:', error);
  }
} 