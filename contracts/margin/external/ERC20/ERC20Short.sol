pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { DetailedERC20 } from "zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { ERC20Position } from "./ERC20Position.sol";
import { Margin } from "../../Margin.sol";


/**
 * @title ERC20Short
 * @author dYdX
 *
 * Contract used to tokenize short positions and allow them to be used as ERC20-compliant
 * tokens. Holding the tokens allows the holder to close a piece of the short position, or be
 * entitled to some amount of heldTokens after settlement.
 *
 * The total supply of short tokens is always exactly equal to the amount of principal in
 * the backing position
 */
contract ERC20Short is ERC20Position {
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
            "d/S"
        )
    {}

    // ============ Public Constant Functions ============

    function decimals()
        external
        view
        returns (uint8)
    {
        return
            DetailedERC20(
                Margin(DYDX_MARGIN).getPositionOwedToken(POSITION_ID)
            ).decimals();
    }

    // ============ Internal Functions ============

    function getTokenAmountOnAdd(
        bytes32 /* positionId */,
        uint256 principalAdded
    )
        internal
        view
        returns (uint256)
    {
        return principalAdded;
    }

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
        assert(positionPrincipal == totalSupply_);

        uint256 amount = Math.min256(balance, requestedCloseAmount);

        return (amount, amount);
    }

    function getNameIntro()
        internal
        pure
        returns (bytes)
    {
        return "dYdX Short Token";
    }
}
