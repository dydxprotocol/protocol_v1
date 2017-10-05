# dYdX Smart Contracts

Source code for Ethereum Smart Contracts used by the dYdX standard

[Whitepaper](https://whitepaper.dydx.exchange)

Contains implementations for:

- covered option
- short sell
- custom 0x exchange

### Development

Install

```
npm install
npm install -g truffle
npm install -g ethereumjs-testrpc
```

Compile

```
truffle compile
```

Test
```
truffle test
```

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

##### DerivativeCreator.sol

Creates standard derivatives contracts. Currently creates all CoveredOption contracts

##### CoveredOption.sol

Implements the dYdX options protocol. Allows options to be written, exercised, and traded. Each options contract is its own ERC20 token.

##### Exchange.sol

Generalized version of a 0x Exchange contract. Allows tokens to be traded as per 0x protocol.

## Useful Links

- [Solidity](http://solidity.readthedocs.io/en/develop/)
- [Truffle](http://truffleframework.com/docs/)
- [Hitchhiker’s Guide to Smart Contracts](https://blog.zeppelin.solutions/the-hitchhikers-guide-to-smart-contracts-in-ethereum-848f08001f05)
