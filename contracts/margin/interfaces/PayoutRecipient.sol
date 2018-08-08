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


/**
 * @title PayoutRecipient
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to be the payoutRecipient in a
 * closePosition transaction.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
interface PayoutRecipient {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to receive payout from being the payoutRecipient
     * in a closePosition transaction. May redistribute any payout as necessary. Throws on error.
     *
     * @param  positionId         Unique ID of the position
     * @param  closeAmount        Amount of the position that was closed
     * @param  closer             Address of the account or contract that closed the position
     * @param  positionOwner      Address of the owner of the position
     * @param  heldToken          Address of the ERC20 heldToken
     * @param  payout             Number of tokens received from the payout
     * @param  totalHeldToken     Total amount of heldToken removed from vault during close
     * @param  payoutInHeldToken  True if payout is in heldToken, false if in owedToken
     * @return                    True if approved by the receiver
     */
    function receiveClosePositionPayout(
        bytes32 positionId,
        uint256 closeAmount,
        address closer,
        address positionOwner,
        address heldToken,
        uint256 payout,
        uint256 totalHeldToken,
        bool    payoutInHeldToken
    )
        external
        /* onlyMargin */
        returns (bool);
}
