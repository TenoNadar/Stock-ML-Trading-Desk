"""
ML-POWERED TRADING SYSTEM — NIFTY 50 + MIDCAP + SMALLCAP
========================================================
This code runs on YOUR LOCAL MACHINE (not in restricted environments)

Instructions:
1. Install: pip install yfinance pandas scikit-learn numpy xgboost lightgbm
2. Run: python ML_SYSTEM_FOR_YOUR_MACHINE.py
3. Get: Entry/SL/Target levels from live Yahoo Finance data (2-year history)

Yahoo Finance is FREE and this code will work on your machine!
"""

import json
from datetime import datetime
from pathlib import Path

import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import TimeSeriesSplit
from sklearn.feature_selection import SelectFromModel
from sklearn.metrics import accuracy_score
from sklearn.base import clone
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
import warnings
warnings.filterwarnings('ignore')

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = SCRIPT_DIR.parent / "public" / "ml_results_final.json"

# HORIZON_CANDIDATES removed in favor of dynamic derivation
PREDICTION_THRESHOLD = 0.40
MIN_TRADES = 3
TRAIN_RATIO = 0.7
MIN_WEIGHTED_RETURN = 0.006   # min 0.6% volume+time weighted forward return
MAX_FORWARD_DD = 0.035        # max 3.5% adverse move in forward window
CHASE_FILTER = 0.05           # skip entry if prior day moved > 5%

# Try yfinance (if installed)
try:
    import yfinance as yf
    print("✓ yfinance is installed - will fetch REAL Yahoo Finance data")
    USE_REAL_DATA = True
except ImportError:
    print("⚠ yfinance not installed - will use simulated data")
    print("  Install with: pip install yfinance")
    USE_REAL_DATA = False

# ═══════════════════════════════════════════════════════════════
# STOCK UNIVERSE: NIFTY 50 + MIDCAP + SMALLCAP
# ═══════════════════════════════════════════════════════════════

