pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { ShortSellState } from "./impl/ShortSellState.sol";
import { ShortImpl } from "./impl/ShortImpl.sol";
import { CloseShortImpl } from "./impl/CloseShortImpl.sol";
import { LoanImpl } from "./impl/LoanImpl.sol";
import { ForceRecoverLoanImpl } from "./impl/ForceRecoverLoanImpl.sol";
import { PlaceSellbackBidImpl } from "./impl/PlaceSellbackBidImpl.sol";
import { ShortSellCommon } from "./impl/ShortSellCommon.sol";
import { ShortSellEvents } from "./impl/ShortSellEvents.sol";
import { ShortSellAdmin } from "./impl/ShortSellAdmin.sol";
import { ShortSellRepo } from "./ShortSellRepo.sol";
import { Vault } from "./vault/Vault.sol";
import { ShortSellAuctionRepo } from "./ShortSellAuctionRepo.sol";


/**
 * @title ShortSell
 * @author dYdX
 *
 * This contract is used to facilitate short selling as per the dYdX short sell protocol
 */
 /* solium-disable-next-line */
contract ShortSell is
    Ownable,
    NoOwner,
    ReentrancyGuard,
    ShortSellEvents,
    ShortSellAdmin {

    using SafeMath for uint;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    /**
     * Struct holding the entire state of ShortSell
     */
    ShortSellState.State state;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortSell(
        address _vault,
        address _repo,
        address _auction_repo,
        address _trader,
        address _proxy
    )
        Ownable()
        ShortSellAdmin()
        public
    {
        state = ShortSellState.State({
            VAULT: _vault,
            REPO: _repo,
            TRADER: _trader,
            PROXY: _proxy,
            AUCTION_REPO: _auction_repo
        });
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    /**
     * Initiate a short sell. Called by the short seller. Short seller must provide both a
     * signed loan offering as well as a signed 0x buy order for the underlying token to
     * be shorted
     *
     * 1 - base token deposit is transfered from the short seller to Vault
     * 2 - underlying token is transfered from lender to Vault
     * 3 - if there is a taker fee for the buy order, transfer it from short seller to Vault
     * 4 - use the provided 0x buy order to sell the loaned underlying token for base token.
     *     base token received from the sell is also stored in Vault
     * 5 - add details of the short sell to repo
     * 6 - Short event recorded
     *
     * Note: This function will by default use the dYdX Exchange contract (which allows fees
     *       to be paid in any token). If you would rather use the official 0x Exchange contract,
     *       set "buy order maker fee token" to the constant specified on Trader, and "buy order
     *       taker fee token" to the address of the ZRX token.
     *
     * @param  addresses  Addresses corresponding to:
     *
     *  [0]  = short owner (if 0, owner will be msg.sender)
     *  [1]  = underlying token
     *  [2]  = base token
     *  [3]  = lender
     *  [4]  = loan signer (if 0, lender will be the signer - otherwise lender must be a
     *                      smart contract that implements LoanOfferingVerifier)
     *  [5]  = loan owner (if 0, owner will be the lender)
     *  [6]  = loan taker
     *  [7]  = loan fee recipient
     *  [8]  = loan lender fee token
     *  [9]  = loan taker fee token
     *  [10]  = buy order maker
     *  [11]  = buy order taker
     *  [12] = buy order fee recipient
     *  [13] = buy order maker fee token
     *  [14] = buy order taker fee token
     *
     * @param  values256  Values corresponding to:
     *
     *  [0]  = loan minimum deposit
     *  [1]  = loan maximum amount
     *  [2]  = loan minimum amount
     *  [3]  = loan minimum sell amount
     *  [4]  = loan interest rate (amount of base tokens per day)
     *  [5]  = loan lender fee
     *  [6]  = loan taker fee
     *  [7]  = loan expiration timestamp (in seconds)
     *  [8]  = loan salt
     *  [9]  = buy order base token amount
     *  [10] = buy order underlying token amount
     *  [11] = buy order maker fee
     *  [12] = buy order taker fee
     *  [13] = buy order expiration timestamp (in seconds)
     *  [14] = buy order salt
     *  [15] = short amount
     *  [16] = deposit amount
     *
     * @param  values32  Values corresponding to:
     *
     *  [0] = loan call time limit  (in seconds)
     *  [1] = loan maxDuration      (in seconds)
     *
     * @param  sigV       ECDSA v parameters for [0] loan and [1] buy order
     * @param  sigRS      CDSA r and s parameters for [0] loan and [2] buy order
     * @return _shortId   unique identifier for the short sell
     */
    function short(
        address[15] addresses,
        uint[17] values256,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        external
        onlyWhileOperational
        nonReentrant
        returns (bytes32 _shortId)
    {
        return ShortImpl.shortImpl(
            state,
            addresses,
            values256,
            values32,
            sigV,
            sigRS
        );
    }

    /**
     * Close a short sell. Only callable by short seller. Short seller must provide a 0x order
     * offering at least as much underlying token as was loaned for the short sell. There must be
     * enough base token left over after the trade to pay the lender the full owed interest fee.
     * The short seller is sent base token = deposit + profit - interest fee
     *
     * Note: This function will by default use the dYdX Exchange contract (which allows fees
     *       to be paid in any token). If you would rather use the official 0x Exchange contract,
     *       set "buy order maker fee token" to the constant specified on Trader, and "buy order
     *       taker fee token" to the address of the ZRX token.
     *
     * @param  shortId              unique id for the short sell
     * @param  requestedCloseAmount amount of the short position to close. The amount closed will
     *                              be: min(requestedCloseAmount, currentShortAmount)
     * @param  orderAddresses       Addresses for the supplied 0x order:
     *                              [0] = maker
     *                              [1] = taker
     *                              [2] = fee recipient
     *                              [3] = maker fee token
     *                              [4] = taker fee token
     * @param  orderValues          Values for the supplied 0x order:
     *                              [0] = underlying token amount
     *                              [1] = base token amount
     *                              [2] = maker fee
     *                              [3] = taker fee
     *                              [4] = expiration timestamp
     *                              [5] = salt
     * @param  orderV               ECDSA signature parameter v for the 0x order
     * @param  orderR bytes32       CDSA signature parameter r for the 0x order
     * @param  orderS bytes32       CDSA signature parameter s for the 0x order
     * @return _amountClosed        amount of short closed
     * @return _baseTokenReceived   amount of base token received by the short seller after closing
     * @return _interestFeeAmount   interest fee in base token paid to the lender
     */
    function closeShort(
        bytes32 shortId,
        uint requestedCloseAmount,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        external
        closeShortStateControl
        nonReentrant
        returns (
            uint _amountClosed,
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        return CloseShortImpl.closeShortImpl(
            state,
            shortId,
            requestedCloseAmount,
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
        );
    }

    /**
     * Close a short sell. Only callable by short seller. This method to close a short transfers
     * the borrowed underlying tokens directly from the short seller, and does not use a 0x order
     * to buy them back. To use this, the short seller must own the shortAmount of underlyingToken
     *
     * @param  shortId              unique id for the short sell
     * @param  requestedCloseAmount amount of the short position to close. The amount closed will
     *                              be: min(requestedCloseAmount, currentShortAmount)
     * @return _amountClosed        amount of short closed
     * @return _baseTokenReceived   amount of base token received by the short seller after closing
     * @return _interestFeeAmount   interest fee in base token paid to the lender
     */
    function closeShortDirectly(
        bytes32 shortId,
        uint requestedCloseAmount
    )
        external
        closeShortDirectlyStateControl
        nonReentrant
        returns (
            uint _amountClosed,
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        return CloseShortImpl.closeShortDirectlyImpl(
            state,
            shortId,
            requestedCloseAmount
        );
    }

    /**
     * Call in a short sell loan.
     * Only callable by the lender for a short sell. After loan is called in, the short seller
     * will have time equal to the call time limit specified on the original short sell to
     * close the short and repay the loan. If the short seller does not close the short, the
     * lender can use forceRecoverLoan to recover his funds.
     *
     * @param  shortId  unique id for the short sell
     */
    function callInLoan(
        bytes32 shortId
    )
        external
        nonReentrant
    {
        LoanImpl.callInLoanImpl(state, shortId);
    }

    /**
     * Cancel a loan call. Only callable by the short sell's lender
     *
     * @param  shortId  unique id for the short sell
     */
    function cancelLoanCall(
        bytes32 shortId
    )
        external
        onlyWhileOperational
        nonReentrant
    {
        LoanImpl.cancelLoanCallImpl(state, shortId);
    }

    /**
     * Offer to sell back the tokens loaned for a short sell for some amount of base tokens held
     * in this short position. Only the lowest bid amount will be accepted. On placing a bid,
     * the full underlying token amount owed to the lender will be taken from the bidder and
     * placed in escrow. If a bidder is outbid or the short is closed normally by the short seller,
     * the bidder's underlying tokens will be automatically returned.
     * Only callable for a short that has been called, but not yet closed.
     * Callable by any address
     *
     * @param  shortId      ID of the short sell to bid on
     * @param  offer        the amount of base token the bidder wants to be paid in exchange for
     *                      the amount of underlying token in the short sell. The price paid per
     *                      underlying token is: offer / shortAmount (the opening amount
     *                      of the short). Even if the short is partially closed, this amount is
     *                      still relative to the opening short amount
     */
    function placeSellbackBid(
        bytes32 shortId,
        uint offer
    )
        external
        auctionStateControl
        nonReentrant
    {
        PlaceSellbackBidImpl.placeSellbackBidImpl(
            state,
            shortId,
            offer
        );
    }

    /**
     * Function callable by a short sell lender after he has called in the loan, but the
     * short seller did not close the short sell before the call time limit. Used to recover the
     * lender's original loaned amount of underlying token as well as any owed interest fee
     * This function can also be called by the winner of a sellback auction.
     *
     * @param  shortId  unique id for the short sell
     */
    function forceRecoverLoan(
        bytes32 shortId
    )
        external
        nonReentrant
        returns (uint _baseTokenAmount)
    {
        return ForceRecoverLoanImpl.forceRecoverLoanImpl(state, shortId);
    }

    /**
     * Deposit additional base token as colateral for a short sell loan. Only callable by
     * the short seller
     *
     * @param  shortId          unique id for the short sell
     * @param  depositAmount    additional amount in base token to deposit
     */
    function deposit(
        bytes32 shortId,
        uint depositAmount
    )
        external
        onlyWhileOperational
        nonReentrant
    {
        ShortSellCommon.Short memory short = ShortSellCommon.getShortObject(state.REPO, shortId);
        require(msg.sender == short.seller);

        Vault(state.VAULT).transferToVault(
            shortId,
            short.baseToken,
            short.seller,
            depositAmount
        );

        AdditionalDeposit(
            shortId,
            depositAmount
        );
    }

    /**
     * Cancel an amount of a loan offering. Only callable by the offering's lender.
     *
     * @param  addresses        Array of addresses:
     *
     *  [0] = underlying token
     *  [1] = base token
     *  [2] = lender
     *  [3] = signer
     *  [4] = owner
     *  [5] = loan taker
     *  [6] = loan fee recipient
     *  [7] = loan lender fee token
     *  [8] = loan taker fee token
     *
     * @param  values256        Values corresponding to:
     *
     *  [0] = loan minimum deposit
     *  [1] = loan maximum amount
     *  [2] = loan minimum amount
     *  [3] = loan minimum sell amount
     *  [4] = loan interest rate
     *  [5] = loan lender fee
     *  [6] = loan taker fee
     *  [7] = loan expiration timestamp (in seconds)
     *  [8] = loan salt
     *
     * @param  values32         Values corresponding to:
     *
     *  [0] = loan call time limit  (in seconds)
     *  [1] = loan maxDuration      (in seconds)
     *
     * @param  cancelAmount     Amount to cancel
     * @return _cancelledAmount Amount that was cancelled
     */
    function cancelLoanOffering(
        address[9] addresses,
        uint[9] values256,
        uint32[2] values32,
        uint cancelAmount
    )
        external
        cancelLoanOfferingStateControl
        nonReentrant
        returns (uint _cancelledAmount)
    {
        return LoanImpl.cancelLoanOfferingImpl(
            state,
            addresses,
            values256,
            values32,
            cancelAmount
        );
    }

    function approveLoanOffering(
        address[9] addresses,
        uint[9] values256,
        uint32[2] values32
    )
        external
        onlyWhileOperational
        nonReentrant
    {
        LoanImpl.approveLoanOffering(
            state,
            addresses,
            values256,
            values32
        );
    }

    /**
     * Transfer ownership of a loan to a new address. This new address will be entitled
     * to all payouts for this loan. Only callable by the lender for a short
     *
     * @param  shortId  unique id for the short sell
     * @param  who      new owner of the loan
     */
    function transferLoan(
        bytes32 shortId,
        address who
    )
        external
        nonReentrant
    {
        // This address will be address(0) if the short does not exist. This is fine because
        // we validate msg.sender == lender right after, and msg.sender can't be address(0)
        address lender = ShortSellRepo(state.REPO).getShortLender(shortId);
        require(msg.sender == lender);

        ShortSellRepo(state.REPO).setShortLender(shortId, who);

        LoanTransfered(
            shortId,
            lender,
            who
        );
    }

    /**
     * Transfer ownership of a short to a new address. This new address will be entitled
     * to all payouts for this short. Only callable by the short seller for a short
     *
     * @param  shortId  unique id for the short sell
     * @param  who      new owner of the short
     */
    function transferShort(
        bytes32 shortId,
        address who
    )
        external
        nonReentrant
    {
        // This address will be address(0) if the short does not exist. This is fine because
        // we validate msg.sender == seller right after, and msg.sender can't be address(0)
        address seller = ShortSellRepo(state.REPO).getShortSeller(shortId);
        require(msg.sender == seller);

        ShortSellRepo(state.REPO).setShortSeller(shortId, who);

        ShortTransfered(
            shortId,
            seller,
            who
        );
    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    function containsShort(
        bytes32 shortId
    )
        view
        external
        returns (bool exists)
    {
        return ShortSellRepo(state.REPO).containsShort(shortId);
    }

    function getShortBalance(
        bytes32 shortId
    )
        view
        external
        returns (uint _baseTokenBalance)
    {
        if (!ShortSellRepo(state.REPO).containsShort(shortId)) {
            return 0;
        }
        ShortSellCommon.Short memory short = ShortSellCommon.getShortObject(state.REPO, shortId);

        return Vault(state.VAULT).balances(shortId, short.baseToken);
    }

    function getShortInterestFee(
        bytes32 shortId
    )
        view
        external
        returns (uint _interestFeeOwed)
    {
        if (!ShortSellRepo(state.REPO).containsShort(shortId)) {
            return 0;
        }
        ShortSellCommon.Short memory short = ShortSellCommon.getShortObject(state.REPO, shortId);

        // In both branches of the conditional, endTimestamp may end up being past the maximum
        // duration of the short, but calculateInterestFee() will bound it
        uint endTimestamp;
        if (
            short.callTimestamp > 0
            && block.timestamp > uint(short.callTimestamp).add(short.callTimeLimit)
        ) {
            endTimestamp = uint(short.callTimestamp).add(short.callTimeLimit);
        } else {
            endTimestamp = block.timestamp;
        }

        return ShortSellCommon.calculateInterestFee(
            short,
            short.shortAmount.sub(short.closedAmount),
            endTimestamp
        );
    }

    function getUnavailableLoanOfferingAmount(
        bytes32 loanHash
    )
        view
        external
        returns (uint _unavailableAmount)
    {
        return ShortSellCommon.getUnavailableLoanOfferingAmountImpl(state, loanHash);
    }

    function getShortAuctionOffer(
        bytes32 shortId
    )
        view
        external
        returns (
            uint _offer,
            address _bidder,
            bool _exists
        )
    {
        return ShortSellAuctionRepo(state.AUCTION_REPO).getAuction(shortId);
    }

    function hasShortAuctionOffer(
        bytes32 shortId
    )
        view
        external
        returns (bool _exists)
    {
        return ShortSellAuctionRepo(state.AUCTION_REPO).containsAuction(shortId);
    }

    function isShortCalled(
        bytes32 shortId
    )
        view
        external
        returns(bool _isCalled)
    {
        ShortSellCommon.Short memory short = ShortSellCommon.getShortObject(state.REPO, shortId);

        return (short.callTimestamp > 0);
    }

    function isShortClosed(
        bytes32 shortId
    )
        view
        external
        returns (bool _isClosed)
    {
        return ShortSellRepo(state.REPO).closedShorts(shortId);
    }

    // ----- Public State Variable Getters -----

    function VAULT()
        view
        external
        returns (address _VAULT)
    {
        return state.VAULT;
    }

    function TRADER()
        view
        external
        returns (address _TRADER)
    {
        return state.TRADER;
    }

    function REPO()
        view
        external
        returns (address _REPO)
    {
        return state.REPO;
    }

    function AUCTION_REPO()
        view
        external
        returns (address _AUCTION_REPO)
    {
        return state.AUCTION_REPO;
    }

    function PROXY()
        view
        external
        returns (address _PROXY)
    {
        return state.PROXY;
    }

    function loanFills(
        bytes32 loanHash
    )
        view
        external
        returns (uint _filledAmount)
    {
        return state.loanFills[loanHash];
    }

    function loanCancels(
        bytes32 loanHash
    )
        view
        external
        returns (uint _cancelledAmount)
    {
        return state.loanCancels[loanHash];
    }

    function loanNumbers(
        bytes32 loanHash
    )
        view
        external
        returns (uint _cancelledAmount)
    {
        return state.loanCancels[loanHash];
    }
}
