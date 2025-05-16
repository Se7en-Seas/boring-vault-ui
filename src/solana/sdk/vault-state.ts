import { PublicKey } from '@solana/web3.js';
import { Idl, BorshCoder } from '@coral-xyz/anchor';
import idl from './boring-vault-svm-idl.json';

// Complete Vault State structure from IDL
export interface VaultState {
  vaultId: bigint;
  authority: PublicKey;
  pendingAuthority: PublicKey;
  paused: boolean;
  shareMint: PublicKey;
  depositSubAccount: number;
  withdrawSubAccount: number;
}

// Asset Data structure from IDL
export interface AssetData {
  baseAsset: PublicKey;
  baseAssetMinimum: bigint;
  sharePrecision: number;
  exchangeRateProvider: PublicKey;
  exchangeRate: bigint;
  exchangeRateHighWaterMark: bigint;
  feesOwedInBaseAsset: bigint;
  totalSharesLastUpdate: bigint;
  lastUpdateTimestamp: bigint;
  payoutAddress: PublicKey;
  allowedExchangeRateChangeUpperBound: number;
  allowedExchangeRateChangeLowerBound: number;
  minimumUpdateDelayInSeconds: number;
  platformFeeBps: number;
  performanceFeeBps: number;
  withdrawAuthority: PublicKey;
}

// Full vault account data with all parsed structures
export interface FullVaultData {
  discriminator: string;
  vaultState: VaultState;
  assetData?: AssetData;
  rawData: Buffer;
  // Added properties to support enhanced data display
  tokenMint?: PublicKey;
  readableData?: {
    vaultId: string;
    paused: boolean;
    baseAsset: string;
    baseAssetMinimum: string;
    exchangeRate: string;
    feesOwed: string;
    totalShares: string;
    lastUpdate: string;
    platformFee: string;
    performanceFee: string;
    [key: string]: any; // Allow additional properties
  };
}

/**
 * Parse buffer data into a complete vault account structure using IDL
 */
