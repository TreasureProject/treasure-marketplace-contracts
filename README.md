# Treasure Marketplace

-   Selling NFTs for a fixed price by owner
-   Supports only listings with expiration date, no offers
-   Stores price history on-chain
-   Takes fee on sale @ 5%
-   Supports ERC721 and ERC1155

## Build and test

Use Node version 20 or higher.

```sh
pnpm install
pnpm test # This performs tests and checks test coverage
```

## Deployment on Treasure Chains

```
pnpm hardhat deploy --network treasureMainnet --deploy-scripts deploy/treasureMainnet --tags treasure-marketplace
```

## Deployment

Check settings for `fee`, `feeRecipient`, `newOwner`, `newProxyOwner` and `nftApprovedList` in `TreasureMarketplace.deploy.ts`.

Run

```
npx hardhat deploy --network <network>
```

Confirm on-chain values in deployed contracts for `fee`, `feeRecipient`, `newOwner`, `newProxyOwner` and `nftApprovedList`.

Make sure that ownership of deployment wallet has been renounced.

## Verifications for ZkSync

Verification for ZkSync is done by OZ hardhat-upgrades plugin, see the [docs](https://docs.openzeppelin.com/upgrades-plugins/1.x/api-hardhat-upgrades#verify).

## Contributing

Style guide

-   120 hard limit line length
-   Function parameters start with an underscore (\_)
-   NatSpec
    -   Align whitespace for tags
    -   Align whitespace for `@param`s
    -   `@param` (and state variable `@dev`) are sentence case without capitalization for the first letter
    -   Events
        -   `@notice` sentence case without a period like "XXX was update"
    -   Functions
        -   `@notice` sentence case without a period like "Finishes a sale"
        -   `@dev` sentence case with a period at end
-   Follow [Solidity Style Guide](https://docs.soliditylang.org/en/v0.8.12/style-guide.html?highlight=style) where it makes sense
