pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { DetailedERC20 } from "zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";
import { ERC20Position } from "./ERC20Position.sol";
import { Margin } from "../../Margin.sol";


/**
 * @title ERC20Long
 * @author dYdX
 *
 * Contract used to tokenize leveraged long positions and allow them to be used as ERC20-compliant
 * tokens. Holding the tokens allows the holder to close a piece of the position, or be
 * entitled to some amount of heldTokens after settlement.
 */
contract ERC20Long is ERC20Position {
    function ERC20Long(
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

    function getAddedTokenAmount(
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

    function getNameIntro()
        internal
        pure
        returns (bytes)
    {
        return "dYdX Leveraged-Long";
    }
}
