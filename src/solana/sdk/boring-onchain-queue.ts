import { web3, BorshCoder, Idl } from '@coral-xyz/anchor';
import { 
  BORING_QUEUE_PROGRAM_ID,
  BASE_SEED_USER_WITHDRAW_STATE
} from '../utils/constants';
import { type SolanaClient, Address } from 'gill';
import queueIdl from '../idls/boring_onchain_queue.json';
import { BoringVaultSolanaConfig } from '../types';
import { MintLayout } from '@solana/spl-token';

// Type definitions based on IDL
export interface WithdrawRequest {
  vaultId: bigint;
  assetOut: web3.PublicKey;
  shareAmount: bigint;
  assetAmount: bigint;
  creationTime: bigint;
  secondsToMaturity: number;
  secondsToDeadline: number;
  user: web3.PublicKey;
  nonce: bigint;
}

export interface UserWithdrawState {
  lastNonce: bigint;
}

export interface WithdrawRequestInfo {
  address: web3.PublicKey;
  data: WithdrawRequest;
  isExpired: boolean;
  isMatured: boolean;
  timeToMaturity: number;
  timeToDeadline: number;
  // User-facing formatted data
  formatted: {
    nonce: number;
    user: string;
    tokenOut: TokenMetadata;
    sharesWithdrawing: number;
    assetsWithdrawing: number;
    creationTime: number;
    secondsToMaturity: number;
    secondsToDeadline: number;
    errorCode: number;
    transactionHashOpened: string;
  };
}

// Token metadata interface
export interface TokenMetadata {
  address: string;
  decimals: number;
}

// Keep BoringQueueStatus as an alias for backward compatibility
export type BoringQueueStatus = WithdrawRequestInfo['formatted'];

export class BoringOnchainQueue {
  private rpc: SolanaClient['rpc'];
  private programId: web3.PublicKey;
  private coder: BorshCoder;

  constructor(config: BoringVaultSolanaConfig) {
    this.rpc = config.solanaClient.rpc;
    this.programId = new web3.PublicKey(BORING_QUEUE_PROGRAM_ID);
    this.coder = new BorshCoder(queueIdl as Idl);
  }

  /**
   * Get the user withdraw state PDA
   */
  async getUserWithdrawStatePDA(owner: web3.PublicKey): Promise<web3.PublicKey> {
    const [pda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from(BASE_SEED_USER_WITHDRAW_STATE), owner.toBuffer()],
      this.programId
    );
    
