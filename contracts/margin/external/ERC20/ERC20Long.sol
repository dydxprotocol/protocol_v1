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

import { DetailedERC20 } from "openzeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { ERC20Position } from "./ERC20Position.sol";
import { Margin } from "../../Margin.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { StringHelpers } from "../../../lib/StringHelpers.sol";


/**
 * @title ERC20Long
 * @author dYdX
 *
 * Contract used to tokenize leveraged long positions and allow them to be used as ERC20-compliant
 * tokens. Holding the tokens allows the holder to close a piece of the position, or be
 * entitled to some amount of heldTokens after settlement.
 *
 * The total supply of leveraged long tokens is always exactly equal to the number of heldTokens
 * held in collateral in the backing position
 */
contract ERC20Long is ERC20Position {
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
        return DetailedERC20(heldToken).decimals();
    }

    function symbol()
        external
        view
        returns (string)
    {
        if (state == State.UNINITIALIZED) {
            return "L[UNINITIALIZED]";
        }
        return string(
            abi.encodePacked(
                "L",
                DetailedERC20(heldToken).symbol()
            )
        );
    }

    function name()
        external
        view
        returns (string)
    {
        if (state == State.UNINITIALIZED) {
            return "dYdX Leveraged Long Token [UNINITIALIZED]";
        }
        return string(
            abi.encodePacked(
                "dYdX Leveraged Long Token ",
                StringHelpers.bytes32ToHex(POSITION_ID)
            )
        );
    }

    // ============ Private Functions ============

    function getTokenAmountOnAdd(
        uint256 /* principalAdded */
    )
        internal
        view
        returns (uint256)
    {
        // total supply should always equal position balance, except after closing with trusted
        // recipient, in which case this function cannot be called.

        uint256 positionBalance = Margin(DYDX_MARGIN).getPositionBalance(POSITION_ID);
        return positionBalance.sub(totalSupply_);
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
        uint256 positionBalance = Margin(DYDX_MARGIN).getPositionBalance(POSITION_ID);

        uint256 requestedTokenAmount = MathHelpers.getPartialAmount(
            requestedCloseAmount,
            positionPrincipal,
            positionBalance
        );

        // if user has enough tokens, allow the close to occur
        if (requestedTokenAmount <= balance) {
            return (requestedTokenAmount, requestedCloseAmount);
        }

        // The maximum amount of principal able to be closed without using more heldTokens
        // than balance
        uint256 allowedCloseAmount = MathHelpers.getPartialAmount(
            balance,
            positionBalance,
            positionPrincipal
        );

        // the new close amount should not be higher than what was requested
        assert(allowedCloseAmount < requestedCloseAmount);

        uint256 allowedTokenAmount = MathHelpers.getPartialAmount(
            allowedCloseAmount,
            positionPrincipal,
            positionBalance
        );

        return (allowedTokenAmount, allowedCloseAmount);
    }
}
