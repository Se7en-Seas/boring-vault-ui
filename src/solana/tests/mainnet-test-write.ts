import { web3 } from '@coral-xyz/anchor';
import { 
  AccountLayout, 
  TOKEN_PROGRAM_ID
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
  DEFAULT_DECIMALS,
  JITOSOL_SOL_PYTH_FEED
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
    
    // Use the provided amount from the command line argument
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
    
    // Get the current exchange rate and calculate expected shares properly
    console.log(`\nExchange Rate Analysis:`);
    console.log(`Base Asset: ${vaultData.tellerState?.baseAsset || 'N/A'} (This looks like jitoSOL!)`);
    console.log(`Vault Exchange Rate: ${vaultData.tellerState?.exchangeRate || 'N/A'}`);
    
    // Calculate expected shares based on exchange rate
    // Exchange rate represents: shares per base asset unit
    const exchangeRate = vaultData.tellerState?.exchangeRate || BigInt(1000000000);
    console.log(`Using exchange rate: ${exchangeRate}`);
    
    // IMPORTANT: We're depositing SOL but the base asset is jitoSOL
    // jitoSOL is typically worth more than SOL due to staking rewards
    // This means 1 SOL < 1 jitoSOL, so we'll get fewer shares
    // Let's use a very conservative estimate: assume 1 SOL ≈ 0.9 jitoSOL
    console.log(`\nSOL → jitoSOL Conversion Analysis:`);
    console.log(`Depositing SOL into a jitoSOL-based vault`);
    console.log(`jitoSOL is typically worth ~1.05-1.1x SOL due to staking rewards`);
    console.log(`This means 1 SOL ≈ 0.9-0.95 jitoSOL equivalent`);
    
    // Very conservative estimate: assume 1 SOL = 0.85 jitoSOL equivalent
    const estimatedJitoSolEquivalent = depositLamports * BigInt(85) / BigInt(100);
    console.log(`Conservative jitoSOL equivalent: ${estimatedJitoSolEquivalent} lamports`);
    
    // Then apply the vault's exchange rate to calculate expected shares
    // Exchange rate is in 9 decimal format, so we need to handle the scaling properly
    const expectedShares = estimatedJitoSolEquivalent * exchangeRate / BigInt(1000000000);
    console.log(`Expected shares (using exchange rate): ${expectedShares}`);
    
    // Apply slippage tolerance to the expected shares  
    const slippageTolerancePercent = 20; // Use 20% slippage tolerance for safety
    const minMintAmount = expectedShares * BigInt(100 - slippageTolerancePercent) / BigInt(100);
    console.log(`Minimum shares to receive: ${minMintAmount} (${slippageTolerancePercent}% slippage tolerance)`);
    
    // Let's also try an even more conservative estimate
    const ultraConservativeMinShares = depositLamports * BigInt(60) / BigInt(100); // 60% of deposit
    console.log(`Ultra-conservative minimum (60% of deposit): ${ultraConservativeMinShares}`);
    
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
              console.error(`\n❌ Transaction failed: ${JSON.stringify(status.err)}`);
              console.log('Transaction polling stopped due to failure.');
              throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            }
            
            if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
              console.log(`\nTransaction ${status.confirmationStatus}!`);
              
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
          // Check if this is a transaction failure error that should stop polling
          if (error instanceof Error && error.message.includes('Transaction failed:')) {
            // This is a transaction failure, stop polling immediately
            throw error;
          }
          
          // This is a network/API error, continue polling but warn
          console.warn(`\nError checking transaction status (attempt ${attempt + 1}/${maxAttempts}): ${error}`);
          
          // If we're near the end of attempts, stop polling
          if (attempt >= maxAttempts - 3) {
            console.log('Too many polling errors, stopping...');
            throw new Error(`Polling failed after ${attempt + 1} attempts: ${error}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // If we reach here, polling finished without confirmation
      console.log('\n❌ Transaction polling timed out - transaction may have failed or not been processed');
      throw new Error(`Transaction polling timed out after ${maxAttempts} attempts. Signature: ${signature}`);
      
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
    const secondsToDeadline = 2593200; // 30 days + 20 minutes (meets vault 9 requirement)
    
    console.log(`Discount: ${discountPercent}%`);
    console.log(`Deadline: ${secondsToDeadline} seconds (${secondsToDeadline/3600} hours)`);
    
    // Create a direct web3.js connection for transaction sending
    const connection = createConnection();
    
    try {
      // Now we can proceed with the queue withdraw transaction
      // Use the queueBoringWithdraw function
      const signature = await vaultService.queueBoringWithdraw(
        keypair, // Pass the keypair directly
        vaultId,
        JITO_SOL_MINT_ADDRESS, // Request withdrawing to jitoSOL
        withdrawHumanReadable,
        discountPercent,
        secondsToDeadline,
        {
          skipPreflight: true, // Skip preflight to avoid rejections for valid transactions
          maxRetries: 30,
          skipStatusCheck: true
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
              console.error(`\n❌ Transaction failed: ${JSON.stringify(status.err)}`);
              console.log('Transaction polling stopped due to failure.');
              throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            }
            
            if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
              console.log(`\nTransaction ${status.confirmationStatus}!`);
              
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
          // Check if this is a transaction failure error that should stop polling
          if (error instanceof Error && error.message.includes('Transaction failed:')) {
            // This is a transaction failure, stop polling immediately
            throw error;
          }
          
          // This is a network/API error, continue polling but warn
          console.warn(`\nError checking transaction status (attempt ${attempt + 1}/${maxAttempts}): ${error}`);
          
          // If we're near the end of attempts, stop polling
          if (attempt >= maxAttempts - 3) {
            console.log('Too many polling errors, stopping...');
            throw new Error(`Polling failed after ${attempt + 1} attempts: ${error}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // If we reach here, polling finished without confirmation
      console.log('\n❌ Transaction polling timed out - transaction may have failed or not been processed');
      throw new Error(`Transaction polling timed out after ${maxAttempts} attempts. Signature: ${signature}`);
      
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

export async function testDepositSol(depositAmountSOL: number = 0.001): Promise<string | undefined> {
  console.log('\n🔥 SOL Deposit Test');
  
  try {
    // Create service instance
    const vaultService = new VaultSDK(MAINNET_CONFIG.rpcUrl);
    const vaultPubkey = MAINNET_CONFIG.vaultPubkey;
    
    // Load signer for transaction signing
    const signer = await loadKeypair();
    console.log(`📝 Signer: ${signer.address.slice(0, 8)}...${signer.address.slice(-8)}`);
    
    // Get vault data to extract vault ID
    const vaultData = await vaultService.getVaultData(vaultPubkey);
    const vaultId = Number(vaultData.vaultState.vaultId);
    console.log(`🏦 Vault ID: ${vaultId} | Paused: ${vaultData.vaultState.paused ? '❌' : '✅'}`);
    
    // Check user's SOL balance
    const signerAddress = signer.address;
    const solBalanceResponse = await solanaClient.rpc.getBalance(signerAddress).send();
    const solBalance = Number(solBalanceResponse.value);
    console.log(`💰 SOL Balance: ${(solBalance / 1e9).toFixed(4)} SOL`);
    
    // Validate the amount is within limits (reserve some SOL for transaction fees)
    const depositAmount = depositAmountSOL;
    const maxDepositAmount = solBalance / 1e9;
    const reserveForFees = 0.01;
    
    if (depositAmount > (maxDepositAmount - reserveForFees)) {
      console.log(`❌ Insufficient SOL. Need ${depositAmount} SOL but only have ${(maxDepositAmount - reserveForFees).toFixed(4)} available`);
      return;
    }
    
    // Convert to lamports
    const depositLamports = BigInt(Math.floor(depositAmount * 1e9));
    const minMintAmount = depositLamports * BigInt(80) / BigInt(100);
    
    console.log(`📊 Deposit: ${depositAmount} SOL | Min Shares: ${(Number(minMintAmount) / 1e9).toFixed(4)}`);
    
    // Load keypair from file for signing
    const keypairPath = process.env.KEYPAIR_PATH || '';
    if (!keypairPath) {
      throw new Error('Keypair path not provided. Set KEYPAIR_PATH in .env file');
    }
    
    const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const keypair = web3.Keypair.fromSecretKey(new Uint8Array(keyData));
    
    console.log('🚀 Executing deposit...');
    
    // Create a direct web3.js connection for transaction sending
    const connection = createConnection();
    
    try {
      // Step 1: Crank Pyth oracle first
      console.log('⚡ Cranking oracle...');
      try {
        const crankSignature = await import('../utils/pyth-oracle').then(({ crankPythPriceFeeds }) => 
          crankPythPriceFeeds(
            connection,
            keypair,
            [JITOSOL_SOL_PYTH_FEED]
          )
        );
        console.log(`✅ Oracle cranked: ${crankSignature.slice(0, 8)}...`);
      } catch (crankError) {
        console.warn('⚠️ Oracle crank failed, continuing...');
      }
      
      // Step 2: Build the deposit transaction
      const transaction = await vaultService.getBoringVault().buildDepositSolTransaction(
        keypair.publicKey,
        vaultId,
        depositLamports,
        minMintAmount
      );
      
      // Add recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      
      // Sign the transaction
      transaction.sign(keypair);
      
      console.log('📤 Sending transaction...');
      
      // Send transaction
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
        maxRetries: 30
      });
      
      // Poll for transaction status using the same pattern as other tests
      console.log('Polling for transaction status...');
      const maxAttempts = 30;
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await connection.getSignatureStatuses([signature]);
          const status = response.value[0];
          
          if (status) {
            if (status.err) {
              console.error(`\n❌ Transaction failed: ${JSON.stringify(status.err)}`);
              console.log('Transaction polling stopped due to failure.');
              throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
            }
            
            if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
              console.log(`\nTransaction ${status.confirmationStatus}!`);
              
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
              
              console.log(`✅ Success! Signature: ${signature}`);
              console.log(`🔍 Explorer: https://solscan.io/tx/${signature}`);
              
              return signature;
            }
          }
          
          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, 1000));
          process.stdout.write('.');
        } catch (error) {
          // Check if this is a transaction failure error that should stop polling
          if (error instanceof Error && error.message.includes('Transaction failed:')) {
            // This is a transaction failure, stop polling immediately
            throw error;
          }
          
          // This is a network/API error, continue polling but warn
          console.warn(`\nError checking transaction status (attempt ${attempt + 1}/${maxAttempts}): ${error}`);
          
          // If we're near the end of attempts, stop polling
          if (attempt >= maxAttempts - 3) {
            console.log('Too many polling errors, stopping...');
            throw new Error(`Polling failed after ${attempt + 1} attempts: ${error}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // If we reach here, polling finished without confirmation
      console.log('\n❌ Transaction polling timed out - transaction may have failed or not been processed');
      throw new Error(`Transaction polling timed out after ${maxAttempts} attempts. Signature: ${signature}`);
      
    } catch (error: any) {
      console.error('❌ Deposit failed:', error.message || error);
      
      if (error.logs) {
        console.log('\nTransaction logs:');
        error.logs.forEach((log: string, i: number) => {
          console.log(`[${i}] ${log}`);
        });
      }
      
      throw error;
    }
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    return undefined;
  }
}