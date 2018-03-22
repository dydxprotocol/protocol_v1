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
            underlyingToken,
            baseToken,
            shortAmount,
            closedAmount,
            interestRate,
            requiredDeposit,
            callTimeLimit,
            startTimestamp,
            callTimestamp,
            maxDuration,
            lender,
            seller
        ) = ShortSell(SHORT_SELL).getShort(shortId);

        return ShortSellCommon.Short({
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            shortAmount: shortAmount,
            closedAmount: closedAmount,
            interestRate: interestRate,
            requiredDeposit: requiredDeposit,
            callTimeLimit: callTimeLimit,
            startTimestamp: startTimestamp,
            callTimestamp: callTimestamp,
            maxDuration: maxDuration,
            lender: lender,
            seller: seller
        });
    }
}
