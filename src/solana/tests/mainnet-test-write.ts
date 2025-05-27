import { web3 } from '@coral-xyz/anchor';
import { 
  AccountLayout, 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstructionWithDerivation,
  getAssociatedTokenAddressSync,
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
