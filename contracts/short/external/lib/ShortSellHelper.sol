pragma solidity 0.4.19;

import { ShortSell } from "../../ShortSell.sol";
import { ShortSellCommon } from "../../impl/ShortSellCommon.sol";


library ShortSellHelper {
    function getShort(
        address SHORT_SELL,
        bytes32 shortId
    )
        internal
        view
        returns (ShortSellCommon.Short memory _short)
    {
        var (
            addresses,
            values256,
            values32
        ) = ShortSell(SHORT_SELL).getShort(shortId);

        return ShortSellCommon.Short({
            underlyingToken:    addresses[0],
            baseToken:          addresses[1],
            shortAmount:        values256[0],
            closedAmount:       values256[1],
            annualInterestRate: values256[2],
            requiredDeposit:    values256[3],
            callTimeLimit:      values32[0],
            startTimestamp:     values32[1],
            callTimestamp:      values32[2],
            maxDuration:        values32[3],
            compoundingPeriod:  values32[4],
            lender:             addresses[2],
            seller:             addresses[3]
        });
    }
}
