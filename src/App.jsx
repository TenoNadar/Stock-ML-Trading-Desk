import { useState } from "react";
import OptionsTrader from "./OptionsTrader.jsx";
import PortfolioTracker from "./PortfolioTracker.jsx";

function App() {
  const [view, setView] = useState("signals");

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
      </div>
      {view === "signals" ? <OptionsTrader /> : <PortfolioTracker />}
    </div>
  );
}

export default App;