_RAW_STOCKS = [
    # NIFTY 50
    ("ADANIENT.NS", "Adani Enterprises", "NIFTY50"),
    ("ADANIPORTS.NS", "Adani Ports", "NIFTY50"),
    ("APOLLOHOSP.NS", "Apollo Hospitals", "NIFTY50"),
    ("ASIANPAINT.NS", "Asian Paints", "NIFTY50"),
    ("AXISBANK.NS", "Axis Bank", "NIFTY50"),
    ("BAJAJ-AUTO.NS", "Bajaj Auto", "NIFTY50"),
    ("BAJFINANCE.NS", "Bajaj Finance", "NIFTY50"),
    ("BAJAJFINSV.NS", "Bajaj Finserv", "NIFTY50"),
    ("BEL.NS", "Bharat Electronics", "NIFTY50"),
    ("BPCL.NS", "BPCL", "NIFTY50"),
    ("BHARTIARTL.NS", "Bharti Airtel", "NIFTY50"),
    ("BRITANNIA.NS", "Britannia", "NIFTY50"),
    ("CIPLA.NS", "Cipla", "NIFTY50"),
    ("COALINDIA.NS", "Coal India", "NIFTY50"),
    ("DRREDDY.NS", "Dr Reddy's", "NIFTY50"),
    ("EICHERMOT.NS", "Eicher Motors", "NIFTY50"),
    ("GRASIM.NS", "Grasim", "NIFTY50"),
    ("HCLTECH.NS", "HCL Tech", "NIFTY50"),
    ("HDFCBANK.NS", "HDFC Bank", "NIFTY50"),
    ("HDFCLIFE.NS", "HDFC Life", "NIFTY50"),
    ("HEROMOTOCO.NS", "Hero MotoCorp", "NIFTY50"),
    ("HINDALCO.NS", "Hindalco", "NIFTY50"),
    ("HINDUNILVR.NS", "Hindustan Unilever", "NIFTY50"),
    ("ICICIBANK.NS", "ICICI Bank", "NIFTY50"),
    ("INDUSINDBK.NS", "IndusInd Bank", "NIFTY50"),
    ("INFY.NS", "Infosys", "NIFTY50"),
    ("ITC.NS", "ITC", "NIFTY50"),
    ("JSWSTEEL.NS", "JSW Steel", "NIFTY50"),
    ("KOTAKBANK.NS", "Kotak Bank", "NIFTY50"),
    ("LT.NS", "L&T", "NIFTY50"),
    ("M&M.NS", "Mahindra & Mahindra", "NIFTY50"),
    ("MARUTI.NS", "Maruti Suzuki", "NIFTY50"),
    ("NESTLEIND.NS", "Nestle India", "NIFTY50"),
    ("NTPC.NS", "NTPC", "NIFTY50"),
    ("ONGC.NS", "ONGC", "NIFTY50"),
    ("POWERGRID.NS", "Power Grid", "NIFTY50"),
    ("RELIANCE.NS", "Reliance", "NIFTY50"),
    ("SBILIFE.NS", "SBI Life", "NIFTY50"),
    ("SBIN.NS", "State Bank of India", "NIFTY50"),
    ("SHRIRAMFIN.NS", "Shriram Finance", "NIFTY50"),
    ("SUNPHARMA.NS", "Sun Pharma", "NIFTY50"),
    ("TATACONSUM.NS", "Tata Consumer", "NIFTY50"),
    ("TATAMOTORS.NS", "Tata Motors", "NIFTY50"),
    ("TATASTEEL.NS", "Tata Steel", "NIFTY50"),
    ("TCS.NS", "TCS", "NIFTY50"),
    ("TECHM.NS", "Tech Mahindra", "NIFTY50"),
    ("TITAN.NS", "Titan", "NIFTY50"),
    ("TRENT.NS", "Trent", "NIFTY50"),
    ("ULTRACEMCO.NS", "UltraTech Cement", "NIFTY50"),
    ("WIPRO.NS", "Wipro", "NIFTY50"),

    # EXISTING MIDCAP
    ("TRENT.NS", "Trent", "MID"),
    ("PERSISTENT.NS", "Persistent", "MID"),
    ("DIXON.NS", "Dixon Tech", "MID"),
    ("KAYNES.NS", "Kaynes Tech", "MID"),
    ("KPITTECH.NS", "KPIT Tech", "MID"),
    ("ETERNAL.NS", "Eternal (Zomato)", "MID"),
    ("PAYTM.NS", "Paytm", "MID"),
    ("ANGELONE.NS", "Angel One", "MID"),
    ("IRCTC.NS", "IRCTC", "MID"),
    ("CDSL.NS", "CDSL", "MID"),
    ("INDHOTEL.NS", "Indian Hotels", "MID"),
    ("VOLTAS.NS", "Voltas", "MID"),
    ("NYKAA.NS", "Nykaa", "MID"),
    ("POLICYBZR.NS", "PB Fintech", "MID"),
    ("MFSL.NS", "M&S Financial", "MID"),

    # ADDITIONAL MIDCAP (+20)
    ("AUBANK.NS", "AU Small Finance", "MID"),
    ("CHOLAFIN.NS", "Cholamandalam Finance", "MID"),
    ("COFORGE.NS", "Coforge", "MID"),
    ("CONCOR.NS", "Container Corp", "MID"),
    ("CUMMINSIND.NS", "Cummins India", "MID"),
    ("DELHIVERY.NS", "Delhivery", "MID"),
    ("GODREJPROP.NS", "Godrej Properties", "MID"),
    ("HUDCO.NS", "HUDCO", "MID"),
    ("IDFCFIRSTB.NS", "IDFC First Bank", "MID"),
    ("IEX.NS", "Indian Energy Exchange", "MID"),
    ("JUBLFOOD.NS", "Jubilant Foodworks", "MID"),
    ("LTIM.NS", "LTIMindtree", "MID"),
    ("MARICO.NS", "Marico", "MID"),
    ("MAXHEALTH.NS", "Max Healthcare", "MID"),
    ("MUTHOOTFIN.NS", "Muthoot Finance", "MID"),
    ("PIIND.NS", "PI Industries", "MID"),
    ("PNBHOUSING.NS", "PNB Housing", "MID"),
    ("SONACOMS.NS", "Sona BLW", "MID"),
    ("TATAELXSI.NS", "Tata Elxsi", "MID"),
    ("TIINDIA.NS", "Tube Investments", "MID"),

    # EXISTING SMALLCAP
    ("HAPPSTMNDS.NS", "Happiest Minds", "SMALL"),
    ("WAAREEENER.NS", "Waaree Energies", "SMALL"),
    ("ZAGGLE.NS", "Zaggle", "SMALL"),
    ("SYRMA.NS", "Syrma SGS", "SMALL"),
    ("RRKABEL.NS", "RR Kabel", "SMALL"),
    ("SENCO.NS", "Senco Gold", "SMALL"),
    ("NAZARA.NS", "Nazara Tech", "SMALL"),
    ("IDEAFORGE.NS", "Ideaforge", "SMALL"),
    ("SIGNATURE.NS", "Signature Global", "SMALL"),
    ("EQUITASBNK.NS", "Equitas", "SMALL"),
    ("CAMS.NS", "CAMS", "SMALL"),
    ("ORIENTELEC.NS", "Orient Electric", "SMALL"),
    ("DOMS.NS", "Doms Industries", "SMALL"),
    ("SUPRIYA.NS", "Supriya Lifescience", "SMALL"),

    # ADDITIONAL SMALLCAP (+20)
    ("AARTIDRUGS.NS", "Aarti Drugs", "SMALL"),
    ("APLAPOLLO.NS", "APL Apollo", "SMALL"),
    ("ASTRAL.NS", "Astral", "SMALL"),
    ("BALAMINES.NS", "Balaji Amines", "SMALL"),
    ("CARTRADE.NS", "CarTrade", "SMALL"),
    ("CEATLTD.NS", "CEAT", "SMALL"),
    ("CERA.NS", "Cera Sanitaryware", "SMALL"),
    ("CLEAN.NS", "Clean Science", "SMALL"),
    ("ERIS.NS", "Eris Lifesciences", "SMALL"),
    ("GRANULES.NS", "Granules India", "SMALL"),
    ("JBCHEPHARM.NS", "JB Chemicals", "SMALL"),
    ("KALYANKJIL.NS", "Kalyan Jewellers", "SMALL"),
    ("KRBL.NS", "KRBL", "SMALL"),
    ("LAURUSLABS.NS", "Laurus Labs", "SMALL"),
    ("METROPOLIS.NS", "Metropolis Healthcare", "SMALL"),
    ("NAVINFLUOR.NS", "Navin Fluorine", "SMALL"),
    ("PRAJIND.NS", "Praj Industries", "SMALL"),
    ("REDINGTON.NS", "Redington", "SMALL"),
    ("ROUTE.NS", "Route Mobile", "SMALL"),
    ("SOBHA.NS", "Sobha", "SMALL"),
]

# Deduplicate by symbol (first category wins: NIFTY50 > MID > SMALL)
_seen = set()
STOCKS = []
for symbol, name, cap in _RAW_STOCKS:
    if symbol not in _seen:
        _seen.add(symbol)
        STOCKS.append((symbol, name, cap))

# ═══════════════════════════════════════════════════════════════
# FETCH DATA (REAL from Yahoo Finance OR SIMULATED)
# ═══════════════════════════════════════════════════════════════

def fetch_stock_data(symbol):
    """Fetch real Yahoo Finance data"""
    if not USE_REAL_DATA:
        return None
    try:
        df = yf.download(symbol, period="2y", progress=False, auto_adjust=True)
        if df is None or df.empty:
            return None
        df = df.reset_index()
        # Flatten MultiIndex columns from newer yfinance versions
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]
        df.columns = [str(c).strip() for c in df.columns]
        rename_map = {
            "Datetime": "Date",
            "Date": "Date",
            "Open": "Open",
            "High": "High",
            "Low": "Low",
            "Close": "Close",
            "Volume": "Volume",
        }
        df = df.rename(columns=rename_map)
        required = ["Date", "Open", "High", "Low", "Close", "Volume"]
        missing = [col for col in required if col not in df.columns]
        if missing:
            print(f"    ❌ Missing columns for {symbol}: {missing}")
            return None
        return df[required].dropna()
    except Exception as e:
        print(f"    ❌ Error fetching {symbol}: {str(e)[:40]}")
        return None

