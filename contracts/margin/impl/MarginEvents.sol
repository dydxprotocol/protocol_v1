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
 * @title MarginEvents
 * @author dYdX
 *
 * Contains events for the Margin contract.
 *
 * NOTE: Any Margin function libraries that use events will need to both define the event here
 *       and copy the event into the library itself as libraries don't support sharing events
 */
contract MarginEvents {
    // ============ Events ============

    /**
     * A position was opened
     */
    event PositionOpened(
        bytes32 indexed positionId,
        address indexed trader,
        address indexed lender,
        bytes32 loanHash,
        address owedToken,
        address heldToken,
        address loanFeeRecipient,
        uint256 principal,
        uint256 heldTokenFromSell,
        uint256 depositAmount,
        uint256 interestRate,
        uint32  callTimeLimit,
        uint32  maxDuration,
        bool    depositInHeldToken
    );

    /*
     * A position was increased
     */
    event PositionIncreased(
        bytes32 indexed positionId,
        address indexed trader,
        address indexed lender,
        address positionOwner,
        address loanOwner,
        bytes32 loanHash,
        address loanFeeRecipient,
        uint256 amountBorrowed,
        uint256 principalAdded,
        uint256 heldTokenFromSell,
        uint256 depositAmount,
        bool    depositInHeldToken
    );

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

    /**
     * Collateral for a position was forcibly recovered
     */
    event CollateralForceRecovered(
        bytes32 indexed positionId,
        address indexed recipient,
        uint256 amount
    );

    /**
     * A position was margin-called
     */
    event MarginCallInitiated(
        bytes32 indexed positionId,
        address indexed lender,
        address indexed owner,
        uint256 requiredDeposit
    );

    /**
     * A margin call was canceled
     */
    event MarginCallCanceled(
        bytes32 indexed positionId,
        address indexed lender,
        address indexed owner,
        uint256 depositAmount
    );

    /**
     * A loan offering was canceled before it was used. Any amount less than the
     * total for the loan offering can be canceled.
     */
    event LoanOfferingCanceled(
        bytes32 indexed loanHash,
        address indexed payer,
        address indexed feeRecipient,
        uint256 cancelAmount
    );

    /**
     * Additional collateral for a position was posted by the owner
     */
    event AdditionalCollateralDeposited(
        bytes32 indexed positionId,
        uint256 amount,
        address depositor
    );

    /**
     * Ownership of a loan was transferred to a new address
     */
    event LoanTransferred(
        bytes32 indexed positionId,
        address indexed from,
        address indexed to
    );

    /**
     * Ownership of a position was transferred to a new address
     */
    event PositionTransferred(
        bytes32 indexed positionId,
        address indexed from,
        address indexed to
    );
}
