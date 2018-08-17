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

import { AddressUtils } from "openzeppelin-solidity/contracts/AddressUtils.sol";
import { Math } from "openzeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { TokenProxy } from "../TokenProxy.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { PayoutRecipient } from "../interfaces/PayoutRecipient.sol";
import { CloseLoanDelegator } from "../interfaces/lender/CloseLoanDelegator.sol";
import { ClosePositionDelegator } from "../interfaces/owner/ClosePositionDelegator.sol";


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

            TokenProxy(state.TOKEN_PROXY).transferTokens(
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
            MarginCommon.getPositionBalanceImpl(state, transaction.positionId)
            == transaction.startingHeldTokenBalance.sub(transaction.availableHeldToken)
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

    // ============ Private Helper-Functions ============

    function getApprovedAmount(
        MarginCommon.Position storage position,
        bytes32 positionId,
        uint256 requestedAmount,
        address payoutRecipient,
        bool requireLenderApproval
    )
        private
        returns (uint256)
    {
        // Ensure enough principal
        uint256 allowedAmount = Math.min256(requestedAmount, position.principal);

        // Ensure owner consent
        allowedAmount = closePositionOnBehalfOfRecurse(
            position.owner,
            msg.sender,
            payoutRecipient,
            positionId,
            allowedAmount
        );

        // Ensure lender consent
        if (requireLenderApproval) {
            allowedAmount = closeLoanOnBehalfOfRecurse(
                position.lender,
                msg.sender,
                payoutRecipient,
                positionId,
                allowedAmount
            );
        }

        assert(allowedAmount > 0);
        assert(allowedAmount <= position.principal);
        assert(allowedAmount <= requestedAmount);

        return allowedAmount;
    }

    function closePositionOnBehalfOfRecurse(
        address contractAddr,
        address closer,
        address payoutRecipient,
        bytes32 positionId,
        uint256 closeAmount
    )
        private
        returns (uint256)
    {
        // no need to ask for permission
        if (closer == contractAddr) {
            return closeAmount;
        }

        (
            address newContractAddr,
            uint256 newCloseAmount
        ) = ClosePositionDelegator(contractAddr).closeOnBehalfOf(
            closer,
            payoutRecipient,
            positionId,
            closeAmount
        );

        require(
            newCloseAmount <= closeAmount,
            "ClosePositionShared#closePositionRecurse: newCloseAmount is greater than closeAmount"
        );
        require(
            newCloseAmount > 0,
            "ClosePositionShared#closePositionRecurse: newCloseAmount is zero"
        );

        if (newContractAddr != contractAddr) {
            closePositionOnBehalfOfRecurse(
                newContractAddr,
                closer,
                payoutRecipient,
                positionId,
                newCloseAmount
            );
        }

        return newCloseAmount;
    }

    function closeLoanOnBehalfOfRecurse(
        address contractAddr,
        address closer,
        address payoutRecipient,
        bytes32 positionId,
        uint256 closeAmount
    )
        private
        returns (uint256)
    {
        // no need to ask for permission
        if (closer == contractAddr) {
            return closeAmount;
        }

        (
            address newContractAddr,
            uint256 newCloseAmount
        ) = CloseLoanDelegator(contractAddr).closeLoanOnBehalfOf(
                closer,
                payoutRecipient,
                positionId,
                closeAmount
            );

        require(
            newCloseAmount <= closeAmount,
            "ClosePositionShared#closeLoanRecurse: newCloseAmount is greater than closeAmount"
        );
        require(
            newCloseAmount > 0,
            "ClosePositionShared#closeLoanRecurse: newCloseAmount is zero"
        );

        if (newContractAddr != contractAddr) {
            closeLoanOnBehalfOfRecurse(
                newContractAddr,
                closer,
                payoutRecipient,
                positionId,
                newCloseAmount
            );
        }

        return newCloseAmount;
    }

    // ============ Parsing Functions ============

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
        private
        view
        returns (CloseTx memory)
    {
        uint256 startingHeldTokenBalance = MarginCommon.getPositionBalanceImpl(state, positionId);

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
}
