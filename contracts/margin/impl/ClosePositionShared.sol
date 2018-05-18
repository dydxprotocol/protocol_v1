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

pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Proxy } from "../Proxy.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { CloseLoanDelegator } from "../interfaces/lender/CloseLoanDelegator.sol";
import { ClosePositionDelegator } from "../interfaces/owner/ClosePositionDelegator.sol";
import { PayoutRecipient } from "../interfaces/PayoutRecipient.sol";


/**
 * @title ClosePositionShared
 * @author dYdX
 *
 * This library contains shared functionality between ClosePositionImpl and
 * CloseWithoutCounterpartyImpl
 */
library ClosePositionShared {
    using SafeMath for uint256;

    // ============ Structs ============

    struct CloseTx {
        bytes32 positionId;
        uint256 originalPrincipal;
        uint256 closeAmount;
        uint256 owedTokenOwed;
        uint256 startingHeldTokenBalance;
        uint256 availableHeldToken;
        address payoutRecipient;
        address owedToken;
        address heldToken;
        address positionOwner;
        address positionLender;
        address exchangeWrapper;
        bool    payoutInHeldToken;
    }

    // ============ Internal Implementation Functions ============

    function closePositionStateUpdate(
        MarginState.State storage state,
        CloseTx memory transaction
    )
        internal
    {
        // Delete the position, or just decrease the principal
        if (transaction.closeAmount == transaction.originalPrincipal) {
            MarginCommon.cleanupPosition(state, transaction.positionId);
        } else {
            assert(
                transaction.originalPrincipal == state.positions[transaction.positionId].principal
            );
            state.positions[transaction.positionId].principal =
                transaction.originalPrincipal.sub(transaction.closeAmount);
        }
    }

    function sendTokensToPayoutRecipient(
        MarginState.State storage state,
        ClosePositionShared.CloseTx memory transaction,
        uint256 buybackCostInHeldToken,
        uint256 receivedOwedToken
    )
        internal
        returns (uint256)
    {
        uint256 payout;

        if (transaction.payoutInHeldToken) {
            // Send remaining heldToken to payoutRecipient
            payout = transaction.availableHeldToken.sub(buybackCostInHeldToken);

            Vault(state.VAULT).transferFromVault(
                transaction.positionId,
                transaction.heldToken,
                transaction.payoutRecipient,
                payout
            );
        } else {
            assert(transaction.exchangeWrapper != address(0));

            payout = receivedOwedToken.sub(transaction.owedTokenOwed);

            Proxy(state.PROXY).transferTokens(
                transaction.owedToken,
                transaction.exchangeWrapper,
                transaction.payoutRecipient,
                payout
            );
        }

        if (AddressUtils.isContract(transaction.payoutRecipient)) {
            require(
                PayoutRecipient(transaction.payoutRecipient).receiveClosePositionPayout(
                    transaction.positionId,
                    transaction.closeAmount,
                    msg.sender,
                    transaction.positionOwner,
                    transaction.heldToken,
                    payout,
                    transaction.availableHeldToken,
                    transaction.payoutInHeldToken
                ),
                "ClosePositionShared#sendTokensToPayoutRecipient: Payout recipient does not consent"
            );
        }

        // The ending heldToken balance of the vault should be the starting heldToken balance
        // minus the available heldToken amount
        assert(
            Vault(state.VAULT).balances(transaction.positionId, transaction.heldToken)
            == transaction.startingHeldTokenBalance.sub(transaction.availableHeldToken)
        );

        // There should be no owed token locked in the position
        assert(
            Vault(state.VAULT).balances(transaction.positionId, transaction.owedToken) == 0
        );

        return payout;
    }

    function createCloseTx(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 requestedAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInHeldToken,
        bool isWithoutCounterparty
    )
        internal
        returns (CloseTx memory)
    {
        // Validate
        require(
            payoutRecipient != address(0),
            "ClosePositionShared#createCloseTx: Payout recipient cannot be 0"
        );
        require(
            requestedAmount > 0,
            "ClosePositionShared#createCloseTx: Requested close amount cannot be 0"
        );

        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        uint256 closeAmount = getApprovedAmount(
            position,
            positionId,
            requestedAmount,
            payoutRecipient,
            isWithoutCounterparty
        );

        return parseCloseTx(
            state,
            position,
            positionId,
            closeAmount,
            payoutRecipient,
            exchangeWrapper,
            payoutInHeldToken,
            isWithoutCounterparty
        );
    }

    function parseCloseTx(
        MarginState.State storage state,
        MarginCommon.Position storage position,
        bytes32 positionId,
        uint256 closeAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInHeldToken,
        bool isWithoutCounterparty
    )
        internal
        view
        returns (CloseTx memory)
    {
        uint256 startingHeldTokenBalance = Vault(state.VAULT).balances(
            positionId,
            position.heldToken
        );
        uint256 availableHeldToken = MathHelpers.getPartialAmount(
            closeAmount,
            position.principal,
            startingHeldTokenBalance
        );
        uint256 owedTokenOwed = 0;

        if (!isWithoutCounterparty) {
            owedTokenOwed = MarginCommon.calculateOwedAmount(
                position,
                closeAmount,
                block.timestamp
            );
        }

        return CloseTx({
            positionId: positionId,
            originalPrincipal: position.principal,
            closeAmount: closeAmount,
            owedTokenOwed: owedTokenOwed,
            startingHeldTokenBalance: startingHeldTokenBalance,
            availableHeldToken: availableHeldToken,
            payoutRecipient: payoutRecipient,
            owedToken: position.owedToken,
            heldToken: position.heldToken,
            positionOwner: position.owner,
            positionLender: position.lender,
            exchangeWrapper: exchangeWrapper,
            payoutInHeldToken: payoutInHeldToken
        });
    }

    function getApprovedAmount(
        MarginCommon.Position storage position,
        bytes32 positionId,
        uint256 requestedAmount,
        address payoutRecipient,
        bool requireLenderApproval
    )
        internal
        returns (uint256)
    {
        uint256 newAmount = Math.min256(requestedAmount, position.principal);

        // If not the owner, requires owner to approve msg.sender
        if (position.owner != msg.sender) {
            uint256 allowedOwnerAmount =
                ClosePositionDelegator(position.owner).closeOnBehalfOf(
                    msg.sender,
                    payoutRecipient,
                    positionId,
                    newAmount
                );
            require(
                allowedOwnerAmount <= newAmount,
                "ClosePositionShared#getApprovedAmount: Invalid closeOnBehalfOf amount"
            );
            newAmount = allowedOwnerAmount;
        }

        // If not the lender, requires lender to approve msg.sender
        if (requireLenderApproval && position.lender != msg.sender) {
            uint256 allowedLenderAmount =
                CloseLoanDelegator(position.lender).closeLoanOnBehalfOf(
                    msg.sender,
                    payoutRecipient,
                    positionId,
                    newAmount
                );
            require(
                allowedLenderAmount <= newAmount,
                "ClosePositionShared#getApprovedAmount: Invalid closeLoanOnBehalfOf amount"
            );
            newAmount = allowedLenderAmount;
        }

        require(
            newAmount > 0,
            "ClosePositionShared#getApprovedAmount: 0 approved amount"
        );
        assert(newAmount <= position.principal);
        assert(newAmount <= requestedAmount);
        return newAmount;
    }
}
