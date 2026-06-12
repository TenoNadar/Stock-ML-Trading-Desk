# ML Stock Recommendation Workflow

This project has two recommendation surfaces:

- **ML Portfolio** uses the Python ML output in `public/ml_results_final.json`.
- **Signal Engine** uses live Yahoo Finance chart data plus technical/risk rules. It is not the same model as the ML Portfolio.

This is decision-support software, not financial advice. Before placing any real trade, confirm the latest price, liquidity, spread, news, corporate actions, and your risk size.

## Is It Ready For June 12, 2026?

The saved ML result file in the ML project was generated on **June 10, 2026 at 20:58:09 IST**. The copy used by the UI was copied into `public/ml_results_final.json` on **June 11, 2026 at 19:20:32 IST**.

For trading on **June 12, 2026**, run the ML model again after the June 11 market close, or before market open on June 12, so entry/SL/target levels use the latest available candle. Do not rely blindly on stale saved prices if the current market price has moved materially.

## Latest Data Check For Current Top ML Picks

The current JSON does not store `last_data_date`, so this table was checked separately against Yahoo Finance on June 11, 2026.

| Symbol | Name | Latest Yahoo Candle | Saved ML Entry | Latest Yahoo Close | Status |
|---|---:|---:|---:|---:|---|
| TITAN.NS | Titan | 2026-06-11 | 4042.10 | 4025.20 | Fresh |
| MFSL.NS | M&S Financial | 2026-06-11 | 1598.30 | 1562.10 | Fresh |
| ASIANPAINT.NS | Asian Paints | 2026-06-11 | 2715.10 | 2690.90 | Fresh |
| SUNPHARMA.NS | Sun Pharma | 2026-06-11 | 1786.40 | 1794.20 | Fresh |
| ASTRAL.NS | Astral | 2026-06-11 | 1501.50 | 1490.20 | Fresh |
| IDFCFIRSTB.NS | IDFC First Bank | 2026-06-11 | 72.99 | 72.95 | Fresh |
| VOLTAS.NS | Voltas | 2026-06-11 | 1290.00 | 1277.30 | Fresh |
| JBCHEPHARM.NS | JB Chemicals | 2026-06-11 | 2201.50 | 2252.70 | Fresh |
| ULTRACEMCO.NS | UltraTech Cement | 2026-06-11 | 10866.00 | 10830.00 | Fresh |
| ICICIBANK.NS | ICICI Bank | 2026-06-11 | 1293.30 | 1317.00 | Fresh |
| ERIS.NS | Eris Lifesciences | 2026-06-11 | 1366.90 | 1365.60 | Fresh |
| LTIM.NS | LTIMindtree | No Yahoo data | 286.39 | N/A | Check ticker/name change |
| PERSISTENT.NS | Persistent | 2026-06-11 | 4928.00 | 4874.00 | Fresh |
| SONACOMS.NS | Sona BLW | 2026-06-11 | 589.25 | 585.10 | Fresh |
| ONGC.NS | ONGC | 2026-06-11 | 251.90 | 252.60 | Fresh |
| HINDALCO.NS | Hindalco | 2026-06-11 | 1039.30 | 1024.30 | Fresh |
| CUMMINSIND.NS | Cummins India | 2026-06-11 | 5609.50 | 5557.00 | Fresh |
| WAAREEENER.NS | Waaree Energies | 2026-06-11 | 3017.20 | 3013.90 | Fresh |
| ANGELONE.NS | Angel One | 2026-06-11 | 329.85 | 323.75 | Fresh |
| NESTLEIND.NS | Nestle India | 2026-06-11 | 1438.30 | 1422.50 | Fresh |

Note: `LTIM.NS` returned no Yahoo data during the check. LTIMindtree was reported as renamed to LTM Limited in 2026, so verify the live exchange/Yahoo ticker before trading it.

## Should You Run The ML Model Every Day?

Yes. Run it once per trading day after the NSE close, or before the next session, if you want tomorrow's recommendations.

Daily run is recommended because:

- the latest close changes the model features,
- ATR changes stop loss and target distances,
- the best-ranked stocks can rotate,
- stale entries can become chase entries after a gap,
- corporate-action or ticker changes can invalidate symbols.

After running the Python model, copy the new output into the UI:

```bash
cp /Users/tenoasir/Desktop/files/ml_results_final.json /Users/tenoasir/Desktop/nse-portfolio-tracker/public/ml_results_final.json
npm run build
```

