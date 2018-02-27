pragma solidity 0.4.19;

import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ContractHelper } from "../../lib/ContractHelper.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellGetters } from "./ShortSellGetters.sol";


/**
 * @title TransferImpl
 * @author dYdX
 *
 * This library contains the implementation for transferring ownership of loans and shorts
 */
library TransferImpl {

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * Ownership of a loan was transfered to a new address
     */
    event LoanTransfered(
        bytes32 indexed id,
        address from,
        address to
    );

    /**
     * Ownership of a short was transfered to a new address
     */
    event ShortTransfered(
        bytes32 indexed id,
        address from,
        address to
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    /**
     * Internal implementatino of transferring laon ownership to a new address. Requires recieving
     * contracts to implement the LoanOwner interface.
     *
     * NOTE: We can get the _oldLender from _state, but this requires a call into storage. Since
     * this function is only called internally, we trust that _oldLender is set correctly.
     *
     * @param  _state      fasdfasfa
     * @param  _shortId    afsadfasf
     * @param  _oldLender  fasdfaf
     * @param _newLender  asdfasfdaf
     */
    function transferLoanImpl(
        ShortSellState.State storage _state,
        bytes32 _shortId,
        address _oldLender,
        address _newLender
    )
        public
    {
        require(_oldLender != _newLender);

        LoanTransfered(
            _shortId,
            _oldLender,
            _newLender
        );

        // Check to see if the recieving address is a contract. If so, that contract must
        // implement the LoanOwner interface.
        if (ContractHelper.isContract(_newLender)) {
            address nextOwner = LoanOwner(_newLender).recieveLoanOwnership(_oldLender, _shortId);

            require(nextOwner != address(0)); // address(0) is for rejecting ownership

            // If the recieving contract wants to pass-on ownership, then recurse
            if (nextOwner != _newLender) {
                return transferLoanImpl(
                    _state,
                    _shortId,
                    _newLender,
                    nextOwner);
            }
        }

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        _state.shorts[_shortId].lender = _newLender;
    }

    /**
     * Internal implementatino of transferring short ownership to a new address. Requires recieving
     * contracts to implement the ShortOwner interface.
     *
     * NOTE: We can get the _oldSeller from _state, but this requires a call into storage. Since
     * this function is only called internally, we trust that _oldSeller is set correctly.
     *
     * @param  _state      asdfasfa
     * @param  _shortId    asfdafasfs
     * @param  _oldSeller  asfdasfafs
     * @param _newSeller  asdfafsf
     */
    function transferShortImpl(
        ShortSellState.State storage _state,
        bytes32 _shortId,
        address _oldSeller,
        address _newSeller
    )
        public
    {
        require(_oldSeller != _newSeller);

        ShortTransfered(
            _shortId,
            _oldSeller,
            _newSeller
        );

        // Check to see if the recieving address is a contract. If so, that contract must
        // implement the ShortOwner interface.
        if (ContractHelper.isContract(_newSeller)) {
            address nextOwner = ShortOwner(_newSeller).recieveShortOwnership(_oldSeller, _shortId);

            require(nextOwner != address(0)); // address(0) is for rejecting ownership

            // If the recieving contract wants to pass-on ownership, then recurse
            if (nextOwner != _newSeller) {
                return transferShortImpl(
                    _state,
                    _shortId,
                    _newSeller,
                    nextOwner);
            }
        }

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        _state.shorts[_shortId].seller = _newSeller;
    }
}
