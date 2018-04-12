pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { OnlyMargin } from "./OnlyMargin.sol";


/**
 * @title PayoutRecipient
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to be the payoutRecipient in a
 * closePosition transaction.
 */
contract PayoutRecipient is OnlyMargin {

    // ============ Constructor ============

    function PayoutRecipient(
        address margin
    )
        public
        OnlyMargin(margin)
    {
    }

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to receive payout from being the payoutRecipient
     * in a ClosePosition transaction. May redistribute any payout as necessary. Throws on error.
     *
     * @param  marginId          Unique ID of the margin position
     * @param  closeAmount       Amount of the position that was closed
     * @param  positionCloser    Address of the account or contract that closed the position
     * @param  trader            Address of the owner of the position
     * @param  quoteToken        Address of the ERC20 quote token
     * @param  payoutQuoteToken  Number of quote tokens received from the payout
     * @param  totalQuoteToken   Total number of quote tokens removed from vault during close
     * @return                   True if approved by the reciever
     */
    function receiveClosePositionPayout(
        bytes32 marginId,
        uint256 closeAmount,
        address positionCloser,
        address trader,
        address quoteToken,
        uint256 payoutQuoteToken,
        uint256 totalQuoteToken
    )
        onlyMargin
        external
        returns (bool);
}
