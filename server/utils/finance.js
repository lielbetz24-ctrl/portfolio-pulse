/**
 * PortfolioPulse — מנוע חישובים פיננסיים (Finance Calculation Utility)
 * מרכז את כל לוגיקת החישובים הפיננסיים (שווי שוק, רווח/הפסד, שינוי יומי) בצד השרת.
 */

/**
 * 1. זיהוי האם יש לאפס את התשואה היומית (מחוץ לשעות מסחר, סוף שבוע, או לפני הפתיחה)
 */
function shouldResetDailyPnL(ticker) {
  const symbol = (ticker || '').toUpperCase();
  const now = new Date();
  
  // בורסת תל אביב (.TA)
  if (symbol.endsWith('.TA')) {
    const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const day = istDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 4 = Thursday
    const hour = istDate.getHours();
    const minute = istDate.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    
    if (day > 4) return true; // יום שישי / שבת (אין מסחר)
    return timeInMinutes < (9 * 60 + 45); // לפני פתיחת השוק ב-09:45
  }
  
  // בורסה אמריקאית (מחדל, NYSE / NASDAQ)
  const estDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = estDate.getDay(); // 1 = Monday, ..., 5 = Friday
  const hour = estDate.getHours();
  const minute = estDate.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  if (day < 1 || day > 5) return true; // יום שבת / ראשון (אין מסחר)
  return timeInMinutes < (9 * 60 + 30); // לפני פתיחת השוק ב-09:30
}

/**
 * 2. חישוב מדדים עבור מניה בודדת (Holding Position)
 */
function calculateHoldingMetrics(quantity, avg_buy_price, current_price, daily_change_percent, ticker) {
  const qty = Number(quantity || 0);
  const avgBuy = Number(avg_buy_price || 0);
  const currentPrice = current_price !== null && current_price !== undefined ? Number(current_price) : null;
  const changePct = daily_change_percent !== null && daily_change_percent !== undefined ? Number(daily_change_percent) : 0;

  if (currentPrice === null || currentPrice <= 0) {
    return {
      market_value: null,
      pnl: null,
      pnl_pct: null,
      daily_change_usd: 0,
      prev_stock_value: 0
    };
  }

  const market_value = qty * currentPrice;
  const pnl = market_value - (qty * avgBuy);
  const pnl_pct = avgBuy > 0 ? (pnl / (qty * avgBuy)) * 100 : 0;

  const prevClose = currentPrice / (1 + changePct / 100);
  const isReset = shouldResetDailyPnL(ticker);

  let daily_change_usd = 0;
  let prev_stock_value = 0;

  if (prevClose > 0 && !isReset) {
    daily_change_usd = qty * (currentPrice - prevClose);
    prev_stock_value = qty * prevClose;
  } else {
    // מחוץ לשעות מסחר/סופ"ש - השינוי היומי מאופס ל-0, שער קודם שווה לשער הנוכחי
    daily_change_usd = 0;
    prev_stock_value = qty * currentPrice;
  }

  return {
    market_value,
    pnl,
    pnl_pct,
    daily_change_usd,
    prev_stock_value
  };
}

/**
 * 3. חישוב סיכומים גלובליים עבור כל תיק ההשקעות (Portfolio Totals)
 */
function calculatePortfolioTotals(cash_balance, holdings) {
  const cash = Number(cash_balance || 0);
  let total_stock_value = 0;
  let total_cost = 0;
  let total_pnl = 0;
  let daily_change_usd = 0;
  let total_prev_stock_value = 0;

  holdings.forEach(h => {
    if (h.market_value !== null && h.market_value !== undefined) {
      total_stock_value += h.market_value;
      total_cost += h.quantity * h.avg_buy_price;
      if (h.pnl !== null && h.pnl !== undefined) {
        total_pnl += h.pnl;
      }
      daily_change_usd += h.daily_change_usd || 0;
      total_prev_stock_value += h.prev_stock_value || 0;
    }
  });

  const total_equity = cash + total_stock_value;
  const total_pnl_pct = total_cost > 0 ? (total_pnl / total_cost) * 100 : 0;
  const daily_change_pct = total_prev_stock_value > 0 ? (daily_change_usd / total_prev_stock_value) * 100 : 0;

  return {
    cash_balance: cash,
    total_stock_value,
    total_equity,
    total_pnl,
    total_pnl_pct,
    daily_change_usd,
    daily_change_pct
  };
}

module.exports = {
  shouldResetDailyPnL,
  calculateHoldingMetrics,
  calculatePortfolioTotals
};
