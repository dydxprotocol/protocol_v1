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
import { BucketLender } from "./BucketLender.sol";
import { AdvancedTokenInteract } from "../../../lib/AdvancedTokenInteract.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";


/**
 * @title BucketLenderProxy
 * @author dYdX
 *
 * TokenProxy for BucketLender contracts
 */
contract BucketLenderProxy
{
    using TokenInteract for address;
    using AdvancedTokenInteract for address;

    // ============ Constants ============

    // Address of the WETH token
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
     * Fallback function. Disallows ETH to be sent to this contract without data except when
     * unwrapping WETH.
     */
    function ()
        external
        payable
    {
        require( // coverage-disable-line
            msg.sender == WETH,
            "BucketLenderProxy#fallback: Cannot recieve ETH directly unless unwrapping WETH"
        );
    }

    /**
     * Send ETH directly to this contract, convert it to WETH, and sent it to a BucketLender
     *
     * @param  bucketLender  The address of the BucketLender contract to deposit into
     * @return               The bucket number that was deposited into
     */
    function depositEth(
        address bucketLender
    )
        external
        payable
        returns (uint256)
    {
        address weth = WETH;

        require(
            weth == BucketLender(bucketLender).OWED_TOKEN(),
            "BucketLenderProxy#depositEth: BucketLender does not take WETH"
        );

        WETH9(weth).deposit.value(msg.value)();

        return depositInternal(
            bucketLender,
            weth,
            msg.value
        );
    }

    /**
     * Deposits tokens from msg.sender into a BucketLender
     *
     * @param  bucketLender  The address of the BucketLender contract to deposit into
     * @param  amount        The amount of token to deposit
     * @return               The bucket number that was deposited into
     */
    function deposit(
        address bucketLender,
        uint256 amount
    )
        external
        returns (uint256)
    {
        address token = BucketLender(bucketLender).OWED_TOKEN();
        token.transferFrom(msg.sender, address(this), amount);

        return depositInternal(
            bucketLender,
            token,
            amount
        );
    }

    /**
     * Withdraw tokens from a BucketLender
     *
     * @param  bucketLender  The address of the BucketLender contract to withdraw from
     * @param  buckets       The buckets to withdraw from
     * @param  maxWeights    The maximum weight to withdraw from each bucket
     * @return               Values corresponding to:
     *                         [0]  = The number of owedTokens withdrawn
     *                         [1]  = The number of heldTokens withdrawn
     */
    function withdraw(
        address bucketLender,
        uint256[] buckets,
        uint256[] maxWeights
    )
        external
        returns (uint256, uint256)
    {
        address owedToken = BucketLender(bucketLender).OWED_TOKEN();
        address heldToken = BucketLender(bucketLender).HELD_TOKEN();

        (
            uint256 owedTokenAmount,
            uint256 heldTokenAmount
        ) = BucketLender(bucketLender).withdraw(
            buckets,
            maxWeights,
            msg.sender
        );

        transferInternal(owedToken, msg.sender, owedTokenAmount);
        transferInternal(heldToken, msg.sender, heldTokenAmount);

        return (owedTokenAmount, heldTokenAmount);
    }

    /**
     * Reinvest tokens by withdrawing them from one BucketLender and depositing them into another
     *
     * @param  withdrawFrom  The address of the BucketLender contract to withdraw from
     * @param  depositInto   The address of the BucketLender contract to deposit into
     * @param  buckets       The buckets to withdraw from
     * @param  maxWeights    The maximum weight to withdraw from each bucket
     * @return               Values corresponding to:
     *                         [0]  = The bucket number that was deposited into
     *                         [1]  = The number of owedTokens reinvested
     *                         [2]  = The number of heldTokens withdrawn
     */
    function rollover(
        address withdrawFrom,
        address depositInto,
        uint256[] buckets,
        uint256[] maxWeights
    )
        external
        returns (uint256, uint256, uint256)
    {
        address owedToken = BucketLender(depositInto).OWED_TOKEN();

        // the owedTokens of the two BucketLenders must be the same
        require (
            owedToken == BucketLender(withdrawFrom).OWED_TOKEN(),
            "BucketLenderTokenProxy#rollover: Token mismatch"
        );

        // withdraw from the first BucketLender
        (
            uint256 owedTokenAmount,
            uint256 heldTokenAmount
        ) = BucketLender(withdrawFrom).withdraw(
            buckets,
            maxWeights,
            msg.sender
        );

        // reinvest any owedToken into the second BucketLender
        uint256 bucket = depositInternal(
            depositInto,
            owedToken,
            owedTokenAmount
        );

        // return any heldToken to the msg.sender
        address heldToken = BucketLender(withdrawFrom).HELD_TOKEN();
        transferInternal(heldToken, msg.sender, heldTokenAmount);

        return (bucket, owedTokenAmount, heldTokenAmount);
    }

    // ============ Private Functions ============

    function depositInternal(
        address bucketLender,
        address token,
        uint256 amount
    )
        private
        returns (uint256)
    {
        token.ensureAllowance(bucketLender, amount);
        return BucketLender(bucketLender).deposit(msg.sender, amount);
    }

    function transferInternal(
        address token,
        address recipient,
        uint256 amount
    )
        private
    {
        address weth = WETH;
        if (token == weth) {
            if (amount != 0) {
                WETH9(weth).withdraw(amount);
                msg.sender.transfer(amount);
            }
        } else {
            token.transfer(recipient, amount);
        }
    }
}
