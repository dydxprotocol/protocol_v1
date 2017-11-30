pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/ownership/NoOwner.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';
import '../ShortSell.sol';
import './MultiownedLenderRepo.sol';

/**
 * @title MultiownedLender
 * @author Antonio Juliano
 *
 * This contract allows lenders to designate addresses to call in loans on their behalf
 */
contract MultiownedLender is Ownable, DelayedUpdate, NoOwner {
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    address public SHORT_SELL;
    address public REPO;

    // ------------------------
    // -------- Events --------
    // ------------------------

    event LoanCallerAuthorized(
        bytes32 indexed shortId,
        address indexed lender,
        address indexed who
    );

    event LoanCallerDeauthorized(
        bytes32 indexed shortId,
        address indexed lender,
        address indexed who
    );

    // -------------------------
    // ------- Modifiers -------
    // -------------------------

    modifier onlyLender(bytes32 shortId) {
        require(msg.sender == MultiownedLenderRepo(REPO).lenders(shortId));
        _;
    }

    modifier onlyLenderAndLoanCallers(bytes32 shortId) {
        MultiownedLenderRepo repo = MultiownedLenderRepo(REPO);
        require(
            msg.sender == repo.lenders(shortId)
            || repo.authorizeToCallLoan(shortId, msg.sender)
        );
        _;
    }

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function MultiownedLender(
        address _shortSell,
        address _repo,
        uint _updateDelay,
        uint _updateExpiration
    )
        Ownable()
        DelayedUpdate(_updateDelay, _updateExpiration)
        public
    {
        SHORT_SELL = _shortSell;
        REPO = _repo;
    }

    // -----------------------------
    // ------ Admin Functions ------
    // -----------------------------

    function updateShortSell(
        address _shortSell
    )
        onlyOwner
        delayedAddressUpdate("SHORT_SELL", _trader)
        external
    {
        SHORT_SELL = _shortSell;
    }

    function updateRepo(
        address _repo
    )
        onlyOwner
        delayedAddressUpdate("REPO", _trader)
        external
    {
        REPO = _repo;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    function authorizeToCallLoan(
        bytes32 shortId,
        address who
    ) onlyLenderAndLoanCallers external {
        MultiownedLenderRepo(REPO).setAuthorizedToCallLoan(
            shortId,
            who,
            true
        );

        LoanCallerAuthorized(
            shortId,
            repo.lenders(shortId),
            who
        );
    }

    function deauthorizeToCallLoan(
        bytes32 shortId,
        address who
    ) onlyLenderAndLoanCallers external {
        MultiownedLenderRepo(REPO).setAuthorizedToCallLoan(
            shortId,
            who,
            false
        );

        LoanCallerDeauthorized(
            shortId,
            lender,
            who
        );
    }

    function callInLoan(
        bytes32 shortId
    ) onlyLenderAndLoanCallers external {
        ShortSell(SHORT_SELL).callInLoan(shortId);
    }

    function cancelLoanCall(
        bytes32 shortId
    ) onlyLenderAndLoanCallers external {
        ShortSell(SHORT_SELL).cancelLoanCall(shortId);
    }

    function forceRecoverLoan(
        bytes32 shortId
    ) onlyLenderAndLoanCallers external returns (
        uint _baseTokenAmount
    ) {
        return ShortSell(SHORT_SELL).forceRecoverLoan(shortId);
    }
}
