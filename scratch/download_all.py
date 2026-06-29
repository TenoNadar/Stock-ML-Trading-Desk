import yfinance as yf
import pandas as pd
import os
import sys

sys.path.append(os.path.abspath('.'))
from ml.ML_SYSTEM_FOR_YOUR_MACHINE import STOCKS

def main():
    os.makedirs('cache', exist_ok=True)
    tickers = [s[0] for s in STOCKS]
    print(f"Downloading {len(tickers)} tickers at once...")
    data = yf.download(tickers, period="2y", progress=True, auto_adjust=True, group_by='ticker')
    
    for ticker in tickers:
        try:
            if len(tickers) == 1:
                df = data
            else:
                df = data[ticker].dropna(how='all')
            if not df.empty:
                df.to_csv(f"cache/{ticker}.csv")
                print(f"Saved {ticker}")
        except Exception as e:
            print(f"Failed to save {ticker}: {e}")

if __name__ == '__main__':
    main()
