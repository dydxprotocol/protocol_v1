pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { ForceRecoverCollateralDelegator } from "../margin/interfaces/ForceRecoverCollateralDelegator.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestForceRecoverCollateralDelegator is OnlyMargin, ForceRecoverCollateralDelegator {

    address public RECOVERER;
    address public COLLATERAL_RECIPIENT;

    constructor(
        address margin,
        address recoverer,
        address recipient
    )
        public
        OnlyMargin(margin)
    {
        RECOVERER = recoverer;
        COLLATERAL_RECIPIENT = recipient;
    }

    function receiveLoanOwnership(
        address,
        bytes32
    )
        onlyMargin
        external
        returns (address)
    {
        return address(this);
    }

    function forceRecoverCollateralOnBehalfOf(
        address who,
        bytes32,
        address recipient
    )
        onlyMargin
        external
        returns (address)
    {
        bool recovererOkay = (who == RECOVERER);
        bool recipientOkay = (COLLATERAL_RECIPIENT != address(0))
            && (recipient == COLLATERAL_RECIPIENT);

        require(recovererOkay || recipientOkay);

        return address(this);
    }

    function marginLoanIncreased(
        address,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (address)
    {
        require(false);
    }
}
