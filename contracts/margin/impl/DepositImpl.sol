pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Vault } from "../Vault.sol";


/**
 * @title DepositImpl
 * @author dYdX
 *
 * This library contains the implementation for the deposit function of Margin
 */
library DepositImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * Additional deposit for a margin position was posted by the margin trader
     */
    event CollateralDeposited(
        bytes32 indexed marginId,
        uint256 amount,
        address depositor
    );

    /**
     * A loan call was canceled
     */
    event MarginCallCanceled(
        bytes32 indexed marginId,
        address indexed lender,
        address indexed trader,
        uint256 depositAmount
    );

    // ============ Public Implementation Functions ============

    function depositImpl(
        MarginState.State storage state,
        bytes32 marginId,
        uint256 depositAmount
    )
        public
    {
        MarginCommon.Position storage position = MarginCommon.getPositionObject(state, marginId);
        require(depositAmount > 0);
        require(msg.sender == position.trader);

        Vault(state.VAULT).transferToVault(
            marginId,
            position.quoteToken,
            msg.sender,
            depositAmount
        );

        // cancel loan call if applicable
        bool loanCanceled = false;
        uint256 requiredDeposit = position.requiredDeposit;
        if (position.callTimestamp > 0 && requiredDeposit > 0) {
            if (depositAmount >= requiredDeposit) {
                position.requiredDeposit = 0;
                position.callTimestamp = 0;
                loanCanceled = true;
            } else {
                position.requiredDeposit = position.requiredDeposit.sub(depositAmount);
            }
        }

        emit CollateralDeposited(
            marginId,
            depositAmount,
            msg.sender
        );

        if (loanCanceled) {
            emit MarginCallCanceled(
                marginId,
                position.lender,
                msg.sender,
                depositAmount
            );
        }
    }
}
