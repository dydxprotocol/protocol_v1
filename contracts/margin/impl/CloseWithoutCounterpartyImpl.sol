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

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { ClosePositionShared } from "./ClosePositionShared.sol";
import { MarginState } from "./MarginState.sol";


/**
 * @title CloseWithoutCounterpartyImpl
 * @author dYdX
 *
 * This library contains the implementation for the closeWithoutCounterpartyImpl function of
 * Margin
 */
library CloseWithoutCounterpartyImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * A position was closed or partially closed
     */
    event PositionClosed(
        bytes32 indexed positionId,
        address indexed closer,
        address indexed payoutRecipient,
        uint256 closeAmount,
        uint256 remainingAmount,
        uint256 owedTokenPaidToLender,
        uint256 payoutAmount,
        uint256 buybackCostInHeldToken,
        bool payoutInHeldToken
    );

    // ============ Public Implementation Functions ============

    function closeWithoutCounterpartyImpl(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 requestedCloseAmount,
        address payoutRecipient
    )
        public
        returns (uint256, uint256)
    {
        ClosePositionShared.CloseTx memory transaction = ClosePositionShared.createCloseTx(
            state,
            positionId,
            requestedCloseAmount,
            payoutRecipient,
            address(0),
            true,
            true
        );

        uint256 heldTokenPayout = ClosePositionShared.sendTokensToPayoutRecipient(
            state,
            transaction,
            0, // No buyback cost
            0  // Did not receive any owedToken
        );

        ClosePositionShared.closePositionStateUpdate(state, transaction);

        logEventOnCloseWithoutCounterparty(transaction);

        return (
            transaction.closeAmount,
            heldTokenPayout
        );
    }

    // ============ Private Helper-Functions ============

    function logEventOnCloseWithoutCounterparty(
        ClosePositionShared.CloseTx transaction
    )
        private
    {
        emit PositionClosed(
            transaction.positionId,
            msg.sender,
            transaction.payoutRecipient,
            transaction.closeAmount,
            transaction.originalPrincipal.sub(transaction.closeAmount),
            0,
            transaction.availableHeldToken,
            0,
            true
        );
    }
}
