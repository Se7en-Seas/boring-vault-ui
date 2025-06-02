import { web3 } from '@coral-xyz/anchor';
import { 
  AccountLayout, 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstructionWithDerivation,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token';
import { Address } from 'gill';
import * as fs from 'fs';

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
  BORING_VAULT_PROGRAM_ID,
  BORING_QUEUE_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  DEFAULT_DECIMALS
} from '../utils/constants';

// Import necessary dependencies at the top of the file
import vaultIdl from '../idls/boring-vault-svm-idl.json';
import queueIdl from '../idls/boring-queue-svm-idl.json';

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
    if (vaultData.tellerState) {
      console.log('\nTeller State:');
      console.log(`Base Asset: ${vaultData.tellerState.baseAsset.toString()}`);
      console.log(`Exchange Rate: ${vaultData.tellerState.exchangeRate.toString()}`);
      console.log(`Exchange Rate Provider: ${vaultData.tellerState.exchangeRateProvider.toString()}`);
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
    
    // Load keypair from file for signing
    const keypairPath = process.env.KEYPAIR_PATH || '';
    if (!keypairPath) {
      throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
    }
    
    const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    
    console.log('\nExecuting deposit transaction...');
    
    // Use the enhanced deposit function from VaultSDK
    try {
      const signature = await vaultService.deposit(
        keypair, // Pass the keypair directly
        vaultId,
        TOKEN_MINTS.JITO_SOL.toString(),
        depositLamports,
        minMintAmount,
        {
          skipPreflight: true, // Skip preflight to avoid rejections for valid transactions
          maxRetries: 30
        }
      );
      
      // Poll for transaction status
      console.log('Polling for transaction status...');
      const maxAttempts = 30;
      
      // Poll transaction status
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await connection.getSignatureStatuses([signature]);
          const status = response.value[0];
          
          if (status) {
            if (status.err) {
              console.error(`Transaction failed: ${JSON.stringify(status.err)}`);
              throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            }
            
            if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
              console.log(`Transaction ${status.confirmationStatus}!`);
              
              // Get transaction details for debugging
              try {
                const txDetails = await connection.getTransaction(signature, {
                  maxSupportedTransactionVersion: 0,
                });
                
                if (txDetails && txDetails.meta) {
                  if (txDetails.meta.err) {
                    console.error(`Transaction error: ${JSON.stringify(txDetails.meta.err)}`);
                  } else {
                    console.log('Transaction successful!');
                    
                    // Log token balance changes if available
                    if (txDetails.meta.postTokenBalances && txDetails.meta.preTokenBalances) {
                      console.log('Token balance changes:');
                      txDetails.meta.postTokenBalances.forEach((postBalance) => {
                        const preBalance = txDetails.meta?.preTokenBalances?.find(
                          (pre) => pre.accountIndex === postBalance.accountIndex
                        );
                        
                        if (preBalance) {
                          const change = (postBalance.uiTokenAmount.uiAmount || 0) - 
                                        (preBalance.uiTokenAmount.uiAmount || 0);
                          console.log(`  Mint: ${postBalance.mint}, Change: ${change}`);
                        }
                      });
                    }
                  }
                }
              } catch (detailsError) {
                console.warn(`Could not fetch transaction details: ${detailsError}`);
              }
              
              return signature;
            }
          }
          
          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, 1000));
          process.stdout.write('.');
        } catch (error) {
          console.warn(`Error checking transaction status (attempt ${attempt + 1}/${maxAttempts}): ${error}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
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
 * Test queueBoringWithdraw functionality with jitoSOL
 */
export async function testQueueWithdraw(): Promise<string | undefined> {
  console.log('\n=== TESTING QUEUE WITHDRAW WITH JITO-SOL ===');
  
  try {
    // Print constants for debugging
    console.log('Constants used in test:');
    console.log(`JITO_SOL_MINT_ADDRESS: ${JITO_SOL_MINT_ADDRESS}`);
    console.log(`BORING_VAULT_PROGRAM_ID: ${BORING_VAULT_PROGRAM_ID}`);
    console.log(`BORING_QUEUE_PROGRAM_ID: ${BORING_QUEUE_PROGRAM_ID}`);
    
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    // Print key configuration
    console.log('\nTest Configuration:');
    console.log(`Vault Pubkey (from .env): ${vaultPubkey.toString()}`);
    
    // Load regular keypair from .env
    const signer = await loadKeypair();
    console.log(`Using signer: ${signer.address}`);
    
    // Load the keypair in web3.Keypair format
    const keypairPath = process.env.KEYPAIR_PATH || '';
    if (!keypairPath) {
      throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
    }
    
    const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    
    // Get vault data to extract vault ID
    console.log(`\nFetching data for vault: ${vaultPubkey.toString()}`);
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    const vaultId = Number(vaultData.vaultState.vaultId);
    console.log(`Vault ID: ${vaultId}`);
    console.log(`Vault Authority: ${vaultData.vaultState.authority.toString()}`);
    console.log(`Paused: ${vaultData.vaultState.paused}`);
    console.log(`Share Mint: ${vaultData.vaultState.shareMint.toString()}`);
    
    // Check user's share token balance
    const boringVault = vaultService.getBoringVault();
    const userShares = await boringVault.fetchUserShares(signer.address, vaultId);
    
    console.log(`\nCurrent share balance: ${userShares.formatted} (${userShares.raw.toString()} raw)`);
    
    if (userShares.raw <= BigInt(0)) {
      console.log('❌ No shares to withdraw. Please deposit to the vault first.');
      return;
    }
    
    // Convert current balance to human-readable amount using fixed decimals
    const currentFormattedBalance = Number(userShares.raw) / 10**DEFAULT_DECIMALS;
    const withdrawHumanReadable = currentFormattedBalance / 10;
    const maxWithdrawAmount = currentFormattedBalance;
    
    // Validate the amount is within limits
    if (withdrawHumanReadable > maxWithdrawAmount) {
      console.log(`❌ Insufficient share balance. Need ${withdrawHumanReadable} shares but only have ${maxWithdrawAmount}`);
      return;
    }
    
    // Calculate parameters for withdraw request
    console.log(`Using amount: ${withdrawHumanReadable} shares (human-readable amount)`);
    console.log(`This will be converted to ${withdrawHumanReadable * 10**DEFAULT_DECIMALS} raw units in the SDK`);
    const discountPercent = 0; // 0% discount to simplify calculation
    const secondsToDeadline = 86400; // 1 day (24 hours)
    
    console.log(`Discount: ${discountPercent}%`);
    console.log(`Deadline: ${secondsToDeadline} seconds (${secondsToDeadline/3600} hours)`);
    
    // Create a direct web3.js connection for transaction sending
    const connection = createConnection();
    
    try {
      // Get queue state PDA and other accounts needed
      const queueStatePDA = await boringVault.getQueueStatePDA(vaultId);
      const queuePDA = await boringVault.getQueuePDA(vaultId);
      const shareMintPDA = vaultData.vaultState.shareMint;
      
      // Get user withdraw state PDA
      const userWithdrawStatePDA = await boringVault.getUserWithdrawStatePDA(keypair.publicKey);
      console.log(`User Withdraw State PDA: ${userWithdrawStatePDA.toString()}`);
      
      // Check if user withdraw state exists and get its nonce
      const userWithdrawStateExists = await boringVault.doesAccountExist(userWithdrawStatePDA);
      console.log(`User Withdraw State exists: ${userWithdrawStateExists}`);
      
      // Define the queue program ID
      const queueProgramId = new web3.PublicKey(BORING_QUEUE_PROGRAM_ID);
      
      // Create user withdraw state if it doesn't exist
      if (!userWithdrawStateExists) {
        console.log("User Withdraw State doesn't exist. Creating it first...");
        
        // Get the setup_user_withdraw_state instruction discriminator
        const setupInstructionDiscriminator = queueIdl.instructions.find(
          (instr: any) => instr.name === 'setup_user_withdraw_state'
        )?.discriminator;
        
        if (!setupInstructionDiscriminator) {
          throw new Error('setup_user_withdraw_state instruction discriminator not found in IDL');
        }
        
        // Create setup_user_withdraw_state instruction
        const setupInstruction = new web3.TransactionInstruction({
          programId: queueProgramId,
          keys: [
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: userWithdrawStatePDA, isSigner: false, isWritable: true },
            { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(setupInstructionDiscriminator)
        });
        
        // Create transaction to set up user withdraw state
        const setupTx = new web3.Transaction().add(setupInstruction);
        
        // Add recent blockhash
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        setupTx.recentBlockhash = blockhash;
        setupTx.feePayer = keypair.publicKey;
        
        // Sign and send transaction
        setupTx.sign(keypair);
        const setupSignature = await connection.sendRawTransaction(setupTx.serialize(), {
          skipPreflight: true
        });
        
        console.log(`Sent transaction to create User Withdraw State. Signature: ${setupSignature}`);
        console.log(`View on explorer: https://solscan.io/tx/${setupSignature}`);
        
        // Poll for transaction confirmation
        console.log("Polling for User Withdraw State creation transaction status...");
        const maxSetupAttempts = 30;
        let setupConfirmed = false;
        
        for (let attempt = 0; attempt < maxSetupAttempts; attempt++) {
          try {
            // Use getSignatureStatus instead of WebSocket methods
            const response = await connection.getSignatureStatus(setupSignature);
            
            if (response && response.value) {
              if (response.value.err) {
                console.error(`User Withdraw State creation failed: ${JSON.stringify(response.value.err)}`);
                console.error(`❌ Cannot proceed with withdrawal due to User Withdraw State creation failure.`);
                return undefined;
              }
              
              if (response.value.confirmationStatus === 'finalized' || 
                  response.value.confirmationStatus === 'confirmed') {
                console.log(`User Withdraw State creation ${response.value.confirmationStatus}!`);
                console.log(`✅ User Withdraw State created at: ${userWithdrawStatePDA.toString()}`);
                setupConfirmed = true;
                break;
              }
            }
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, 1000));
            process.stdout.write('.');
          } catch (error) {
            console.warn(`Error checking User Withdraw State creation status (attempt ${attempt + 1}/${maxSetupAttempts}): ${error}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        if (!setupConfirmed) {
          console.error(`❌ Could not confirm User Withdraw State creation transaction. Cannot proceed with withdrawal.`);
          return undefined;
        }
      }
      
      // Now the user withdraw state should exist, fetch it to get the correct nonce
      console.log("Fetching User Withdraw State to get the correct nonce...");
      
      // Fetch the user withdraw state account to get the nonce
      let userNonce = 0;
      try {
        const userWithdrawStateAddress = userWithdrawStatePDA.toBase58() as Address;
        const response = await solanaClient.rpc.getAccountInfo(
          userWithdrawStateAddress,
          { encoding: 'base64' }
        ).send();
        
        if (response.value && response.value.data.length) {
          const data = Buffer.from(response.value.data[0], 'base64');
          // Skip the 8-byte discriminator
          userNonce = Number(data.readBigUInt64LE(8));
          console.log(`User Withdraw State nonce: ${userNonce}`);
        } else {
          console.error("Failed to fetch User Withdraw State data. Cannot proceed with withdrawal.");
          return undefined;
        }
      } catch (error) {
        console.error(`Error fetching User Withdraw State: ${error}`);
        return undefined;
      }
      
      // Now derive the withdraw request PDA with the correct nonce
      // Ensure we're using the exact same byte format as the Solana program
      const requestIdBuffer = Buffer.alloc(8);
      requestIdBuffer.writeBigUInt64LE(BigInt(userNonce), 0);
      
      // Debug the buffer to ensure correctness
      console.log(`Nonce value: ${userNonce}`);
      console.log(`RequestId buffer bytes: [${Array.from(requestIdBuffer).join(', ')}]`);
      
      const [withdrawRequestPDA] = await web3.PublicKey.findProgramAddress(
        [Buffer.from("boring-queue-withdraw-request"), keypair.publicKey.toBuffer(), requestIdBuffer], 
        queueProgramId
      );
      
      console.log(`Calculated Withdraw Request PDA with nonce ${userNonce}: ${withdrawRequestPDA.toString()}`);
      
      
      // Derive queue shares ATA address
      const queueSharesATA = getAssociatedTokenAddressSync(
        shareMintPDA,        // mint
        queuePDA,            // owner
        true,                // allowOwnerOffCurve
        new web3.PublicKey(TOKEN_2022_PROGRAM_ID) // programId
      );
      console.log(`Queue Shares ATA: ${queueSharesATA.toString()}`);
      
      // Check if the queue shares ATA exists
      const queueSharesExists = await boringVault.doesAccountExist(queueSharesATA);
      console.log(`Queue Shares ATA exists: ${queueSharesExists}`);
      
      // If the queue shares ATA doesn't exist, create it
      if (!queueSharesExists) {
        console.log("Queue Shares ATA doesn't exist. Creating it...");
        
        // Create instruction to create ATA
        const createATAInstruction = createAssociatedTokenAccountIdempotentInstructionWithDerivation(
          keypair.publicKey,  // payer
          queuePDA,           // owner
          shareMintPDA,       // mint
          true,               // allowOwnerOffCurve
          new web3.PublicKey(TOKEN_2022_PROGRAM_ID), // token program ID
          ASSOCIATED_TOKEN_PROGRAM_ID // ata program ID
        );
        
        // Create transaction to create ATA
        const createATATx = new web3.Transaction().add(createATAInstruction);
        
        // Add recent blockhash
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        createATATx.recentBlockhash = blockhash;
        createATATx.feePayer = keypair.publicKey;
        
        // Sign and send transaction
        createATATx.sign(keypair);
        const ataSignature = await connection.sendRawTransaction(createATATx.serialize(), {
          skipPreflight: true
        });
        
        console.log(`Sent transaction to create Queue Shares ATA. Signature: ${ataSignature}`);
        console.log(`View on explorer: https://solscan.io/tx/${ataSignature}`);
        
        // Poll for transaction confirmation
        console.log("Polling for ATA creation transaction status...");
        const maxAttempts = 30;
        let confirmed = false;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            // Use getSignatureStatus instead of WebSocket methods
            const response = await connection.getSignatureStatus(ataSignature);
            
            if (response && response.value) {
              if (response.value.err) {
                console.error(`ATA creation transaction failed: ${JSON.stringify(response.value.err)}`);
                console.error(`❌ Cannot proceed with withdrawal due to ATA creation failure.`);
                return undefined;
              }
              
              if (response.value.confirmationStatus === 'finalized' || 
                  response.value.confirmationStatus === 'confirmed') {
                console.log(`ATA creation transaction ${response.value.confirmationStatus}!`);
                console.log(`✅ Queue shares ATA created at: ${queueSharesATA.toString()}`);
                confirmed = true;
                break;
              }
            }
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, 1000));
            process.stdout.write('.');
          } catch (error) {
            console.warn(`Error checking ATA creation status (attempt ${attempt + 1}/${maxAttempts}): ${error}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        if (!confirmed) {
          console.error(`❌ Could not confirm ATA creation transaction. Cannot proceed with withdrawal.`);
          return undefined;
        }
        
        // Double-check that the account exists now
        const ataExists = await boringVault.doesAccountExist(queueSharesATA);
        if (!ataExists) {
          console.error(`❌ Queue shares ATA still doesn't exist after transaction. Cannot proceed with withdrawal.`);
          return undefined;
        }
        
        console.log(`✅ Confirmed queue shares ATA exists at ${queueSharesATA.toString()}. Proceeding with withdrawal.`);
      }
      
      // Now we can proceed with the queue withdraw transaction
      // Use the queueBoringWithdraw function
      const signature = await vaultService.queueBoringWithdraw(
        keypair, // Pass the keypair directly
        vaultId,
        JITO_SOL_MINT_ADDRESS, // Request withdrawing to jitoSOL
        withdrawHumanReadable,
        discountPercent,
        secondsToDeadline,
        queueSharesATA, // Pass the queue shares ATA address
        {
          skipPreflight: true, // Skip preflight to avoid rejections for valid transactions
          maxRetries: 30
        }
      );
      
      // Poll for transaction status
      console.log('Polling for transaction status...');
      const maxAttempts = 30;
      
      // Poll transaction status
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await connection.getSignatureStatuses([signature]);
          const status = response.value[0];
          
          if (status) {
            if (status.err) {
              console.error(`Transaction failed: ${JSON.stringify(status.err)}`);
              console.log('❌ Stopping transaction polling due to failure');
              return signature; // Return the signature but don't continue polling
            }
            
            if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
              console.log(`Transaction ${status.confirmationStatus}!`);
              
              // Get transaction details for debugging
              try {
                const txDetails = await connection.getTransaction(signature, {
                  maxSupportedTransactionVersion: 0,
                });
                
                if (txDetails && txDetails.meta) {
                  if (txDetails.meta.err) {
                    console.error(`Transaction error: ${JSON.stringify(txDetails.meta.err)}`);
                  } else {
                    console.log('Transaction successful!');
                    
                    // Log token balance changes if available
                    if (txDetails.meta.postTokenBalances && txDetails.meta.preTokenBalances) {
                      console.log('Token balance changes:');
                      txDetails.meta.postTokenBalances.forEach((postBalance) => {
                        const preBalance = txDetails.meta?.preTokenBalances?.find(
                          (pre) => pre.accountIndex === postBalance.accountIndex
                        );
                        
                        if (preBalance) {
                          const change = (postBalance.uiTokenAmount.uiAmount || 0) - 
                                        (preBalance.uiTokenAmount.uiAmount || 0);
                          console.log(`  Mint: ${postBalance.mint}, Change: ${change}`);
                        }
                      });
                    }
                    
                    // Get updated share balance to verify the shares were transferred
                    try {
                      const newShareBalance = await boringVault.fetchUserShares(signer.address, vaultId);
                      console.log(`\nNew share balance: ${newShareBalance.formatted} (${newShareBalance.raw.toString()} raw)`);
                      
                      // Calculate the balance change in raw terms
                      const rawBalanceChange = Number(userShares.raw) - Number(newShareBalance.raw);
                      
                      // Convert the raw balance change to a human-readable amount using fixed decimals
                      const humanReadableBalanceChange = rawBalanceChange / 10**DEFAULT_DECIMALS;
                      
                      console.log(`Share balance change: -${rawBalanceChange} raw (-${humanReadableBalanceChange.toFixed(9)} shares)`);
                      
                      // Compare the human-readable amounts
                      const expectedAmount = withdrawHumanReadable;
                      const actualAmount = humanReadableBalanceChange;
                      
                      // Use approximate comparison with a small tolerance due to potential rounding
                      const tolerance = 0.000001; // Allow for tiny rounding differences
                      if (Math.abs(actualAmount - expectedAmount) > tolerance) {
                        console.warn(`⚠️ Balance change doesn't match requested amount! Expected -${expectedAmount.toFixed(9)}, got -${actualAmount.toFixed(9)}`);
                      } else {
                        console.log('✅ Share balance change matches requested amount');
                      }
                    } catch (balanceError) {
                      console.warn(`Could not fetch updated share balance: ${balanceError}`);
                    }
                  }
                }
              } catch (detailsError) {
                console.warn(`Could not fetch transaction details: ${detailsError}`);
              }
              
              return signature;
            }
          }
          
          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, 1000));
          process.stdout.write('.');
        } catch (error) {
          // Check if this is our thrown error about transaction failure
          if (error instanceof Error && error.message.includes('Transaction failed')) {
            console.log('❌ Stopping transaction polling due to error');
            return signature; // Return the signature but don't continue polling
          }
          
          console.warn(`Error checking transaction status (attempt ${attempt + 1}/${maxAttempts}): ${error}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      return signature;
    } catch (error: any) {
      console.error('\nError executing queue withdraw:', error);
      
      if (error.logs) {
        console.log('\nTransaction logs:');
        error.logs.forEach((log: string, i: number) => {
          console.log(`[${i}] ${log}`);
        });
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Error testing queue withdraw:', error);
    return undefined;
  }
}

/**
 * Check the queue program configuration
 */
export async function checkQueueConfig(): Promise<string | undefined> {
  console.log('\n=== CHECKING QUEUE PROGRAM CONFIGURATION ===');
  
  try {
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const boringVault = vaultService.getBoringVault();
    
    // Get config PDA
    const configPDA = await boringVault.getQueueConfigPDA();
    console.log(`Queue Config PDA: ${configPDA.toString()}`);
    
    // Check if the config exists
    const configExists = await boringVault.doesAccountExist(configPDA);
    if (!configExists) {
      console.log('Queue program not initialized yet!');
      return;
    }
    
    // Create connection
    const connection = createConnection();
    
    // Fetch the account data
    const accountInfo = await connection.getAccountInfo(configPDA);
    if (!accountInfo) {
      console.log('Failed to fetch config account data');
      return;
    }
    
    console.log(`Account owner: ${accountInfo.owner.toString()}`);
    console.log(`Account data length: ${accountInfo.data.length} bytes`);
    
    // The first 8 bytes are the account discriminator
    // Then comes the authority public key (32 bytes)
    if (accountInfo.data.length >= 40) {
      const authorityBytes = accountInfo.data.slice(8, 40);
      const authority = new web3.PublicKey(authorityBytes);
      console.log(`Config Authority: ${authority.toString()}`);
      
      // Load signer for comparison
      const signer = await loadKeypair();
      console.log(`Current signer: ${signer.address}`);
      
      if (authority.toString() === signer.address) {
        console.log('✓ Current signer is the program authority!');
      } else {
        console.log('✗ Current signer is NOT the program authority!');
      }
    } else {
      console.log('Account data too short, cannot extract authority');
    }
    
    return configPDA.toString();
  } catch (error) {
    console.error('Error checking queue config:', error);
    return undefined;
  }
}

export async function testDepositSol(): Promise<string | undefined> {
  console.log('\n=== TESTING SOL DEPOSIT ===');
  
  try {
    // Print constants for debugging
    console.log('Constants used in test:');
    console.log(`BORING_VAULT_PROGRAM_ID: ${BORING_VAULT_PROGRAM_ID}`);
    
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    // Print key configuration
    console.log('\nTest Configuration:');
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
    if (vaultData.tellerState) {
      console.log('\nTeller State:');
      console.log(`Base Asset: ${vaultData.tellerState.baseAsset.toString()}`);
      console.log(`Exchange Rate: ${vaultData.tellerState.exchangeRate.toString()}`);
      console.log(`Exchange Rate Provider: ${vaultData.tellerState.exchangeRateProvider.toString()}`);
    }
    
    // Create a direct web3.js connection for transaction sending
    const connection = createConnection();
    
    // Check user's SOL balance
    const signerAddress = signer.address;
    const solBalanceResponse = await solanaClient.rpc.getBalance(signerAddress).send();
    const solBalance = Number(solBalanceResponse.value);
    console.log(`> Found SOL balance: ${solBalance} lamports (${solBalance / 1e9} SOL)`);
    
    // Always use fixed amount of 0.001 SOL (small amount for testing)
    const depositAmount = 0.001;
    const maxDepositAmount = solBalance / 1e9;
    
    // Validate the amount is within limits (reserve some SOL for transaction fees)
    const reserveForFees = 0.01; // Reserve 0.01 SOL for fees
    if (depositAmount > (maxDepositAmount - reserveForFees)) {
      console.log(`❌ Insufficient SOL balance. Need ${depositAmount} SOL but only have ${maxDepositAmount - reserveForFees} available (reserving ${reserveForFees} for fees)`);
      return;
    }
    
    console.log(`Using amount: ${depositAmount} SOL`);
    
    // Convert to lamports
    const depositLamports = BigInt(Math.floor(depositAmount * 1e9));
    console.log(`Deposit amount: ${depositAmount} SOL (${depositLamports} lamports)`);
    
    // Calculate minimum shares to receive (applying 5% slippage tolerance)
    const minMintAmount = depositLamports * BigInt(95) / BigInt(100);
    console.log(`Minimum shares to receive: ${minMintAmount} (5% slippage tolerance)`);
    
    // Load keypair from file for signing
    const keypairPath = process.env.KEYPAIR_PATH || '';
    if (!keypairPath) {
      throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
    }
    
    const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    
    console.log('\nExecuting SOL deposit transaction...');
    
    // Use the enhanced depositSol function from VaultSDK
    try {
      const signature = await vaultService.depositSol(
        keypair, // Pass the keypair directly
        vaultId,
        depositLamports,
        minMintAmount,
        {
          skipPreflight: true, // Skip preflight to avoid rejections for valid transactions
          maxRetries: 30
        }
      );
      
      // Poll for transaction status
      console.log('Polling for transaction status...');
      const maxAttempts = 30;
      
      // Poll transaction status
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await connection.getSignatureStatuses([signature]);
          const status = response.value[0];
          
          if (status) {
            if (status.err) {
              console.error(`Transaction failed: ${JSON.stringify(status.err)}`);
              throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            }
            
            if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
              console.log(`Transaction ${status.confirmationStatus}!`);
              
              // Get transaction details for debugging
              try {
                const txDetails = await connection.getTransaction(signature, {
                  maxSupportedTransactionVersion: 0,
                });
                
                if (txDetails && txDetails.meta) {
                  if (txDetails.meta.err) {
                    console.error(`Transaction error: ${JSON.stringify(txDetails.meta.err)}`);
                  } else {
                    console.log('SOL deposit transaction successful!');
                    
                    // Log token balance changes if available
                    if (txDetails.meta.postTokenBalances && txDetails.meta.preTokenBalances) {
                      console.log('Token balance changes:');
                      txDetails.meta.postTokenBalances.forEach((postBalance) => {
                        const preBalance = txDetails.meta?.preTokenBalances?.find(
                          (pre) => pre.accountIndex === postBalance.accountIndex
                        );
                        
                        if (preBalance) {
                          const change = (postBalance.uiTokenAmount.uiAmount || 0) - 
                                        (preBalance.uiTokenAmount.uiAmount || 0);
                          console.log(`  Mint: ${postBalance.mint}, Change: ${change}`);
                        }
                      });
                    }
                    
                    // Log SOL balance changes
                    if (txDetails.meta.postBalances && txDetails.meta.preBalances) {
                      console.log('SOL balance changes:');
                      txDetails.meta.postBalances.forEach((postBalance, index) => {
                        const preBalance = txDetails.meta?.preBalances?.[index] || 0;
                        const change = postBalance - preBalance;
                        if (change !== 0) {
                          console.log(`  Account ${index}: ${change / 1e9} SOL change`);
                        }
                      });
                    }
                  }
                }
              } catch (detailsError) {
                console.warn(`Could not fetch transaction details: ${detailsError}`);
              }
              
              return signature;
            }
          }
          
          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, 1000));
          process.stdout.write('.');
        } catch (error) {
          console.warn(`Error checking transaction status (attempt ${attempt + 1}/${maxAttempts}): ${error}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      return signature;
    } catch (error: any) {
      console.error('\nError executing SOL deposit:', error);
      
      if (error.logs) {
        console.log('\nTransaction logs:');
        error.logs.forEach((log: string, i: number) => {
          console.log(`[${i}] ${log}`);
        });
      }
      
      throw error;
    }
  } catch (error) {
    console.error('Error testing SOL deposit:', error);
    return undefined;
  }
}