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

import { ERC20PositionCreator } from "./ERC20PositionCreator.sol";
import { ERC20Short } from "./ERC20Short.sol";


/**
 * @title ERC20ShortCreator
 * @author dYdX
 *
 * This contract is used to deploy new ERC20Short contracts. A new ERC20Short is
 * automatically deployed whenever a position is transferred to this contract. Ownership of that
 * position is then transferred to the new ERC20Short, with the tokens initially being
 * allocated to the address that transferred the position originally to the
 * ERC20ShortCreator.
 */
contract ERC20ShortCreator is ERC20PositionCreator {
    constructor(
        address margin,
        address[] trustedRecipients
    )
        public
        ERC20PositionCreator(margin, trustedRecipients)
    {}

    // ============ Private Functions ============

    function createTokenContract(
        address from,
        bytes32 positionId
    )
        private
        returns (address)
    {
        return new ERC20Short(
            positionId,
            DYDX_MARGIN,
            from,
            TRUSTED_RECIPIENTS
        );
    }
}
