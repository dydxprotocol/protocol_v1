<p align="center"><img src="https://dydx.exchange/images/logo.png" width="256" /></p>

<p align="center">
  <a href="https://circleci.com/gh/AntonioJuliano/dydx-contracts">
    <img src="https://circleci.com/gh/AntonioJuliano/dydx-contracts.svg?&style=shield&circle-token=5f772dae891383f1bda6e3d8745f9bbefaf1d0d9" />
  </a>
</p>

Source code for Ethereum Smart Contracts used by the dYdX Protocol

[Whitepaper](https://whitepaper.dydx.exchange)

Contains implementations for:

- Short Sell
- Covered Option
- Custom 0x Exchange

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
npm run testrpc
npm test
```
Teestrpc will need to run in a separate terminal.
npm test will also automatically recompile if any source files have been changed

## Architecture

### Contracts

##### Proxy.sol

Used to transfer user funds. Users set token allowance for the proxy authoizing it to transfer their funds. Only allows authoized contracts to transfer funds.

##### ShortSell.sol

Contains business logic for short selling. All external functions for shorting are in this contract. This contract doesn't hold any of the short sell state, but is authorized to write to the contracts which hold state and transfer user funds.

##### ShortSellRepo.sol

Contains state for short sells. Holds a map of short id to short struct. Only writable to by authorized addresses.

##### Vault.sol

Holds all token funds. Is authorized to transfer user funds via the Proxy. Allows authoized contracts to withdraw funds.

##### Trader.sol

Responsible for trading tokens out of vault. Uses exchange contract. Abstracts trading logic out of Vault

##### DerivativeCreator.sol

Creates standard derivatives contracts. Currently creates all CoveredOption contracts

##### CoveredOption.sol

Implements the dYdX options protocol. Allows options to be written, exercised, and traded. Each options contract is its own ERC20 token.

##### Exchange.sol

Generalized version of a 0x Exchange contract. Allows tokens to be traded as per 0x protocol with fees paid in any user defined token.

## Useful Links

- [Solidity](http://solidity.readthedocs.io/en/develop/)
- [Truffle](http://truffleframework.com/docs/)
- [Hitchhiker’s Guide to Smart Contracts](https://blog.zeppelin.solutions/the-hitchhikers-guide-to-smart-contracts-in-ethereum-848f08001f05)
