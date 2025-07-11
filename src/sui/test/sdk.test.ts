import { Transaction } from "@mysten/sui/transactions";
import { ADMIN_ADDRESS } from "../config";
import { getClient, signAndExecute } from "../utils/execute";
import { testMint } from "../gen/v-lbtc/asset/functions";
import { ASSET } from "../gen/v-lbtc/asset/structs";
import { addNewDepositableAssetType } from "../gen/boring_vault/boring-vault/functions";
import { VLBTC } from "../gen/v-lbtc/vlbtc/structs";
import { DepositEvent, WithdrawRequestedEvent, WithdrawRequestCancelledEvent } from "../gen/boring_vault/boring-vault/structs";
import { SuiVaultSDK, createSuiVaultSDK } from "../index";
import { SuiClient } from "@mysten/sui/client";
import { normalizeStructTag } from "@mysten/sui/utils";
import { parseUnits } from "viem";

const TEST_ASSET_TREASURY_CAP = "0xf9a4cdfe9e948e9277289c1ea68ea5eb17747ab2b7f0d1beaacb969734911637";
const AUTH_ID = "0xecfa41dea471e0012a3c72a45372362887953f21a3d836e812d68727604bb0ae";
const VLBTC_VAULT_ID = "0x6e1d42532e00fe871d0adf7191b62cbe6eea8085b696ebb2f06bd28e6b70ebeb";
const ACCOUNTANT_ID = "0xaba6fb06dd9d12de2b8d7746313e42fb7495c90dc1cf8c2ef6bd489062de5bf9";

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
    sdk = createSuiVaultSDK("testnet", VLBTC_VAULT_ID, ACCOUNTANT_ID);
    client = getClient("testnet");

    // Mint test assets
    const mintTx = new Transaction();
    testMint(mintTx, ASSET.$typeName, {
      treasuryCap: TEST_ASSET_TREASURY_CAP,
      u64: 1_000_000_000_00000000n, // 1B
    });

    let result = await signAndExecute(mintTx, "testnet", ADMIN_ADDRESS);
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

      await signAndExecute(addNewAssetTx, "testnet", ADMIN_ADDRESS);
    } catch (error) {
      // Asset type might already be added, which is fine
      console.log("Asset type might already be added:", error);
    }
  });

  describe("deposit", () => {
    it("should successfully deposit assets and mint shares", async () => {
      const depositEvent = `${DepositEvent.$typeName}<${ASSET.$typeName}, ${VLBTC.$typeName}>`;
      const currentDepositEvents = await countEvents(client, depositEvent);

      const depositAmount = "1000" // 1K
      const minMintAmount = "500" // 500

      const result = await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        depositAmount,
        minMintAmount,
      );

      expect(result.effects?.status.status).toBe("success");

      // Verify deposit event was emitted
      const newDepositEvents = await countEvents(client, depositEvent);
      expect(newDepositEvents).toBe(currentDepositEvents + 1);

      // Verify shares were minted
      const userShares = await sdk.fetchUserShares(ADMIN_ADDRESS);
      const decimals = await sdk.getDecimals();
      expect(parseUnits(userShares, decimals)).toBeGreaterThanOrEqual(parseUnits(minMintAmount, decimals));
    });

    it("should throw error when no coins found for asset type", async () => {
      const depositAmount = "1000" // 1K
      const minMintAmount = "500" // 500

      await expect(
        sdk.deposit(
          "0x0000000000000000000000000000000000000000000000000000000000000000", // Non-existent address
          ASSET.$typeName,
          depositAmount,
          minMintAmount,
        )
      ).rejects.toThrow(`No coins found for asset ${normalizeStructTag(ASSET.$typeName)}`);
    });
  });

  describe("requestWithdraw", () => {
    it("should successfully request withdrawal", async () => {
      // First deposit to get shares
      const depositAmount = "1000" // 1K
      const minMintAmount = "500" // 500
      const depositResult = await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        depositAmount,
        minMintAmount,
      );
      expect(depositResult.effects?.status.status).toBe("success");

      const withdrawRequestedEvent = `${WithdrawRequestedEvent.$typeName}<${ASSET.$typeName}, ${VLBTC.$typeName}>`;
      const currentWithdrawReqEvents = await countEvents(client, withdrawRequestedEvent);

      const shareAmount = "100" // 100 shares
      const discount = "0.1000"; // 10%
      const daysValid = "18.5"; // 18.5 days


      const result = await sdk.requestWithdraw(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        shareAmount,
        discount,
        daysValid,
      );

      expect(result.effects?.status.status).toBe("success");

      // Verify withdraw request event was emitted
      const newWithdrawReqEvents = await countEvents(client, withdrawRequestedEvent);
      expect(newWithdrawReqEvents).toBe(currentWithdrawReqEvents + 1);
    });

    it("should throw error when no shares found", async () => {
      const shareAmount = "100" // 100 shares
      const discount = "0.1000";
      const daysValid = "18.5";

      // Get share type from sdk instead of using VLBTC.$typeName,
      // because apparanetly there can be a discrepancy when the package ID contains a leading 0 (after 0x).
      // This doesn't seem to affect other stuff, just can't use it for the string comparison below
      const shareType = await sdk.getShareType();
      await expect(
        sdk.requestWithdraw(
          "0x0000000000000000000000000000000000000000000000000000000000000000", // Non-existent address
          ASSET.$typeName,
          shareAmount,
          discount,
          daysValid,
        )
      ).rejects.toThrow(`No shares found for type ${shareType}`);
    });
  });

  describe("cancelWithdraw", () => {
    it("should successfully cancel withdrawal request", async () => {
      // First deposit to get shares
      const depositAmount = "1000" // 1K
      const minMintAmount = "500" // 500
      await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        depositAmount,
        minMintAmount,
      );

      // Request withdrawal
      const shareAmount = "100" // 100 shares
      const discount = "0.1000";
      const daysValid = "18.5";

      const withdrawResult = await sdk.requestWithdraw(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        shareAmount,
        discount,
        daysValid,
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
      const defaultSdk = createSuiVaultSDK("localnet", VLBTC_VAULT_ID, ACCOUNTANT_ID);
      expect(defaultSdk).toBeInstanceOf(SuiVaultSDK);
    });

    it("should create SDK instance with specified network", () => {
      const testnetSdk = createSuiVaultSDK("testnet", VLBTC_VAULT_ID, ACCOUNTANT_ID);
      expect(testnetSdk).toBeInstanceOf(SuiVaultSDK);
    });
  });

  describe("getShareType", () => {
    it("should successfully extract share type from vault object", async () => {
      const shareType = await sdk.getShareType();
      
      // The share type should be extracted from the vault object
      expect(shareType).toBeTruthy();
      expect(typeof shareType).toBe("string");
      
      // It should contain the expected share type structure
      expect(shareType).toContain("::");
      expect(shareType).toContain("VLBTC");
    });

    it("should extract generic type from TreasuryCap object", async () => {
      // Test with a different SDK instance for TreasuryCap
      const testSdk = createSuiVaultSDK("testnet", TEST_ASSET_TREASURY_CAP, ACCOUNTANT_ID);
      const genericType = await testSdk.getShareType();
      
      // Should return the generic type parameter
      expect(genericType).toBeTruthy();
      expect(typeof genericType).toBe("string");
      expect(genericType).toContain("::asset::ASSET");
    });

    it("should throw error for non-existent object", async () => {
      const nonExistentObjectId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      const testSdk = createSuiVaultSDK("testnet", nonExistentObjectId, ACCOUNTANT_ID);
      
      await expect(
        testSdk.getShareType()
      ).rejects.toThrow("Type information not found.");
    });
  });

  describe("isVaultPaused", () => {
    it("should return vault pause status", async () => {
      const isPaused = await sdk.isVaultPaused();
      
      // Should return a boolean value
      expect(typeof isPaused).toBe("boolean");
      
      // The vault should not be paused by default
      expect(isPaused).toBe(false);
    });
  });

  describe("fetchUserShares", () => {
    it("should return correct user share balance in human readable format", async () => {
      // Get initial share balance
      const initialUserShares = await sdk.fetchUserShares(ADMIN_ADDRESS);
      
      // Perform a deposit
      const depositAmount = "1000" // 1K
      const minMintAmount = "500" // 500
      await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        depositAmount,
        minMintAmount,
      );

      // Get final share balance
      const finalUserShares = await sdk.fetchUserShares(ADMIN_ADDRESS);
      
      // Should return a string
      expect(typeof finalUserShares).toBe("string");
      
      // Should be greater than or equal to initial balance
      const decimals = await sdk.getDecimals();
      expect(parseUnits(finalUserShares, decimals)).toBeGreaterThanOrEqual(parseUnits(initialUserShares, decimals));
      
      // Calculate the difference in shares
      const shareDifference = parseUnits(finalUserShares, decimals) - parseUnits(initialUserShares, decimals);
      
      // Should have gained at least the minimum mint amount in shares
      const expectedMinShares = parseUnits(minMintAmount, decimals);
      expect(shareDifference).toBeGreaterThanOrEqual(expectedMinShares * 9n / 10n); // Allow for some tolerance
    });

    it("should return 0 for user with no shares", async () => {
      const nonExistentAddress = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      const userShares = await sdk.fetchUserShares(nonExistentAddress);
      
      expect(userShares).toBe("0");
    });

    it("should handle different share types correctly", async () => {
      // Test with the actual share type
      const userShares = await sdk.fetchUserShares(ADMIN_ADDRESS);
      expect(typeof userShares).toBe("string");
      expect(parseUnits(userShares, await sdk.getDecimals())).toBeGreaterThanOrEqual(0n);
    });

    it("should accurately reflect share balance changes after multiple operations", async () => {
      // Get initial balance
      const initialShares = await sdk.fetchUserShares(ADMIN_ADDRESS);
      
      // Perform a small deposit
      const depositAmount = "500" // 500
      const minMintAmount = "200" // 200
      await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        depositAmount,
        minMintAmount,
      );
      
      // Get balance after deposit
      const afterDepositShares = await sdk.fetchUserShares(ADMIN_ADDRESS);
      
      // Verify the increase
      const decimals = await sdk.getDecimals();
      expect(parseUnits(afterDepositShares, decimals)).toBeGreaterThan(parseUnits(initialShares, decimals));
      
      // Calculate expected minimum increase
      const expectedMinIncrease = parseUnits(minMintAmount, decimals);
      const actualIncrease = parseUnits(afterDepositShares, decimals) - parseUnits(initialShares, decimals);
      
      // Should have gained at least the minimum expected shares
      expect(actualIncrease).toBeGreaterThanOrEqual(expectedMinIncrease);
    });
  });

  describe("fetchShareValue", () => {
    it("should return correct share value in human readable format", async () => {
      const shareValue = await sdk.fetchShareValue();
      
      // Should return a string
      expect(typeof shareValue).toBe("string");
      
      // Should be greater than 0 (a share should have some value)
      const decimals = await sdk.getDecimals();
      expect(parseUnits(shareValue, decimals)).toBeGreaterThan(0n);
      
      // Should be a reasonable value (not extremely large or small)
      expect(parseUnits(shareValue, decimals)).toBeLessThan(parseUnits("1000000", decimals)); // Assuming share value is reasonable
    });

    it("should calculate share value correctly based on exchange rate", async () => {
      // Get raw values from accountant
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const exchangeRate = BigInt(fields?.exchange_rate);
      const oneShare = BigInt(fields?.one_share);
      
      // Get actual share value from SDK
      const actualShareValue = await sdk.fetchShareValue();
      const decimals = await sdk.getDecimals();
      
      // Calculate expected share value: (exchange_rate * 10^decimals) / one_share
      const expectedShareValue = exchangeRate * BigInt(10 ** decimals) / oneShare;
      
      // Should match the expected calculation
      expect(parseUnits(actualShareValue, decimals)).toBe(expectedShareValue);
    });
  });

  describe("fetchTotalAssets", () => {
    it("should return correct total assets value in human readable format", async () => {
      const totalAssets = await sdk.fetchTotalAssets();
      
      // Should return a string
      expect(typeof totalAssets).toBe("string");
      
      // Should be greater than or equal to 0
      const decimals = await sdk.getDecimals();
      expect(parseUnits(totalAssets, decimals)).toBeGreaterThanOrEqual(0n);
      
      // Should be a reasonable value
      expect(parseUnits(totalAssets, decimals)).toBeLessThan(parseUnits("1000000000", decimals)); // Assuming TVL is reasonable
    });

    it("should calculate total assets correctly based on total shares and exchange rate", async () => {
      // Get raw values from accountant
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const totalShares = BigInt(fields?.total_shares);
      const oneShare = BigInt(fields?.one_share);
      
      // Get actual total assets from SDK
      const actualTotalAssets = await sdk.fetchTotalAssets();
      const shareValue = await sdk.fetchShareValue();
      const decimals = await sdk.getDecimals();
      
      // Calculate expected total assets
      const expectedTotalAssets = totalShares * parseUnits(shareValue, decimals) / oneShare;
      
      // Should match the expected calculation (allowing for some rounding)
      const actualTotalAssetsBigInt = parseUnits(actualTotalAssets, decimals);
      const difference = actualTotalAssetsBigInt > expectedTotalAssets ? 
        actualTotalAssetsBigInt - expectedTotalAssets : 
        expectedTotalAssets - actualTotalAssetsBigInt;
      expect(difference).toBeLessThan(expectedTotalAssets / 1000n); // Allow 0.1% difference
    });

    it("should return 0 for vault with no total shares", async () => {
      // This test assumes there might be a scenario where total_shares is 0
      // In practice, this might not happen, but we test the calculation logic
      const totalAssets = await sdk.fetchTotalAssets();
      
      // If total shares is 0, total assets should be 0
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const totalShares = BigInt(fields?.total_shares);
      
      if (totalShares === 0n) {
        expect(totalAssets).toBe("0");
      } else {
        const decimals = await sdk.getDecimals();
        expect(parseUnits(totalAssets, decimals)).toBeGreaterThan(0n);
      }
    });
  });

  describe("getOneShare", () => {
    it("should return correct one_share value from accountant", async () => {
      const oneShare = await sdk.getOneShare();
      
      // Should return a bigint (as returned by SDK)
      expect(typeof oneShare).toBe("bigint");
      
      // Should be greater than 0
      expect(oneShare).toBeGreaterThan(0n);
      
      // Should be a reasonable value (not extremely large)
      expect(oneShare).toBeLessThan(1000000000000000000n); // 1e18
    });

    it("should match the one_share value from direct object query", async () => {
      // Get one_share directly from accountant object
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const expectedOneShare = BigInt(fields?.one_share);
      
      // Get one_share from SDK
      const actualOneShare = await sdk.getOneShare();
      
      // Should match
      expect(actualOneShare).toBe(expectedOneShare);
    });
  });

  describe("Integration tests for vault metrics", () => {
    it("should provide consistent vault metrics after deposit", async () => {
      // Perform a deposit
      const decimals = await sdk.getDecimals();
      const depositAmount = "2000" // 2K
      const minMintAmount = "1000" // 1K
      await sdk.deposit(
        ADMIN_ADDRESS,
        ASSET.$typeName,
        depositAmount,
        minMintAmount,
      );

      // Get all vault metrics
      const oneShare = await sdk.getOneShare();
      const shareValue = await sdk.fetchShareValue();
      const totalAssets = await sdk.fetchTotalAssets();
      const userShares = await sdk.fetchUserShares(ADMIN_ADDRESS);

      // Verify all metrics are consistent
      expect(oneShare).toBeGreaterThan(0n);
      expect(parseUnits(shareValue, decimals)).toBeGreaterThan(0n);
      expect(parseUnits(totalAssets, decimals)).toBeGreaterThanOrEqual(0n);
      expect(parseUnits(userShares, decimals)).toBeGreaterThan(0n);

      // Verify total assets calculation is consistent
      const accountant = await client.getObject({
        id: ACCOUNTANT_ID,
        options: { showContent: true },
      });
      const fields = (accountant.data?.content as any)?.fields;
      const totalShares = BigInt(fields?.total_shares);
      const expectedTotalAssets = totalShares * parseUnits(shareValue, decimals) / oneShare;
      
      const actualTotalAssets = parseUnits(totalAssets, decimals);
      const assetsDifference = actualTotalAssets > expectedTotalAssets ? 
        actualTotalAssets - expectedTotalAssets : 
        expectedTotalAssets - actualTotalAssets;
      expect(assetsDifference).toBeLessThan(expectedTotalAssets / 1000n); // Allow 0.1% difference
    });
  });
});
