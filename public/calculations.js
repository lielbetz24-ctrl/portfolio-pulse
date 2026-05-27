/* ==========================================================================
   PortfolioPulse — מנוע חישובים פיננסיים (Portfolio Engine)
   פונקציות טהורות: פוזיציות, שווי תיק, סינון טיפים
   ========================================================================== */

const PortfolioEngine = (() => {

  /**
   * 1. חישוב פוזיציה נוכחית מתוך היסטוריית עסקאות
   *
   * עובר על כל העסקאות לפי סדר כרונולוגי ומחשב:
   * - יתרת מזומן (cash_balance)
   * - לכל ticker: כמות נותרת + מחיר קנייה ממוצע משוקלל (avg_buy_price)
   *
   * שיטת ממוצע משוקלל (Weighted Average Cost):
   *   avg = (sum של quantity * price בכל קנייה) / (sum של quantity בכל קנייה)
   * מכירה מקטינה כמות בלבד — הממוצע של המניות שנשארו לא משתנה.
   */
  function computeHoldingsFromTransactions(transactions) {
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.transaction_date) - new Date(b.transaction_date)
    );

    let cash_balance = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    const holdingsMap = {};

    for (const tx of sorted) {
      if (tx.action_type === 'deposit') {
        totalDeposits += tx.price;
        cash_balance += tx.price;
        continue;
      }
      if (tx.action_type === 'withdraw') {
        totalWithdrawals += tx.price;
        cash_balance -= tx.price;
        continue;
      }

      const ticker = (tx.ticker || '').toUpperCase();
      if (!ticker) continue;

      if (!holdingsMap[ticker]) {
        holdingsMap[ticker] = {
          ticker,
          quantity: 0,
          total_buy_cost: 0,
          total_buy_qty: 0,
          avg_buy_price: 0
        };
      }

      const holding = holdingsMap[ticker];

      // קנייה / הוספת אחזקה — מעדכנות פוזיציה בלבד (ללא חיוב מזומן; מצב מעקב)
      if (tx.action_type === 'buy' || tx.action_type === 'holding') {
        holding.quantity += tx.quantity;
        holding.total_buy_cost += tx.quantity * tx.price;
        holding.total_buy_qty += tx.quantity;
        holding.avg_buy_price =
          holding.total_buy_qty > 0
            ? holding.total_buy_cost / holding.total_buy_qty
            : 0;
      } else if (tx.action_type === 'sell') {
        holding.quantity -= tx.quantity;
        // מכירה במעקב — לא מוסיפה מזומן אוטומטית
        if (holding.quantity <= 0.000001) {
          delete holdingsMap[ticker];
        }
      }
    }

    return { cash_balance, totalDeposits, totalWithdrawals, holdingsMap };
  }

  /**
   * מעשיר כל אחזקה בנתוני שוק (מחיר נוכחי, שווי, רווח/הפסד)
   */
  function enrichHoldingsWithMarketPrices(holdingsMap, marketPrices = {}) {
    let totalStockMarketValue = 0;
    const holdingsList = [];

    for (const ticker of Object.keys(holdingsMap)) {
      const holding = { ...holdingsMap[ticker] };
      const quote = marketPrices[ticker];
      const marketPrice = quote && quote.price > 0 ? quote.price : null;

      holding.current_price = marketPrice;
      holding.total_cost = holding.quantity * holding.avg_buy_price;

      if (marketPrice !== null) {
        holding.market_value = holding.quantity * marketPrice;
        holding.pnl = holding.market_value - holding.total_cost;
        holding.pnl_pct =
          holding.total_cost > 0 ? (holding.pnl / holding.total_cost) * 100 : 0;
        holding.change_since_purchase_pct =
          holding.avg_buy_price > 0
            ? ((marketPrice - holding.avg_buy_price) / holding.avg_buy_price) * 100
            : null;
        totalStockMarketValue += holding.market_value;
      } else {
        holding.change_since_purchase_pct = null;
        holding.market_value = 0;
        holding.pnl = null;
        holding.pnl_pct = null;
      }

      holdingsList.push(holding);
    }

    return { holdingsList, totalStockMarketValue };
  }

  /**
   * חישוב שווי תיק מלא — הפונקציה המרכזית
   *
   * @returns {{
   *   portfolioId, cash_balance, total_estimated_value, totalStockMarketValue,
   *   totalPnL, totalPnLPct, holdingsMap, holdingsList, transactions
   * }}
   */
  function calculatePortfolioMetrics(portfolioId, allTransactions, marketPrices = {}) {
    const portfolioTransactions = allTransactions.filter(
      tx => tx.portfolio_id === portfolioId
    );

    const { cash_balance, totalDeposits, totalWithdrawals, holdingsMap } =
      computeHoldingsFromTransactions(portfolioTransactions);

    const { holdingsList, totalStockMarketValue } = enrichHoldingsWithMarketPrices(
      holdingsMap,
      marketPrices
    );

    const total_estimated_value = cash_balance + totalStockMarketValue;
    
    // Calculate PnL based on purchase yield of holdings
    let totalCostOfHoldings = 0;
    let totalPnL = 0;
    holdingsList.forEach(holding => {
      if (holding.pnl != null) {
        totalPnL += holding.pnl;
        totalCostOfHoldings += holding.total_cost;
      }
    });

    const totalPnLPct = totalCostOfHoldings > 0 ? (totalPnL / totalCostOfHoldings) * 100 : 0;

    let totalDailyChangeUSD = 0;
    let totalPreviousStockValue = 0;

    holdingsList.forEach(holding => {
      const quote = marketPrices[holding.ticker];
      if (quote && holding.market_value > 0) {
        const currentPrice = quote.price || holding.current_price;
        const change = quote.change != null ? parseFloat(quote.change) : 0;
        const previousClose = quote.previousClose != null ? parseFloat(quote.previousClose) : (currentPrice / (1 + change / 100));

        if (previousClose > 0) {
          const holding_daily_change_usd = holding.quantity * (currentPrice - previousClose);
          totalDailyChangeUSD += holding_daily_change_usd;
          totalPreviousStockValue += holding.quantity * previousClose;
        } else {
          totalPreviousStockValue += holding.market_value;
        }
      }
    });

    const totalPreviousValue = cash_balance + totalPreviousStockValue;
    const totalDailyChangePct = totalPreviousValue > 0 ? (totalDailyChangeUSD / totalPreviousValue) * 100 : 0;

    return {
      portfolioId,
      cash_balance,
      total_estimated_value,
      totalStockMarketValue,
      totalPnL,
      totalPnLPct,
      totalDailyChangeUSD,
      totalDailyChangePct,
      holdingsMap,
      holdingsList,
      transactions: portfolioTransactions
    };
  }

  /**
   * שווי תיק כולל (Total Equity)
   * סכום: לכל מניה (כמות × מחיר שוק עדכני מה-API) + יתרת מזומן (אם קיימת)
   */
  function calculateTotalEquity(metrics, marketPrices = {}) {
    if (!metrics) return 0;
    let stocksValue = 0;
    for (const holding of metrics.holdingsList) {
      const price = marketPrices[holding.ticker]?.price;
      if (price != null && price > 0) {
        stocksValue += holding.quantity * price;
      }
    }
    return stocksValue + (metrics.cash_balance || 0);
  }

  /** מחזיר Set של סימולי המניות בתיק (רק פוזיציות פתוחות) */
  function getPortfolioTickerSet(holdingsMap) {
    return new Set(
      Object.keys(holdingsMap).map(t => t.toUpperCase())
    );
  }

  /**
   * 2. סינון טיפים חכם
   *
   * כללים:
   * - ticker === null  → טיפ כללי → מוצג לכולם
   * - ticker === 'AAPL' → מוצג רק אם AAPL קיים בפורטפוליו
   */
  function filterTipsForPortfolio(allTips, holdingTickers) {
    const tickerSet = new Set(
      (holdingTickers || []).map(t => String(t).toUpperCase())
    );

    return (allTips || []).filter(tip => {
      if (tip.ticker === null || tip.ticker === undefined || tip.ticker === '') {
        return true;
      }
      return tickerSet.has(String(tip.ticker).toUpperCase());
    });
  }

  /** מחלקת שורה: ירוק = מחיר שוק > מחיר קנייה, אדום = נמוך יותר */
  function getPositionRowClass(holding) {
    const buy = holding.avg_buy_price;
    const market = holding.current_price;
    if (market == null || buy == null || buy <= 0) return '';
    if (market > buy) return 'row-pos-green';
    if (market < buy) return 'row-neg-red';
    return '';
  }

  /** תווית סטטוס פוזיציה (מול מחיר קנייה, לא מול שווי כולל) */
  function getPositionStatusLabel(holding) {
    const buy = holding.avg_buy_price;
    const market = holding.current_price;
    if (market == null || buy == null) {
      return { text: 'ממתין לסנכרון', cssClass: 'position-neutral' };
    }
    const diffPct = ((market - buy) / buy) * 100;
    if (market > buy) {
      return { text: `רווח +${diffPct.toFixed(2)}%`, cssClass: 'position-profit' };
    }
    if (market < buy) {
      return { text: `הפסד ${diffPct.toFixed(2)}%`, cssClass: 'position-loss' };
    }
    return { text: 'שוויון', cssClass: 'position-neutral' };
  }

  return {
    computeHoldingsFromTransactions,
    enrichHoldingsWithMarketPrices,
    calculatePortfolioMetrics,
    calculateTotalEquity,
    getPortfolioTickerSet,
    filterTipsForPortfolio,
    getPositionRowClass,
    getPositionStatusLabel
  };
})();
