pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { StandardToken } from "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import { DetailedERC20 } from "zeppelin-solidity/contracts/token/ERC20/DetailedERC20.sol";


contract TokenizedShort is StandardToken, ReentrancyGuard {
    using SafeMath for uint;

    // -----------------------
    // ------- Structs -------
    // -----------------------

    enum State {
        UNINITIALIZED,
        OPEN,
        CLOSED
    }

    // ------------------------
    // -------- Events --------
    // ------------------------

    event TokensRedeemed(
        address indexed redeemer,
        uint value,
        uint payout
    );

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Address of the ShortSell contract
    address public SHORT_SELL;

    // id of the short this contract is tokenizing
    bytes32 public shortId;

    // Name of this token (as ERC20 standard)
    string public name;

    // Symbol of this token (as ERC20 standard)
    string public symbol;

    // Decimal places of this token (as ERC20 standard)
    uint8 public decimals;

    // All tokens will initially be allocated to this address
    address public initialTokenHolder;

    // Amount of tokens that were originally minted
    uint256 public initialSupply;

    // Amount of tokens that have been redeemed
    uint256 public redeemed;


    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function TokenizedShort(
        address _shortSell,
        address _initialTokenHolder,
        bytes32 _shortId,
        uint256 _initialSupply,
        string _name,
        string _symbol,
        uint8 _decimals
    )
        public
    {
        SHORT_SELL = _shortSell;
        shortId = _shortId;
        state = State.UNINITIALIZED;
        totalSupply = _initialSupply;
        balances[initialTokenHolder] = _initialSupply;
        name = _name;
        symbol = _symbol;
        initialTokenHolder = _initialTokenHolder;
        decimals = _decimals;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    function redeemOnBehalfOf(
        address who,
        uint256 amount
    )
        external
        returns (bool _success)
    {
        require(msg.sender == SHORT_SELL);
        require(balances[who] >= amount);
        balances[who] = balances[who].sub(amount);
        totalSupply_ = totalSupply_.sub(amount);
        redeemed = redeemed.add(amount);
        return true;
    }
}
