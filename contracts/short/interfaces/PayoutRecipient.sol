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
        address _shortSell
    )
        public
        OnlyShortSell(_shortSell)
    {
    }

    // ----------------------------------------
    // ------ Public Interface functions ------
    // ----------------------------------------

    /**
     * Function a contract must implement in order to recieve payout from being the payoutRecipient
     * in a closeShort transaction. May redistribute any payout as necessary. Throws on error.
     *
     * @param  _shortId          Id of the short
     * @param  _closeAmount      Amount of the short that was closed
     * @param  _shortCloser      Address of the account or contract that closed the short
     * @param  _shortSeller      Address of the owner of the short
     * @param  _baseToken        Address of the ERC20 base token
     * @param  _payoutBaseToken  Number of base tokens recieved from the payout
     * @param  _totalBaseToken   Total number of base tokens removed from vault during close

     */
    function recieveCloseShortPayout(
        bytes32 _shortId,
        uint256 _closeAmount,
        address _shortCloser,
        address _shortSeller,
        address _baseToken,
        uint256 _payoutBaseToken,
        uint256 _totalBaseToken
    )
        onlyShortSell
        external;
}
