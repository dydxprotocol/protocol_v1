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

import { BucketLender } from "./BucketLender.sol";


/**
 * @title BucketLenderFactory
 * @author dYdX
 *
 * Contract that allows anyone to deploy a BucketLender contract by sending a transaction.
 */
contract BucketLenderFactory {

    // ============ Events ============

    event BucketLenderCreated(
        address indexed creator,
        address indexed owner,
        bytes32 indexed positionId,
        address at
    );

    // ============ State Variables ============

    // Address of the Margin contract for the dYdX Margin Trading Protocol
    address public DYDX_MARGIN;

    // ============ Constructor ============

    constructor(
        address margin
    )
        public
    {
        DYDX_MARGIN = margin;
    }

    // ============ Public Functions ============

    /**
     * Deploy a new BucketLender contract to the blockchain
     *
     * @param  positionId     Unique ID of the position
     * @param  owner          Address to which ownership of the BucketLender will be transferred
     * @param  heldToken      Address of the token held in the position as collateral
     * @param  owedToken      Address of the token being lent by the BucketLender
     * @param  parameters     Values corresponding to:
     *
     *  [0] = number of seconds per bucket
     *  [1] = interest rate
     *  [2] = interest period
     *  [3] = maximum loan duration
     *  [4] = margin-call timelimit
     *  [5] = numerator of minimum heldToken-per-owedToken
     *  [6] = denominator of minimum heldToken-per-owedToken
     *
     * @param  marginCallers  Accounts that are permitted to margin-call positions (or cancel the margin call)
     * @return                The address of the new BucketLender contract
     */
    function createBucketLender(
        bytes32 positionId,
        address owner,
        address heldToken,
        address owedToken,
        uint32[7] parameters,
        address[] marginCallers,
        address[] withdrawers
    )
        external
        returns (address)
    {
        address newBucketLender = new BucketLender(
            DYDX_MARGIN,
            positionId,
            heldToken,
            owedToken,
            parameters,
            marginCallers,
            withdrawers
        );

        BucketLender(newBucketLender).transferOwnership(owner);

        emit BucketLenderCreated(
            msg.sender,
            owner,
            positionId,
            newBucketLender
        );

        return newBucketLender;
    }
}
