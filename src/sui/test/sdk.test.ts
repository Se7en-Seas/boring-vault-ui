import { Transaction } from "@mysten/sui/transactions";
import {
  ADMIN_ADDRESS,
  ACTIVE_NETWORK,
  TEST_ASSET_TREASURY_CAP,
  VLBTC_VAULT_ID,
  ACCOUNTANT_ID,
  AUTH_ID,
} from "../config";
import { getClient, signAndExecute } from "../utils/execute";
import { testMint } from "../gen/v-lbtc/asset/functions";
import { ASSET } from "../gen/v-lbtc/asset/structs";
import { addNewDepositableAssetType } from "../gen/boring_vault/boring-vault/functions";
import { VLBTC } from "../gen/v-lbtc/vlbtc/structs";
import { DepositEvent, WithdrawRequestedEvent, WithdrawRequestCancelledEvent } from "../gen/boring_vault/boring-vault/structs";
import { SuiVaultSDK, createSuiVaultSDK } from "../index";
import { SuiClient } from "@mysten/sui/client";

// Helper function to count events by type
async function countEvents(client: SuiClient, eventType: string): Promise<number> {
  const firstPage = await client.queryEvents({
    query: {
      MoveEventType: eventType,
    },
  });
  
  let totalEvents = firstPage.data.length;
  let nextCursor = firstPage.nextCursor;
  let hasNextPage = firstPage.hasNextPage;
  
  while (hasNextPage) {
    const nextPage = await client.queryEvents({
      query: {
        MoveEventType: eventType,
      },
      cursor: nextCursor,
    });
    nextCursor = nextPage.nextCursor;
    totalEvents += nextPage.data.length;
    hasNextPage = nextPage.hasNextPage;
  }
  
  return totalEvents;
}