def generate_simulated_data(symbol, base_price=1500):
    """Generate realistic simulated OHLCV for demo"""
    np.random.seed(hash(symbol) % 2**32)
    
    dates = pd.date_range(end=pd.Timestamp.today().normalize(), periods=504, freq='B')
    returns = np.random.normal(0.0003, 0.016, 504)
    close_prices = base_price * np.cumprod(1 + returns)

    df = pd.DataFrame({
        'Date': dates,
        'Open': close_prices * (1 + np.random.normal(0, 0.005, 504)),
        'High': close_prices * (1 + np.abs(np.random.normal(0, 0.01, 504))),
        'Low': close_prices * (1 - np.abs(np.random.normal(0, 0.01, 504))),
        'Close': close_prices,
        'Volume': np.random.uniform(1e6, 5e6, 504).astype(int),
    })
    
    return df

# ═══════════════════════════════════════════════════════════════
# FEATURE ENGINEERING (look-ahead safe)
# ═══════════════════════════════════════════════════════════════

def kalman_filter_trend(series):
    n = len(series)
    xhat = np.zeros(n)
    P = np.zeros(n)
    xhatminus = np.zeros(n)
    Pminus = np.zeros(n)
    K = np.zeros(n)
    Q = 1e-5
    R = 1e-3
    xhat[0] = series.iloc[0]
    P[0] = 1.0
    for k in range(1, n):
        xhatminus[k] = xhat[k-1]
        Pminus[k] = P[k-1] + Q
        K[k] = Pminus[k] / (Pminus[k] + R)
        xhat[k] = xhatminus[k] + K[k] * (series.iloc[k] - xhatminus[k])
        P[k] = (1 - K[k]) * Pminus[k]
    return pd.Series(xhat, index=series.index)

def garman_klass_volatility(open_p, high_p, low_p, close_p, window=20):
    log_hl = np.log(high_p / low_p)
    log_co = np.log(close_p / open_p)
    rs = 0.5 * log_hl**2 - (2 * np.log(2) - 1) * log_co**2
    return np.sqrt(rs.rolling(window=window).mean())

def rolling_hurst_exponent(series, window=60):
    def hurst(ts):
        lags = range(2, 20)
        tau = [np.sqrt(np.std(np.subtract(ts[lag:], ts[:-lag]))) for lag in lags]
        poly = np.polyfit(np.log(lags), np.log(tau), 1)
        return poly[0] * 2.0
    return series.rolling(window).apply(hurst, raw=True)

def fractional_diff(series, d=0.4, thres=0.01):
    w = [1.]
    for k in range(1, len(series)):
        w_k = -w[-1] / k * (d - k + 1)
        w.append(w_k)
    w = np.array(w)
    w_valid = w[np.abs(w) > thres]
    w_len = len(w_valid)
    w_valid = w_valid[::-1]
    res = np.full_like(series, np.nan, dtype=float)
    prices = series.values
    for i in range(w_len - 1, len(series)):
        res[i] = np.dot(w_valid, prices[i - w_len + 1 : i + 1])
    return pd.Series(res, index=series.index)

def calculate_atr(high, low, close, period=14):
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(period).mean()

def define_features(df):
    """Extract ML features with 1-day shift to avoid look-ahead bias."""
    X = pd.DataFrame(index=df.index)

    close = df['Close'].shift(1)
    high = df['High'].shift(1)
    low = df['Low'].shift(1)
    open_ = df['Open'].shift(1)
    volume = df['Volume'].shift(1)

    ret = close.pct_change().shift(1)
    X['returns'] = ret
    X['price_range'] = (high - low) / close
    X['close_pos'] = (close - low) / (high - low + 1e-8)
    X['body'] = abs(close - open_) / close
    X['gap'] = (open_ - close.shift(2)) / (close.shift(2) + 1e-8)

    X['vol_5'] = ret.shift(1).rolling(5).std()
    X['vol_10'] = ret.shift(1).rolling(10).std()
    X['vol_20'] = ret.shift(1).rolling(20).std()
    X['vol_ratio'] = X['vol_5'] / (X['vol_20'] + 1e-8)

    X['kalman_trend'] = kalman_filter_trend(close)
    X['kalman_dist'] = (close - X['kalman_trend']) / (X['kalman_trend'] + 1e-8)
    
    X['gk_vol'] = garman_klass_volatility(open_, high, low, close, 20)
    
    X['frac_diff_close'] = fractional_diff(close, d=0.4)
    X['frac_diff_vol'] = fractional_diff(volume, d=0.4)
    
    # Hurst takes a long time, we'll subsample or just use a small window if needed
    # We'll use window=30 to speed up
    X['hurst_30'] = rolling_hurst_exponent(close, window=30)

    X['vol_sma_ratio'] = volume / (volume.rolling(20).mean() + 1e-8)
    X['high_vol'] = np.where(X['vol_sma_ratio'] > 1.5, 1, 0)

    X['ret_lag_1'] = ret.shift(1)
    X['ret_lag_5'] = ret.shift(5)
    X['close_lag_1'] = close.shift(1)

    sma20 = close.rolling(20).mean()
    std20 = close.rolling(20).std()
    X['bb_pos'] = (close - (sma20 - 2 * std20)) / (4 * std20 + 1e-8)
    X['dist_sma'] = (close - sma20) / (sma20 + 1e-8)

    X['atr'] = calculate_atr(high, low, close, 14)

    vol_ma = volume.rolling(20).mean()
    X['vol_zscore'] = (volume - vol_ma) / (volume.rolling(20).std() + 1e-8)
    typical = (high + low + close) / 3
    vwap20 = (typical * volume).rolling(20).sum() / (volume.rolling(20).sum() + 1e-8)
    X['vwap_dist'] = (close - vwap20) / (vwap20 + 1e-8)
    X['ret_1d'] = close.pct_change()
    X['vol_weighted_mom'] = (ret * (volume / (vol_ma + 1e-8))).rolling(5).mean()

    return X.fillna(0).replace([np.inf, -np.inf], 0)

