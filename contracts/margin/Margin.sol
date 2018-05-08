pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { Vault } from "./Vault.sol";
import { ClosePositionImpl } from "./impl/ClosePositionImpl.sol";
import { CloseWithoutCounterpartyImpl } from "./impl/CloseWithoutCounterpartyImpl.sol";
import { DepositCollateralImpl } from "./impl/DepositCollateralImpl.sol";
import { ForceRecoverCollateralImpl } from "./impl/ForceRecoverCollateralImpl.sol";
import { IncreasePositionImpl } from "./impl/IncreasePositionImpl.sol";
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
contract Margin is
    NoOwner,
    ReentrancyGuard,
    MarginStorage,
    MarginEvents,
    MarginAdmin,
    LoanGetters,
    PositionGetters
{

    using SafeMath for uint256;

    // ============ Constructor ============

    constructor(
        address vault,
        address proxy
    )
        public
        MarginAdmin()
    {
        state = MarginState.State({
            VAULT: vault,
            PROXY: proxy
        });
    }

    // ============ Public State Changing Functions ============

    /**
     * Open a margin position. Called by the margin trader who must provide both a
     * signed loan offering as well as a buy order with which to sell the owedToken.
     *
     * @param  addresses           Addresses corresponding to:
     *
     *  [0]  = position owner
     *  [1]  = owedToken
     *  [2]  = heldToken
     *  [3]  = loan payer
     *  [4]  = loan signer
     *  [5]  = loan owner
     *  [6]  = loan taker
     *  [7]  = loan fee recipient
     *  [8]  = loan lender fee token
     *  [9]  = loan taker fee token
     *  [10]  = exchange wrapper address
     *
     * @param  values256           Values corresponding to:
     *
     *  [0]  = loan maximum amount
     *  [1]  = loan minimum amount
     *  [2]  = loan minimum heldToken
     *  [3]  = loan lender fee
     *  [4]  = loan taker fee
     *  [5]  = loan expiration timestamp (in seconds)
     *  [6]  = loan salt
     *  [7]  = position amount of principal
     *  [8]  = deposit amount
     *
     * @param  values32            Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = loan interest rate (annual nominal percentage times 10**6)
     *  [3] = loan interest update period (in seconds)
     *
     * @param  sigV                ECDSA v parameter for loan offering
     * @param  sigRS               ECDSA r and s parameters for loan offering
     * @param  depositInHeldToken  True if the trader wishes to pay the margin deposit in heldToken.
     *                             False if the margin deposit will be in owedToken
     *                             and then sold along with the owedToken borrowed from the lender
     * @param  order               Order object to be passed to the exchange wrapper
     * @return                     Unique ID for the new position
     */
    function openPosition(
        address[11] addresses,
        uint256[9]  values256,
        uint32[4]   values32,
        uint8       sigV,
        bytes32[2]  sigRS,
        bool        depositInHeldToken,
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
            depositInHeldToken,
            order
        );
    }

    /**
     * Increase the size of a position. Funds will be borrowed from the loan payer and sold as per
     * the position. The amount of owedToken borrowed from the lender will be >= the amount of
     * principal added, as it will incorporate interest already earned by the position so far.
     *
     * @param  addresses           Addresses corresponding to:
     *
     *  [0]  = loan payer
     *  [1]  = loan signer
     *  [2]  = loan taker
     *  [3]  = loan fee recipient
     *  [4]  = loan lender fee token
     *  [5]  = loan taker fee token
     *  [6]  = exchange wrapper address
     *
     * @param  values256           Values corresponding to:
     *
     *  [0]  = loan maximum amount
     *  [1]  = loan minimum amount
     *  [2]  = loan minimum heldToken
     *  [3]  = loan lender fee
     *  [4]  = loan taker fee
     *  [5]  = loan expiration timestamp (in seconds)
     *  [6]  = loan salt
     *  [7]  = amount of principal to add to the position (NOTE: the amount pulled from the lender
     *                                                           will be >= this amount)
     *
     * @param  values32            Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *
     * @param  sigV                ECDSA v parameter for loan offering
     * @param  sigRS               ECDSA r and s parameters for loan offering
     * @param  depositInHeldToken  True if the trader wishes to pay the margin deposit in heldToken.
     *                             False if the margin deposit will be pulled in owedToken
     *                             and then sold along with the owedToken borrowed from the lender
     * @param  order               Order object to be passed to the exchange wrapper
     * @return                     Amount of owedTokens pulled from the lender
     */
    function increasePosition(
        bytes32     positionId,
        address[7]  addresses,
        uint256[8]  values256,
        uint32[2]   values32,
        uint8       sigV,
        bytes32[2]  sigRS,
        bool        depositInHeldToken,
        bytes       order
    )
        external
        onlyWhileOperational
        nonReentrant
        returns (uint256)
    {
        return IncreasePositionImpl.increasePositionImpl(
            state,
            positionId,
            addresses,
            values256,
            values32,
            sigV,
            sigRS,
            depositInHeldToken,
            order
        );
    }

    /**
     * Increase a position directly by putting up heldToken. The caller will serve as both the
     * lender and the position owner
     *
     * @param  positionId      Unique ID of the position sell
     * @param  principalToAdd  Principal amount to add to the position
     * @return                 Amount of heldToken pulled from the msg.sender
     */
    function increaseWithoutCounterparty(
        bytes32 positionId,
        uint256 principalToAdd
    )
        external
        onlyWhileOperational
        nonReentrant
        returns (uint256)
    {
        return IncreasePositionImpl.increaseWithoutCounterpartyImpl(
            state,
            positionId,
            principalToAdd
        );
    }

    /**
     * Close a position. May be called by the owner or with the approval of the owner. May provide
     * an order and exchangeWrapper to facilitate the closing of the position. The payoutRecipient
     * is sent the resulting payout.
     *
     * @param  positionId            Unique ID for the position
     * @param  requestedCloseAmount  Principal amount of the position to close. The actual amount
     *                               closed is also bounded by:
     *                               1) The principal of the position
     *                               2) The amount allowed by the owner if closer != owner
     * @param  payoutRecipient       Address of the recipient of tokens paid out from closing
     * @param  exchangeWrapper       Address of the exchange wrapper
     * @param  payoutInHeldToken     True to pay out the payoutRecipient in heldToken,
     *                               False to pay out the payoutRecipient in owedToken
     * @param  order                 Order object to be passed to the exchange wrapper
     * @return                       Values corresponding to:
     *                               1) Principal of position closed
     *                               2) Amount of tokens (heldToken if payoutInHeldtoken is true,
     *                                  owedToken otherwise) received by the payoutRecipient
     *                               3) Amount of owedToken paid (incl. interest fee) to the lender
     */
    function closePosition(
        bytes32 positionId,
        uint256 requestedCloseAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool    payoutInHeldToken,
        bytes   order
    )
        external
        closePositionStateControl
        nonReentrant
        returns (uint256, uint256, uint256)
    {
        return ClosePositionImpl.closePositionImpl(
            state,
            positionId,
            requestedCloseAmount,
            payoutRecipient,
            exchangeWrapper,
            payoutInHeldToken,
            order
        );
    }

    /**
     * Helper to close a position by paying owedToken directly rather than using an exchangeWrapper.
     *
     * @param  positionId            Unique ID for the position
     * @param  requestedCloseAmount  Principal amount of the position to close. The actual amount
     *                               closed is also bounded by:
     *                               1) The principal of the position
     *                               2) The amount allowed by the owner if closer != owner
     * @param  payoutRecipient       Address of the recipient of tokens paid out from closing
     * @return                       Values corresponding to:
     *                               1) Principal amount of position closed
     *                               2) Amount of heldToken received by the payoutRecipient
     *                               3) Amount of owedToken paid (incl. interest fee) to the lender
     */
    function closePositionDirectly(
        bytes32 positionId,
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
            positionId,
            requestedCloseAmount,
            payoutRecipient,
            address(0),
            true,
            new bytes(0)
        );
    }

    /**
     * Reduce the size of a position and withdraw a proportional amount of heldToken from the vault.
     * Must be approved by both the position owner and lender.
     *
     * @param  positionId            Unique ID for the position
     * @param  requestedCloseAmount  Principal amount of the position to close. The actual amount
     *                               closed is also bounded by:
     *                               1) The principal of the position
     *                               2) The amount allowed by the owner if closer != owner
     *                               3) The amount allowed by the lender if closer != lender
     * @return                       Values corresponding to:
     *                               1) Principal amount of position closed
     *                               2) Amount of heldToken received by the msg.sender
     */
    function closeWithoutCounterparty(
        bytes32 positionId,
        uint256 requestedCloseAmount,
        address payoutRecipient
    )
        external
        closePositionStateControl
        nonReentrant
        returns (uint256, uint256)
    {
        return CloseWithoutCounterpartyImpl.closeWithoutCounterpartyImpl(
            state,
            positionId,
            requestedCloseAmount,
            payoutRecipient
        );
    }

    /**
     * Margin-call a position. Only callable with the approval of the position lender. After the
     * call, the position owner will have time equal to the callTimeLimit of the position to close
     * the position. If the owner does not close the position, the lender can recover the collateral
     * in the position.
     *
     * @param  positionId       Unique ID for the position
     * @param  requiredDeposit  Amount of deposit the position owner will have to put up to cancel
     *                          the margin-call
     */
    function marginCall(
        bytes32 positionId,
        uint256 requiredDeposit
    )
        external
        nonReentrant
    {
        LoanImpl.marginCallImpl(
            state,
            positionId,
            requiredDeposit
        );
    }

    /**
     * Cancel a margin-call. Only callable with the approval of the position lender.
     *
     * @param  positionId  Unique ID for the position
     */
    function cancelMarginCall(
        bytes32 positionId
    )
        external
        onlyWhileOperational
        nonReentrant
    {
        LoanImpl.cancelMarginCallImpl(state, positionId);
    }

    /**
     * Used to recover the heldTokens held as collateral. Is callable after the maximum duration of
     * the loan has expired or the loan has been margin-called for the duration of the callTimeLimit
     * but remains unclosed. Only callable with the approval of the position lender.
     *
     * @param  positionId           Unique ID for the position
     * @param  collateralRecipient  Address to send the recovered tokens to
     * @return                      Amount of heldToken recovered
     */
    function forceRecoverCollateral(
        bytes32 positionId,
        address collateralRecipient
    )
        external
        nonReentrant
        returns (uint256)
    {
        return ForceRecoverCollateralImpl.forceRecoverCollateralImpl(
            state,
            positionId,
            collateralRecipient
        );
    }

    /**
     * Deposit additional heldToken as collateral for a position. Cancels margin-call if:
     * 0 < position.requiredDeposit < depositAmount. Only callable by the position owner.
     *
     * @param  positionId       Unique ID for the position
     * @param  depositAmount    Additional amount in heldToken to deposit
     */
    function depositCollateral(
        bytes32 positionId,
        uint256 depositAmount
    )
        external
        onlyWhileOperational
        nonReentrant
    {
        DepositCollateralImpl.depositCollateralImpl(
            state,
            positionId,
            depositAmount
        );
    }

    /**
     * Cancel an amount of a loan offering. Only callable by the loan offering's payer or signer.
     *
     * @param  addresses  Array of addresses:
     *
     *  [0] = owedToken
     *  [1] = heldToken
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
     *  [2] = loan minimum heldToken
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
     *  [0] = owedToken
     *  [1] = heldToken
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
     *  [2] = loan minimum heldToken
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
     * @param  positionId  Unique ID for the position
     * @param  who         New owner of the loan
     */
    function transferLoan(
        bytes32 positionId,
        address who
    )
        external
        nonReentrant
    {
        TransferImpl.transferLoanImpl(
            state,
            positionId,
            who);
    }

    /**
     * Transfer ownership of a position to a new address. This new address will be entitled to all
     * payouts. Only callable by the owner of a position. If the "who" param is a contract, it must
     * implement the PositionOwner interface.
     *
     * @param  positionId  Unique ID for the position
     * @param  who         New owner of the position
     */
    function transferPosition(
        bytes32 positionId,
        address who
    )
        external
        nonReentrant
    {
        TransferImpl.transferPositionImpl(
            state,
            positionId,
            who);
    }

    // ============ Public Constant Functions ============

    /**
     * Gets the address of the Vault contract that holds and accounts for tokens.
     *
     * @return  The address of the Vault contract
     */
    function getVaultAddress()
        external
        view
        returns (address)
    {
        return state.VAULT;
    }

    /**
     * Gets the address of the Proxy contract that accounts must set allowance on in order to make
     * loans or open/close positions.
     *
     * @return  The address of the Proxy contract
     */
    function getProxyAddress()
        external
        view
        returns (address)
    {
        return state.PROXY;
    }
}
