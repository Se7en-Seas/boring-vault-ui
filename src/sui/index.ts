import { Transaction } from "@mysten/sui/transactions";
import { signAndExecute, getClient, Network } from "./utils/execute";
import {
  cancelWithdrawByReqIdAndTransfer,
  createQueueKey,
  depositAndTransfer,
  requestWithdraw,
} from "./gen/boring_vault/boring-vault/functions";
import { DENY_LIST_ID } from "./config";
import { split } from "./gen/sui/coin/functions";
import { CoinBalance, SuiClient, SuiTransactionBlockResponse } from "@mysten/sui/client";
import { normalizeStructTag, parseStructTag, SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { formatUnits, parseUnits } from "viem";
import { AddressTypeKey, DepositableAsset, QueueKey } from "./gen/boring_vault/boring-vault/structs";
import { FieldsWithTypes } from "./gen/_framework/util";
import { TypeName } from "./gen/_dependencies/onchain/0x1/type-name/structs";
import { phantom } from "./gen/_framework/reified";

interface AccountantCache {
  decimals: number;
  oneShare: bigint;
  platformFee: string;
  performanceFee: string;
}

/**
 * SDK for interacting with Boring Vault on the Sui blockchain
 * Provides methods for depositing, withdrawing, and querying vault state
 */
export class SuiVaultSDK {
  private client: SuiClient;
  private network: Network;
  private vaultId: string;
  private accountantId: string;

  private accountantCache: AccountantCache | null = null;
  private accountantCachePromise: Promise<AccountantCache> | null = null;
  private shareType: string | null = null;
  private shareTypePromise: Promise<string | null> | null = null;

  /**
   * Creates a new SuiVaultSDK instance
   * @param network - The Sui network to connect to ("localnet", "devnet", "testnet", or "mainnet")
   * @param vaultId - The object ID of the vault contract on Sui
   * @param accountantId - The object ID of the accountant contract on Sui
   */
  constructor(network: Network = "localnet", vaultId: string, accountantId: string) {
    this.client = getClient(network);
    this.network = network;
    this.vaultId = vaultId;
    this.accountantId = accountantId;
  }

  //== Vault write functions ==

  /**
   * Deposits assets into the vault and receives shares in return
   * @param payerAddress - The address of the user making the deposit
   * @param assetType - The type identifier of the asset being deposited (e.g., "0x2::sui::SUI")
   * @param depositAmount - The amount to deposit as a string (in human-readable format)
   * @param minMintAmount - The minimum amount of shares to mint as a string (slippage protection)
   * @returns Promise that resolves to the transaction result
   * @throws Error if no coins are found for the specified asset type
   * @throws Error if share type cannot be determined
   */
  async deposit(
    payerAddress: string,
    assetType: string,
    depositAmount: string,
    minMintAmount: string,
  ): Promise<SuiTransactionBlockResponse> {
    let depositAssetCoins = await this.client.getCoins({
      owner: payerAddress,
      coinType: assetType,
    });

    if (!depositAssetCoins.data.length) {
      throw new Error(`No coins found for asset ${assetType}`);
    }

    const depTx = new Transaction();

    let coin = split(depTx, assetType, {
      coin: depositAssetCoins.data[0].coinObjectId,
      u64: parseUnits(depositAmount, await this.getDecimals()),
    });

    const shareType = await this.getShareType();
    if (!shareType) {
      throw new Error("Share type not found for vault");
    }

    depositAndTransfer(depTx, [assetType, shareType], {
      vault: this.vaultId,
      accountant: this.accountantId,
      coin: coin,
      u64: parseUnits(minMintAmount, await this.getDecimals()),
      denyList: DENY_LIST_ID,
    });

    return await signAndExecute(depTx, this.network, payerAddress);
  }

  /**
   * Requests a withdrawal from the vault by burning shares
   * Creates a withdraw request that will be fulfilled after a delay
   * @param payerAddress - The address of the user requesting withdrawal
   * @param assetType - The type identifier of the asset to withdraw
   * @param shareAmount - The amount of shares to burn as a string (in human-readable format)
   * @param discountPercent - The discount percentage for early withdrawal (4 decimal places, e.g., "0.01" for 1%)
   * @param daysValid - The number of days the withdrawal request remains valid
   * @returns Promise that resolves to the transaction result
   * @throws Error if share type cannot be determined
   * @throws Error if no shares are found for the user
   */
  async requestWithdraw(
    payerAddress: string,
    assetType: string,
    shareAmount: string,
    discountPercent: string,
    daysValid: string,
  ): Promise<SuiTransactionBlockResponse> {
    const shareType = await this.getShareType();
    if (!shareType) {
      throw new Error("Share type not found for vault");
    }

    const shareCoins = await this.client.getCoins({
      owner: payerAddress,
      coinType: shareType,
    });

    if (!shareCoins.data.length) {
      throw new Error(`No shares found for type ${shareType}`);
    }

    const withdrawTx = new Transaction();

    let shares = split(withdrawTx, shareType, {
      coin: shareCoins.data[0].coinObjectId,
      u64: parseUnits(shareAmount, await this.getDecimals()),
    });

    requestWithdraw(withdrawTx, [assetType, shareType], {
      vault: this.vaultId,
      accountant: this.accountantId,
      coin: shares,
      u641: parseUnits(discountPercent, 4), // 0.01 = 1%
      u642: BigInt(Number(daysValid) * 86400) * 1000n,
      clock: SUI_CLOCK_OBJECT_ID,
      denyList: DENY_LIST_ID,
    });

    return await signAndExecute(withdrawTx, this.network, payerAddress);
  }

  /**
   * Cancels a pending withdrawal request and returns the shares to the user
   * @param payerAddress - The address of the user who made the withdrawal request
   * @param assetType - The type identifier of the asset that was requested for withdrawal
   * @param timestamp - The timestamp when the withdrawal request was created (as string)
   * @returns Promise that resolves to the transaction result
   * @throws Error if share type cannot be determined
   */
  async cancelWithdraw(
    payerAddress: string,
    assetType: string,
    timestamp: string,
  ): Promise<SuiTransactionBlockResponse> {
    const shareType = await this.getShareType();
    if (!shareType) {
      throw new Error("Share type not found for vault");
    }

    const cancelTx = new Transaction();

    const queueKey = createQueueKey(cancelTx, assetType, {
      address: payerAddress,
      u64: BigInt(timestamp),
    });

    cancelWithdrawByReqIdAndTransfer(cancelTx, [assetType, shareType], {
      vault: this.vaultId,
      queueKey: queueKey,
      denyList: DENY_LIST_ID,
    });

    return await signAndExecute(cancelTx, this.network, payerAddress);
  }

  //== Vault read functions ==

  /**
   * Gets the share token type for this vault
   * Results are cached to avoid repeated network calls
   * @returns Promise that resolves to the share type string, or null if not found
   */
  async getShareType(): Promise<string | null> {
    if (this.shareType !== null) {
      return this.shareType;
    }
    
    if (this.shareTypePromise === null) {
      this.shareTypePromise = this.#getGenericTypeFromObject(this.vaultId);
    }
    
    this.shareType = await this.shareTypePromise;
    return this.shareType;
  }

  /**
   * Gets the number of decimal places used by the vault's base asset
   * Results are cached to avoid repeated network calls
   * @returns Promise that resolves to the number of decimal places
   */
  async getDecimals(): Promise<number> {
    const cache = await this.#getAccountantCache();
    return cache.decimals;
  }

  /**
   * Gets the "one share" value from the accountant contract
   * @returns Promise that resolves to the one share value as a bigint
   */
  async getOneShare(): Promise<bigint> {
    const cache = await this.#getAccountantCache();
    return cache.oneShare;
  }

  /**
   * Gets the platform fee from the accountant contract
   * @returns Promise that resolves to the platform fee as a string (formatted with 4 decimals)
   */
  async getPlatformFee(): Promise<string> {
    const cache = await this.#getAccountantCache();
    return cache.platformFee;
  }

  /**
   * Gets the performance fee from the accountant contract
   * @returns Promise that resolves to the performance fee as a string (formatted with 4 decimals)
   */
  async getPerformanceFee(): Promise<string> {
    const cache = await this.#getAccountantCache();
    return cache.performanceFee;
  }

  /**
   * Fetches the user's share balance in human-readable format
   * @param ownerAddress - The address to check the share balance for
   * @returns Promise that resolves to the share balance as a string (formatted with decimals)
   */
  async fetchUserShares(ownerAddress: string): Promise<string> {
    const shareBalance = await this.#getShareBalance(ownerAddress);
    return formatUnits(BigInt(shareBalance.totalBalance), await this.getDecimals());
  }

  /**
   * Fetches the current value of one share in terms of the base asset
   * @returns Promise that resolves to the share value as a string (formatted with decimals)
   */
  async fetchShareValue(): Promise<string> {
    const accountant = await this.client.getObject({
      id: this.accountantId,
      options: { showContent: true },
    });
    const fields = (accountant.data?.content as any)?.fields;
    const decimals = await this.getDecimals();
    return formatUnits(BigInt(fields?.exchange_rate), decimals);
  }

  /**
   * Fetches the total value locked (TVL) in the vault in terms of the base asset
   * @returns Promise that resolves to the TVL as a string (formatted with decimals)
   */
  async fetchTotalAssets(): Promise<string> {
    const accountant = await this.client.getObject({
      id: this.accountantId,
      options: { showContent: true },
    });
    const fields = (accountant.data?.content as any)?.fields;
    const one_share = await this.getOneShare();
    const decimals = await this.getDecimals();
    const total_shares = BigInt(fields?.total_shares);
    const share_value = parseUnits(await this.fetchShareValue(), decimals);
    // Calculate total assets: (total_shares * share_value) / one_share
    return formatUnits(total_shares * share_value / one_share, decimals);
  }

  /**
   * Fetches the unlock time for a withdrawal request
   * @param requestId - The object ID of the withdrawal request
   * @returns Promise that resolves to the Unix timestamp when the request can be fulfilled
   */
  async fetchRequestUnlockTime(requestId: string): Promise<string> {
    const request = await this.client.getObject({
      id: requestId,
      options: { showContent: true },
    });
    const fields = (request.data?.content as any)?.fields;
    const creationTime = BigInt(fields?.creation_time_ms);
    const msToMaturity = BigInt(fields?.ms_to_maturity);
    return ((creationTime + msToMaturity) / 1000n).toString();
  }

  /**
   * Checks if the vault is currently paused
   * @returns Promise that resolves to true if the vault is paused, false otherwise
   */
  async isVaultPaused(): Promise<boolean> {
    const vault = await this.client.getObject({
      id: this.vaultId,
      options: { showContent: true },
    });
    return (vault.data?.content as any)?.fields?.is_vault_paused;
  }

  /**
   * Reads the fields of a queue key object to extract account and timestamp information
   * @param queueKeyId - The object ID of the queue key
   * @returns Promise that resolves to an object containing the account address and timestamp
   */
  async readQueueKeyFields(queueKeyId: string): Promise<{
    account: string;
    timestamp: string;
  }> {
    const { data } = await this.client.getObject({
      id: queueKeyId,
      options: { showContent: true },
    });

    // the object is `Field<QueueKey, …>`
    const nameFields = (data as any).content.fields.name.fields;
    return {
      account: nameFields.account as string,
      timestamp: nameFields.timestamp as string,
    };
  }

  /**
   * Gets the user's pending withdrawal requests for a specific asset
   * @param ownerAddress - The address to check the requests for
   * @param assetType - The type identifier of the asset to check requests for
   * @returns Promise that resolves to the user's requests as a an array of timestamps
   */
  async getUserRequestsForAsset(ownerAddress: string, assetType: string): Promise<string[]> {
    const vault = await this.client.getObject({
      id: this.vaultId,
      options: { showContent: true },
    });
    const fields = (vault.data?.content as any)?.fields;
    const requestsId = fields?.requests_per_address.fields.id.id;

    // ensure the asset type is normalized (padded with leading 0s but no 0x prefix)
    assetType = normalizeStructTag(assetType);
    assetType = assetType.substring(2);

    const object = await this.client.getDynamicFieldObject({
      parentId: requestsId,
      name: {
        type: AddressTypeKey.$typeName,
        value: {
          account: ownerAddress,
          asset_type: assetType,
        }
      }
    });
    const arr = (object.data?.content as any)?.fields?.value as FieldsWithTypes[];
    const queueKeys = arr.map((item) => {
      return QueueKey.fromFieldsWithTypes(item).timestamp.toString();
    })
    return queueKeys;
}

/**
 * Gets the depositable assets for the vault
 * @returns Promise that resolves to an array of asset type strings, or null if no assets are found
 */
async getDepositableAssets(): Promise<string[] | null> {
  const vault = await this.client.getObject({
    id: this.vaultId,
    options: { showContent: true },
  });
  const fields = (vault.data?.content as any)?.fields;
  const assetsId = fields.depositable_assets.fields.id.id;
  const dynamicFields = await this.client.getDynamicFields({ parentId: assetsId });
  const objectIds = dynamicFields.data.map((entry) => entry.objectId);
  const objects = await this.client.multiGetObjects({
    ids: objectIds,
    options: { showContent: true, showType: true }
  });

  if (objects[0].data?.content?.dataType === "moveObject") {
    return objects.map((object) => {
      return (object.data?.content as any)?.fields?.name?.fields.name;
    });
  }
  return null;
}

/**
 * Gets the depositable asset info for the vault
 * @param assetType - The type identifier of the asset to get info for
 * @returns Promise that resolves to the asset info as a JSON object
 */
async getAssetInfo(assetType: string): Promise<{
  allowWithdraws: boolean;
  allowDeposits: boolean;
  sharePremium: number;
  msToMaturity: string;
  minimumMsToDeadline: string;
  minDiscount: string;
  maxDiscount: string;
  minimumShares: string;
  withdrawCapacity: string;
}> {
  const vault = await this.client.getObject({
    id: this.vaultId,
    options: { showContent: true },
  });
  const fields = (vault.data?.content as any)?.fields;
  const depositableAssetsId = fields.depositable_assets.fields.id.id;

  // ensure the asset type is normalized (padded with leading 0s but no 0x prefix)
  assetType = normalizeStructTag(assetType);
  assetType = assetType.substring(2);

  const object = await this.client.getDynamicFieldObject({
    parentId: depositableAssetsId,
    name: {
      type: TypeName.$typeName,
      value: {
        name: assetType,
      }
    }
  });
  const objectFields = (object.data?.content as any)?.fields.value as FieldsWithTypes;
  
  const shareType = await this.getShareType() as string;
  const depositableAsset = DepositableAsset.fromFieldsWithTypes(phantom(shareType), objectFields);
  return depositableAsset.toJSONField();
}

  //== Private helper functions ==

  async #getAccountantCache(): Promise<AccountantCache> {
    if (this.accountantCache !== null) {
      return this.accountantCache;
    }
    
    if (this.accountantCachePromise === null) {
      this.accountantCachePromise = this.#initAccountantCache();
    }
    
    this.accountantCache = await this.accountantCachePromise;
    return this.accountantCache;
  }

  async #initAccountantCache(): Promise<AccountantCache> {
    const accountant = await this.client.getObject({
      id: this.accountantId,
      options: { showContent: true },
    });
    const fields = (accountant.data?.content as any)?.fields;
    const oneShare = fields.one_share as string;
    return {
      decimals: oneShare.length - 1, // Derive decimals from oneShare
      oneShare: BigInt(oneShare),
      platformFee: formatUnits(BigInt(fields.platform_fee), 4),
      performanceFee: formatUnits(BigInt(fields.performance_fee), 4),
    };
  }

  async #getGenericTypeFromObject(objectId: string): Promise<string | null> {
    const objectData = await this.client.getObject({
      id: objectId,
      options: {
        showType: true,
      },
    });
  
    if (!objectData.data?.type) {
      throw new Error('Type information not found.');
    }
  
    const typeString = objectData.data.type;
    const params = parseStructTag(typeString).typeParams;

    if (params.length > 0) {
      return normalizeStructTag(params[0]);
    }

    console.log('No generic parameter found.');
    return null;
  }

  // returns raw share balance as Sui CoinBalance object
  async #getShareBalance(ownerAddress: string): Promise<CoinBalance> {
    const shareBalance = await this.client.getBalance({
      owner: ownerAddress,
      coinType: await this.getShareType(),
    });
    return shareBalance;
  }
}

/**
 * Factory function to create a new SuiVaultSDK instance
 * @param network - The Sui network to connect to (defaults to "localnet")
 * @param vaultId - The object ID of the vault contract on Sui
 * @param accountantId - The object ID of the accountant contract on Sui
 * @returns A new SuiVaultSDK instance
 */
export const createSuiVaultSDK = (network: Network = "localnet", vaultId: string, accountantId: string) => {
  return new SuiVaultSDK(network, vaultId, accountantId);
};
