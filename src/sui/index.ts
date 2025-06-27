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
import { SuiClient } from "@mysten/sui/client";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";

export class SuiVaultSDK {
  private client: SuiClient;
  private network: Network;

  constructor(network: Network = "localnet") {
    this.client = getClient(network);
    this.network = network;
  }

  //== Vault write functions ==

  async deposit(
    payerAddress: string,
    assetType: string,
    shareType: string,
    vaultId: string,
    accountantId: string,
    depositAmount: bigint,
    minMintAmount: bigint,
  ) {
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
      u64: depositAmount,
    });

    depositAndTransfer(depTx, [assetType, shareType], {
      vault: vaultId,
      accountant: accountantId,
      coin: coin,
      u64: minMintAmount,
      denyList: DENY_LIST_ID,
    });

    return await signAndExecute(depTx, this.network, payerAddress);
  }

  async requestWithdraw(
    payerAddress: string,
    assetType: string,
    shareType: string,
    vaultId: string,
    accountantId: string,
    shareAmount: bigint,
    discount: bigint,
    msToDeadline: bigint,
  ) {
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
      u64: shareAmount,
    });

    requestWithdraw(withdrawTx, [assetType, shareType], {
      vault: vaultId,
      accountant: accountantId,
      coin: shares,
      u641: discount,
      u642: msToDeadline,
      clock: SUI_CLOCK_OBJECT_ID,
      denyList: DENY_LIST_ID,
    });

    return await signAndExecute(withdrawTx, this.network, payerAddress);
  }

  async cancelWithdraw(
    payerAddress: string,
    assetType: string,
    shareType: string,
    vaultId: string,
    timestamp: bigint,
  ) {
    const cancelTx = new Transaction();

    const queueKey = createQueueKey(cancelTx, assetType, {
      address: payerAddress,
      u64: timestamp,
    });

    cancelWithdrawByReqIdAndTransfer(cancelTx, [assetType, shareType], {
      vault: vaultId,
      queueKey: queueKey,
      denyList: DENY_LIST_ID,
    });

    return await signAndExecute(cancelTx, this.network, payerAddress);
  }

  //== Vault read functions ==

  async getShareType(vaultId: string) {
    const shareType = await this.#getGenericTypeFromObject(vaultId);
    return shareType;
  }

  async getOneShare(accountantId: string) {
    const accountant = await this.client.getObject({
      id: accountantId,
      options: { showContent: true },
    });
    const fields = (accountant.data?.content as any)?.fields;
    return (fields?.one_share);
  }

  // returns raw share balance as Sui CoinBalance object
  async getShareBalance(ownerAddress: string, shareType: string) {
    const shareBalance = await this.client.getBalance({
      owner: ownerAddress,
      coinType: shareType,
    });
    return shareBalance;
  }

  // returns human readable numeric share balance
  async fetchUserShares(ownerAddress: string, shareType: string, oneShare: bigint) {
    const shareBalance = await this.getShareBalance(ownerAddress, shareType);
    return Number(shareBalance.totalBalance) / Number(oneShare);
  }

  // returns human readable numeric value for 1 share of the vault
  async fetchShareValue(accountantId: string) {
    const accountant = await this.client.getObject({
      id: accountantId,
      options: {
        showContent: true,
      },
    });
    const fields = (accountant.data?.content as any)?.fields;
    return Number(fields?.exchange_rate) / Number(fields?.one_share);
  }

  // returns human readable numeric value for TVL in terms of the base asset of the vault
  async fetchTotalAssets(accountantId: string) {
    const accountant = await this.client.getObject({
      id: accountantId,
      options: {
        showContent: true,
      },
    });
    const fields = (accountant.data?.content as any)?.fields;
    const one_share = Number(fields?.one_share);
    const total_shares = Number(fields?.total_shares);
    const share_value = Number(fields?.exchange_rate);
    // assuming exchage rate is in terms of 1 share
    return (total_shares * share_value) / (one_share * one_share);
  }

  async fetchRequestUnlockTime(requestId: string) {
    const request = await this.client.getObject({
      id: requestId,
      options: {
        showContent: true,
      },
    });
    const fields = (request.data?.content as any)?.fields;
    return fields?.creation_time_ms + fields?.ms_to_maturity;
  }

  async isVaultPaused(vaultId: string) {
    const vault = await this.client.getObject({
      id: vaultId,
      options: {
        showContent: true,
      },
    });
    return (vault.data?.content as any)?.fields?.is_vault_paused;
  }

  // Helper function to read queue key fields
  async readQueueKeyFields(queueKeyId: string) {
    const { data } = await this.client.getObject({
      id: queueKeyId,
      options: { showContent: true },
    });

    // the object is `Field<QueueKey, …>`
    const nameFields = (data as any).content.fields.name.fields;
    return {
      account: nameFields.account as string,
      timestamp: BigInt(nameFields.timestamp as string),
    };
  }

  //== Private helper functions ==

  async #getGenericTypeFromObject(objectId: string) {
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
    console.log('Full type string:', typeString);
  
    // Example: 0x2::coin::Coin<0x2::sui::SUI>
    const genericMatch = typeString.match(/<(.+)>/);
    if (genericMatch) {
      const genericType = genericMatch[1];
      console.log('Generic type parameter:', genericType);
      return genericType;
    }
  
    console.log('No generic parameter found.');
    return null;
  }

  /*async addNewDepositableAsset(
    payerAddress: string,
    assetType: string,
    assetSharePremium: number,
    msToMaturity: bigint,
    minMsToDeadline: bigint,
    minDiscount: bigint,
    maxDiscount: bigint,
    minimumShares: bigint,
    withdrawCapacity: bigint,
    network: Network = "localnet"
  ) {
    const addTx = new Transaction();

    addNewDepositableAssetType(addTx, [assetType, VLBTC.$typeName], {
      vault: VLBTC_VAULT_ID,
      auth: AUTH_ID,
      u16: assetSharePremium,
      u641: msToMaturity,
      u642: minMsToDeadline,
      u643: minDiscount,
      u644: maxDiscount,
      u645: minimumShares,
      u646: withdrawCapacity,
    });

    return await signAndExecute(addTx, network, payerAddress);
  }*/
}

// Export the SDK instance
export const createSuiVaultSDK = (network: Network = "localnet") => {
  return new SuiVaultSDK(network);
};
