pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { MarginCallDelegator } from "../margin/interfaces/MarginCallDelegator.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestMarginCallDelegator is OnlyMargin, MarginCallDelegator {

    address public CALLER;
    address public CANCELLER;

    constructor(
        address margin,
        address caller,
        address canceller
    )
        public
        OnlyMargin(margin)
    {
        CALLER = caller;
        CANCELLER = canceller;
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

    function marginCallOnBehalfOf(
        address who,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (address)
    {
        if (who == CALLER) {
            return address(this);
        }

        revert();
    }

    function cancelMarginCallOnBehalfOf(
        address who,
        bytes32
    )
        onlyMargin
        external
        returns (address)
    {
        if (who == CANCELLER) {
            return address(this);
        }

        revert();
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
        revert();
    }
}
