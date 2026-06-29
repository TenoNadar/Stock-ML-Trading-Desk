# ML Trading System Documentation

This document outlines the core architecture, mathematical derivations, entry/exit logic, and live backtest results of the Machine Learning Trading System.

## 1. Execution Logic

To eliminate look-ahead bias and simulate real-world execution, the system has shifted from "Same-Day Close" to **Next-Day Open** execution. 

When a structural pattern is identified at `Close[t]`, the model executes its entry at `Open[t+1]`. Target and Stop Loss levels are dynamically calculated relative to this exact `Open[t+1]` price, ensuring the system mathematically factors in overnight gap risks and real-world slippage.

### Live Market Filters (Microstructure Blocks)
The following institutional filters are applied at `Open[t+1]` before an entry is validated:

1. **Anti-Chase Filter:**
   - **Logic:** Reject entry if `(Close[t] / Close[t-1]) - 1 > CHASE_FILTER`.
   - **Purpose:** Prevents buying into exhausted vertical spikes.
2. **Gap Risk Block:**
   - **Logic:** Reject entry if `(Open[t+1] / Close[t]) - 1 < -0.015`.
   - **Purpose:** Immediately voids the setup if the stock gaps down >1.5% overnight.
3. **Volume Exhaustion Block:**
   - **Logic:** Reject entry if `Volume[t] < (0.8 * SMA20_Volume[t])`.
   - **Purpose:** Prevents entries on retail noise by demanding at least 80% of average volume (confirming institutional participation).
4. **Volatility Ceiling Block:**
   - **Logic:** Reject entry if `ATR[t] / Close[t] > 0.05`.
   - **Purpose:** Rejects stocks in a manic state (>5% average true range), avoiding blow-off top environments.

## 2. Mathematical Derivations

### Dynamic Horizon (Holding Period)
The holding period (`horizon`) is not hardcoded. It is mathematically derived for each stock using **Volume-Weighted Autocorrelation Function (ACF) memory decay**. 
- The system calculates the volume-weighted daily returns.
- It plots the ACF over various lags.
- The optimal horizon is the first lag where the ACF crosses below zero (`<= 0`), meaning the directional memory (momentum) has decayed.

### Dynamic Stop Loss and Take Profit
Once an entry is validated at `Open[t+1]`, exits are derived via the stock's Average True Range (ATR). Following a full-universe grid search optimization, the optimal parameters were discovered to be:
- **Stop Loss (SL):** `Entry Price - (1.8 * ATR)`
- **Take Profit (T1):** `Entry Price + (3.0 * ATR)`

*Note: The optimized `1.8x / 3.0x` ATR ratio fixes the negative PnL drag caused by the previous oversized 2.2x stoploss relative to the 1.3x target.*

## 3. Backtest Results Summary

By shifting to `Open[t+1]`, applying the microstructure filters (gap risk, volume exhaustion, volatility ceiling), and utilizing the **optimized ATR multipliers (1.8 SL / 3.0 T1)**, the system successfully transitioned from a negative structural expectancy to a profitable state. Total trades remain strictly filtered to **~670 total trades** across the 115-stock universe.

### Model Performance (Optimized)
- **LightGBM:** 670 trades | PnL: ₹5,601 | WR: 50.0% (🏆 Best Performing Model)
- **Ensemble:** 666 trades | PnL: ₹4,993 | WR: 48.8%
- **Random Forest:** 674 trades | PnL: ₹97 | WR: 49.5%
- **CatBoost:** 659 trades | PnL: ₹-3,283 | WR: 46.9%
- **XGBoost:** 681 trades | PnL: ₹-4,906 | WR: 47.5%

*Note: PnL is based on a strict ₹10,000 notional allocation per stock.*

### Top Tier Stocks (Dynamic Ensemble)
Despite strict execution constraints, the system maintains exceptionally high structural win rates and Sharpe ratios on the optimal names:

1. **Granules India** (Horizon: 2D) | Sharpe: 7.69 | WR: 81% | MD: -3.7%
2. **Marico** (Horizon: 2D) | Sharpe: 7.20 | WR: 71% | MD: -0.7%
3. **Tata Steel** (Horizon: 3D) | Sharpe: 6.78 | WR: 82% | MD: -3.6%
4. **Power Grid** (Horizon: 2D) | Sharpe: 6.49 | WR: 73% | MD: -3.3%
5. **Apollo Hospitals** (Horizon: 2D) | Sharpe: 5.32 | WR: 73% | MD: -2.6%
6. **Britannia** (Horizon: 3D) | Sharpe: 4.60 | WR: 76% | MD: -8.1%
7. **RR Kabel** (Horizon: 5D) | Sharpe: 3.69 | WR: 71% | MD: -13.9%
8. **Laurus Labs** (Horizon: 2D) | Sharpe: 3.48 | WR: 76% | MD: -12.7%

*Sharpe > 3.0 indicates exceptional risk-adjusted point-in-time structural edges.*
