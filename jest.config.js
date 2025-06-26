// jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  projects: [
    '<rootDir>/jest.config.js',
    '<rootDir>/src/sui/jest.config.ts',
  ],
};
