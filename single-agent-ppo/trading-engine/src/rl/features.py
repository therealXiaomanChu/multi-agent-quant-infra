"""
特征工程模块（适配稀疏数据版）
窗口缩小到 10，特征更鲁棒。
"""
import numpy as np
import pandas as pd


def compute_features(df: pd.DataFrame, window: int = 10) -> pd.DataFrame:
    out = pd.DataFrame(index=df.index)
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"].astype(float)

    # 收益率
    out["log_return"] = np.log(close / close.shift(1))
    out["return_3d"] = close.pct_change(3)
    out["return_5d"] = close.pct_change(5)

    # 波动率
    out["volatility"] = out["log_return"].rolling(window).std()

    # 动量
    sma = close.rolling(window).mean()
    out["price_sma_ratio"] = close / sma - 1.0

    ema5 = close.ewm(span=5, adjust=False).mean()
    ema10 = close.ewm(span=10, adjust=False).mean()
    out["ema_cross"] = (ema5 - ema10) / close

    # RSI (缩短到 7)
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(7).mean()
    loss = (-delta.clip(upper=0)).rolling(7).mean()
    rs = gain / (loss + 1e-10)
    out["rsi"] = rs / (1 + rs)

    # 成交量
    vol_sma = volume.rolling(window).mean()
    out["volume_ratio"] = volume / (vol_sma + 1e-10) - 1.0

    # ATR
    tr = pd.concat([
        high - low,
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs(),
    ], axis=1).max(axis=1)
    out["atr_norm"] = tr.rolling(7).mean() / close

    # Bollinger Band 位置
    bb_std = close.rolling(window).std()
    bb_upper = sma + 2 * bb_std
    bb_lower = sma - 2 * bb_std
    out["bb_position"] = (close - bb_lower) / (bb_upper - bb_lower + 1e-10)

    out = out.dropna()
    return out


def get_feature_names() -> list[str]:
    return [
        "log_return", "return_3d", "return_5d",
        "volatility", "price_sma_ratio", "ema_cross",
        "rsi", "volume_ratio", "atr_norm", "bb_position",
    ]


def get_observation_dim() -> int:
    return len(get_feature_names()) + 1
