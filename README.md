# NSE Portfolio Tracker

React/Vite UI for two related trading tools:

- **Signal Engine**: live Yahoo Finance chart-data scanner that ranks a fixed NSE universe with technical indicators, breakout rules, option-pricing estimates, and risk/reward.
- **ML Portfolio**: displays the Python ML model output from `public/ml_results_final.json`, including model-ranked stocks, entry, stop loss, targets, holding period, and backtest metrics.

For the model methodology, daily workflow, and how stop loss/targets/R:R/holding periods are calculated, read:

[`ML_TRADING_README.md`](./ML_TRADING_README.md)

## Run The UI

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Then open:

```text
http://127.0.0.1:5173/
```

## Validate

```bash
npm run lint
npm run build
```
