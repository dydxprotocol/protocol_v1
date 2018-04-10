pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title DepositImpl
 * @author dYdX
 *
 * This library contains the implementation for the deposit function of ShortSell
 */
library DepositImpl {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * Additional deposit for a short sell was posted by the short seller
     */
    event AdditionalDeposit(
        bytes32 indexed id,
        uint256 amount,
        address depositor
    );

    /**
     * A loan call was canceled
     */
    event LoanCallCanceled(
        bytes32 indexed id,
        address indexed lender,
        address indexed shortSeller,
        uint256 depositAmount
    );

    // -----------------------------------------
    // ---- Public Implementation Functions ----
    // -----------------------------------------

    function depositImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 depositAmount
    )
        public
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);
        require(depositAmount > 0);
        require(msg.sender == short.seller);

        Vault(state.VAULT).transferToVault(
            shortId,
            short.quoteToken,
            msg.sender,
            depositAmount
        );

        // cancel loan call if applicable
        bool loanCanceled = false;
        uint256 requiredDeposit = short.requiredDeposit;
        if (short.callTimestamp > 0 && requiredDeposit > 0) {
            if (depositAmount >= requiredDeposit) {
                short.requiredDeposit = 0;
                short.callTimestamp = 0;
                loanCanceled = true;
            } else {
                short.requiredDeposit = short.requiredDeposit.sub(depositAmount);
            }
        }

        emit AdditionalDeposit(
            shortId,
            depositAmount,
            msg.sender
        );

        if (loanCanceled) {
            emit LoanCallCanceled(
                shortId,
                short.lender,
                msg.sender,
                depositAmount
            );
        }
    }
}
