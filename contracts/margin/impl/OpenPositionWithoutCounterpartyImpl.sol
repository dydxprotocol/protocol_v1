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

import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { TransferInternal } from "./TransferInternal.sol";
import { Vault } from "../Vault.sol";
import { TimestampHelper } from "../../lib/TimestampHelper.sol";


/**
 * @title OpenPositionWithoutCounterpartyImpl
 * @author dYdX
 *
 * This library contains the implementation for the openPositionWithoutCounterparty
 * function of Margin
 */
library OpenPositionWithoutCounterpartyImpl {

    // ============ Structs ============

    struct OpenWithoutCounterpartyTx {
        bytes32 positionId;
        address positionOwner;
        address owedToken;
        address heldToken;
        address loanOwner;
        uint256 principal;
        uint256 deposit;
        uint32 callTimeLimit;
        uint32 maxDuration;
        uint32 interestRate;
        uint32 interestPeriod;
    }

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

    // ============ Public Implementation Functions ============

    function openPositionWithoutCounterpartyImpl(
        MarginState.State storage state,
        address[4] addresses,
        uint256[3] values256,
        uint32[4]  values32
    )
        public
        returns (bytes32)
    {
        OpenWithoutCounterpartyTx memory openTx = parseOpenWithoutCounterpartyTx(
            addresses,
            values256,
            values32
        );

        validate(
            state,
            openTx
        );

        Vault(state.VAULT).transferToVault(
            openTx.positionId,
            openTx.heldToken,
            msg.sender,
            openTx.deposit
        );

        recordPositionOpened(
            openTx
        );

        updateState(
            state,
            openTx
        );

        return openTx.positionId;
    }

    // ============ Internal Functions ============

    function validate(
        MarginState.State storage state,
        OpenWithoutCounterpartyTx memory openTx
    )
        internal
        view
    {
        require(
            !MarginCommon.containsPositionImpl(state, openTx.positionId),
            "OpenPositionWithoutCounterpartyImpl#validate: positionId already exists"
        );

        require(
            openTx.principal > 0,
            "OpenPositionWithoutCounterpartyImpl#validate: principal cannot be 0"
        );

        require(
            openTx.owedToken != address(0),
            "OpenPositionWithoutCounterpartyImpl#validate: owedToken cannot be 0"
        );

        require(
            openTx.owedToken != openTx.heldToken,
            "OpenPositionWithoutCounterpartyImpl#validate: owedToken cannot be equal to heldToken"
        );

        require(
            openTx.maxDuration > 0,
            "OpenPositionWithoutCounterpartyImpl#validate: maxDuration cannot be 0"
        );

        require(
            openTx.interestPeriod <= openTx.maxDuration,
            "OpenPositionWithoutCounterpartyImpl#validate: interestPeriod must be <= maxDuration"
        );
    }

    function recordPositionOpened(
        OpenWithoutCounterpartyTx memory openTx
    )
        internal
    {
        emit PositionOpened(
            openTx.positionId,
            msg.sender,
            msg.sender,
            bytes32(0),
            openTx.owedToken,
            openTx.heldToken,
            address(0),
            openTx.principal,
            0,
            openTx.deposit,
            openTx.interestRate,
            openTx.callTimeLimit,
            openTx.maxDuration,
            true
        );
    }

    function updateState(
        MarginState.State storage state,
        OpenWithoutCounterpartyTx memory openTx
    )
        internal
    {
        bytes32 positionId = openTx.positionId;

        state.positions[positionId].owedToken = openTx.owedToken;
        state.positions[positionId].heldToken = openTx.heldToken;
        state.positions[positionId].principal = openTx.principal;
        state.positions[positionId].callTimeLimit = openTx.callTimeLimit;
        state.positions[positionId].startTimestamp = TimestampHelper.getBlockTimestamp32();
        state.positions[positionId].maxDuration = openTx.maxDuration;
        state.positions[positionId].interestRate = openTx.interestRate;
        state.positions[positionId].interestPeriod = openTx.interestPeriod;

        bool newLender = openTx.loanOwner != msg.sender;
        bool newOwner = openTx.positionOwner != msg.sender;

        state.positions[positionId].lender = TransferInternal.grantLoanOwnership(
            positionId,
            newLender ? msg.sender : address(0),
            openTx.loanOwner);

        state.positions[positionId].owner = TransferInternal.grantPositionOwnership(
            positionId,
            newOwner ? msg.sender : address(0),
            openTx.positionOwner);
    }

    // ============ Parsing Functions ============

    function parseOpenWithoutCounterpartyTx(
        address[4] addresses,
        uint256[3] values256,
        uint32[4]  values32
    )
        internal
        view
        returns (OpenWithoutCounterpartyTx memory)
    {
        OpenWithoutCounterpartyTx memory openTx = OpenWithoutCounterpartyTx({
            positionId: keccak256(
                msg.sender,
                values256[2] // nonce
            ),
            positionOwner: addresses[0],
            owedToken: addresses[1],
            heldToken: addresses[2],
            loanOwner: addresses[3],
            principal: values256[0],
            deposit: values256[1],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            interestRate: values32[2],
            interestPeriod: values32[3]
        });

        return openTx;
    }
}
