pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { DetailedERC20 } from "zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { ERC20Position } from "./ERC20Position.sol";
import { Margin } from "../../Margin.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";


/**
 * @title ERC20Long
 * @author dYdX
 *
 * Contract used to tokenize leveraged long positions and allow them to be used as ERC20-compliant
 * tokens. Holding the tokens allows the holder to close a piece of the position, or be
 * entitled to some amount of heldTokens after settlement.
 *
 * The total supply of leveraged long tokens is always exactly equal to the number of heldTokens
 * held in collateral in the backing position
 */
contract ERC20Long is ERC20Position {
    constructor(
        bytes32 positionId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients
    )
        public
        ERC20Position(
            positionId,
            margin,
            initialTokenHolder,
            trustedRecipients,
            "d/LL"
        )
    {}

    // ============ Public Constant Functions ============

    function decimals()
        external
        view
        returns (uint8)
    {
        return
            DetailedERC20(heldToken).decimals();
    }

    // ============ Internal Functions ============

    function getTokenAmountOnAdd(
        bytes32 positionId,
        uint256 /* principalAdded */
    )
        internal
        view
        returns (uint256)
    {
        uint256 positionBalance = Margin(DYDX_MARGIN).getPositionBalance(positionId);

        return positionBalance.sub(totalSupply_);
    }

    /**
     * The amount of long tokens burned on a close is always exactly equal to the amount of
     * heldTokens used for the close in the backing position
     *
     * NOTE: It's possible that it is impossible for a token holder to close his entire token
     *       balance. If the principal of the backing position is less than the supply of long
     *       tokens it is not possible to express every token amount in a principal amount.
     */
    function getCloseAmounts(
        uint256 requestedCloseAmount,
        uint256 balance,
        uint256 positionPrincipal
    )
        internal
        view
        returns (
            uint256 /* tokenAmount */,
            uint256 /* allowedCloseAmount */
        )
    {
        uint256 requestedTokenAmount = MathHelpers.getPartialAmount(
            requestedCloseAmount,
            positionPrincipal,
            totalSupply_
        );

        if (requestedTokenAmount <= balance) {
            return (requestedTokenAmount, requestedCloseAmount);
        }

        // The maximum amount of principal able to be closed without using more heldTokens
        // than balance
        uint256 maxAllowedCloseAmount = MathHelpers.getPartialAmount(
            balance,
            totalSupply_,
            positionPrincipal
        );

        uint256 tokenAmount = MathHelpers.getPartialAmount(
            maxAllowedCloseAmount,
            positionPrincipal,
            totalSupply_
        );

        return (tokenAmount, maxAllowedCloseAmount);
    }

    function getNameIntro()
        internal
        pure
        returns (bytes)
    {
        return "dYdX Leveraged Long Token";
    }
}
