pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import "./ERC20Interface.sol";
import "./KyberReserveInterface.sol";
import "./Withdrawable.sol";
import "./Utils.sol";
import "./PermissionGroups.sol";
import "./WhiteListInterface.sol";
import "./ExpectedRateInterface.sol";
import "./FeeBurnerInterface.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";

////////////////////////////////////////////////////////////////////////////////////////////////////////
/// @title Kyber Network main contract
contract KyberNetwork is Withdrawable, Utils {
  /**
   *
   */
    using SafeMath for uint;

    uint256 public CONRATE_TO_ETH;
    uint256 public CONRATE_FROM_ETH;
    address public ETH_TOKEN_ADDRESS = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;
    address public TRADED_TOKEN;
    constructor(address _admin, address traded_token, uint256 conrate_to_eth, uint256 conrate_from_eth) public {
        require(_admin != address(0) && traded_token != address(0));
        admin = _admin;
        TRADED_TOKEN = traded_token;
        CONRATE_TO_ETH = conrate_to_eth;
        CONRATE_FROM_ETH = conrate_from_eth;
    }

    event EtherReceival(address indexed sender, uint amount);

    /* solhint-disable no-complex-fallback */
    function() external payable {

      //  emit EtherReceival(msg.sender, msg.value);
    }
    /* solhint-enable no-complex-fallback */

    event ExecuteTrade(address indexed sender, ERC20 src, ERC20 dest, uint actualSrcAmount, uint actualDestAmount);

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev makes a trade between src and dest token and send dest token to destAddress
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @param dest   Destination token
    /// @param destAddress Address to send tokens to
    /// @param maxDestAmount A limit on the amount of dest tokens
    /// @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    /// @param walletId is the wallet ID to send part of the fees
    /// @return amount of actual dest tokens
    function trade(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId
    )
        public
        payable
        returns(uint)
    {

        /* uint userSrcBalanceBefore;
        uint userSrcBalanceAfter;
        uint userDestBalanceBefore;
        uint userDestBalanceAfter;

        userSrcBalanceBefore = getBalance(src, msg.sender);
        if (src == ETH_TOKEN_ADDRESS)
            userSrcBalanceBefore += msg.value;
        userDestBalanceBefore = getBalance(dest, destAddress); */

        uint actualDestAmount = doTrade(src,
                                        srcAmount,
                                        dest,
                                        destAddress,
                                        maxDestAmount,
                                        minConversionRate,
                                        walletId
                                        );
        /* require(actualDestAmount > 0);

        userSrcBalanceAfter = getBalance(src, msg.sender);
        userDestBalanceAfter = getBalance(dest, destAddress);

        require(userSrcBalanceAfter <= userSrcBalanceBefore);
        require(userDestBalanceAfter >= userDestBalanceBefore);

        require((userDestBalanceAfter - userDestBalanceBefore) >=
            calcDstQty((userSrcBalanceBefore - userSrcBalanceAfter), getDecimals(src), getDecimals(dest),
                minConversionRate)); */

        return actualDestAmount;
    }

    /// @dev get the balance of a user.
    /// @param token The token type
    /// @return The balance
    function getBalance(ERC20 token, address user) public view returns(uint) {
        if (token == ETH_TOKEN_ADDRESS)
            return user.balance;
        else
            return token.balanceOf(user);
    }


    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty)
        public view
        returns (uint expectedRate, uint slippageRate)
    {
      /**
       * it will return both values
       */
        if (address(src) == ETH_TOKEN_ADDRESS) {
          return (CONRATE_FROM_ETH,CONRATE_FROM_ETH);
        } else {
          return (CONRATE_TO_ETH,CONRATE_TO_ETH);
        }
    }


    function doTrade(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId
    )
        internal
        returns(uint)
        {
            uint conversionRate;
            uint receivedMakerAmount;
            if (src == ETH_TOKEN_ADDRESS) {
              conversionRate = CONRATE_FROM_ETH;
              //check if the amount sent is the srcAmount specified
              require( msg.value >= srcAmount );
              //multiply the srcAmount by the conversionRate to get makerToken to send
              receivedMakerAmount = srcAmount.mul(conversionRate);
              //transfer that amount back to the user
              TokenInteract.transfer(dest, destAddress, receivedMakerAmount);
              return receivedMakerAmount;
            } else if (dest == ETH_TOKEN_ADDRESS) {
                conversionRate = CONRATE_TO_ETH;
                // check if the contract received the required token
                require(TokenInteract.balanceOf(src, address(this)) >= srcAmount);
                // calculate the conversionRate
                receivedMakerAmount = srcAmount.mul(conversionRate);
                // transfer the eth amount back to the user
                destAddress.transfer(receivedMakerAmount);
            }
            return receivedMakerAmount;
          }
    function calcDestAmount(ERC20 src, ERC20 dest, uint srcAmount, uint rate) internal view returns(uint) {
        return calcDstQty(srcAmount, getDecimals(src), getDecimals(dest), rate);
    }

    function calcSrcAmount(ERC20 src, ERC20 dest, uint destAmount, uint rate) internal view returns(uint) {
        return calcSrcQty(destAmount, getDecimals(src), getDecimals(dest), rate);
    }

    /// @notice use token address ETH_TOKEN_ADDRESS for ether
    /// @dev checks that user sent ether/tokens to contract before trade
    /// @param src Src token
    /// @param srcAmount amount of src tokens
    /// @return true if input is valid
    function validateTradeInput(ERC20 src, uint srcAmount, address destAddress) internal view returns(bool) {
        if ((srcAmount >= MAX_QTY) || (srcAmount == 0) || (destAddress == 0))
            return false;

        if (src == ETH_TOKEN_ADDRESS) {
            if (msg.value != srcAmount)
                return false;
        } else {
            if ((msg.value != 0) || (src.allowance(msg.sender, this) < srcAmount))
                return false;
        }

        return true;
    }
}
