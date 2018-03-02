/*global artifacts, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');
const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require('TokenA');
const ProxyContract = artifacts.require('Proxy');
const { expectAssertFailure, expectThrow } = require('../helpers/ExpectHelper');
const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  callCancelLoanOffer,
  doShort,
  doShortAndCall,
  placeAuctionBid,
  createSigned0xSellOrder,
  issueTokensAndSetAllowancesForClose,
  callCloseShort,
  issueForDirectClose,
  callApproveLoanOffering
} = require('../helpers/ShortSellHelper');

const OperationState = {
  OPERATIONAL: 0,
  CLOSE_AND_CANCEL_LOAN_ONLY: 1,
  CLOSE_ONLY: 2,
  AUCTION_CLOSE_ONLY: 3,
  SHORT_SELLER_CLOSE_ONLY: 4,
  SHORT_SELLER_CLOSE_DIRECTLY_ONLY: 5,
  SHORT_SELLER_CLOSE_0X_ONLY: 6
};

describe('Constructor', () => {
  contract('ShortSell', accounts => {
    it('Sets OperationState to OPERATIONAL', async () => {
      const shortSell = await ShortSell.deployed();

      const [
        operationState,
        owner
      ] = await Promise.all([
        shortSell.operationState.call(),
        shortSell.owner.call()
      ]);

      expect(operationState.toNumber()).to.eq(OperationState.OPERATIONAL);
      expect(owner.toLowerCase()).to.eq(accounts[0].toLowerCase());
    })
  });
});

describe('#setOperationState', () => {
  contract('ShortSell', () => {
    it('Sets OperationState correctly', async () => {
      const shortSell = await ShortSell.deployed();

      await shortSell.setOperationState(OperationState.CLOSE_ONLY);
      await expectOperationState(shortSell, OperationState.CLOSE_ONLY);
    });
  });

  contract('ShortSell', () => {
    it('Does not allow invalid OperationStates', async () => {
      const shortSell = await ShortSell.deployed();

      await expectAssertFailure(() => shortSell.setOperationState(7));
      await expectOperationState(shortSell, OperationState.OPERATIONAL);
    });
  });

  contract('ShortSell', accounts => {
    it('Only allows owner to set', async () => {
      const shortSell = await ShortSell.deployed();

      await expectThrow(
        () => shortSell.setOperationState(OperationState.CLOSE_ONLY, { from: accounts[2] })
      );
      await expectOperationState(shortSell, OperationState.OPERATIONAL);
    });
  });

  contract('ShortSell', () => {
    it('Does nothing on set to same state', async () => {
      const shortSell = await ShortSell.deployed();

      await shortSell.setOperationState(OperationState.OPERATIONAL);
      await expectOperationState(shortSell, OperationState.OPERATIONAL);
    });
  });
});

describe('#onlyWhileOperational', () => {
  contract('ShortSell', accounts => {
    it('Only allows #short while OPERATIONAL', async () => {
      const shortTx = await createShortSellTx(accounts);
      const shortSell = await ShortSell.deployed();

      await issueTokensAndSetAllowancesForShort(shortTx);

      await shortSell.setOperationState(OperationState.CLOSE_ONLY);
      await expectThrow(() => callShort(shortSell, shortTx));

      await shortSell.setOperationState(OperationState.OPERATIONAL);
      await callShort(shortSell, shortTx);
    });
  });

  contract('ShortSell', accounts => {
    it('Only allows #cancelLoanCall while OPERATIONAL', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await shortSell.callInLoan(
        shortTx.id,
        new BigNumber(10),
        { from: shortTx.loanOffering.lender }
      );

      await shortSell.setOperationState(OperationState.SHORT_SELLER_CLOSE_0X_ONLY);
      await expectThrow(() => shortSell.cancelLoanCall(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      ));

      await shortSell.setOperationState(OperationState.OPERATIONAL);
      await shortSell.cancelLoanCall(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #deposit while OPERATIONAL', async () => {
      const [shortSell, baseToken] = await Promise.all([
        ShortSell.deployed(),
        BaseToken.deployed()
      ]);
      const shortTx = await doShort(accounts);
      const amount = new BigNumber(1000);
      await baseToken.issue(amount, { from: shortTx.seller });
      await baseToken.approve(ProxyContract.address, amount, { from: shortTx.seller });

      await shortSell.setOperationState(OperationState.AUCTION_CLOSE_ONLY);
      await expectThrow(() => shortSell.deposit(
        shortTx.id,
        amount,
        { from: shortTx.seller }
      ));

      await shortSell.setOperationState(OperationState.OPERATIONAL);
      await shortSell.deposit(
        shortTx.id,
        amount,
        { from: shortTx.seller }
      );
    });
  });

  contract('ShortSell', accounts => {
    it('Only allows #cancelLoanOffering while OPERATIONAL', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);
      const cancelAmount = new BigNumber(1000);

      await shortSell.setOperationState(OperationState.SHORT_SELLER_CLOSE_ONLY);
      await expectThrow(() => callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        cancelAmount
      ));

      await shortSell.setOperationState(OperationState.OPERATIONAL);
      await callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        cancelAmount
      );
    });
  });

  contract('ShortSell', accounts => {
    it('Only allows #approveLoanOffering while OPERATIONAL', async () => {
      const shortTx = await createShortSellTx(accounts);
      const shortSell = await ShortSell.deployed();

      await issueTokensAndSetAllowancesForShort(shortTx);

      await shortSell.setOperationState(OperationState.SHORT_SELLER_CLOSE_ONLY);
      await expectThrow(() => callApproveLoanOffering(
        shortSell,
        shortTx.loanOffering
      ));

      await shortSell.setOperationState(OperationState.OPERATIONAL);
      await callApproveLoanOffering(
        shortSell,
        shortTx.loanOffering
      );
    });
  });
});

describe('#auctionStateControl', () => {
  contract('ShortSell', accounts => {
    it('Allows #cancelLoanOffering while CLOSE_AND_CANCEL_LOAN_ONLY', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);
      const cancelAmount = new BigNumber(1000);

      await shortSell.setOperationState(OperationState.CLOSE_AND_CANCEL_LOAN_ONLY);
      await callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        cancelAmount
      );
    });
  });
});

describe('#auctionStateControl', () => {
  async function test(accounts, state) {
    const bidder = accounts[6];
    const bid = new BigNumber(100);
    const { shortSell, underlyingToken, shortTx } = await doShortAndCall(accounts);

    await shortSell.setOperationState(state);
    await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);
  }

  contract('ShortSell', accounts => {
    it('Allows #placeSellbackBid while OPERATIONAL', async () => {
      await test(accounts, OperationState.OPERATIONAL);

    });
  });

  contract('ShortSell', accounts => {
    it('Allows #placeSellbackBid while CLOSE_ONLY', async () => {
      await test(accounts, OperationState.CLOSE_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #placeSellbackBid while AUCTION_CLOSE_ONLY', async () => {
      await test(accounts, OperationState.AUCTION_CLOSE_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #placeSellbackBid while CLOSE_AND_CANCEL_LOAN_ONLY', async () => {
      await test(accounts, OperationState.CLOSE_AND_CANCEL_LOAN_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Disallows #placeSellbackBid while in other operation states', async () => {
      const bidder = accounts[6];
      const bid = new BigNumber(100);
      const { shortSell, underlyingToken, shortTx } = await doShortAndCall(accounts);

      await shortSell.setOperationState(OperationState.SHORT_SELLER_CLOSE_ONLY);
      await expectThrow(() => placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid));

      await shortSell.setOperationState(OperationState.SHORT_SELLER_CLOSE_DIRECTLY_ONLY);
      await expectThrow(() => placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid));

      await shortSell.setOperationState(OperationState.SHORT_SELLER_CLOSE_0X_ONLY);
      await expectThrow(() => placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid));
    });
  });
});

describe('#closeShortStateControl', () => {
  const closeAmount = new BigNumber(100);
  async function test(accounts, state) {
    const shortTx = await doShort(accounts);
    const [sellOrder, shortSell] = await Promise.all([
      createSigned0xSellOrder(accounts),
      ShortSell.deployed()
    ]);
    await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);

    await shortSell.setOperationState(state);
    await callCloseShort(shortSell, shortTx, sellOrder, closeAmount);
  }

  contract('ShortSell', accounts => {
    it('Allows #closeShort while OPERATIONAL', async () => {
      await test(accounts, OperationState.OPERATIONAL);
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #closeShort while CLOSE_ONLY', async () => {
      await test(accounts, OperationState.CLOSE_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #closeShort while SHORT_SELLER_CLOSE_ONLY', async () => {
      await test(accounts, OperationState.SHORT_SELLER_CLOSE_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #closeShort while SHORT_SELLER_CLOSE_0X_ONLY', async () => {
      await test(accounts, OperationState.SHORT_SELLER_CLOSE_0X_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #closeShort while CLOSE_AND_CANCEL_LOAN_ONLY', async () => {
      await test(accounts, OperationState.CLOSE_AND_CANCEL_LOAN_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Disallows #closeShort while in other operation states', async () => {
      const shortTx = await doShort(accounts);
      const [sellOrder, shortSell] = await Promise.all([
        createSigned0xSellOrder(accounts),
        ShortSell.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);

      await shortSell.setOperationState(OperationState.AUCTION_CLOSE_ONLY);
      await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, closeAmount));

      await shortSell.setOperationState(OperationState.SHORT_SELLER_CLOSE_DIRECTLY_ONLY);
      await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, closeAmount));
    });
  });
});

describe('#closeShortDirectlyStateControl', () => {
  const closeAmount = new BigNumber(100);
  async function test(accounts, state) {
    const shortSell = await ShortSell.deployed();
    const shortTx = await doShort(accounts);
    await issueForDirectClose(shortTx);

    await shortSell.setOperationState(state);
    await shortSell.closeShortDirectly(
      shortTx.id,
      closeAmount,
      { from: shortTx.seller }
    );
  }

  contract('ShortSell', accounts => {
    it('Allows #closeShortDirectly while OPERATIONAL', async () => {
      await test(accounts, OperationState.OPERATIONAL);

    });
  });

  contract('ShortSell', accounts => {
    it('Allows #closeShortDirectly while CLOSE_ONLY', async () => {
      await test(accounts, OperationState.CLOSE_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #closeShortDirectly while SHORT_SELLER_CLOSE_ONLY', async () => {
      await test(accounts, OperationState.SHORT_SELLER_CLOSE_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #closeShortDirectly while SHORT_SELLER_CLOSE_DIRECTLY_ONLY', async () => {
      await test(accounts, OperationState.SHORT_SELLER_CLOSE_DIRECTLY_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Allows #closeShortDirectly while CLOSE_AND_CANCEL_LOAN_ONLY', async () => {
      await test(accounts, OperationState.CLOSE_AND_CANCEL_LOAN_ONLY);
    });
  });

  contract('ShortSell', accounts => {
    it('Disallows #closeShortDirectly while in other operation states', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);
      await issueForDirectClose(shortTx);

      await shortSell.setOperationState(OperationState.AUCTION_CLOSE_ONLY);
      await expectThrow(() => shortSell.closeShortDirectly(
        shortTx.id,
        closeAmount,
        { from: shortTx.seller }
      ));

      await shortSell.setOperationState(OperationState.SHORT_SELLER_CLOSE_0X_ONLY);
      await expectThrow(() => shortSell.closeShortDirectly(
        shortTx.id,
        closeAmount,
        { from: shortTx.seller }
      ));
    });
  });
});

async function expectOperationState(shortSell, state) {
  const operationState = await shortSell.operationState.call();
  expect(operationState.toNumber()).to.eq(state);
}
