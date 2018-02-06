pragma solidity 0.4.19;


library ShortSellState {
    // TODO public
    struct State {
        // Address of the Vault contract
        address VAULT;

        // Address of the Trader contract
        address TRADER;

        // Address of the ShortSellRepo contract
        address REPO;

        // Address of the ShortSellAuctionRepo contract
        address AUCTION_REPO;

        // Address of the Proxy contract
        address PROXY;

        // Mapping from loanHash -> amount, which stores the amount of a loan which has
        // already been filled
        mapping(bytes32 => uint) loanFills;

        // Mapping from loanHash -> amount, which stores the amount of a loan which has
        // already been canceled
        mapping(bytes32 => uint) loanCancels;

        // Mapping from loanHash -> number, which stores the number of shorts taken out
        // for a given loan
        mapping(bytes32 => uint) loanNumbers;

        // Flag used to guard against reentrancy. If set to true, no non-reentrant will
        // be able to be called
        bool reentrancyGuard;
    }
}
