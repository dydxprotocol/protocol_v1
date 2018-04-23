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
        address collateralRecipient
    )
        public
        OnlyMargin(margin)
    {
        RECOVERER = recoverer;
        COLLATERAL_RECIPIENT = collateralRecipient;
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
        address collateralRecipient
    )
        onlyMargin
        external
        returns (bool)
    {
        bool recovererOkay = (who == RECOVERER);
        bool recipientOkay = (COLLATERAL_RECIPIENT != address(0))
            && (collateralRecipient == COLLATERAL_RECIPIENT);

        return recovererOkay || recipientOkay;
    }

    function marginLoanIncreased(
        address,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (bool)
    {
        return false;
    }
}
