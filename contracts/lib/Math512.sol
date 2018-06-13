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
 * @title Math512
 */
library Math512 {

    /**
     * returns 2**256 / a
     * @param  a  The input
     * @return    The result
     */
    function div256(
        uint256 a
    )
        internal
        pure
        returns (uint256 r)
    {
        require(a > 1);
        assembly {
            r := add(div(sub(0, a), a), 1)
        }
    }

    /**
     * returns 2**256 mod a
     * @param  a  The input
     * @return    The result
     */
    function mod256(
        uint256 a
    )
        internal
        pure
        returns (uint256 r)
    {
        require(a != 0);
        assembly {
            r := mod(sub(0, a), a)
        }
    }

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
        assembly {
            r0 := add(a0, b0)
            r1 := add(add(a1, b1), lt(r0, a0))
        }
    }

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
        assembly {
            r0 := sub(a0, b0)
            r1 := sub(sub(a1, b1), lt(a0, b0))
        }
    }

    function mul512(
        uint256 a,
        uint256 b
    )
        internal
        pure
        returns (uint256 r0, uint256 r1)
    {
        assembly {
            let mm := mulmod(a, b, not(0))
            r0 := mul(a, b)
            r1 := sub(sub(mm, r0), lt(mm, r0))
        }
    }

    function div512(
        uint256 a0,
        uint256 a1,
        uint256 b
    )
        internal
        pure
        returns (uint256 x0, uint256 x1)
    {
        require (b != 0);

        if (b == 1) {
            return (a0, a1);
        }
        uint256 t0;
        uint256 t1;
        uint256 q = div256(b);
        uint256 r = mod256(b);
        while (a1 != 0) {
            (t0, t1) = mul512(a1, q);
            (x0, x1) = add512(x0, x1, t0, t1);
            (t0, t1) = mul512(a1, r);
            (a0, a1) = add512(t0, t1, a0, 0);
        }
        (x0, x1) = add512(x0, x1, a0 / b, 0);
    }

    function max512(
        uint256 a0,
        uint256 a1,
        uint256 b0,
        uint256 b1
    )
        internal
        pure
        returns (uint256 r0, uint256 r1)
    {
        if (a1 == b1) {
            return a0 > b0 ? (a0, a1) : (b0, b1);
        }
        return a1 > b1 ? (a0, a1) : (b0, b1);
    }
}
