/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { Margin } from "../../Margin.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { MarginCommon } from "../../impl/MarginCommon.sol";
import { LoanOfferingVerifier } from "../../interfaces/LoanOfferingVerifier.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";
import { CancelMarginCallDelegator } from "../../interfaces/lender/CancelMarginCallDelegator.sol";
/* solium-disable-next-line max-len*/
import { ForceRecoverCollateralDelegator } from "../../interfaces/lender/ForceRecoverCollateralDelegator.sol";
import { IncreaseLoanDelegator } from "../../interfaces/lender/IncreaseLoanDelegator.sol";
import { LoanOwner } from "../../interfaces/lender/LoanOwner.sol";
import { MarginCallDelegator } from "../../interfaces/lender/MarginCallDelegator.sol";
import { MarginHelper } from "../lib/MarginHelper.sol";


/**
 * @title BucketLender
 * @author dYdX
 *
 * On-chain shared lender that allows anyone to deposit tokens into this contract to be used to
 * lend tokens for a particular margin position.
 *
 * - Each bucket has three variables:
 *   - Available Amount
 *     - The available amount of tokens that the bucket has to lend out
 *   - Outstanding Principal
 *     - The amount of principal that the bucket is responsible for in the margin position
 *   - Weight
 *     - Used to keep track of each account's weighted ownership within a bucket
 *     - Relative weight between buckets is meaningless
 *     - Only accounts' relative weight within a bucket matters
 *
 * - Token Deposits:
 *   - Go into a particular bucket, determined by time since the start of the position
 *     - If the position has not started: bucket = 0
 *     - If the position has started:     bucket = ceiling(time_since_start / BUCKET_TIME)
 *     - This is always the highest bucket; no higher bucket yet exists
 *   - Increase the bucket's Available Amount
 *   - Increase the bucket's weight and the account's weight in that bucket
 *
 * - Token Withdrawals:
 *   - Can be from any bucket with available amount
 *   - Decrease the bucket's Available Amount
 *   - Decrease the bucket's weight and the account's weight in that bucket
 *
 * - Increasing the Position (Lending):
 *   - The lowest buckets with Available Amount are used first
 *   - Decreases Available Amount
 *   - Increases Outstanding Principal
 *
 * - Decreasing the Position (Being Paid-Back)
 *   - The highest buckets with Outstanding Principal are paid back first
 *   - Decreases Outstanding Principal
 *   - Increases Available Amount
 *
 *
 * - Over time, this gives highest interest rates to earlier buckets, but disallows withdrawals from
 *   those buckets for a longer period of time.
 * - Deposits in the same bucket earn the same interest rate.
 * - Lenders can withdraw their funds at any time if they are not being lent (and are therefore not
 *   making the maximum interest).
 * - The highest bucket with Outstanding Principal is always less-than-or-equal-to the lowest bucket
     with Available Amount
 */
