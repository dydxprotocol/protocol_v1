<p align="center"><img src="https://s3.amazonaws.com/dydx-assets/logo_large_white.png" width="256" /></p>

<p align="center">
  <a href="https://circleci.com/gh/dydxprotocol/workflows/protocol_v1/tree/master">
    <img src="https://img.shields.io/circleci/project/github/dydxprotocol/protocol_v1.svg" alt='CI' />
  </a>
  <a href='https://coveralls.io/github/dydxprotocol/protocol'>
    <img src='https://coveralls.io/repos/github/dydxprotocol/protocol/badge.svg?branch=master' alt='Coverage Status' />
  </a>
  <a href='https://github.com/dydxprotocol/protocol/blob/master/LICENSE'>
    <img src='https://img.shields.io/github/license/dydxprotocol/protocol.svg?longCache=true' alt='License' />
  </a>
  <a href='https://www.npmjs.com/package/@dydxprotocol/protocol'>
    <img src='https://img.shields.io/npm/v/@dydxprotocol/protocol.svg' alt='NPM' />
  </a>
  <a href='https://store.docker.com/community/images/dydxprotocol/protocol/tags'>
    <img src='https://img.shields.io/badge/docker-container-blue.svg?logo=docker&longCache=true' alt='Docker' />
  </a>
  <a href='https://slack.dydx.exchange/'>
    <img src='https://img.shields.io/badge/chat-on%20slack-brightgreen.svg?longCache=true' alt='Slack' />
  </a>
</p>

**DEPRECATED see our new protocol [here](https://github.com/dydxprotocol/solo)**

Source code for Ethereum Smart Contracts used by the dYdX Margin Trading Protocol

[Whitepaper](https://whitepaper.dydx.exchange)

[Short & Leveraged Long Tokens Whitepaper](https://margintokens.dydx.exchange)

## Npm Package

The npm package contains the deployed addresses of the contracts, and also allows access to seed positions and orders on the docker test container

#### Install

```
npm install --save @dydxprotocol/protocol
```

#### Contracts

```javascript
import { Margin as MarginContract } from '@dydxprotocol/protocol';
import truffleContract from 'truffle-contract';

async function openPosition(provider, networkId) {
  const Margin = truffleContract(MarginContract);

  Margin.setProvider(provider);
  Margin.setNetwork(networkId);

  const margin = await Margin.deployed();

  await margin.openPosition(...);
}
```

#### Seed Positions / Orders

Seed positions are available and already deployed on the docker container

```javascript
import { seeds } from '@dydxprotocol/protocol';

const position = seeds.positions[2];

console.log(position.id);
console.log(position.isTokenized);

// Test 0x V1 orders. Maker already has balance and allowance set
const order = seeds.orders[1];

console.log(order.maker);
```

#### Snapshotting

When using the docker container, you can reset the evm to the default state. This can be useful when running automated test suites

```javascript
import { resetEVM } from '@dydxprotocol/protocol';

await resetEVM(web3.currentProvider);
```

## Docker Container

[Docker container](https://store.docker.com/community/images/dydxprotocol/protocol/tags) with a a deployed version of the protocol running on a ganache-cli node with network_id = 1212. Docker container versions correspond to npm versions of this package, so use the same version for both

```
docker pull dydxprotocol/protocol
docker run dydxprotocol/protocol
```

#### Docker Compose

```
# docker-compose.yml

version: '3'
services:
  protocol:
    image: dydxprotocol/protocol:latest
    ports:
      - 8545:8545
```

## Development

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

#### Lint

Lint the javascript files (tests, deploy scripts)
```
npm run lint
```


Lint the solidity files (all smart contracts)
```
npm run solint
```

Lint the solidity files (custom dYdX linter)
```
npm run dydxlint
```

## Architecture

### Contracts

#### Base Protocol

##### Margin.sol

Contains business logic for margin trading. All external functions for margin trading are in this contract.

##### TokenProxy.sol

Used to transfer user funds. Users set token allowance for the proxy authorizing it to transfer their funds. Only allows authorized contracts to transfer funds.

##### Vault.sol

Holds all token funds. Is authorized to transfer user funds via the TokenProxy. Allows authorized contracts to withdraw funds.

#### Second Layer

##### ZeroExV1ExchangeWrapper.sol

Allows positions to be opened or closed using 0x orders. Wraps the 0x Exchange Contract in a standard interface usable by Margin.

##### ERC20Short.sol

Allows short positions to be tokenized as ERC20 tokens. Ownership of a short token grants ownership of a proportional piece of the backing position.

##### ERC20Long.sol

Allows leveraged long positions to be tokenized as ERC20 tokens. Ownership of a leveraged long token grants ownership of a proportional piece of the backing position.

##### ERC721Position.sol

Allows margin positions to be represented as ERC721 tokens.

##### ERC721MarginLoan.sol

Allows loans to be represented as ERC721 tokens.

##### DutchAuctionCloser.sol

Allows margin positions to be automatically close via a dutch auction.

##### SharedLoan.sol

Allows multiple lenders to share in a loan position together.

_Read more about our smart contract architecture [here](https://docs.google.com/document/d/19mc4Jegby5o2IPkhrR2QawNmE45NMYVL6U23YygEfts/edit?usp=sharing)_
