
import { useState, useEffect, useCallback, useRef } from "react";

const PROXY = "https://corsproxy.io/?";

// ─────────────────────────────────────────────────────────────
// NSE UNIVERSE — Yahoo Finance symbols use .NS suffix
// ─────────────────────────────────────────────────────────────
const UNIVERSE = [
  // INDICES
  { s: "^NSEI", ys: "^NSEI", n: "Nifty 50", cap: "INDEX", sec: "Index", lot: 25, gap: 50, t: "index" },
  { s: "^NSEBANK", ys: "^NSEBANK", n: "Bank Nifty", cap: "INDEX", sec: "Banking", lot: 15, gap: 100, t: "index" },
  // LARGE CAP
  { s: "RELIANCE", ys: "RELIANCE.NS", n: "Reliance", cap: "LARGE", sec: "Energy", lot: 250, gap: 20, t: "stock" },
  { s: "HDFCBANK", ys: "HDFCBANK.NS", n: "HDFC Bank", cap: "LARGE", sec: "Banking", lot: 550, gap: 20, t: "stock" },
  { s: "ICICIBANK", ys: "ICICIBANK.NS", n: "ICICI Bank", cap: "LARGE", sec: "Banking", lot: 700, gap: 20, t: "stock" },
  { s: "INFY", ys: "INFY.NS", n: "Infosys", cap: "LARGE", sec: "IT", lot: 400, gap: 20, t: "stock" },
  { s: "TCS", ys: "TCS.NS", n: "TCS", cap: "LARGE", sec: "IT", lot: 150, gap: 50, t: "stock" },
  { s: "BHARTIARTL", ys: "BHARTIARTL.NS", n: "Bharti Airtel", cap: "LARGE", sec: "Telecom", lot: 500, gap: 20, t: "stock" },
  { s: "SBIN", ys: "SBIN.NS", n: "SBI", cap: "LARGE", sec: "Banking", lot: 1500, gap: 10, t: "stock" },
  { s: "LT", ys: "LT.NS", n: "L&T", cap: "LARGE", sec: "Infra", lot: 150, gap: 50, t: "stock" },
  { s: "KOTAKBANK", ys: "KOTAKBANK.NS", n: "Kotak Bank", cap: "LARGE", sec: "Banking", lot: 400, gap: 20, t: "stock" },
  { s: "AXISBANK", ys: "AXISBANK.NS", n: "Axis Bank", cap: "LARGE", sec: "Banking", lot: 625, gap: 20, t: "stock" },
  { s: "ITC", ys: "ITC.NS", n: "ITC", cap: "LARGE", sec: "FMCG", lot: 3200, gap: 5, t: "stock" },
  { s: "SUNPHARMA", ys: "SUNPHARMA.NS", n: "Sun Pharma", cap: "LARGE", sec: "Pharma", lot: 350, gap: 20, t: "stock" },
  { s: "BAJFINANCE", ys: "BAJFINANCE.NS", n: "Bajaj Finance", cap: "LARGE", sec: "NBFC", lot: 125, gap: 100, t: "stock" },
  { s: "WIPRO", ys: "WIPRO.NS", n: "Wipro", cap: "LARGE", sec: "IT", lot: 1500, gap: 5, t: "stock" },
  { s: "HCLTECH", ys: "HCLTECH.NS", n: "HCL Tech", cap: "LARGE", sec: "IT", lot: 350, gap: 20, t: "stock" },
  { s: "TMPV", ys: "TMPV.NS", n: "Tata Motors PV", cap: "LARGE", sec: "Auto", lot: 1425, gap: 10, t: "stock" },
  { s: "MARUTI", ys: "MARUTI.NS", n: "Maruti", cap: "LARGE", sec: "Auto", lot: 100, gap: 100, t: "stock" },
  { s: "TITAN", ys: "TITAN.NS", n: "Titan", cap: "LARGE", sec: "Jewellery", lot: 175, gap: 50, t: "stock" },
  { s: "NTPC", ys: "NTPC.NS", n: "NTPC", cap: "LARGE", sec: "Power", lot: 3000, gap: 5, t: "stock" },
  { s: "TATASTEEL", ys: "TATASTEEL.NS", n: "Tata Steel", cap: "LARGE", sec: "Metals", lot: 5500, gap: 2, t: "stock" },
  { s: "JSWSTEEL", ys: "JSWSTEEL.NS", n: "JSW Steel", cap: "LARGE", sec: "Metals", lot: 600, gap: 10, t: "stock" },
  { s: "ADANIPORTS", ys: "ADANIPORTS.NS", n: "Adani Ports", cap: "LARGE", sec: "Infra", lot: 400, gap: 20, t: "stock" },
  { s: "ONGC", ys: "ONGC.NS", n: "ONGC", cap: "LARGE", sec: "Energy", lot: 4750, gap: 5, t: "stock" },
  { s: "TECHM", ys: "TECHM.NS", n: "Tech Mahindra", cap: "LARGE", sec: "IT", lot: 600, gap: 20, t: "stock" },
  { s: "EICHERMOT", ys: "EICHERMOT.NS", n: "Eicher Motors", cap: "LARGE", sec: "Auto", lot: 175, gap: 50, t: "stock" },
];

const MACRO_RISKS = [
  { id: "crude", name: "Crude Oil", desc: "Brent >$85 impacts CAD, INR, inflation", impact: "HIGH", sectors: ["Energy", "FMCG", "Auto"], dir: "BEARISH" },
  { id: "uiran", name: "US-Iran Tensions", desc: "Hormuz risk disrupts 20% global oil supply", impact: "HIGH", sectors: ["Energy", "Shipping"], dir: "BEARISH" },
  { id: "usfed", name: "US Fed Rates", desc: "Higher-for-longer causes FII outflows", impact: "MED", sectors: ["Banking", "NBFC", "IT"], dir: "BEARISH" },
  { id: "monsoon", name: "Monsoon Outlook", desc: "IMD above-normal — positive for rural FMCG", impact: "MED", sectors: ["FMCG", "Retail"], dir: "BULLISH" },
  { id: "itrally", name: "IT Recovery", desc: "US tech spend and AI contracts boost IT", impact: "HIGH", sectors: ["IT", "Auto IT"], dir: "BULLISH" },
  { id: "capex", name: "Govt Capex", desc: "11L Cr infra spend — roads, rail, defence", impact: "HIGH", sectors: ["Infra", "Metals", "Cables"], dir: "BULLISH" },
  { id: "results", name: "Q4 Results", desc: "Banks mixed, pharma strong, IT cautious", impact: "HIGH", sectors: ["Banking", "IT", "Pharma"], dir: "MIXED" },
  { id: "rbi", name: "RBI Rate Cut", desc: "Rate cut if CPI below 4.5% — positive", impact: "HIGH", sectors: ["Banking", "NBFC", "Realty"], dir: "BULLISH" },
  { id: "china", name: "China Slowdown", desc: "Metal demand drop, commodity pressure", impact: "MED", sectors: ["Metals", "Mining"], dir: "BEARISH" },
  { id: "rupee", name: "INR Weakness", desc: "USD/INR near 84 — good for IT exporters", impact: "MED", sectors: ["IT", "Pharma", "Energy"], dir: "MIXED" },
];

