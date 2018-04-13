pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { OnlyMargin } from "./OnlyMargin.sol";


/**
 * @title PayoutRecipient
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to be the payoutRecipient in a closePosition
 * transaction.
 */
contract PayoutRecipient is OnlyMargin {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function PayoutRecipient(
        address margin
    )
        public
        OnlyMargin(margin)
    {
    }

    // ----------------------------------------
    // ------ Public Interface functions ------
    // ----------------------------------------

    /**
     * Function a contract must implement in order to receive payout from being the payoutRecipient
     * in a closePosition transaction. May redistribute any payout as necessary. Throws on error.
     *
     * @param  marginId           Unique ID of the position
     * @param  closeAmount        Amount of the short that was closed
     * @param  shortCloser        Address of the account or contract that closed the short
     * @param  shortSeller        Address of the owner of the short
     * @param  quoteToken         Address of the ERC20 quote token
     * @param  payout             Number of tokens received from the payout
     * @param  totalQuoteToken    Total number of quote tokens removed from vault during close
     * @param  payoutInQuoteToken True if payout is in quote token, false if in base token
     * @return                    True if approved by the reciever
     */
    function receiveClosePositionPayout(
        bytes32 marginId,
        uint256 closeAmount,
        address shortCloser,
        address shortSeller,
        address quoteToken,
        uint256 payout,
        uint256 totalQuoteToken,
        bool    payoutInQuoteToken

    )
        onlyMargin
        external
        returns (bool);
}
