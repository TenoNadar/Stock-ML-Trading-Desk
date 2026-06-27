# Stock ML Trading Desk

Combined repo for the Python ML stock recommender and the React/Vite trading UI.

- `ml/`: Python recommender that downloads Yahoo Finance data, trains/backtests XGBoost, LightGBM, Random Forest, and ensemble models, then writes `ml/ml_results_final.json`.
- `src/`: React UI with Signal Engine and ML Portfolio views.
- `scripts/ml-server.mjs`: local bridge API that runs the Python model and copies fresh results into `public/ml_results_final.json`.

For the model methodology, daily workflow, and how stop loss/targets/R:R/holding periods are calculated, read:

[`ML_TRADING_README.md`](./ML_TRADING_README.md)

## Setup

Install frontend dependencies:

```bash
npm install
```

Install Python dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
```

## Run The Combined App

```bash
PYTHON=.venv/bin/python npm run dev
```

Then open:

```text
http://127.0.0.1:5173/
```

Use the **RUN ML BACKTEST** button in the top bar. The UI stays open while the Python model runs against the latest available Yahoo Finance daily candles. When the run completes, the backend copies `ml/ml_results_final.json` to `public/ml_results_final.json`, the ML Portfolio remounts, and a completion popup appears.

## Run The ML Model Only

```bash
source .venv/bin/activate
npm run ml:run
cp ml/ml_results_final.json public/ml_results_final.json
```

## Validate

```bash
npm run lint
npm run build
```
