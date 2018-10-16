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

    address constant public ETH = address(0);

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
            "ERC20PositionWithdrawer#fallback: Cannot recieve ETH directly unless unwrapping WETH"
        );
    }

    /**
     * After a Margin Position (that backs a ERC20 Margin Token) is closed, the remaining Margin
     * Token holders are able to withdraw the Margin Position's heldToken from the Margin Token
     * contract. This function allows a holder to atomically withdraw the token and trade it for a
     * different ERC20 before returning the funds to the holder.
     *
     * @param  erc20Position    The address of the ERC20Position contract to withdraw from
     * @param  returnedToken    The address of the token that is returned to the token holder. The
     *                          zero address indicates that WETH is the returned token, but will be
     *                          unwrapped and sent to the user as ETH.
     * @param  exchangeWrapper  The address of the ExchangeWrapper. The zero address indicates a
     *                          no-exchange before returning funds to the user.
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
        address withdrawnToken = ERC20Position(erc20Position).heldToken();
        uint256 tokensWithdrawn = ERC20Position(erc20Position).withdraw(msg.sender);
        if (tokensWithdrawn == 0) {
            return (0, 0);
        }

        // don't do exchange if no exchangeWrapper
        uint256 tokensReturned;
        if (exchangeWrapper == address(0)) {
            tokensReturned = doPassThrough(
                withdrawnToken,
                tokensWithdrawn,
                returnedToken
            );

        // do exchange if exchangeWrapper
        } else {
            tokensReturned = doExchange(
                withdrawnToken,
                tokensWithdrawn,
                returnedToken,
                exchangeWrapper,
                orderData
            );
        }

        return (tokensWithdrawn, tokensReturned);
    }

    // ============ Private Functions ============

    /**
     * Transfer tokens to the withdrawer without exchanging them on an exchange
     *
     * @param  withdrawnToken   The address of the token withdrawn from the ERC20Position
     * @param  tokensWithdrawn  The number of withdrawnTokens withdrawn from the ERC20Position
     * @param  returnedToken    The address of the token that the user intends to receive
     * @return                  The number of tokens returned to the user
     */
    function doPassThrough(
        address withdrawnToken,
        uint256 tokensWithdrawn,
        address returnedToken
    )
        internal
        returns (uint256)
    {
        require (
            withdrawnToken == trueAddress(returnedToken),
            "ERC20PositionWithdrawer#doPassThrough: Token mismatch"
        );

        if (returnedToken == ETH) {
            // before returning, convert WETH to ETH
            unwrapAndSendWeth(tokensWithdrawn);
        } else {
            // payout the withdrawer using the same token
            withdrawnToken.transfer(msg.sender, tokensWithdrawn);
        }

        return tokensWithdrawn;
    }

    /**
     * Exchange withdrawn tokens by first exchanging them on an exchange and then sending the result
     * to the withdrawer.
     *
     * @param  withdrawnToken   The address of the token withdrawn from the ERC20Position
     * @param  tokensWithdrawn  The number of withdrawnTokens withdrawn from the ERC20Position
     * @param  returnedToken    The address of the token that the user intends to receive
     * @param  exchangeWrapper  The address of the ExchangeWrapper
     * @param  orderData        Arbitrary bytes data for any information to pass to the exchange
     * @return                  The number of tokens returned to the user
     */
    function doExchange(
        address withdrawnToken,
        uint256 tokensWithdrawn,
        address returnedToken,
        address exchangeWrapper,
        bytes orderData
    )
        internal
        returns (uint256)
    {
        require (
            withdrawnToken != trueAddress(returnedToken),
            "ERC20PositionWithdrawer#doExchange: Cannot exchange token for the same token"
        );

        // do the exchange
        withdrawnToken.transfer(exchangeWrapper, tokensWithdrawn);
        uint256 tokensReturned = ExchangeWrapper(exchangeWrapper).exchange(
            msg.sender,
            address(this),
            trueAddress(returnedToken),
            withdrawnToken,
            tokensWithdrawn,
            orderData
        );

        // return returnedToken back to msg.sender
        if (returnedToken == ETH) {
            // take the WETH back, withdraw into ETH, and send to the msg.sender
            WETH.transferFrom(exchangeWrapper, address(this), tokensReturned);
            unwrapAndSendWeth(tokensReturned);
        } else {
            // send the tokens directly to the msg.sender
            returnedToken.transferFrom(exchangeWrapper, msg.sender, tokensReturned);
        }

        return tokensReturned;
    }

    /**
     * Unwraps WETH and sends the result ETH to msg.sender
     *
     * @param  weth    The address of the WETH ERC20 token contract
     * @param  amount  The amount of WETH to unwrap and send
     */
    function unwrapAndSendWeth(
        uint256 amount
    )
        internal
    {
        WETH9(WETH).withdraw(amount);
        msg.sender.transfer(amount);
    }

    /**
     * Returns WETH if ETH is passed in, otherwise returns the input.
     *
     * @param  token  Address of an ERC20 Token or zero
     * @return        The input address, or WETH if the input was zero
     */
    function trueAddress(
        address token
    )
        internal
        pure
        returns (address)
    {
        return (token == ETH) ? WETH : token;
    }
}
