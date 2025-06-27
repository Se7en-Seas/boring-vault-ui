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
      addNewAssetTx.setGasBudget(500_000_000); // Set gas budget to 0.5 SUI
      
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

      if (!queueKey || !('objectId' in queueKey)) {
        throw new Error("Queue key not found in withdrawal request result or missing objectId property");
      }

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

  describe("fetchUserShares", () => {
    it("should return correct user share balance in human readable format", async () => {
      // Get one_share value from accountant
      const oneShare = await sdk.getOneShare(ACCOUNTANT_ID);
      expect(oneShare).toBeTruthy();
      expect(typeof oneShare).toBe("string");

      // Get initial share balance
      const initialUserShares = await sdk.fetchUserShares(ADMIN_ADDRESS, VLBTC.$typeName, BigInt(oneShare));
      
      // Perform a deposit
      const depositAmount = 1000_00000000n; // 1K
      const minMintAmount = 500_00000000n; // 500
      await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        VLBTC.$typeName,
        VLBTC_VAULT_ID,
        ACCOUNTANT_ID,
        depositAmount,
        minMintAmount,
      );

      // Get final share balance
      const finalUserShares = await sdk.fetchUserShares(ADMIN_ADDRESS, VLBTC.$typeName, BigInt(oneShare));
      
      // Should return a number
      expect(typeof finalUserShares).toBe("number");
      
      // Should be greater than or equal to initial balance
      expect(finalUserShares).toBeGreaterThanOrEqual(initialUserShares);
      
      // Calculate the difference in shares
      const shareDifference = finalUserShares - initialUserShares;
      
      // Should have gained at least the minimum mint amount in shares
      const expectedMinShares = Number(minMintAmount) / Number(oneShare);
      expect(shareDifference).toBeGreaterThanOrEqual(expectedMinShares * 0.9); // Allow for some tolerance
    });

    it("should return 0 for user with no shares", async () => {
      const oneShare = await sdk.getOneShare(ACCOUNTANT_ID);
      const nonExistentAddress = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      const userShares = await sdk.fetchUserShares(nonExistentAddress, VLBTC.$typeName, BigInt(oneShare));
      
      expect(userShares).toBe(0);
    });

    it("should handle different share types correctly", async () => {
      const oneShare = await sdk.getOneShare(ACCOUNTANT_ID);
      
      // Test with the actual share type
      const userShares = await sdk.fetchUserShares(ADMIN_ADDRESS, VLBTC.$typeName, BigInt(oneShare));
      expect(typeof userShares).toBe("number");
      expect(userShares).toBeGreaterThanOrEqual(0);
    });

    it("should accurately reflect share balance changes after multiple operations", async () => {
      const oneShare = await sdk.getOneShare(ACCOUNTANT_ID);
      
      // Get initial balance
      const initialShares = await sdk.fetchUserShares(ADMIN_ADDRESS, VLBTC.$typeName, BigInt(oneShare));
      
      // Perform a small deposit
      const depositAmount = 500_00000000n; // 500
      const minMintAmount = 200_00000000n; // 200
      await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        VLBTC.$typeName,
        VLBTC_VAULT_ID,
        ACCOUNTANT_ID,
        depositAmount,
        minMintAmount,
      );
      
      // Get balance after deposit
      const afterDepositShares = await sdk.fetchUserShares(ADMIN_ADDRESS, VLBTC.$typeName, BigInt(oneShare));
      
      // Verify the increase
      expect(afterDepositShares).toBeGreaterThan(initialShares);
      
      // Calculate expected minimum increase
      const expectedMinIncrease = Number(minMintAmount) / Number(oneShare);
      const actualIncrease = afterDepositShares - initialShares;
      
      // Should have gained at least the minimum expected shares
      expect(actualIncrease).toBeGreaterThanOrEqual(expectedMinIncrease * 0.9); // Allow for some tolerance
    });
  });

  describe("fetchShareValue", () => {
    it("should return correct share value in human readable format", async () => {
      const shareValue = await sdk.fetchShareValue(ACCOUNTANT_ID);
      
      // Should return a number
      expect(typeof shareValue).toBe("number");
      
      // Should be greater than 0 (a share should have some value)
      expect(shareValue).toBeGreaterThan(0);
      
      // Should be a reasonable value (not extremely large or small)
      expect(shareValue).toBeLessThan(1000000); // Assuming share value is reasonable
    });

    it("should calculate share value correctly based on exchange rate and one_share", async () => {
      // Get raw values from accountant
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const exchangeRate = Number(fields?.exchange_rate);
      const oneShare = Number(fields?.one_share);
      
      // Calculate expected share value
      const expectedShareValue = exchangeRate / oneShare;
      
      // Get actual share value from SDK
      const actualShareValue = await sdk.fetchShareValue(ACCOUNTANT_ID);
      
      // Should match the expected calculation
      expect(actualShareValue).toBeCloseTo(expectedShareValue, 6);
    });

    it("should return NaN for non-existent accountant", async () => {
      const nonExistentAccountantId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      const shareValue = await sdk.fetchShareValue(nonExistentAccountantId);
      expect(shareValue).toBeNaN();
    });
  });

  describe("fetchTotalAssets", () => {
    it("should return correct total assets value in human readable format", async () => {
      const totalAssets = await sdk.fetchTotalAssets(ACCOUNTANT_ID);
      
      // Should return a number
      expect(typeof totalAssets).toBe("number");
      
      // Should be greater than or equal to 0
      expect(totalAssets).toBeGreaterThanOrEqual(0);
      
      // Should be a reasonable value
      expect(totalAssets).toBeLessThan(1000000000); // Assuming TVL is reasonable
    });

    it("should calculate total assets correctly based on total shares and exchange rate", async () => {
      // Get raw values from accountant
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const totalShares = Number(fields?.total_shares);
      const exchangeRate = Number(fields?.exchange_rate);
      const oneShare = Number(fields?.one_share);
      
      // Calculate expected total assets
      const expectedTotalAssets = (totalShares * exchangeRate) / (oneShare * oneShare);
      
      // Get actual total assets from SDK
      const actualTotalAssets = await sdk.fetchTotalAssets(ACCOUNTANT_ID);
      
      // Should match the expected calculation
      expect(actualTotalAssets).toBeCloseTo(expectedTotalAssets, 6);
    });

    it("should return 0 for vault with no total shares", async () => {
      // This test assumes there might be a scenario where total_shares is 0
      // In practice, this might not happen, but we test the calculation logic
      const totalAssets = await sdk.fetchTotalAssets(ACCOUNTANT_ID);
      
      // If total shares is 0, total assets should be 0
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const totalShares = Number(fields?.total_shares);
      
      if (totalShares === 0) {
        expect(totalAssets).toBe(0);
      } else {
        expect(totalAssets).toBeGreaterThan(0);
      }
    });

    it("should return NaN for non-existent accountant", async () => {
      const nonExistentAccountantId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      const totalAssets = await sdk.fetchTotalAssets(nonExistentAccountantId);
      expect(totalAssets).toBeNaN();
    });
  });

  describe("getOneShare", () => {
    it("should return correct one_share value from accountant", async () => {
      const oneShare = await sdk.getOneShare(ACCOUNTANT_ID);
      
      // Should return a string (as returned by Sui object fields)
      expect(typeof oneShare).toBe("string");
      
      // Should be greater than 0 when converted to number
      expect(Number(oneShare)).toBeGreaterThan(0);
      
      // Should be a reasonable value (not extremely large)
      expect(Number(oneShare)).toBeLessThan(1000000000000000000); // 1e18
    });

    it("should match the one_share value from direct object query", async () => {
      // Get one_share directly from accountant object
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const expectedOneShare = fields?.one_share;
      
      // Get one_share from SDK
      const actualOneShare = await sdk.getOneShare(ACCOUNTANT_ID);
      
      // Should match
      expect(actualOneShare).toBe(expectedOneShare);
    });

    it("should return undefined for non-existent accountant", async () => {
      const nonExistentAccountantId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      const oneShare = await sdk.getOneShare(nonExistentAccountantId);
      expect(oneShare).toBeUndefined();
    });
  });

  describe("getShareBalance", () => {
    it("should return correct share balance for user with shares", async () => {
      // First deposit to ensure user has shares
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

      const shareBalance = await sdk.getShareBalance(ADMIN_ADDRESS, VLBTC.$typeName);
      
      // Should return a CoinBalance object
      expect(shareBalance).toBeDefined();
      expect(shareBalance.totalBalance).toBeDefined();
      
      // Should have shares
      expect(BigInt(shareBalance.totalBalance)).toBeGreaterThan(0n);
      
      // Should have at least the minimum mint amount
      expect(BigInt(shareBalance.totalBalance)).toBeGreaterThanOrEqual(minMintAmount);
    });

    it("should return zero balance for user with no shares", async () => {
      const nonExistentAddress = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      const shareBalance = await sdk.getShareBalance(nonExistentAddress, VLBTC.$typeName);
      
      expect(shareBalance.totalBalance).toBe("0");
    });

    it("should handle different share types correctly", async () => {
      const shareBalance = await sdk.getShareBalance(ADMIN_ADDRESS, VLBTC.$typeName);
      
      expect(shareBalance).toBeDefined();
      expect(shareBalance.coinType).toBe(VLBTC.$typeName);
    });
  });

  describe("Integration tests for vault metrics", () => {
    it("should provide consistent vault metrics after deposit", async () => {
      // Perform a deposit
      const depositAmount = 2000_00000000n; // 2K
      const minMintAmount = 1000_00000000n; // 1K
      await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        VLBTC.$typeName,
        VLBTC_VAULT_ID,
        ACCOUNTANT_ID,
        depositAmount,
        minMintAmount,
      );

      // Get all vault metrics
      const oneShare = await sdk.getOneShare(ACCOUNTANT_ID);
      const shareValue = await sdk.fetchShareValue(ACCOUNTANT_ID);
      const totalAssets = await sdk.fetchTotalAssets(ACCOUNTANT_ID);
      const userShares = await sdk.fetchUserShares(ADMIN_ADDRESS, VLBTC.$typeName, BigInt(oneShare));
      const shareBalance = await sdk.getShareBalance(ADMIN_ADDRESS, VLBTC.$typeName);

      // Verify all metrics are consistent
      expect(Number(oneShare)).toBeGreaterThan(0);
      expect(shareValue).toBeGreaterThan(0);
      expect(totalAssets).toBeGreaterThanOrEqual(0);
      expect(userShares).toBeGreaterThan(0);
      expect(BigInt(shareBalance.totalBalance)).toBeGreaterThan(0n);

      // Verify user shares calculation is consistent with raw balance
      const calculatedUserShares = Number(shareBalance.totalBalance) / Number(oneShare);
      expect(userShares).toBeCloseTo(calculatedUserShares, 6);

      // Verify total assets calculation is consistent
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const expectedTotalAssets = (Number(fields?.total_shares) * Number(fields?.exchange_rate)) / (Number(oneShare) * Number(oneShare));
      expect(totalAssets).toBeCloseTo(expectedTotalAssets, 6);
    });
  });
});
