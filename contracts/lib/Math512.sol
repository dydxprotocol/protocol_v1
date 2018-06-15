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

import { MathHelpers } from "./MathHelpers.sol";


/**
 * @title Math512
 * @author dYdX
 *
 * Bitwise math manipulations
 */
library Math512 {

    /**
     * Returns 2**256 / a
     *
     * @param  a  The input
     * @return    The result
     */
    /* solium-disable-next-line security/no-named-returns */
    function div256(
        uint256 a
    )
        internal
        pure
        returns (uint256 r)
    {
        require(a > 1);
        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            r := add(div(sub(0, a), a), 1)
        }
    }

    /**
     * Returns R = A + B
     *
     * @param  a0  The least-significant digits of A
     * @param  a1  The least-significant digits of A
     * @param  b0  The least-significant digits of B
     * @param  b1  The least-significant digits of B
     * @return     1) The least-significant digits of R
     *             2) The most-significant digits of R
     */
    /* solium-disable-next-line security/no-named-returns */
    function add512(
        uint256 a0,
        uint256 a1,
        uint256 b0,
        uint256 b1
    )
        internal
        pure
        returns (uint256 r0, uint256 r1)
    {
        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            r0 := add(a0, b0)
            r1 := add(add(a1, b1), lt(r0, a0))
        }
    }

    /**
     * Returns R = A - B
     *
     * @param  a0  The least-significant digits of A
     * @param  a1  The least-significant digits of A
     * @param  b0  The least-significant digits of B
     * @param  b1  The least-significant digits of B
     * @return     1) The least-significant digits of R
     *             2) The most-significant digits of R
     */
    /* solium-disable-next-line security/no-named-returns */
    function sub512(
        uint256 a0,
        uint256 a1,
        uint256 b0,
        uint256 b1
    )
        internal
        pure
        returns (uint256 r0, uint256 r1)
    {
        assert (a1 > b1 || (a1 == b1 && a0 > b0));
        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            r0 := sub(a0, b0)
            r1 := sub(sub(a1, b1), lt(a0, b0))
        }
    }

    /**
     * Returns R = a * b
     *
     * @param  a  One input
     * @param  b  The other input
     * @return    1) The least-significant digits of R
     *            2) The most-significant digits of R
     */
    /* solium-disable-next-line security/no-named-returns */
    function mul512(
        uint256 a,
        uint256 b
    )
        internal
        pure
        returns (uint256 r0, uint256 r1)
    {
        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            let mm := mulmod(a, b, not(0))
            r0 := mul(a, b)
            r1 := sub(sub(mm, r0), lt(mm, r0))
        }
    }
}
