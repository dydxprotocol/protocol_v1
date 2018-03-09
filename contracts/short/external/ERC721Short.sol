pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { ERC721Token } from "zeppelin-solidity/contracts/token/ERC721/ERC721Token.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ShortCloser } from "../interfaces/ShortCloser.sol";
import { Vault } from "../Vault.sol";
import { ShortSellCommon } from "../impl/ShortSellCommon.sol";
import { ShortSell } from "../ShortSell.sol";


/**
 * @title ERC721Short
 * @author dYdX
 */
 /* solium-disable-next-line */
contract ERC721Short is
    ERC721Token,
    ShortCloser,
    ReentrancyGuard {
    using SafeMath for uint256;

    // --------------------
    // ------ Events ------
    // --------------------

    mapping(address => mapping(address => bool)) public closeAllApprovals;

    // --------------------
    // ------ Events ------
    // --------------------

    event CloseAllApproval(
        address indexed _owner,
        address indexed _approved,
        bool _isApproved
    );

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ERC721Short(
        address _shortSell
    )
        public
        ShortCloser(_shortSell)
    {
    }

    // --------------------------------
    // ---- Token-Holder functions ----
    // --------------------------------

    function approveForCloseAll(
        address to,
        bool isApproved
    )
        nonReentrant
        external
    {
        closeAllApprovals[msg.sender][to] = isApproved;
        CloseAllApproval(msg.sender, to, isApproved);
    }

    function transferShort(
        bytes32 shortId,
        address to
    )
        nonReentrant
        external
    {
        _burn(uint256(shortId)); // requires msg.sender to be owner
        ShortSell(SHORT_SELL).transferShort(shortId, to);
    }

    // ---------------------------------
    // ---- OnlyShortSell Functions ----
    // ---------------------------------

    /**
     * Called by the ShortSell contract when anyone transfers ownership of a short to this contract.
     * This function mints a new ERC721 Token and returns this address to
     * indicate to ShortSell that it is willing to take ownership of the short.
     *
     * @param  from     Address of previous short owner
     * @param  shortId  Unique ID of the short
     * @return this address on success, throw otherwise
     */
    function recieveShortOwnership(
        address from,
        bytes32 shortId
    )
        onlyShortSell
        nonReentrant
        external
        returns (address owner)
    {
        _mint(from, uint256(shortId));
        return address(this); // returning own address retains ownership of short
    }

    /**
     * Called by ShortSell when an owner of this token is attempting to close some of the short
     * position. Implementation is required per ShortOwner contract in order to be used by
     * ShortSell to approve closing parts of a short position. If true is returned, this contract
     * must assume that ShortSell will either revert the entire transaction or that the specified
     * amount of the short position was successfully closed.

     * @param who              Address of the caller of the close function
     * @param shortId          Id of the short being closed
     * @param requestedAmount  Amount of the short being closed
     * @return allowedAmount   The amount the user is allowed to close for the specified short
     */
    function closeOnBehalfOf(
        address who,
        bytes32 shortId,
        uint256 requestedAmount
    )
        onlyShortSell
        nonReentrant
        external
        returns (uint256 _allowedAmount)
    {
        uint256 tokenId = uint256(shortId);
        address owner = ownerOf(tokenId);
        require(who == owner || closeAllApprovals[owner][who]);
        return requestedAmount;
    }
}
