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

/* eslint-disable max-len */

export { default as Margin }                            from '../../build/contracts/Margin.json';
export { default as Vault }                             from '../../build/contracts/Vault.json';
export { default as TokenProxy }                        from '../../build/contracts/TokenProxy.json';
export { default as DutchAuctionCloser }                from '../../build/contracts/DutchAuctionCloser.json';
export { default as WethPayoutRecipient }               from '../../build/contracts/WethPayoutRecipient.json';
export { default as SharedLoan }                        from '../../build/contracts/SharedLoan.json';
export { default as SharedLoanFactory }                 from '../../build/contracts/SharedLoanFactory.json';
export { default as ERC20Position }                     from '../../build/contracts/ERC20Position.json';
export { default as ERC20CappedPosition }               from '../../build/contracts/ERC20CappedPosition.json';
export { default as ERC20Short }                        from '../../build/contracts/ERC20Short.json';
export { default as ERC20CappedShort }                  from '../../build/contracts/ERC20CappedShort.json';
export { default as ERC20Long }                         from '../../build/contracts/ERC20Long.json';
export { default as ERC20CappedLong }                   from '../../build/contracts/ERC20CappedLong.json';
export { default as ERC20ShortFactory }                 from '../../build/contracts/ERC20ShortFactory.json';
export { default as ERC20LongFactory }                  from '../../build/contracts/ERC20LongFactory.json';
export { default as ERC721MarginLoan }                  from '../../build/contracts/ERC721MarginLoan.json';
export { default as AuctionProxy }                      from '../../build/contracts/AuctionProxy.json';
export { default as ERC721MarginPosition }              from '../../build/contracts/ERC721MarginPosition.json';
export { default as ZeroExV1ExchangeWrapper }           from '../../build/contracts/ZeroExV1ExchangeWrapper.json';
export { default as ZeroExV2ExchangeWrapper }           from '../../build/contracts/ZeroExV2ExchangeWrapper.json';
export { default as ZeroExV2MultiOrderExchangeWrapper } from '../../build/contracts/ZeroExV2MultiOrderExchangeWrapper.json';
export { default as OpenDirectlyExchangeWrapper }       from '../../build/contracts/OpenDirectlyExchangeWrapper.json';
export { default as SaiDaiExchangeWrapper }             from '../../build/contracts/SaiDaiExchangeWrapper.json';
export { default as OasisV3SimpleExchangeWrapper }      from '../../build/contracts/OasisV3SimpleExchangeWrapper.json';
export { default as OasisV2SimpleExchangeWrapper }      from '../../build/contracts/OasisV2SimpleExchangeWrapper.json';
export { default as OasisV1SimpleExchangeWrapper }      from '../../build/contracts/OasisV1SimpleExchangeWrapper.json';
export { default as OasisV1MatchingExchangeWrapper }    from '../../build/contracts/OasisV1MatchingExchangeWrapper.json';
export { default as ERC20 }                             from '../../build/contracts/ERC20.json';
export { default as WETH9 }                             from '../../build/contracts/WETH9.json';
export { default as PayableMarginMinter }               from '../../build/contracts/PayableMarginMinter.json';
export { default as BucketLenderFactory }               from '../../build/contracts/BucketLenderFactory.json';
export { default as EthWrapperForBucketLender }         from '../../build/contracts/EthWrapperForBucketLender.json';
export { default as BucketLenderProxy }                 from '../../build/contracts/BucketLenderProxy.json';
export { default as BucketLender }                      from '../../build/contracts/BucketLender.json';
export { default as BucketLenderWithRecoveryDelay }     from '../../build/contracts/BucketLenderWithRecoveryDelay.json';
export { default as ERC20PositionWithdrawer }           from '../../build/contracts/ERC20PositionWithdrawer.json';
export { default as ERC20PositionWithdrawerV2 }         from '../../build/contracts/ERC20PositionWithdrawerV2.json';

// Testing Contracts
export { default as TokenA }                            from '../../build/contracts/TokenA.json';
export { default as TokenB }                            from '../../build/contracts/TokenB.json';
export { default as TokenC }                            from '../../build/contracts/TokenC.json';
export { default as TestToken }                         from '../../build/contracts/TestToken.json';
