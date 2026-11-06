/* =========================================================
   FichaFlow — currency + payment math (+ surface units)
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

  // Surface is always typed in m² (modelo.superficieM2); sq ft is only ever
  // derived from it, never stored, so the two can't drift apart.
  const SQFT_PER_M2 = 10.7639;

  function fmtSqft(m2) {
    return Math.round(num(m2) * SQFT_PER_M2).toLocaleString("en-US") + " SQ FT";
  }

  // unidad is ficha.unidadSuperficie: 'm2' | 'sqft' | 'ambas'. Anything
  // else (an older ficha saved before the setting existed) reads as m².
  // The m² figure stays exactly as typed, same as it always printed.
  function fmtSurface(m2, unidad) {
    if (unidad === "sqft") return fmtSqft(m2);
    if (unidad === "ambas") return m2 + " M² · " + fmtSqft(m2);
    return m2 + " M²";
  }

  window.Currency = {
    num: num,
    fmtMoney: fmtMoney,
    convertPrice: convertPrice,
    pagoRowAmounts: pagoRowAmounts,
    totalPct: totalPct,
    fmtSqft: fmtSqft,
    fmtSurface: fmtSurface,
  };
})();