def time_decay_weights(horizon):
    """Later days in the forward window get higher weight (sustainability)."""
    w = np.arange(1, horizon + 1, dtype=float)
    return w / w.sum()

def derive_optimal_horizon(prices, volumes, min_h=2, max_h=15):
    """
    Mathematically derive the optimal holding period (horizon) using the
    zero-crossing of the Volume-Weighted Autocorrelation Function (ACF).
    """
    rets = np.log(prices / prices.shift(1)).fillna(0)
    vol_sma = volumes.rolling(window=20).mean()
    vol_ratio = (volumes / (vol_sma + 1e-8)).fillna(1)
    vw_rets = (rets * vol_ratio).dropna().values
    
    n = len(vw_rets)
    if n < max_h * 2:
        return 5
        
    mean = np.mean(vw_rets)
    var = np.var(vw_rets)
    if var == 0:
        return 5
        
    acf = []
    for lag in range(1, max_h + 2):
        cov = np.sum((vw_rets[:-lag] - mean) * (vw_rets[lag:] - mean)) / n
        acf.append(cov / var)
        
    optimal_h = max_h
    for lag_idx, val in enumerate(acf):
        if val <= 0:
            optimal_h = lag_idx + 1
            break
            
    return max(min_h, min(optimal_h, max_h))

def build_weighted_target(df, horizon):
    """
    Binary label using volume + time-decay weighted forward daily returns.
    Rewards sustained moves; penalises spike-then-fade via drawdown filter.
    """
    close = df['Close'].values
    low = df['Low'].values
    volume = df['Volume'].values
    n = len(df)
    labels = np.full(n, np.nan)
    tw = time_decay_weights(horizon)

    for i in range(n - horizon):
        entry = close[i]
        if entry <= 0:
            continue

        daily_rets = []
        day_vols = []
        forward_lows = []
        for j in range(1, horizon + 1):
            idx = i + j
            prev = close[idx - 1]
            daily_rets.append((close[idx] - prev) / (prev + 1e-8))
            day_vols.append(volume[idx])
            forward_lows.append(low[idx])

        avg_vol = np.mean(volume[max(0, i - 19):i + 1]) + 1e-8
        vol_w = np.array(day_vols) / avg_vol
        day_w = tw * vol_w
        day_w /= day_w.sum() + 1e-8

        weighted_ret = float(np.dot(day_w, daily_rets))
        max_dd = (min(forward_lows) - entry) / entry

        labels[i] = int(weighted_ret > MIN_WEIGHTED_RETURN and max_dd > -MAX_FORWARD_DD)

    return pd.Series(labels, index=df.index)

def build_target(df, horizon=5):
    """Alias — uses weighted volume+time target."""
    return build_weighted_target(df, horizon)

def valid_sample_mask(X, y):
    """Boolean mask aligned for both DataFrame features and numpy labels."""
    x_ok = (~X.isna().any(axis=1)).values if hasattr(X, 'isna') else ~np.isnan(X).any(axis=1)
    y_arr = np.asarray(y, dtype=float)
    return x_ok & ~np.isnan(y_arr)

def get_models(y_train=None):
    """XGBoost + LightGBM + Random Forest with class balancing."""
    scale_pos = 1.0
    if y_train is not None:
        pos = max(int((y_train == 1).sum()), 1)
        neg = max(int((y_train == 0).sum()), 1)
        scale_pos = neg / pos
    return {
        'xgboost': XGBClassifier(
            n_estimators=300,
            max_depth=8,
            min_child_weight=30,
            subsample=0.8,
            colsample_bytree=0.8,
            learning_rate=0.05,
            scale_pos_weight=scale_pos,
            random_state=42,
            n_jobs=-1,
            eval_metric='logloss',
        ),
        'lightgbm': LGBMClassifier(
            n_estimators=300,
            max_depth=8,
            min_child_samples=30,
            subsample=0.8,
            colsample_bytree=0.8,
            learning_rate=0.05,
            class_weight='balanced',
            random_state=42,
            n_jobs=-1,
            verbose=-1,
        ),
        'random_forest': RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            min_samples_leaf=30,
            max_features='sqrt',
            class_weight='balanced',
            random_state=42,
            n_jobs=-1,
        ),
    }

def cross_val_accuracy(model, X, y, n_splits=5):
    """Time-series cross-validation (no shuffle)."""
    tscv = TimeSeriesSplit(n_splits=n_splits)
    scores = []
    for train_idx, val_idx in tscv.split(X):
        m = clone(model)
        m.fit(X[train_idx], y[train_idx])
        scores.append(accuracy_score(y[val_idx], m.predict(X[val_idx])))
    return float(np.mean(scores)) if scores else 0.0

def compute_atr_array(high, low, close, period=14):
    """Compute ATR array for every bar using rolling average of True Range."""
    n = len(close)
    tr = np.empty(n)
    tr[0] = high[0] - low[0] if n > 0 else 0.0
    for i in range(1, n):
        tr[i] = max(high[i] - low[i], abs(high[i] - close[i-1]), abs(low[i] - close[i-1]))
    atr = pd.Series(tr).rolling(period, min_periods=1).mean().values
    return atr

