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
 * @title PositionCustodian
 * @author dYdX
 *
 * Interface to interact with other second-layer contracts. For contracts that own positions as a
 * proxy for other addresses.
 */
interface PositionCustodian {

    /**
     * Function that is intended to be called by external contracts to see where to pay any fees or
     * tokens as a result of closing a position on behalf of another contract.
     *
     * @param  positionId   Unique ID of the position
     * @return              Address of the true owner of the position
     */
    function getPositionDeedHolder(
        bytes32 positionId
    )
        external
        view
        returns (address);
}
