pragma solidity 0.4.19;

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
     * @param  shortId          Id of the short
     * @param  closeAmount      Amount of the short that was closed
     * @param  shortCloser      Address of the account or contract that closed the short
     * @param  shortSeller      Address of the owner of the short
     * @param  baseToken        Address of the ERC20 base token
     * @param  payoutBaseToken  Number of base tokens received from the payout
     * @param  totalBaseToken   Total number of base tokens removed from vault during close
     */
    function receiveCloseShortPayout(
        bytes32 shortId,
        uint256 closeAmount,
        address shortCloser,
        address shortSeller,
        address baseToken,
        uint256 payoutBaseToken,
        uint256 totalBaseToken
    )
        onlyShortSell
        external;
}
