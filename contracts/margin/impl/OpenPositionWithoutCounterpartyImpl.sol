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
        address positionOwner;
        address owedToken;
        address heldToken;
        address loanOwner;
        uint256 principal;
        uint256 deposit;
        uint256 nonce;
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

        bytes32 positionId = keccak256(
            msg.sender,
            openTx.nonce
        );

        validate(
            state,
            openTx,
            positionId
        );

        Vault(state.VAULT).transferToVault(
            positionId,
            openTx.heldToken,
            msg.sender,
            openTx.deposit
        );

        recordPositionOpened(
            openTx,
            positionId
        );

        updateState(
            state,
            openTx,
            positionId
        );

        return positionId;
    }

    // ============ Internal Functions ============

    function validate(
        MarginState.State storage state,
        OpenWithoutCounterpartyTx memory openTx,
        bytes32 positionId
    )
        internal
        view
    {
        require(!MarginCommon.containsPositionImpl(state, positionId));
        require(openTx.principal > 0);
        require(openTx.owedToken != address(0));
    }

    function recordPositionOpened(
        OpenWithoutCounterpartyTx memory openTx,
        bytes32 positionId
    )
        internal
    {
        emit PositionOpened(
            positionId,
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
        OpenWithoutCounterpartyTx memory openTx,
        bytes32 positionId
    )
        internal
    {
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
        pure
        returns (OpenWithoutCounterpartyTx memory)
    {
        OpenWithoutCounterpartyTx memory openTx = OpenWithoutCounterpartyTx({
            positionOwner: addresses[0],
            owedToken: addresses[1],
            heldToken: addresses[2],
            loanOwner: addresses[3],
            principal: values256[0],
            deposit: values256[1],
            nonce: values256[2],
            callTimeLimit: values32[0],
            maxDuration: values32[1],
            interestRate: values32[2],
            interestPeriod: values32[3]
        });
    }
}
