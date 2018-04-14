pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Vault } from "../Vault.sol";
import { ForceRecoverCollateralDelegator } from "../interfaces/ForceRecoverCollateralDelegator.sol";


/**
 * @title ForceRecoverCollateralImpl
 * @author dYdX
 *
 * This library contains the implementation for the forceRecoverCollateral function of Margin
 */
library ForceRecoverCollateralImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * A short sell loan was forcibly recovered by the lender
     */
    event CollateralForceRecovered(
        bytes32 indexed marginId,
        uint256 amount
    );

    // ============ Public Implementation Functions ============

    function forceRecoverCollateralImpl(
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
                ForceRecoverCollateralDelegator(position.lender).forceRecoverCollateralOnBehalfOf(
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
        emit CollateralForceRecovered(
            marginId,
            lenderQuoteTokenAmount
        );

        return lenderQuoteTokenAmount;
    }
}