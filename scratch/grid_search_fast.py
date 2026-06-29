import json
import sys
import os

# Add parent directory to path so we can import ml.ML_SYSTEM_FOR_YOUR_MACHINE
sys.path.append(os.path.abspath('.'))

from ml.ML_SYSTEM_FOR_YOUR_MACHINE import portfolio_backtest

def main():
    print("Loading test data from ml_results_final.json...")
    with open('public/ml_results_final.json', 'r') as f:
        data = json.load(f)
        
    stocks_test_data = {}
    # The JSON structure contains a 'results' array where each item has 'test_data'
    # Wait, earlier versions didn't output 'test_data' to the JSON? Let's check what's in ml_results_final.json
    for r in data.get('results', []):
        td = r.get('test_data')
        if td and len(td.get('dates', [])) > 0:
            stocks_test_data[r['symbol']] = td
            
    if not stocks_test_data:
        print("No test_data found in JSON. We cannot run fast grid search.")
        return
        
    print(f"Loaded {len(stocks_test_data)} stocks.")
    
    sl_mults = [1.0, 1.2, 1.5, 1.8, 2.0]
    t1_mults = [1.0, 1.25, 1.5, 2.0, 2.25]
    
    best_sl = None
    best_t1 = None
    best_pnl = -float('inf')
    
    print("\nRunning grid search for LightGBM...")
    for sl in sl_mults:
        for t1 in t1_mults:
            tlog = portfolio_backtest(stocks_test_data, 'lightgbm', sl_mult=sl, t1_mult=t1)
            total_pnl = sum(t['pnl_rs'] for t in tlog)
            wins = sum(1 for t in tlog if t['pnl_rs'] > 0)
            trades = len(tlog)
            wr = (wins / trades * 100) if trades > 0 else 0
            
            print(f"SL: {sl}, T1: {t1} -> PnL: {total_pnl:,.0f} | WR: {wr:.1f}% ({trades} trades)")
            
            if total_pnl > best_pnl:
                best_pnl = total_pnl
                best_sl = sl
                best_t1 = t1
                
    print(f"\n🏆 Best Multipliers: SL = {best_sl}, T1 = {best_t1} -> PnL: {best_pnl:,.0f}")

if __name__ == '__main__':
    main()
