pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { Vault } from "./Vault.sol";
import { ClosePositionImpl } from "./impl/ClosePositionImpl.sol";
import { DepositCollateralImpl } from "./impl/DepositCollateralImpl.sol";
import { ForceRecoverCollateralImpl } from "./impl/ForceRecoverCollateralImpl.sol";
import { IncreasePositionImpl } from "./impl/IncreasePositionImpl.sol";
import { LiquidatePositionImpl } from "./impl/LiquidatePositionImpl.sol";
import { LoanGetters } from "./impl/LoanGetters.sol";
import { LoanImpl } from "./impl/LoanImpl.sol";
import { MarginAdmin } from "./impl/MarginAdmin.sol";
import { MarginEvents } from "./impl/MarginEvents.sol";
import { MarginState } from "./impl/MarginState.sol";
import { MarginStorage } from "./impl/MarginStorage.sol";
import { OpenPositionImpl } from "./impl/OpenPositionImpl.sol";
import { PositionGetters } from "./impl/PositionGetters.sol";
import { TransferImpl } from "./impl/TransferImpl.sol";


/**
 * @title Margin
 * @author dYdX
 *
 * This contract is used to facilitate margin trading as per the dYdX protocol
 */
 /* solium-disable-next-line */
contract Margin is
    Ownable,
    NoOwner,
    ReentrancyGuard,
    MarginStorage,
    MarginEvents,
    MarginAdmin,
    LoanGetters,
    PositionGetters {

    using SafeMath for uint256;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function Margin(
        address vault,
        address proxy
    )
        Ownable()
        MarginAdmin()
        public
    {
        state = MarginState.State({
            VAULT: vault,
            PROXY: proxy
        });
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    /**
     * Open a margin position. Called by the margin trader who must provide both a
     * signed loan offering as well as a buy order with which to sell the base token.
     *
     * @param  addresses            Addresses corresponding to:
     *
     *  [0]  = position owner
     *  [1]  = base token
     *  [2]  = quote token
     *  [3]  = loan payer
     *  [4]  = loan signer
     *  [5]  = loan owner
     *  [6]  = loan taker
     *  [7]  = loan fee recipient
     *  [8]  = loan lender fee token
     *  [9]  = loan taker fee token
     *  [10]  = exchange wrapper address
     *
     * @param  values256            Values corresponding to:
     *
     *  [0]  = loan maximum amount
     *  [1]  = loan minimum amount
     *  [2]  = loan minimum quote token
     *  [3]  = loan lender fee
     *  [4]  = loan taker fee
     *  [5]  = loan expiration timestamp (in seconds)
     *  [6]  = loan salt
     *  [7]  = position amount
     *  [8]  = deposit amount
     *
     * @param  values32             Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = loan interest rate (annual nominal percentage times 10**6)
     *  [3] = loan interest update period (in seconds)
     *
     * @param  sigV                 ECDSA v parameter for loan offering
     * @param  sigRS                ECDSA r and s parameters for loan offering
     * @param  depositInQuoteToken  True if the trader wishes to pay the margin deposit in quote
     *                              token. If false, margin deposit will be pulled in base token,
     *                              and then sold along with the base token borrowed from the lender
     * @param  order                Order object to be passed to the exchange wrapper
     * @return                      Unique ID for the new position
     */
    function openPosition(
        address[11] addresses,
        uint256[9]  values256,
        uint32[4]   values32,
        uint8       sigV,
        bytes32[2]  sigRS,
        bool        depositInQuoteToken,
        bytes       order
    )
        external
        onlyWhileOperational
        nonReentrant
        returns (bytes32)
    {
        return OpenPositionImpl.openPositionImpl(
            state,
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInQuoteToken,
            order
        );
    }

    /**
     * Increase the size of a position. Funds will be borrowed from the loan payer and sold as per
     * the position. The value added to the position will be equal to the effective amount lent, and
     * will incorporate interest already earned by the position so far.
     *
     * @param  addresses            Addresses corresponding to:
     *
     *  [0]  = loan payer
     *  [1]  = loan signer
     *  [2]  = loan taker
     *  [3]  = loan fee recipient
     *  [4]  = loan lender fee token
     *  [5]  = loan taker fee token
     *  [6]  = exchange wrapper address
     *
     * @param  values256            Values corresponding to:
     *
     *  [0]  = loan maximum amount
     *  [1]  = loan minimum amount
     *  [2]  = loan minimum quote token
     *  [3]  = loan lender fee
     *  [4]  = loan taker fee
     *  [5]  = loan expiration timestamp (in seconds)
     *  [6]  = loan salt
     *  [7]  = amount to add to the position (NOTE: the amount pulled from the lender will be
     *                                              >= this amount)
     *
     * @param  values32             Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *
     * @param  sigV                 ECDSA v parameter for loan offering
     * @param  sigRS                ECDSA r and s parameters for loan offering
     * @param  depositInQuoteToken  True if the trader wishes to pay the margin deposit in quote
     *                              token. If false, margin deposit will be pulled in base token,
     *                              and then sold along with the base token borrowed from the lender
     * @param  order                Order object to be passed to the exchange wrapper
     * @return                      Amount of base tokens pulled from the lender
     */
    function increasePosition(
        bytes32     marginId,
        address[7]  addresses,
        uint256[8]  values256,
        uint32[2]   values32,
        uint8       sigV,
        bytes32[2]  sigRS,
        bool        depositInQuoteToken,
        bytes       order
    )
        external
        onlyWhileOperational
        nonReentrant
        returns (uint256)
    {
        return IncreasePositionImpl.increasePositionImpl(
            state,
            marginId,
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInQuoteToken,
            order
        );
    }

    /**
     * Increase a position directly by putting up quote token. The caller will serve as both the
     * lender and the position owner
     *
     * @param marginId  Unique ID of the position sell
     * @param amount    Amount (in base token) to add to the position
     * @return          Amount of quote token pulled from the msg.sender
     */
    function increasePositionDirectly(
        bytes32 marginId,
        uint256 amount
    )
        external
        onlyWhileOperational
        nonReentrant
        returns (uint256)
    {
        return IncreasePositionImpl.increasePositionDirectlyImpl(
            state,
            marginId,
            amount
        );
    }

    /**
     * Close a position. May be called by the owner or with the approval of the owner. May provide
     * an order and exchangeWrapper to facilitate the closing of the position. The payoutRecipient
     * an sent the resulting payout.
     *
     * @param  marginId                 Unique ID for the position
     * @param  requestedCloseAmount     Amount of the position to close. The amount closed
     *                                  will be: min(requestedCloseAmount, currentPrincipal)
     * @param  payoutRecipient          Address to send remaining quoteToken to after closing
     * @param  exchangeWrapper          Address of the exchange wrapper
     * @param  payoutInQuoteToken       True to pay out the payoutRecipient in quote token,
     *                                  False to pay out the payoutRecipient in base token
     * @param  order                    Order object to be passed to the exchange wrapper
     * @return                          Values corresponding to:
     *                                  1) Amount of position closed
     *                                  2) Amount of quote token recieved by the payoutRecipient
     *                                  3) Amount of base token paid as interest fee to the lender
     */
    function closePosition(
        bytes32 marginId,
        uint256 requestedCloseAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool    payoutInQuoteToken,
        bytes   order
    )
        external
        closePositionStateControl
        nonReentrant
        returns (uint256, uint256, uint256)
    {
        return ClosePositionImpl.closePositionImpl(
            state,
            marginId,
            requestedCloseAmount,
            payoutRecipient,
            exchangeWrapper,
            payoutInQuoteToken,
            order
        );
    }

    /**
     * Helper to close a position by paying base token directly
     *
     * @param  marginId                 Unique ID for the position
     * @param  requestedCloseAmount     Amount of the position to close. The amount closed
     *                                  will be: min(requestedCloseAmount, currentPrincipal)
     * @param  payoutRecipient          Address to send remaining quoteToken to after closing
     * @return                          Values corresponding to:
     *                                  1) Amount of position closed
     *                                  2) Amount of quote token received by the payoutRecipient
     *                                  3) Amount of base token paid as interest fee to the lender
     */
    function closePositionDirectly(
        bytes32 marginId,
        uint256 requestedCloseAmount,
        address payoutRecipient
    )
        external
        closePositionDirectlyStateControl
        nonReentrant
        returns (uint256, uint256, uint256)
    {
        return ClosePositionImpl.closePositionImpl(
            state,
            marginId,
            requestedCloseAmount,
            payoutRecipient,
            address(0),
            true,
            new bytes(0)
        );
    }

    /**
     * Liquidate position and withdraw quote tokens from the vault.
     * Must be approved by the position owner (e.g., by requiring the lender to own part of the
     * position, and burning it).
     *
     * @param  marginId                    Unique ID for the position
     * @param  requestedLiquidationAmount  Amount of the loan to close. The amount closed
     *                                     will be: min(requestedCloseAmount, currentPrincipal)
     * @return                             Values corresponding to:
     *                                     1) Amount of position closed
     *                                     2) Amount of quote token recieved by the msg.sender
     */
    function liquidatePosition(
        bytes32 marginId,
        uint256 requestedLiquidationAmount,
        address payoutRecipient
    )
        external
        closePositionStateControl
        nonReentrant
        returns (uint256, uint256)
    {
        return LiquidatePositionImpl.liquidatePositionImpl(
            state,
            marginId,
            requestedLiquidationAmount,
            payoutRecipient
        );
    }

    /**
     * Margin call a position.
     * Only callable by the lender of a position. After the call, the owner will have time equal to
     * the call time limit of the position to close the position. If the owner does not close the
     * position, the lender can recover the collateral in the position.
     *
     * @param  marginId         Unique ID for the position
     * @param  requiredDeposit  Amount of deposit the owner must put up to cancel the call
     */
    function marginCall(
        bytes32 marginId,
        uint256 requiredDeposit
    )
        external
        nonReentrant
    {
        LoanImpl.marginCallImpl(
            state,
            marginId,
            requiredDeposit
        );
    }

    /**
     * Cancel a margin call. Only callable by the position lender.
     *
     * @param  marginId  Unique ID for the position
     */
    function cancelMarginCall(
        bytes32 marginId
    )
        external
        onlyWhileOperational
        nonReentrant
    {
        LoanImpl.cancelMarginCallImpl(state, marginId);
    }

    /**
     * Function callable by the lender after the loan has been called-in for the call time limit but
     * remains unclosed. Used to recover the quote tokens held as collateral.
     *
     * @param  marginId  Unique ID for the position
     */
    function forceRecoverCollateral(
        bytes32 marginId
    )
        external
        nonReentrant
        returns (uint256)
    {
        return ForceRecoverCollateralImpl.forceRecoverCollateralImpl(state, marginId);
    }

    /**
     * Deposit additional quote token as collateral for a position. Cancels loan call if:
     * 0 < position.requiredDeposit < depositAmount
     *
     * @param  marginId         Unique ID for the position
     * @param  depositAmount    Additional amount in quote token to deposit
     */
    function depositCollateral(
        bytes32 marginId,
        uint256 depositAmount
    )
        external
        onlyWhileOperational
        nonReentrant
    {
        DepositCollateralImpl.depositCollateralImpl(
            state,
            marginId,
            depositAmount
        );
    }

    /**
     * Cancel an amount of a loan offering. Only callable by the offering's lender.
     *
     * @param  addresses  Array of addresses:
     *
     *  [0] = base token
     *  [1] = quote token
     *  [2] = loan payer
     *  [3] = loan signer
     *  [4] = loan owner
     *  [5] = loan taker
     *  [6] = loan fee recipient
     *  [7] = loan lender fee token
     *  [8] = loan taker fee token
     *
     * @param  values256  Values corresponding to:
     *
     *  [0] = loan maximum amount
     *  [1] = loan minimum amount
     *  [2] = loan minimum quote token
     *  [3] = loan lender fee
     *  [4] = loan taker fee
     *  [5] = loan expiration timestamp (in seconds)
     *  [6] = loan salt
     *
     * @param  values32  Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = loan interest rate (annual nominal percentage times 10**6)
     *  [3] = loan interest update period (in seconds)
     *
     * @param  cancelAmount     Amount to cancel
     * @return                  Amount that was canceled
     */
    function cancelLoanOffering(
        address[9] addresses,
        uint256[7] values256,
        uint32[4]  values32,
        uint256    cancelAmount
    )
        external
        cancelLoanOfferingStateControl
        nonReentrant
        returns (uint256)
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
     *  [0] = base token
     *  [1] = quote token
     *  [2] = loan payer
     *  [3] = loan signer
     *  [4] = loan owner
     *  [5] = loan taker
     *  [6] = loan fee recipient
     *  [7] = loan lender fee token
     *  [8] = loan taker fee token
     *
     * @param  values256  Values corresponding to:
     *
     *  [0] = loan maximum amount
     *  [1] = loan minimum amount
     *  [2] = loan minimum quote token
     *  [3] = loan lender fee
     *  [4] = loan taker fee
     *  [5] = loan expiration timestamp (in seconds)
     *  [6] = loan salt
     *
     * @param  values32  Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = loan interest rate (annual nominal percentage times 10**18)
     *  [3] = loan interest update period (in seconds)
     */
    function approveLoanOffering(
        address[9] addresses,
        uint256[7] values256,
        uint32[4]  values32
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
     * to all payouts for this loan. Only callable by the lender for a position. If the "who"
     * param is a contract, it must implement the LoanOwner interface.
     *
     * @param  marginId  Unique ID for the position
     * @param  who      New owner of the loan
     */
    function transferLoan(
        bytes32 marginId,
        address who
    )
        external
        nonReentrant
    {
        TransferImpl.transferLoanImpl(
            state,
            marginId,
            who);
    }

    /**
     * Transfer ownership of a position to a new address. This new address will be entitled to all
     * payouts. Only callable by the owner of a position. If the "who" param is a contract, it must
     * implement the PositionOwner interface.
     *
     * @param  marginId  Unique ID for the position
     * @param  who       New owner of the position
     */
    function transferPosition(
        bytes32 marginId,
        address who
    )
        external
        nonReentrant
    {
        TransferImpl.transferPositionImpl(
            state,
            marginId,
            who);
    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    function getVaultAddress()
        view
        external
        returns (address)
    {
        return state.VAULT;
    }

    function getProxyAddress()
        view
        external
        returns (address)
    {
        return state.PROXY;
    }
}
