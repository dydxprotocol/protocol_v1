pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";
import { PositionOwner } from "../../interfaces/PositionOwner.sol";


/**
 * @title ERC20PositionCreator
 * @author dYdX
 *
 * Contains common code for ERC20ShortCreator and ERC20LongCreator
 */
 /* solium-disable-next-line */
contract ERC20PositionCreator is
    ReentrancyGuard,
    NoOwner,
    OnlyMargin,
    PositionOwner
{
    // ============ Events ============

    event TokenCreated(
        bytes32 indexed positionId,
        address tokenAddress
    );

    // ============ State Variables ============

    // Recipients that will fairly verify and redistribute funds from closing the position
    address[] public TRUSTED_RECIPIENTS;

    // ============ Constructor ============

    constructor(
        address margin,
        address[] trustedRecipients
    )
        public
        OnlyMargin(margin)
    {
        for (uint256 i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS.push(trustedRecipients[i]);
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Implementation of PositionOwner functionality. Creates a new ERC20Short and assigns
     * ownership to the ERC20Short. Called by Margin when a postion is transferred to this
     * contract.
     *
     * @param  from  Address of the previous owner of the position
     * @return       Address of the new ERC20Short contract
     */
    function receivePositionOwnership(
        address from,
        bytes32 positionId
    )
        external
        onlyMargin
        returns (address)
    {
        address tokenAddress = createTokenContract(
            from,
            positionId
        );

        emit TokenCreated(positionId, tokenAddress);

        return tokenAddress;
    }

    function marginPositionIncreased(
        address,
        bytes32,
        uint256
    )
        external
        onlyMargin
        returns (bool)
    {
        // This should never happen
        assert(false);
    }

    // ============ Internal Abstract Functions ============

    function createTokenContract(
        address from,
        bytes32 positionId
    )
        internal
        returns (address);
}
