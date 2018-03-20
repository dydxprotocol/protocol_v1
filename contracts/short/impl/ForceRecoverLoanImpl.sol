pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { Vault } from "../Vault.sol";
import { ForceRecoverLoanDelegator } from "../interfaces/ForceRecoverLoanDelegator.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


/**
 * @title ForceRecoverLoanImpl
 * @author dYdX
 *
 * This library contains the implementation for the forceRecoverLoan function of ShortSell
 */
library ForceRecoverLoanImpl {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short sell loan was forcibly recovered by the lender
     */
    event LoanForceRecovered(
        bytes32 indexed id,
        uint256 amount
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function forceRecoverLoanImpl(
        ShortSellState.State storage state,
        bytes32 shortId
    )
        public
        returns (uint256 _baseTokenAmount)
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        // Can only force recover after the entire call period has elapsed
        // This can either be after the loan was called or after the expirationTimestamp of the short
        // position has elapsed (plus the call time)
        require( /* solium-disable-next-line */
            (
                short.callTimestamp > 0
                && block.timestamp >= uint256(short.callTimestamp).add(uint256(short.callTimeLimit))
            ) || (
                block.timestamp >= short.expirationTimestamp
            )
        );

        // If not the lender, requires the lender to approve msg.sender
        if (msg.sender != short.lender) {
            require(
                ForceRecoverLoanDelegator(short.lender).forceRecoverLoanOnBehalfOf(
                    msg.sender,
                    shortId
                )
            );
        }

        // Send the tokens
        Vault vault = Vault(state.VAULT);
        uint256 lenderBaseTokenAmount = vault.balances(shortId, short.baseToken);
        vault.transferFromVault(
            shortId,
            short.baseToken,
            short.lender,
            lenderBaseTokenAmount
        );

        // Delete the short
        // NOTE: Since short is a storage pointer, this will also set all of short's fields to 0
        ShortSellCommon.cleanupShort(
            state,
            shortId
        );

        // Log an event
        LoanForceRecovered(
            shortId,
            lenderBaseTokenAmount
        );

        return lenderBaseTokenAmount;
    }
}
