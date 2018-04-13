pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Vault } from "../Vault.sol";
import { ForceRecoverLoanDelegator } from "../interfaces/ForceRecoverLoanDelegator.sol";


/**
 * @title ForceRecoverLoanImpl
 * @author dYdX
 *
 * This library contains the implementation for the forceRecoverLoan function of Margin
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
        bytes32 indexed marginId,
        uint256 amount
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function forceRecoverLoanImpl(
        MarginState.State storage state,
        bytes32 marginId
    )
        public
        returns (uint256)
    {
        MarginCommon.Position storage position = MarginCommon.getPositionObject(state, marginId);

        // Can only force recover after either:
        // 1) The loan was called and the call period has elapsed
        // 2) The maxDuration of the short has elapsed
        require( /* solium-disable-next-line */
            (
                position.callTimestamp > 0
                && block.timestamp >= uint256(position.callTimestamp).add(position.callTimeLimit)
            ) || (
                block.timestamp >= uint256(position.startTimestamp).add(position.maxDuration)
            )
        );

        // If not the lender, requires the lender to approve msg.sender
        if (msg.sender != position.lender) {
            require(
                ForceRecoverLoanDelegator(position.lender).forceRecoverLoanOnBehalfOf(
                    msg.sender,
                    marginId
                )
            );
        }

        // Send the tokens
        Vault vault = Vault(state.VAULT);
        uint256 lenderQuoteTokenAmount = vault.balances(marginId, position.quoteToken);
        vault.transferFromVault(
            marginId,
            position.quoteToken,
            position.lender,
            lenderQuoteTokenAmount
        );

        // Delete the position
        // NOTE: Since position is a storage pointer, this will also set all fields to 0
        MarginCommon.cleanupPosition(
            state,
            marginId
        );

        // Log an event
        emit LoanForceRecovered(
            marginId,
            lenderQuoteTokenAmount
        );

        return lenderQuoteTokenAmount;
    }
}
