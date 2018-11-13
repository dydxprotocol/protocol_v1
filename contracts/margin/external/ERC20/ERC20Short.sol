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

import { Math } from "openzeppelin-solidity/contracts/math/Math.sol";
import { DetailedERC20 } from "openzeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { ERC20Position } from "./ERC20Position.sol";
import { Margin } from "../../Margin.sol";
import { StringHelpers } from "../../../lib/StringHelpers.sol";


/**
 * @title ERC20Short
 * @author dYdX
 *
 * Contract used to tokenize short positions and allow them to be used as ERC20-compliant
 * tokens. Holding the tokens allows the holder to close a piece of the short position, or be
 * entitled to some amount of heldTokens after settlement.
 *
 * The total supply of short tokens is always exactly equal to the amount of principal in
 * the backing position
 */
contract ERC20Short is ERC20Position {
    constructor(
        bytes32 positionId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients,
        address[] trustedWithdrawers
    )
        public
        ERC20Position(
            positionId,
            margin,
            initialTokenHolder,
            trustedRecipients,
            trustedWithdrawers
        )
    {}

    // ============ Public Constant Functions ============

    function decimals()
        external
        view
        returns (uint8)
    {
        address owedToken = Margin(DYDX_MARGIN).getPositionOwedToken(POSITION_ID);
        return DetailedERC20(owedToken).decimals();
    }

    function symbol()
        external
        view
        returns (string)
    {
        if (state == State.UNINITIALIZED) {
            return "s[UNINITIALIZED]";
        }
        address owedToken = Margin(DYDX_MARGIN).getPositionOwedToken(POSITION_ID);
        return string(
            abi.encodePacked(
                "s",
                bytes(DetailedERC20(owedToken).symbol())
            )
        );
    }

    function name()
        external
        view
        returns (string)
    {
        if (state == State.UNINITIALIZED) {
            return "dYdX Short Token [UNINITIALIZED]";
        }
        return string(
            abi.encodePacked(
                "dYdX Short Token ",
                StringHelpers.bytes32ToHex(POSITION_ID)
            )
        );
    }

    // ============ Private Functions ============

    function getTokenAmountOnAdd(
        uint256 principalAdded
    )
        internal
        view
        returns (uint256)
    {
        return principalAdded;
    }

    function getCloseAmounts(
        uint256 requestedCloseAmount,
        uint256 balance,
        uint256 positionPrincipal
    )
        private
        view
        returns (
            uint256 /* tokenAmount */,
            uint256 /* allowedCloseAmount */
        )
    {
        // positionPrincipal < totalSupply_ if position was closed by a trusted closer
        assert(positionPrincipal <= totalSupply_);

        uint256 amount = Math.min256(balance, requestedCloseAmount);

        return (amount, amount);
    }
}