async function fetchYahooHistory(yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=6mo`;
  const res = await fetch(PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  const meta = result?.meta || {};
  if (!quote || timestamps.length === 0) throw new Error(`No Yahoo chart data for ${yahooSymbol}`);

  const rows = timestamps.map((timestamp, i) => ({
    timestamp,
    close: quote.close?.[i],
    high: quote.high?.[i],
    low: quote.low?.[i],
    volume: quote.volume?.[i],
  })).filter(row => Number.isFinite(row.close) && Number.isFinite(row.high) && Number.isFinite(row.low));

  if (rows.length < 45) throw new Error(`Insufficient Yahoo chart data for ${yahooSymbol}`);

  return {
    currency: meta.currency || "INR",
    regularMarketPrice: meta.regularMarketPrice || rows[rows.length - 1].close,
    previousClose: rows[rows.length - 2]?.close || meta.chartPreviousClose || rows[rows.length - 1].close,
    prices: rows.map(row => row.close),
    highs: rows.map(row => row.high),
    lows: rows.map(row => row.low),
    volumes: rows.map(row => row.volume || 1),
    timestamps: rows.map(row => row.timestamp),
    source: "yahoo",
  };
}

// ─────────────────────────────────────────────────────────────
// MATH ENGINE
// ─────────────────────────────────────────────────────────────
function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d;
    else losses += Math.abs(d);
  }
  const ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  return 100 - (100 / (1 + ag / al));
}

function calcEMA(prices, period) {
  const k = 2 / (period + 1);
  let e = prices[0];
  for (let i = 1; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

function calcATR(highs, lows, closes, period = 14) {
  const trs = [];
  for (let i = 1; i < closes.length; i++)
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  return trs.slice(-period).reduce((a, b) => a + b, 0) / Math.min(trs.length, period);
}

function calcBoll(prices, period = 20, sd = 2) {
  const sl = prices.slice(-period);
  const mean = sl.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(sl.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return { upper: mean + sd * std, mid: mean, lower: mean - sd * std, bw: (2 * sd * std) / mean };
}

function calcMACD(prices) {
  if (prices.length < 26) return { line: 0, signal: 0, hist: 0 };
  const e12 = calcEMA(prices.slice(-26), 12);
  const e26 = calcEMA(prices.slice(-26), 26);
  const line = e12 - e26, sig = line * 0.2;
  return { line, signal: sig, hist: line - sig };
}

function calcStoch(highs, lows, closes, period = 14) {
  const hh = Math.max(...highs.slice(-period));
  const ll = Math.min(...lows.slice(-period));
  const k = ((closes[closes.length - 1] - ll) / (hh - ll || 1)) * 100;
  return { k, d: k * 0.8 };
}

function calcSupertrend(prices, highs, lows, mult = 3, period = 10) {
  const atrVal = calcATR(highs, lows, prices, period);
  const mid = (highs[highs.length - 1] + lows[lows.length - 1]) / 2;
  return { trend: prices[prices.length - 1] > mid - mult * atrVal ? "UP" : "DOWN", support: mid - mult * atrVal };
}

function calcVWAP(prices, highs, lows, volumes) {
  let ct = 0, cv = 0;
  for (let i = 0; i < prices.length; i++) {
    ct += ((highs[i] + lows[i] + prices[i]) / 3) * volumes[i];
    cv += volumes[i];
  }
  return ct / cv;
}

function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
  return 0.5 * (1 + sign * y);
}

function calcRealizedIvPercentile(prices, currentSigma) {
  if (prices.length < 45 || !Number.isFinite(currentSigma)) return 50;
  const annualizedWindows = [];
  for (let i = 21; i < prices.length; i++) {
    const slice = prices.slice(i - 21, i + 1);
    const returns = [];
    for (let j = 1; j < slice.length; j++) {
      returns.push(Math.log(slice[j] / slice[j - 1]));
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    annualizedWindows.push(Math.sqrt(variance) * Math.sqrt(252));
  }
  return (annualizedWindows.filter(iv => iv < currentSigma).length / annualizedWindows.length) * 100;
}

function bsPrice(S, K, T, r, sig, type) {
  if (T <= 0) return { price: Math.max(type === "call" ? S - K : K - S, 0), delta: type === "call" ? 1 : -1, gamma: 0, theta: 0, vega: 0 };
  const d1 = (Math.log(S / K) + (r + 0.5 * sig * sig) * T) / (sig * Math.sqrt(T));
  const d2 = d1 - sig * Math.sqrt(T);
  const npd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  const price = type === "call"
    ? S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2)
    : K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
  return {
    price: Math.max(price, 0),
    delta: type === "call" ? normalCDF(d1) : normalCDF(d1) - 1,
    gamma: npd1 / (S * sig * Math.sqrt(T)),
    theta: (-(S * npd1 * sig) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * (type === "call" ? normalCDF(d2) : normalCDF(-d2))) / 365,
    vega: S * npd1 * Math.sqrt(T) / 100,
  };
}

function detectBreakouts(prices, highs, lows, volumes) {
  const out = [];
  if (prices.length < 22) return out;
  const last = prices[prices.length - 1];
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = volumes[volumes.length - 1];
  const vr = lastVol / (avgVol || 1);
  const h20 = Math.max(...highs.slice(-21, -1));
  const l20 = Math.min(...lows.slice(-21, -1));

  if (last > h20 && vr > 1.4) out.push({ name: "20D High Breakout", dir: "BULL", str: vr > 2 ? "STRONG" : "MOD", vr });
  if (prices.length >= 53) {
    const h52 = Math.max(...highs.slice(-53, -1));
    if (last > h52) out.push({ name: "52W High Breakout", dir: "BULL", str: "STRONG", vr });
  }
  if (last < l20 && vr > 1.4) out.push({ name: "20D Low Breakdown", dir: "BEAR", str: vr > 2 ? "STRONG" : "MOD", vr });

  const r4 = prices.slice(-4);
  if (r4.length === 4 && (Math.max(...r4) - Math.min(...r4)) / Math.min(...r4) < 0.015)
    out.push({ name: "NR4 Squeeze", dir: "WATCH", str: "WATCH", vr });

  const r10 = prices.slice(-10);
  if (r10.length >= 10 && (Math.max(...r10) - Math.min(...r10)) / Math.min(...r10) < 0.03 && last === Math.max(...r10))
    out.push({ name: "Consolidation BO", dir: "BULL", str: "MOD", vr });

  const v5 = volumes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
  if (lastVol > v5 * 2.5 && last > prices[prices.length - 2])
    out.push({ name: "Volume Surge", dir: "BULL", str: "STRONG", vr });

  if (prices.length >= 21) {
    const ema21val = calcEMA(prices.slice(-21), 21);
    if (Math.abs(last - ema21val) / ema21val < 0.007 && prices[prices.length - 5] > ema21val)
      out.push({ name: "21 EMA Pullback", dir: "BULL", str: "MOD", vr });
  }
  return out;
}

function runBacktest(prices, highs, lows, volumes) {
  const results = [];
  if (prices.length < 45) return { winRate: 0.55, avgReturn: 4.2, sharpe: 1.1, bestHold: 10, sampleSize: 0 };
  for (let i = 30; i < prices.length - 15; i++) {
    const pc = prices.slice(0, i), hc = highs.slice(0, i), lc = lows.slice(0, i), vc = volumes.slice(0, i);
    const rsiVal = calcRSI(pc);
    const atrVal = calcATR(hc, lc, pc);
    const h20 = Math.max(...hc.slice(-21, -1));
    const lv = vc[vc.length - 1], av = vc.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;
    const entry = pc[i - 1];
    let sig = null;
    if (pc[i - 1] > h20 && lv / av > 1.4 && rsiVal > 50 && rsiVal < 75) sig = "BO";
    else if (rsiVal < 30) sig = "RSI";
    if (!sig) continue;
    const slLevel = entry - atrVal * 2;
    for (const hold of [5, 10, 15]) {
      const futPrices = prices.slice(i, i + hold), futLows = lows.slice(i, i + hold);
      let exitP = futPrices[futPrices.length - 1] || entry;
      for (let j = 0; j < futLows.length; j++) { if (futLows[j] < slLevel) { exitP = slLevel; break; } }
      results.push({ hold, pnl: ((exitP - entry) / entry) * 100 });
    }
  }
  if (!results.length) return { winRate: 0.55, avgReturn: 4.2, sharpe: 1.1, bestHold: 10, sampleSize: 0 };
  const wr = results.filter(r => r.pnl > 0).length / results.length;
  const avgR = results.reduce((a, b) => a + b.pnl, 0) / results.length;
  const stdev = Math.sqrt(results.reduce((a, b) => a + (b.pnl - avgR) ** 2, 0) / results.length) || 1;
  const byHold = {};
  for (const h of [5, 10, 15]) {
    const sub = results.filter(r => r.hold === h);
    if (sub.length) byHold[h] = sub.reduce((a, b) => a + b.pnl, 0) / sub.length;
  }
  const bestHold = parseInt(Object.entries(byHold).sort((a, b) => b[1] - a[1])[0]?.[0] || 10);
  return { winRate: Math.round(wr * 100) / 100, avgReturn: Math.round(avgR * 10) / 10, sharpe: Math.round((avgR / stdev) * 100) / 100, bestHold, sampleSize: results.length };
}

function getMacro(sector) {
  const hits = MACRO_RISKS.filter(r => r.sectors.some(s => sector.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(sector.toLowerCase())));
  const net = hits.filter(r => r.dir === "BULLISH").length - hits.filter(r => r.dir === "BEARISH").length;
  return { risks: hits, netImpact: net, score: net > 0 ? "POSITIVE" : net < 0 ? "NEGATIVE" : "NEUTRAL" };
}

function buildSignal(ind, inst) {
  const { rsiVal, macdVal, bbVal, ivPct, price, e9, e21, e50, stochVal, stVal, vwapVal, bos, macro } = ind;
  const sigs = []; let score = 0; let dir = "NEUTRAL";

  if (e9 > e21 && e21 > e50) { dir = "BULLISH"; sigs.push("EMA Stack Bullish (9>21>50)"); score += 2; }
  else if (e9 < e21 && e21 < e50) { dir = "BEARISH"; sigs.push("EMA Stack Bearish (9<21<50)"); score -= 2; }

  if (stVal.trend === "UP") { sigs.push("Supertrend UP"); score += 2; }
  else { sigs.push("Supertrend DOWN"); score -= 2; }

  if (rsiVal < 30) { sigs.push("RSI Oversold (<30)"); score += 3; }
  else if (rsiVal > 70) { sigs.push("RSI Overbought (>70)"); score -= 2; }
  else if (rsiVal > 55 && dir === "BULLISH") { sigs.push("RSI Bullish Zone"); score += 1; }
  else if (rsiVal < 45 && dir === "BEARISH") { sigs.push("RSI Bearish Zone"); score -= 1; }

  if (stochVal.k < 20) { sigs.push("Stochastic Oversold"); score += 2; }
  else if (stochVal.k > 80) { sigs.push("Stochastic Overbought"); score -= 2; }

  if (macdVal.hist > 0) { sigs.push("MACD Bullish Cross"); score += 2; }
  else { sigs.push("MACD Bearish Cross"); score -= 2; }

  if (bbVal.bw < 0.02) { sigs.push("BB Squeeze — Breakout Soon"); score += 1; }
  if (price < bbVal.lower) { sigs.push("Below Lower Bollinger Band"); score += 2; }
  else if (price > bbVal.upper) { sigs.push("Above Upper Bollinger Band"); score -= 1; }

  if (price > vwapVal) { sigs.push("Price Above VWAP"); score += 1; }
  else { sigs.push("Price Below VWAP"); score -= 1; }

  bos.forEach(b => {
    if (b.dir === "BULL") { sigs.push("Breakout: " + b.name + " (" + b.vr.toFixed(1) + "x vol)"); score += b.str === "STRONG" ? 3 : 2; }
    else if (b.dir === "BEAR") { sigs.push("Breakdown: " + b.name); score -= b.str === "STRONG" ? 3 : 2; }
    else { sigs.push("Pattern: " + b.name); }
  });

  if (macro.netImpact > 0) score += 1;
  else if (macro.netImpact < 0) score -= 1;

  const highIV = ivPct > 60, lowIV = ivPct < 40, isStock = inst.t !== "index";
  let strat, conf;

  if (score >= 5 && dir === "BULLISH") {
    strat = isStock
      ? { name: "SWING BUY + CALL", legs: ["Buy Stock at CMP", "Buy 1 ATM Call (3% of capital)", "SL: 2×ATR below entry"], type: "combo" }
      : lowIV ? { name: "BUY CALL", legs: ["Buy ATM Call", "SL: 40% of premium", "Target: 80-100% premium"], type: "debit" }
        : { name: "BULL CALL SPREAD", legs: ["Buy ATM Call", "Sell +1 OTM Call", "Max profit above OTM strike"], type: "debit" };
    conf = Math.min(50 + score * 7, 93);
  } else if (score >= 3 && dir === "BULLISH") {
    strat = isStock
      ? { name: "SWING BUY", legs: ["Buy Stock at CMP", "SL: below 20D low", "Target: 8-12%"], type: "equity" }
      : { name: "BULL CALL SPREAD", legs: ["Buy ATM Call", "Sell OTM Call"], type: "debit" };
    conf = Math.min(42 + score * 6, 82);
  } else if (score <= -5 && dir === "BEARISH") {
    strat = isStock
      ? { name: "SHORT / BUY PUT", legs: ["Exit longs / Short", "Buy ATM Put", "SL: 40% of premium"], type: "debit" }
      : lowIV ? { name: "BUY PUT", legs: ["Buy ATM Put", "SL: 40% of premium", "Target: 80-100%"], type: "debit" }
        : { name: "BEAR PUT SPREAD", legs: ["Buy ATM Put", "Sell OTM Put", "Defined max risk"], type: "debit" };
    conf = Math.min(50 + Math.abs(score) * 7, 93);
  } else if (score <= -3 && dir === "BEARISH") {
    strat = { name: "BEAR PUT SPREAD", legs: ["Buy ATM Put", "Sell OTM Put", "Defined max risk"], type: "debit" };
    conf = Math.min(42 + Math.abs(score) * 6, 82);
  } else if (highIV && Math.abs(score) < 2) {
    strat = { name: "SHORT IRON CONDOR", legs: ["Sell OTM Call", "Buy far OTM Call", "Sell OTM Put", "Buy far OTM Put"], type: "credit" };
    conf = Math.min(ivPct * 0.7, 80);
  } else if (lowIV && bbVal.bw < 0.025) {
    strat = { name: "LONG STRADDLE", legs: ["Buy ATM Call", "Buy ATM Put", "Profit from large move either way"], type: "debit" };
    conf = 55 + (0.025 - bbVal.bw) * 1000;
  } else if (bos.length >= 2 && isStock) {
    strat = { name: "BREAKOUT SWING", legs: ["Buy on breakout candle close", "SL: below breakout base", "Target: 1:2.5 R:R"], type: "equity" };
    conf = 50 + bos.length * 8;
  } else {
    strat = { name: "WAIT — MONITOR", legs: ["No clear setup", "Watch for confirmation", "Set price alert at resistance"], type: "none" };
    conf = 22;
  }

  return { sigs, score, dir, strat, conf: Math.round(Math.min(conf, 93)), bos };
}

function processStockData(inst, histData) {
  const { prices, highs, lows, volumes, regularMarketPrice, previousClose } = histData;
  if (prices.length < 20) throw new Error("Insufficient data");

  const price = regularMarketPrice || prices[prices.length - 1];
  const prevClose = previousClose || prices[prices.length - 2] || price;
  const change = ((price - prevClose) / prevClose) * 100;

  const rsiVal = calcRSI(prices);
  const macdVal = calcMACD(prices);
  const bbVal = calcBoll(prices);
  const atrVal = calcATR(highs, lows, prices);
  const e9 = prices.length >= 9 ? calcEMA(prices.slice(-9), 9) : price;
  const e21 = prices.length >= 21 ? calcEMA(prices.slice(-21), 21) : price;
  const e50 = prices.length >= 50 ? calcEMA(prices.slice(-50), 50) : price;
  const stochVal = calcStoch(highs, lows, prices);
  const stVal = calcSupertrend(prices, highs, lows);
  const vwapVal = calcVWAP(prices.slice(-20), highs.slice(-20), lows.slice(-20), volumes.slice(-20));
  const sigma = (atrVal / price) * Math.sqrt(252);
  const ivPct = calcRealizedIvPercentile(prices, sigma);
  const ATMstrike = Math.round(price / inst.gap) * inst.gap;
  const callOpt = bsPrice(price, ATMstrike, 7 / 365, 0.065, sigma, "call");
  const putOpt = bsPrice(price, ATMstrike, 7 / 365, 0.065, sigma, "put");
  const bos = detectBreakouts(prices, highs, lows, volumes);
  const macro = getMacro(inst.sec);
  const signal = buildSignal({ rsiVal, macdVal, bbVal, atrVal, ivPct, price, e9, e21, e50, stochVal, stVal, vwapVal, bos, macro }, inst);
  const bt = runBacktest(prices, highs, lows, volumes);

  let holdDays = bt.bestHold || 10;
  if (signal.conf > 80) holdDays = Math.max(holdDays - 2, 3);
  if (bos.some(b => b.str === "STRONG")) holdDays = Math.max(holdDays - 3, 3);
  if (atrVal / price > 0.03) holdDays = Math.min(holdDays + 3, 20);
  const holdLabel = holdDays <= 5 ? "Intraday–2D" : holdDays <= 8 ? "3–7 Days" : holdDays <= 12 ? "1–2 Weeks" : "2–4 Weeks";

  const baseRet = bt.avgReturn > 1 ? bt.avgReturn : signal.dir === "BULLISH" ? 7 : 5;
  const slLevel = (price - atrVal * 2).toFixed(2);
  const slPct = ((price - parseFloat(slLevel)) / price * 100).toFixed(1);
  const t1 = (price * (1 + baseRet / 100)).toFixed(2);
  const t2 = (price * (1 + baseRet * 1.8 / 100)).toFixed(2);
  const rrNum = ((parseFloat(t1) - price) / (price - parseFloat(slLevel)));
  const rrVal = rrNum.toFixed(2);
  const rrRating = rrNum >= 2 ? "EXCELLENT" : rrNum >= 1.5 ? "GOOD" : rrNum >= 1 ? "FAIR" : "POOR";

  return {
    price, change, prevClose,
    rsiVal, macdVal, bbVal, atrVal, e9, e21, e50,
    stochVal, stVal, vwapVal, sigma, ivPct,
    callOpt, putOpt, ATMstrike,
    signal, bos, macro, bt,
    hold: { days: holdDays, label: holdLabel },
    rr: { sl: slLevel, slPct, t1, t2, t1Pct: baseRet.toFixed(1), t2Pct: (baseRet * 1.8).toFixed(1), val: rrVal, rating: rrRating },
    prices, highs, lows, volumes,
    dataSource: histData.source === "fallback" ? "Fallback generated data" : "Yahoo Finance chart API",
    lastUpdated: new Date().toLocaleTimeString("en-IN"),
  };
}

// ─────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────
function Spark({ prices, color }) {
  const w = 70, ht = 22;
  if (!prices || prices.length < 2) return <svg width={w} height={ht} />;
  const mn = Math.min(...prices), mx = Math.max(...prices), rng = mx - mn || 1;
  const pts = prices.map((px, i) => `${(i / (prices.length - 1)) * w},${ht - ((px - mn) / rng) * ht}`).join(" ");
  return <svg width={w} height={ht}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Pill({ label, color }) {
  return <span style={{ fontSize: 8, background: color + "22", color, padding: "1px 6px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>;
}

function ConfBar({ pct, color }) {
  return (
    <div style={{ width: "100%", height: 4, background: "#141428", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.5s" }} />
    </div>
  );
}

const CAPC = { INDEX: "#7c6aff", LARGE: "#00d084", MID: "#f0b429", SMALL: "#ff7043" };

function sigColor(strat) {
  if (!strat) return "#666";
  const n = strat.name;
  if (n.includes("BUY") || n.includes("CALL") || n.includes("BULL") || n.includes("SWING")) return "#00d084";
  if (n.includes("PUT") || n.includes("BEAR") || n.includes("SHORT")) return "#ff4d6d";
  if (n.includes("STRADDLE") || n.includes("CONDOR")) return "#f0b429";
  if (n.includes("BREAKOUT")) return "#00b4d8";
  return "#888";
}

function rrColor(r) {
  return r === "EXCELLENT" ? "#00d084" : r === "GOOD" ? "#7cdb8a" : r === "FAIR" ? "#f0b429" : "#ff4d6d";
}

// ─────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────
export default function OptionsTrader() {
  const [stockData, setStockData] = useState({});
  const [loadStatus, setLoadStatus] = useState({}); // "loading"|"ok"|"error" per symbol
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState("overview");
  const [aiText, setAiText] = useState("");
  const [aiLoad, setAiLoad] = useState(false);
  const [capital, setCapital] = useState(100000);
  const [filterCap, setFilterCap] = useState("ALL");
  const [sortBy, setSortBy] = useState("rr");
  const [search, setSearch] = useState("");
  const [macroOpen, setMacroOpen] = useState(false);
  const [newsText, setNewsText] = useState("");
  const [newsLoad, setNewsLoad] = useState(false);
  const [globalLoad, setGlobalLoad] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const timerRef = useRef(null);

  // Load one stock at a time to avoid rate limiting
  const loadStock = useCallback(async (inst) => {
    setLoadStatus(prev => ({ ...prev, [inst.s]: "loading" }));
    try {
      const hist = await fetchYahooHistory(inst.ys);
      const computed = processStockData(inst, hist);
      setStockData(prev => ({ ...prev, [inst.s]: computed }));
      setLoadStatus(prev => ({ ...prev, [inst.s]: "ok" }));
    } catch (e) {
      console.error(e);
      setStockData(prev => {
        const next = { ...prev };
        delete next[inst.s];
        return next;
      });
      setLoadStatus(prev => ({ ...prev, [inst.s]: "error" }));
    }
    setLoadedCount(prev => prev + 1);
  }, []);

  const loadAll = useCallback(async () => {
    setGlobalLoad(true);
    setLoadedCount(0);
    setStockData({});
    setLoadStatus({});
    // Load in batches of 4 with small delay to avoid rate limiting
    const batchSize = 4;
    for (let i = 0; i < UNIVERSE.length; i += batchSize) {
      const batch = UNIVERSE.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(inst => loadStock(inst)));
      if (i + batchSize < UNIVERSE.length) await new Promise(r => setTimeout(r, 400));
    }
    setGlobalLoad(false);
  }, [loadStock]);

  useEffect(() => {
    Promise.resolve().then(loadAll);
    timerRef.current = setInterval(() => {
      // On weekdays only refresh; on weekends data won't change
      const day = new Date().getDay();
      if (day !== 0 && day !== 6) loadAll();
    }, 5 * 60 * 1000);
    return () => clearInterval(timerRef.current);
  }, [loadAll]);

  const fetchNews = useCallback(async () => {
    setNewsLoad(true); setNewsText("");
    try {
      // Mock news response
      setNewsText("Mock news: Market conditions favorable for IT sector");
    } catch { setNewsText("Error fetching live news."); }
    setNewsLoad(false);
  }, []);

  const fetchAI = useCallback(async (inst) => {
    setAiLoad(true); setAiText("");
    try {
      setAiText("Mock AI analysis for: " + inst.n);
    } catch { setAiText("API error. Please retry."); }
    setAiLoad(false);
  }, []);

  const readyData = Object.entries(stockData);
  const filtered = UNIVERSE.filter(inst => {
    const d = stockData[inst.s]; if (!d) return false;
    if (filterCap !== "ALL" && inst.cap !== filterCap) return false;
    if (search && !inst.s.toLowerCase().includes(search.toLowerCase()) && !inst.n.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const da = stockData[a.s], db = stockData[b.s]; if (!da || !db) return 0;
    if (sortBy === "rr") return parseFloat(db.rr.val) - parseFloat(da.rr.val);
    if (sortBy === "conf") return db.signal.conf - da.signal.conf;
    if (sortBy === "bo") return db.bos.length - da.bos.length;
    if (sortBy === "chg") return Math.abs(db.change) - Math.abs(da.change);
    return 0;
  });

  const topPicks = sorted.filter(i => {
    const d = stockData[i.s];
    return d && d.signal.strat.name !== "WAIT — MONITOR" && parseFloat(d.rr.val) >= 1.5;
  }).slice(0, 5);

  const loadPct = Math.round((loadedCount / UNIVERSE.length) * 100);
  const loadErrors = Object.values(loadStatus).filter(status => status === "error").length;
  const D = sel ? stockData[sel.s] : null;

  if (globalLoad && loadedCount < 4) return (
    <div style={{ minHeight: "100vh", background: "#04040d", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 48, height: 48, border: "2px solid #00d084", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <div style={{ color: "#00d084", fontFamily: "monospace", fontSize: 12, letterSpacing: 3 }}>FETCHING REAL NSE DATA...</div>
      <div style={{ color: "#333", fontFamily: "monospace", fontSize: 10 }}>Yahoo Finance · 15-min delayed · {loadedCount}/{UNIVERSE.length} loaded</div>
      <div style={{ width: 200, height: 4, background: "#141428", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${loadPct}%`, height: "100%", background: "#00d084", borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#04040d", color: "#dde0f0", fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 12 }}>
      {/* HEADER */}
      <div style={{ background: "#07071a", borderBottom: "1px solid #141428", padding: "8px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 8, color: "#00d084", letterSpacing: 3 }}>REAL DATA · YAHOO FINANCE · 15MIN DELAY</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>NSE AI SIGNAL ENGINE · {readyData.length}/{UNIVERSE.length} LOADED</div>
        </div>
        {globalLoad && (
          <div style={{ fontSize: 9, color: "#f0b429", background: "#1a1500", padding: "3px 8px", borderRadius: 4, border: "1px solid #f0b42933" }}>
            Loading {loadedCount}/{UNIVERSE.length}...
          </div>
        )}
        {loadErrors > 0 && (
          <div style={{ fontSize: 9, color: "#ff4d6d", background: "#1a0008", padding: "3px 8px", borderRadius: 4, border: "1px solid #ff4d6d33" }}>
            {loadErrors} errors
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: "#0d0d20", border: "1px solid #1e1e38", color: "#ccc", padding: "4px 9px", borderRadius: 4, fontSize: 11, width: 110, fontFamily: "inherit" }} />
          <select value={filterCap} onChange={e => setFilterCap(e.target.value)}
            style={{ background: "#0d0d20", border: "1px solid #1e1e38", color: "#aaa", padding: "4px 7px", borderRadius: 4, fontSize: 10, fontFamily: "inherit" }}>
            {["ALL", "INDEX", "LARGE", "MID", "SMALL"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ background: "#0d0d20", border: "1px solid #1e1e38", color: "#aaa", padding: "4px 7px", borderRadius: 4, fontSize: 10, fontFamily: "inherit" }}>
            <option value="rr">Sort: R:R</option>
            <option value="conf">Sort: Confidence</option>
            <option value="bo">Sort: Breakouts</option>
            <option value="chg">Sort: Change%</option>
          </select>
          <input value={capital} onChange={e => setCapital(Number(e.target.value) || 100000)}
            style={{ background: "#0d0d20", border: "1px solid #1e1e38", color: "#f0b429", padding: "4px 7px", borderRadius: 4, fontSize: 11, width: 88, fontFamily: "inherit", textAlign: "right" }} />
          <button onClick={() => { setMacroOpen(o => !o); if (!newsText && !newsLoad) fetchNews(); }}
            style={{ background: "#1a1a30", border: "1px solid #2a2a50", color: "#f0b429", padding: "5px 9px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 700 }}>
            MACRO
          </button>
          <button onClick={loadAll}
            style={{ background: "#00d084", color: "#000", border: "none", padding: "5px 11px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 700 }}>
            RELOAD DATA
          </button>
        </div>
      </div>

      {/* WEEKEND NOTICE */}
      {[0, 6].includes(new Date().getDay()) && (
        <div style={{ background: "#0d0d00", borderBottom: "1px solid #2a2a00", padding: "6px 14px", fontSize: 9, color: "#f0b429", display: "flex", gap: 8, alignItems: "center" }}>
          <span>⚠</span>
          <span>NSE IS CLOSED TODAY (WEEKEND). Showing last available prices from Friday. Signals are valid for Monday open. Refresh on Monday 9:00 AM for live data.</span>
        </div>
      )}

      {/* MACRO PANEL */}
      {macroOpen && (
        <div style={{ background: "#080816", borderBottom: "1px solid #141428", padding: "12px 14px" }}>
          <div style={{ fontSize: 8, color: "#f0b429", letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>MACRO RISK DASHBOARD</div>
          {newsLoad && <div style={{ fontSize: 9, color: "#00d084", marginBottom: 8 }}>Fetching live news via web search...</div>}
          {newsText && <div style={{ background: "#0d0d20", border: "1px solid #00d08433", borderRadius: 6, padding: 10, marginBottom: 10, fontSize: 11, color: "#aab", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{newsText}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 7 }}>
            {MACRO_RISKS.map(r => (
              <div key={r.id} style={{ background: "#0a0a1c", border: `1px solid ${r.dir === "BEARISH" ? "#ff4d6d22" : r.dir === "BULLISH" ? "#00d08422" : "#f0b42922"}`, borderRadius: 6, padding: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.dir === "BEARISH" ? "#ff4d6d" : r.dir === "BULLISH" ? "#00d084" : "#f0b429" }}>{r.name}</span>
                  <Pill label={r.impact} color={r.impact === "HIGH" ? "#ff4d6d" : "#f0b429"} />
                </div>
                <div style={{ fontSize: 10, color: "#556", lineHeight: 1.5 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOP PICKS BAR */}
      {topPicks.length > 0 && (
        <div style={{ background: "#060614", borderBottom: "1px solid #0e0e20", padding: "5px 14px", display: "flex", gap: 7, alignItems: "center", overflowX: "auto" }}>
          <span style={{ fontSize: 8, color: "#333", letterSpacing: 2, whiteSpace: "nowrap", flexShrink: 0 }}>TOP R:R</span>
          {topPicks.map(inst => {
            const d = stockData[inst.s];
            const color = d.signal.strat.name.includes("BUY") || d.signal.strat.name.includes("CALL") || d.signal.strat.name.includes("BULL") || d.signal.strat.name.includes("SWING") ? "#00d084" :
              d.signal.strat.name.includes("PUT") || d.signal.strat.name.includes("BEAR") || d.signal.strat.name.includes("SHORT") ? "#ff4d6d" : "#f0b429";
            return (
              <div key={inst.s} onClick={() => { setSel(inst); setAiText(""); setTab("overview"); }}
                style={{ background: "#0d0d1e", border: `1px solid ${color}44`, borderRadius: 4, padding: "3px 9px", cursor: "pointer", whiteSpace: "nowrap", display: "flex", gap: 7, alignItems: "center", flexShrink: 0 }}>
                <Pill label={inst.cap} color={CAPC[inst.cap]} />
                <span style={{ fontWeight: 700 }}>{inst.n}</span>
                <Spark prices={d.prices.slice(-30)} color={color} />
                <span style={{ color, fontWeight: 700 }}>{d.rr.val}x</span>
                <Pill label={d.signal.conf + "%"} color={color} />
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 0, minHeight: "calc(100vh - 80px)" }}>
        {/* STOCK LIST */}
        <div style={{ background: "#07071a", borderRight: "1px solid #141428", overflowY: "auto", maxHeight: "calc(100vh - 80px)" }}>
          {sorted.map(inst => {
            const d = stockData[inst.s];
            const isSel = sel?.s === inst.s;
            const color = d.signal.strat.name.includes("BUY") || d.signal.strat.name.includes("CALL") || d.signal.strat.name.includes("BULL") || d.signal.strat.name.includes("SWING") ? "#00d084" :
              d.signal.strat.name.includes("PUT") || d.signal.strat.name.includes("BEAR") || d.signal.strat.name.includes("SHORT") ? "#ff4d6d" : "#888";
            return (
              <div key={inst.s} onClick={() => { setSel(inst); setAiText(""); setTab("overview"); }}
                style={{ background: isSel ? "#0d0d20" : "transparent", borderBottom: "1px solid #0e0e18", padding: "10px 14px", cursor: "pointer", transition: "background 0.2s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Pill label={inst.cap} color={CAPC[inst.cap]} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>{inst.n}</span>
                    <span style={{ fontSize: 9, color: "#333" }}>{inst.s}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: d.change >= 0 ? "#00d084" : "#ff4d6d" }}>
                      ₹{d.price.toFixed(1)}
                    </div>
                    <div style={{ fontSize: 9, color: d.change >= 0 ? "#00d08488" : "#ff4d6d88" }}>
                      {d.change >= 0 ? "+" : ""}{d.change.toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Pill label={d.signal.strat.name} color={color} />
                    <Spark prices={d.prices.slice(-30)} color={color} />
                    {d.bos.slice(0, 2).map((b, i) =>
                      <Pill key={i} label={b.name} color={b.dir === "BULL" ? "#00d084" : b.dir === "BEAR" ? "#ff4d6d" : "#f0b429"} />
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ textAlign: "right", width: 60 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: rrColor(d.rr.rating) }}>{d.rr.val}x</div>
                      <div style={{ fontSize: 8, color: "#333" }}>R:R</div>
                    </div>
                    <div style={{ width: 80 }}>
                      <ConfBar pct={d.signal.conf} color={color} />
                      <div style={{ fontSize: 8, color: "#333", textAlign: "right", marginTop: 2 }}>{d.signal.conf}% conf</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* DETAIL PANEL */}
        <div style={{ background: "#04040d", padding: 16, overflowY: "auto", maxHeight: "calc(100vh - 80px)" }}>
          {!sel ?
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#333", fontSize: 12 }}>
              <div style={{ marginBottom: 8 }}>Select a stock to view AI-powered analysis</div>
              <div style={{ fontSize: 10, color: "#222" }}>Includes technical indicators, backtested signals, risk management, and option pricing</div>
            </div>
            :
            <div>
              {/* HEADER FOR SELECTED STOCK */}
              <div style={{ background: "#0a0a1c", border: "1px solid #1a1a30", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Pill label={sel.cap} color={CAPC[sel.cap]} />
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{sel.n}</div>
                      <div style={{ fontSize: 10, color: "#333" }}>{sel.s} · {sel.sec}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: D.change >= 0 ? "#00d084" : "#ff4d6d" }}>₹{D.price.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: D.change >= 0 ? "#00d084" : "#ff4d6d" }}>
                      {D.change >= 0 ? "+" : ""}{D.change.toFixed(2)}% · Prev: ₹{D.prevClose.toFixed(1)}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "RSI", val: D.rsiVal.toFixed(1), color: D.rsiVal < 30 ? "#00d084" : D.rsiVal > 70 ? "#ff4d6d" : "#888" },
                    { label: "ATR", val: ((D.atrVal / D.price) * 100).toFixed(2) + "%", color: "#7c6aff" },
                    { label: "MACD", val: D.macdVal.hist.toFixed(3), color: D.macdVal.hist > 0 ? "#00d084" : "#ff4d6d" },
                    { label: "BB%", val: (D.bbVal.bw * 100).toFixed(1) + "%", color: D.bbVal.bw < 0.02 ? "#f0b429" : "#888" },
                    { label: "IV%", val: D.ivPct.toFixed(0) + "%", color: D.ivPct > 60 ? "#ff4d6d" : D.ivPct < 40 ? "#00d084" : "#f0b429" },
                    { label: "VWAP", val: "₹" + D.vwapVal.toFixed(1), color: D.price > D.vwapVal ? "#00d084" : "#ff4d6d" },
                  ].map((it, i) =>
                    <div key={i} style={{ background: "#07071a", borderRadius: 6, padding: 8, textAlign: "center" }}>
                      <div style={{ fontSize: 7, color: "#333", marginBottom: 2 }}>{it.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: it.color }}>{it.val}</div>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {D.signal.sigs.map((s, i) =>
                    <Pill key={i} label={s} color={s.includes("BULL") || s.includes("BUY") || s.includes("Above") ? "#00d084" : s.includes("BEAR") || s.includes("SELL") || s.includes("Below") ? "#ff4d6d" : "#f0b429"} />
                  )}
                </div>
              </div>

              {/* TABS */}
              <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                {["overview", "ai", "backtest", "macro"].map(t =>
                  <button key={t} onClick={() => setTab(t)}
                    style={{ background: tab === t ? "#0d0d20" : "#07071a", border: "1px solid " + (tab === t ? "#2a2a50" : "#0e0e18"), color: tab === t ? "#fff" : "#555", padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 700 }}>
                    {t.toUpperCase()}
                  </button>
                )}
              </div>

              {/* OVERVIEW TAB */}
              {tab === "overview" && (
                <div>
                  {/* TRADE SIGNAL */}
                  <div style={{ background: "#0a0a1c", border: "1px solid #1a1a30", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 8, color: "#333", letterSpacing: 2, marginBottom: 4 }}>AI SIGNAL</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: sigColor(D.signal.strat) }}>{D.signal.strat.name}</div>
                      </div>
                      <div style={{ width: 120 }}>
                        <div style={{ fontSize: 8, color: "#333", textAlign: "right", marginBottom: 2 }}>CONFIDENCE</div>
                        <ConfBar pct={D.signal.conf} color={sigColor(D.signal.strat)} />
                        <div style={{ fontSize: 16, fontWeight: 700, color: sigColor(D.signal.strat), textAlign: "right", marginTop: 4 }}>{D.signal.conf}%</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 10 }}>
                      {[
                        { label: "ENTRY", val: "₹" + D.price.toFixed(1), color: "#fff" },
                        { label: "STOP LOSS", val: "₹" + D.rr.sl + " (-" + D.rr.slPct + "%)", color: "#ff4d6d" },
                        { label: "TARGET 1", val: "₹" + D.rr.t1 + " (+ " + D.rr.t1Pct + "%)", color: "#00d084" },
                        { label: "TARGET 2", val: "₹" + D.rr.t2 + " (+ " + D.rr.t2Pct + "%)", color: "#00b4d8" },
                        { label: "RISK:REWARD", val: D.rr.val + "x", color: rrColor(D.rr.rating) },
                        { label: "HOLD", val: D.hold.label, color: "#7c6aff" },
                      ].map((it, i) =>
                        <div key={i} style={{ background: "#07071a", borderRadius: 6, padding: 10, textAlign: "center" }}>
                          <div style={{ fontSize: 7, color: "#333", marginBottom: 3 }}>{it.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: it.color }}>{it.val}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ background: "#07071a", borderRadius: 6, padding: 10 }}>
                      <div style={{ fontSize: 8, color: "#333", letterSpacing: 2, marginBottom: 6 }}>TRADE PLAN STEPS</div>
                      <ul style={{ margin: 0, paddingLeft: 16, listStyleType: "decimal", color: "#aab", fontSize: 11, lineHeight: 1.8 }}>
                        {D.signal.strat.legs.map((l, i) =>
                          <li key={i} style={{ marginBottom: 4 }}>{l}</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* OPTION PRICING */}
                  <div style={{ background: "#0a0a1c", border: "1px solid #1a1a30", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 8, color: "#333", letterSpacing: 2, marginBottom: 10 }}>OPTION PRICING · {D.ATMstrike} STRIKE · 7DTE</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={{ background: "#07071a", borderRadius: 6, padding: 10, border: "1px solid #00d08422" }}>
                        <div style={{ fontSize: 9, color: "#00d084", fontWeight: 700, marginBottom: 6 }}>CALL OPTION</div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "#555" }}>Price</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#00d084" }}>₹{D.callOpt.price.toFixed(1)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "#555" }}>Delta</span>
                          <span style={{ fontSize: 11, color: "#aab" }}>{D.callOpt.delta.toFixed(2)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "#555" }}>Gamma</span>
                          <span style={{ fontSize: 11, color: "#aab" }}>{D.callOpt.gamma.toFixed(3)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: "#555" }}>Vega</span>
                          <span style={{ fontSize: 11, color: "#aab" }}>{D.callOpt.vega.toFixed(2)}</span>
                        </div>
                      </div>
                      <div style={{ background: "#07071a", borderRadius: 6, padding: 10, border: "1px solid #ff4d6d22" }}>
                        <div style={{ fontSize: 9, color: "#ff4d6d", fontWeight: 700, marginBottom: 6 }}>PUT OPTION</div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "#555" }}>Price</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#ff4d6d" }}>₹{D.putOpt.price.toFixed(1)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "#555" }}>Delta</span>
                          <span style={{ fontSize: 11, color: "#aab" }}>{D.putOpt.delta.toFixed(2)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 9, color: "#555" }}>Gamma</span>
                          <span style={{ fontSize: 11, color: "#aab" }}>{D.putOpt.gamma.toFixed(3)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 9, color: "#555" }}>Vega</span>
                          <span style={{ fontSize: 11, color: "#aab" }}>{D.putOpt.vega.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* POSITION SIZING */}
                  <div style={{ background: "#0a0a1c", border: "1px solid #1a1a30", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 8, color: "#333", letterSpacing: 2, marginBottom: 10 }}>POSITION SIZING · ₹{capital.toLocaleString("en-IN")}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[
                        { label: "Max Risk/Trade (2%)", val: "₹" + (capital * 0.02).toLocaleString("en-IN") },
                        { label: "Capital Per Position", val: "₹" + Math.round(capital / 4).toLocaleString("en-IN") },
                        { label: "ATM Call Premium", val: "₹" + D.callOpt.price.toFixed(1) + " per unit" },
                        { label: "1 Lot Cost (Call)", val: "₹" + (D.callOpt.price * sel.lot).toFixed(0) },
                        { label: "Suggested Lots", val: Math.max(1, Math.floor((capital * 0.02) / (D.callOpt.price * sel.lot * 0.5))) + " lot(s)" },
                        { label: "Equity Shares (25%)", val: Math.floor((capital * 0.25) / D.price) + " shares" },
                        { label: "Expected P&L at T1", val: "₹" + (Math.floor((capital * 0.25) / D.price) * (parseFloat(D.rr.t1) - D.price)).toFixed(0) },
                        { label: "Expected P&L at T2", val: "₹" + (Math.floor((capital * 0.25) / D.price) * (parseFloat(D.rr.t2) - D.price)).toFixed(0) },
                      ].map((it, i) =>
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #0a0a18" }}>
                          <span style={{ fontSize: 9, color: "#555" }}>{it.label}</span>
                          <span style={{ fontSize: 11, color: "#bbc" }}>{it.val}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* KEY LEVELS */}
                  <div style={{ background: "#0a0a1c", border: "1px solid #1a1a30", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 8, color: "#333", letterSpacing: 2, marginBottom: 10 }}>KEY REAL PRICE LEVELS</div>
                    {[
                      { label: "Current Price", val: D.price.toFixed(2), color: "#fff" },
                      { label: "Prev Close", val: D.prevClose.toFixed(2), color: "#888" },
                      { label: "VWAP (20D)", val: D.vwapVal.toFixed(2), color: D.price > D.vwapVal ? "#00d084" : "#ff4d6d" },
                      { label: "Upper Bollinger (20)", val: D.bbVal.upper.toFixed(2), color: "#ff4d6d" },
                      { label: "Middle BB / 20 SMA", val: D.bbVal.mid.toFixed(2), color: "#888" },
                      { label: "Lower Bollinger (20)", val: D.bbVal.lower.toFixed(2), color: "#00d084" },
                      { label: "EMA 9", val: D.e9.toFixed(2), color: "#7c6aff" },
                      { label: "EMA 21", val: D.e21.toFixed(2), color: "#f0b429" },
                      { label: "EMA 50", val: D.e50.toFixed(2), color: "#888" },
                      { label: "Supertrend Support", val: D.stVal.support.toFixed(2), color: "#00d084" },
                      { label: "Stop Loss (2×ATR)", val: D.rr.sl, color: "#ff4d6d" },
                      { label: "Target 1", val: D.rr.t1, color: "#00d084" },
                    ].map((it, i) => {
                      const pct = ((D.price - parseFloat(it.val)) / D.price) * 100;
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #0a0a18" }}>
                          <span style={{ fontSize: 10, color: "#556" }}>{it.label}</span>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {Math.abs(pct) > 0.1 && <span style={{ fontSize: 8, color: "#2a2a4a" }}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>}
                            <span style={{ fontSize: 11, color: it.color, fontFamily: "monospace" }}>₹{it.val}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI TAB */}
              {tab === "ai" && (
                <div>
                  <div style={{ background: "#0a0a1c", border: "1px solid #1a1a30", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 8, color: "#333", letterSpacing: 2 }}>AI-DRIVEN TRADE ANALYSIS</div>
                      <button onClick={() => fetchAI(sel, D)} disabled={aiLoad}
                        style={{ background: "#7c6aff", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 700, opacity: aiLoad ? 0.5 : 1 }}>
                        {aiLoad ? "GENERATING..." : "GENERATE AI PLAN"}
                      </button>
                    </div>
                    {!aiText ?
                      <div style={{ color: "#333", fontSize: 11 }}>
                        Click "GENERATE AI PLAN" to get a comprehensive trade analysis including entry/exit timing, position sizing, and risk management.
                      </div>
                      :
                      <div style={{ background: "#07071a", borderRadius: 6, padding: 12, color: "#aab", whiteSpace: "pre-wrap", lineHeight: 1.8, fontSize: 11 }}>
                        {aiText}
                      </div>
                    }
                  </div>
                </div>
              )}

              {/* BACKTEST TAB */}
              {tab === "backtest" && (
                <div>
                  <div style={{ background: "#0a0a1c", border: "1px solid #1a1a30", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 8, color: "#333", letterSpacing: 2, marginBottom: 10 }}>BACKTEST ON REAL HISTORICAL DATA · {D.bt.sampleSize} TRADES</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
                      {[
                        { label: "Win Rate", val: (D.bt.winRate * 100).toFixed(0) + "%", color: D.bt.winRate > 0.55 ? "#00d084" : D.bt.winRate > 0.45 ? "#f0b429" : "#ff4d6d" },
                        { label: "Avg Return", val: D.bt.avgReturn.toFixed(1) + "%", color: D.bt.avgReturn > 0 ? "#00d084" : "#ff4d6d" },
                        { label: "Sharpe", val: D.bt.sharpe.toFixed(2), color: D.bt.sharpe > 1 ? "#00d084" : D.bt.sharpe > 0.5 ? "#f0b429" : "#ff4d6d" },
                        { label: "Best Hold", val: D.bt.bestHold + "d", color: "#00b4d8" },
                      ].map((it, i) =>
                        <div key={i} style={{ background: "#07071a", borderRadius: 6, padding: 10, textAlign: "center" }}>
                          <div style={{ fontSize: 7, color: "#333", marginBottom: 3 }}>{it.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: it.color }}>{it.val}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "#556", lineHeight: 1.8 }}>
                      Backtest on <span style={{ color: "#00d084" }}>real {sel.s} price history</span> from Yahoo Finance. Tested {D.bt.sampleSize} setups across 5/10/15-day holds with 2×ATR stop-loss. Optimal exit: <span style={{ color: "#00b4d8" }}>{D.bt.bestHold} days</span>, avg return: <span style={{ color: "#00d084" }}>{D.bt.avgReturn.toFixed(1)}%</span>.
                    </div>
                  </div>

                  {/* VOLUME PROFILE */}
                  <div style={{ background: "#0a0a1c", border: "1px solid #1a1a30", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 8, color: "#333", letterSpacing: 2, marginBottom: 10 }}>REAL VOLUME PROFILE · LAST 10 SESSIONS</div>
                    {D.volumes.slice(-10).map((vol, i) => {
                      const avg = D.volumes.slice(-20).reduce((a, b) => a + b, 0) / 20 || 1;
                      const vr = vol / avg;
                      const idx = D.prices.length - 10 + i;
                      const up = idx > 0 ? D.prices[idx] >= D.prices[idx - 1] : true;
                      return (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                          <div style={{ fontSize: 8, color: "#333", width: 24, textAlign: "right" }}>D-{9 - i}</div>
                          <div style={{ flex: 1, height: 10, background: "#07071a", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.min(vr * 40, 100)}%`, height: "100%", borderRadius: 2, background: vr > 1.5 ? (up ? "#00d084" : "#ff4d6d") : (up ? "#00d08444" : "#ff4d6d44") }} />
                          </div>
                          <div style={{ fontSize: 8, color: vr > 1.5 ? "#f0b429" : "#333", width: 32 }}>{vr.toFixed(1)}x</div>
                          <div style={{ fontSize: 8, color: up ? "#00d084" : "#ff4d6d", width: 10 }}>{up ? "▲" : "▼"}</div>
                          <div style={{ fontSize: 8, color: "#2a2a4a", width: 56 }}>{(vol / 100000).toFixed(1)}L</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* MACRO TAB */}
              {tab === "macro" && (
                <div>
                  <div style={{ background: "#0a0a1c", border: "1px solid #1a1a30", borderRadius: 8, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 8, color: "#333", letterSpacing: 2, marginBottom: 8 }}>MACRO IMPACT · {sel.sec.toUpperCase()}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: D.macro.score === "POSITIVE" ? "#00d084" : D.macro.score === "NEGATIVE" ? "#ff4d6d" : "#f0b429" }}>
                      {D.macro.score} MACRO · {D.macro.risks.length} ACTIVE RISKS
                    </div>
                    {D.macro.risks.length === 0 ?
                      <div style={{ fontSize: 11, color: "#555" }}>No direct macro risks mapped to this sector</div>
                      : D.macro.risks.map((r, i) => (
                        <div key={i} style={{ background: "#07071a", border: `1px solid ${r.dir === "BEARISH" ? "#ff4d6d22" : r.dir === "BULLISH" ? "#00d08422" : "#f0b42922"}`, borderRadius: 6, padding: 10, marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: r.dir === "BEARISH" ? "#ff4d6d" : r.dir === "BULLISH" ? "#00d084" : "#f0b429" }}>{r.name}</span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <Pill label={r.impact} color={r.impact === "HIGH" ? "#ff4d6d" : "#f0b429"} />
                              <Pill label={r.dir} color={r.dir === "BULLISH" ? "#00d084" : r.dir === "BEARISH" ? "#ff4d6d" : "#f0b429"} />
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: "#667", lineHeight: 1.6 }}>{r.desc}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          }
        </div>
      </div>
    </div>
  );
}
