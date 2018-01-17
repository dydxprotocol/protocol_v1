pragma solidity 0.4.18;


/**
 * @title ShortSellState
 * @author Antonio Juliano
 *
 * This contract contains the state for the ShortSell contract
 */
contract ShortSellState {
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Address of the Vault contract
    address public VAULT;

    // Address of the Trader contract
    address public TRADER;

    // Address of the ShortSellRepo contract
    address public REPO;

    // Address of the ShortSellAuctionRepo contract
    address public AUCTION_REPO;

    // Address of the Proxy contract
    address public PROXY;

    // Mapping from loanHash -> amount, which stores the amount of a loan which has
    // already been filled
    mapping(bytes32 => uint) public loanFills;

    // Mapping from loanHash -> amount, which stores the amount of a loan which has
    // already been canceled
    mapping(bytes32 => uint) public loanCancels;

    // Mapping from loanHash -> number, which stores the number of shorts taken out
    // for a given loan
    mapping(bytes32 => uint) public loanNumbers;
}