describe("SuiVaultSDK", () => {
  let sdk: SuiVaultSDK;
  let client: SuiClient;

  beforeAll(async () => {
    // Setup SDK and client
    sdk = createSuiVaultSDK(ACTIVE_NETWORK);
    client = getClient(ACTIVE_NETWORK);

    // Mint test assets
    const mintTx = new Transaction();
    testMint(mintTx, ASSET.$typeName, {
      treasuryCap: TEST_ASSET_TREASURY_CAP,
      u64: 1_000_000_000_00000000n, // 1B
    });

    let result = await signAndExecute(mintTx, ACTIVE_NETWORK, ADMIN_ADDRESS);
    expect(result.effects?.status.status).toBe("success");

    // Add new depositable asset type (with error handling in case it already exists)
    try {
      const addNewAssetTx = new Transaction();
      addNewAssetTx.setGasBudget(5_000_000_000); // Set gas budget to 5 SUI
      
      addNewDepositableAssetType(addNewAssetTx, [ASSET.$typeName, VLBTC.$typeName], {
        vault: VLBTC_VAULT_ID,
        auth: AUTH_ID,
        u16: 200,                             // asset_share_premium
        u641: 1_000n,                         // ms_to_maturity
        u642: 1_592_000_000n,                 // minimum_ms_to_deadline
        u643: 1_000n,                         // min_discount
        u644: 2_500n,                         // max_discount
        u645: 10_000_000n,                    // minimum_shares
        u646: 18_446_744_073_709_551_615n,    // withdraw_capacity (u64::MAX)
      });

      await signAndExecute(addNewAssetTx, ACTIVE_NETWORK, ADMIN_ADDRESS);
    } catch (error) {
      // Asset type might already be added, which is fine
      console.log("Asset type might already be added:", error);
    }
  });

  describe("deposit", () => {
    it("should successfully deposit assets and mint shares", async () => {
      const depositEvent = `${DepositEvent.$typeName}<${ASSET.$typeName}, ${VLBTC.$typeName}>`;
      const currentDepositEvents = await countEvents(client, depositEvent);

      const depositAmount = 1000_00000000n; // 1K
      const minMintAmount = 500_00000000n; // 500

      const result = await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        VLBTC.$typeName,
        VLBTC_VAULT_ID,
        ACCOUNTANT_ID,
        depositAmount,
        minMintAmount,
      );

      expect(result.effects?.status.status).toBe("success");

      // Verify deposit event was emitted
      const newDepositEvents = await countEvents(client, depositEvent);
      expect(newDepositEvents).toBe(currentDepositEvents + 1);

      // Verify shares were minted
      const shareBalance = await sdk.getShareBalance(ADMIN_ADDRESS, VLBTC.$typeName);
      expect(BigInt(shareBalance.totalBalance)).toBeGreaterThanOrEqual(minMintAmount);
    });

    it("should throw error when no coins found for asset type", async () => {
      const depositAmount = 1000_00000000n;
      const minMintAmount = 500_00000000n;

      await expect(
        sdk.deposit(
          "0x0000000000000000000000000000000000000000000000000000000000000000", // Non-existent address
          ASSET.$typeName,
          VLBTC.$typeName,
          VLBTC_VAULT_ID,
          ACCOUNTANT_ID,
          depositAmount,
          minMintAmount,
        )
      ).rejects.toThrow(`No coins found for asset ${ASSET.$typeName}`);
    });
  });

  describe("requestWithdraw", () => {
    it("should successfully request withdrawal", async () => {
      // First deposit to get shares
      const depositAmount = 1000_00000000n;
      const minMintAmount = 500_00000000n;
      await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        VLBTC.$typeName,
        VLBTC_VAULT_ID,
        ACCOUNTANT_ID,
        depositAmount,
        minMintAmount,
      );

      const withdrawRequestedEvent = `${WithdrawRequestedEvent.$typeName}<${ASSET.$typeName}, ${VLBTC.$typeName}>`;
      const currentWithdrawReqEvents = await countEvents(client, withdrawRequestedEvent);

      const shareAmount = 100_00000000n; // 100 shares
      const discount = 1000n; // 10 basis points
      const msToDeadline = 1_592_000_000n; // ~18 days

      const result = await sdk.requestWithdraw(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        VLBTC.$typeName,
        VLBTC_VAULT_ID,
        ACCOUNTANT_ID,
        shareAmount,
        discount,
        msToDeadline,
      );

      expect(result.effects?.status.status).toBe("success");

      // Verify withdraw request event was emitted
      const newWithdrawReqEvents = await countEvents(client, withdrawRequestedEvent);
      expect(newWithdrawReqEvents).toBe(currentWithdrawReqEvents + 1);
    });

    it("should throw error when no shares found", async () => {
      const shareAmount = 100_00000000n;
      const discount = 1000n;
      const msToDeadline = 1_592_000_000n;

      await expect(
        sdk.requestWithdraw(
          "0x0000000000000000000000000000000000000000000000000000000000000000", // Non-existent address
          ASSET.$typeName,
          VLBTC.$typeName,
          VLBTC_VAULT_ID,
          ACCOUNTANT_ID,
          shareAmount,
          discount,
          msToDeadline,
        )
      ).rejects.toThrow(`No shares found for type ${VLBTC.$typeName}`);
    });
  });

  describe("cancelWithdraw", () => {
    it("should successfully cancel withdrawal request", async () => {
      // First deposit to get shares
      const depositAmount = 1000_00000000n;
      const minMintAmount = 500_00000000n;
      await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        VLBTC.$typeName,
        VLBTC_VAULT_ID,
        ACCOUNTANT_ID,
        depositAmount,
        minMintAmount,
      );

      // Request withdrawal

      const shareAmount = 100_00000000n;
      const discount = 1000n;
      const msToDeadline = 1_592_000_000n;

      const withdrawResult = await sdk.requestWithdraw(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        VLBTC.$typeName,
        VLBTC_VAULT_ID,
        ACCOUNTANT_ID,
        shareAmount,
        discount,
        msToDeadline,
      );

      // Get the queue key from the withdrawal request
      const queueKey = withdrawResult.objectChanges?.find(
        (x) =>
          x.type === "created" &&
          x.objectType.includes("boring_vault::QueueKey") &&
          x.objectType.includes("vLBTC::VLBTC")
      );

      if (!queueKey) {
        throw new Error("Queue key not found in withdrawal request result");
      }

      // @ts-ignore-next-line
      const { timestamp } = await sdk.readQueueKeyFields(queueKey.objectId);

      const withdrawRequestCancelledEvent = `${WithdrawRequestCancelledEvent.$typeName}<${ASSET.$typeName}, ${VLBTC.$typeName}>`;
      const currentCancelledReqEvents = await countEvents(client, withdrawRequestCancelledEvent);

      // Cancel the withdrawal
      const result = await sdk.cancelWithdraw(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        VLBTC.$typeName,
        VLBTC_VAULT_ID,
        timestamp,
      );

      expect(result.effects?.status.status).toBe("success");

      // Verify cancel event was emitted
      const newCancelledReqEvents = await countEvents(client, withdrawRequestCancelledEvent);
      expect(newCancelledReqEvents).toBe(currentCancelledReqEvents + 1);

      // Verify shares were returned
      const { data: newCoins } = await client.getCoins({
        owner: ADMIN_ADDRESS,
        coinType: VLBTC.$typeName,
      });
      expect(newCoins.length).toBeGreaterThan(0);
    });
  });

  describe("SDK factory function", () => {
    it("should create SDK instance with default network", () => {
      const defaultSdk = createSuiVaultSDK();
      expect(defaultSdk).toBeInstanceOf(SuiVaultSDK);
    });

    it("should create SDK instance with specified network", () => {
      const testnetSdk = createSuiVaultSDK("testnet");
      expect(testnetSdk).toBeInstanceOf(SuiVaultSDK);
    });
  });

  describe("getShareType", () => {
    it("should successfully extract share type from vault object", async () => {
      const shareType = await sdk.getShareType(VLBTC_VAULT_ID);
      
      // The share type should be extracted from the vault object
      expect(shareType).toBeTruthy();
      expect(typeof shareType).toBe("string");
      
      // It should contain the expected share type structure
      expect(shareType).toContain("::");
      expect(shareType).toContain("VLBTC");
    });

    it("should extract generic type from TreasuryCap object", async () => {
      // Test with a TreasuryCap object that has generic type parameters
      const genericType = await sdk.getShareType(TEST_ASSET_TREASURY_CAP);
      
      // Should return the generic type parameter
      expect(genericType).toBeTruthy();
      expect(typeof genericType).toBe("string");
      expect(genericType).toContain("::asset::ASSET");
    });

    it("should throw error for non-existent object", async () => {
      const nonExistentObjectId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      await expect(
        sdk.getShareType(nonExistentObjectId)
      ).rejects.toThrow("Type information not found.");
    });
  });

  describe("isVaultPaused", () => {
    it("should return vault pause status", async () => {
      const isPaused = await sdk.isVaultPaused(VLBTC_VAULT_ID);
      
      // Should return a boolean value
      expect(typeof isPaused).toBe("boolean");
      
      // The vault should not be paused by default
      expect(isPaused).toBe(false);
    });

    it("should handle non-existent vault gracefully", async () => {
      const nonExistentVaultId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      const isPaused = await sdk.isVaultPaused(nonExistentVaultId);
      
      // Should return undefined for non-existent vault
      expect(isPaused).toBeUndefined();
    });
  });
});
