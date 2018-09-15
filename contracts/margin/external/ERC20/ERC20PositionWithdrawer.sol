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
import { ERC20Position } from "./ERC20Position.sol";
import { ReentrancyGuard } from "../../../lib/ReentrancyGuard.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";


/**
 * @title ERC20PositionWithdrawer
 * @author dYdX
 *
 * Proxy contract to withdraw from an ERC20Position and exchange the withdrawn tokens on a DEX
 */
contract ERC20PositionWithdrawer is ReentrancyGuard
{
    using TokenInteract for address;

    // ============ Constants ============

    address public WETH;

    // ============ Constructor ============

    constructor(
        address weth
    )
        public
    {
        WETH = weth;
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
     * After a Margin Position (that backs a ERC20 Margin Token) is closed, the remaining Margin
     * Token holders are able to withdraw the Margin Position's heldToken from the Margin Token
     * contract. This function allows a holder to atomically withdraw the token and trade it for a
     * different ERC20 before returning the funds to the holder.
     *
     * @param  erc20Position    The address of the ERC20Position contract to withdraw from
     * @param  returnedToken    The address of the token that is returned to the token holder
     * @param  exchangeWrapper  The address of the ExchangeWrapper
     * @param  orderData        Arbitrary bytes data for any information to pass to the exchange
     * @return                  [1] The number of tokens withdrawn
     *                          [2] The number of tokens returned to the user
     */
    function withdraw(
        address erc20Position,
        address returnedToken,
        address exchangeWrapper,
        bytes orderData
    )
        external
        nonReentrant
        returns (uint256, uint256)
    {
        // withdraw tokens
        uint256 tokensWithdrawn = ERC20Position(erc20Position).withdraw(msg.sender);
        if (tokensWithdrawn == 0) {
            return (0, 0);
        }

        // do the exchange
        address withdrawnToken = ERC20Position(erc20Position).heldToken();
        withdrawnToken.transfer(exchangeWrapper, tokensWithdrawn);
        uint256 tokensReturned = ExchangeWrapper(exchangeWrapper).exchange(
            msg.sender,
            address(this),
            returnedToken,
            withdrawnToken,
            tokensWithdrawn,
            orderData
        );

        // return returnedToken back to msg.sender
        if (returnedToken == WETH) {
            // take the WETH back, withdraw into ETH, and send to the msg.sender
            returnedToken.transferFrom(exchangeWrapper, address(this), tokensReturned);
            WETH9(returnedToken).withdraw(tokensReturned);
            msg.sender.transfer(tokensReturned);
        } else {
            // send the tokens directly to the msg.sender
            returnedToken.transferFrom(exchangeWrapper, msg.sender, tokensReturned);
        }

        return (tokensWithdrawn, tokensReturned);
    }
}
