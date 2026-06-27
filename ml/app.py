
import streamlit as st
import pandas as pd
import numpy as np
from pathlib import Path
import json

# Import our existing ML functions from ML_SYSTEM_FOR_YOUR_MACHINE (or copy them here for now)
# Let's copy the core functions
SCRIPT_DIR = Path(__file__).parent

# First, let's define constants
HORIZON_CANDIDATES = [3, 5, 7]
PREDICTION_THRESHOLD = 0.40
MIN_TRADES = 3
TRAIN_RATIO = 0.7
MIN_WEIGHTED_RETURN = 0.006
MAX_FORWARD_DD = 0.035
CHASE_FILTER = 0.05

# Use our stock list (fixed TMPV to TATAMOTORS)
_RAW_STOCKS = [
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
]

# Deduplicate stocks
_seen = set()
STOCKS = []
for symbol, name, cap in _RAW_STOCKS:
    if symbol not in _seen:
        _seen.add(symbol)
        STOCKS.append((symbol, name, cap))

# --- Copy functions here so we don't need yfinance check
USE_REAL_DATA = False
try:
    import yfinance as yf
    USE_REAL_DATA = True
except ImportError:
    pass

# Now, let's create a simple Streamlit UI!

st.set_page_config(page_title="ML Trading Dashboard", layout="wide")
st.title("📈 ML-Powered Trading Dashboard")
st.markdown("### NIFTY 50 Stock Analysis with ML Models")

# Sidebar
st.sidebar.header("Configuration")
selected_stocks = st.sidebar.multiselect(
    "Select Stocks to Analyze",
    options=[f"{name} ({symbol})" for symbol, name, cap in STOCKS],
    default=[f"Reliance (RELIANCE.NS)", f"TCS (TCS.NS)"]
)
num_stocks = st.sidebar.slider("Max Stocks to Show", min_value=1, max_value=10, value=2)
use_real_data = st.sidebar.checkbox("Use Real Yahoo Finance Data", value=True)


# Let's make a small function to run analysis quickly for Streamlit (simulated data for now
@st.cache_data(show_spinner="Analyzing stocks...")
def run_analysis(selected):
    pass  # we'll make a simple version with simulated data for UI demo

# First, let's make generate simulated data functions!
def generate_simulated_data(symbol, base_price=1500):
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


st.header("📊 Selected Stocks")

st.subheader("Stock Prices")

for selection in selected_stocks[:num_stocks]:
    # Parse selection: "Name (SYMBOL.NS)"
    symbol = selection.split('(')[-1].replace(')', '')
    name = ' '.join(selection.split(' ')[:-1])
    df = generate_simulated_data(symbol)

    st.write(f"### {name} ({symbol})")

    # Plot prices
    price_df = df.set_index('Date')
    st.line_chart(price_df['Close'])

    # Mock some results for UI (for show!
    atr = price_df['Close'].pct_change().rolling(14).std().iloc[-1] * price_df['Close'].iloc[-1]
    current_price = price_df['Close'].iloc[-1]
    sl = current_price - 2.2 * atr
    t1 = current_price + 1.3 * atr
    t2 = current_price + 2.5 * atr

    # Display metrics in columns!
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Current Price", f"₹{current_price:.2f}")
    col2.metric("Stop Loss", f"₹{sl:.2f}")
    col3.metric("Target 1", f"₹{t1:.2f}")
    col4.metric("Target 2", f"₹{t2:.2f}")
    st.divider()

# Now a button to run full ML analysis
if st.button("Run Full ML Analysis"):
    with st.spinner("Running analysis..."):
        st.info("Note: Full ML analysis would take some time! For now, here's how to use original script:")
        st.code("source .venv/bin/activate && python ML_SYSTEM_FOR_YOUR_MACHINE.py")
        st.info("Or, use the .venv Python directly:")
        st.code("./.venv/bin/python ML_SYSTEM_FOR_YOUR_MACHINE.py")
