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

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { Margin } from "../../Margin.sol";
import { MarginCommon } from "../../impl/MarginCommon.sol";


/**
 * @title MarginHelper
 * @author dYdX
 *
 * This library contains helper functions for interacting with Margin
 */
library MarginHelper {
    function getPosition(
        address DYDX_MARGIN,
        bytes32 positionId
    )
        internal
        view
        returns (MarginCommon.Position memory)
    {
        (
            address[4] memory addresses,
            uint256[2] memory values256,
            uint32[6]  memory values32
        ) = Margin(DYDX_MARGIN).getPosition(positionId);

        return MarginCommon.Position({
            owedToken: addresses[0],
            heldToken: addresses[1],
            lender: addresses[2],
            owner: addresses[3],
            principal: values256[0],
            requiredDeposit: values256[1],
            callTimeLimit: values32[0],
            startTimestamp: values32[1],
            callTimestamp: values32[2],
            maxDuration: values32[3],
            interestRate: values32[4],
            interestPeriod: values32[5]
        });
    }
}
