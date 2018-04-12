pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Vault } from "../Vault.sol";
import { ForceRecoverDepositDelegator } from "../interfaces/ForceRecoverDepositDelegator.sol";


/**
 * @title ForceRecoverDepositImpl
 * @author dYdX
 *
 * This library contains the implementation for the forceRecoverDeposit function of Margin
 */
library ForceRecoverDepositImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * The collateral for a margin position was forcibly recovered by the lender
     */
    event PositionCollateralRecovered(
        bytes32 indexed marginId,
        uint256 amount
    );

    // ============ Public Implementation Functions ============

    function forceRecoverDepositImpl(
        MarginState.State storage state,
        bytes32 marginId
    )
        public
        returns (uint256)
    {
        MarginCommon.Position storage position = MarginCommon.getPositionObject(state, marginId);

        // Can only force recover after either:
        // 1) The loan was called and the call period has elapsed
        // 2) The maxDuration of the margin position has elapsed
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
                ForceRecoverDepositDelegator(position.lender).forceRecoverDepositOnBehalfOf(
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
        // NOTE: Since position is a storage pointer, this will set all of position's fields to 0
        MarginCommon.cleanupPosition(
            state,
            marginId
        );

        // Log an event
        emit PositionCollateralRecovered(
            marginId,
            lenderQuoteTokenAmount
        );

        return lenderQuoteTokenAmount;
    }
}
