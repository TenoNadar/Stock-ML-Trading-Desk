import { useCallback, useEffect, useRef, useState } from "react";
import OptionsTrader from "./OptionsTrader.jsx";
import PortfolioTracker from "./PortfolioTracker.jsx";

const ML_API = "http://127.0.0.1:8787";

function App() {
  const [view, setView] = useState("signals");
  const [mlStatus, setMlStatus] = useState({ state: "idle", message: "ML API not checked yet." });
  const [notice, setNotice] = useState(null);
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const lastCompletionRef = useRef(null);

  const fetchMlStatus = useCallback(async () => {
    try {
      const res = await fetch(`${ML_API}/api/ml/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMlStatus(data);

      if (data.state === "completed" && data.completedAt && data.completedAt !== lastCompletionRef.current) {
        lastCompletionRef.current = data.completedAt;
        setPortfolioVersion(v => v + 1);
        setView("portfolio");
        setNotice({
          title: "Backtest completed",
          body: `Updated ${data.analyzed || "all available"} stocks through ${data.lastDataDate || "the latest Yahoo candle"}.`,
        });
      }

      if (data.state === "error" && data.completedAt && data.completedAt !== lastCompletionRef.current) {
        lastCompletionRef.current = data.completedAt;
        setNotice({
          title: "Backtest failed",
          body: data.message || "The ML run did not complete.",
        });
      }
    } catch {
      setMlStatus({
        state: "offline",
        message: "ML API is offline. Start the app with npm run dev.",
      });
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(fetchMlStatus);
    const id = setInterval(fetchMlStatus, 3000);
    return () => clearInterval(id);
  }, [fetchMlStatus]);

  const runBacktest = async () => {
    setNotice(null);
    try {
      const res = await fetch(`${ML_API}/api/ml/run`, { method: "POST" });
      const data = await res.json();
      setMlStatus(data);
      if (!res.ok && res.status !== 409) throw new Error(data.message || `HTTP ${res.status}`);
    } catch (error) {
      setNotice({
        title: "Could not start ML",
        body: error.message || "Check that the ML API is running.",
      });
    }
  };

  const statusColor = {
    completed: "#00d084",
    running: "#f0b429",
    error: "#ff4d6d",
    offline: "#ff4d6d",
    idle: "#889",
  }[mlStatus.state] || "#889";

  return (
    <div style={{ minHeight: "100vh", background: "#04040d" }}>
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        gap: 8,
        alignItems: "center",
        padding: "8px 14px",
        background: "#050512",
        borderBottom: "1px solid #141428",
        fontFamily: "'IBM Plex Mono','Courier New',monospace",
      }}>
        <div style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 1, marginRight: 10 }}>
          NSE ML TRADING DESK
        </div>
        {[
          ["signals", "SIGNAL ENGINE"],
          ["portfolio", "ML PORTFOLIO"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{
              background: view === key ? "#00d084" : "#111126",
              color: view === key ? "#000" : "#889",
              border: "1px solid " + (view === key ? "#00d084" : "#242442"),
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              padding: "6px 10px",
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{
          color: statusColor,
          border: `1px solid ${statusColor}44`,
          background: `${statusColor}14`,
          borderRadius: 4,
          padding: "5px 8px",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1,
        }}>
          ML {String(mlStatus.state || "idle").toUpperCase()}
          {mlStatus.lastDataDate ? ` · DATA ${mlStatus.lastDataDate}` : ""}
        </div>
        <button
          onClick={runBacktest}
          disabled={mlStatus.state === "running"}
          style={{
            background: mlStatus.state === "running" ? "#332900" : "#00d084",
            color: mlStatus.state === "running" ? "#f0b429" : "#000",
            border: "none",
            borderRadius: 4,
            cursor: mlStatus.state === "running" ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            padding: "6px 10px",
          }}
        >
          {mlStatus.state === "running" ? "RUNNING BACKTEST" : "RUN ML BACKTEST"}
        </button>
      </div>
      {view === "signals" ? <OptionsTrader /> : <PortfolioTracker key={portfolioVersion} />}

      {notice && (
        <div style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 100,
          width: 340,
          background: "#080818",
          color: "#dde0f0",
          border: "1px solid #00d08455",
          borderRadius: 8,
          boxShadow: "0 18px 40px #0009",
          padding: 14,
          fontFamily: "'IBM Plex Mono','Courier New',monospace",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <div style={{ color: "#00d084", fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                {notice.title}
              </div>
              <div style={{ color: "#99a", fontSize: 10, lineHeight: 1.6 }}>
                {notice.body}
              </div>
            </div>
            <button
              onClick={() => setNotice(null)}
              style={{
                background: "#141428",
                color: "#889",
                border: "1px solid #242442",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
                lineHeight: 1,
                padding: "4px 7px",
              }}
            >
              x
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
