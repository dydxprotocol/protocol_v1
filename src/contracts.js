/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

export { default as Margin }            from '../build/contracts/Margin.json';
export { default as Vault }             from '../build/contracts/Vault.json';
export { default as TokenProxy }        from '../build/contracts/TokenProxy.json';
export {
  default as DutchAuctionCloser
}                                       from '../build/contracts/DutchAuctionCloser.json';
export { default as SharedLoan }        from '../build/contracts/SharedLoan.json';
export { default as SharedLoanCreator } from '../build/contracts/SharedLoanCreator.json';
export { default as ERC20Position }     from '../build/contracts/ERC20Position.json';
export { default as ERC20Short }        from '../build/contracts/ERC20Short.json';
export { default as ERC20Long }         from '../build/contracts/ERC20Long.json';
export { default as ERC20ShortCreator } from '../build/contracts/ERC20ShortCreator.json';
export { default as ERC20LongCreator }  from '../build/contracts/ERC20LongCreator.json';
export { default as ERC721MarginLoan }  from '../build/contracts/ERC721MarginLoan.json';
export {
  default as ERC721MarginPosition
}                                       from '../build/contracts/ERC721MarginPosition.json';
export {
  default as ZeroExExchangeWrapper
}                                       from '../build/contracts/ZeroExExchangeWrapper.json';
export {
  default as OpenDirectlyExchangeWrapper
}                                       from '../build/contracts/OpenDirectlyExchangeWrapper.json';
export { default as ERC20 }             from '../build/contracts/ERC20.json';
export { default as TestToken }         from '../build/contracts/TestToken.json';

// Testing Contracts
export { default as TokenA }            from '../build/contracts/TokenA.json';
export { default as TokenB }            from '../build/contracts/TokenB.json';
export { default as TokenC }            from '../build/contracts/TokenC.json';
export { default as ZeroExExchange }    from '../build/contracts/ZeroExExchange.json';
export { default as ZeroExProxy }       from '../build/contracts/ZeroExProxy.json';
