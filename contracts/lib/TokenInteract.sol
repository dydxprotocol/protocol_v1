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


/**
 * @title TokenInteract
 * @author dYdX
 *
 * This library contains functions for interacting wtih ERC20 tokens
 */
library TokenInteract {
    function balanceOf(
        address token,
        address owner
    )
        internal
        view
        returns (uint256)
    {
        return ERC20(token).balanceOf(owner);
    }

    function allowance(
        address token,
        address owner,
        address spender
    )
        internal
        view
        returns (uint256)
    {
        return ERC20(token).allowance(owner, spender);
    }

    function approve(
        address token,
        address spender,
        uint256 amount
    )
        internal
    {
        ERC20(token).approve(spender, amount);

        require(
            checkSuccess(),
            "TokenInteract#approve: Approval failed"
        );
    }

    function transfer(
        address token,
        address to,
        uint256 amount
    )
        internal
    {
        address from = address(this);
        if (
            amount == 0
            || from == to
        ) {
            return;
        }

        ERC20(token).transfer(to, amount);

        require(
            checkSuccess(),
            "TokenInteract#transfer: Transfer failed"
        );
    }

    function transferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    )
        internal
    {
        if (
            amount == 0
            || from == to
        ) {
            return;
        }

        ERC20(token).transferFrom(from, to, amount);

        require(
            checkSuccess(),
            "TokenInteract#transferFrom: TransferFrom failed"
        );
    }

    // ============ Private Helper-Functions ============

    /**
     * Checks the return value of the previous function up to 32 bytes. Returns true if the previous
     * function returned a non-zero value or did not return a value at all. Returns false only if
     * the previous function returned all zeroes in the first 32 bytes of the return data.
     */
    function checkSuccess(
    )
        private
        pure
        returns (bool)
    {
        uint256 returnValue;

        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            // if/else based on number of bytes returned from last function call
            switch returndatasize

            // no bytes returned: assume success
            case 0 {
                returnValue := 1
            }

            // bytes returned: assume 32 bytes
            default {
                // copy 32 bytes into scratch memory
                returndatacopy(0x0, 0x0, 0x20)

                // store those bytes into returnValue
                returnValue := mload(0x0)
            }
        }

        return returnValue != 0;
    }
}

/**
 * We have to use a non-compliant interface to call ERC20 functions so that we dont automatically
 * revert when calling tokens that have no return value for transfer(), transferFrom(), or approve()
 */
interface ERC20 {
    function totalSupply(
    )
        external
        view
        returns (uint256);

    function balanceOf(
        address who
    )
        external
        view
        returns (uint256);

    function allowance(
        address owner,
        address spender
    )
        external
        view
        returns (uint256);

    function transfer(
        address to,
        uint256 value
    )
        external;


    function transferFrom(
        address from,
        address to,
        uint256 value
    )
        external;

    function approve(
        address spender,
        uint256 value
    )
        external;
}
