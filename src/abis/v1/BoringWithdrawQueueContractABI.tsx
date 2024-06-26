export default [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "AtomicQueue__RequestDeadlineExceeded",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "AtomicQueue__UserNotInSolve",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "AtomicQueue__UserRepeated",
    type: "error",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "AtomicQueue__ZeroOfferAmount",
    type: "error",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "offerToken",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "wantToken",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "offerAmountSpent",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "wantAmountReceived",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "AtomicRequestFulfilled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: "address",
        name: "user",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "offerToken",
        type: "address",
      },
      {
        indexed: false,
        internalType: "address",
        name: "wantToken",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "minPrice",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "timestamp",
        type: "uint256",
      },
    ],
    name: "AtomicRequestUpdated",
    type: "event",
  },
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "contract ERC20", name: "offer", type: "address" },
      { internalType: "contract ERC20", name: "want", type: "address" },
    ],
    name: "getUserAtomicRequest",
    outputs: [
      {
        components: [
          { internalType: "uint64", name: "deadline", type: "uint64" },
          { internalType: "uint88", name: "atomicPrice", type: "uint88" },
          { internalType: "uint96", name: "offerAmount", type: "uint96" },
          { internalType: "bool", name: "inSolve", type: "bool" },
        ],
        internalType: "struct AtomicQueue.AtomicRequest",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract ERC20", name: "offer", type: "address" },
      { internalType: "address", name: "user", type: "address" },
      {
        components: [
          { internalType: "uint64", name: "deadline", type: "uint64" },
          { internalType: "uint88", name: "atomicPrice", type: "uint88" },
          { internalType: "uint96", name: "offerAmount", type: "uint96" },
          { internalType: "bool", name: "inSolve", type: "bool" },
        ],
        internalType: "struct AtomicQueue.AtomicRequest",
        name: "userRequest",
        type: "tuple",
      },
    ],
    name: "isAtomicRequestValid",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract ERC20", name: "offer", type: "address" },
      { internalType: "contract ERC20", name: "want", type: "address" },
      { internalType: "address[]", name: "users", type: "address[]" },
      { internalType: "bytes", name: "runData", type: "bytes" },
      { internalType: "address", name: "solver", type: "address" },
    ],
    name: "solve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract ERC20", name: "offer", type: "address" },
      { internalType: "contract ERC20", name: "want", type: "address" },
      {
        components: [
          { internalType: "uint64", name: "deadline", type: "uint64" },
          { internalType: "uint88", name: "atomicPrice", type: "uint88" },
          { internalType: "uint96", name: "offerAmount", type: "uint96" },
          { internalType: "bool", name: "inSolve", type: "bool" },
        ],
        internalType: "struct AtomicQueue.AtomicRequest",
        name: "userRequest",
        type: "tuple",
      },
    ],
    name: "updateAtomicRequest",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "contract ERC20", name: "", type: "address" },
      { internalType: "contract ERC20", name: "", type: "address" },
    ],
    name: "userAtomicRequest",
    outputs: [
      { internalType: "uint64", name: "deadline", type: "uint64" },
      { internalType: "uint88", name: "atomicPrice", type: "uint88" },
      { internalType: "uint96", name: "offerAmount", type: "uint96" },
      { internalType: "bool", name: "inSolve", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract ERC20", name: "offer", type: "address" },
      { internalType: "contract ERC20", name: "want", type: "address" },
      { internalType: "address[]", name: "users", type: "address[]" },
    ],
    name: "viewSolveMetaData",
    outputs: [
      {
        components: [
          { internalType: "address", name: "user", type: "address" },
          { internalType: "uint8", name: "flags", type: "uint8" },
          { internalType: "uint256", name: "assetsToOffer", type: "uint256" },
          { internalType: "uint256", name: "assetsForWant", type: "uint256" },
        ],
        internalType: "struct AtomicQueue.SolveMetaData[]",
        name: "metaData",
        type: "tuple[]",
      },
      { internalType: "uint256", name: "totalAssetsForWant", type: "uint256" },
      { internalType: "uint256", name: "totalAssetsToOffer", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
];
