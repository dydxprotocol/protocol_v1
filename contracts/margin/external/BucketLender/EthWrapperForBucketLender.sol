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

import { BucketLender } from "./BucketLender.sol";
import { WETH9 } from "../../../external/weth/WETH9.sol";
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

    // ============ Functions ============

    /**
     * In the current version of solidity, the fallback function is non-payable, so we do not need
     * to define it in order to prevent sending eth to this contract directly.
     */

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
        assert(TokenInteract.balanceOf(WETH, address(this)) >= amount);

        // approve for "unlimited amount". WETH9 leaves this value as-is when doing transferFrom
        TokenInteract.approve(WETH, bucketLender, MathHelpers.maxUint256());

        // deposit the tokens
        return BucketLender(bucketLender).deposit(beneficiary, amount);
    }
}
