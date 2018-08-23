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

import BN from 'bignumber.js';
import SeedsJson from '../../build/seeds.json';

SeedsJson.positions = SeedsJson.positions.map(mapPositionFromJson);
SeedsJson.orders = SeedsJson.orders.map(mapOrderFromJson);

export default SeedsJson;

function mapPositionFromJson(jsonPosition) {
  return {
    ...jsonPosition,
    position: new BN(jsonPosition.principal),
    interestRate: new BN(jsonPosition.interestRate),
    requiredDeposit: new BN(jsonPosition.requiredDeposit),
    callTimeLimit: new BN(jsonPosition.callTimeLimit),
    callTimestamp: new BN(jsonPosition.callTimestamp),
    startTimestamp: new BN(jsonPosition.startTimestamp),
    maxDuration: new BN(jsonPosition.maxDuration),
    interestPeriod: new BN(jsonPosition.interestPeriod),
  }
}

function mapOrderFromJson(jsonOrder) {
  return {
    ...jsonOrder,
    expirationUnixTimestampSec: new BN(jsonOrder.expirationUnixTimestampSec),
    makerFee: new BN(jsonOrder.makerFee),
    salt: new BN(jsonOrder.salt),
    takerFee: new BN(jsonOrder.takerFee),
    makerTokenAmount: new BN(jsonOrder.makerTokenAmount),
    takerTokenAmount: new BN(jsonOrder.takerTokenAmount),
  };
}
