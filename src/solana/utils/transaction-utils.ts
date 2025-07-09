import { web3 } from '@coral-xyz/anchor';
import { TX_POLL_MAX_ATTEMPTS, TX_POLL_INTERVAL_MS, TX_POLL_ERROR_INTERVAL_MS } from './constants';

/**
 * Poll transaction status using getSignatureStatuses
 * @param connection - Solana RPC connection
 * @param signature - Transaction signature to poll
 * @param maxAttempts - Maximum polling attempts (default: 30)
 * @param intervalMs - Polling interval in milliseconds (default: 1000)
 * @returns Promise<string> - Returns signature when confirmed
 */
export async function pollTransactionStatus(
  connection: web3.Connection,
  signature: string,
  maxAttempts: number = TX_POLL_MAX_ATTEMPTS,
  intervalMs: number = TX_POLL_INTERVAL_MS
): Promise<string> {
  console.log('Polling for transaction status...');
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await connection.getSignatureStatuses([signature]);
      const status = response.value[0];
      
      if (status) {
        if (status.err) {
          console.error(`\n❌ Transaction failed: ${JSON.stringify(status.err)}`);
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        
        if (status.confirmationStatus === 'finalized' || status.confirmationStatus === 'confirmed') {
          console.log(`\n✅ Transaction ${status.confirmationStatus}!`);
          return signature;
        }
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      process.stdout.write('.');
    } catch (error) {
      // Check if this is a transaction failure error that should stop polling
      if (error instanceof Error && error.message.includes('Transaction failed:')) {
        throw error;
      }
      
      // This is a network/API error, continue polling but warn
      console.warn(`\nError checking transaction status (attempt ${attempt + 1}/${maxAttempts}): ${error}`);
      
      // If we're near the end of attempts, stop polling
      if (attempt >= maxAttempts - 3) {
        console.log('Too many polling errors, stopping...');
        throw new Error(`Polling failed after ${attempt + 1} attempts: ${error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, TX_POLL_ERROR_INTERVAL_MS));
    }
  }
  
  // If we reach here, polling finished without confirmation
  console.log('\n❌ Transaction polling timed out');
  throw new Error(`Transaction polling timed out after ${maxAttempts} attempts. Signature: ${signature}`);
} 