def backtest_long_signals(probas, df_clean, start_idx, horizon, threshold=PREDICTION_THRESHOLD):
    """Long-only backtest with anti-chase filter and SL/target tracking."""
    trade_records = []
    
    # Pre-extract to numpy arrays for massive speedup
    open_arr = df_clean['Open'].values
    close_arr = df_clean['Close'].values
    high_arr = df_clean['High'].values
    low_arr = df_clean['Low'].values
    dates_arr = df_clean['Date'].values if 'Date' in df_clean.columns else None
    
    n_days = len(close_arr)
    
    for i in range(start_idx, n_days - horizon):
        if probas[i - start_idx] <= threshold:
            continue
        if i >= 1:
            prev_ret = abs((close_arr[i] - close_arr[i - 1]) / close_arr[i - 1])
            if prev_ret > CHASE_FILTER:
                continue
        entry = float(close_arr[i])

        # Compute ATR at entry (14-period) for point-in-time SL/target
        atr_start = max(1, i - 13)
        trs = []
        for j in range(atr_start, i + 1):
            tr = max(
                float(high_arr[j] - low_arr[j]),
                abs(float(high_arr[j] - close_arr[j - 1])),
                abs(float(low_arr[j] - close_arr[j - 1]))
            )
            trs.append(tr)
        atr = float(np.mean(trs)) if trs else entry * 0.02

        hold_scale = horizon / 5.0
        sl_price = entry - 2.2 * atr
        t1_price = entry + 1.3 * atr * hold_scale

        # Walk through holding period: check SL/target intra-trade
        actual_exit = float(close_arr[i + horizon])
        exit_reason = 'hold'
        for k in range(1, horizon + 1):
            day_open = float(open_arr[i + k])
            day_low = float(low_arr[i + k])
            day_high = float(high_arr[i + k])
            if day_open <= sl_price:
                actual_exit = day_open
                exit_reason = 'sl'
                break
            if day_low <= sl_price:
                actual_exit = sl_price
                exit_reason = 'sl'
                break
            if day_open >= t1_price:
                actual_exit = t1_price
                exit_reason = 'target'
                break
            if day_high >= t1_price:
                actual_exit = t1_price
                exit_reason = 'target'
                break

        pnl_pct = (actual_exit - entry) / entry * 100

        entry_date = ''
        if dates_arr is not None:
            entry_date = str(pd.to_datetime(dates_arr[i]).date())

        trade_records.append({
            'd': entry_date,
            'ep': round(entry, 2),
            'xp': round(actual_exit, 2),
            'sl': round(sl_price, 2),
            't1': round(t1_price, 2),
            'h': horizon,
            'pnl': round(pnl_pct, 2),
            'exit': exit_reason,
        })
    return trade_records

def compute_metrics(trade_results, horizon):
    if len(trade_results) < MIN_TRADES:
        return None
    if trade_results and isinstance(trade_results[0], dict):
        arr = np.array([t['pnl'] for t in trade_results])
    else:
        arr = np.array(trade_results)
    mean_r = float(np.mean(arr))
    std_r = float(np.std(arr)) + 1e-8
    sharpe = mean_r / std_r * np.sqrt(252 / horizon)

    downside = arr[arr < 0]
    down_std = float(np.std(downside)) + 1e-8 if len(downside) > 0 else std_r
    sortino = mean_r / down_std * np.sqrt(252 / horizon)

    cum = np.cumsum(arr)
    peak = np.maximum.accumulate(cum)
    max_dd = float(np.min(cum - peak)) if len(cum) else 0.0

    win_rate = float((arr > 0).sum() / len(arr) * 100)
    return {
        'sharpe': float(sharpe),
        'sortino': float(sortino),
        'max_drawdown': max_dd,
        'avg_return': mean_r,
        'win_rate': win_rate,
        'trades': int(len(arr)),
    }

def horizon_composite_score(metrics):
    """Rank horizons: Sharpe + Sortino + return, penalise deep drawdown."""
    if not metrics:
        return -999.0
    return (
        metrics['sharpe'] * 0.35
        + metrics['sortino'] * 0.35
        + metrics['avg_return'] * 0.05
        + metrics['max_drawdown'] * 0.25   # max_dd is negative; closer to 0 is better
    )

def run_model_pipeline(model, X_train, y_train, X_all, df_clean, train_size, horizon):
    """Train, CV, and backtest a single model."""
    selector_model = XGBClassifier(
        n_estimators=100, max_depth=6, random_state=42, n_jobs=-1, eval_metric='logloss'
    )
    selector = SelectFromModel(selector_model, threshold='median')
    selector.fit(X_train, y_train)
    X_train_sel = selector.transform(X_train)
    X_all_sel = selector.transform(X_all)

    if X_train_sel.shape[1] == 0:
        return None

    cv_accuracy = cross_val_accuracy(model, X_train_sel, y_train)

    fitted = clone(model)
    fitted.fit(X_train_sel, y_train)

    probas = fitted.predict_proba(X_all_sel[train_size:])[:, 1]
    trade_results = backtest_long_signals(probas, df_clean, train_size, horizon)
    metrics = compute_metrics(trade_results, horizon)
    if not metrics:
        return None

    metrics['cv_accuracy'] = cv_accuracy
    metrics['selected_features'] = int(X_train_sel.shape[1])
    metrics['horizon'] = horizon
    metrics['trade_log'] = trade_results
    metrics['probas'] = probas.tolist()
    return metrics

def run_ensemble_pipeline(models, X_train, y_train, X_all, df_clean, train_size, horizon):
    """Average probabilities from all 3 models."""
    selector_model = XGBClassifier(
        n_estimators=100, max_depth=6, random_state=42, n_jobs=-1, eval_metric='logloss'
    )
    selector = SelectFromModel(selector_model, threshold='median')
    selector.fit(X_train, y_train)
    X_train_sel = selector.transform(X_train)
    X_all_sel = selector.transform(X_all)

    if X_train_sel.shape[1] == 0:
        return None

    fitted_models = []
    cv_scores = []
    for model in models.values():
        cv_scores.append(cross_val_accuracy(model, X_train_sel, y_train))
        m = clone(model)
        m.fit(X_train_sel, y_train)
        fitted_models.append(m)

    ensemble_probas = np.mean(
        [m.predict_proba(X_all_sel[train_size:])[:, 1] for m in fitted_models], axis=0
    )
    trade_results = backtest_long_signals(ensemble_probas, df_clean, train_size, horizon)
    metrics = compute_metrics(trade_results, horizon)
    if not metrics:
        return None

    metrics['cv_accuracy'] = float(np.mean(cv_scores))
    metrics['selected_features'] = int(X_train_sel.shape[1])
    metrics['horizon'] = horizon
    metrics['trade_log'] = trade_results
    metrics['probas'] = ensemble_probas.tolist()
    return metrics

