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

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";
import { PositionOwner } from "../../interfaces/owner/PositionOwner.sol";


/**
 * @title ERC20PositionCreator
 * @author dYdX
 *
 * Contains common code for ERC20ShortCreator and ERC20LongCreator
 */
contract ERC20PositionCreator is
    ReentrancyGuard,
    NoOwner,
    OnlyMargin,
    PositionOwner
{
    // ============ Events ============

    event TokenCreated(
        bytes32 indexed positionId,
        address tokenAddress
    );

    // ============ State Variables ============

    // Recipients that will fairly verify and redistribute funds from closing the position
    address[] public TRUSTED_RECIPIENTS;

    // ============ Constructor ============

    constructor(
        address margin,
        address[] trustedRecipients
    )
        public
        OnlyMargin(margin)
    {
        for (uint256 i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS.push(trustedRecipients[i]);
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Implementation of PositionOwner functionality. Creates a new ERC20Short and assigns
     * ownership to the ERC20Short. Called by Margin when a postion is transferred to this
     * contract.
     *
     * @param  from  Address of the previous owner of the position
     * @return       Address of the new ERC20Short contract
     */
    function receivePositionOwnership(
        address from,
        bytes32 positionId
    )
        external
        onlyMargin
        returns (address)
    {
        address tokenAddress = createTokenContract(
            from,
            positionId
        );

        emit TokenCreated(positionId, tokenAddress);

        return tokenAddress;
    }

    // ============ Internal Abstract Functions ============

    function createTokenContract(
        address from,
        bytes32 positionId
    )
        internal
        returns (address);
}
