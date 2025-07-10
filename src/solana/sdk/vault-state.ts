import { web3, Idl, BorshCoder } from '@coral-xyz/anchor';
import vaultIdl from '../idls/boring_vault_svm.json';
import { VaultState, TellerState, ManagerState, AssetData, FullVaultData } from '../types';

// Create BorshCoder instance
const coder = new BorshCoder(vaultIdl as Idl);

// Import discriminators directly from IDL
const VAULT_DISCRIMINATORS = {
  AssetData: vaultIdl.accounts.find(acc => acc.name === 'AssetData')?.discriminator || [],
  BoringVault: vaultIdl.accounts.find(acc => acc.name === 'BoringVault')?.discriminator || [],
  CpiDigest: vaultIdl.accounts.find(acc => acc.name === 'CpiDigest')?.discriminator || [],
  ProgramConfig: vaultIdl.accounts.find(acc => acc.name === 'ProgramConfig')?.discriminator || [],
} as const;

/**
 * Parse vault state data using BorshCoder - much cleaner approach
 */
export function parseVaultState(data: Buffer): FullVaultData {
  try {
    const decoded = coder.accounts.decode('BoringVault', data);
    
    // Simple field mapping - BorshCoder handles the heavy lifting
    const config: VaultState = {
      vaultId: BigInt(decoded.config.vault_id),
      authority: decoded.config.authority,
      pendingAuthority: decoded.config.pending_authority,
      paused: decoded.config.paused,
      shareMint: decoded.config.share_mint,
      depositSubAccount: decoded.config.deposit_sub_account,
      withdrawSubAccount: decoded.config.withdraw_sub_account,
    };

    const teller: TellerState = {
      baseAsset: decoded.teller.base_asset,
      decimals: decoded.teller.decimals,
      exchangeRateProvider: decoded.teller.exchange_rate_provider,
      exchangeRate: BigInt(decoded.teller.exchange_rate),
      exchangeRateHighWaterMark: BigInt(decoded.teller.exchange_rate_high_water_mark),
      feesOwedInBaseAsset: BigInt(decoded.teller.fees_owed_in_base_asset),
      totalSharesLastUpdate: BigInt(decoded.teller.total_shares_last_update),
      lastUpdateTimestamp: BigInt(decoded.teller.last_update_timestamp),
      payoutAddress: decoded.teller.payout_address,
      allowedExchangeRateChangeUpperBound: decoded.teller.allowed_exchange_rate_change_upper_bound,
      allowedExchangeRateChangeLowerBound: decoded.teller.allowed_exchange_rate_change_lower_bound,
      minimumUpdateDelayInSeconds: decoded.teller.minimum_update_delay_in_seconds,
      platformFeeBps: decoded.teller.platform_fee_bps,
      performanceFeeBps: decoded.teller.performance_fee_bps,
      withdrawAuthority: decoded.teller.withdraw_authority,
    };

    const manager: ManagerState = {
      strategist: decoded.manager.strategist,
    };

    return {
      config,
      teller,
      manager,
    };
  } catch (error) {
    throw new Error(`Failed to parse BoringVault state: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse asset data using BorshCoder
 */
export function parseAssetData(data: Buffer): AssetData {
  try {
    const decoded = coder.accounts.decode('AssetData', data);
    
    // Map oracle source enum
    let oracleSource: any = {};
    if (decoded.oracle_source.switchboardV2 !== undefined) {
      oracleSource.switchboardV2 = {};
    } else if (decoded.oracle_source.pyth !== undefined) {
      oracleSource.pyth = {};
    } else if (decoded.oracle_source.pythV2 !== undefined) {
      oracleSource.pythV2 = {};
    }
    
    return {
      allowDeposits: decoded.allow_deposits,
      allowWithdrawals: decoded.allow_withdrawals,
      sharePremiumBps: decoded.share_premium_bps,
      isPeggedToBaseAsset: decoded.is_pegged_to_base_asset,
      priceFeed: decoded.price_feed,
      inversePriceFeed: decoded.inverse_price_feed,
      maxStaleness: BigInt(decoded.max_staleness),
      minSamples: decoded.min_samples,
      oracleSource,
      feedId: decoded.feed_id,
    };
  } catch (error) {
    throw new Error(`Failed to parse AssetData: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Determine account type from discriminator using IDL discriminators
 */
export function getAccountType(data: Buffer): string | null {
  if (data.length < 8) return null;
  
  const discriminator = Array.from(data.slice(0, 8));
  
  for (const [accountType, expectedDiscriminator] of Object.entries(VAULT_DISCRIMINATORS)) {
    if (expectedDiscriminator && expectedDiscriminator.length === 8 &&
        discriminator.every((byte, i) => byte === expectedDiscriminator[i])) {
      return accountType;
    }
  }
  
  return null;
}

/**
 * Legacy function for backward compatibility - now much simpler
 */
export function parseFullVaultData(data: Buffer): FullVaultData {
  const accountType = getAccountType(data);
  
  if (accountType !== 'BoringVault') {
    throw new Error(`Expected BoringVault account, got ${accountType}`);
  }
  
  return parseVaultState(data);
}

/**
 * Helper function to get exchange rate from parsed vault data
 */
export function getExchangeRate(vaultData: FullVaultData): bigint {
  return vaultData.teller.exchangeRate;
}

/**
 * Helper function to get base asset decimals from parsed vault data
 */
export function getBaseAssetDecimals(vaultData: FullVaultData): number {
  return vaultData.teller.decimals;
}

/**
 * Helper function to check if vault is paused
 */
export function isVaultPaused(vaultData: FullVaultData): boolean {
  return vaultData.config.paused;
} 