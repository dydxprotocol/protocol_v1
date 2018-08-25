pragma solidity 0.4.24;

import "./ExpiringMarket.sol";
import "./DSNote.sol";


contract MatchingEvents {
    event LogBuyEnabled(bool isEnabled);
    event LogMinSell(address pay_gem, uint min_amount);
    event LogMatchingEnabled(bool isEnabled);
    event LogUnsortedOffer(uint id);
    event LogSortedOffer(uint id);
    event LogAddTokenPairWhitelist(ERC20 baseToken, ERC20 quoteToken);
    event LogRemTokenPairWhitelist(ERC20 baseToken, ERC20 quoteToken);
    event LogInsert(address keeper, uint id);
    event LogDelete(address keeper, uint id);
}

contract MatchingMarket is MatchingEvents, ExpiringMarket, DSNote {
    bool public buyEnabled = true;      //buy enabled
    bool public matchingEnabled = true; //true: enable matching,
                                         //false: revert to expiring market
    struct sortInfo {
        uint next;  //points to id of next higher offer
        uint prev;  //points to id of previous lower offer
        uint delb;  //the blocknumber where this entry was marked for delete
    }
    mapping(uint => sortInfo) public _rank;                     //doubly linked lists of sorted offer ids
    mapping(address => mapping(address => uint)) public _best;  //id of the highest offer for a token pair
    mapping(address => mapping(address => uint)) public _span;  //number of offers stored for token pair in sorted orderbook
    mapping(address => uint) public _dust;                      //minimum sell amount for a token to avoid dust offers
    mapping(uint => uint) public _near;         //next unsorted offer id
    mapping(bytes32 => bool) public _menu;      //whitelist tracking which token pairs can be traded
    uint _head;                                 //first unsorted offer id

    //check if token pair is enabled
    modifier isWhitelist(ERC20 buy_gem, ERC20 pay_gem) {
        require(
            _menu[keccak256(abi.encodePacked(buy_gem, pay_gem))]
            ||
            _menu[keccak256(abi.encodePacked(pay_gem, buy_gem))]
        );
        _;
    }

    constructor(uint64 close_time) ExpiringMarket(close_time) public {
    }

    // ---- Public entrypoints ---- //

    function make(
        ERC20    pay_gem,
        ERC20    buy_gem,
        uint128  pay_amt,
        uint128  buy_amt
    )
        public
        returns (bytes32)
    {
        return bytes32(offer(pay_amt, pay_gem, buy_amt, buy_gem));
    }

    function take(bytes32 id, uint128 maxTakeAmount) public {
        require(buy(uint256(id), maxTakeAmount));
    }

    function kill(bytes32 id) public {
        require(cancel(uint256(id)));
    }

    // Make a new offer. Takes funds from the caller into market escrow.
    //
    // If matching is enabled:
    //     * creates new offer without putting it in
    //       the sorted list.
    //     * available to authorized contracts only!
    //     * keepers should call insert(id,pos)
    //       to put offer in the sorted list.
    //
    // If matching is disabled:
    //     * calls expiring market's offer().
    //     * available to everyone without authorization.
    //     * no sorting is done.
    //
    function offer(
        uint pay_amt,    //maker (ask) sell how much
        ERC20 pay_gem,   //maker (ask) sell which token
        uint buy_amt,    //taker (ask) buy how much
        ERC20 buy_gem    //taker (ask) buy which token
    )
        public
        isWhitelist(pay_gem, buy_gem)
        /* NOT synchronized!!! */
        returns (uint)
    {
        if (matchingEnabled) {
            return _offeru(pay_amt, pay_gem, buy_amt, buy_gem);
        } else {
            return super.offer(pay_amt, pay_gem, buy_amt, buy_gem);
        }
    }

    // Make a new offer. Takes funds from the caller into market escrow.
    function offer(
        uint pay_amt,    //maker (ask) sell how much
        ERC20 pay_gem,   //maker (ask) sell which token
        uint buy_amt,    //maker (ask) buy how much
        ERC20 buy_gem,   //maker (ask) buy which token
        uint pos         //position to insert offer, 0 should be used if unknown
    )
        public
        isWhitelist(pay_gem, buy_gem)
        /*NOT synchronized!!! */
        can_offer
        returns (uint)
    {
        return offer(pay_amt, pay_gem, buy_amt, buy_gem, pos, false);
    }

    function offer(
        uint pay_amt,    //maker (ask) sell how much
        ERC20 pay_gem,   //maker (ask) sell which token
        uint buy_amt,    //maker (ask) buy how much
        ERC20 buy_gem,   //maker (ask) buy which token
        uint pos,        //position to insert offer, 0 should be used if unknown
        bool rounding    //match "close enough" orders?
    )
        public
        isWhitelist(pay_gem, buy_gem)
        /*NOT synchronized!!! */
        can_offer
        returns (uint)
    {
        require(_dust[pay_gem] <= pay_amt);

        if (matchingEnabled) {
          return _matcho(pay_amt, pay_gem, buy_amt, buy_gem, pos, rounding);
        }
        return super.offer(pay_amt, pay_gem, buy_amt, buy_gem);
    }

    //Transfers funds from caller to offer maker, and from market to caller.
    function buy(uint id, uint amount)
        public
        /*NOT synchronized!!! */
        can_buy(id)
        returns (bool)
    {
        if (matchingEnabled) {
            return _buys(id, amount);
        } else {
            return super.buy(id, amount);
        }
    }

    // Cancel an offer. Refunds offer maker.
    function cancel(uint id)
        public
        /*NOT synchronized!!! */
        can_cancel(id)
        returns (bool success)
    {
        if (matchingEnabled) {
            if (isOfferSorted(id)) {
                require(_unsort(id));
            } else {
                require(_hide(id));
            }
        }
        return super.cancel(id);    //delete the offer.
    }

    //insert offer into the sorted list
    //keepers need to use this function
    function insert(
        uint id,   //maker (ask) id
        uint pos   //position to insert into
    )
        public
        returns (bool)
    {
        require(!isOfferSorted(id));    //make sure offers[id] is not yet sorted
        require(isActive(id));          //make sure offers[id] is active

        _hide(id);                      //remove offer from unsorted offers list
        _sort(id, pos);                 //put offer into the sorted offers list
        emit LogInsert(msg.sender, id);
        return true;
    }

    //deletes _rank [id]
    //  Function should be called by keepers.
    function del_rank(uint id)
        public
    returns (bool)
    {
        require(!isActive(id) && _rank[id].delb != 0 && _rank[id].delb < block.number - 10);
        delete _rank[id];
        emit LogDelete(msg.sender, id);
        return true;
    }

    //returns true if token is succesfully added to whitelist
    //  Function is used to add a token pair to the whitelist
    //  All incoming offers are checked against the whitelist.
    function addTokenPairWhitelist(
        ERC20 baseToken,
        ERC20 quoteToken
    )
        public
        auth
        note
    returns (bool)
    {
        require(!isTokenPairWhitelisted(baseToken, quoteToken));
        require(address(baseToken) != 0x0 && address(quoteToken) != 0x0);

        _menu[keccak256(abi.encodePacked(baseToken, quoteToken))] = true;
        emit LogAddTokenPairWhitelist(baseToken, quoteToken);
        return true;
    }

    //returns true if token is successfully removed from whitelist
    //  Function is used to remove a token pair from the whitelist.
    //  All incoming offers are checked against the whitelist.
    function remTokenPairWhitelist(
        ERC20 baseToken,
        ERC20 quoteToken
    )
        public
        auth
        note
    returns (bool)
    {
        require(isTokenPairWhitelisted(baseToken, quoteToken));

        delete _menu[keccak256(abi.encodePacked(baseToken, quoteToken))];
        delete _menu[keccak256(abi.encodePacked(quoteToken, baseToken))];
        emit LogRemTokenPairWhitelist(baseToken, quoteToken);
        return true;
    }

    function isTokenPairWhitelisted(
        ERC20 baseToken,
        ERC20 quoteToken
    )
        public
        constant
        returns (bool)
    {
        return (
            _menu[keccak256(abi.encodePacked(baseToken, quoteToken))]
            ||
            _menu[keccak256(abi.encodePacked(quoteToken, baseToken))]
        );
    }

    //set the minimum sell amount for a token
    //    Function is used to avoid "dust offers" that have
    //    very small amount of tokens to sell, and it would
    //    cost more gas to accept the offer, than the value
    //    of tokens received.
    function setMinSell(
        ERC20 pay_gem,     //token to assign minimum sell amount to
        uint dust          //maker (ask) minimum sell amount
    )
        public
        auth
        note
        returns (bool)
    {
        _dust[pay_gem] = dust;
        emit LogMinSell(pay_gem, dust);
        return true;
    }

    //returns the minimum sell amount for an offer
    function getMinSell(
        ERC20 pay_gem      //token for which minimum sell amount is queried
    )
        public
        constant
        returns (uint)
    {
        return _dust[pay_gem];
    }

    //set buy functionality enabled/disabled
    function setBuyEnabled(bool buyEnabled_) public auth returns (bool) {
        buyEnabled = buyEnabled_;
        emit LogBuyEnabled(buyEnabled);
        return true;
    }

    //set matching enabled/disabled
    //    If matchingEnabled true(default), then inserted offers are matched.
    //    Except the ones inserted by contracts, because those end up
    //    in the unsorted list of offers, that must be later sorted by
    //    keepers using insert().
    //    If matchingEnabled is false then MatchingMarket is reverted to ExpiringMarket,
    //    and matching is not done, and sorted lists are disabled.
    function setMatchingEnabled(bool matchingEnabled_) public auth returns (bool) {
        matchingEnabled = matchingEnabled_;
        emit LogMatchingEnabled(matchingEnabled);
        return true;
    }

    //return the best offer for a token pair
    //      the best offer is the lowest one if it's an ask,
    //      and highest one if it's a bid offer
    function getBestOffer(ERC20 sell_gem, ERC20 buy_gem) public constant returns(uint) {
        return _best[sell_gem][buy_gem];
    }

    //return the next worse offer in the sorted list
    //      the worse offer is the higher one if its an ask,
    //      a lower one if its a bid offer,
    //      and in both cases the newer one if they're equal.
    function getWorseOffer(uint id) public constant returns(uint) {
        return _rank[id].prev;
    }

    //return the next better offer in the sorted list
    //      the better offer is in the lower priced one if its an ask,
    //      the next higher priced one if its a bid offer
    //      and in both cases the older one if they're equal.
    function getBetterOffer(uint id) public constant returns(uint) {

        return _rank[id].next;
    }

    //return the amount of better offers for a token pair
    function getOfferCount(ERC20 sell_gem, ERC20 buy_gem) public constant returns(uint) {
        return _span[sell_gem][buy_gem];
    }

    //get the first unsorted offer that was inserted by a contract
    //      Contracts can't calculate the insertion position of their offer because it is not an O(1) operation.
    //      Their offers get put in the unsorted list of offers.
    //      Keepers can calculate the insertion position offchain and pass it to the insert() function to insert
    //      the unsorted offer into the sorted list. Unsorted offers will not be matched, but can be bought with buy().
    function getFirstUnsortedOffer() public constant returns(uint) {
        return _head;
    }

    //get the next unsorted offer
    //      Can be used to cycle through all the unsorted offers.
    function getNextUnsortedOffer(uint id) public constant returns(uint) {
        return _near[id];
    }

    function isOfferSorted(uint id) public constant returns(bool) {
        return _rank[id].next != 0
               || _rank[id].prev != 0
               || _best[offers[id].pay_gem][offers[id].buy_gem] == id;
    }

    function sellAllAmount(ERC20 pay_gem, uint pay_amt, ERC20 buy_gem, uint min_fill_amount)
        public
        returns (uint fill_amt)
    {
        uint offerId;
        while (pay_amt > 0) {                           //while there is amount to sell
            offerId = getBestOffer(buy_gem, pay_gem);   //Get the best offer for the token pair
            require(offerId != 0);                      //Fails if there are not more offers

            // There is a chance that pay_amt is smaller than 1 wei of the other token
            if (pay_amt * 1 ether < wdiv(offers[offerId].buy_amt, offers[offerId].pay_amt)) {
                break;                                  //We consider that all amount is sold
            }
            if (pay_amt >= offers[offerId].buy_amt) {                       //If amount to sell is higher or equal than current offer amount to buy
                fill_amt = add(fill_amt, offers[offerId].pay_amt);          //Add amount bought to acumulator
                pay_amt = sub(pay_amt, offers[offerId].buy_amt);            //Decrease amount to sell
                take(bytes32(offerId), uint128(offers[offerId].pay_amt));   //We take the whole offer
            } else { // if lower
                uint baux = rmul(pay_amt * 10 ** 9, rdiv(offers[offerId].pay_amt, offers[offerId].buy_amt)) / 10 ** 9;
                fill_amt = add(fill_amt, baux);         //Add amount bought to acumulator
                take(bytes32(offerId), uint128(baux));  //We take the portion of the offer that we need
                pay_amt = 0;                            //All amount is sold
            }
        }
        require(fill_amt >= min_fill_amount);
    }

    function buyAllAmount(ERC20 buy_gem, uint buy_amt, ERC20 pay_gem, uint max_fill_amount)
        public
        returns (uint fill_amt)
    {
        uint offerId;
        while (buy_amt > 0) {                           //Meanwhile there is amount to buy
            offerId = getBestOffer(buy_gem, pay_gem);   //Get the best offer for the token pair
            require(offerId != 0);

            // There is a chance that buy_amt is smaller than 1 wei of the other token
            if (buy_amt * 1 ether < wdiv(offers[offerId].pay_amt, offers[offerId].buy_amt)) {
                break;                                  //We consider that all amount is sold
            }
            if (buy_amt >= offers[offerId].pay_amt) {                       //If amount to buy is higher or equal than current offer amount to sell
                fill_amt = add(fill_amt, offers[offerId].buy_amt);          //Add amount sold to acumulator
                buy_amt = sub(buy_amt, offers[offerId].pay_amt);            //Decrease amount to buy
                take(bytes32(offerId), uint128(offers[offerId].pay_amt));   //We take the whole offer
            } else {                                                        //if lower
                fill_amt = add(fill_amt, rmul(buy_amt * 10 ** 9, rdiv(offers[offerId].buy_amt, offers[offerId].pay_amt)) / 10 ** 9); //Add amount sold to acumulator
                take(bytes32(offerId), uint128(buy_amt));                   //We take the portion of the offer that we need
                buy_amt = 0;                                                //All amount is bought
            }
        }
        require(fill_amt <= max_fill_amount);
    }

    function getBuyAmount(ERC20 buy_gem, ERC20 pay_gem, uint pay_amt) public constant returns (uint fill_amt) {
        uint offerId = getBestOffer(buy_gem, pay_gem);           //Get best offer for the token pair
        while (pay_amt > offers[offerId].buy_amt) {
            fill_amt = add(fill_amt, offers[offerId].pay_amt);  //Add amount to buy accumulator
            pay_amt = sub(pay_amt, offers[offerId].buy_amt);    //Decrease amount to pay
            if (pay_amt > 0) {                                  //If we still need more offers
                offerId = getWorseOffer(offerId);               //We look for the next best offer
                require(offerId != 0);                          //Fails if there are not enough offers to complete
            }
        }
        fill_amt = add(fill_amt, rmul(pay_amt * 10 ** 9, rdiv(offers[offerId].pay_amt, offers[offerId].buy_amt)) / 10 ** 9); //Add proportional amount of last offer to buy accumulator
    }

    function getPayAmount(ERC20 pay_gem, ERC20 buy_gem, uint buy_amt) public constant returns (uint fill_amt) {
        uint offerId = getBestOffer(buy_gem, pay_gem);           //Get best offer for the token pair
        while (buy_amt > offers[offerId].pay_amt) {
            fill_amt = add(fill_amt, offers[offerId].buy_amt);  //Add amount to pay accumulator
            buy_amt = sub(buy_amt, offers[offerId].pay_amt);    //Decrease amount to buy
            if (buy_amt > 0) {                                  //If we still need more offers
                offerId = getWorseOffer(offerId);               //We look for the next best offer
                require(offerId != 0);                          //Fails if there are not enough offers to complete
            }
        }
        fill_amt = add(fill_amt, rmul(buy_amt * 10 ** 9, rdiv(offers[offerId].buy_amt, offers[offerId].pay_amt)) / 10 ** 9); //Add proportional amount of last offer to pay accumulator
    }

    // ---- Internal Functions ---- //

    function _buys(uint id, uint amount)
        internal
        returns (bool)
    {
        require(buyEnabled);

        if (amount == offers[id].pay_amt && isOfferSorted(id)) {
            //offers[id] must be removed from sorted list because all of it is bought
            _unsort(id);
        }
        require(super.buy(id, amount));
        return true;
    }

    //find the id of the next higher offer after offers[id]
    function _find(uint id)
        internal
        view
        returns (uint)
    {
        require( id > 0 );

        address buy_gem = address(offers[id].buy_gem);
        address pay_gem = address(offers[id].pay_gem);
        uint top = _best[pay_gem][buy_gem];
        uint old_top = 0;

        // Find the larger-than-id order whose successor is less-than-id.
        while (top != 0 && _isPricedLtOrEq(id, top)) {
            old_top = top;
            top = _rank[top].prev;
        }
        return old_top;
    }

    //find the id of the next higher offer after offers[id]
    function _findpos(uint id, uint pos)
        internal
        view
    returns (uint)
    {
        require(id > 0);

        // Look for an active order.
        while (pos != 0 && !isActive(pos)) {
            pos = _rank[pos].prev;
        }

        if (pos == 0) {
            //if we got to the end of list without a single active offer
            return _find(id);

        } else {
            // if we did find a nearby active offer
            // Walk the order book down from there...
            if(_isPricedLtOrEq(id, pos)) {
                uint old_pos;

                // Guaranteed to run at least once because of
                // the prior if statements.
                while (pos != 0 && _isPricedLtOrEq(id, pos)) {
                    old_pos = pos;
                    pos = _rank[pos].prev;
                }
                return old_pos;

            // ...or walk it up.
            } else {
                while (pos != 0 && !_isPricedLtOrEq(id, pos)) {
                    pos = _rank[pos].next;
                }
                return pos;
            }
        }
    }

    //return true if offers[low] priced less than or equal to offers[high]
    function _isPricedLtOrEq(
        uint low,   //lower priced offer's id
        uint high   //higher priced offer's id
    )
        internal
        view
        returns (bool)
    {
        return mul(offers[low].buy_amt, offers[high].pay_amt)
          >= mul(offers[high].buy_amt, offers[low].pay_amt);
    }

    //these variables are global only because of solidity local variable limit

    //match offers with taker offer, and execute token transactions
    function _matcho(
        uint t_pay_amt,    //taker sell how much
        ERC20 t_pay_gem,   //taker sell which token
        uint t_buy_amt,    //taker buy how much
        ERC20 t_buy_gem,   //taker buy which token
        uint pos,          //position id
        bool rounding      //match "close enough" orders?
    )
        internal
        returns (uint id)
    {
        uint best_maker_id;    //highest maker id
        uint t_buy_amt_old;    //taker buy how much saved
        uint m_buy_amt;        //maker offer wants to buy this much token
        uint m_pay_amt;        //maker offer wants to sell this much token

        // there is at least one offer stored for token pair
        while (_best[t_buy_gem][t_pay_gem] > 0) {
            best_maker_id = _best[t_buy_gem][t_pay_gem];
            m_buy_amt = offers[best_maker_id].buy_amt;
            m_pay_amt = offers[best_maker_id].pay_amt;

            // Ugly hack to work around rounding errors. Based on the idea that
            // the furthest the amounts can stray from their "true" values is 1.
            // Ergo the worst case has t_pay_amt and m_pay_amt at +1 away from
            // their "correct" values and m_buy_amt and t_buy_amt at -1.
            // Since (c - 1) * (d - 1) > (a + 1) * (b + 1) is equivalent to
            // c * d > a * b + a + b + c + d, we write...
            if (mul(m_buy_amt, t_buy_amt) > mul(t_pay_amt, m_pay_amt) +
                (rounding ? m_buy_amt + t_buy_amt + t_pay_amt + m_pay_amt : 0))
            {
                break;
            }
            // ^ The `rounding` parameter is a compromise borne of a couple days
            // of discussion.

            buy(best_maker_id, min(m_pay_amt, t_buy_amt));
            t_buy_amt_old = t_buy_amt;
            t_buy_amt = sub(t_buy_amt, min(m_pay_amt, t_buy_amt));
            t_pay_amt = mul(t_buy_amt, t_pay_amt) / t_buy_amt_old;

            if (t_pay_amt == 0 || t_buy_amt == 0) {
                break;
            }
        }

        if (t_buy_amt > 0 && t_pay_amt > 0) {
            //new offer should be created
            id = super.offer(t_pay_amt, t_pay_gem, t_buy_amt, t_buy_gem);
            //insert offer into the sorted list
            _sort(id, pos);
        }
    }

    // Make a new offer without putting it in the sorted list.
    // Takes funds from the caller into market escrow.
    // ****Available to authorized contracts only!**********
    // Keepers should call insert(id,pos) to put offer in the sorted list.
    function _offeru(
        uint pay_amt,      //maker (ask) sell how much
        ERC20 pay_gem,     //maker (ask) sell which token
        uint buy_amt,      //maker (ask) buy how much
        ERC20 buy_gem      //maker (ask) buy which token
    )
        internal
        /*NOT synchronized!!! */
        returns (uint id)
    {
        require(_dust[pay_gem] <= pay_amt);
        id = super.offer(pay_amt, pay_gem, buy_amt, buy_gem);
        _near[id] = _head;
        _head = id;
        emit LogUnsortedOffer(id);
    }

    //put offer into the sorted list
    function _sort(
        uint id,    //maker (ask) id
        uint pos    //position to insert into
    )
        internal
    {
        require(isActive(id));

        address buy_gem = address(offers[id].buy_gem);
        address pay_gem = address(offers[id].pay_gem);
        uint prev_id;                                      //maker (ask) id

        if (pos == 0 || !isOfferSorted(pos)) {
            pos = _find(id);
        } else {
            pos = _findpos(id, pos);

            //if user has entered a `pos` that belongs to another currency pair
            //we start from scratch
            if(pos != 0 && (offers[pos].pay_gem != offers[id].pay_gem
                      || offers[pos].buy_gem != offers[id].buy_gem))
            {
                pos = 0;
                pos=_find(id);
            }
        }


        //requirement below is satisfied by statements above
        //require(pos == 0 || isOfferSorted(pos));


        if (pos != 0) {                                    //offers[id] is not the highest offer
            //requirement below is satisfied by statements above
            //require(_isPricedLtOrEq(id, pos));
            prev_id = _rank[pos].prev;
            _rank[pos].prev = id;
            _rank[id].next = pos;
        } else {                                           //offers[id] is the highest offer
            prev_id = _best[pay_gem][buy_gem];
            _best[pay_gem][buy_gem] = id;
        }

        if (prev_id != 0) {                               //if lower offer does exist
            //requirement below is satisfied by statements above
            //require(!_isPricedLtOrEq(id, prev_id));
            _rank[prev_id].next = id;
            _rank[id].prev = prev_id;
        }

        _span[pay_gem][buy_gem]++;
        emit LogSortedOffer(id);
    }

    // Remove offer from the sorted list (does not cancel offer)
    function _unsort(
        uint id    //id of maker (ask) offer to remove from sorted list
    )
        internal
        returns (bool)
    {
        address buy_gem = address(offers[id].buy_gem);
        address pay_gem = address(offers[id].pay_gem);
        require(_span[pay_gem][buy_gem] > 0);

        require(_rank[id].delb == 0 &&                    //assert id is in the sorted list
                 isOfferSorted(id));

        if (id != _best[pay_gem][buy_gem]) {              // offers[id] is not the highest offer
            require(_rank[_rank[id].next].prev == id);
            _rank[_rank[id].next].prev = _rank[id].prev;
        } else {                                          //offers[id] is the highest offer
            _best[pay_gem][buy_gem] = _rank[id].prev;
        }

        if (_rank[id].prev != 0) {                        //offers[id] is not the lowest offer
            require(_rank[_rank[id].prev].next == id);
            _rank[_rank[id].prev].next = _rank[id].next;
        }

        _span[pay_gem][buy_gem]--;
        _rank[id].delb = block.number;                    //mark _rank[id] for deletion
        return true;
    }

    //Hide offer from the unsorted order book (does not cancel offer)
    function _hide(
        uint id     //id of maker offer to remove from unsorted list
    )
        internal
        returns (bool)
    {
        uint uid = _head;               //id of an offer in unsorted offers list
        uint pre = uid;                 //id of previous offer in unsorted offers list

        require(!isOfferSorted(id));    //make sure offer id is not in sorted offers list

        if (_head == id) {              //check if offer is first offer in unsorted offers list
            _head = _near[id];          //set head to new first unsorted offer
            _near[id] = 0;              //delete order from unsorted order list
            return true;
        }
        while (uid > 0 && uid != id) {  //find offer in unsorted order list
            pre = uid;
            uid = _near[uid];
        }
        if (uid != id) {                //did not find offer id in unsorted offers list
            return false;
        }
        _near[pre] = _near[id];         //set previous unsorted offer to point to offer after offer id
        _near[id] = 0;                  //delete order from unsorted order list
        return true;
    }
}
