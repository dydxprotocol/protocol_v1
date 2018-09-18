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

import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { ReentrancyGuard } from "../../../lib/ReentrancyGuard.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";
import { CancelMarginCallDelegator } from "../../interfaces/lender/CancelMarginCallDelegator.sol";
import { MarginCallDelegator } from "../../interfaces/lender/MarginCallDelegator.sol";


/**
 * @title MakerOracle
 * @author dYdX
 *
 * Contract that reads the price of Single-Collateral DAI and determines whether
 * a position can be margin-called.
 */
contract MakerOracle is
    Ownable,
    OnlyMargin,
    ReentrancyGuard,
    CancelMarginCallDelegator,
    MarginCallDelegator
{
    using TokenInteract for address;

    // ============ State Variables ============

    /**
     * The collateral requirement determines whether a margin call is permitted.
     * A margin call may be triggered by anyone once the value of the deposit
     * in a position drops below a certain fraction of the value of the owed
     * amount. That fraction is defined by the collateral requirement, and the
     * exchange rate between the two currencies is given by the oracle contract.
     */
    // The collateral requirement to avoid a margin call, as a percent.
    uint32 public COLLATERAL_REQUIREMENT;

    // ============ Constructor ============

    constructor(
        address margin,
        address medianizer,
        uint32 collateralRequirement
    )
        public
        OnlyMargin(margin)
    {
        COLLATERAL_REQUIREMENT = collateralRequirement;
    }

    /**
     * Function a contract must implement in order to let other addresses call marginCall().
     *
     * @param  caller         Address of the caller of the marginCall function
     * @param  positionId     Unique ID of the position
     * @param  depositAmount  Amount of heldToken deposit that will be required to cancel the call
     * @return                This address to accept, a different address to ask that contract
     */
    function marginCallOnBehalfOf(
        address,
        bytes32 positionId,
        uint256 depositAmount
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        // TODO: Allow a deposit to cancel the margin call.
        require(
            depositAmount == 0,
            "BucketLender#marginCallOnBehalfOf: Deposit amount must be zero"
        );

        // TODO: Do not continue unless the position is undercollateralized.
        return address(this);
    }

    /**
     * Function a contract must implement in order to let other addresses call cancelMarginCall().
     *
     * @param  canceler    Address of the caller of the cancelMarginCall function
     * @param  positionId  Unique ID of the position
     * @return             This address to accept, a different address to ask that contract
     */
    function cancelMarginCallOnBehalfOf(
        address,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        // TODO: Do not continue if the position is undercollateralized.
        return address(this);
    }

    /**
     * Allows the owner to withdraw any excess tokens sent to the vault by
     * unconventional means, including (but not limited-to) token airdrops. We
     * do not expect this contract to own any tokens.
     *
     * @param  token  ERC20 token address
     * @param  to     Address to transfer tokens to
     * @return        Amount of tokens withdrawn
     */
    function withdrawExcessToken(
        address token,
        address to
    )
        external
        onlyOwner
        returns (uint256)
    {
        uint256 amount = token.balanceOf(address(this));
        token.transfer(to, amount);
        return amount;
    }
}
