
import sys
print("Python executable:", sys.executable)
try:
    import pandas as pd
    print("✅ pandas imported successfully (version:", pd.__version__, ")")
    import numpy as np
    print("✅ numpy imported successfully (version:", np.__version__, ")")
    import sklearn
    print("✅ scikit-learn imported successfully")
    import xgboost
    print("✅ xgboost imported successfully")
    import lightgbm
    print("✅ lightgbm imported successfully")
    import yfinance as yf
    print("✅ yfinance imported successfully")
    print("\nAll dependencies are installed!")
except ImportError as e:
    print("❌ Import error:", e)
    sys.exit(1)
