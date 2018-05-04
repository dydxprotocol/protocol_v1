pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Vault } from "../Vault.sol";


/**
 * @title DepositCollateralImpl
 * @author dYdX
 *
 * This library contains the implementation for the deposit function of Margin
 */
library DepositCollateralImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * Additional collateral for a position was posted by the owner
     */
    event AdditionalCollateralDeposited(
        bytes32 indexed positionId,
        uint256 amount,
        address depositor
    );

    /**
     * A margin call was canceled
     */
    event MarginCallCanceled(
        bytes32 indexed positionId,
        address indexed lender,
        address indexed owner,
        uint256 depositAmount
    );

    // ============ Public Implementation Functions ============

    function depositCollateralImpl(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 depositAmount
    )
        public
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);
        require(
            depositAmount > 0,
            "DepositCollateralImpl#depositCollateralImpl: Deposit amount cannot be 0"
        );
        require(
            msg.sender == position.owner,
            "DepositCollateralImpl#depositCollateralImpl: Only position owner can deposit"
        );

        Vault(state.VAULT).transferToVault(
            positionId,
            position.heldToken,
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

        emit AdditionalCollateralDeposited(
            positionId,
            depositAmount,
            msg.sender
        );

        if (loanCanceled) {
            emit MarginCallCanceled(
                positionId,
                position.lender,
                msg.sender,
                depositAmount
            );
        }
    }
}
