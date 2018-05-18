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

pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { StandardToken } from "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import { Margin } from "../../Margin.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { StringHelpers } from "../../../lib/StringHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { MarginCommon } from "../../impl/MarginCommon.sol";
import { ClosePositionDelegator } from "../../interfaces/ClosePositionDelegator.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";
import { PositionCustodian } from "../interfaces/PositionCustodian.sol";
import { MarginHelper } from "../lib/MarginHelper.sol";


/**
 * @title ERC20Position
 * @author dYdX
 *
 * Shared code for ERC20Short and ERC20Long
 */
contract ERC20Position is
    ReentrancyGuard,
    StandardToken,
    OnlyMargin,
    ClosePositionDelegator,
    PositionCustodian
{
    using SafeMath for uint256;

    // ============ Enums ============

    enum State {
        UNINITIALIZED,
        OPEN,
        CLOSED
    }

    // ============ Events ============

    /**
     * This ERC20Short was successfully initialized
     */
    event Initialized(
        bytes32 positionId,
        uint256 initialSupply
    );

    /**
     * The short was completely closed by a trusted third-party and tokens can be withdrawn
     */
    event ClosedByTrustedParty(
        address closer,
        address payoutRecipient
    );

    /**
     * The short was completely closed and tokens can be withdrawn
     */
    event CompletelyClosed();

    /**
     * A user burned tokens to withdraw heldTokens from this contract after the short was closed
     */
    event TokensRedeemedAfterForceClose(
        address indexed redeemer,
        uint256 tokensRedeemed,
        uint256 heldTokenPayout
    );

    /**
     * A user burned tokens in order to partially close the short
     */
    event TokensRedeemedForClose(
        address indexed redeemer,
        uint256 closeAmount
    );

    // ============ State Variables ============

    // All tokens will initially be allocated to this address
    address public INITIAL_TOKEN_HOLDER;

    // Unique ID of the position this contract is tokenizing
    bytes32 public POSITION_ID;

    // Recipients that will fairly verify and redistribute funds from closing the position
    mapping (address => bool) public TRUSTED_RECIPIENTS;

    // Current State of this contract. See State enum
    State public state;

    // Address of the short's heldToken. Cached for convenience and lower-cost withdrawals
    address public heldToken;

    // Symbol to be ERC20 compliant with frontends
    string public symbol;

    // ============ Constructor ============

    constructor(
        bytes32 positionId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients,
        string _symbol
    )
        public
        OnlyMargin(margin)
    {
        POSITION_ID = positionId;
        state = State.UNINITIALIZED;
        INITIAL_TOKEN_HOLDER = initialTokenHolder;
        symbol = _symbol;

        for (uint256 i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS[trustedRecipients[i]] = true;
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Called by Margin when anyone transfers ownership of a position to this contract.
     * This function initializes the tokenization of the position given and returns this address to
     * indicate to Margin that it is willing to take ownership of the position.
     *
     *  param  (unused)
     * @param  positionId  Unique ID of the position
     * @return             This address on success, throw otherwise
     */
    function receivePositionOwnership(
        address /* from */,
        bytes32 positionId
    )
        external
        onlyMargin
        nonReentrant
        returns (address)
    {
        // require uninitialized so that this cannot receive ownership for more than one position
        require(
            state == State.UNINITIALIZED,
            "ERC20Position#receivePositionOwnership: Already initialized"
        );
        require(
            POSITION_ID == positionId,
            "ERC20Position#receivePositionOwnership: Incorrect position"
        );

        MarginCommon.Position memory position = MarginHelper.getPosition(DYDX_MARGIN, POSITION_ID);
        assert(position.principal > 0);

        // set relevant constants
        state = State.OPEN;

        uint256 tokenAmount = getTokenAmountOnAdd(
            positionId,
            position.principal
        );

        totalSupply_ = tokenAmount;
        balances[INITIAL_TOKEN_HOLDER] = tokenAmount;
        heldToken = position.heldToken;

        // Record event
        emit Initialized(POSITION_ID, tokenAmount);

        // ERC20 Standard requires Transfer event from 0x0 when tokens are minted
        emit Transfer(address(0), INITIAL_TOKEN_HOLDER, tokenAmount);

        return address(this); // returning own address retains ownership of position
    }

    /**
     * Called by Margin when additional value is added onto the position this contract
     * owns. Tokens are minted and assigned to the address that added the value.
     *
     * @param  trader            Address that added the value to the position
     * @param  positionId      Unique ID of the position
     * @param  principalAdded  Amount that was added to the position
     * @return                 True to indicate that this contract consents to value being added
     */
    function marginPositionIncreased(
        address trader,
        bytes32 positionId,
        uint256 principalAdded
    )
        external
        onlyMargin
        nonReentrant
        returns (bool)
    {
        assert(positionId == POSITION_ID);

        uint256 tokenAmount = getTokenAmountOnAdd(
            positionId,
            principalAdded
        );

        balances[trader] = balances[trader].add(tokenAmount);
        totalSupply_ = totalSupply_.add(tokenAmount);

        // ERC20 Standard requires Transfer event from 0x0 when tokens are minted
        emit Transfer(address(0), trader, tokenAmount);

        return true;
    }

    /**
     * Called by Margin when an owner of this token is attempting to close some of the
     * position. Implementation is required per PositionOwner contract in order to be used by
     * Margin to approve closing parts of a position. If true is returned, this contract
     * must assume that Margin will either revert the entire transaction or that the specified
     * amount of the position was successfully closed.
     *
     * @param  closer           Address of the caller of the close function
     * @param  payoutRecipient  Address of the recipient of tokens paid out from closing
     * @param  positionId       Unique ID of the position
     * @param  requestedAmount  Amount (in principal) of the position being closed
     * @return                  The amount the user is allowed to close for the specified position
     */
    function closeOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 positionId,
        uint256 requestedAmount
    )
        external
        onlyMargin
        nonReentrant
        returns (uint256)
    {
        assert(state == State.OPEN);
        assert(POSITION_ID == positionId);

        uint256 positionPrincipal = Margin(DYDX_MARGIN).getPositionPrincipal(positionId);

        assert(requestedAmount <= positionPrincipal);

        if (positionPrincipal == requestedAmount && TRUSTED_RECIPIENTS[payoutRecipient]) {
            return closeByTrustedParty(
                closer,
                payoutRecipient,
                requestedAmount
            );
        }

        return close(
            closer,
            requestedAmount,
            positionPrincipal
        );
    }

    // ============ Public State Changing Functions ============

    /**
     * Helper to allow withdrawal for multiple owners in one call
     *
     * @param  who  Array of addresses to withdraw for
     */
    function withdrawMultiple(
        address[] who
    )
        external
        nonReentrant
    {
        setStateClosedIfClosed();
        require(
            state == State.CLOSED,
            "ERC20Position#withdrawMultiple: Position has not yet been closed"
        );

        for (uint256 i = 0; i < who.length; i++) {
            withdrawImpl(who[i]);
        }
    }

    /**
     * Withdraw heldTokens from this contract for any of the position that was closed via external
     * means (such as an auction-closing mechanism)
     *
     * NOTE: It is possible that this contract could be sent heldToken by external sources
     * other than from the Margin contract. In this case the payout for token holders
     * would be greater than just that from the normal payout. This is fine because
     * nobody has incentive to send this contract extra funds, and if they do then it's
     * also fine just to let the token holders have it.
     *
     * NOTE: If there are significant rounding errors, then it is possible that withdrawing later is
     * more advantageous. An "attack" could involve withdrawing for others before withdrawing for
     * yourself. Likely, rounding error will be small enough to not properly incentivize people to
     * carry out such an attack.
     *
     * @param  who  Address of the account to withdraw for
     * @return      The amount of heldToken withdrawn
     */
    function withdraw(
        address who
    )
        external
        nonReentrant
        returns (uint256)
    {
        setStateClosedIfClosed();
        require(
            state == State.CLOSED,
            "ERC20Position#withdraw: Position has not yet been closed"
        );

        return withdrawImpl(who);
    }

    // ============ Public Constant Functions ============

    /**
     * ERC20 decimals function. Returns the same number of decimals as the shorts's owedToken
     *
     * @return  The number of decimal places, or revert if the baseToken has no such function.
     */
    function decimals()
        external
        view
        returns (uint8);

    /**
     * ERC20 name function. Returns a name based off positionId.
     *
     * NOTE: This is not a gas-efficient function and is not intended to be used on-chain
     *
     * @return  The name of the token which includes the hexadecimal positionId
     */
    function name()
        external
        view
        returns (string)
    {
        if (state == State.UNINITIALIZED) {
            return string(StringHelpers.strcat(getNameIntro(), " [UNINITIALIZED]"));
        }

        return string(
            StringHelpers.strcat(
                StringHelpers.strcat(
                    getNameIntro(),
                    " 0x"
                ),
                StringHelpers.bytes32ToHex(POSITION_ID)
            )
        );
    }

    /**
     * Implements PositionCustodian functionality. Called by external contracts to see where to pay
     * tokens as a result of closing a position on behalf of this contract
     *
     * @param  positionId  Unique ID of the position
     * @return             Address of this contract. Indicates funds should be sent to this contract
     */
    function getPositionDeedHolder(
        bytes32 positionId
    )
        external
        view
        returns (address)
    {
        require(
            positionId == POSITION_ID,
            "ERC20Position#getPositionDeedHolder: Invalid position ID"
        );
        // Claim ownership of deed and allow token holders to withdraw funds from this contract
        return address(this);
    }

    // ============ Internal Functions ============

    function withdrawImpl(
        address who
    )
        internal
        returns (uint256)
    {
        uint256 value = balanceOf(who);

        if (value == 0) {
            return 0;
        }

        uint256 heldTokenBalance = TokenInteract.balanceOf(heldToken, address(this));

        // NOTE the payout must be calculated before decrementing the totalSupply below
        uint256 heldTokenPayout = MathHelpers.getPartialAmount(
            value,
            totalSupply_,
            heldTokenBalance
        );

        // Destroy the tokens
        delete balances[who];
        totalSupply_ = totalSupply_.sub(value);

        // Send the redeemer their proportion of heldToken
        TokenInteract.transfer(heldToken, who, heldTokenPayout);

        emit TokensRedeemedAfterForceClose(who, value, heldTokenPayout);

        return heldTokenPayout;
    }

    function setStateClosedIfClosed(
    )
        internal
    {
        // If in OPEN state, but the position is closed, set to CLOSED state
        if (state == State.OPEN && Margin(DYDX_MARGIN).isPositionClosed(POSITION_ID)) {
            state = State.CLOSED;
            emit CompletelyClosed();
        }
    }

    /**
     * Tokens are not burned when a trusted recipient is used, but we require the position to be
     * completely closed. All token holders are then entitled to the heldTokens in the contract
     */
    function closeByTrustedParty(
        address closer,
        address payoutRecipient,
        uint256 requestedAmount
    )
        internal
        returns (uint256)
    {
        emit ClosedByTrustedParty(closer, payoutRecipient);
        state = State.CLOSED;
        emit CompletelyClosed();

        return requestedAmount;
    }

    function close(
        address closer,
        uint256 requestedAmount,
        uint256 positionPrincipal
    )
        internal
        returns (uint256)
    {
        uint256 balance = balances[closer];
        uint256 tokenAmount;
        uint256 allowedCloseAmount;

        (tokenAmount, allowedCloseAmount) = getCloseAmounts(
            requestedAmount,
            balance,
            positionPrincipal
        );

        require(
            tokenAmount > 0 && allowedCloseAmount > 0,
            "ERC20Position#close: Cannot close 0 amount"
        );

        assert(tokenAmount <= balance);
        assert(allowedCloseAmount <= requestedAmount);

        balances[closer] = balance.sub(tokenAmount);
        totalSupply_ = totalSupply_.sub(tokenAmount);

        emit TokensRedeemedForClose(closer, tokenAmount);

        if (totalSupply_ == 0) {
            state = State.CLOSED;
            emit CompletelyClosed();
        }

        return allowedCloseAmount;
    }

    // ============ Internal Abstract Functions ============

    function getTokenAmountOnAdd(
        bytes32 positionId,
        uint256 principalAdded
    )
        internal
        view
        returns (uint256);

    function getCloseAmounts(
        uint256 requestedCloseAmount,
        uint256 balance,
        uint256 positionPrincipal
    )
        internal
        view
        returns (
            uint256 /* tokenAmount */,
            uint256 /* allowedCloseAmount */
        );

    function getNameIntro()
        internal
        pure
        returns (bytes);
}