export function parseFullVaultData(data: Buffer): FullVaultData {
  // Keep a copy of the raw data
  const rawData = Buffer.from(data);
  
  // Initialize BorshCoder with the IDL
  const coder = new BorshCoder(idl as Idl);
  
  // Extract the account discriminator (first 8 bytes)
  const discriminator = data.slice(0, 8);
  const discriminatorHex = Buffer.from(discriminator).toString('hex');
  
  // Find the account type by discriminator
  let accountType = '';
  
  // Go through all account types in the IDL
  const accountTypes = Object.keys((idl as any).accounts || []);
  for (const name of accountTypes) {
    try {
      // Get discriminator for this account type
      const accountDiscriminator = coder.accounts.accountDiscriminator(name);
      if (Buffer.from(accountDiscriminator).toString('hex') === discriminatorHex) {
        accountType = name;
        break;
      }
    } catch (e) {
      // Skip if we can't get discriminator for this account type
      console.log(`Could not get discriminator for account type: ${name}`);
    }
  }

  // If we couldn't identify the account type, try with defined discriminators from IDL
  if (!accountType) {
    // Try to use the discriminators directly from the IDL if available
    for (const account of (idl as any).accounts || []) {
      if (account.discriminator) {
        const accDiscBuffer = Buffer.from(account.discriminator);
        if (accDiscBuffer.toString('hex') === discriminatorHex) {
          accountType = account.name;
          break;
        }
      }
    }
  }

  // If we couldn't identify the account type, throw an error
  if (!accountType) {
    throw new Error(`Unknown account discriminator: ${discriminatorHex}`);
  }
  
  // Deserialize the account data according to its type
  let accountData;
  try {
    accountData = coder.accounts.decode(accountType, data);
  } catch (e) {
    console.error(`Error decoding account data: ${e}`);
    throw new Error(`Failed to decode account data: ${e}`);
  }
  
  // Initialize vault state and asset data objects
  let vaultState: VaultState = {
    vaultId: BigInt(0),
    authority: new PublicKey(0),
    pendingAuthority: new PublicKey(0),
    paused: false,
    shareMint: new PublicKey(0),
    depositSubAccount: 0,
    withdrawSubAccount: 0
  };
  
  let assetData: AssetData | undefined;
  
  // Parse based on account type
  if (accountType === 'BoringVault') {
    // For BoringVault, extract vaultState from the config field
    vaultState = {
      vaultId: accountData.config?.vault_id ? BigInt(accountData.config.vault_id.toString()) : BigInt(0),
      authority: accountData.config?.authority || new PublicKey(0),
      pendingAuthority: accountData.config?.pending_authority || new PublicKey(0),
      paused: accountData.config?.paused || false,
      shareMint: accountData.config?.share_mint || new PublicKey(0),
      depositSubAccount: accountData.config?.deposit_sub_account || 0,
      withdrawSubAccount: accountData.config?.withdraw_sub_account || 0
    };
    
    // Extract asset data from the teller field
    if (accountData.teller) {
      assetData = {
        baseAsset: accountData.teller.base_asset || new PublicKey(0),
        baseAssetMinimum: accountData.teller.base_asset_minimum ? BigInt(accountData.teller.base_asset_minimum.toString()) : BigInt(0),
        sharePrecision: accountData.teller.decimals || 0,
        exchangeRateProvider: accountData.teller.exchange_rate_provider || new PublicKey(0),
        exchangeRate: accountData.teller.exchange_rate ? BigInt(accountData.teller.exchange_rate.toString()) : BigInt(0),
        exchangeRateHighWaterMark: accountData.teller.exchange_rate_high_water_mark ? BigInt(accountData.teller.exchange_rate_high_water_mark.toString()) : BigInt(0),
        feesOwedInBaseAsset: accountData.teller.fees_owed_in_base_asset ? BigInt(accountData.teller.fees_owed_in_base_asset.toString()) : BigInt(0),
        totalSharesLastUpdate: accountData.teller.total_shares_last_update ? BigInt(accountData.teller.total_shares_last_update.toString()) : BigInt(0),
        lastUpdateTimestamp: accountData.teller.last_update_timestamp ? BigInt(accountData.teller.last_update_timestamp.toString()) : BigInt(0),
        payoutAddress: accountData.teller.payout_address || new PublicKey(0),
        allowedExchangeRateChangeUpperBound: accountData.teller.allowed_exchange_rate_change_upper_bound || 0,
        allowedExchangeRateChangeLowerBound: accountData.teller.allowed_exchange_rate_change_lower_bound || 0,
        minimumUpdateDelayInSeconds: accountData.teller.minimum_update_delay_in_seconds || 0,
        platformFeeBps: accountData.teller.platform_fee_bps || 0,
        performanceFeeBps: accountData.teller.performance_fee_bps || 0,
        withdrawAuthority: accountData.teller.withdraw_authority || new PublicKey(0)
      };
    }
  }
  
  // Create readable data for display
  const readableData = {
    vaultId: vaultState.vaultId.toString(),
    paused: vaultState.paused,
    baseAsset: assetData ? assetData.baseAsset.toString() : 'Unknown',
    baseAssetMinimum: assetData ? formatBNWithDecimals(assetData.baseAssetMinimum, 9) : '0',
    exchangeRate: assetData ? formatBNWithDecimals(assetData.exchangeRate, 9) : '0',
    feesOwed: assetData ? formatBNWithDecimals(assetData.feesOwedInBaseAsset, 9) : '0',
    totalShares: assetData ? formatBNWithDecimals(assetData.totalSharesLastUpdate, 9) : '0',
    lastUpdate: assetData ? new Date(Number(assetData.lastUpdateTimestamp) * 1000).toISOString() : 'Unknown',
    platformFee: assetData ? `${assetData.platformFeeBps / 100}%` : '0%',
    performanceFee: assetData ? `${assetData.performanceFeeBps / 100}%` : '0%'
  };

  // Set tokenMint to baseAsset if available
  const tokenMint = assetData ? assetData.baseAsset : undefined;
  
  return {
    discriminator: discriminatorHex,
    vaultState,
    assetData,
    rawData,
    tokenMint,
    readableData
  };
}

/**
 * Format a BN value to a readable string with decimals
 */
export function formatBNWithDecimals(amount: bigint, decimals: number): string {
  const amountStr = amount.toString().padStart(decimals + 1, '0');
  const integerPart = amountStr.slice(0, -decimals) || '0';
  const decimalPart = amountStr.slice(-decimals);
  return `${integerPart}.${decimalPart}`;
} 