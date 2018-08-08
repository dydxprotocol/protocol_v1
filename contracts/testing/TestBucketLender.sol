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

import { Margin } from "../margin/Margin.sol";
import { TokenInteract } from "../lib/TokenInteract.sol";
import { BucketLender } from "../margin/external/BucketLender/BucketLender.sol";


contract TestBucketLender is BucketLender {

    uint256 SSTOREBUCKET = 0;

    constructor(
        address margin,
        bytes32 positionId,
        address heldToken,
        address owedToken,
        uint32[7] parameters,
        address[] trustedMarginCallers
    )
        public
        BucketLender(
            margin,
            positionId,
            heldToken,
            owedToken,
            parameters,
            trustedMarginCallers
        )
    {
    }


    // should return fine
    function checkInvariants()
        external
        view
    {
        uint256 cb = criticalBucket;
        uint256 principalSum = 0;
        uint256 availableSum = 0;
        uint i = 0;

        for(i = 0; (principalSum != principalTotal || availableSum != availableTotal); i++) {
            uint256 aa = availableForBucket[i];
            uint256 op = principalForBucket[i];
            require(i >= cb || aa == 0);
            require(i <= cb || op == 0);
            principalSum += op;
            availableSum += aa;
        }

        require(TokenInteract.balanceOf(OWED_TOKEN, address(this)) >= availableTotal);
        if (principalTotal > 0) {
            require(Margin(DYDX_MARGIN).getPositionPrincipal(POSITION_ID) <= principalTotal);
        }
        require(principalSum == principalTotal);
        require(availableSum == availableTotal);

        for (uint j = i; j < i + 10; j++) {
            uint256 aa = availableForBucket[i];
            uint256 op = principalForBucket[i];
            require(aa == 0 && op == 0);
        }
    }
}
