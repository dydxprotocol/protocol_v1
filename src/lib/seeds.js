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

import BigNumber from 'bignumber.js';
import SeedsJson from '../../build/seeds.json';

SeedsJson.positions = SeedsJson.positions.map(mapPositionFromJson);
SeedsJson.orders = SeedsJson.orders.map(mapOrderFromJson);

export default SeedsJson;

function mapPositionFromJson(jsonPosition) {
  return {
    ...jsonPosition,
    principal: new BigNumber(jsonPosition.principal),
    interestRate: new BigNumber(jsonPosition.interestRate),
    requiredDeposit: new BigNumber(jsonPosition.requiredDeposit),
    callTimeLimit: new BigNumber(jsonPosition.callTimeLimit),
    callTimestamp: new BigNumber(jsonPosition.callTimestamp),
    startTimestamp: new BigNumber(jsonPosition.startTimestamp),
    maxDuration: new BigNumber(jsonPosition.maxDuration),
    interestPeriod: new BigNumber(jsonPosition.interestPeriod),
    balance: new BigNumber(jsonPosition.balance),
  }
}

function mapOrderFromJson(jsonOrder) {
  return {
    ...jsonOrder,
    expirationUnixTimestampSec: new BigNumber(jsonOrder.expirationUnixTimestampSec),
    makerFee: new BigNumber(jsonOrder.makerFee),
    salt: new BigNumber(jsonOrder.salt),
    takerFee: new BigNumber(jsonOrder.takerFee),
    makerTokenAmount: new BigNumber(jsonOrder.makerTokenAmount),
    takerTokenAmount: new BigNumber(jsonOrder.takerTokenAmount),
  };
}
