export default [
  {
    inputs: [
      { internalType: "address", name: "_owner", type: "address" },
      { internalType: "address", name: "_vault", type: "address" },
      { internalType: "address", name: "payoutAddress", type: "address" },
      { internalType: "uint96", name: "startingExchangeRate", type: "uint96" },
      { internalType: "address", name: "_base", type: "address" },
      {
        internalType: "uint16",
        name: "allowedExchangeRateChangeUpper",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "allowedExchangeRateChangeLower",
        type: "uint16",
      },
      {
        internalType: "uint8",
        name: "minimumUpdateDelayInHours",
        type: "uint8",
      },
      { internalType: "uint16", name: "managementFee", type: "uint16" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "AccountantWithRateProviders__LowerBoundTooLarge",
    type: "error",
  },
  {
    inputs: [],
    name: "AccountantWithRateProviders__ManagementFeeTooLarge",
    type: "error",
  },
  { inputs: [], name: "AccountantWithRateProviders__Paused", type: "error" },
  {
    inputs: [],
    name: "AccountantWithRateProviders__UpperBoundTooSmall",
    type: "error",
  },
  {
    inputs: [],
    name: "AccountantWithRateProviders__ZeroFeesOwed",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      {
        indexed: true,
        internalType: "contract Authority",
        name: "newAuthority",
        type: "address",
      },
    ],
    name: "AuthorityUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint8",
        name: "oldDelay",
        type: "uint8",
      },
      {
        indexed: false,
        internalType: "uint8",
        name: "newDelay",
        type: "uint8",
      },
    ],
    name: "DelayInHoursUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint96",
        name: "oldRate",
        type: "uint96",
      },
      {
        indexed: false,
        internalType: "uint96",
        name: "newRate",
        type: "uint96",
      },
      {
        indexed: false,
        internalType: "uint64",
        name: "currentTime",
        type: "uint64",
      },
    ],
    name: "ExchangeRateUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "feeAsset",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "FeesClaimed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint16",
        name: "oldBound",
        type: "uint16",
      },
      {
        indexed: false,
        internalType: "uint16",
        name: "newBound",
        type: "uint16",
      },
    ],
    name: "LowerBoundUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint16",
        name: "oldFee",
        type: "uint16",
      },
      {
        indexed: false,
        internalType: "uint16",
        name: "newFee",
        type: "uint16",
      },
    ],
    name: "ManagementFeeUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      {
        indexed: true,
        internalType: "address",
        name: "newOwner",
        type: "address",
      },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  { anonymous: false, inputs: [], name: "Paused", type: "event" },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "oldPayout",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "newPayout",
        type: "address",
      },
    ],
    name: "PayoutAddressUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "asset",
        type: "address",
      },
      { indexed: false, internalType: "bool", name: "isPegged", type: "bool" },
      {
        indexed: false,
        internalType: "address",
        name: "rateProvider",
        type: "address",
      },
    ],
    name: "RateProviderUpdated",
    type: "event",
  },
  { anonymous: false, inputs: [], name: "Unpaused", type: "event" },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "uint16",
        name: "oldBound",
        type: "uint16",
      },
      {
        indexed: false,
        internalType: "uint16",
        name: "newBound",
        type: "uint16",
      },
    ],
    name: "UpperBoundUpdated",
    type: "event",
  },
  {
    inputs: [],
    name: "accountantState",
    outputs: [
      { internalType: "address", name: "payoutAddress", type: "address" },
      { internalType: "uint128", name: "feesOwedInBase", type: "uint128" },
      {
        internalType: "uint128",
        name: "totalSharesLastUpdate",
        type: "uint128",
      },
      { internalType: "uint96", name: "exchangeRate", type: "uint96" },
      {
        internalType: "uint16",
        name: "allowedExchangeRateChangeUpper",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "allowedExchangeRateChangeLower",
        type: "uint16",
      },
      { internalType: "uint64", name: "lastUpdateTimestamp", type: "uint64" },
      { internalType: "bool", name: "isPaused", type: "bool" },
      {
        internalType: "uint8",
        name: "minimumUpdateDelayInHours",
        type: "uint8",
      },
      { internalType: "uint16", name: "managementFee", type: "uint16" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "authority",
    outputs: [
      { internalType: "contract Authority", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "base",
    outputs: [{ internalType: "contract ERC20", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract ERC20", name: "feeAsset", type: "address" },
    ],
    name: "claimFees",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRate",
    outputs: [{ internalType: "uint256", name: "rate", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract ERC20", name: "quote", type: "address" },
    ],
    name: "getRateInQuote",
    outputs: [
      { internalType: "uint256", name: "rateInQuote", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract ERC20", name: "quote", type: "address" },
    ],
    name: "getRateInQuoteSafe",
    outputs: [
      { internalType: "uint256", name: "rateInQuote", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getRateSafe",
    outputs: [{ internalType: "uint256", name: "rate", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "contract ERC20", name: "", type: "address" }],
    name: "rateProviderData",
    outputs: [
      { internalType: "bool", name: "isPeggedToBase", type: "bool" },
      {
        internalType: "contract IRateProvider",
        name: "rateProvider",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "contract Authority",
        name: "newAuthority",
        type: "address",
      },
    ],
    name: "setAuthority",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract ERC20", name: "asset", type: "address" },
      { internalType: "bool", name: "isPeggedToBase", type: "bool" },
      { internalType: "address", name: "rateProvider", type: "address" },
    ],
    name: "setRateProviderData",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "unpause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint8",
        name: "minimumUpdateDelayInHours",
        type: "uint8",
      },
    ],
    name: "updateDelay",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint96", name: "newExchangeRate", type: "uint96" },
    ],
    name: "updateExchangeRate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint16",
        name: "allowedExchangeRateChangeLower",
        type: "uint16",
      },
    ],
    name: "updateLower",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint16", name: "managementFee", type: "uint16" }],
    name: "updateManagementFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "payoutAddress", type: "address" },
    ],
    name: "updatePayoutAddress",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint16",
        name: "allowedExchangeRateChangeUpper",
        type: "uint16",
      },
    ],
    name: "updateUpper",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "vault",
    outputs: [
      { internalType: "contract BoringVault", name: "", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
];