pragma solidity 0.4.19;

import { ShortSellCommon } from "./ShortSellCommon.sol";


/**
 * @title ShortSellState
 * @author dYdX
 *
 * Contains state for the ShortSell contract. Also used by libraries that implement
 * ShortSell functions
 */
library ShortSellState {
    struct State {
        // Address of the Vault contract
        address VAULT;

        // Address of the Proxy contract
        address PROXY;

        // Mapping from loanHash -> amount, which stores the amount of a loan which has
        // already been filled
        mapping (bytes32 => uint256) loanFills;

        // Mapping from loanHash -> amount, which stores the amount of a loan which has
        // already been canceled
        mapping (bytes32 => uint256) loanCancels;

        // Mapping from loanHash -> number, which stores the number of shorts taken out
        // for a given loan
        mapping (bytes32 => uint256) loanNumbers;

        // Mapping from loanHash -> bool, which stores whether the order has been pre-approved
        // on-chain by the lender. This will typically be used to allow smart contracts to make
        // on-chain loan offerings
        mapping (bytes32 => bool) isLoanApproved;

        // Mapping that contains all short sells. Mapped by: shortId -> Short
        mapping (bytes32 => ShortSellCommon.Short) shorts;

        mapping (bytes32 => bool) closedShorts;
    }
}
