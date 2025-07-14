# Boring Vault UI
A reusable package to quickly integrate boring vaults onto a UI.
Full documentation for using this package can be found at https://www.notion.so/7seascapital/Boring-Vault-UI-SDK-545da170a9f349259176fa96eb000423

# Local Pkg Development Setup
1. Clone the repository
2. Run `npm install` to install the dependencies
3. Run `npm run test` to run the tests
4. Run `npm run dev` to a local development server
5. TODO: how to compile and publish the package

Note: to use the Sui SDK you will need to install cargo and run `cargo install --locked --git https://github.com/kunalabs-io/sui-client-gen.git`
Then cd to src/sui/gen and run `sui-client-gen`
Tests can then be run with `npm run test:sui`