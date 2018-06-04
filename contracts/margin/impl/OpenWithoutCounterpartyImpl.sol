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

import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Vault } from "../Vault.sol";


/**
 * @title OpenWithoutCounterpartyImpl
 * @author dYdX
 *
 * This library contains the implementation for the openWithoutCounterparty
 * function of Margin
 */
library OpenWithoutCounterpartyImpl {

    // ============ Structs ============

    struct Tx {
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

    function openWithoutCounterpartyImpl(
        MarginState.State storage state,
        address[4] addresses,
        uint256[3] values256,
        uint32[4]  values32
    )
        public
        returns (bytes32)
    {
        Tx memory openTx = parseTx(
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

        doStoreNewPosition(
            state,
            openTx
        );

        return openTx.positionId;
    }

    // ============ Private Helper-Functions ============

    function doStoreNewPosition(
        MarginState.State storage state,
        Tx memory openTx
    )
        private
    {
        MarginCommon.storeNewPosition(
            state,
            openTx.positionId,
            MarginCommon.Position({
                owedToken: openTx.owedToken,
                heldToken: openTx.heldToken,
                lender: openTx.loanOwner,
                owner: openTx.positionOwner,
                principal: openTx.principal,
                requiredDeposit: 0,
                callTimeLimit: openTx.callTimeLimit,
                startTimestamp: 0,
                callTimestamp: 0,
                maxDuration: openTx.maxDuration,
                interestRate: openTx.interestRate,
                interestPeriod: openTx.interestPeriod
            }),
            msg.sender
        );
    }

    function validate(
        MarginState.State storage state,
        Tx memory openTx
    )
        private
        view
    {
        require(
            !MarginCommon.positionHasExisted(state, openTx.positionId),
            "openWithoutCounterpartyImpl#validate: positionId already exists"
        );

        require(
            openTx.principal > 0,
            "openWithoutCounterpartyImpl#validate: principal cannot be 0"
        );

        require(
            openTx.owedToken != address(0),
            "openWithoutCounterpartyImpl#validate: owedToken cannot be 0"
        );

        require(
            openTx.owedToken != openTx.heldToken,
            "openWithoutCounterpartyImpl#validate: owedToken cannot be equal to heldToken"
        );

        require(
            openTx.positionOwner != address(0),
            "openWithoutCounterpartyImpl#validate: positionOwner cannot be 0"
        );

        require(
            openTx.loanOwner != address(0),
            "openWithoutCounterpartyImpl#validate: loanOwner cannot be 0"
        );

        require(
            openTx.maxDuration > 0,
            "openWithoutCounterpartyImpl#validate: maxDuration cannot be 0"
        );

        require(
            openTx.interestPeriod <= openTx.maxDuration,
            "openWithoutCounterpartyImpl#validate: interestPeriod must be <= maxDuration"
        );
    }

    function recordPositionOpened(
        Tx memory openTx
    )
        private
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

    // ============ Parsing Functions ============

    function parseTx(
        address[4] addresses,
        uint256[3] values256,
        uint32[4]  values32
    )
        private
        view
        returns (Tx memory)
    {
        Tx memory openTx = Tx({
            positionId: MarginCommon.getPositionIdFromNonce(values256[2]),
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