contract BucketLender is
    HasNoEther,
    OnlyMargin,
    LoanOwner,
    IncreaseLoanDelegator,
    MarginCallDelegator,
    CancelMarginCallDelegator,
    ForceRecoverCollateralDelegator,
    LoanOfferingVerifier,
    ReentrancyGuard
{
    using SafeMath for uint256;
    using TokenInteract for address;

    // ============ Events ============

    event Deposit(
        address beneficiary,
        uint256 bucket,
        uint256 amount,
        uint256 weight
    );

    event Withdraw(
        address withdrawer,
        uint256 bucket,
        uint256 weight,
        uint256 owedTokenWithdrawn,
        uint256 heldTokenWithdrawn
    );

    event PrincipalIncreased(
        uint256 principalTotal,
        uint256 bucketNumber,
        uint256 principalForBucket,
        uint256 amount
    );

    event PrincipalDecreased(
        uint256 principalTotal,
        uint256 bucketNumber,
        uint256 principalForBucket,
        uint256 amount
    );

    event AvailableIncreased(
        uint256 availableTotal,
        uint256 bucketNumber,
        uint256 availableForBucket,
        uint256 amount
    );

    event AvailableDecreased(
        uint256 availableTotal,
        uint256 bucketNumber,
        uint256 availableForBucket,
        uint256 amount
    );

    // ============ State Variables ============

    /**
     * Available Amount is the amount of tokens that is available to be lent by each bucket.
     * These tokens are also available to be withdrawn by the accounts that have weight in the
     * bucket.
     */
    // Available Amount for each bucket
    mapping(uint256 => uint256) public availableForBucket;
    // Total Available Amount
    uint256 public availableTotal;

    /**
     * Outstanding Principal is the share of the margin position's principal that each bucket
     * is responsible for. That is, each bucket with Outstanding Principal is owed
     * (Outstanding Principal)*E^(RT) owedTokens in repayment.
     */
    // Outstanding Principal for each bucket
    mapping(uint256 => uint256) public principalForBucket;
    // Total Outstanding Principal
    uint256 public principalTotal;

    /**
     * Weight determines an account's proportional share of a bucket. Relative weights have no
     * meaning if they are not for the same bucket. Likewise, the relative weight of two buckets has
     * no meaning. However, the relative weight of two accounts within the same bucket is equal to
     * the accounts' shares in the bucket and are therefore proportional to the payout that they
     * should expect from withdrawing from that bucket.
     */
    // Weight for each account in each bucket
    mapping(uint256 => mapping(address => uint256)) public weightForBucketForAccount;
    // Total Weight for each bucket
    mapping(uint256 => uint256) public weightForBucket;

    /**
     * The critical bucket is:
     * - Greater-than-or-equal-to The highest bucket with Outstanding Principal
     * - Less-than-or-equal-to the lowest bucket with Available Amount
     *
     * It is equal to both of these values in most cases except in an edge cases where the two
     * buckets are different. This value is cached to find such a bucket faster than looping through
     * all possible buckets.
     */
    uint256 public criticalBucket = 0;

    /**
     * Latest cached value for totalOwedTokenRepaidToLender.
     * This number updates on the dYdX Margin base protocol whenever the position is
     * partially-closed, but this contract is not notified at that time. Therefore, it is updated
     * upon increasing the position or when depositing/withdrawing
     */
    uint256 public cachedRepaidAmount = 0;

    // True if the position was closed from force-recovering the collateral
    bool public wasForceClosed = false;

    // ============ Constants ============

    // Unique ID of the position
    bytes32 public POSITION_ID;

    // Address of the token held in the position as collateral
    address public HELD_TOKEN;

    // Address of the token being lent
    address public OWED_TOKEN;

    // Time between new buckets
    uint32 public BUCKET_TIME;

    // Interest rate of the position
    uint32 public INTEREST_RATE;

    // Interest period of the position
    uint32 public INTEREST_PERIOD;

    // Maximum duration of the position
    uint32 public MAX_DURATION;

    // Margin-call time-limit of the position
    uint32 public CALL_TIMELIMIT;

    // (NUMERATOR/DENOMINATOR) denotes the minimum collateralization ratio of the position
    uint32 public MIN_HELD_TOKEN_NUMERATOR;
    uint32 public MIN_HELD_TOKEN_DENOMINATOR;

    // Accounts that are permitted to margin-call positions (or cancel the margin call)
    mapping(address => bool) public TRUSTED_MARGIN_CALLERS;

    // ============ Constructor ============

    constructor(
        address margin,
        bytes32 positionId,
        address heldToken,
        address owedToken,
        uint32[7] parameters,
        address[] trustedMarginCallers
    )
        public
        OnlyMargin(margin)
    {
        POSITION_ID = positionId;
        HELD_TOKEN = heldToken;
        OWED_TOKEN = owedToken;

        BUCKET_TIME = parameters[0];
        INTEREST_RATE = parameters[1];
        INTEREST_PERIOD = parameters[2];
        MAX_DURATION = parameters[3];
        CALL_TIMELIMIT = parameters[4];
        MIN_HELD_TOKEN_NUMERATOR = parameters[5];
        MIN_HELD_TOKEN_DENOMINATOR = parameters[6];

        for (uint256 i = 0; i < trustedMarginCallers.length; i++) {
            TRUSTED_MARGIN_CALLERS[trustedMarginCallers[i]] = true;
        }

        // Set maximum allowance on proxy
        OWED_TOKEN.approve(
            Margin(DYDX_MARGIN).getProxyAddress(),
            MathHelpers.maxUint256()
        );
    }

    // ============ Modifiers ============

    modifier onlyPosition(bytes32 positionId) {
        require(
            POSITION_ID == positionId,
            "BucketLender#onlyPosition: Incorrect position"
        );
        _;
    }

    // ============ Margin-Only State-Changing Functions ============

    /**
     * Function a smart contract must implement to be able to consent to a loan. The loan offering
     * will be generated off-chain. The "loan owner" address will own the loan-side of the resulting
     * position.
     *
     * @param  addresses    Loan offering addresses
     * @param  values256    Loan offering uint256s
     * @param  values32     Loan offering uint32s
     * @param  positionId   Unique ID of the position
     * @param  signature    Arbitrary bytes
     * @return              This address to accept, a different address to ask that contract
     */
    function verifyLoanOffering(
        address[9] addresses,
        uint256[7] values256,
        uint32[4] values32,
        bytes32 positionId,
        bytes signature
    )
        external
        onlyMargin
        nonReentrant
        onlyPosition(positionId)
        returns (address)
    {
        require(
            Margin(DYDX_MARGIN).containsPosition(POSITION_ID),
            "BucketLender#verifyLoanOffering: This contract should not open a new position"
        );

        MarginCommon.LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32,
            signature
        );

        // CHECK ADDRESSES
        assert(loanOffering.owedToken == OWED_TOKEN);
        assert(loanOffering.heldToken == HELD_TOKEN);
        assert(loanOffering.payer == address(this));
        assert(loanOffering.owner == address(this));
        require(loanOffering.taker == address(0));
        require(loanOffering.feeRecipient == address(0));
        require(loanOffering.positionOwner == address(0));
        require(loanOffering.lenderFeeToken == address(0));
        require(loanOffering.takerFeeToken == address(0));

        // CHECK VALUES256
        require(loanOffering.rates.maxAmount == MathHelpers.maxUint256());
        require(loanOffering.rates.minAmount == 0);
        require(loanOffering.rates.minHeldToken == 0);
        require(loanOffering.rates.lenderFee == 0);
        require(loanOffering.rates.takerFee == 0);
        require(loanOffering.expirationTimestamp == MathHelpers.maxUint256());
        require(loanOffering.salt == 0);

        // CHECK VALUES32
        require(loanOffering.callTimeLimit == CALL_TIMELIMIT);
        require(loanOffering.maxDuration == MAX_DURATION);
        assert(loanOffering.rates.interestRate == INTEREST_RATE);
        assert(loanOffering.rates.interestPeriod == INTEREST_PERIOD);

        // no need to require anything about loanOffering.signature

        return address(this);
    }

    /**
     * Called by the Margin contract when anyone transfers ownership of a loan to this contract.
     * This function initializes this contract and returns this address to indicate to Margin
     * that it is willing to take ownership of the loan.
     *
     * @param  from        Address of the previous owner
     * @param  positionId  Unique ID of the position
     * @return             This address on success, throw otherwise
     */
    function receiveLoanOwnership(
        address from,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        onlyPosition(positionId)
        returns (address)
    {
        MarginCommon.Position memory position = MarginHelper.getPosition(DYDX_MARGIN, POSITION_ID);
        uint256 initialPrincipal = position.principal;
        uint256 minHeldToken = MathHelpers.getPartialAmount(
            uint256(MIN_HELD_TOKEN_NUMERATOR),
            uint256(MIN_HELD_TOKEN_DENOMINATOR),
            initialPrincipal
        );

        assert(initialPrincipal > 0);
        assert(principalTotal == 0);
        assert(from != address(this)); // position must be opened without lending from this position

        require(
            position.owedToken == OWED_TOKEN,
            "BucketLender#receiveLoanOwnership: Position owedToken mismatch"
        );
        require(
            position.heldToken == HELD_TOKEN,
            "BucketLender#receiveLoanOwnership: Position heldToken mismatch"
        );
        require(
            Margin(DYDX_MARGIN).getPositionBalance(POSITION_ID) >= minHeldToken,
            "BucketLender#receiveLoanOwnership: Not enough heldToken as collateral"
        );

        // set relevant constants
        principalForBucket[0] = initialPrincipal;
        principalTotal = initialPrincipal;
        weightForBucket[0] = weightForBucket[0].add(initialPrincipal);
        weightForBucketForAccount[0][from] =
            weightForBucketForAccount[0][from].add(initialPrincipal);

        return address(this);
    }

    /**
     * Called by Margin when additional value is added onto the position this contract
     * is lending for. Balance is added to the address that loaned the additional tokens.
     *
     * @param  payer           Address that loaned the additional tokens
     * @param  positionId      Unique ID of the position
     * @param  principalAdded  Amount that was added to the position
     * @param  lentAmount      Amount of owedToken lent
     * @return                 This address to accept, a different address to ask that contract
     */
    function increaseLoanOnBehalfOf(
        address payer,
        bytes32 positionId,
        uint256 principalAdded,
        uint256 lentAmount
    )
        external
        onlyMargin
        nonReentrant
        onlyPosition(positionId)
        returns (address)
    {
        require(
            payer == address(this),
            "BucketLender#increaseLoanOnBehalfOf: Other lenders cannot lend for this position"
        );
        require(
            !Margin(DYDX_MARGIN).isPositionCalled(POSITION_ID),
            "BucketLender#increaseLoanOnBehalfOf: No lending while the position is margin-called"
        );

        // This function is only called after the state has been updated in the base protocol;
        // thus, the principal in the base protocol will equal the principal after the increase
        uint256 principalAfterIncrease = getPositionPrincipal();
        uint256 principalBeforeIncrease = principalAfterIncrease.sub(principalAdded);

        // principalTotal was the principal after the previous increase
        accountForClose(principalTotal.sub(principalBeforeIncrease));

        accountForIncrease(principalAdded, lentAmount);

        assert(principalTotal == principalAfterIncrease);

        return address(this);
    }

    /**
     * Function a contract must implement in order to let other addresses call marginCall().
     *
     * @param  caller         Address of the caller of the marginCall function
     * @param  positionId     Unique ID of the position
     * @param  depositAmount  Amount of heldToken deposit that will be required to cancel the call
     * @return                This address to accept, a different address to ask that contract
     */
    function marginCallOnBehalfOf(
        address caller,
        bytes32 positionId,
        uint256 depositAmount
    )
        external
        onlyMargin
        nonReentrant
        onlyPosition(positionId)
        returns (address)
    {
        require(
            TRUSTED_MARGIN_CALLERS[caller],
            "BucketLender#marginCallOnBehalfOf: Margin-caller must be trusted"
        );
        require(
            depositAmount == 0, // prevents depositing from canceling the margin-call
            "BucketLender#marginCallOnBehalfOf: Deposit amount must be zero"
        );

        return address(this);
    }

    /**
     * Function a contract must implement in order to let other addresses call cancelMarginCall().
     *
     * @param  canceler    Address of the caller of the cancelMarginCall function
     * @param  positionId  Unique ID of the position
     * @return             This address to accept, a different address to ask that contract
     */
    function cancelMarginCallOnBehalfOf(
        address canceler,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        onlyPosition(positionId)
        returns (address)
    {
        require(
            TRUSTED_MARGIN_CALLERS[canceler],
            "BucketLender#cancelMarginCallOnBehalfOf: Margin-call-canceler must be trusted"
        );

        return address(this);
    }

    /**
     * Function a contract must implement in order to let other addresses call
     * forceRecoverCollateral().
     *
     *  param  recoverer   Address of the caller of the forceRecoverCollateral() function
     * @param  positionId  Unique ID of the position
     * @param  recipient   Address to send the recovered tokens to
     * @return             This address to accept, a different address to ask that contract
     */
    function forceRecoverCollateralOnBehalfOf(
        address /* recoverer */,
        bytes32 positionId,
        address recipient
    )
        external
        onlyMargin
        nonReentrant
        onlyPosition(positionId)
        returns (address)
    {
        require(
            recipient == address(this),
            "BucketLender#forceRecoverCollateralOnBehalfOf: Recipient must be this contract"
        );

        rebalanceBucketsInternal();

        wasForceClosed = true;

        return address(this);
    }

    // ============ Public State-Changing Functions ============

    /**
     * Allow anyone to recalculate the Outstanding Principal and Available Amount for the buckets if
     * part of the position has been closed since the last position increase.
     */
    function rebalanceBuckets()
        external
        nonReentrant
    {
        rebalanceBucketsInternal();
    }

    /**
     * Allows users to deposit owedToken into this contract. Allowance must be set on this contract
     * for "token" in at least the amount "amount".
     *
     * @param  beneficiary  The account that will be entitled to this depoit
     * @param  amount       The amount of owedToken to deposit
     * @return              The bucket number that was deposited into
     */
    function deposit(
        address beneficiary,
        uint256 amount
    )
        external
        nonReentrant
        returns (uint256)
    {
        require(
            beneficiary != address(0),
            "BucketLender#deposit: Beneficiary cannot be the zero address"
        );
        require(
            amount != 0,
            "BucketLender#deposit: Cannot deposit zero tokens"
        );
        require(
            !Margin(DYDX_MARGIN).isPositionClosed(POSITION_ID),
            "BucketLender#deposit: Cannot deposit after the position is closed"
        );
        require(
            !Margin(DYDX_MARGIN).isPositionCalled(POSITION_ID),
            "BucketLender#deposit: Cannot deposit while the position is margin-called"
        );

        rebalanceBucketsInternal();

        OWED_TOKEN.transferFrom(
            msg.sender,
            address(this),
            amount
        );

        uint256 bucket = getCurrentBucket();

        uint256 effectiveAmount = availableForBucket[bucket].add(getBucketOwedAmount(bucket));

        uint256 weightToAdd = 0;
        if (effectiveAmount == 0) {
            weightToAdd = amount; // first deposit in bucket
        } else {
            weightToAdd = MathHelpers.getPartialAmount(
                amount,
                effectiveAmount,
                weightForBucket[bucket]
            );
        }

        require(
            weightToAdd != 0,
            "BucketLender#deposit: Cannot deposit for zero weight"
        );

        // update state
        updateAvailable(bucket, amount, true);
        weightForBucketForAccount[bucket][beneficiary] =
            weightForBucketForAccount[bucket][beneficiary].add(weightToAdd);
        weightForBucket[bucket] = weightForBucket[bucket].add(weightToAdd);

        emit Deposit(
            beneficiary,
            bucket,
            amount,
            weightToAdd
        );

        return bucket;
    }

    /**
     * Allows users to withdraw their lent funds. An account can withdraw its weighted share of the
     * bucket.
     *
     * While the position is open, a bucket's share is equal to:
     *   Owed Token: (Available Amount) + (Outstanding Principal) * (1 + interest)
     *   Held Token: 0
     *
     * After the position is closed, a bucket's share is equal to:
     *   Owed Token: (Available Amount)
     *   Held Token: (Held Token Balance) * (Outstanding Principal) / (Total Outstanding Principal)
     *
     * @param  buckets      The bucket numbers to withdraw from
     * @param  maxWeights   The maximum weight to withdraw from each bucket. The amount of tokens
     *                      withdrawn will be at least this amount, but not necessarily more.
     *                      Withdrawing the same weight from different buckets does not necessarily
     *                      return the same amounts from those buckets. In order to withdraw as many
     *                      tokens as possible, use the maximum uint256.
     * @param  beneficiary  The address to send the tokens to
     * @return              1) The number of owedTokens withdrawn
     *                      2) The number of heldTokens withdrawn
     */
    function withdraw(
        uint256[] buckets,
        uint256[] maxWeights,
        address beneficiary
    )
        external
        nonReentrant
        returns (uint256, uint256)
    {
        require(
            beneficiary != address(0),
            "BucketLender#withdraw: Beneficiary cannot be the zero address"
        );
        require(
            buckets.length == maxWeights.length,
            "BucketLender#withdraw: The lengths of the input arrays must match"
        );

        rebalanceBucketsInternal();

        // decide if some bucket is unable to be withdrawn from (is locked)
        // the zero value represents no-lock
        uint256 lockedBucket = 0;
        if (
            Margin(DYDX_MARGIN).containsPosition(POSITION_ID) &&
            criticalBucket == getCurrentBucket()
        ) {
            lockedBucket = criticalBucket;
        }

        uint256 totalOwedToken = 0;
        uint256 totalHeldToken = 0;

        uint256 maxHeldToken = 0;
        if (wasForceClosed) {
            maxHeldToken = HELD_TOKEN.balanceOf(address(this));
        }

        for (uint256 i = 0; i < buckets.length; i++) {
            uint256 bucket = buckets[i];

            // prevent withdrawing from the current bucket if it is also the critical bucket
            if ((bucket != 0) && (bucket == lockedBucket)) {
                continue;
            }

            (uint256 owedTokenForBucket, uint256 heldTokenForBucket) = withdrawSingleBucket(
                bucket,
                maxWeights[i],
                maxHeldToken
            );

            totalOwedToken = totalOwedToken.add(owedTokenForBucket);
            totalHeldToken = totalHeldToken.add(heldTokenForBucket);
        }

        // Transfer share of owedToken
        OWED_TOKEN.transfer(beneficiary, totalOwedToken);
        HELD_TOKEN.transfer(beneficiary, totalHeldToken);

        return (totalOwedToken, totalHeldToken);
    }

    // ============ Helper Functions ============

    /**
     * Recalculates the Outstanding Principal and Available Amount for the buckets. Only changes the
     * state if part of the position has been closed since the last position increase.
     */
    function rebalanceBucketsInternal()
        private
    {
        // if force-closed, don't update the outstanding principal values; they are needed to repay
        // lenders with heldToken
        if (wasForceClosed) {
            return;
        }

        uint256 marginPrincipal = getPositionPrincipal();

        accountForClose(principalTotal.sub(marginPrincipal));

        assert(principalTotal == marginPrincipal);
    }

    /**
     * Updates the state variables at any time. Only does anything after the position has been
     * closed or partially-closed since the last time this function was called.
     *
     * - Increases the available amount in the highest buckets with outstanding principal
     * - Decreases the principal amount in those buckets
     *
     * @param  principalRemoved  Amount of principal closed since the last update
     */
    function accountForClose(
        uint256 principalRemoved
    )
        private
    {
        if (principalRemoved == 0) {
            return;
        }

        uint256 newRepaidAmount = Margin(DYDX_MARGIN).getTotalOwedTokenRepaidToLender(POSITION_ID);
        assert(newRepaidAmount.sub(cachedRepaidAmount) >= principalRemoved);

        uint256 principalToSub = principalRemoved;
        uint256 availableToAdd = newRepaidAmount.sub(cachedRepaidAmount);
        uint256 criticalBucketTemp = criticalBucket;

        // loop over buckets in reverse order starting with the critical bucket
        for (
            uint256 bucket = criticalBucketTemp;
            principalToSub > 0;
            bucket--
        ) {
            assert(bucket <= criticalBucketTemp); // no underflow on bucket

            uint256 principalTemp = Math.min256(principalToSub, principalForBucket[bucket]);
            if (principalTemp == 0) {
                continue;
            }
            uint256 availableTemp = MathHelpers.getPartialAmount(
                principalTemp,
                principalToSub,
                availableToAdd
            );

            updateAvailable(bucket, availableTemp, true);
            updatePrincipal(bucket, principalTemp, false);

            principalToSub = principalToSub.sub(principalTemp);
            availableToAdd = availableToAdd.sub(availableTemp);

            criticalBucketTemp = bucket;
        }

        assert(principalToSub == 0);
        assert(availableToAdd == 0);

        setCriticalBucket(criticalBucketTemp);

        cachedRepaidAmount = newRepaidAmount;
    }

    /**
     * Updates the state variables when a position is increased.
     *
     * - Decreases the available amount in the lowest buckets with available token
     * - Increases the principal amount in those buckets
     *
     * @param  principalAdded  Amount of principal added to the position
     * @param  lentAmount      Amount of owedToken lent
     */
    function accountForIncrease(
        uint256 principalAdded,
        uint256 lentAmount
    )
        private
    {
        require(
            lentAmount <= availableTotal,
            "BucketLender#accountForIncrease: No lending not-accounted-for funds"
        );

        uint256 principalToAdd = principalAdded;
        uint256 availableToSub = lentAmount;
        uint256 criticalBucketTemp;

        // loop over buckets in order starting from the critical bucket
        uint256 lastBucket = getCurrentBucket();
        for (
            uint256 bucket = criticalBucket;
            principalToAdd > 0;
            bucket++
        ) {
            assert(bucket <= lastBucket); // should never go past the last bucket

            uint256 availableTemp = Math.min256(availableToSub, availableForBucket[bucket]);
            if (availableTemp == 0) {
                continue;
            }
            uint256 principalTemp = MathHelpers.getPartialAmount(
                availableTemp,
                availableToSub,
                principalToAdd
            );

            updateAvailable(bucket, availableTemp, false);
            updatePrincipal(bucket, principalTemp, true);

            principalToAdd = principalToAdd.sub(principalTemp);
            availableToSub = availableToSub.sub(availableTemp);

            criticalBucketTemp = bucket;
        }

        assert(principalToAdd == 0);
        assert(availableToSub == 0);

        setCriticalBucket(criticalBucketTemp);
    }

    /**
     * Withdraw
     *
     * @param  bucket        The bucket number to withdraw from
     * @param  maxWeight     The maximum weight to withdraw
     * @param  maxHeldToken  The total amount of heldToken that has been force-recovered
     * @return               1) The number of owedTokens withdrawn
     *                       2) The number of heldTokens withdrawn
     */
    function withdrawSingleBucket(
        uint256 bucket,
        uint256 maxWeight,
        uint256 maxHeldToken
    )
        private
        returns (uint256, uint256)
    {
        // calculate the user's share
        uint256 bucketWeight = weightForBucket[bucket];
        if (bucketWeight == 0) {
            return (0, 0);
        }

        uint256 userWeight = weightForBucketForAccount[bucket][msg.sender];
        uint256 weightToWithdraw = Math.min256(maxWeight, userWeight);
        if (weightToWithdraw == 0) {
            return (0, 0);
        }

        // update state
        weightForBucket[bucket] = weightForBucket[bucket].sub(weightToWithdraw);
        weightForBucketForAccount[bucket][msg.sender] = userWeight.sub(weightToWithdraw);

        // calculate for owedToken
        uint256 owedTokenToWithdraw = withdrawOwedToken(
            bucket,
            weightToWithdraw,
            bucketWeight
        );

        // calculate for heldToken
        uint256 heldTokenToWithdraw = withdrawHeldToken(
            bucket,
            weightToWithdraw,
            bucketWeight,
            maxHeldToken
        );

        emit Withdraw(
            msg.sender,
            bucket,
            weightToWithdraw,
            owedTokenToWithdraw,
            heldTokenToWithdraw
        );

        return (owedTokenToWithdraw, heldTokenToWithdraw);
    }

    /**
     * Helper function to withdraw earned owedToken from this contract.
     *
     * @param  bucket        The bucket number to withdraw from
     * @param  userWeight    The amount of weight the user is using to withdraw
     * @param  bucketWeight  The total weight of the bucket
     * @return               The amount of owedToken being withdrawn
     */
    function withdrawOwedToken(
        uint256 bucket,
        uint256 userWeight,
        uint256 bucketWeight
    )
        private
        returns (uint256)
    {
        // amount to return for the bucket
        uint256 owedTokenToWithdraw = MathHelpers.getPartialAmount(
            userWeight,
            bucketWeight,
            availableForBucket[bucket].add(getBucketOwedAmount(bucket))
        );

        // check that there is enough token to give back
        require(
            owedTokenToWithdraw <= availableForBucket[bucket],
            "BucketLender#withdrawOwedToken: There must be enough available owedToken"
        );

        // update amounts
        updateAvailable(bucket, owedTokenToWithdraw, false);

        return owedTokenToWithdraw;
    }

    /**
     * Helper function to withdraw heldToken from this contract.
     *
     * @param  bucket        The bucket number to withdraw from
     * @param  userWeight    The amount of weight the user is using to withdraw
     * @param  bucketWeight  The total weight of the bucket
     * @param  maxHeldToken  The total amount of heldToken available to withdraw
     * @return               The amount of heldToken being withdrawn
     */
    function withdrawHeldToken(
        uint256 bucket,
        uint256 userWeight,
        uint256 bucketWeight,
        uint256 maxHeldToken
    )
        private
        returns (uint256)
    {
        if (maxHeldToken == 0) {
            return 0;
        }

        // user's principal for the bucket
        uint256 principalForBucketForAccount = MathHelpers.getPartialAmount(
            userWeight,
            bucketWeight,
            principalForBucket[bucket]
        );

        uint256 heldTokenToWithdraw = MathHelpers.getPartialAmount(
            principalForBucketForAccount,
            principalTotal,
            maxHeldToken
        );

        updatePrincipal(bucket, principalForBucketForAccount, false);

        return heldTokenToWithdraw;
    }

    // ============ Setter Functions ============

    /**
     * Changes the critical bucket variable
     *
     * @param  bucket  The value to set criticalBucket to
     */
    function setCriticalBucket(
        uint256 bucket
    )
        private
    {
        // don't spend the gas to sstore unless we need to change the value
        if (criticalBucket == bucket) {
            return;
        }

        criticalBucket = bucket;
    }

    /**
     * Changes the available owedToken amount. This changes both the variable to track the total
     * amount as well as the variable to track a particular bucket.
     *
     * @param  bucket    The bucket number
     * @param  amount    The amount to change the available amount by
     * @param  increase  True if positive change, false if negative change
     */
    function updateAvailable(
        uint256 bucket,
        uint256 amount,
        bool increase
    )
        private
    {
        if (amount == 0) {
            return;
        }

        uint256 newTotal;
        uint256 newForBucket;

        if (increase) {
            newTotal = availableTotal.add(amount);
            newForBucket = availableForBucket[bucket].add(amount);
            emit AvailableIncreased(newTotal, bucket, newForBucket, amount);
        } else {
            newTotal = availableTotal.sub(amount);
            newForBucket = availableForBucket[bucket].sub(amount);
            emit AvailableDecreased(newTotal, bucket, newForBucket, amount);
        }

        availableTotal = newTotal;
        availableForBucket[bucket] = newForBucket;
    }

    /**
     * Changes the principal amount. This changes both the variable to track the total
     * amount as well as the variable to track a particular bucket.
     *
     * @param  bucket    The bucket number
     * @param  amount    The amount to change the principal amount by
     * @param  increase  True if positive change, false if negative change
     */
    function updatePrincipal(
        uint256 bucket,
        uint256 amount,
        bool increase
    )
        private
    {
        if (amount == 0) {
            return;
        }

        uint256 newTotal;
        uint256 newForBucket;

        if (increase) {
            newTotal = principalTotal.add(amount);
            newForBucket = principalForBucket[bucket].add(amount);
            emit PrincipalIncreased(newTotal, bucket, newForBucket, amount);
        } else {
            newTotal = principalTotal.sub(amount);
            newForBucket = principalForBucket[bucket].sub(amount);
            emit PrincipalDecreased(newTotal, bucket, newForBucket, amount);
        }

        principalTotal = newTotal;
        principalForBucket[bucket] = newForBucket;
    }

    // ============ Getter Functions ============

    /**
     * Get the current bucket number that funds will be deposited into. This is also the highest
     * bucket so far.
     *
     * @return The highest bucket and the one that funds will be deposited into
     */
    function getCurrentBucket()
        private
        view
        returns (uint256)
    {
        assert(!Margin(DYDX_MARGIN).isPositionClosed(POSITION_ID));

        // if position not created, allow deposits in the first bucket
        if (!Margin(DYDX_MARGIN).containsPosition(POSITION_ID)) {
            return 0;
        }

        // return the number of BUCKET_TIME periods elapsed since the position start, rounded-up
        uint256 marginTimestamp = Margin(DYDX_MARGIN).getPositionStartTimestamp(POSITION_ID);
        return block.timestamp.sub(marginTimestamp).div(BUCKET_TIME).add(1);
    }

    /**
     * Gets the outstanding amount of owedToken owed to a bucket. This is the principal amount of
     * the bucket multiplied by the interest accrued in the position. If the position is closed,
     * then any outstanding principal will never be repaid in the form of owedToken.
     *
     * @param  bucket  The bucket number
     * @return         The amount of owedToken that this bucket expects to be paid-back if the posi
     */
    function getBucketOwedAmount(
        uint256 bucket
    )
        private
        view
        returns (uint256)
    {
        // if the position is completely closed, then the outstanding principal will never be repaid
        if (Margin(DYDX_MARGIN).isPositionClosed(POSITION_ID)) {
            return 0;
        }

        uint256 lentPrincipal = principalForBucket[bucket];

        // the bucket has no outstanding principal
        if (lentPrincipal == 0) {
            return 0;
        }

        // get the total amount of owedToken that would be paid back at this time
        uint256 owedAmount = Margin(DYDX_MARGIN).getPositionOwedAmountAtTime(
            POSITION_ID,
            principalTotal,
            uint32(block.timestamp)
        );

        // return the bucket's share
        return MathHelpers.getPartialAmount(
            lentPrincipal,
            principalTotal,
            owedAmount
        );
    }

    /**
     * Gets the position's current principal amount from the Margin contract
     *
     * @return The position's current principal
     */
    function getPositionPrincipal()
        private
        view
        returns (uint256)
    {
        return Margin(DYDX_MARGIN).getPositionPrincipal(POSITION_ID);
    }
}