def run_horizon_ensemble(df_clean, horizon):
    """Train ensemble for a single horizon; return metrics or None."""
    X = define_features(df_clean)
    y = build_weighted_target(df_clean, horizon).values

    valid_mask = valid_sample_mask(X, y)
    X_clean = X[valid_mask].values
    y_clean = y[valid_mask]
    df_valid = df_clean[valid_mask].reset_index(drop=True)

    if len(X_clean) < 150 or len(np.unique(y_clean)) < 2:
        return None

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_clean)
    train_size = int(TRAIN_RATIO * len(X_scaled))
    X_train = X_scaled[:train_size]
    y_train = y_clean[:train_size]

    if len(np.unique(y_train)) < 2:
        return None

    return run_ensemble_pipeline(get_models(y_train), X_train, y_train, X_scaled, df_valid, train_size, horizon)

# ═══════════════════════════════════════════════════════════════
# ML ANALYSIS
# ═══════════════════════════════════════════════════════════════

def analyze_stock(symbol, name, cap_type):
    """Per-stock: test 3/5/7-day weighted horizons, pick best, run full model suite."""
    print(f"  [{cap_type}] {name}...", end=" ")

    df = fetch_stock_data(symbol) if USE_REAL_DATA else None

    if df is None or len(df) < 150:
        print("❌ Insufficient data")
        return None

    try:
        df_clean = df.reset_index(drop=True)
        last_data_date = pd.to_datetime(df_clean['Date'].iloc[-1]).date().isoformat()
        X_feat = define_features(df_clean)

        # ── Phase 1: Mathematically derive optimal horizon ──
        best_h = derive_optimal_horizon(df_clean['Close'], df_clean['Volume'])
        horizon_comparison = {str(best_h): {'sharpe': 0}} # Mock for compatibility

        # ── Phase 2: full model suite on derived horizon ──
        X = define_features(df_clean)
        y = build_weighted_target(df_clean, best_h).values
        valid_mask = valid_sample_mask(X, y)
        X_clean = X[valid_mask].values
        y_clean = y[valid_mask]
        df_valid = df_clean[valid_mask].reset_index(drop=True)

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X_clean)
        train_size = int(TRAIN_RATIO * len(X_scaled))
        X_train = X_scaled[:train_size]
        y_train = y_clean[:train_size]

        models = get_models(y_train)
        model_results = {}
        for model_name, model in models.items():
            metrics = run_model_pipeline(
                model, X_train, y_train, X_scaled, df_valid, train_size, best_h
            )
            if metrics:
                model_results[model_name] = metrics

        ensemble_metrics = run_ensemble_pipeline(
            models, X_train, y_train, X_scaled, df_valid, train_size, best_h
        )
        if not ensemble_metrics:
            print("❌ Ensemble failed")
            return None
            
        model_results['ensemble'] = ensemble_metrics
        ens = ensemble_metrics

        # ── Collect test-period data for cross-sectional portfolio backtest ──
        test_dates = []
        if 'Date' in df_valid.columns:
            test_dates = [str(pd.to_datetime(d).date()) for d in df_valid['Date'].values[train_size:]]
        test_close = df_valid['Close'].values[train_size:].astype(float)
        test_open = df_valid['Open'].values[train_size:].astype(float)
        test_high = df_valid['High'].values[train_size:].astype(float)
        test_low = df_valid['Low'].values[train_size:].astype(float)
        full_atr = compute_atr_array(
            df_valid['High'].values.astype(float),
            df_valid['Low'].values.astype(float),
            df_valid['Close'].values.astype(float),
        )
        test_atr = full_atr[train_size:]
        test_probs = {}
        for mn, mr in model_results.items():
            if 'probas' in mr:
                test_probs[mn] = mr['probas']
        test_data = {
            'name': name,
            'dates': test_dates,
            'open': test_open,
            'close': test_close,
            'high': test_high,
            'low': test_low,
            'atr': test_atr,
            'horizon': best_h,
            'probs': test_probs,
        }

        atr = float(X_feat['atr'].iloc[-1])
        current_price = float(df_clean['Close'].iloc[-1])
        if atr <= 0 or np.isnan(atr):
            atr = float(df_clean['Close'].pct_change().rolling(14).std().iloc[-1] * current_price)

        hold_scale = best_h / 5.0
        sl = current_price - 2.2 * atr
        t1 = current_price + 1.3 * atr * hold_scale
        t2 = current_price + 2.5 * atr * hold_scale

        print(
            f"✓ Best={best_h}D Sharpe={ens['sharpe']:.2f} Sortino={ens['sortino']:.2f} "
            f"MD={ens['max_drawdown']:.1f}% WR={ens['win_rate']:.0f}%"
        )

        return {
            'symbol': symbol,
            'name': name,
            'cap': cap_type,
            'data_source': 'Yahoo Finance',
            'last_data_date': last_data_date,
            'price': float(current_price),
            'sl': float(sl),
            't1': float(t1),
            't2': float(t2),
            'atr': float(atr),
            'best_horizon': best_h,
            'best_params': {
                'horizon_days': best_h,
                'target': 'volume+time weighted',
                'min_weighted_return': MIN_WEIGHTED_RETURN,
                'max_forward_dd': MAX_FORWARD_DD,
                'threshold': PREDICTION_THRESHOLD,
                'chase_filter': CHASE_FILTER,
            },
            'horizon_comparison': horizon_comparison,
            'sharpe': ens['sharpe'],
            'sortino': ens['sortino'],
            'max_drawdown': ens['max_drawdown'],
            'avg_return': ens['avg_return'],
            'win_rate': ens['win_rate'],
            'trades': ens['trades'],
            'cv_accuracy': ens['cv_accuracy'],
            'model_results': model_results,
            'test_data': test_data,
        }
    except Exception as e:
        print(f"❌ {str(e)[:40]}")
        return None

