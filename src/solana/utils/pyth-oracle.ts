import { web3 } from '@coral-xyz/anchor';
import { HermesClient } from '@pythnetwork/hermes-client';
import { PythSolanaReceiver } from '@pythnetwork/pyth-solana-receiver';
import {
  PYTH_HERMES_URL,
  PYTH_SHARD_ID,
  COMPUTE_UNIT_PRICES
} from './constants';

/**
 * Builds Pyth oracle crank transactions that can be signed and sent separately
 * This approach is more flexible for browser extensions and different RPC providers
 * 
 * @param connection - Solana RPC connection
 * @param payer - Public key that will pay for the transaction
 * @param priceFeedIds - Array of Pyth price feed IDs to update
 * @param hermesUrl - Hermes endpoint URL for fetching price updates
 * @param computeUnitPrice - Compute unit price in micro-lamports
 * @returns Array of unsigned transactions ready for signing
 */
export async function buildPythOracleCrankTransactions(
  connection: web3.Connection,
  payer: web3.PublicKey,
  priceFeedIds: string[],
  hermesUrl: string = PYTH_HERMES_URL,
  computeUnitPrice: number = COMPUTE_UNIT_PRICES.PYTH_ORACLE_CRANK
): Promise<{
  transactions: web3.Transaction[],
  signers: web3.Signer[][]
}> {
  // Create minimal wallet interface for PythSolanaReceiver
  const dummyWallet = {
    publicKey: payer,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };

  // Initialize PythSolanaReceiver
  const pythSolanaReceiver = new PythSolanaReceiver({ 
    connection, 
    wallet: dummyWallet as any 
  });

  // Fetch price updates from Hermes
  const hermesClient = new HermesClient(hermesUrl, {});
  const priceUpdateResponse = await hermesClient.getLatestPriceUpdates(
    priceFeedIds,
    { encoding: 'base64' }
  );

  const priceUpdateData = priceUpdateResponse.binary.data;
  
  // Add debugging information
  console.log(`🔍 Price update debugging:`);
  console.log(`  - Feed IDs: ${priceFeedIds.length}`);
  console.log(`  - Updates received: ${priceUpdateData.length}`);
  priceUpdateData.forEach((update, i) => {
    console.log(`  - Update ${i + 1}: ${update.length} chars, starts with: ${update.substring(0, 20)}...`);
  });

  // Create transaction builder
  const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({});
  
  // Update the price feed accounts for the feed ids in priceUpdateData and shard id 1
  await transactionBuilder.addUpdatePriceFeed(priceUpdateData, PYTH_SHARD_ID);

  await transactionBuilder.addPriceConsumerInstructions(
    async (
      getPriceUpdateAccount: (priceFeedId: string) => web3.PublicKey
    ): Promise<any[]> => {
      return [];
    }
  );

  // Build legacy transactions
  const legacyTxs = await transactionBuilder.buildLegacyTransactions({
    computeUnitPriceMicroLamports: computeUnitPrice,
  });

  console.log(`✅ Built ${legacyTxs.length} separate oracle transactions`);
  
  // Get recent blockhash for all transactions
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  
  // Return the original separate transactions instead of trying to bundle them
  // This allows each transaction to be processed individually as separate steps
  const transactions: web3.Transaction[] = [];
  const signers: web3.Signer[][] = [];
  
  for (let i = 0; i < legacyTxs.length; i++) {
    const { tx, signers: txSigners } = legacyTxs[i];
    
    // Set blockhash and fee payer
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer;
    
    // Log transaction details
    const txSize = tx.serializeMessage().length;
    console.log(`📋 Transaction ${i + 1}/${legacyTxs.length}:`);
    console.log(`  - Instructions: ${tx.instructions.length}`);
    console.log(`  - Signers: ${txSigners ? txSigners.length : 0}`);
    console.log(`  - Size: ${txSize} bytes`);
    
    transactions.push(tx);
    signers.push(txSigners || []);
  }
  
  return {
    transactions,
    signers
  };
}

