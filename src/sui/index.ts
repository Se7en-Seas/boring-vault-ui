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
  private vaultId: string;
  private accountantId: string;
  private shareType: string | null = null;
  private shareTypePromise: Promise<string | null> | null = null;

  constructor(network: Network = "localnet", vaultId: string, accountantId: string) {
    this.client = getClient(network);
    this.network = network;
    this.vaultId = vaultId;
    this.accountantId = accountantId;
  }

  //== Vault write functions ==

  async deposit(
    payerAddress: string,
    assetType: string,
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

    const shareType = await this.getShareType();
    if (!shareType) {
      throw new Error("Share type not found for vault");
    }

    depositAndTransfer(depTx, [assetType, shareType], {
      vault: this.vaultId,
      accountant: this.accountantId,
      coin: coin,
      u64: minMintAmount,
      denyList: DENY_LIST_ID,
    });

    return await signAndExecute(depTx, this.network, payerAddress);
  }

  async requestWithdraw(
    payerAddress: string,
    assetType: string,
    shareAmount: bigint,
    discount: bigint,
    msToDeadline: bigint,
  ) {
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
      u64: shareAmount,
    });

    requestWithdraw(withdrawTx, [assetType, shareType], {
      vault: this.vaultId,
      accountant: this.accountantId,
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
    timestamp: bigint,
  ) {
    const shareType = await this.getShareType();
    if (!shareType) {
      throw new Error("Share type not found for vault");
    }

    const cancelTx = new Transaction();

    const queueKey = createQueueKey(cancelTx, assetType, {
      address: payerAddress,
      u64: timestamp,
    });

    cancelWithdrawByReqIdAndTransfer(cancelTx, [assetType, shareType], {
      vault: this.vaultId,
      queueKey: queueKey,
      denyList: DENY_LIST_ID,
    });

    return await signAndExecute(cancelTx, this.network, payerAddress);
  }

  //== Vault read functions ==

  async getShareType() {
    if (this.shareType !== null) {
      return this.shareType;
    }
    
    if (this.shareTypePromise === null) {
      this.shareTypePromise = this.#getGenericTypeFromObject(this.vaultId);
    }
    
    this.shareType = await this.shareTypePromise;
    return this.shareType;
  }

  async getOneShare() {
    const accountant = await this.client.getObject({
      id: this.accountantId,
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
  async fetchShareValue() {
    const accountant = await this.client.getObject({
      id: this.accountantId,
      options: {
        showContent: true,
      },
    });
    const fields = (accountant.data?.content as any)?.fields;
    return Number(fields?.exchange_rate) / Number(fields?.one_share);
  }

  // returns human readable numeric value for TVL in terms of the base asset of the vault
  async fetchTotalAssets() {
    const accountant = await this.client.getObject({
      id: this.accountantId,
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

  async isVaultPaused() {
    const vault = await this.client.getObject({
      id: this.vaultId,
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
  
    // Example: 0x2::coin::Coin<0x2::sui::SUI>
    const genericMatch = typeString.match(/<(.+)>/);
    if (genericMatch) {
      const genericType = genericMatch[1];
      return genericType;
    }
  
    console.log('No generic parameter found.');
    return null;
  }
}

// Export the SDK instance
export const createSuiVaultSDK = (network: Network = "localnet", vaultId: string, accountantId: string) => {
  return new SuiVaultSDK(network, vaultId, accountantId);
};
