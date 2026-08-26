/* =========================================================
   FichaFlow — currency + payment math
   ========================================================= */
(function () {
  "use strict";

  function num(v) {
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function fmtMoney(n, currency) {
    const rounded = Math.round(num(n));
    const withCommas = rounded.toLocaleString("en-US");
    return "$" + withCommas + " " + currency;
  }

  // Convert a ficha's base price (in ficha.moneda) to MXN and USD.
  function convertPrice(baseAmount, baseCurrency, exchangeRate) {
    const base = num(baseAmount);
    const rate = num(exchangeRate) || 1;
    if (baseCurrency === "USD") {
      return { mxn: base * rate, usd: base };
    }
    return { mxn: base, usd: base / rate };
  }

  // Payment row -> computed MXN/USD amounts based on modelo's base price.
  function pagoRowAmounts(pct, baseAmount, baseCurrency, exchangeRate) {
    const converted = convertPrice(baseAmount, baseCurrency, exchangeRate);
    const p = num(pct) / 100;
    return { mxn: converted.mxn * p, usd: converted.usd * p };
  }

  function totalPct(filas) {
    return filas.reduce(function (sum, f) { return sum + num(f.pct); }, 0);
  }

  window.Currency = {
    num: num,
    fmtMoney: fmtMoney,
    convertPrice: convertPrice,
    pagoRowAmounts: pagoRowAmounts,
    totalPct: totalPct,
  };
})();