## How The ML Model Recommends Stocks

The Python model in `/Users/tenoasir/Desktop/files/ML_SYSTEM_FOR_YOUR_MACHINE.py` does this per stock:

1. Downloads about **2 years** of daily OHLCV data from Yahoo Finance.
2. Builds technical features such as RSI, MACD, ATR, Bollinger position, volatility, volume ratios, moving averages, and momentum.
3. Creates forward-looking labels for **3-day, 5-day, and 7-day** horizons.
4. Trains an ensemble of:
   - XGBoost
   - LightGBM
   - Random Forest
5. Backtests model probabilities on the later part of the dataset.
6. Ranks each stock by risk-adjusted backtest quality.
7. Emits the top ensemble results into `ml_results_final.json`.

## How The Target Label Works

The model does not simply ask, "Did price close higher?"

For each candidate horizon, it calculates a **volume + time weighted forward return**:

- later days in the holding window receive higher time weight,
- high-volume forward days receive higher volume weight,
- the move must exceed `MIN_WEIGHTED_RETURN`,
- forward drawdown must stay better than `MAX_FORWARD_DD`,
- entries are filtered by `CHASE_FILTER` so the model avoids buying after oversized one-day moves.

This rewards sustained, tradable moves more than quick spikes that immediately fade.

## How Holding Period Is Decided

The model tests three holding windows for each stock:

- 3 trading days
- 5 trading days
- 7 trading days

For each horizon it computes backtest metrics, then picks the horizon with the best composite score:

```text
composite score =
  35% Sharpe
+ 35% Sortino
+  5% average return
+ 25% max drawdown score
```

Max drawdown is negative, so a smaller drawdown improves the score. The chosen horizon becomes `best_horizon`.

## How Entry Is Decided

The saved `price` is the latest close from the dataset used when the model ran.

In practice:

- Treat `price` as a reference entry level.
- If the live price is close to the saved entry, the setup is still aligned.
- If the live price has moved far above entry, skip or rerun the model because the setup may be a chase.
- If the live price is below entry, confirm the signal is not invalidated by trend/news before entering.

## How Stop Loss Is Decided

The model calculates 14-day ATR from the latest data.

```text
SL = entry price - 2.2 * ATR
```

This makes the stop volatility-adjusted:

- volatile stocks get wider stops,
- calmer stocks get tighter stops,
- every stock is normalized by its own recent movement.

## How Targets Are Decided

The targets use ATR and scale with the selected holding period.

```text
hold_scale = best_horizon / 5
T1 = entry price + 1.3 * ATR * hold_scale
T2 = entry price + 2.5 * ATR * hold_scale
```

So:

- 3-day setups get closer targets,
- 5-day setups use the base target distance,
- 7-day setups get wider targets.

## How R:R Is Calculated

The UI/report calculates risk/reward using target 1:

```text
risk = entry price - stop loss
reward = target 1 - entry price
R:R = reward / risk
```

Because the formulas are ATR-based:

| Best Horizon | Approx T1 R:R |
|---:|---:|
| 3D | 0.35 |
| 5D | 0.59 |
| 7D | 0.83 |

T2 has a higher reward distance and should be treated as the runner target, not the primary R:R shown in the cards.

## What The Metrics Mean

- **Sharpe**: return per unit of volatility. Higher is better, but extremely high Sharpe with very few trades can be fragile.
- **Sortino**: like Sharpe, but focuses on downside volatility.
- **Max drawdown**: worst cumulative backtest dip.
- **Win rate**: percentage of positive historical signals.
- **Trades**: number of backtested model signals. More trades usually means more reliable evidence.
- **CV accuracy**: cross-validation accuracy during training. It is useful, but less important than forward backtest quality.

## Practical Daily Checklist

Before market open:

1. Run the ML model after the most recent close.
2. Copy `ml_results_final.json` into the UI `public` folder.
3. Open the UI and check ML Portfolio top stocks.
4. Compare saved entry with live price.
5. Avoid stale, gapped, suspended, or ticker-changed stocks.
6. Risk only a fixed percentage per trade.
7. Do not enter if the stock is already far beyond entry or near target.

## Recommended Improvement

Add these fields to the Python JSON output in the next ML-script update:

```json
{
  "generated_at": "2026-06-11T20:00:00+05:30",
  "last_data_date": "2026-06-11",
  "data_source": "Yahoo Finance"
}
```

That will let the UI show exactly whether each recommendation is current enough for the next trading session.
