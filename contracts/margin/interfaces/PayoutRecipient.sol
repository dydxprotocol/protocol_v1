pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { OnlyShortSell } from "./OnlyShortSell.sol";


/**
 * @title PayoutRecipient
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to be the payoutRecipient in a closeShort
 * transaction.
 */
contract PayoutRecipient is OnlyShortSell {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function PayoutRecipient(
        address shortSell
    )
        public
        OnlyShortSell(shortSell)
    {
    }

    // ----------------------------------------
    // ------ Public Interface functions ------
    // ----------------------------------------

    /**
     * Function a contract must implement in order to receive payout from being the payoutRecipient
     * in a closeShort transaction. May redistribute any payout as necessary. Throws on error.
     *
     * @param  shortId            Unique ID of the short
     * @param  closeAmount        Amount of the short that was closed
     * @param  shortCloser        Address of the account or contract that closed the short
     * @param  shortSeller        Address of the owner of the short
     * @param  quoteToken         Address of the ERC20 quote token
     * @param  payout             Number of tokens received from the payout
     * @param  totalQuoteToken    Total number of quote tokens removed from vault during close
     * @param  payoutInQuoteToken True if payout is in quote token, false if in base token
     * @return                    True if approved by the reciever
     */
    function receiveCloseShortPayout(
        bytes32 shortId,
        uint256 closeAmount,
        address shortCloser,
        address shortSeller,
        address quoteToken,
        uint256 payout,
        uint256 totalQuoteToken,
        bool    payoutInQuoteToken

    )
        onlyShortSell
        external
        returns (bool);
}
