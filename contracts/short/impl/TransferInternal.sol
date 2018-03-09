pragma solidity 0.4.19;

import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ContractHelper } from "../../lib/ContractHelper.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellGetters } from "./ShortSellGetters.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";


/**
 * @title TransferInternal
 * @author dYdX
 *
 * This library contains the implementation for transferring ownership of loans and shorts
 */
library TransferInternal {

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * Ownership of a loan was transfered to a new address
     */
    event LoanTransfered(
        bytes32 indexed id,
        address indexed from,
        address indexed to
    );

    /**
     * Ownership of a short was transfered to a new address
     */
    event ShortTransfered(
        bytes32 indexed id,
        address indexed from,
        address indexed to
    );

    // ---------------------------------------------
    // ----- Internal Implementation Functions -----
    // ---------------------------------------------

    function grantLoanOwnership(
        bytes32 shortId,
        address oldOwner,
        address newOwner
    )
        internal
        returns (address _newOwner)
    {
        // log event except upon short creation
        if (oldOwner != address(0)) {
            LoanTransfered(shortId, oldOwner, newOwner);
        }

        if (ContractHelper.isContract(newOwner)) {
            address nextOwner = LoanOwner(newOwner).recieveLoanOwnership(oldOwner, shortId);
            if (nextOwner != newOwner) {
                return grantLoanOwnership(shortId, newOwner, nextOwner);
            }
        }
        require (newOwner != address(0));
        return newOwner;
    }

    function grantShortOwnership(
        bytes32 shortId,
        address oldOwner,
        address newOwner
    )
        internal
        returns (address _newOwner)
    {
        // log event except upon short creation
        if (oldOwner != address(0)) {
            ShortTransfered(shortId, oldOwner, newOwner);
        }

        if (ContractHelper.isContract(newOwner)) {
            address nextOwner = ShortOwner(newOwner).recieveShortOwnership(oldOwner, shortId);
            if (nextOwner != newOwner) {
                return grantShortOwnership(shortId, newOwner, nextOwner);
            }
        }
        require (newOwner != address(0));
        return newOwner;
    }
}
