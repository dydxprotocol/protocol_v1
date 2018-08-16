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
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";


/**
 * @title EthWrapperForBucketLender
 * @author dYdX
 *
 * Takes ETH directly, wraps it, then sends it to a bucket lender on behalf of a user.
 */
contract EthWrapperForBucketLender
{
    using TokenInteract for address;

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
     * Fallback function. Disallows ether to be sent to this contract without data except when
     * unwrapping WETH.
     */
    function ()
        external
        payable
    {
        require( // coverage-disable-line
            msg.sender == WETH,
            "EthWrapperForBucketLender#fallback: Cannot recieve ETH directly unless unwrapping WETH"
        );
    }

    /**
     * Allows users to send eth directly to this contract and have it be wrapped and sent to a
     * BucketLender to be lent for some margin position.
     *
     * @param  bucketLender  The address of the BucketLender contract to deposit money into
     * @param  beneficiary   The address that will retain rights to the deposit
     * @return               The bucket number that was deposited into
     */
    function depositEth(
        address bucketLender,
        address beneficiary
    )
        external
        payable
        returns (uint256)
    {
        uint256 amount = msg.value;

        require(
            amount != 0,
            "EthWrapperForBucketLender#depositEth: Cannot deposit zero amount"
        );

        // wrap the eth
        WETH9(WETH).deposit.value(amount)();
        assert(WETH.balanceOf(address(this)) >= amount);

        // ensure enough allowance
        if (WETH.allowance(address(this), bucketLender) == 0) {
            // approve for "unlimited amount". WETH9 leaves this value as-is when doing transferFrom
            WETH.approve(bucketLender, MathHelpers.maxUint256());
        }

        // deposit the tokens
        return BucketLender(bucketLender).deposit(beneficiary, amount);
    }

    /**
     * Allows users to send eth directly to this contract and have it be wrapped and sent to a
     * BucketLender to be lent for some margin position.
     *
     * @param  bucketLender  The address of the BucketLender contract to deposit money into
     * @return               The bucket number that was deposited into
     */
    function withdrawEth(
        address bucketLender,
        uint256[] buckets,
        uint256[] maxWeights
    )
        external
        returns (uint256, uint256)
    {
        address owedToken = BucketLender(bucketLender).OWED_TOKEN();
        address heldToken = BucketLender(bucketLender).HELD_TOKEN();
        require(
            owedToken == WETH,
            "EthWrapperForBucketLender: Cannot withdraw from non-WETH BucketLender"
        );

        // withdraw the weth
        (
            uint256 owedTokenAmount,
            uint256 heldTokenAmount
        ) = BucketLender(bucketLender).withdraw(
            buckets,
            maxWeights,
            msg.sender
        );

        // send all eth to msg.sender
        if (owedTokenAmount != 0) {
            WETH9(owedToken).withdraw(owedTokenAmount);
            msg.sender.transfer(owedTokenAmount);
        }

        // send all other tokens to msg.sender
        if (heldTokenAmount != 0) {
            heldToken.transfer(msg.sender, heldTokenAmount);
        }

        return (owedTokenAmount, heldTokenAmount);
    }
}
