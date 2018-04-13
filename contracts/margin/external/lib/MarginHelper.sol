pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { Margin } from "../../Margin.sol";
import { MarginCommon } from "../../impl/MarginCommon.sol";


/**
 * @title MarginHelper
 * @author dYdX
 *
 * This library contains helper functions for interacting with Margin
 */
library MarginHelper {
    function getShort(
        address MARGIN,
        bytes32 marginId
    )
        internal
        view
        returns (MarginCommon.Short memory)
    {
        address[4] memory addresses;
        uint256[3] memory values256;
        uint32[6] memory values32;

        (
            addresses,
            values256,
            values32
        ) = Margin(MARGIN).getShort(marginId);

        return MarginCommon.Short({
            baseToken: addresses[0],
            quoteToken: addresses[1],
            lender: addresses[2],
            seller: addresses[3],
            shortAmount: values256[0],
            closedAmount: values256[1],
            requiredDeposit: values256[2],
            callTimeLimit: values32[0],
            startTimestamp: values32[1],
            callTimestamp: values32[2],
            maxDuration: values32[3],
            interestRate: values32[4],
            interestPeriod: values32[5]
        });
    }
}