import { useState, useEffect, useCallback, useRef } from "react";

const PROXY = "https://corsproxy.io/?";

// Mock portfolio storage hook
function usePortfolio() {
  const [portfolio, setPortfolio] = useState(() => {
    try {
      const saved = localStorage?.getItem("nse_portfolio");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const savePortfolio = useCallback((data) => {
    setPortfolio(data);
    try {
      localStorage?.setItem("nse_portfolio", JSON.stringify(data));
    } catch (e) {
      console.error("Portfolio save failed:", e);
    }
  }, []);

  const addPosition = useCallback((position) => {
    const newPos = {
      id: Date.now().toString(),
      entryTime: new Date().toLocaleTimeString("en-IN"),
      entryDate: new Date().toLocaleDateString("en-IN"),
      status: "ACTIVE",
      previousSignal: null,
      signalChangeAlert: null,
      ...position,
    };
    savePortfolio([...portfolio, newPos]);
    return newPos;
  }, [portfolio, savePortfolio]);

  const updatePosition = useCallback((id, updates) => {
    savePortfolio(portfolio.map(p => p.id === id ? {...p, ...updates} : p));
  }, [portfolio, savePortfolio]);

  const closePosition = useCallback((id, closePrice, closeReason) => {
    updatePosition(id, {
      status: "CLOSED",
      closePrice,
      closeReason,
      closeTime: new Date().toLocaleTimeString("en-IN"),
      closePnL: ((closePrice - portfolio.find(p => p.id === id)?.entryPrice) / portfolio.find(p => p.id === id)?.entryPrice * 100).toFixed(2),
    });
  }, [portfolio, updatePosition]);

  const deletePosition = useCallback((id) => {
    savePortfolio(portfolio.filter(p => p.id !== id));
  }, [portfolio, savePortfolio]);

  return { portfolio, addPosition, updatePosition, closePosition, deletePosition };
}

// Fetch real-time price
async function fetchLivePrice(yahooSymbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
    const res = await fetch(PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    return {
      price: meta?.regularMarketPrice || 0,
      currency: meta?.currency || "INR",
      prevClose: meta?.chartPreviousClose || 0,
    };
  } catch (e) {
    console.error("Price fetch failed:", e);
    return { price: 0, currency: "INR", prevClose: 0 };
  }
}

// Math functions (abbreviated from main app)
function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  const ag = gains / period, al = losses / period;
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
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
  const std = Math.sqrt(sl.reduce((a, b) => a + (b - mean) * (b - mean), 0) / period);
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

async function fetchHistoricalData(yahooSymbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=3mo`;
    const res = await fetch(PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error("No data");
    const q = result.indicators.quote[0];
    const ts = result.timestamp;
    const valid = ts.map((t, i) => ({
      c: q.close[i],
      h: q.high[i],
      l: q.low[i],
      v: q.volume[i] || 1,
    })).filter(d => d.c != null);
    return { prices: valid.map(d => d.c), highs: valid.map(d => d.h), lows: valid.map(d => d.l), volumes: valid.map(d => d.v) };
  } catch (e) {
    console.error("Historical data fetch failed:", e);
    return { prices: [], highs: [], lows: [], volumes: [] };
  }
}

function buildSignal(indicators, direction) {
  const { rsi, macd, bb, ema9, ema21, ema50, stoch } = indicators;
  const sigs = [];
  let score = 0;
  let dir = direction || "NEUTRAL";

  if (ema9 > ema21 && ema21 > ema50) { dir = "BULLISH"; sigs.push("EMA Stack Bullish"); score += 2; }
  else if (ema9 < ema21 && ema21 < ema50) { dir = "BEARISH"; sigs.push("EMA Stack Bearish"); score -= 2; }

  if (rsi < 30) { sigs.push("RSI Oversold"); score += 3; }
  else if (rsi > 70) { sigs.push("RSI Overbought"); score -= 2; }

  if (macd.hist > 0) { sigs.push("MACD Bullish"); score += 2; } else { sigs.push("MACD Bearish"); score -= 2; }
  if (stoch.k < 20) { sigs.push("Stoch Oversold"); score += 2; }
  else if (stoch.k > 80) { sigs.push("Stoch Overbought"); score -= 2; }

  if (bb.bw < 0.02) { sigs.push("BB Squeeze"); score += 1; }

  let strat = "WAIT";
  if (score >= 3 && dir === "BULLISH") strat = "BUY";
  else if (score <= -3 && dir === "BEARISH") strat = "SELL";

  return { signals: sigs, direction: dir, strategy: strat, score };
}

// ────────────────────────────────────────────────────────────────
// MAIN APP
// ────────────────────────────────────────────────────────────────
export default function PortfolioTracker() {
  const { portfolio, addPosition, updatePosition, closePosition } = usePortfolio();
  const [tab, setTab] = useState("portfolio");
  const [newPos, setNewPos] = useState({ symbol: "", entryPrice: "", quantity: "", sl: "", t1: "", t2: "" });
  const [liveData, setLiveData] = useState({});
  const [signalAlerts, setSignalAlerts] = useState({});
  const [loading, setLoading] = useState({});
  const [mlResults, setMlResults] = useState([]);
  const [backtestData, setBacktestData] = useState({});
  const [backtestMeta, setBacktestMeta] = useState({});
  const [backtestModel, setBacktestModel] = useState("ensemble");
  const timerRef = useRef(null);

  useEffect(() => {
    fetch("/ml_results_final.json")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setMlResults(data?.results || []);
        setBacktestData(data?.backtest || {});
        setBacktestMeta({
          history: data?.history || "2y",
          horizons: data?.horizons_tested || [3, 5, 7],
          targetType: data?.target_type || "volume_time_weighted",
          threshold: data?.threshold || 0.55,
          models: data?.models || ["xgboost", "lightgbm", "random_forest", "ensemble"],
          analyzed: data?.analyzed || 0,
          horizonDistribution: data?.horizon_distribution || {},
        });
      })
      .catch(() => {
        setMlResults([]);
        setBacktestData({});
      });
  }, []);

  // Fetch live data for all positions
  const refreshPrices = useCallback(async () => {
    const newLiveData = {};
    for (const pos of portfolio.filter(p => p.status === "ACTIVE")) {
      setLoading(prev => ({ ...prev, [pos.id]: true }));
      try {
        const priceData = await fetchLivePrice(pos.yahooSymbol);
        const histData = await fetchHistoricalData(pos.yahooSymbol);

        if (histData.prices.length > 0) {
          const indicators = {
            rsi: calcRSI(histData.prices),
            macd: calcMACD(histData.prices),
            bb: calcBoll(histData.prices),
            ema9: calcEMA(histData.prices.slice(-9), 9),
            ema21: calcEMA(histData.prices.slice(-21), 21),
            ema50: calcEMA(histData.prices.slice(-50), 50),
            stoch: calcStoch(histData.highs, histData.lows, histData.prices),
            atr: calcATR(histData.highs, histData.lows, histData.prices),
          };

          const signal = buildSignal(indicators, pos.entryDirection);
          const currentPrice = priceData.price || histData.prices[histData.prices.length - 1];
          const change = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
          const pnl = (currentPrice - pos.entryPrice) * pos.quantity;
          const pnlPct = change;

          newLiveData[pos.id] = {
            currentPrice,
            change,
            pnl,
            pnlPct,
            indicators,
            signal,
            status: "ok",
          };

          // Check for signal change
          if (pos.previousSignal && pos.previousSignal !== signal.strategy) {
            const alert = `⚠️ SIGNAL CHANGED: ${pos.previousSignal} → ${signal.strategy}`;
            setSignalAlerts(prev => ({ ...prev, [pos.id]: alert }));
            // Auto-update position
            updatePosition(pos.id, { signalChangeAlert: alert, previousSignal: signal.strategy });
          } else if (!pos.previousSignal) {
            updatePosition(pos.id, { previousSignal: signal.strategy });
          }
        }
      } catch (e) {
        newLiveData[pos.id] = { status: "error", error: e.message };
      }
      setLoading(prev => ({ ...prev, [pos.id]: false }));
    }
    setLiveData(newLiveData);
  }, [portfolio, updatePosition]);

  useEffect(() => {
    Promise.resolve().then(refreshPrices);
    timerRef.current = setInterval(refreshPrices, 30000); // Refresh every 30 seconds
    return () => clearInterval(timerRef.current);
  }, [refreshPrices]);

  const handleAddPosition = () => {
    if (!newPos.symbol || !newPos.entryPrice || !newPos.quantity) {
      alert("Fill all fields");
      return;
    }
    const symbol = newPos.symbol.toUpperCase().replace(/\.NS$/, "");
    addPosition({
      symbol,
      yahooSymbol: symbol + ".NS",
      entryPrice: parseFloat(newPos.entryPrice),
      quantity: parseInt(newPos.quantity),
      sl: parseFloat(newPos.sl) || 0,
      t1: parseFloat(newPos.t1) || 0,
      t2: parseFloat(newPos.t2) || 0,
      entryDirection: "BULLISH",
    });
    setNewPos({ symbol: "", entryPrice: "", quantity: "", sl: "", t1: "", t2: "" });
  };

  const fillFromMlStock = (stock) => {
    const symbol = stock.symbol.replace(/\.NS$/, "");
    setNewPos({
      symbol,
      entryPrice: stock.price.toFixed(2),
      quantity: "10",
      sl: stock.sl.toFixed(2),
      t1: stock.t1.toFixed(2),
      t2: stock.t2.toFixed(2),
    });
    setTab("addnew");
  };

  const handleClosePosition = (id) => {
    const live = liveData[id];
    if (live && live.currentPrice) {
      closePosition(id, live.currentPrice, "MANUAL_EXIT");
    }
  };

  // Portfolio metrics
  const activePositions = portfolio.filter(p => p.status === "ACTIVE");
  const closedPositions = portfolio.filter(p => p.status === "CLOSED");
  const totalPnL = Object.values(liveData).reduce((sum, d) => sum + (d.pnl || 0), 0);
  const totalPnLPct = activePositions.length > 0
    ? (Object.values(liveData).reduce((sum, d, i) => {
        const pos = activePositions[i];
        return sum + ((d.pnlPct || 0) * (pos?.quantity || 0)) / activePositions.reduce((s, p) => s + p.quantity, 0);
      }, 0) / activePositions.length)
    : 0;
  const closedPnL = closedPositions.reduce((sum, p) => sum + (parseFloat(p.closePnL) || 0), 0);
  const winTrades = closedPositions.filter(p => parseFloat(p.closePnL) > 0).length;
  const totalTrades = closedPositions.length;
  const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : 0;
  const backtestModels = backtestMeta.models || ["xgboost", "lightgbm", "random_forest", "ensemble"];
  const currentBacktest = backtestData[backtestModel] || [];
  const modelLabels = {
    xgboost: "XGBOOST",
    lightgbm: "LIGHTGBM",
    random_forest: "RANDOM FOREST",
    ensemble: "ENSEMBLE",
  };

  const renderStockCards = (stocks, keyPrefix = "ml") => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 10 }}>
      {stocks.map((stock, i) => {
        const bestH = stock.best_horizon || 5;
        const hc = stock.horizon_comparison || {};
        const horizonLine = Object.keys(hc).sort((a, b) => +a - +b).map(k => {
          const m = hc[k];
          const tag = +k === bestH ? "★" : "";
          return `${k}D S${m.sharpe?.toFixed(1)}${tag}`;
        }).join(" · ");

        return (
        <div key={`${keyPrefix}-${stock.symbol}`} style={{ background: "#0a0a1c", border: `1px solid ${+bestH === 3 ? "#00b4d833" : +bestH === 7 ? "#7c6aff33" : "#00d08433"}`, borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{i + 1}. {stock.name}</div>
              <div style={{ fontSize: 9, color: "#444", marginTop: 2 }}>{stock.symbol} · {stock.cap}</div>
              <div style={{ fontSize: 8, color: "#00d084", marginTop: 4, letterSpacing: 1 }}>
                BEST: {bestH}-DAY HOLD · VOL+TIME WEIGHTED
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: stock.sharpe > 3 ? "#00d084" : "#f0b429" }}>
                Sharpe {stock.sharpe.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>
                Sortino {(stock.sortino ?? 0).toFixed(2)} · MD {(stock.max_drawdown ?? 0).toFixed(1)}%
              </div>
              <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>
                WR {stock.win_rate.toFixed(0)}% · Avg {(stock.avg_return ?? 0).toFixed(2)}% · {stock.trades} trades
              </div>
            </div>
          </div>

          {horizonLine && (
            <div style={{ fontSize: 8, color: "#555", background: "#070712", borderRadius: 4, padding: "5px 8px", marginBottom: 8, lineHeight: 1.6 }}>
              Horizon test: {horizonLine}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 9, marginBottom: 10 }}>
            {[
              { l: "Entry", v: "₹" + stock.price.toFixed(2) },
              { l: `Stop Loss (${bestH}D)`, v: "₹" + stock.sl.toFixed(2) },
              { l: `Target 1 (${bestH}D)`, v: "₹" + stock.t1.toFixed(2) },
              { l: `Target 2 (${bestH}D)`, v: "₹" + stock.t2.toFixed(2) },
            ].map((it, j) => (
              <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #0a0a18" }}>
                <span style={{ color: "#444" }}>{it.l}</span>
                <span style={{ color: "#bbc" }}>{it.v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => fillFromMlStock(stock)}
            style={{ width: "100%", background: "#00d084", color: "#000", border: "none", padding: "8px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 700 }}>
            ADD TO PORTFOLIO ({bestH}D SETUP)
          </button>
        </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#04040d", color: "#dde0f0", fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 12 }}>

      {/* HEADER */}
      <div style={{ background: "#07071a", borderBottom: "1px solid #141428", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 8, color: "#00d084", letterSpacing: 3 }}>PORTFOLIO TRACKER</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>LIVE POSITION MONITOR</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: totalPnL >= 0 ? "#00d084" : "#ff4d6d" }}>
            Total P&L: ₹{totalPnL.toFixed(0)} ({totalPnLPct.toFixed(2)}%)
          </div>
          <div style={{ fontSize: 9, color: "#444", marginTop: 2 }}>Active: {activePositions.length} | Closed: {totalTrades}</div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: "#080816", borderBottom: "1px solid #141428", padding: "6px 16px", display: "flex", gap: 8 }}>
        {[["portfolio", "ACTIVE POSITIONS"], ["closed", "CLOSED TRADES"], ["ml", "ML TOP STOCKS"], ["backtest", "BACKTEST"], ["addnew", "ADD POSITION"]].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: "6px 14px", background: "none", border: "none", borderBottom: tab === t ? "2px solid #00d084" : "2px solid transparent",
              color: tab === t ? "#00d084" : "#444", cursor: "pointer", fontFamily: "inherit", fontSize: 10, letterSpacing: 1, fontWeight: 700,
            }}>
            {l}
          </button>
        ))}
        <button onClick={refreshPrices}
          style={{ marginLeft: "auto", background: "#00d084", color: "#000", border: "none", padding: "5px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 700 }}>
          REFRESH NOW
        </button>
      </div>

      {/* CONTENT */}
      <div style={{ padding: "16px" }}>

        {/* ACTIVE POSITIONS */}
        {tab === "portfolio" && (
          <div>
            {activePositions.length === 0 ? (
              <div style={{ textAlign: "center", opacity: 0.3, padding: "40px" }}>
                <div style={{ fontSize: 32 }}>◈</div>
                <div style={{ fontSize: 12, marginTop: 12, letterSpacing: 2 }}>NO ACTIVE POSITIONS</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(500px, 1fr))", gap: 12 }}>
                {activePositions.map(pos => {
                  const live = liveData[pos.id];
                  const isLoading = loading[pos.id];
                  const color = live?.pnl >= 0 ? "#00d084" : "#ff4d6d";
                  const alertMsg = signalAlerts[pos.id] || pos.signalChangeAlert;

                  return (
                    <div key={pos.id} style={{ background: "#0a0a1c", border: `1px solid ${color}33`, borderRadius: 8, padding: 14, position: "relative" }}>
                      {/* Close button */}
                      <button onClick={() => handleClosePosition(pos.id)}
                        style={{ position: "absolute", top: 8, right: 8, background: "#ff4d6d", color: "#000", border: "none", padding: "4px 8px", borderRadius: 3, cursor: "pointer", fontSize: 8, fontWeight: 700 }}>
                        CLOSE
                      </button>

                      {/* Header */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{pos.symbol}</div>
                            <div style={{ fontSize: 9, color: "#444", marginTop: 2 }}>Entry: {pos.entryDate} {pos.entryTime}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color }}>
                              {isLoading ? "..." : live?.currentPrice ? "₹" + live.currentPrice.toFixed(2) : "—"}
                            </div>
                            <div style={{ fontSize: 10, color, fontWeight: 700, marginTop: 2 }}>
                              {isLoading ? "updating" : live?.pnlPct ? (live.pnlPct >= 0 ? "+" : "") + live.pnlPct.toFixed(2) + "%" : "—"}
                            </div>
                          </div>
                        </div>

                        {alertMsg && (
                          <div style={{ background: "#1a0000", border: "1px solid #ff4d6d44", borderRadius: 4, padding: 6, marginBottom: 8, fontSize: 9, color: "#ff6b6b", lineHeight: 1.4 }}>
                            {alertMsg}
                          </div>
                        )}
                      </div>

                      {/* Position details */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10, fontSize: 9 }}>
                        {[
                          { l: "Entry Price", v: "₹" + pos.entryPrice.toFixed(2) },
                          { l: "Quantity", v: pos.quantity + " shares" },
                          { l: "Entry Amount", v: "₹" + (pos.entryPrice * pos.quantity).toFixed(0) },
                          { l: "Current Value", v: live?.currentPrice ? "₹" + (live.currentPrice * pos.quantity).toFixed(0) : "—" },
                          { l: "Stop Loss", v: "₹" + pos.sl.toFixed(2) },
                          { l: "Target 1", v: "₹" + pos.t1.toFixed(2) },
                          { l: "Target 2", v: "₹" + pos.t2.toFixed(2) },
                          { l: "Position P&L", v: live?.pnl ? (live.pnl >= 0 ? "+" : "") + "₹" + live.pnl.toFixed(0) : "—" },
                        ].map((it, i) => (
                          <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #0a0a18", display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#555" }}>{it.l}</span>
                            <span style={{ color: "#bbc", fontFamily: "monospace" }}>{it.v}</span>
                          </div>
                        ))}
                      </div>

                      {/* Signal & Indicators */}
                      {live && live.status === "ok" && (
                        <div style={{ background: "#070712", borderRadius: 4, padding: 8 }}>
                          <div style={{ fontSize: 8, color: "#333", letterSpacing: 1, marginBottom: 5 }}>CURRENT SIGNAL</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 9 }}>
                            {[
                              { l: "RSI", v: live.indicators.rsi.toFixed(1), c: live.indicators.rsi < 30 ? "#00d084" : live.indicators.rsi > 70 ? "#ff4d6d" : "#f0b429" },
                              { l: "MACD", v: live.indicators.macd.hist > 0 ? "BULL" : "BEAR", c: live.indicators.macd.hist > 0 ? "#00d084" : "#ff4d6d" },
                              { l: "Stoch K", v: live.indicators.stoch.k.toFixed(0), c: live.indicators.stoch.k < 20 ? "#00d084" : live.indicators.stoch.k > 80 ? "#ff4d6d" : "#888" },
                              { l: "Strategy", v: live.signal.strategy, c: live.signal.strategy === "BUY" ? "#00d084" : live.signal.strategy === "SELL" ? "#ff4d6d" : "#888" },
                              { l: "EMA 9>21>50", v: live.signal.direction === "BULLISH" ? "✓" : "✗", c: live.signal.direction === "BULLISH" ? "#00d084" : "#ff4d6d" },
                              { l: "Signal Score", v: live.signal.score > 0 ? "+" + live.signal.score : live.signal.score, c: live.signal.score > 0 ? "#00d084" : "#ff4d6d" },
                            ].map((it, i) => (
                              <div key={i} style={{ background: "#0a0a18", borderRadius: 3, padding: 4, textAlign: "center", color: it.c }}>
                                <div style={{ fontSize: 7, color: "#444" }}>{it.l}</div>
                                <div style={{ fontWeight: 700, marginTop: 2 }}>{it.v}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CLOSED TRADES */}
        {tab === "closed" && (
          <div>
            {closedPositions.length === 0 ? (
              <div style={{ textAlign: "center", opacity: 0.3, padding: "40px" }}>
                <div style={{ fontSize: 32 }}>◈</div>
                <div style={{ fontSize: 12, marginTop: 12, letterSpacing: 2 }}>NO CLOSED TRADES YET</div>
              </div>
            ) : (
              <div>
                {/* Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                  {[
                    { l: "Total Trades", v: totalTrades, c: "#888" },
                    { l: "Win Trades", v: winTrades, c: "#00d084" },
                    { l: "Loss Trades", v: totalTrades - winTrades, c: "#ff4d6d" },
                    { l: "Win Rate", v: winRate + "%", c: winRate >= 50 ? "#00d084" : "#ff4d6d" },
                    { l: "Closed P&L", v: "₹" + closedPnL.toFixed(0), c: closedPnL >= 0 ? "#00d084" : "#ff4d6d" },
                    { l: "Avg Win", v: winTrades > 0 ? "+" + (closedPositions.filter(p => parseFloat(p.closePnL) > 0).reduce((s, p) => s + parseFloat(p.closePnL), 0) / winTrades).toFixed(2) + "%" : "—", c: "#00d084" },
                    { l: "Avg Loss", v: (totalTrades - winTrades) > 0 ? "" + (closedPositions.filter(p => parseFloat(p.closePnL) < 0).reduce((s, p) => s + parseFloat(p.closePnL), 0) / (totalTrades - winTrades)).toFixed(2) + "%" : "—", c: "#ff4d6d" },
                    { l: "Profit Factor", v: winTrades > 0 ? (Math.abs(closedPnL / (totalTrades - winTrades > 0 ? (closedPositions.filter(p => parseFloat(p.closePnL) < 0).reduce((s, p) => s + parseFloat(p.closePnL), 0)) : 1))).toFixed(2) : "—", c: "#f0b429" },
                  ].map((it, i) => (
                    <div key={i} style={{ background: "#0a0a1c", border: "1px solid #141428", borderRadius: 6, padding: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 8, color: "#333", letterSpacing: 1, marginBottom: 4 }}>{it.l}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: it.c }}>{it.v}</div>
                    </div>
                  ))}
                </div>

                {/* Closed positions list */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(450px, 1fr))", gap: 10 }}>
                  {closedPositions.map(pos => {
                    const pnl = parseFloat(pos.closePnL);
                    const color = pnl >= 0 ? "#00d084" : "#ff4d6d";
                    return (
                      <div key={pos.id} style={{ background: "#0a0a1c", border: `1px solid ${color}33`, borderRadius: 8, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{pos.symbol}</div>
                            <div style={{ fontSize: 8, color: "#444", marginTop: 2 }}>
                              Entry: {pos.entryDate} | Closed: {pos.closeTime}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color }}>
                              {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                            </div>
                            <div style={{ fontSize: 9, color: "#444", marginTop: 2 }}>{pos.closeReason}</div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #0a0a18" }}>
                            <span style={{ color: "#444" }}>Entry</span>
                            <span style={{ color: "#bbc" }}>₹{pos.entryPrice.toFixed(2)} × {pos.quantity}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #0a0a18" }}>
                            <span style={{ color: "#444" }}>Exit</span>
                            <span style={{ color: "#bbc" }}>₹{pos.closePrice.toFixed(2)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #0a0a18" }}>
                            <span style={{ color: "#444" }}>Entry Value</span>
                            <span style={{ color: "#bbc" }}>₹{(pos.entryPrice * pos.quantity).toFixed(0)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #0a0a18" }}>
                            <span style={{ color: "#444" }}>Exit Value</span>
                            <span style={{ color: "#bbc" }}>₹{(pos.closePrice * pos.quantity).toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ML TOP STOCKS */}
        {tab === "ml" && (
          <div>
            {mlResults.length === 0 ? (
              <div style={{ textAlign: "center", opacity: 0.3, padding: "40px" }}>
                <div style={{ fontSize: 12, letterSpacing: 2 }}>Run ML_SYSTEM_FOR_YOUR_MACHINE.py to generate results</div>
              </div>
            ) : renderStockCards(mlResults, "ml")}
          </div>
        )}

        {/* BACKTEST — 3 models + ensemble */}
        {tab === "backtest" && (
          <div>
            <div style={{ background: "#0a0a1c", border: "1px solid #141428", borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#00d084", letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>MODEL BACKTEST COMPARISON</div>
              <div style={{ fontSize: 9, color: "#666", lineHeight: 1.8 }}>
                History: {backtestMeta.history || "2y"} · Horizons: {(backtestMeta.horizons || [3,5,7]).join("/")}D auto-pick ·
                Target: {backtestMeta.targetType || "weighted"} · Threshold: {backtestMeta.threshold || 0.55} ·
                Stocks: {backtestMeta.analyzed || "—"}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {backtestModels.map(m => (
                  <button key={m} onClick={() => setBacktestModel(m)}
                    style={{
                      padding: "6px 12px",
                      background: backtestModel === m ? "#00d084" : "#141428",
                      color: backtestModel === m ? "#000" : "#888",
                      border: "none", borderRadius: 4, cursor: "pointer",
                      fontFamily: "inherit", fontSize: 9, fontWeight: 700, letterSpacing: 1,
                    }}>
                    {modelLabels[m] || m.toUpperCase()} ({(backtestData[m] || []).length})
                  </button>
                ))}
              </div>
            </div>

            {currentBacktest.length === 0 ? (
              <div style={{ textAlign: "center", opacity: 0.3, padding: "40px" }}>
                <div style={{ fontSize: 12, letterSpacing: 2 }}>No backtest data — run ML_SYSTEM_FOR_YOUR_MACHINE.py</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 9, color: "#555", marginBottom: 12, letterSpacing: 1 }}>
                  TOP 20 BY SHARPE — {modelLabels[backtestModel] || backtestModel.toUpperCase()} (dynamic {backtestMeta.horizons?.join("/") || "3/5/7"}D per stock)
                  {currentBacktest.length > 0 && (
                    <> · Avg Sharpe {(currentBacktest.reduce((s, r) => s + r.sharpe, 0) / currentBacktest.length).toFixed(2)} · Avg Sortino {(currentBacktest.reduce((s, r) => s + (r.sortino || 0), 0) / currentBacktest.length).toFixed(2)}</>
                  )}
                </div>
                {renderStockCards(currentBacktest, `bt-${backtestModel}`)}
              </>
            )}
          </div>
        )}

        {/* ADD POSITION */}
        {tab === "addnew" && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ background: "#0a0a1c", border: "1px solid #141428", borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 11, color: "#00d084", letterSpacing: 2, marginBottom: 14, fontWeight: 700 }}>ADD NEW POSITION</div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 9, color: "#444", marginBottom: 4, display: "block" }}>Stock Symbol (e.g., RELIANCE)</label>
                <input value={newPos.symbol} onChange={e => setNewPos({ ...newPos, symbol: e.target.value })}
                  placeholder="RELIANCE"
                  style={{ width: "100%", padding: "8px", background: "#070712", border: "1px solid #141428", borderRadius: 4, color: "#ccc", fontFamily: "inherit", fontSize: 12 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 9, color: "#444", marginBottom: 4, display: "block" }}>Entry Price (Rs.)</label>
                  <input value={newPos.entryPrice} onChange={e => setNewPos({ ...newPos, entryPrice: e.target.value })}
                    placeholder="1425"
                    type="number"
                    style={{ width: "100%", padding: "8px", background: "#070712", border: "1px solid #141428", borderRadius: 4, color: "#ccc", fontFamily: "inherit", fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, color: "#444", marginBottom: 4, display: "block" }}>Quantity</label>
                  <input value={newPos.quantity} onChange={e => setNewPos({ ...newPos, quantity: e.target.value })}
                    placeholder="10"
                    type="number"
                    style={{ width: "100%", padding: "8px", background: "#070712", border: "1px solid #141428", borderRadius: 4, color: "#ccc", fontFamily: "inherit", fontSize: 12 }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 9, color: "#444", marginBottom: 4, display: "block" }}>Stop Loss (Rs.)</label>
                  <input value={newPos.sl} onChange={e => setNewPos({ ...newPos, sl: e.target.value })}
                    placeholder="1385"
                    type="number"
                    style={{ width: "100%", padding: "8px", background: "#070712", border: "1px solid #141428", borderRadius: 4, color: "#ccc", fontFamily: "inherit", fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, color: "#444", marginBottom: 4, display: "block" }}>Target 1 (Rs.)</label>
                  <input value={newPos.t1} onChange={e => setNewPos({ ...newPos, t1: e.target.value })}
                    placeholder="1500"
                    type="number"
                    style={{ width: "100%", padding: "8px", background: "#070712", border: "1px solid #141428", borderRadius: 4, color: "#ccc", fontFamily: "inherit", fontSize: 12 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 9, color: "#444", marginBottom: 4, display: "block" }}>Target 2 (Rs.)</label>
                <input value={newPos.t2} onChange={e => setNewPos({ ...newPos, t2: e.target.value })}
                  placeholder="1550"
                  type="number"
                  style={{ width: "100%", padding: "8px", background: "#070712", border: "1px solid #141428", borderRadius: 4, color: "#ccc", fontFamily: "inherit", fontSize: 12, marginBottom: 16 }}
                />
              </div>

              <button onClick={handleAddPosition}
                style={{ width: "100%", background: "#00d084", color: "#000", border: "none", padding: "10px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                ADD TO PORTFOLIO
              </button>
            </div>

            {/* Instructions */}
            <div style={{ background: "#080818", border: "1px solid #0e0e20", borderRadius: 8, padding: 14, marginTop: 16 }}>
              <div style={{ fontSize: 10, color: "#00d084", fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>HOW IT WORKS</div>
              <div style={{ fontSize: 9, color: "#556", lineHeight: 1.8 }}>
                1. Enter stock symbol, entry price, quantity, and levels (SL, T1, T2)<br/>
                2. Click ADD — position goes to ACTIVE POSITIONS<br/>
                3. Monitor LIVE: App fetches current price every 30 seconds<br/>
                4. GET ALERTS: If signal changes from BUY → SELL (or vice versa), you'll see ⚠️ alert<br/>
                5. CLOSE: Click CLOSE button when you want to exit (uses current live price)<br/>
                6. VIEW CLOSED TRADES: See P&L, win rate, profit factor after closing
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: #04040d; }
        ::-webkit-scrollbar-thumb { background: #141428; border-radius: 2px; }
      `}</style>
    </div>
  );
}
