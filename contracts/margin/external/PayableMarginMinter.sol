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

import { WETH9 } from "canonical-weth/contracts/WETH9.sol";
import { Margin } from "../Margin.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ReentrancyGuard } from "../../lib/ReentrancyGuard.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";


/**
 * @title PayableMarginMinter
 * @author dYdX
 *
 * Contract for allowing anyone to mint short or margin-long tokens using a payable function
 */
contract PayableMarginMinter is ReentrancyGuard {
    using TokenInteract for address;

    // ============ State Variables ============

    address public DYDX_MARGIN;

    address public WETH;

    // ============ Constructor ============

    constructor(
        address margin,
        address weth
    )
        public
    {
        DYDX_MARGIN = margin;
        WETH = weth;

        // WETH approval of maxInt does not decrease
        address tokenProxy = Margin(DYDX_MARGIN).getTokenProxyAddress();
        WETH.approve(tokenProxy, MathHelpers.maxUint256());
    }

    // ============ Public Functions ============

    /**
     * Fallback function. Disallows ether to be sent to this contract without data except when
     * unwrapping WETH.
     */
    function ()
        external
        payable
    {
        require( // coverage-disable-line
            msg.sender == WETH,
            "PayableMarginMinter#fallback: Cannot recieve ETH directly unless unwrapping WETH"
        );
    }

    /**
     * Increase the size of a position. Funds will be borrowed from the loan payer and sold as per
     * the position. The amount of owedToken borrowed from the lender will be >= the amount of
     * principal added, as it will incorporate interest already earned by the position so far.
     *
     * @param  addresses           Addresses corresponding to:
     *
     *  [0]  = loan payer
     *  [1]  = loan taker
     *  [2]  = loan position owner
     *  [3]  = loan fee recipient
     *  [4]  = loan lender fee token
     *  [5]  = loan taker fee token
     *  [6]  = exchange wrapper address
     *
     * @param  values256           Values corresponding to:
     *
     *  [0]  = loan maximum amount
     *  [1]  = loan minimum amount
     *  [2]  = loan minimum heldToken
     *  [3]  = loan lender fee
     *  [4]  = loan taker fee
     *  [5]  = loan expiration timestamp (in seconds)
     *  [6]  = loan salt
     *  [7]  = amount of principal to add to the position (NOTE: the amount pulled from the lender
     *                                                           will be >= this amount)
     *
     * @param  values32            Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *
     * @param  depositInHeldToken  True if the trader wishes to pay the margin deposit in heldToken.
     *                             False if the margin deposit will be in owedToken
     *                             and then sold along with the owedToken borrowed from the lender
     * @param  signature           If loan payer is an account, then this must be the tightly-packed
     *                             ECDSA V/R/S parameters from signing the loan hash. If loan payer
     *                             is a smart contract, these are arbitrary bytes that the contract
     *                             will recieve when choosing whether to approve the loan.
     * @param  order               Order object to be passed to the exchange wrapper
     * @return                     Amount of owedTokens pulled from the lender
     */
    function mintMarginTokens(
        bytes32    positionId,
        address[7] addresses,
        uint256[8] values256,
        uint32[2]  values32,
        bool       depositInHeldToken,
        bytes      signature,
        bytes      order
    )
        external
        payable
        nonReentrant
        returns (uint256)
    {
        // wrap all eth
        WETH9(WETH).deposit.value(msg.value)();

        // mint the margin tokens
        Margin(DYDX_MARGIN).increasePosition(
            positionId,
            addresses,
            values256,
            values32,
            depositInHeldToken,
            signature,
            order
        );

        // send the margin tokens back to the user
        address marginTokenContract = Margin(DYDX_MARGIN).getPositionOwner(positionId);
        uint256 numTokens = marginTokenContract.balanceOf(address(this));
        marginTokenContract.transfer(msg.sender, numTokens);

        // unwrap any leftover WETH and send eth back to the user
        uint256 leftoverEth = WETH.balanceOf(address(this));
        if (leftoverEth > 0) {
            WETH9(WETH).withdraw(leftoverEth);
            msg.sender.transfer(leftoverEth);
        }

        return numTokens;
    }
}
