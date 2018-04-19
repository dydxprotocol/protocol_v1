pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ForceRecoverCollateralDelegator } from "../margin/interfaces/ForceRecoverCollateralDelegator.sol";


contract TestForceRecoverCollateralDelegator is ForceRecoverCollateralDelegator {

    address public RECOVERER;
    address public COLLATERAL_RECIPIENT;

    function TestForceRecoverCollateralDelegator(
        address margin,
        address recoverer,
        address collateralRecipient
    )
        public
        ForceRecoverCollateralDelegator(margin)
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
