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
  const [mlData, setMlData] = useState(null);
  const [mlResults, setMlResults] = useState([]);
  const [backtestData, setBacktestData] = useState({});
  const [backtestMeta, setBacktestMeta] = useState({});
  const [backtestModel, setBacktestModel] = useState("ensemble");
  const [niftyReturn, setNiftyReturn] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    fetch("/ml_results_final.json")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setMlData(data);
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

  // Fetch NIFTY 50 2-year return for benchmark comparison
  useEffect(() => {
    (async () => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?interval=1d&range=2y`;
        const res = await fetch(PROXY + encodeURIComponent(url));
        if (!res.ok) return;
        const json = await res.json();
        const closes = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(c => c != null);
        if (closes && closes.length > 1) {
          const ret = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
          setNiftyReturn(ret);
        }
      } catch { /* silently fail — benchmark is optional */ }
    })();
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
                BEST: {bestH}-DAY HOLD
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: (stock.today_prob || 0) > 0.5 ? "#00b4d8" : "#888", marginTop: 4 }}>
                {stock.today_prob ? `MODEL PROBABILITY: ${(stock.today_prob * 100).toFixed(1)}%` : ""}
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
            ) : renderStockCards([...mlResults].sort((a, b) => (b.today_prob || 0) - (a.today_prob || 0)), "ml")}
          </div>
        )}

        {/* BACKTEST — Cross-Sectional Portfolio Simulation */}
        {tab === "backtest" && (() => {
          const NOTIONAL = 10000;
          const portfolioBT = mlData?.portfolio_backtest || {};
          const trades = portfolioBT[backtestModel] || [];
          const hasTrades = trades.length > 0;

          // Aggregate per-stock from portfolio trades
          const stockMap = {};
          trades.forEach(t => {
            if (!stockMap[t.s]) stockMap[t.s] = { symbol: t.s, name: t.n, trades: 0, wins: 0, pnl: 0, sl: 0, tgt: 0, hold: 0, horizon: t.h, firstDate: t.d, lastDate: t.xd };
            const sm = stockMap[t.s];
            sm.trades++;
            sm.pnl += t.pnl_rs;
            if (t.pnl_rs > 0) sm.wins++;
            if (t.exit === 'sl') sm.sl++;
            else if (t.exit === 'target') sm.tgt++;
            else sm.hold++;
            if (t.d < sm.firstDate) sm.firstDate = t.d;
            if (t.xd > sm.lastDate) sm.lastDate = t.xd;
          });
          const stockSim = Object.values(stockMap).sort((a, b) => b.pnl - a.pnl);
          const uniqueStocks = stockSim.length;

          const totalPnlStrat = trades.reduce((s, t) => s + t.pnl_rs, 0);
          const totalTrds = trades.length;
          const totalWins = trades.filter(t => t.pnl_rs > 0).length;
          const totalSL = trades.filter(t => t.exit === 'sl').length;
          const totalTgt = trades.filter(t => t.exit === 'target').length;
          const totalHold = trades.filter(t => t.exit === 'hold').length;
          const actualDeployed = uniqueStocks * NOTIONAL;
          const stratReturn = actualDeployed > 0 ? (totalPnlStrat / actualDeployed) * 100 : 0;
          const alpha = niftyReturn != null ? stratReturn - niftyReturn : null;
          const wWinRate = totalTrds > 0 ? (totalWins / totalTrds) * 100 : 0;
          const winPnl = trades.filter(t => t.pnl_rs > 0).reduce((s, t) => s + t.pnl_rs, 0);
          const lossPnl = Math.abs(trades.filter(t => t.pnl_rs < 0).reduce((s, t) => s + t.pnl_rs, 0));
          const profitFactor = lossPnl > 0 ? winPnl / lossPnl : winPnl > 0 ? Infinity : 0;

          // Sharpe/Sortino from trade PnL percentages
          const pnlPcts = trades.map(t => t.pnl);
          const meanRet = pnlPcts.length > 0 ? pnlPcts.reduce((a, b) => a + b, 0) / pnlPcts.length : 0;
          const stdRet = pnlPcts.length > 1 ? Math.sqrt(pnlPcts.reduce((s, r) => s + (r - meanRet) ** 2, 0) / pnlPcts.length) + 1e-8 : 1;
          const avgH = trades.length > 0 ? trades.reduce((s, t) => s + t.h, 0) / trades.length : 5;
          const wSharpe = meanRet / stdRet * Math.sqrt(252 / avgH);
          const downPnls = pnlPcts.filter(r => r < 0);
          const downStd = downPnls.length > 0 ? Math.sqrt(downPnls.reduce((s, r) => s + r * r, 0) / downPnls.length) + 1e-8 : stdRet;
          const wSortino = Math.min(99.99, meanRet / downStd * Math.sqrt(252 / avgH));

          // Max drawdown from cumulative PnL
          let cumPnl = 0, peak = 0, maxDD = 0;
          trades.forEach(t => {
            cumPnl += t.pnl_rs;
            if (cumPnl > peak) peak = cumPnl;
            const dd = peak > 0 ? ((cumPnl - peak) / peak) * 100 : 0;
            if (dd < maxDD) maxDD = dd;
          });

          const best = stockSim.length > 0 ? stockSim[0] : null;
          const worst = stockSim.length > 0 ? stockSim[stockSim.length - 1] : null;
          const concPct = best && totalPnlStrat !== 0 ? Math.abs(best.pnl / totalPnlStrat) * 100 : 0;

          const niftyCAGR = niftyReturn != null ? ((Math.pow(1 + niftyReturn / 100, 1 / 2) - 1) * 100) : null;
          const stratCAGR = (Math.pow(1 + Math.abs(stratReturn) / 100, 1 / 2) - 1) * 100 * (stratReturn >= 0 ? 1 : -1);

          const kpiBox = { background: "#0a0a1c", border: "1px solid #141428", borderRadius: 8, padding: "12px 14px", textAlign: "center" };
          const kpiLabel = { fontSize: 8, color: "#555", letterSpacing: 2, marginBottom: 4, fontWeight: 700 };
          const kpiValue = { fontSize: 16, fontWeight: 700 };

          return (
          <div>
            {/* Header */}
            <div style={{ background: "#0a0a1c", border: "1px solid #141428", borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#00d084", letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>CROSS-SECTIONAL PORTFOLIO BACKTEST · NO LOOK-AHEAD BIAS</div>
              <div style={{ fontSize: 9, color: "#666", lineHeight: 1.8 }}>
                Daily walk-forward: rank all stocks by model probability → deploy ₹{NOTIONAL.toLocaleString("en-IN")} per stock ·
                Max 5 concurrent positions · Historical SL/Target from ATR at entry ·
                Universe: {backtestMeta.analyzed || "—"} stocks · {backtestMeta.history || "2y"} history
              </div>
              {!hasTrades && (
                <div style={{ fontSize: 9, color: "#f0b429", marginTop: 6, background: "#332900", padding: "6px 10px", borderRadius: 4 }}>
                  ⚠ Portfolio backtest data not found. Re-run ML backtest to generate cross-sectional simulation.
                </div>
              )}
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
                    {modelLabels[m] || m.toUpperCase()} ({(portfolioBT[m] || []).length} trades)
                  </button>
                ))}
              </div>
            </div>

            {!hasTrades ? (
              <div style={{ textAlign: "center", opacity: 0.3, padding: "40px" }}>
                <div style={{ fontSize: 12, letterSpacing: 2 }}>No portfolio backtest data — run ML backtest first</div>
              </div>
            ) : (
              <>
                {/* KPI CARDS */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
                  <div style={kpiBox}>
                    <div style={kpiLabel}>TOTAL TRADES</div>
                    <div style={{ ...kpiValue, color: "#dde0f0" }}>{totalTrds}</div>
                    <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>{uniqueStocks} unique stocks</div>
                  </div>
                  <div style={kpiBox}>
                    <div style={kpiLabel}>PORTFOLIO PnL</div>
                    <div style={{ ...kpiValue, color: totalPnlStrat >= 0 ? "#00d084" : "#ff4d6d" }}>
                      {totalPnlStrat >= 0 ? "+" : ""}₹{totalPnlStrat.toFixed(0)}
                    </div>
                    <div style={{ fontSize: 9, color: stratReturn >= 0 ? "#00d084" : "#ff4d6d", marginTop: 2 }}>
                      {stratReturn >= 0 ? "+" : ""}{stratReturn.toFixed(1)}% on ₹{actualDeployed.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div style={kpiBox}>
                    <div style={kpiLabel}>NIFTY 2Y RETURN</div>
                    <div style={{ ...kpiValue, color: niftyReturn == null ? "#555" : niftyReturn >= 0 ? "#00b4d8" : "#ff4d6d" }}>
                      {niftyReturn == null ? "Loading…" : `${niftyReturn >= 0 ? "+" : ""}${niftyReturn.toFixed(1)}%`}
                    </div>
                  </div>
                  <div style={kpiBox}>
                    <div style={kpiLabel}>ALPHA</div>
                    <div style={{ ...kpiValue, color: alpha == null ? "#555" : alpha >= 0 ? "#00d084" : "#ff4d6d" }}>
                      {alpha == null ? "—" : `${alpha >= 0 ? "+" : ""}${alpha.toFixed(1)}%`}
                    </div>
                  </div>
                  <div style={kpiBox}>
                    <div style={kpiLabel}>PORTFOLIO SHARPE</div>
                    <div style={{ ...kpiValue, color: wSharpe > 2 ? "#00d084" : "#f0b429" }}>{wSharpe.toFixed(2)}</div>
                  </div>
                  <div style={kpiBox}>
                    <div style={kpiLabel}>WIN RATE</div>
                    <div style={{ ...kpiValue, color: wWinRate > 55 ? "#00d084" : "#f0b429" }}>{wWinRate.toFixed(0)}%</div>
                    <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>{totalWins}W / {totalTrds - totalWins}L</div>
                  </div>
                  <div style={kpiBox}>
                    <div style={kpiLabel}>PROFIT FACTOR</div>
                    <div style={{ ...kpiValue, color: profitFactor > 1.5 ? "#00d084" : "#f0b429" }}>
                      {profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)}
                    </div>
                  </div>
                  <div style={kpiBox}>
                    <div style={kpiLabel}>MAX DRAWDOWN</div>
                    <div style={{ ...kpiValue, color: "#ff4d6d" }}>{maxDD.toFixed(1)}%</div>
                  </div>
                </div>

                {/* EXIT TYPE BREAKDOWN */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                  <div style={{ ...kpiBox, borderColor: "#ff4d6d33" }}>
                    <div style={kpiLabel}>SL EXITS</div>
                    <div style={{ ...kpiValue, color: "#ff4d6d" }}>{totalSL}</div>
                    <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>{totalTrds > 0 ? (totalSL / totalTrds * 100).toFixed(0) : 0}% of trades</div>
                  </div>
                  <div style={{ ...kpiBox, borderColor: "#00d08433" }}>
                    <div style={kpiLabel}>TARGET EXITS</div>
                    <div style={{ ...kpiValue, color: "#00d084" }}>{totalTgt}</div>
                    <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>{totalTrds > 0 ? (totalTgt / totalTrds * 100).toFixed(0) : 0}% of trades</div>
                  </div>
                  <div style={{ ...kpiBox, borderColor: "#00b4d833" }}>
                    <div style={kpiLabel}>HORIZON HOLD</div>
                    <div style={{ ...kpiValue, color: "#00b4d8" }}>{totalHold}</div>
                    <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>{totalTrds > 0 ? (totalHold / totalTrds * 100).toFixed(0) : 0}% of trades</div>
                  </div>
                </div>

                {/* STRATEGY vs NIFTY COMPARISON TABLE */}
                <div style={{ background: "#0a0a1c", border: "1px solid #141428", borderRadius: 8, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: "#00d084", letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>STRATEGY vs NIFTY 50 COMPARISON</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1a1a32" }}>
                        <th style={{ padding: "8px 10px", textAlign: "left", color: "#555", fontWeight: 700, letterSpacing: 1 }}>METRIC</th>
                        <th style={{ padding: "8px 10px", textAlign: "right", color: "#00d084", fontWeight: 700, letterSpacing: 1 }}>ML PORTFOLIO</th>
                        <th style={{ padding: "8px 10px", textAlign: "right", color: "#00b4d8", fontWeight: 700, letterSpacing: 1 }}>NIFTY 50</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Return", `${stratReturn >= 0 ? "+" : ""}${stratReturn.toFixed(1)}%`, niftyReturn != null ? `${niftyReturn >= 0 ? "+" : ""}${niftyReturn.toFixed(1)}%` : "—"],
                        ["CAGR", `${stratCAGR >= 0 ? "+" : ""}${stratCAGR.toFixed(1)}%`, niftyCAGR != null ? `${niftyCAGR >= 0 ? "+" : ""}${niftyCAGR.toFixed(1)}%` : "—"],
                        ["Sharpe Ratio", wSharpe.toFixed(2), "~1.0 (typical)"],
                        ["Sortino Ratio", wSortino.toFixed(2), "—"],
                        ["Max Drawdown", `${maxDD.toFixed(1)}%`, "—"],
                        ["Win Rate", `${wWinRate.toFixed(0)}%`, "—"],
                        ["Profit Factor", profitFactor === Infinity ? "∞" : profitFactor.toFixed(2), "—"],
                        ["Total Trades", `${totalTrds} (${uniqueStocks} stocks)`, "—"],
                        ["SL / Target / Hold", `${totalSL} / ${totalTgt} / ${totalHold}`, "—"],
                        ["Total PnL", `₹${totalPnlStrat.toFixed(0)}`, niftyReturn != null ? `₹${(actualDeployed * niftyReturn / 100).toFixed(0)}` : "—"],
                      ].map(([metric, strat, nifty], i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #0e0e20" }}>
                          <td style={{ padding: "7px 10px", color: "#889" }}>{metric}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: "#dde0f0", fontWeight: 700 }}>{strat}</td>
                          <td style={{ padding: "7px 10px", textAlign: "right", color: "#88bbcc" }}>{nifty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* PER-STOCK BREAKDOWN TABLE */}
                <div style={{ background: "#0a0a1c", border: "1px solid #141428", borderRadius: 8, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: "#00d084", letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>PER-STOCK BREAKDOWN — AGGREGATED FROM PORTFOLIO TRADES</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, minWidth: 800 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #1a1a32" }}>
                          {["#", "STOCK", "PERIOD", "TRADES", "W/L", "SL", "TGT", "HOLD", "WIN %", "PnL", "RETURN"].map(h => (
                            <th key={h} style={{ padding: "6px 8px", textAlign: h === "STOCK" || h === "PERIOD" ? "left" : "right", color: "#555", fontWeight: 700, letterSpacing: 1, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stockSim.map((s, i) => {
                          const wr = s.trades > 0 ? (s.wins / s.trades) * 100 : 0;
                          const retPct = NOTIONAL > 0 ? (s.pnl / NOTIONAL) * 100 : 0;
                          return (
                          <tr key={s.symbol} style={{ borderBottom: "1px solid #0e0e20" }}>
                            <td style={{ padding: "7px 8px", color: "#444", textAlign: "right" }}>{i + 1}</td>
                            <td style={{ padding: "7px 8px", color: "#dde0f0", fontWeight: 700, textAlign: "left" }}>
                              {s.name}
                              <span style={{ color: "#444", fontWeight: 400, marginLeft: 6 }}>{s.symbol.replace(".NS", "")}</span>
                            </td>
                            <td style={{ padding: "7px 8px", color: "#444", textAlign: "left", fontSize: 8 }}>{s.firstDate} → {s.lastDate}</td>
                            <td style={{ padding: "7px 8px", color: "#889", textAlign: "right" }}>{s.trades}</td>
                            <td style={{ padding: "7px 8px", color: "#889", textAlign: "right" }}>{s.wins}/{s.trades - s.wins}</td>
                            <td style={{ padding: "7px 8px", color: "#ff4d6d", textAlign: "right" }}>{s.sl}</td>
                            <td style={{ padding: "7px 8px", color: "#00d084", textAlign: "right" }}>{s.tgt}</td>
                            <td style={{ padding: "7px 8px", color: "#00b4d8", textAlign: "right" }}>{s.hold}</td>
                            <td style={{ padding: "7px 8px", color: wr > 55 ? "#00d084" : "#f0b429", textAlign: "right" }}>{wr.toFixed(0)}%</td>
                            <td style={{ padding: "7px 8px", color: s.pnl >= 0 ? "#00d084" : "#ff4d6d", textAlign: "right", fontWeight: 700 }}>
                              {s.pnl >= 0 ? "+" : ""}₹{s.pnl.toFixed(0)}
                            </td>
                            <td style={{ padding: "7px 8px", color: retPct >= 0 ? "#00d084" : "#ff4d6d", textAlign: "right", fontWeight: 700 }}>
                              {retPct >= 0 ? "+" : ""}{retPct.toFixed(1)}%
                            </td>
                          </tr>
                          );
                        })}
                        {/* Totals row */}
                        <tr style={{ borderTop: "2px solid #00d08444" }}>
                          <td colSpan={3} style={{ padding: "8px 8px", color: "#00d084", fontWeight: 700, textAlign: "left", letterSpacing: 1 }}>TOTAL ({uniqueStocks} stocks)</td>
                          <td style={{ padding: "8px 8px", color: "#dde0f0", fontWeight: 700, textAlign: "right" }}>{totalTrds}</td>
                          <td style={{ padding: "8px 8px", color: "#889", textAlign: "right" }}>{totalWins}/{totalTrds - totalWins}</td>
                          <td style={{ padding: "8px 8px", color: "#ff4d6d", textAlign: "right" }}>{totalSL}</td>
                          <td style={{ padding: "8px 8px", color: "#00d084", textAlign: "right" }}>{totalTgt}</td>
                          <td style={{ padding: "8px 8px", color: "#00b4d8", textAlign: "right" }}>{totalHold}</td>
                          <td />
                          <td style={{ padding: "8px 8px", color: totalPnlStrat >= 0 ? "#00d084" : "#ff4d6d", fontWeight: 700, textAlign: "right" }}>
                            {totalPnlStrat >= 0 ? "+" : ""}₹{totalPnlStrat.toFixed(0)}
                          </td>
                          <td style={{ padding: "8px 8px", color: stratReturn >= 0 ? "#00d084" : "#ff4d6d", fontWeight: 700, textAlign: "right" }}>
                            {stratReturn >= 0 ? "+" : ""}{stratReturn.toFixed(1)}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* RISK ANALYSIS */}
                <div style={{ background: "#0a0a1c", border: "1px solid #141428", borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 10, color: "#00d084", letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>RISK ANALYSIS</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                    <div style={{ background: "#070712", borderRadius: 6, padding: 12 }}>
                      <div style={{ fontSize: 8, color: "#555", letterSpacing: 1, marginBottom: 6 }}>BEST PERFORMER</div>
                      <div style={{ fontSize: 12, color: "#00d084", fontWeight: 700 }}>{best?.name || "—"}</div>
                      <div style={{ fontSize: 10, color: "#00d084" }}>{best ? `+₹${best.pnl.toFixed(0)} (${best.trades} trades)` : "—"}</div>
                    </div>
                    <div style={{ background: "#070712", borderRadius: 6, padding: 12 }}>
                      <div style={{ fontSize: 8, color: "#555", letterSpacing: 1, marginBottom: 6 }}>WORST PERFORMER</div>
                      <div style={{ fontSize: 12, color: "#ff4d6d", fontWeight: 700 }}>{worst?.name || "—"}</div>
                      <div style={{ fontSize: 10, color: worst && worst.pnl >= 0 ? "#00d084" : "#ff4d6d" }}>
                        {worst ? `${worst.pnl >= 0 ? "+" : ""}₹${worst.pnl.toFixed(0)} (${worst.trades} trades)` : "—"}
                      </div>
                    </div>
                    <div style={{ background: "#070712", borderRadius: 6, padding: 12 }}>
                      <div style={{ fontSize: 8, color: "#555", letterSpacing: 1, marginBottom: 6 }}>CONCENTRATION RISK</div>
                      <div style={{ fontSize: 12, color: concPct > 60 ? "#ff4d6d" : "#f0b429", fontWeight: 700 }}>{concPct.toFixed(0)}%</div>
                      <div style={{ fontSize: 9, color: "#666" }}>of PnL from top stock</div>
                    </div>
                    <div style={{ background: "#070712", borderRadius: 6, padding: 12 }}>
                      <div style={{ fontSize: 8, color: "#555", letterSpacing: 1, marginBottom: 6 }}>PORTFOLIO SORTINO</div>
                      <div style={{ fontSize: 12, color: wSortino > 2 ? "#00d084" : "#f0b429", fontWeight: 700 }}>{wSortino.toFixed(2)}</div>
                      <div style={{ fontSize: 9, color: "#666" }}>downside risk-adjusted</div>
                    </div>
                    <div style={{ background: "#070712", borderRadius: 6, padding: 12 }}>
                      <div style={{ fontSize: 8, color: "#555", letterSpacing: 1, marginBottom: 6 }}>STRATEGY CAGR</div>
                      <div style={{ fontSize: 12, color: stratCAGR >= 0 ? "#00d084" : "#ff4d6d", fontWeight: 700 }}>{stratCAGR.toFixed(1)}%</div>
                      <div style={{ fontSize: 9, color: "#666" }}>annualised</div>
                    </div>
                    <div style={{ background: "#070712", borderRadius: 6, padding: 12 }}>
                      <div style={{ fontSize: 8, color: "#555", letterSpacing: 1, marginBottom: 6 }}>UNIQUE STOCKS</div>
                      <div style={{ fontSize: 12, color: "#dde0f0", fontWeight: 700 }}>{uniqueStocks}</div>
                      <div style={{ fontSize: 9, color: "#666" }}>traded by model</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          );
        })()}

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
