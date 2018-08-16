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

import { WETH9 } from "canonical-weth/contracts/WETH9.sol";
import { PayoutRecipient } from "../../interfaces/PayoutRecipient.sol";


/**
 * @title WethPayoutRecipient
 * @author dYdX
 *
 * Contract that allows a closer to payout W-ETH to this contract, which will unwrap it and send it
 * to the closer.
 */
contract WethPayoutRecipient is
    PayoutRecipient
{
    // ============ Constants ============

    address public WETH;

    // ============ Constructor ============

    constructor(
        address weth
    )
        public
    {
        WETH = weth;
    }

    // ============ Public Functions ============

    /**
     * Fallback function. Disallows ether to be sent to this contract without data except when
     * unwrapping WETH.
     */
    function ()
        external
        payable
    {
        require( // coverage-disable-line
            msg.sender == WETH,
            "WethPayoutRecipient#fallback: Cannot recieve ETH directly unless unwrapping WETH"
        );
    }

    /**
     * Function to implement the PayoutRecipient interface.
     */
    function receiveClosePositionPayout(
        bytes32 /* positionId */ ,
        uint256 /* closeAmount */,
        address closer,
        address /* positionOwner */,
        address /* heldToken */,
        uint256 payout,
        uint256 /* totalHeldToken */,
        bool    /* payoutInHeldToken */
    )
        external
        returns (bool)
    {
        WETH9(WETH).withdraw(payout);
        closer.transfer(payout);

        return true;
    }
}
