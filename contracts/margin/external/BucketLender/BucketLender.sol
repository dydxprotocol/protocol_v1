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
 * lend tokens for a particular position.

 * - Deposits go into a particular bucket, determined by time since the start of the position.
 * - When lending money, earlier buckets are used to lend first.
 * - When money is paid back, later buckets are paid back first.
 * - Over time, this gives higher interest to earlier buckets, but locks-up those funds for longer.
 * - Deposits in the same bucket earn the same interest.
 * - Lenders can withdraw their funds at any time if the funds are not being lent.
 */
contract BucketLender is
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

    // ============ Events ============

    // TODO

    // ============ State Variables ============

    // Available token to lend
    mapping(uint256 => uint256) public availableForBkt;
    uint256 public availableTotal;

    // Current allocated principal for each bucket
    mapping(uint256 => uint256) public principalForBkt;
    uint256 public principalTotal;

    // Bucket accounting for which accounts have deposited into that bucket
    mapping(uint256 => mapping(address => uint256)) public weightForBktForAct;
    mapping(uint256 => uint256) public weightForBkt;

    // Latest recorded value for totalOwedTokenRepaidToLender
    uint256 public cachedRepaidAmount = 0;

    // ============ Constants ============

    // Address of the token being lent
    address public OWED_TOKEN;

    // Address of the token held in the position as collateral
    address public HELD_TOKEN;

    // Time between new buckets
    uint32 public BUCKET_TIME;

    // Unique ID of the position
    bytes32 public POSITION_ID;

    // Accounts that are permitted to margin-call positions (or cancel the margin call)
    mapping(address => bool) public TRUSTED_MARGIN_CALLERS;

    // ============ Constructor ============

    constructor(
        address margin,
        bytes32 positionId,
        address heldToken,
        address owedToken,
        uint32 bucketTime,
        address[] trustedMarginCallers
    )
        public
        OnlyMargin(margin)
    {
        POSITION_ID = positionId;
        HELD_TOKEN = heldToken;
        OWED_TOKEN = owedToken;
        BUCKET_TIME = bucketTime;

        for (uint256 i = 0; i < trustedMarginCallers.length; i = i.add(1)) {
            TRUSTED_MARGIN_CALLERS[trustedMarginCallers[i]] = true;
        }

        TokenInteract.approve(
            OWED_TOKEN,
            Margin(DYDX_MARGIN).getProxyAddress(),
            MathHelpers.maxUint256()
        );
    }

    // ============ Modifiers ============

    modifier onlyPosition(bytes32 positionId) {
        require(
            POSITION_ID == positionId
        );
        _;
    }

    modifier onlyWhileOpen() {
        require(
            !Margin(DYDX_MARGIN).isPositionClosed(POSITION_ID)
        );
        _;
    }

    // ============ Margin-Only State-Changing Functions ============

    /**
     * Function a smart contract must implement to be able to consent to a loan. The loan offering
     * will be generated off-chain and signed by a signer. The Margin contract will verify that
     * the signature for the loan offering was made by signer. The "loan owner" address will own the
     * loan-side of the resulting position.
     *
     * If true is returned, and no errors are thrown by the Margin contract, the loan will have
     * occurred. This means that verifyLoanOffering can also be used to update internal contract
     * state on a loan.
     *
     * @param  addresses    Array of addresses:
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
     * @param  values256    Values corresponding to:
     *
     *  [0] = loan maximum amount
     *  [1] = loan minimum amount
     *  [2] = loan minimum heldToken
     *  [3] = loan lender fee
     *  [4] = loan taker fee
     *  [5] = loan expiration timestamp (in seconds)
     *  [6] = loan salt
     *
     * @param  values32     Values corresponding to:
     *
     *  [0] = loan call time limit (in seconds)
     *  [1] = loan maxDuration (in seconds)
     *  [2] = loan interest rate (annual nominal percentage times 10**6)
     *  [3] = loan interest update period (in seconds)
     *
     * @param  positionId   Unique ID of the position
     * @return              This address to accept, a different address to ask that contract
     */
    function verifyLoanOffering(
        address[10] addresses,
        uint256[7] values256,
        uint32[4] values32,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        LoanOffering memory loanOffering = parseLoanOffering(addresses, values256, values32);

        /* CHECK POSITIONID */
        require(positionId == POSITION_ID);

        /* CHECK ADDRESSES */
        require(loanOffering.owedToken == OWED_TOKEN);
        require(loanOffering.heldToken == HELD_TOKEN);
        require(loanOffering.payer == address(this));
        // no need to require anything about loanOffering.signer
        require(loanOffering.owner == address(this));
        // no need to require anything about loanOffering.taker
        // no need to require anything about loanOffering.positionOwner
        // no need to require anything about loanOffering.feeRecipient
        // no need to require anything about loanOffering.lenderFeeToken
        // no need to require anything about loanOffering.takerFeeToken

        /* CHECK VALUES256 */
        // no need to require anything about loanOffering.maximumAmount
        // no need to require anything about loanOffering.minimumAmount
        // no need to require anything about loanOffering.minimumHeldToken
        require(loanOffering.lenderFee == 0);
        // no need to require anything about loanOffering.takerFee
        // no need to require anything about loanOffering.expirationTimestamp
        // no need to require anything about loanOffering.salt

        /* CHECK VALUES32 */
        // no need to require anything about loanOffering.callTimeLimit
        // no need to require anything about loanOffering.maxDuration
        // no need to require anything about loanOffering.interestRate
        // no need to require anything about loanOffering.interestPeriod

        return address(this);
    }

    /**
     * Called by the Margin contract when anyone transfers ownership of a loan to this contract.
     * This function initializes this contract and returns this address to indicate to Margin
     * that it is willing to take ownership of the loan.
     *
     * @param  from        (unused)
     * @param  positionId  Unique ID of the position
     * @return             This address on success, throw otherwise
     */
    function receiveLoanOwnership(
        address from,
        bytes32 positionId
    )
        external
        onlyMargin
        onlyPosition(positionId)
        returns (address)
    {
        MarginCommon.Position memory position = MarginHelper.getPosition(DYDX_MARGIN, POSITION_ID);

        assert(position.principal > 0);
        assert(position.owedToken == OWED_TOKEN);
        assert(position.heldToken == HELD_TOKEN);

        // set relevant constants
        uint256 initialPrincipal = position.principal;
        principalForBkt[0] = initialPrincipal;
        principalTotal = initialPrincipal;
        weightForBkt[0] = weightForBkt[0].add(initialPrincipal);
        weightForBktForAct[0][from] = weightForBktForAct[0][from].add(initialPrincipal);

        return address(this);
    }

    /**
     * Called by Margin when additional value is added onto the position this contract
     * is lending for. Balance is added to the address that loaned the additional tokens.
     *
     * @param  payer           Address that loaned the additional tokens
     * @param  positionId      Unique ID of the position
     * @param  principalAdded  Amount that was added to the position
     *  param  lentAmount      (unused)
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
        onlyPosition(positionId)
        returns (address)
    {
        // Don't allow other lenders
        require(payer == address(this));

        // p2 is the principal after the add (p2 > p1)
        // p1 is the principal before the add
        uint256 principalAfterIncrease = getCurrentPrincipalFromMargin();
        uint256 principalBeforeIncrease = principalAfterIncrease.sub(principalAdded);

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
        onlyPosition(positionId)
        returns (address)
    {
        require(TRUSTED_MARGIN_CALLERS[caller]);
        require(depositAmount == 0);

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
        onlyPosition(positionId)
        returns (address)
    {
        require(TRUSTED_MARGIN_CALLERS[canceler]);

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
        onlyPosition(positionId)
        returns (address)
    {
        require(recipient == address(this));

        rebalanceBuckets();

        return address(this);
    }

    // ============ Public State-Changing Functions ============

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
        onlyWhileOpen
        returns (uint256)
    {
        rebalanceBuckets();

        TokenInteract.transferFrom(
            OWED_TOKEN,
            msg.sender,
            address(this),
            amount
        );

        uint256 bucket = getBucketNumber();

        uint256 effectiveAmount = availableForBkt[bucket].add(getBucketOwedAmount(bucket));

        uint256 weightToAdd = 0;
        if (effectiveAmount == 0) {
            weightToAdd = amount; // first deposit in bucket
        } else {
            weightToAdd = MathHelpers.getPartialAmount(
                amount,
                effectiveAmount,
                weightForBkt[bucket]
            );
        }

        accountForDeposit(bucket, beneficiary, weightToAdd);

        changeAvailable(bucket, amount, true);

        return bucket;
    }

    function deposit2(
        address beneficiary,
        uint256 amount
    )
        external
        onlyWhileOpen
        returns (uint256)
    {
        rebalanceBuckets();

        TokenInteract.transferFrom(
            OWED_TOKEN,
            msg.sender,
            address(this),
            amount
        );
    }

    function deposit3(
        address beneficiary,
        uint256 amount
    )
        external
        onlyWhileOpen
        returns (uint256)
    {
        rebalanceBuckets();

        TokenInteract.transferFrom(
            OWED_TOKEN,
            msg.sender,
            address(this),
            amount
        );

        uint256 bucket = getBucketNumber();

        uint256 effectiveAmount = availableForBkt[bucket].add(getBucketOwedAmount(bucket));

        uint256 weightToAdd = 0;
        if (effectiveAmount == 0) {
            weightToAdd = amount; // first deposit in bucket
        } else {
            weightToAdd = MathHelpers.getPartialAmount(
                amount,
                effectiveAmount,
                weightForBkt[bucket]
            );
        }
    }

    /**
     * Allow anyone to refresh the bucket amounts if part of the position was closed since the last
     * position increase. Favors earlier buckets.
     */
    function rebalanceBuckets()
        public
        onlyWhileOpen
    {
        uint256 marginPrincipal = getCurrentPrincipalFromMargin();

        accountForClose(principalTotal.sub(marginPrincipal));

        assert(principalTotal == marginPrincipal);
    }

    /**
     * Allows users to withdraw their lent funds.
     *
     * @param  buckets  The bucket numbers to withdraw from
     * @return          The number of owedTokens withdrawn
     */
    function withdraw(
        uint256[] buckets
    )
        external
        returns (uint256)
    {
        // running total amount of tokens to withdraw
        uint256 runningTotal = 0;

        if (!Margin(DYDX_MARGIN).isPositionClosed(POSITION_ID)) {
            rebalanceBuckets();
        }

        for (uint256 i = 0; i < buckets.length; i = i.add(1)) {
            uint256 bucket = buckets[i];

            // calculate the bucket's share
            uint256 effectiveAmount = availableForBkt[bucket].add(getBucketOwedAmount(bucket));

            // calculate the user's share
            uint256 bucketWeight = weightForBkt[bucket];
            uint256 userWeight = accountForWithdraw(bucket, msg.sender); // deletes the users share
            uint256 amountToWithdraw = MathHelpers.getPartialAmount(
                userWeight,
                bucketWeight,
                effectiveAmount
            );

            // check that there is enough token to give back
            require(amountToWithdraw <= availableForBkt[bucket]);

            // update amounts
            changeAvailable(bucket, amountToWithdraw, false);
            runningTotal = runningTotal.add(amountToWithdraw);
        }

        TokenInteract.transfer(OWED_TOKEN, msg.sender, runningTotal);

        return runningTotal;
    }

    /**
     * Allows lenders to withdraw heldToken in the event that the position was force-recovered.
     *
     * @param  buckets  The bucket numbers to withdraw from
     * @return          The number of heldTokens withdrawn
     */
    function withdrawHeldToken(
        uint256[] buckets
    )
        external
        returns(uint256)
    {
        // running total amount of tokens to withdraw
        uint256 runningUserPrincipal = 0;
        uint256 originalPrincipalTotal = principalTotal;

        for (uint256 i = 0; i < buckets.length; i = i.add(1)) {
            uint256 bucket = buckets[i];

            // calculate the user's share
            uint256 bucketWeight = weightForBkt[bucket];
            uint256 userWeight = accountForWithdraw(bucket, msg.sender); // deletes the users share

            // calculate the user's principal for the bucket
            uint256 userPrincipal =
                userWeight
                .mul(principalForBkt[bucket])
                .div(bucketWeight);

            // update amounts
            changePrincipal(bucket, userPrincipal, false);

            runningUserPrincipal = runningUserPrincipal.add(userPrincipal);
        }

        uint256 tokenAmount = MathHelpers.getPartialAmount(
            runningUserPrincipal,
            originalPrincipalTotal,
            TokenInteract.balanceOf(HELD_TOKEN, address(this))
        );

        TokenInteract.transfer(HELD_TOKEN, msg.sender, tokenAmount);

        return tokenAmount;
    }

    // ============ Helper Functions ============

    /**
     * Updates the state variables at any time. Only does anything after the position has been
     * closed or partially-closed since the last time this function was called.
     *
     * - Increases the available amount in the highest bucket with outstanding principal
     * - Decreases the principal amount in that bucket
     *
     * @param  principalRemoved  Amount of principal closed since the last update
     */
    function accountForClose(
        uint256 principalRemoved
    )
        internal
    {
        if (principalRemoved == 0) {
            return;
        }

        uint256 newRepaidAmount = Margin(DYDX_MARGIN).getTotalOwedTokenRepaidToLender(POSITION_ID);
        assert(newRepaidAmount.sub(cachedRepaidAmount) >= principalRemoved);

        // find highest bucket with outstanding principal
        uint256 bucket = getBucketNumber();
        while (principalForBkt[bucket] == 0) {
            bucket = bucket.sub(1);
        }

        // (available up / principal down) starting at the highest bucket
        uint256 p_total = principalRemoved;
        uint256 a_total = newRepaidAmount.sub(cachedRepaidAmount);
        while (p_total > 0) {
            uint256 p_i = Math.min256(p_total, principalForBkt[bucket]);
            if (p_i == 0) {
                continue;
            }
            uint256 a_i = MathHelpers.getPartialAmount(a_total, p_total, p_i);

            changeAvailable(bucket, a_i, true);
            changePrincipal(bucket, p_i, false);

            p_total = p_total.sub(p_i);
            a_total = a_total.sub(a_i);

            if (bucket == 0) {
                break;
            } else {
                bucket = bucket.sub(1);
            }
        }

        assert(p_total == 0);
        assert(a_total == 0);

        cachedRepaidAmount = newRepaidAmount;
    }

    /**
     * Updates the state variables when a position is increased.
     *
     * - Decreases the available amount in the lowest bucket with available token
     * - Increases the principal amount in that bucket
     *
     * @param  principalAdded  Amount of principal added to the position
     * @param  lentAmount      Amount of owedToken lent
     */
    function accountForIncrease(
        uint256 principalAdded,
        uint256 lentAmount
    )
        internal
    {
        uint256 p_total = principalAdded;
        uint256 a_total = lentAmount;

        for (uint256 bucket = 0; p_total > 0; bucket = bucket.add(1)) {
            uint256 a_i = Math.min256(a_total, availableForBkt[bucket]);
            if (a_i == 0) {
                continue;
            }
            uint256 p_i = MathHelpers.getPartialAmount(p_total, a_total, a_i);

            changeAvailable(bucket, a_i, false);
            changePrincipal(bucket, p_i, true);

            p_total = p_total.sub(p_i);
            a_total = a_total.sub(a_i);
        }

        assert(p_total == 0);
        assert(a_total == 0);
    }

    // ============ Setter Functions ============

    /**
     * Changes the available owedToken amount. This changes both the variable to track the total
     * amount as well as the variable to track a particular bucket.
     *
     * @param  bucket    The bucket number
     * @param  amount    The amount to change the available amount by
     * @param  increase  True if positive change, false if negative change
     */
    function changeAvailable(
        uint256 bucket,
        uint256 amount,
        bool increase
    )
        internal
    {
        require(amount > 0);
        if (increase) {
            availableTotal = availableTotal.add(amount);
            availableForBkt[bucket] = availableForBkt[bucket].add(amount);
        } else {
            availableTotal = availableTotal.sub(amount);
            availableForBkt[bucket] = availableForBkt[bucket].sub(amount);
        }
    }

    /**
     * Changes the principal amount. This changes both the variable to track the total
     * amount as well as the variable to track a particular bucket.
     *
     * @param  bucket    The bucket number
     * @param  amount    The amount to change the principal amount by
     * @param  increase  True if positive change, false if negative change
     */
    function changePrincipal(
        uint256 bucket,
        uint256 amount,
        bool increase
    )
        internal
    {
        require(amount > 0);
        if (increase) {
            principalTotal = principalTotal.add(amount);
            principalForBkt[bucket] = principalForBkt[bucket].add(amount);
        } else {
            principalTotal = principalTotal.sub(amount);
            principalForBkt[bucket] = principalForBkt[bucket].sub(amount);
        }
    }

    function accountForDeposit(
        uint256 bucket,
        address account,
        uint256 weightToAdd
    )
        internal
    {
        weightForBktForAct[bucket][account] = weightForBktForAct[bucket][account].add(weightToAdd);
        weightForBkt[bucket] = weightForBkt[bucket].add(weightToAdd);
    }

    function accountForWithdraw(
        uint256 bucket,
        address account
    )
        internal
        returns (uint256)
    {
        uint256 userWeight = weightForBktForAct[bucket][account];

        weightForBkt[bucket] = weightForBkt[bucket].sub(userWeight);
        delete weightForBktForAct[bucket][account];

        return userWeight;
    }

    // ============ Getter Functions ============

    /**
     * Get the current bucket number that funds will be deposited into. This is the highest bucket
     * so far.
     */
    function getBucketNumber()
        internal
        view
        returns (uint256)
    {
        uint256 marginTimestamp = Margin(DYDX_MARGIN).getPositionStartTimestamp(POSITION_ID);

        // position not created, allow deposits in the first bucket
        if (marginTimestamp == 0) {
            return 0;
        }

        return block.timestamp.sub(marginTimestamp).div(BUCKET_TIME);
    }

    /**
     * Gets the outstanding amount of owedToken owed to a bucket. This is the principal amount of
     * the bucket multiplied by the interest accrued in the position.
     */
    function getBucketOwedAmount(
        uint256 bucket
    )
        internal
        view
        returns (uint256)
    {
        uint256 lentPrincipal = principalForBkt[bucket];

        if (lentPrincipal == 0) {
            return 0;
        }

        return Margin(DYDX_MARGIN).getPositionOwedAmountAtTime(
            POSITION_ID,
            lentPrincipal,
            uint32(block.timestamp)
        );
    }

    /**
     * Gets the principal amount of the position from the Margin contract
     */
    function getCurrentPrincipalFromMargin()
        internal
        view
        returns (uint256)
    {
        return Margin(DYDX_MARGIN).getPositionPrincipal(POSITION_ID);
    }
}
