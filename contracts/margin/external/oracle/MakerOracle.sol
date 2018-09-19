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

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { IMedianizer } from "../../../external/maker/IMedianizer.sol";
import { ReentrancyGuard } from "../../../lib/ReentrancyGuard.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { Margin } from "../../Margin.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";
import { CancelMarginCallDelegator } from "../../interfaces/lender/CancelMarginCallDelegator.sol";
import { MarginCallDelegator } from "../../interfaces/lender/MarginCallDelegator.sol";


/**
 * @title MakerOracle
 * @author dYdX
 *
 * Contract that reads the price of Single-Collateral DAI and determines whether
 * a position can be margin-called.
 */
contract MakerOracle is
    Ownable,
    OnlyMargin,
    ReentrancyGuard,
    CancelMarginCallDelegator,
    MarginCallDelegator
{
    using SafeMath for uint256;
    using TokenInteract for address;

    // ============ State Variables ============

    address public MAKERDAO_MEDIANIZER;
    address public WETH;
    address public DAI;

    /**
     * The collateral requirement determines whether a margin call is permitted.
     * A margin call may be triggered by anyone once the value of the deposit
     * in a position drops below a certain fraction of the value of the owed
     * amount. That fraction is defined by the collateral requirement, and the
     * exchange rate between the two currencies is given by the oracle contract.
     */
    // The collateral requirement to avoid a margin call, as a percent, * 10^6.
    uint32 public COLLATERAL_REQUIREMENT;

    // ============ Constructor ============

    constructor(
        address margin,
        address medianizer,
        address weth,
        address dai,
        uint32 collateralRequirement
    )
        public
        OnlyMargin(margin)
    {
        MAKERDAO_MEDIANIZER = medianizer;
        WETH = weth;
        DAI = dai;
        COLLATERAL_REQUIREMENT = collateralRequirement;
    }

    /**
     * Function a contract must implement in order to let other addresses call marginCall().
     *
     * @param  positionId     Unique ID of the position
     * @param  depositAmount  Amount of heldToken deposit that will be required to cancel the call
     * @return                This address to accept, a different address to ask that contract
     */
    function marginCallOnBehalfOf(
        address,
        bytes32 positionId,
        uint256 depositAmount
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        require(
            depositAmount == 0,
            "BucketLender#marginCallOnBehalfOf: Deposit amount must be zero"
        );

        require(!meetsCollateralRequirement(positionId));
        return address(this);
    }

    /**
     * Function a contract must implement in order to let other addresses call cancelMarginCall().
     *
     * @param  positionId  Unique ID of the position
     * @return             This address to accept, a different address to ask that contract
     */
    function cancelMarginCallOnBehalfOf(
        address,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        require(meetsCollateralRequirement(positionId));
        return address(this);
    }

    /**
     * Read position information from the Margin contract and use the exchange
     * rate give by the oracle contract to determine whether the held amount
     * (i.e. collateral) meets the collateral requirement relative to the value
     * of the owed amount.
     *
     * Will revert if the position does not use supported tokens.
     *
     * @return Boolean indicating whether the position meets the collateral requirement.
     */
    function meetsCollateralRequirement(
        bytes32 positionId
    )
        private
        view
        onlyMargin
        returns (bool)
    {
        Margin margin = Margin(DYDX_MARGIN);

        address heldToken = margin.getPositionHeldToken(positionId);
        address owedToken = margin.getPositionOwedToken(positionId);

        // Currently we only support ETH/DAI and DAI/ETH.
        require(
            (heldToken == DAI && owedToken == WETH) ||
            (heldToken == WETH && owedToken == DAI)
        );

        // The MakerDAO medianizer contract returns ETH/USD with 18 digits after
        // the decimal point.
        bytes32 oracleRead = IMedianizer(MAKERDAO_MEDIANIZER).read();
        uint256 ethUsdRate = uint256(oracleRead);

        uint256 heldAmount = margin.getPositionBalance(positionId);
        uint256 owedAmount = margin.getPositionOwedAmount(positionId);

        if (heldToken == DAI && owedToken == WETH) {
            // I.e. short position against ETH.
            return (
                heldAmount.mul(10**26) >=
                owedAmount.mul(COLLATERAL_REQUIREMENT).mul(ethUsdRate)
            );
        } else {
            // I.e. long position in ETH.
            return (
                heldAmount.mul(ethUsdRate) >=
                owedAmount.mul(COLLATERAL_REQUIREMENT).mul(10**10)
            );
        }
    }
}
