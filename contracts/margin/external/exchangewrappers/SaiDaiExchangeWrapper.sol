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

import { IScdMcdMigration } from "../../../external/Maker/Other/IScdMcdMigration.sol";
import { AdvancedTokenInteract } from "../../../lib/AdvancedTokenInteract.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";


/**
 * @title SaiDaiExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with Maker's ScdMcdMigration contract
 */
contract SaiDaiExchangeWrapper is
    ExchangeWrapper
{
    using AdvancedTokenInteract for address;
    using TokenInteract for address;

    // ============ Storage ============

    address public MIGRATION_CONTRACT;

    address public SAI;

    address public DAI;

    // ============ Constructor ============

    constructor(
        address migrationContract,
        address sai,
        address dai
    )
        public
    {
        MIGRATION_CONTRACT = migrationContract;
        SAI = sai;
        DAI = dai;

        sai.approve(migrationContract, uint256(-1));
        dai.approve(migrationContract, uint256(-1));
    }

    // ============ Public Functions ============

    function exchange(
        address /* tradeOriginator */,
        address receiver,
        address makerToken,
        address takerToken,
        uint256 requestedFillAmount,
        bytes /* orderData */
    )
        external
        returns (uint256)
    {
        address sai = SAI;
        address dai = DAI;

        bool tokensAreValid =
            (takerToken == sai && makerToken == dai)
            || (takerToken == dai && makerToken == sai);

        require(
            tokensAreValid,
            "SaiDaiExchangeWrapper#exchange: Invalid tokens"
        );

        IScdMcdMigration migration = IScdMcdMigration(MIGRATION_CONTRACT);

        if (takerToken == sai) {
            migration.swapSaiToDai(requestedFillAmount);
        } else {
            migration.swapDaiToSai(requestedFillAmount);
        }

        // ensure swap occurred properly
        assert(makerToken.balanceOf(address(this)) >= requestedFillAmount);

        // set allowance for the receiver
        makerToken.ensureAllowance(receiver, requestedFillAmount);

        return requestedFillAmount;
    }

    function getExchangeCost(
        address /* makerToken */,
        address /* takerToken */,
        uint256 desiredMakerToken,
        bytes /* orderData */
    )
        external
        view
        returns (uint256)
    {
        return desiredMakerToken;
    }
}
