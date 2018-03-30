pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { ShortSellState } from "./impl/ShortSellState.sol";
import { ShortImpl } from "./impl/ShortImpl.sol";
import { LiquidateImpl } from "./impl/LiquidateImpl.sol";
import { CloseShortImpl } from "./impl/CloseShortImpl.sol";
import { LoanImpl } from "./impl/LoanImpl.sol";
import { ForceRecoverLoanImpl } from "./impl/ForceRecoverLoanImpl.sol";
import { DepositImpl } from "./impl/DepositImpl.sol";
import { ShortSellCommon } from "./impl/ShortSellCommon.sol";
import { ShortSellEvents } from "./impl/ShortSellEvents.sol";
import { ShortSellAdmin } from "./impl/ShortSellAdmin.sol";
import { ShortSellGetters } from "./impl/ShortSellGetters.sol";
import { ShortSellStorage } from "./impl/ShortSellStorage.sol";
import { TransferImpl } from "./impl/TransferImpl.sol";
import { Vault } from "./Vault.sol";


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
    ShortSellStorage,
    ShortSellEvents,
    ShortSellAdmin,
    ShortSellGetters {

    using SafeMath for uint256;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortSell(
        address _vault,
        address _proxy
    )
        Ownable()
        ShortSellAdmin()
        public
    {
        state = ShortSellState.State({
            VAULT: _vault,
            PROXY: _proxy
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
     * @param  addresses  Addresses corresponding to:
     *
     *  [0]  = short owner
     *  [1]  = underlying token
     *  [2]  = base token
     *  [3]  = lender
     *  [4]  = loan signer
     *  [5]  = loan owner
     *  [6]  = loan taker
     *  [7]  = loan fee recipient
     *  [8]  = loan lender fee token
     *  [9]  = loan taker fee token
     *  [10]  = exchange wrapper address
     *
     * @param  values256  Values corresponding to:
     *
     *  [0]  = loan maximum amount
     *  [1]  = loan minimum amount
     *  [2]  = loan minimum base token
     *  [3]  = loan interest rate (annual nominal percentage times 10**18)
     *  [4]  = loan lender fee
     *  [5]  = loan taker fee
     *  [6]  = loan expiration timestamp (in seconds)
     *  [7]  = loan salt
     *  [8]  = short amount
     *  [9]  = deposit amount
     *
     * @param  values32  Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = loan interest update period (in seconds)
     *
     * @param  sigV       ECDSA v parameter for loan offering
     * @param  sigRS      ECDSA r and s parameters for loan offering
     * @param  order      order object to be passed to the exchange wrapper
     * @return _shortId   unique identifier for the short sell
     */
    function short(
        address[11] addresses,
        uint256[10] values256,
        uint32[3] values32,
        uint8 sigV,
        bytes32[2] sigRS,
        bytes order
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
            sigRS,
            order
        );
    }

    /**
     * Add value to a short sell. Funds will be borrowed from the lender and sold as per short.
     * The value added to the short will be equal to the effective amount lent, and will incorporate
     * interest already earned by the position so far.
     *
     * @param  addresses  Addresses corresponding to:
     *
     *  [0]  = lender
     *  [1]  = loan signer (if 0, lender will be the signer - otherwise lender must be a
     *                      smart contract that implements LoanOfferingVerifier)
     *  [2]  = loan taker
     *  [3]  = loan fee recipient
     *  [4]  = loan lender fee token
     *  [5]  = loan taker fee token
     *  [6]  = exchange wrapper address
     *
     * @param  values256  Values corresponding to:
     *
     *  [0]  = loan maximum amount
     *  [1]  = loan minimum amount
     *  [2]  = loan minimum base token
     *  [3]  = loan lender fee
     *  [4]  = loan taker fee
     *  [5]  = loan expiration timestamp (in seconds)
     *  [6]  = loan salt
     *  [7]  = amount
     *
     * @param  sigV       ECDSA v parameter for loan offering
     * @param  sigRS      ECDSA r and s parameters for loan offering
     * @param  order      order object to be passed to the exchange wrapper
     * @return _shortId   unique identifier for the short sell
     */
    function addValueToShort(
        bytes32 shortId,
        address[7] addresses,
        uint256[8] values256,
        uint8 sigV,
        bytes32[2] sigRS,
        bytes order
    )
        external
        onlyWhileOperational
        nonReentrant
        returns (uint256 _effectiveAmountAdded)
    {
        return ShortImpl.addValueToShortImpl(
            state,
            shortId,
            addresses,
            values256,
            sigV,
            sigRS,
            order
        );
    }

    /**
    * Close a short sell. May be called by the short seller or with the approval of the short
    * seller. May provide an order and exchangeWrapperAddress to facilitate the closing of the
    * short position. The short seller is sent base token stored in the contract.
     *
     * @param  shortId                  unique id for the short sell
     * @param  requestedCloseAmount     amount of the short position to close. The amount closed
     *                                  will be: min(requestedCloseAmount, currentShortAmount)
     * @param  payoutRecipient          address to send remaining baseToken to after closing
     * @param  exchangeWrapperAddress   address of the exchange wrapper
     * @param  order                    order object to be passed to the exchange wrapper
     * @return _amountClosed            amount of short closed
     * @return _baseTokenReceived       amount of base token received by the short seller
     *                                  after closing
     * @return _interestFeeAmount       interest fee in underlying token paid to the lender
     */
    function closeShort(
        bytes32 shortId,
        uint256 requestedCloseAmount,
        address payoutRecipient,
        address exchangeWrapperAddress,
        bytes order
    )
        external
        closeShortStateControl
        nonReentrant
        returns (
            uint256 _amountClosed,
            uint256 _baseTokenReceived,
            uint256 _interestFeeAmount
        )
    {
        return CloseShortImpl.closeShortImpl(
            state,
            shortId,
            requestedCloseAmount,
            payoutRecipient,
            exchangeWrapperAddress,
            order
        );
    }

    /**
     * Helper to close a short sell by paying underlying token directly from the short seller
     *
     * @param  shortId                  unique id for the short sell
     * @param  requestedCloseAmount     amount of the short position to close. The amount closed
     *                                  will be: min(requestedCloseAmount, currentShortAmount)
     * @param  payoutRecipient          address to send remaining baseToken to after closing
     * @return _amountClosed            amount of short closed
     * @return _baseTokenReceived       amount of base token received by the short seller
     *                                  after closing
     * @return _interestFeeAmount       interest fee in underlying token paid to the lender
     */
    function closeShortDirectly(
        bytes32 shortId,
        uint256 requestedCloseAmount,
        address payoutRecipient
    )
        external
        closeShortDirectlyStateControl
        nonReentrant
        returns (
            uint256 _amountClosed,
            uint256 _baseTokenReceived,
            uint256 _interestFeeAmount
        )
    {
        return CloseShortImpl.closeShortImpl(
            state,
            shortId,
            requestedCloseAmount,
            payoutRecipient,
            address(0),
            new bytes(0)
        );
    }

    /**
     * Liquidate loan position and withdraw base tokens from the vault.
     * Must be approved by the short seller (e.g., by requiring the lender to own part of the
     * short position, and burning in order to liquidate part of the loan).
     *
     * @param  shortId                        unique id for the short sell
     * @param  requestedLiquidationAmount     amount of the loan to close. The amount closed
     *                                        will be: min(requestedCloseAmount, currentShortAmount)
     * @return _amountClosed                  amount of loan closed
     * @return _baseTokenReceived             amount of base token received by the lender
     *                                        after closing
     */
    function liquidate(
        bytes32 shortId,
        uint256 requestedLiquidationAmount
    )
        external
        onlyWhileOperational
        closeShortStateControl
        nonReentrant
        returns (
            uint256 _amountClosed,
            uint256 _baseTokenReceived
        )
    {
        return LiquidateImpl.liquidateImpl(
            state,
            shortId,
            requestedLiquidationAmount
        );
    }

    /**
     * Call in a short sell loan.
     * Only callable by the lender for a short sell. After loan is called in, the short seller
     * will have time equal to the call time limit specified on the original short sell to
     * close the short and repay the loan. If the short seller does not close the short, the
     * lender can use forceRecoverLoan to recover his funds.
     *
     * @param  shortId          unique id for the short sell
     * @param  requiredDeposit  amount of deposit the short seller must put up to cancel the call
     */
    function callInLoan(
        bytes32 shortId,
        uint256 requiredDeposit
    )
        external
        nonReentrant
    {
        LoanImpl.callInLoanImpl(
            state,
            shortId,
            requiredDeposit
        );
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
     * Function callable by a short sell lender after he has called in the loan, but the
     * short seller did not close the short sell before the call time limit. Used to recover the
     * base tokens held as collateral.
     *
     * @param  shortId  unique id for the short sell
     */
    function forceRecoverLoan(
        bytes32 shortId
    )
        external
        nonReentrant
        returns (uint256 _baseTokenAmount)
    {
        return ForceRecoverLoanImpl.forceRecoverLoanImpl(state, shortId);
    }

    /**
     * Deposit additional base token as colateral for a short sell loan. Cancels loan call if:
     * 0 < short.requiredDeposit < depositAmount
     *
     * @param  shortId          unique id for the short sell
     * @param  depositAmount    additional amount in base token to deposit
     */
    function deposit(
        bytes32 shortId,
        uint256 depositAmount
    )
        external
        onlyWhileOperational
        nonReentrant
    {
        DepositImpl.depositImpl(
            state,
            shortId,
            depositAmount
        );
    }

    /**
     * Cancel an amount of a loan offering. Only callable by the offering's lender.
     *
     * @param  addresses  Array of addresses:
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
     * @param  values256  Values corresponding to:
     *
     *  [0] = loan maximum amount
     *  [1] = loan minimum amount
     *  [2] = loan minimum base token
     *  [3] = loan interest rate (annual nominal percentage times 10**18)
     *  [4] = loan lender fee
     *  [5] = loan taker fee
     *  [6] = loan expiration timestamp (in seconds)
     *  [7] = loan salt
     *
     * @param  values32  Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = loan interest update period (in seconds)
     *
     * @param  cancelAmount     Amount to cancel
     * @return _cancelledAmount Amount that was cancelled
     */
    function cancelLoanOffering(
        address[9] addresses,
        uint256[8] values256,
        uint32[3]  values32,
        uint256    cancelAmount
    )
        external
        cancelLoanOfferingStateControl
        nonReentrant
        returns (uint256 _cancelledAmount)
    {
        return LoanImpl.cancelLoanOfferingImpl(
            state,
            addresses,
            values256,
            values32,
            cancelAmount
        );
    }

    /**
     * On-chain approve a loan offering. Meant for smart contracts to approve loans with a
     * transaction rather than a signature.
     *
     * @param  addresses  Array of addresses:
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
     * @param  values256  Values corresponding to:
     *
     *  [0] = loan maximum amount
     *  [1] = loan minimum amount
     *  [2] = loan minimum base token
     *  [3] = loan interest rate (annual nominal percentage times 10**18)
     *  [4] = loan lender fee
     *  [5] = loan taker fee
     *  [6] = loan expiration timestamp (in seconds)
     *  [7] = loan salt
     *
     * @param  values32  Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = loan interest update period (in seconds)
     */
    function approveLoanOffering(
        address[9] addresses,
        uint256[8] values256,
        uint32[3]  values32
    )
        external
        onlyWhileOperational
        nonReentrant
    {
        LoanImpl.approveLoanOfferingImpl(
            state,
            addresses,
            values256,
            values32
        );
    }

    /**
     * Transfer ownership of a loan to a new address. This new address will be entitled
     * to all payouts for this loan. Only callable by the lender for a short. If the "who"
     * param is a contract, it must implement the LoanOwner interface.
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
        TransferImpl.transferLoanImpl(
            state,
            shortId,
            who);
    }

    /**
     * Transfer ownership of a short to a new address. This new address will be entitled
     * to all payouts for this short. Only callable by the short seller for a short. If the "who"
     * param is a contract, it must implement the ShortOwner interface.
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
        TransferImpl.transferShortImpl(
            state,
            shortId,
            who);
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
        return ShortSellCommon.containsShortImpl(state, shortId);
    }

    function getShortBalance(
        bytes32 shortId
    )
        view
        external
        returns (uint256 _baseTokenBalance)
    {
        if (!ShortSellCommon.containsShortImpl(state, shortId)) {
            return 0;
        }
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        return Vault(state.VAULT).balances(shortId, short.baseToken);
    }

    function getShortInterestFee(
        bytes32 shortId
    )
        view
        external
        returns (uint256 _interestFeeOwed)
    {
        if (!ShortSellCommon.containsShortImpl(state, shortId)) {
            return 0;
        }
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        return ShortSellCommon.calculateInterestFee(
            short,
            short.shortAmount.sub(short.closedAmount),
            block.timestamp
        );
    }

    function getUnavailableLoanOfferingAmount(
        bytes32 loanHash
    )
        view
        external
        returns (uint256 _unavailableAmount)
    {
        return ShortSellCommon.getUnavailableLoanOfferingAmountImpl(state, loanHash);
    }

    function isShortCalled(
        bytes32 shortId
    )
        view
        external
        returns(bool _isCalled)
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        return (short.callTimestamp > 0);
    }

    function isShortClosed(
        bytes32 shortId
    )
        view
        external
        returns (bool _isClosed)
    {
        return state.closedShorts[shortId];
    }

    // ----- Public State Variable Getters -----

    function VAULT()
        view
        external
        returns (address _VAULT)
    {
        return state.VAULT;
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
        returns (uint256 _filledAmount)
    {
        return state.loanFills[loanHash];
    }

    function loanCancels(
        bytes32 loanHash
    )
        view
        external
        returns (uint256 _cancelledAmount)
    {
        return state.loanCancels[loanHash];
    }

    function loanNumbers(
        bytes32 loanHash
    )
        view
        external
        returns (uint256 _cancelledAmount)
    {
        return state.loanCancels[loanHash];
    }
}