def result_for_model(stock, model_name):
    """Build a flat result row for a specific model."""
    m = stock['model_results'].get(model_name)
    if not m:
        return None
    return {
        'symbol': stock['symbol'],
        'name': stock['name'],
        'cap': stock['cap'],
        'model': model_name,
        'data_source': stock.get('data_source', 'Yahoo Finance'),
        'last_data_date': stock.get('last_data_date'),
        'best_horizon': stock['best_horizon'],
        'best_params': stock['best_params'],
        'horizon_comparison': stock['horizon_comparison'],
        'sharpe': m['sharpe'],
        'sortino': m['sortino'],
        'max_drawdown': m['max_drawdown'],
        'avg_return': m['avg_return'],
        'win_rate': m['win_rate'],
        'trades': m['trades'],
        'cv_accuracy': m['cv_accuracy'],
        'selected_features': m.get('selected_features', 0),
        'price': stock['price'],
        'sl': stock['sl'],
        't1': stock['t1'],
        't2': stock['t2'],
        'atr': stock['atr'],
        'today_prob': m.get('today_prob', 0),
        'trade_log': m.get('trade_log', []),
    }

def portfolio_backtest(stocks_test_data, model_name,
                       threshold=PREDICTION_THRESHOLD, max_positions=5, notional=10000):
    """Cross-sectional point-in-time portfolio backtest — no look-ahead bias.

    Walks every trading day across the test set, picks top stocks by
    model probability, deploys notional per stock with SL/target from ATR.
    """
    stock_lookup = {}
    all_date_set = set()
    for sym, data in stocks_test_data.items():
        probs = data['probs'].get(model_name)
        if probs is None or len(probs) == 0:
            continue
        date_to_idx = {d: i for i, d in enumerate(data['dates'])}
        stock_lookup[sym] = {
            'name': data['name'],
            'date_to_idx': date_to_idx,
            'open': np.array(data.get('open', data['close']), dtype=float),
            'close': np.array(data['close'], dtype=float),
            'high': np.array(data['high'], dtype=float),
            'low': np.array(data['low'], dtype=float),
            'atr': np.array(data['atr'], dtype=float),
            'probs': np.array(probs, dtype=float),
            'horizon': data['horizon'],
        }
        all_date_set.update(data['dates'])

    if not stock_lookup:
        return []

    all_dates = sorted(all_date_set)
    open_positions = {}
    trade_log = []

    for date in all_dates:
        # ── 1. Manage existing positions ──
        for sym in list(open_positions.keys()):
            pos = open_positions[sym]
            lu = stock_lookup[sym]
            idx = lu['date_to_idx'].get(date)
            if idx is None:
                continue
            pos['days_held'] += 1
            day_open = float(lu['open'][idx])
            day_low = float(lu['low'][idx])
            day_high = float(lu['high'][idx])
            day_close = float(lu['close'][idx])

            exit_price, exit_reason = None, None
            if day_open <= pos['sl']:
                exit_price, exit_reason = day_open, 'sl'
            elif day_low <= pos['sl']:
                exit_price, exit_reason = pos['sl'], 'sl'
            elif day_open >= pos['t1']:
                exit_price, exit_reason = day_open, 'target'
            elif day_high >= pos['t1']:
                exit_price, exit_reason = pos['t1'], 'target'
            elif pos['days_held'] >= lu['horizon']:
                exit_price, exit_reason = day_close, 'hold'

            if exit_price is not None:
                pnl_rs = pos['shares'] * (exit_price - pos['entry_price'])
                trade_log.append({
                    's': sym, 'n': lu['name'],
                    'd': pos['entry_date'], 'xd': date,
                    'ep': round(pos['entry_price'], 2),
                    'xp': round(exit_price, 2),
                    'sl': round(pos['sl'], 2),
                    't1': round(pos['t1'], 2),
                    'h': lu['horizon'],
                    'shares': pos['shares'],
                    'pnl_rs': round(pnl_rs, 2),
                    'pnl': round((exit_price - pos['entry_price']) / pos['entry_price'] * 100, 2),
                    'exit': exit_reason,
                })
                del open_positions[sym]

        # ── 2. New entries ──
        candidates = []
        for sym, lu in stock_lookup.items():
            if sym in open_positions:
                continue
            idx = lu['date_to_idx'].get(date)
            if idx is None or idx >= len(lu['probs']):
                continue
            prob = float(lu['probs'][idx])
            if prob <= threshold:
                continue
            entry_price = float(lu['close'][idx])
            # Anti-chase filter
            if idx > 0:
                prev_close = float(lu['close'][idx - 1])
                if prev_close > 0 and abs(entry_price - prev_close) / prev_close > CHASE_FILTER:
                    continue
            candidates.append((sym, prob, idx))

        if not candidates:
            continue
        candidates.sort(key=lambda x: x[1], reverse=True)
        for sym, prob, idx in candidates:
            lu = stock_lookup[sym]
            entry_price = float(lu['close'][idx])
            atr_val = float(lu['atr'][idx])
            if atr_val <= 0 or entry_price <= 0:
                continue
            horizon = lu['horizon']
            shares = int(notional // entry_price)
            if shares <= 0:
                continue
            hold_scale = horizon / 5.0
            open_positions[sym] = {
                'entry_date': date,
                'entry_price': entry_price,
                'sl': entry_price - 2.2 * atr_val,
                't1': entry_price + 1.3 * atr_val * hold_scale,
                'shares': shares,
                'days_held': 0,
            }

    return trade_log

# ═══════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("\n" + "="*100)
    print("DYNAMIC ML — PER-STOCK 3D / 5D / 7D WEIGHTED HORIZON OPTIMISER")
    print("="*100)
    print(f"\nData Mode: {'REAL Yahoo Finance' if USE_REAL_DATA else 'SIMULATED (for demo)'}")
    print(f"History: 2 years | Horizon: Dynamic (Vol-Weighted ACF) | Threshold: {PREDICTION_THRESHOLD}")
    print(f"Target: volume+time weighted | Anti-chase: {CHASE_FILTER*100:.0f}% | Universe: {len(STOCKS)} stocks\n")

    all_results = []
    for symbol, name, cap in STOCKS[:15]:
        result = analyze_stock(symbol, name, cap)
        if result:
            all_results.append(result)

    all_results.sort(key=lambda x: x['sharpe'], reverse=True)

    # ── Cross-sectional portfolio backtest (no look-ahead bias) ──
    MODEL_NAMES = ['xgboost', 'lightgbm', 'random_forest', 'ensemble']
    print("\n" + "="*100)
    print("RUNNING CROSS-SECTIONAL PORTFOLIO BACKTEST (top 5 by daily probability)")
    print("="*100)
    stocks_test_data = {}
    for r in all_results:
        td = r.get('test_data')
        if td and len(td.get('dates', [])) > 0:
            stocks_test_data[r['symbol']] = td
    print(f"  {len(stocks_test_data)} stocks with test-period data")

    portfolio_bt = {}
    for model_name in MODEL_NAMES:
        tlog = portfolio_backtest(stocks_test_data, model_name)
        portfolio_bt[model_name] = tlog
        total_pnl = sum(t['pnl_rs'] for t in tlog)
        wins = sum(1 for t in tlog if t['pnl_rs'] > 0)
        sl_exits = sum(1 for t in tlog if t['exit'] == 'sl')
        tgt_exits = sum(1 for t in tlog if t['exit'] == 'target')
        hold_exits = sum(1 for t in tlog if t['exit'] == 'hold')
        unique_stocks = len(set(t['s'] for t in tlog)) if tlog else 0
        print(f"  {model_name:16} → {len(tlog)} trades | {unique_stocks} stocks | "
              f"PnL: ₹{total_pnl:,.0f} | W/L: {wins}/{len(tlog)-wins} | "
              f"SL:{sl_exits} TGT:{tgt_exits} HOLD:{hold_exits}")

    # Strip heavy internal data before JSON serialization
    for r in all_results:
        r.pop('test_data', None)
        for mr in r.get('model_results', {}).values():
            probas = mr.pop('probas', None)
            if probas and len(probas) > 0:
                mr['today_prob'] = probas[-1]

    backtest = {}
    for model_name in MODEL_NAMES:
        model_rows = []
        for stock in all_results:
            row = result_for_model(stock, model_name)
            if row:
                model_rows.append(row)
        model_rows.sort(key=lambda x: x['sharpe'], reverse=True)
        backtest[model_name] = model_rows[:20]

    ensemble_top = backtest['ensemble']

    print("\n" + "="*100)
    print("TOP 20 STOCKS — DYNAMIC ENSEMBLE (best horizon per stock)")
    print("="*100)

    horizon_counts = {3: 0, 5: 0, 7: 0}
    for r in ensemble_top[:20]:
        horizon_counts[r.get('best_horizon', 5)] = horizon_counts.get(r.get('best_horizon', 5), 0) + 1

    for i, r in enumerate(ensemble_top[:20], 1):
        emoji = "🚀" if r['sharpe'] > 3.0 else "⭐" if r['sharpe'] > 2.5 else "✓"
        rr = (r['t1'] - r['price']) / (r['price'] - r['sl'] + 1e-8)
        bh = r.get('best_horizon', 5)

        print(f"\n{i}. {r['name']:20} ({r['symbol']:15}) {emoji}  [Horizon: {bh}D]")
        print(f"   Sharpe: {r['sharpe']:.2f} | Sortino: {r.get('sortino', 0):.2f} | MD: {r.get('max_drawdown', 0):.1f}% | Avg: {r.get('avg_return', 0):.2f}%")
        print(f"   WR: {r['win_rate']:.0f}% | Trades: {r['trades']} | CV: {r['cv_accuracy']:.0%}")
        print(f"   Entry: ₹{r['price']:.2f} | SL: ₹{r['sl']:.2f} | T1: ₹{r['t1']:.2f} | T2: ₹{r['t2']:.2f} | R:R {rr:.2f}:1")

    print(f"\n  Dynamic horizon derived via Volume-Weighted ACF Memory Decay")

    print("\n" + "="*100)
    print("MODEL COMPARISON (avg Sharpe of top-20 per model)")
    print("="*100)
    for model_name in MODEL_NAMES:
        rows = backtest[model_name]
        avg_sharpe = np.mean([r['sharpe'] for r in rows]) if rows else 0
        avg_wr = np.mean([r['win_rate'] for r in rows]) if rows else 0
        print(f"  {model_name:16} → Top-20 avg Sharpe: {avg_sharpe:.2f} | avg WR: {avg_wr:.0f}% | stocks: {len(rows)}")

    with open(OUTPUT_FILE, 'w') as f:
        json.dump({
            'mode': 'REAL' if USE_REAL_DATA else 'DEMO',
            'generated_at': datetime.now().astimezone().isoformat(timespec='seconds'),
            'history': '2y',
            'horizons_tested': 'dynamic_acf',
            'target_type': 'volume_time_weighted',
            'threshold': PREDICTION_THRESHOLD,
            'min_weighted_return': MIN_WEIGHTED_RETURN,
            'max_forward_dd': MAX_FORWARD_DD,
            'chase_filter': CHASE_FILTER,
            'models': MODEL_NAMES,
            'universe_size': len(STOCKS),
            'analyzed': len(all_results),
            'last_data_date': max((r.get('last_data_date') for r in ensemble_top if r.get('last_data_date')), default=None),
            'sharpe_above_3': len([r for r in ensemble_top if r['sharpe'] > 3.0]),
            'horizon_distribution': horizon_counts,
            'results': ensemble_top[:20],
            'backtest': backtest,
            'portfolio_backtest': portfolio_bt,
        }, f, indent=2, default=str)

    print(f"\n✓ Results saved to {OUTPUT_FILE}")
    print(f"\n{len(all_results)} stocks analyzed | Ensemble Sharpe > 3.0: {len([r for r in ensemble_top if r['sharpe'] > 3.0])}")
