# Treasure Marketplace
- Selling NFTs for a fixed price by owner
- Supports only listings with expiration date, no offers
- Stores price history on-chain
- Takes fee on sale @ 5%
- Supports ERC721 and ERC1155

## Build and test

Use Node version 14 or 16.

```sh
npm install
npm test # This performs tests and checks test coverage
```

## Contributing

Style guide

- 120 hard limit line length
- NatSpec
  - Align whitespace for tags
  - Asign whitespace for parameters
  - `@param` (and state variable `@dev`) are sentence case without capitalization for the first letter
  - Events
    - `@notice` sentence case without a period like "XXX was update"
  - Functions
    - `@notice` sentence case without a period like "Finishes a sale"
    - `@dev` sentence case with a period at end
- Follow [Solidity Style Guide](https://docs.soliditylang.org/en/v0.8.12/style-guide.html?highlight=style) where it makes sense