import { web3 } from '@coral-xyz/anchor';
import { 
  AccountLayout, 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstructionWithDerivation,
  createAssociatedTokenAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Address } from 'gill';
import * as fs from 'fs';
import { utils } from '@coral-xyz/anchor';

// Import shared utilities
import { 
  solanaClient, 
  MAINNET_CONFIG, 
  loadKeypair, 
  TOKEN_MINTS,
  createConnection,
} from './mainnet-test-utils';

// Import services and constants
import { VaultSDK } from '../sdk';
import { 
  JITO_SOL_MINT_ADDRESS,
  BORING_VAULT_PROGRAM_ID
} from '../utils/constants';


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
      jitoSolBalance = accountData.amount; // amount is already a bigint in newer versions
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
    const userSharesATA = getAssociatedTokenAddressSync(
      shareMintPDA,         // mint
      walletPublicKey,      // owner
      true,                 // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,     // programId
      ASSOCIATED_TOKEN_PROGRAM_ID  // associatedTokenProgramId
    );
    
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
      const vaultJitoSolATA = getAssociatedTokenAddressSync(
        jitoSolMint,         // mint
        vaultPDA,            // owner
        true,                // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,    // programId
        ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId
      );
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
      
      // Debug: Check share mint owner
      const shareMintInfo = await connection.getAccountInfo(shareMintPDA);
      if (!shareMintInfo) {
        console.log(`❌ Share mint does not exist: ${shareMintPDA.toString()}`);
        return;
      }
      
      console.log(`\nDebug - Share Mint Info:`);
      console.log(`Owner: ${shareMintInfo.owner.toString()}`);
      console.log(`Data Size: ${shareMintInfo.data.length} bytes`);
      console.log(`Standard Token Program: ${TOKEN_PROGRAM_ID.toString()}`);
      console.log(`Standard Associated Token Program: ${ASSOCIATED_TOKEN_PROGRAM_ID.toString()}`);
      
      // Use the actual token program from the share mint
      const actualTokenProgram = shareMintInfo.owner;
      console.log(`Using the actual token program from the share mint: ${actualTokenProgram.toString()}`);
      
      // Create custom instruction using correct token program
      console.log('Creating user share token account...');
      
      try {
        // Use the createAssociatedTokenAccount directly instead of instruction
        console.log('Creating token account with createAssociatedTokenAccount...');
        
        // Load keypair from file for signing
        const keypairPath = process.env.KEYPAIR_PATH || '';
        if (!keypairPath) {
          throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
        }
        const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
        const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
        
        // Create the instruction instead of using the createAssociatedTokenAccount helper
        // This avoids potential websocket hangs
        console.log('Creating instruction for token account creation...');
        const instruction = createAssociatedTokenAccountIdempotentInstructionWithDerivation(
          keypair.publicKey,      // payer
          walletPublicKey,        // owner
          shareMintPDA,           // mint
          true,                   // allowOwnerOffCurve
          actualTokenProgram,     // programId
          ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId
        );
        
        // Create a transaction
        const transaction = new web3.Transaction().add(instruction);
        
        // Get recent blockhash with HTTP connection
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = keypair.publicKey;
        
        // Sign and send the transaction
        transaction.sign(keypair);
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: true,
          preflightCommitment: 'confirmed'
        });
        
        console.log(`✅ Token account creation transaction sent: ${signature}`);
        console.log(`View on explorer: https://solscan.io/tx/${signature}`);
        
        // Instead of waiting for confirmation with a potential websocket hang,
        // we'll just derive the ATA address and check if it exists after a short delay
        const ataAddress = getAssociatedTokenAddressSync(
          shareMintPDA,          // mint
          walletPublicKey,       // owner 
          true,                  // allowOwnerOffCurve
          actualTokenProgram,    // programId
          ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId
        );
        
        console.log(`Derived ATA address: ${ataAddress.toString()}`);
        console.log(`Waiting 5 seconds for transaction to propagate...`);
        
        // Wait a fixed time instead of using websocket confirmations
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check if it exists now
        const ataInfo = await connection.getAccountInfo(ataAddress);
        if (ataInfo) {
          console.log(`✅ Token account created at: ${ataAddress.toString()}`);
        } else {
          console.log(`⚠️ Token account not confirmed yet. Transaction may still be processing.`);
          console.log(`You can check the transaction status manually at: https://solscan.io/tx/${signature}`);
          console.log(`Continuing with the derived ATA address: ${ataAddress.toString()}`);
        }
        
        // Continue with deposit - passing control back to the main flow
      } catch (error) {
        console.error('Error creating token account:', error);
        
        // Fallback - just derive the ATA address and check if it exists
        console.log('\nFalling back to manual ATA address derivation...');
        
        // First derive the ATA address
        const ataAddress = getAssociatedTokenAddressSync(
          shareMintPDA,          // mint
          walletPublicKey,       // owner 
          true,                  // allowOwnerOffCurve
          actualTokenProgram,    // programId
          ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId
        );
        
        console.log(`Derived ATA address: ${ataAddress.toString()}`);
        
        // Check if it already exists
        const ataInfo = await connection.getAccountInfo(ataAddress);
        if (ataInfo) {
          console.log(`✅ Token account already exists at: ${ataAddress.toString()}`);
        } else {
          console.log(`❌ Token account does not exist at: ${ataAddress.toString()}`);
          console.log(`Attempting to proceed with deposit anyway. The program may handle creating the account.`);
        }
      }
    } else {
      console.log(`✅ User's share token account exists: ${userSharesATA.toString()}`);
    }
    
    // Get vault token ATA
    const vaultTokenATA = getAssociatedTokenAddressSync(
      new web3.PublicKey(TOKEN_MINTS.JITO_SOL), // mint
      vaultPDA,                                 // owner
      true,                                     // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,                         // programId
      ASSOCIATED_TOKEN_PROGRAM_ID               // associatedTokenProgramId
    );
    console.log(`Vault's jitoSOL token account: ${vaultTokenATA.toString()}`);

    // Get asset data account PDA - fix by passing vaultStatePDA instead of vaultId
    const assetDataPDA = await boringVault.getAssetDataPDA(vaultStatePDA, new web3.PublicKey(TOKEN_MINTS.JITO_SOL));
    console.log(`jitoSOL asset data account: ${assetDataPDA.toString()}`);

    // Check if it exists
    const assetDataInfo = await connection.getAccountInfo(assetDataPDA);
    if (assetDataInfo) {
      console.log(`✅ jitoSOL asset data account exists`);
    } else {
      console.log(`❌ jitoSOL asset data account does not exist. Cannot proceed with deposit.`);
      return undefined;
    }

    // Check for program config account - this may be the missing account
    try {
      // The missing account from the error log
      const missingAccountAddress = new web3.PublicKey('3dMB3jrRu6j6LrVWm116KGqBEUsT34fi5P7BBa2mRKSR');
      console.log(`\nChecking for missing program config account: ${missingAccountAddress.toString()}`);
      
      const missingAccountInfo = await connection.getAccountInfo(missingAccountAddress);
      if (missingAccountInfo) {
        console.log(`✅ Program config account exists with the following details:`);
        console.log(`   Owner: ${missingAccountInfo.owner.toString()}`);
        console.log(`   Data Size: ${missingAccountInfo.data.length} bytes`);
      } else {
        console.log(`❌ Program config account does not exist: ${missingAccountAddress.toString()}`);
        console.log(`This account is required by the program but is missing.`);
        console.log(`This may need to be initialized by an admin or the program owner.`);
        return undefined;
      }
    } catch (error) {
      console.log(`Error checking program config account: ${error}`);
    }

    // Examine asset data (this is optional)
    console.log(`\nExamining asset data:`);
    
    // Build deposit transaction using boring vault SDK
    console.log('\nBuilding deposit transaction...');
      
    // Log arguments for clarity
    console.log('Deposit Arguments:');
    console.log(`- Wallet Public Key: ${walletPublicKey.toString()}`);
    console.log(`- Vault ID: ${vaultId}`);
    console.log(`- Deposit Mint: ${TOKEN_MINTS.JITO_SOL.toString()}`);
    console.log(`- Deposit Amount: ${depositLamports.toString()}`);
    console.log(`- Min Mint Amount: ${minMintAmount.toString()}`);
    
    try {
      // STEP 1: Try to initialize the vault PDA if it doesn't exist
      if (!vaultPDAInfo) {
        console.log('\nInitializing Vault PDA since it does not exist...');
        console.log('This may need admin privileges and may not work with a regular user wallet.');
        
        try {
          // Instead of trying to initialize directly (which would require admin privileges),
          // we'll check if the vault admin needs to perform this action
          const adminRequired = vaultData.vaultState.authority.toString() !== signerAddress;
          if (adminRequired) {
            console.log(`❌ Vault PDA initialization requires the vault authority: ${vaultData.vaultState.authority.toString()}`);
            console.log('Current signer does not have permission to initialize the vault');
            console.log('Please contact the vault administrator to initialize the vault PDA first.');
            return;
          }
        } catch (error) {
          console.log('Error checking vault initialization permissions:', error);
          console.log('Continuing with deposit attempt anyway...');
        }
      }

      // Get share mint info to determine the correct token program
      console.log('\nFetching share mint information...');
      const shareMintInfo = await connection.getAccountInfo(shareMintPDA);
      if (!shareMintInfo) {
        console.log(`❌ Share mint does not exist at ${shareMintPDA.toString()}`);
        return;
      }
      console.log(`Share Mint Owner (Token Program): ${shareMintInfo.owner.toString()}`);

      // STEP 2: Get the correct price feed address from constants
      const JITO_SOL_PRICE_FEED_ADDRESS = require('../utils/constants').JITO_SOL_PRICE_FEED_ADDRESS;
      const priceFeedPublicKey = new web3.PublicKey(JITO_SOL_PRICE_FEED_ADDRESS);
      console.log(`Using jito-sol price feed: ${priceFeedPublicKey.toString()}`);
      
      // Get user's current ATA for share token
      const correctUserShareATA = getAssociatedTokenAddressSync(
        shareMintPDA,         // mint
        walletPublicKey,      // owner
        true,                 // allowOwnerOffCurve
        new web3.PublicKey(shareMintInfo.owner.toString()), // Use the actual token program from share mint
        ASSOCIATED_TOKEN_PROGRAM_ID  // associatedTokenProgramId
      );
      console.log(`Corrected user's share token account: ${correctUserShareATA.toString()}`);
      
      // Check if user's share token account exists after our creation attempt
      const shareTokenAccountInfo = await connection.getAccountInfo(correctUserShareATA);
      if (!shareTokenAccountInfo) {
        console.log(`❌ User's share token account still doesn't exist at: ${correctUserShareATA.toString()}`);
        console.log('Creating it one more time with the correct token program...');
        
        // Load keypair from file for signing
        const keypairPath = process.env.KEYPAIR_PATH || '';
        if (!keypairPath) {
          throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
        }
        const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
        const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
        
        // Create the token account instruction using the correct token program
        const instruction = createAssociatedTokenAccountIdempotentInstructionWithDerivation(
          keypair.publicKey,                          // payer
          walletPublicKey,                            // owner
          shareMintPDA,                               // mint
          true,                                       // allowOwnerOffCurve
          new web3.PublicKey(shareMintInfo.owner.toString()), // actual token program
          ASSOCIATED_TOKEN_PROGRAM_ID                 // associatedTokenProgramId
        );
        
        // Create and send transaction
        const transaction = new web3.Transaction().add(instruction);
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = keypair.publicKey;
        
        // Sign and send
        transaction.sign(keypair);
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: true,
          preflightCommitment: 'confirmed'
        });
        
        console.log(`✅ Token account creation transaction sent: ${signature}`);
        console.log(`View on explorer: https://solscan.io/tx/${signature}`);
        
        // Wait for confirmation with HTTP polling
        console.log('Waiting for token account creation to confirm...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check again if it exists
        const newAccountInfo = await connection.getAccountInfo(correctUserShareATA);
        if (!newAccountInfo) {
          console.log(`❌ Failed to create user's share token account. Cannot proceed with deposit.`);
          return;
        }
        console.log(`✅ User's share token account successfully created: ${correctUserShareATA.toString()}`);
      }

      // Now build the deposit transaction with customized account list to ensure we include the price feed
      console.log('\nCustomizing deposit transaction...');
      
      const tx = await boringVault.buildDepositTransaction(
        walletPublicKey,
        vaultId,
        new web3.PublicKey(TOKEN_MINTS.JITO_SOL.toString()),
        depositLamports,
        minMintAmount
      );
      
      // Replace the price feed account with the correct one from constants
      const accounts = tx.instructions[0].keys;
      const priceFeedIndex = accounts.findIndex(key => 
        key.pubkey.toString() === '111111118YVWCzLQ58N3so7cz5suJHiWYKoKsY3Xu'
      );
      
      if (priceFeedIndex !== -1) {
        console.log(`Replacing placeholder price feed with: ${JITO_SOL_PRICE_FEED_ADDRESS}`);
        accounts[priceFeedIndex].pubkey = priceFeedPublicKey;
      }
      
      // Also ensure we're using the correct share token account
      const shareATAIndex = accounts.findIndex(key => 
        key.pubkey.toString() === '2Mi1Mz13RjiU34YdwSaWgtrrSLt1hV4zCv6eSdvdYgpr'
      );
      
      if (shareATAIndex !== -1) {
        console.log(`Replacing incorrect share token account with: ${correctUserShareATA.toString()}`);
        accounts[shareATAIndex].pubkey = correctUserShareATA;
      }
      
      console.log('\nTransaction built with corrected accounts:');
      tx.instructions.forEach((ix, index) => {
        console.log(`Instruction ${index + 1}:`);
        console.log(`  Program ID: ${ix.programId.toString()}`);
        console.log(`  Data length: ${ix.data.length} bytes`);
        console.log(`  Accounts (${ix.keys.length}):`);
        ix.keys.forEach((key, i) => {
          console.log(`    [${i}] ${key.pubkey.toString()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
        });
      });
      
      // Get recent blockhash from direct connection (HTTP only)
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
      
      console.log('\nSending transaction (without waiting for confirmation)...');
      
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'confirmed'
      });
      
      console.log(`\n✅ Transaction sent! Signature: ${signature}`);
      console.log(`View on explorer: https://solscan.io/tx/${signature}`);
      
      // Poll for transaction status using HTTP method instead of websockets
      console.log('\nPolling for transaction status...');
      
      // Function to poll transaction status using getSignatureStatuses (HTTP method)
      const pollTransactionStatus = async (signature: string, maxAttempts = 30): Promise<string> => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            // Use getSignatureStatuses (HTTP method) instead of confirmTransaction (WebSocket)
            const response = await connection.getSignatureStatuses([signature]);
            
            const status = response.value[0];
            if (status) {
              if (status.confirmationStatus === 'finalized') {
                return 'finalized';
              } else if (status.confirmationStatus === 'confirmed') {
                return 'confirmed';
              } else if (status.confirmationStatus === 'processed') {
                return 'processed';
              } else if (status.err) {
                return `error: ${JSON.stringify(status.err)}`;
              }
            }
            
            // Wait before next poll attempt
            await new Promise(resolve => setTimeout(resolve, 1000));
            process.stdout.write('.');
          } catch (error) {
            console.error(`\nError polling transaction: ${error}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        return 'timeout';
      };
      
      // Wait for transaction with timeout
      console.log('Waiting for confirmation (max 30 seconds)');
      const status = await pollTransactionStatus(signature);
      
      // Check final status
      if (status === 'finalized' || status === 'confirmed') {
        console.log(`\n✅ Transaction ${status}!`);
        
        // Get transaction details
        console.log('\nFetching transaction details...');
        try {
          const transaction = await connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0,
          });
          
          if (transaction) {
            // Print relevant transaction details
            console.log('\nTransaction Results:');
            console.log(`Status: ${transaction.meta?.err ? 'Failed' : 'Success'}`);
            
            if (transaction.meta?.err) {
              console.log(`Error: ${JSON.stringify(transaction.meta.err)}`);
              
              // Enhanced error analysis
              const errorStr = JSON.stringify(transaction.meta.err);
              if (errorStr.includes('MissingAccount')) {
                console.log('\nAnalyzing MissingAccount error...');
                console.log('This error occurs when a required account doesn\'t exist or is invalid.');
                
                // Get logs if available to see which account is missing
                if (transaction.meta?.logMessages && transaction.meta.logMessages.length > 0) {
                  console.log('\nProgram logs:');
                  transaction.meta.logMessages.forEach(log => {
                    if (log.includes('not found') || log.includes('missing') || log.includes('invalid')) {
                      console.log(`  ${log}`);
                    }
                  });
                }
                
                // Check each account referenced in the transaction
                console.log('\nChecking all accounts in transaction:');
                const accountKeys = transaction.transaction.message.getAccountKeys 
                  ? transaction.transaction.message.getAccountKeys().keySegments().flat()
                  : transaction.transaction.message.staticAccountKeys;
                
                // Create connection and check accounts in parallel
                console.log('Validating key accounts (this may take a few seconds)...');
                Promise.all(accountKeys.map(async (pubkey, i) => {
                  try {
                    const info = await connection.getAccountInfo(pubkey);
                    return { 
                      index: i, 
                      pubkey: pubkey.toString(), 
                      exists: !!info,
                      owner: info ? info.owner.toString() : 'N/A',
                      dataSize: info ? info.data.length : 0
                    };
                  } catch (e: unknown) {
                    const errorMessage = e instanceof Error ? e.message : String(e);
                    return { 
                      index: i, 
                      pubkey: pubkey.toString(), 
                      exists: false,
                      error: errorMessage
                    };
                  }
                })).then(results => {
                  // Print account validation results with focus on missing accounts
                  results.forEach((result, i) => {
                    if (!result.exists) {
                      console.log(`❌ [${i}] Account ${result.pubkey} DOES NOT EXIST`);
                    }
                  });
                  
                  console.log('\nMost likely causes:');
                  console.log('1. One of the accounts needed for the transaction does not exist and needs to be created first');
                  console.log('2. The vault PDA or another program-derived address may need initialization');
                  console.log('3. The price feed address may be incorrect or missing');
                });
              }
            } else {
              // Post balance changes
              if (transaction.meta?.postBalances && transaction.meta?.postTokenBalances) {
                console.log('\nToken Balance Changes:');
                transaction.meta.postTokenBalances.forEach((balance, i) => {
                  const preBalance = transaction.meta?.preTokenBalances?.find(
                    (pre) => pre.accountIndex === balance.accountIndex
                  );
                  
                  if (preBalance) {
                    // Use the accountKeys from transaction meta which works for all transaction versions
                    const accountKey = transaction.meta?.loadedAddresses?.writable[balance.accountIndex] || 
                                     transaction.transaction.message.staticAccountKeys[balance.accountIndex];
                    console.log(`  Account: ${accountKey.toString()}`);
                    console.log(`  Mint: ${balance.mint}`);
                    console.log(`  Owner: ${balance.owner}`);
                    console.log(`  Pre-balance: ${preBalance.uiTokenAmount.uiAmount}`);
                    console.log(`  Post-balance: ${balance.uiTokenAmount.uiAmount}`);
                    console.log(`  Change: ${(balance.uiTokenAmount.uiAmount || 0) - (preBalance.uiTokenAmount.uiAmount || 0)}`);
                    console.log('  ---');
                  }
                });
              }
              
              // Log log messages
              if (transaction.meta?.logMessages && transaction.meta.logMessages.length > 0) {
                console.log('\nRelevant Log Messages:');
                const relevantLogs = transaction.meta.logMessages.filter(log => 
                  log.includes('boring') || 
                  log.includes('deposit') || 
                  log.includes('mint') ||
                  log.includes('error') ||
                  log.includes('fail')
                );
                relevantLogs.forEach(log => console.log(`  ${log}`));
              }
            }
          } else {
            console.log(`\n❌ Failed to fetch transaction details`);
          }
        } catch (error) {
          console.error(`\nError fetching transaction details: ${error}`);
        }
      } else if (status.startsWith('error')) {
        console.log(`\n❌ Transaction failed: ${status}`);
      } else {
        console.log(`\n⚠️ Transaction not confirmed after timeout: ${status}`);
        console.log('Transaction may still be processing. Check status manually:');
        console.log(`https://solscan.io/tx/${signature}`);
      }
      
      return signature;
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
    const vaultJitoSolATA = getAssociatedTokenAddressSync(
      jitoSolMint,         // mint
      depositVaultPDA,     // owner - use depositVaultPDA here
      true,                // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,    // programId
      ASSOCIATED_TOKEN_PROGRAM_ID // associatedTokenProgramId
    );
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
    
    // Create instruction to create the ATA with PDA support
    const createATAIx = createAssociatedTokenAccountIdempotentInstructionWithDerivation(
      new web3.PublicKey(signer.address), // payer
      depositVaultPDA,                    // owner - this is a PDA, so we need special handling
      jitoSolMint,                        // mint
      true,                               // allowOwnerOffCurve - allows PDAs
      TOKEN_PROGRAM_ID,                   // Use the standard Token Program ID
      ASSOCIATED_TOKEN_PROGRAM_ID         // Use the standard Associated Token Program ID
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
      
      // Wait a fixed amount of time instead of polling
      console.log(`\nWaiting 5 seconds for transaction to propagate...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check if ATA was created
      const newATAInfo = await connection.getAccountInfo(vaultJitoSolATA);
      if (newATAInfo) {
        console.log(`✅ Vault's jitoSOL ATA created successfully: ${vaultJitoSolATA.toString()}`);
        console.log(`Now you can try making a deposit to this vault.`);
      } else {
        console.log(`⚠️ Vault's jitoSOL ATA creation transaction may still be processing.`);
        console.log(`Check transaction status at: https://solscan.io/tx/${signature}`);
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
