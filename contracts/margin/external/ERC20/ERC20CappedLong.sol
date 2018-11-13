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
import { DetailedERC20 } from "openzeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { ERC20CappedPosition } from "./ERC20CappedPosition.sol";
import { ERC20Long } from "./ERC20Long.sol";


/**
 * @title ERC20CappedLong
 * @author dYdX
 *
 * ERC20Long with a limit on the number of tokens that can be minted, and a restriction on
 * which addreses can close the position after it is force-recoverable.
 */
contract ERC20CappedLong is
    ERC20Long,
    ERC20CappedPosition,
    DetailedERC20
{
    using SafeMath for uint256;

    // ============ Constructor ============

    constructor(
        bytes32 positionId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients,
        address[] trustedWithdrawers,
        address[] trustedLateClosers,
        uint256 cap,
        string name,
        string symbol,
        uint8 decimals
    )
        public
        ERC20Long(
            positionId,
            margin,
            initialTokenHolder,
            trustedRecipients,
            trustedWithdrawers
        )
        ERC20CappedPosition(
            trustedLateClosers,
            cap
        )
        DetailedERC20(
            name,
            symbol,
            decimals
        )
    {
    }

    // ============ Internal Overriding Functions ============

    function getTokenAmountOnAdd(
        uint256 principalAdded
    )
        internal
        view
        returns (uint256)
    {
        uint256 tokenAmount = super.getTokenAmountOnAdd(principalAdded);

        require(
            totalSupply_.add(tokenAmount) <= tokenCap,
            "ERC20CappedLong#getTokenAmountOnAdd: Adding tokenAmount would exceed cap"
        );

        return tokenAmount;
    }
}
