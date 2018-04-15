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
     * in a closePosition transaction. May redistribute any payout as necessary. Throws on error.
     *
     * @param  positionId         Unique ID of the position
     * @param  closeAmount        Amount of the position that was closed
     * @param  closer             Address of the account or contract that closed the position
     * @param  positionOwner      Address of the owner of the position
     * @param  quoteToken         Address of the ERC20 quote token
     * @param  payout             Number of tokens received from the payout
     * @param  totalQuoteToken    Total number of quote tokens removed from vault during close
     * @param  payoutInQuoteToken True if payout is in quote token, false if in base token
     * @return                    True if approved by the reciever
     */
    function receiveClosePositionPayout(
        bytes32 positionId,
        uint256 closeAmount,
        address closer,
        address positionOwner,
        address quoteToken,
        uint256 payout,
        uint256 totalQuoteToken,
        bool    payoutInQuoteToken

    )
        external
        onlyMargin
        returns (bool);
}
