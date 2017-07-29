pragma solidity ^0.4.13;

import './lib/Ownable.sol';
import './CoveredOption.sol';
import './Proxy.sol';

/**
 * @title DerivativeCreator
 * @author Antonio Juliano
 *
 * DerivativeCreator creates and maps derivatives corresponding to the dYdX protocol standards.
 * Current derivatives include:
 *    - Covered Option
 */
contract DerivativeCreator is Ownable {
    // -----------------------
    // ------ Constants ------
    // -----------------------

    uint8 constant COVERED_OPTION_TYPE = 0;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Address of the dYdX Proxy Contract
    address public proxy;

    // Address of the 0x Exchange Contract
    address public exchange;

    // Address of the 0x Exchange Proxy Contract
    address public exchangeProxy;

    // Mapping storing all child derivatives in existence
    mapping(bytes32 => address) childDerivatives;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function DerivativeCreator(
        address _owner,
        address _proxy,
        address _exchange,
        address _exchangeProxy
    ) Ownable(_owner) {
        proxy = _proxy;
        exchange = _exchange;
        exchangeProxy = _exchangeProxy;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    /**
     * Create a new type of covered option
     * Will create a new CoveredOption smart contract and return its address
     *
     * @param  underlyingToken            The address of the underlying token used in the option
     * @param  baseToken                  The address of the base token used in the option
     * @param  expirationTimestamp        A timestamp indicating the expiration date of the option
     * @param  underlyingTokenStrikeRate  The underlyingToken half of the exchange rate for
     *                                    the strike price of the option. Exchange rate
     *                                    must be specified in simplest form
     * @param  baseTokenStrikeRate        The baseToken half of the exchange rate for
     *                                    the strike price of the option. Exchange rate
     *                                    must be specified in simplest form
     * @return _option                    The address of the new option contract
     */
    function createCoveredOption(
        address underlyingToken,
        address baseToken,
        uint256 expirationTimestamp,
        uint256 underlyingTokenStrikeRate,
        uint256 baseTokenStrikeRate
    ) public returns(
        address _option
    ) {
        // Require exchange rates for options to be in simplest form
        if (underlyingTokenStrikeRate > baseTokenStrikeRate) {
            require(
                underlyingTokenStrikeRate == 1
                || baseTokenStrikeRate == 1
                || underlyingTokenStrikeRate % baseTokenStrikeRate != 0
            );
        } else {
            require(
                underlyingTokenStrikeRate == 1
                || baseTokenStrikeRate == 1
                || baseTokenStrikeRate % underlyingTokenStrikeRate != 0
            );
        }

        bytes32 optionHash = sha3(
            COVERED_OPTION_TYPE,
            underlyingToken,
            baseToken,
            expirationTimestamp,
            underlyingTokenStrikeRate,
            baseTokenStrikeRate
        );

        require(childDerivatives[optionHash] == address(0));

        address option = new CoveredOption(
            underlyingToken,
            baseToken,
            expirationTimestamp,
            underlyingTokenStrikeRate,
            baseTokenStrikeRate,
            exchange,
            exchangeProxy,
            proxy
        );

        childDerivatives[optionHash] = option;

        Proxy(proxy).authorize(option);

        return option;
    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    /**
     * Get the address of a covered option contract. Will return the 0 address if none exists
     *
     * @param  underlyingToken            The address of the underlying token used in the option
     * @param  baseToken                  The address of the base token used in the option
     * @param  expirationTimestamp        A timestamp indicating the expiration date of the option
     * @param  underlyingTokenStrikeRate  The underlyingToken half of the exchange rate for
     *                                    the strike price of the option. Exchange rate
     *                                    must be specified in simplest form
     * @param  baseTokenStrikeRate        The baseToken half of the exchange rate for
     *                                    the strike price of the option. Exchange rate
     *                                    must be specified in simplest form
     * @return _option                    The address of the option contract
     */
    function getCoveredOption(
        address underlyingToken,
        address baseToken,
        uint256 expirationTimestamp,
        uint256 underlyingTokenStrikeRate,
        uint256 baseTokenStrikeRate
    ) constant public returns(
        address _option
    ) {
        bytes32 optionHash = sha3(
            COVERED_OPTION_TYPE,
            underlyingToken,
            baseToken,
            expirationTimestamp,
            underlyingTokenStrikeRate,
            baseTokenStrikeRate
        );

        return childDerivatives[optionHash];
    }

    // --------------------------------
    // ----- Owner Only Functions -----
    // --------------------------------

    function updateExchange(
        address _exchange
    ) onlyOwner {
        exchange = _exchange;
    }

    function updateExchangeProxy(
        address _exchangeProxy
    ) onlyOwner {
        exchangeProxy = _exchangeProxy;
    }

    function updateProxy(
        address _proxy
    ) onlyOwner {
        proxy = _proxy;
    }
}
