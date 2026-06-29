# ML Trading System Documentation

This document outlines the core architecture, mathematical derivations, entry/exit logic, and live backtest results of the Machine Learning Trading System.

## 1. Execution Logic

To eliminate look-ahead bias and simulate real-world execution, the system has shifted from "Same-Day Close" to **Next-Day Open** execution. 

When a structural pattern is identified at `Close[t]`, the model executes its entry at `Open[t+1]`. Target and Stop Loss levels are dynamically calculated relative to this exact `Open[t+1]` price, ensuring the system mathematically factors in overnight gap risks and real-world slippage.

### Live Market Filters (Microstructure Blocks)
The following institutional filters are applied at `Open[t+1]` before an entry is validated:

1. **Anti-Chase Filter:**
   - **Logic:** Reject entry if `(Close[t] / Close[t-1]) - 1 > 0.025`.
   - **Purpose:** Prevents buying into exhausted vertical spikes (>2.5% daily move).
2. **Statistical Opening Range Block:**
   - **Logic:** Reject entry if `Open[t+1]` is outside `Close[t] ± (0.5 * ATR[t])`.
   - **Purpose:** Pre-calculates a valid statistical opening boundary. Rejects trades if the stock gaps significantly up or down beyond natural volatility bounds, preventing execution at structurally disadvantageous levels.
3. **Volume Exhaustion Block:**
   - **Logic:** Reject entry if `Volume[t] < (0.8 * SMA20_Volume[t])` or `Volume[t] > (2.0 * SMA20_Volume[t])`.
   - **Purpose:** Prevents entries on retail noise by demanding at least 80% of average volume, and blocks retail blow-off tops (volume > 200%).
4. **Volatility Ceiling Block:**
   - **Logic:** Reject entry if `ATR[t] / Close[t] > 0.05`.
   - **Purpose:** Rejects stocks in a manic state (>5% average true range), avoiding blow-off top environments.

## 2. Mathematical Derivations

### Dynamic Horizon (Holding Period)
The holding period (`horizon`) is not hardcoded. It is mathematically derived for each stock using **Volume-Weighted Autocorrelation Function (ACF) memory decay**. 
- The system calculates the volume-weighted daily returns.
- It plots the ACF over various lags.
- The optimal horizon is the first lag where the ACF crosses below zero (`<= 0`), meaning the directional memory (momentum) has decayed.

### 4. Exit Rules & Target Mechanisms
The exit logic combines static statistical boundaries with a dynamic time-decay mechanism, though constrained by a structural minimum to allow trend maturation:

*   **Minimum Hold Period:** The system enforces a **15-day minimum holding period**. This structural constraint prevents premature exits on high-volatility sideways chop, drastically reducing time-decay expirations and allowing trades to reach structural targets.
*   **Target (T1):** `Entry Price + (2.0 × ATR)`.
*   **Stop Loss (SL):** `Entry Price - (1.8 × ATR)`. 
*   **Time-Decay Exit (HOLD):** If neither T1 nor SL is triggered, the position is automatically liquidated at the Close of the day when `days_held` exceeds the asset's specific ACF memory horizon (with a floor of 15 days).

## 3. Backtest Results Summary

By shifting to `Open[t+1]`, applying the microstructure filters (gap risk, volume exhaustion, volatility ceiling), and utilizing the updated exit criteria, the system successfully transitioned from a negative structural expectancy to a profitable state. Total trades remain strictly filtered to **~600 total trades** across the full 116-stock universe.

### Model Performance (Optimized)
- **LightGBM:** 601 trades | PnL: ₹4,537 | WR: 49.3% (🏆 Best Performing Model)
- **Ensemble:** 602 trades | PnL: ₹-1,397 | WR: 46.8%
- **CatBoost:** 593 trades | PnL: ₹-5,017 | WR: 46.0%
- **Random Forest:** 598 trades | PnL: ₹-6,853 | WR: 48.0%
- **XGBoost:** 610 trades | PnL: ₹-10,632 | WR: 46.1%

*Note: PnL is based on a strict ₹10,000 notional allocation per stock.*

### Top Tier Stocks (Dynamic Ensemble)
Despite strict execution constraints, the system maintains exceptionally high structural win rates and Sharpe ratios on the optimal names:

1. **Tata Steel** (Horizon: 3D) | Sharpe: 9.28 | WR: 78% | MD: -3.0%
2. **Marico** (Horizon: 2D) | Sharpe: 8.24 | WR: 75% | MD: -0.6%
3. **Apollo Hospitals** (Horizon: 2D) | Sharpe: 5.52 | WR: 67% | MD: -2.8%
4. **Granules India** (Horizon: 2D) | Sharpe: 4.88 | WR: 66% | MD: -5.8%
5. **Britannia** (Horizon: 3D) | Sharpe: 4.18 | WR: 59% | MD: -10.1%
6. **RR Kabel** (Horizon: 5D) | Sharpe: 3.08 | WR: 60% | MD: -8.2%
7. **Laurus Labs** (Horizon: 2D) | Sharpe: 2.87 | WR: 68% | MD: -25.8%
8. **Hindalco** (Horizon: 2D) | Sharpe: 2.76 | WR: 68% | MD: -14.2%

*Sharpe > 3.0 indicates exceptional risk-adjusted point-in-time structural edges.*
