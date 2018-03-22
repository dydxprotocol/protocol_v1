<p align="center"><img src="https://dydx.exchange/images/logo.png" width="256" /></p>

<p align="center">
  <a href="https://circleci.com/gh/dydxexchange/protocol">
    <img src="https://circleci.com/gh/dydxexchange/protocol/tree/master.svg?style=svg&circle-token=5f772dae891383f1bda6e3d8745f9bbefaf1d0d9" />
  </a>
  <a href='https://coveralls.io/github/dydxexchange/protocol?branch=master'>
    <img src='https://coveralls.io/repos/github/dydxexchange/protocol/badge.svg?branch=master&amp;t=JIClRe' alt='Coverage Status' />
  </a>
</p>

Source code for Ethereum Smart Contracts used by the dYdX Protocol

[Whitepaper](https://whitepaper.dydx.exchange)

Contains implementations for:

- Short Sell
- ERC20 Short
- ERC721 Short
- Dutch Auction Short Closer
- 0x Exchange Wrapper

### Development

#### Install

```
npm install
```

#### Compile

```
npm run compile
```

#### Test

```
npm test
```
npm test will also automatically recompile if any source files have been changed

#### Lint

Lint the javascript files (tests, deploy scripts)
```
npm run lint
```


Lint the solidity files (all smart contracts)
```
npm run solint
```

## Architecture

### Contracts

##### Proxy.sol

Used to transfer user funds. Users set token allowance for the proxy authorizing it to transfer their funds. Only allows authorized contracts to transfer funds.

##### ShortSell.sol

Contains business logic for short selling. All external functions for shorting are in this contract.

##### Vault.sol

Holds all token funds. Is authorized to transfer user funds via the Proxy. Allows authorized contracts to withdraw funds.
