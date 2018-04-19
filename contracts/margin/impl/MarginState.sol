pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { MarginCommon } from "./MarginCommon.sol";


/**
 * @title MarginState
 * @author dYdX
 *
 * Contains state for the Margin contract. Also used by libraries that implement
 * Margin functions
 */
library MarginState {
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

        // Mapping from loanHash -> number, which stores the number of unique positions taken out
        // for a given loan
        mapping (bytes32 => uint256) loanNumbers;

        // Mapping from loanHash -> bool, which stores whether the order has been pre-approved
        // on-chain by the lender. This will typically be used to allow smart contracts to make
        // on-chain loan offerings
        mapping (bytes32 => bool) approvedLoans;

        // Mapping from positionId -> Position, which stores all the open margin positions.
        mapping (bytes32 => MarginCommon.Position) positions;

        // Mapping from positionId -> bool, which stores whether the position has previously been
        // open, but is now closed.
        mapping (bytes32 => bool) closedPositions;

        // Mapping from positionId -> uint256, which stores the total amount of owedToken that has
        // ever been repaid to the lender for each position. Does not reset.
        mapping (bytes32 => uint256) totalOwedTokenRepaidToLender;
    }
}
