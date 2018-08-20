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

import { ERC20Long } from "./ERC20Long.sol";
import { ERC20PositionFactory } from "./ERC20PositionFactory.sol";


/**
 * @title ERC20LongFactory
 * @author dYdX
 *
 * This contract is used to deploy new ERC20Long contracts. A new ERC20Long is
 * automatically deployed whenever a position is transferred to this contract. Ownership of that
 * position is then transferred to the new ERC20Long, with the tokens initially being
 * allocated to the address that transferred the position originally to the
 * ERC20LongFactory.
 */
contract ERC20LongFactory is ERC20PositionFactory {
    constructor(
        address margin,
        address[] trustedRecipients,
        address[] trustedWithdrawers
    )
        public
        ERC20PositionFactory(
            margin,
            trustedRecipients,
            trustedWithdrawers
        )
    {}

    // ============ Private Functions ============

    function createTokenContract(
        address creator,
        bytes32 positionId
    )
        private
        returns (address)
    {
        return new ERC20Long(
            positionId,
            DYDX_MARGIN,
            creator,
            TRUSTED_RECIPIENTS,
            TRUSTED_WITHDRAWERS
        );
    }
}
