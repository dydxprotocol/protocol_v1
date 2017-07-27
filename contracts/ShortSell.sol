pragma solidity ^0.4.13;

import './external/Exchange.sol';
import './interfaces/ERC20.sol';
import './Proxy.sol';
import './lib/ownable';
import './Vault.sol';
import './ShortSellRepo.sol';

contract ShortSell is Ownable {
  address public ZRX_TOKEN_CONTRACT;
  uint8 public constant REPO_VERSION = 1;

  // -----------------------
  // ------- Structs -------
  // -----------------------

  struct Short {
    address underlyingToken;
    address baseToken;
    uint256 interestRate;
    address lender;
    address seller;
  }

  struct LoanOffering {
    address lender;
    address underlyingToken;
    address baseToken;
    address feeRecipient;
    uint minimumDeposit;
    uint maxAmount;
    uint minAmount;
    uint interestRate;
    uint lenderFee;
    uint takerFee;
    uint expirationTimestamp;
    uint lockoutTimestamp;
    uint callTimeLimit;
    uint salt;
    bytes32 loanHash;
  }

  struct LoanAmount {
    bool seen;
    uint remaining;
  }

  // ---------------------------
  // ----- State Variables -----
  // ---------------------------

  // Address of the 0x Exchange Contract
  // TODO how to change
  address public exchange;

  // Address of the 0x Proxy Contract
  // TODO how to change
  address public exchangeProxy;

  // Address of the Vault contract
  address public vault;

  address public repo;

  mapping(address => bool) private authorizedTokens;
  mapping(address => Short) public shorts;

  mapping(bytes32 => LoanAmount) public loanAmounts;
  mapping(bytes32 => uint) public loanNumbers;

  function ShortSell(
    address _owner,
    address _exchange,
    address _vault,
    address _exchangeProxy,
    address _ZRX_TOKEN_CONTRACT,
    address _repo
  ) Ownable(_owner) {
    exchange = _exchange;
    vault = _vault;
    exchangeProxy = _exchangeProxy;
    ZRX_TOKEN_CONTRACT = _ZRX_TOKEN_CONTRACT;
    repo = _repo;
  }

  // TODO: lender, taker fees on loan offer
  function short(
    address underlyingToken,
    address baseToken,
    address[5] addresses,
    uint[16] values,
    uint shortAmount,
    uint depositAmount,
    uint8[2] sigV,
    bytes32[4] sigRS
  ) public {
    LoanOffering memory loanOffering = getLoanOffering(
      underlyingToken,
      baseToken,
      addresses,
      values
    );

    bytes32 shortId = sha3(
      loanOffering.loanHash,
      loanNumbers[loanOffering.lender]
    );

    require(!ShortSellRepo(repo).containsShort(shortId));

    require(
      isValidSignature(
        loanOffering.lender,
        loanOffering.loanHash,
        sigV[0],
        sigRS[1],
        sigRS[2]
      )
    );

    uint maxLoanAmount;

    if (loanAmounts[loanHash].seen) {
      maxLoanAmount = loanAmounts[loanHash].remaining;
    } else {
      maxLoanAmount = loanOffering.maxAmount;
    }
    require(shortAmount <= maxLoanAmount);
    require(shortAmount >= loanOffering.minAmount);

    uint minimumDeposit = getPartialAmount(
      shortAmount,
      loanOffering.maxAmount,
      loanOffering.minimumDeposit);

    require(depositAmount >= minimumDeposit);
    require(loanOffering.expirationTimestamp > block.timestamp);

    loanAmounts[loanHash].remaining = maxLoanAmount - shortAmount;
    loanNumbers[loanOffering.lender] = loanNumbers[loanOffering.lender] + 1;

    Vault(vault).transfer(shortId, baseToken, msg.sender, depositAmount);
    Vault(vault).transfer(shortId, underlyingToken, loanOffering.lender, shortAmount);

    if (values[13] > 0) {
      Vault(vault).transfer(shortId, ZRX_TOKEN_CONTRACT, msg.sender, buyOrderTakerFee);
    }

    uint (underlyingTokenTraded, baseTokenReceived) = Vault(vault).trade(
      shortId,
      [
        addresses[2], // maker
        addresses[3], // taker
        baseToken, // makerToken
        underlyingToken, // takerToken
        addresses[4] // feeRecipient
      ],
      [
        values[10], // makerTokenAmount
        values[11], // takerTokenAmount
        values[12], // makerFee
        values[13], // takerFee
        values[14], // expirationTimestampInSec
        values[15], // salt
      ],
      shortAmount,
      sigV[1],
      sigRS[2],
      sigRS[3],
      true
    );

    require(Vault(vault).balances[shortId][baseToken] == baseTokenReceived + depositAmount);
    require(Vault(vault).balances[shortId][underlyingToken] == 0);

    if (Vault(vault).balances[shortId][ZRX_TOKEN_CONTRACT] > 0) {
      Vault(vault).send(
        shortId,
        ZRX_TOKEN_CONTRACT,
        msg.sender,
        Vault(vault).balances[shortId][ZRX_TOKEN_CONTRACT]
      );
    }

    ShortSellRepo(repo).setShort(
      shortId,
      underlyingToken,
      baseToken,
      loanOffering.interestRate,
      loanOffering.callTimeLimit,
      loanOffering.lockoutTimestamp,
      loanOffering.lender,
      msg.sender,
      REPO_VERSION
    );
  }

  function isValidSignature(
    address signer,
    bytes32 hash,
    uint8 v,
    bytes32 r,
    bytes32 s)
    constant
    returns (
      bool _isValid
    ) {
    return signer == ecrecover(
      sha3("\x19Ethereum Signed Message:\n32", hash),
      v,
      r,
      s
    );
  }

  function getLoanOfferingHash(
    address underlyingToken,
    address baseToken,
    address[5] addresses,
    uint[14] values
  )
    constant
    returns(bytes32 _hash) {

    return sha3(
      address(this),
      underlyingToken,
      baseToken,
      addresses[0],
      addresses[1],
      values[0],
      values[1],
      values[2],
      values[3],
      values[4],
      values[5],
      values[6],
      values[7],
      values[8],
      values[9]
    );
  }

  function getPartialAmount(
    uint numerator,
    uint denominator,
    uint target
  ) constant public returns (uint partialValue) {
    // NOTE this needs to be the same as used by 0x
    return Exchange(exchange).getPartialAmount(numerator, denominator, target);
  }

  function getLoanOffering(
    address underlyingToken,
    address baseToken,
    address[5] addresses,
    uint[16] values
  ) internal constant returns(LoanOffering) {
    LoanOffering memory loanOffering = LoanOffering({
      underlyingToken: underlyingToken,
      baseToken: baseToken,
      lender: addresses[0],
      feeRecipient: addresses[1],
      minimumDeposit: values[0],
      maxAmount: values[1],
      minAmount: values[2],
      interestRate: values[3],
      lenderFee: values[4],
      takerFee: values[5],
      expirationTimestamp: values[6],
      lockoutTimestamp: values[7],
      callTimeLimit: values[8],
      salt: values[9],
      loanHash: getLoanOfferingHash(
        underlyingToken,
        baseToken,
        addresses,
        values
      )
    });

    return loanOffering;
  }
}
