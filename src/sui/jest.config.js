// jest.config.js
module.exports = {
  displayName: "sui",
  preset: "ts-jest/presets/default-esm",
  testTimeout: 300000, // Set timeout to 300 seconds per test
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: "./tsconfig.json" // Use the local tsconfig.json
    }]
  }
};
