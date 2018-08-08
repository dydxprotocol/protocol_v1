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

import { MarginCommon } from "./MarginCommon.sol";


/**
 * @title MarginState
 * @author dYdX
 *
 * Contains state for the Margin contract. Also used by libraries that implement Margin functions.
 */
library MarginState {
    struct State {
        // Address of the Vault contract
        address VAULT;

        // Address of the TokenProxy contract
        address TOKEN_PROXY;

        // Mapping from loanHash -> amount, which stores the amount of a loan which has
        // already been filled.
        mapping (bytes32 => uint256) loanFills;

        // Mapping from loanHash -> amount, which stores the amount of a loan which has
        // already been canceled.
        mapping (bytes32 => uint256) loanCancels;

        // Mapping from positionId -> Position, which stores all the open margin positions.
        mapping (bytes32 => MarginCommon.Position) positions;

        // Mapping from positionId -> bool, which stores whether the position has previously been
        // open, but is now closed.
        mapping (bytes32 => bool) closedPositions;

        // Mapping from positionId -> uint256, which stores the total amount of owedToken that has
        // ever been repaid to the lender for each position. Does not reset.
        mapping (bytes32 => uint256) totalOwedTokenRepaidToLender;
    }
}
