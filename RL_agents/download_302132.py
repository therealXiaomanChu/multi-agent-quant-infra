"""下载 302132.SZ 完整日线数据"""
import akshare as ak
import pandas as pd

df = ak.stock_zh_a_hist(
    symbol="302132", period="daily",
    start_date="20180101", end_date="20251231", adjust="qfq",
)

df = df.rename(columns={
    "日期": "trade_date", "开盘": "open", "最高": "high",
    "最低": "low", "收盘": "close", "成交量": "volume",
})
df["trade_date"] = pd.to_datetime(df["trade_date"])
df = df.set_index("trade_date")[["open", "high", "low", "close", "volume"]].dropna()

print(f"302132.SZ: {len(df)} 天")
print(f"日期范围: {df.index[0].date()} ~ {df.index[-1].date()}")
print(f"价格范围: {df['close'].min():.2f} ~ {df['close'].max():.2f}")

out_path = "data_302132_full.csv"
df.to_csv(out_path)
print(f"已保存至 {out_path}")