    return pda;
  }

  /**
   * Get the withdraw request PDA
   */
  async getWithdrawRequestPDA(owner: web3.PublicKey, requestId: number): Promise<web3.PublicKey> {
    const requestIdBuffer = Buffer.alloc(8);
    requestIdBuffer.writeBigUInt64LE(BigInt(requestId), 0);
    
    const [pda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from("boring-queue-withdraw-request"), owner.toBuffer(), requestIdBuffer],
      this.programId
    );
    
    return pda;
  }

  /**
   * Get user's withdraw state (contains last nonce)
   */
  async getUserWithdrawState(userAddress: string | web3.PublicKey): Promise<UserWithdrawState | null> {
    const userPubkey = typeof userAddress === 'string' 
      ? new web3.PublicKey(userAddress) 
      : userAddress;

    try {
      const userWithdrawStatePDA = await this.getUserWithdrawStatePDA(userPubkey);
      
      // Convert web3.PublicKey to Address type for gill
      const address = userWithdrawStatePDA.toBase58() as Address;
      const response = await this.rpc.getAccountInfo(
        address,
        { encoding: 'base64' }
      ).send();
      
      if (!response.value || !response.value.data || !response.value.data.length) {
        return null;
      }

      // Extract data from the gill response
      const data = Buffer.from(response.value.data[0], 'base64');
      
      // Decode the account data using BorshCoder
      const decoded = this.coder.accounts.decode('UserWithdrawState', data);
      
      return {
        lastNonce: decoded.last_nonce
      };

    } catch (error) {
      console.error('Error fetching user withdraw state:', error);
      return null;
    }
  }

  /**
   * Get a specific withdraw request by user and request ID
   */
  async getWithdrawRequest(
    userAddress: string | web3.PublicKey, 
    requestId: number
  ): Promise<WithdrawRequestInfo | null> {
    const userPubkey = typeof userAddress === 'string' 
      ? new web3.PublicKey(userAddress) 
      : userAddress;

    try {
      const withdrawRequestPDA = await this.getWithdrawRequestPDA(userPubkey, requestId);
      
      // Convert web3.PublicKey to Address type for gill
      const address = withdrawRequestPDA.toBase58() as Address;
      const response = await this.rpc.getAccountInfo(
        address,
        { encoding: 'base64' }
      ).send();
      
      if (!response.value || !response.value.data || !response.value.data.length) {
        return null;
      }

      // Extract data from the gill response
      const data = Buffer.from(response.value.data[0], 'base64');
      
      // Decode the account data using BorshCoder
      const decoded = this.coder.accounts.decode('WithdrawRequest', data);
      
      // Calculate time-based status
      const currentTime = Math.floor(Date.now() / 1000);
      const maturityTime = Number(decoded.creation_time) + decoded.seconds_to_maturity;
      const deadlineTime = Number(decoded.creation_time) + decoded.seconds_to_deadline;
      
      const isMatured = currentTime >= maturityTime;
      const isExpired = currentTime >= deadlineTime;
      const timeToMaturity = Math.max(0, maturityTime - currentTime);
      const timeToDeadline = Math.max(0, deadlineTime - currentTime);

      // Get token metadata
      const tokenMetadata = await this.getTokenMetadata(decoded.asset_out);

      return {
        address: withdrawRequestPDA,
        data: {
          vaultId: decoded.vault_id,
          assetOut: decoded.asset_out,
          shareAmount: decoded.share_amount,
          assetAmount: decoded.asset_amount,
          creationTime: decoded.creation_time,
          secondsToMaturity: decoded.seconds_to_maturity,
          secondsToDeadline: decoded.seconds_to_deadline,
          user: decoded.user,
          nonce: decoded.nonce,
        },
        isExpired,
        isMatured,
        timeToMaturity,
        timeToDeadline,
        formatted: {
          nonce: Number(decoded.nonce),
          user: decoded.user.toString(),
          tokenOut: tokenMetadata,
          sharesWithdrawing: Number(decoded.share_amount) / (10 ** 9), // Assuming 9 decimals for shares
          assetsWithdrawing: Number(decoded.asset_amount) / (10 ** tokenMetadata.decimals),
          creationTime: Number(decoded.creation_time),
          secondsToMaturity: decoded.seconds_to_maturity,
          secondsToDeadline: decoded.seconds_to_deadline,
          errorCode: 0, // On Solana, if the request exists on-chain, it's valid (errorCode = 0)
          transactionHashOpened: '' // Transaction hash is not stored on-chain in Solana
        }
      };

    } catch (error) {
      console.error('Error fetching withdraw request:', error);
      return null;
    }
  }

  /**
   * Get withdraw requests for a user
   * @param userAddress - User's wallet address
   * @param vaultId - Optional vault ID filter
   * @param maxRequests - Optional limit on number of recent requests (default: 7, pass 0 or negative for all)
   */
  async getUserWithdrawRequests(
    userAddress: string | web3.PublicKey,
    vaultId?: number,
    maxRequests: number = 7
  ): Promise<WithdrawRequestInfo[]> {
    const userPubkey = typeof userAddress === 'string' 
      ? new web3.PublicKey(userAddress) 
      : userAddress;

    try {
      // First, get the user's withdraw state to know the last nonce
      const userWithdrawState = await this.getUserWithdrawState(userPubkey);
      
      if (!userWithdrawState) {
        return []; // No withdraw state means no requests
      }

      const requests: WithdrawRequestInfo[] = [];
      const lastNonce = Number(userWithdrawState.lastNonce);

      // Determine iteration range - with default of 7, only get all requests if explicitly set to undefined
      let startNonce = 0;
      if (maxRequests > 0) {
        // Get the latest N requests
        startNonce = Math.max(0, lastNonce - maxRequests + 1);
      }

      // Iterate through the specified range of request IDs (nonces)
      for (let requestId = startNonce; requestId <= lastNonce; requestId++) {
        const request = await this.getWithdrawRequest(userPubkey, requestId);
        
        if (request) {
          // Filter by vault ID if specified
          if (vaultId === undefined || Number(request.data.vaultId) === vaultId) {
            requests.push(request);
          }
        }
      }

      return requests;

    } catch (error) {
      console.error('Error fetching user withdraw requests:', error);
      throw new Error(`Failed to fetch withdraw requests: ${error}`);
    }
  }

  /**
   * Get the status of a specific withdraw request
   */
  async getWithdrawStatus(
    userAddress: string | web3.PublicKey,
    requestId: number
  ): Promise<{
    exists: boolean;
    isMatured: boolean;
    isExpired: boolean;
    timeToMaturity: number;
    timeToDeadline: number;
    request?: WithdrawRequestInfo;
  }> {
    try {
      const request = await this.getWithdrawRequest(userAddress, requestId);
      
      if (!request) {
        return {
          exists: false,
          isMatured: false,
          isExpired: false,
          timeToMaturity: 0,
          timeToDeadline: 0,
        };
      }

      return {
        exists: true,
        isMatured: request.isMatured,
        isExpired: request.isExpired,
        timeToMaturity: request.timeToMaturity,
        timeToDeadline: request.timeToDeadline,
        request,
      };

    } catch (error) {
      console.error('Error checking withdraw status:', error);
      throw new Error(`Failed to check withdraw status: ${error}`);
    }
  }

  /**
   * Get token metadata (decimals and address)
   */
  private async getTokenMetadata(tokenMint: web3.PublicKey): Promise<TokenMetadata> {
    try {
      const mintAddress = tokenMint.toBase58() as Address;
      const response = await this.rpc.getAccountInfo(
        mintAddress,
        { encoding: 'base64' }
      ).send();
      
      if (!response.value || !response.value.data || !response.value.data.length) {
        // Default to 9 decimals if we can't get mint info (common for SOL)
        return {
          address: tokenMint.toString(),
          decimals: 9
        };
      }

      const data = Buffer.from(response.value.data[0], 'base64');
      const mintData = MintLayout.decode(data);
      
      return {
        address: tokenMint.toString(),
        decimals: mintData.decimals
      };
    } catch (error) {
      console.error('Error fetching token metadata:', error);
      // Default to 9 decimals if we can't get mint info
      return {
        address: tokenMint.toString(),
        decimals: 9
      };
    }
  }

  /**
   * Get all NON-EXPIRED withdraw requests for a user in BoringQueueStatus format
   * This is the main user-facing function compatible with the existing EVM API
   */
  async boringQueueStatuses(
    userAddress: string | web3.PublicKey,
    vaultId?: number
  ): Promise<BoringQueueStatus[]> {
    try {
      // Get all withdraw requests for the user
      const requests = await this.getUserWithdrawRequests(userAddress, vaultId);
      
      // Filter out expired requests and return formatted data
      return requests
        .filter(request => !request.isExpired)
        .map(request => request.formatted);
      
    } catch (error) {
      console.error('Error fetching boring queue statuses:', error);
      throw new Error(`Failed to fetch boring queue statuses: ${error}`);
    }
  }
} 