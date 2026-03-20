#!/usr/bin/env python3
"""PPO Agent 真实 A 股数据训练"""
import sys, argparse, logging
from pathlib import Path
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))
import numpy as np, pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s  %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("demo_real")

def load_stock_data(csv_path, ts_code="600519.SH", start_date="20200101", end_date="20241231"):
    logger.info(f"读取 {csv_path} | 筛选 {ts_code} {start_date}~{end_date}")
    df = pd.read_csv(csv_path, usecols=["ts_code","trade_date","open","high","low","close","vol"], dtype={"ts_code":str,"trade_date":str})
    mask = (df["ts_code"]==ts_code) & (df["trade_date"]>=start_date) & (df["trade_date"]<=end_date)
    stock = df[mask].copy()
    if stock.empty:
        avail = df[df["ts_code"]==ts_code]["trade_date"].sort_values()
        raise ValueError(f"{ts_code} 无数据。可用: {avail.iloc[0]}~{avail.iloc[-1]}" if len(avail) else f"找不到 {ts_code}")
    stock["trade_date"] = pd.to_datetime(stock["trade_date"], format="%Y%m%d")
    stock = stock.sort_values("trade_date").set_index("trade_date")
    stock = stock.rename(columns={"vol":"volume"})
    stock["volume"] = stock["volume"] * 100
    stock = stock[["open","high","low","close","volume"]].dropna()
    logger.info(f"{ts_code} | {len(stock)}天 | {stock.index[0].date()}~{stock.index[-1].date()} | 价格 {stock['close'].min():.2f}~{stock['close'].max():.2f}")
    return stock

NAMES = {"600519.SH":"贵州茅台","000001.SZ":"平安银行","000858.SZ":"五粮液","601318.SH":"中国平安","000333.SZ":"美的集团"}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="~/Desktop/daily_price_data_2018_2025.csv")
    parser.add_argument("--stock", default="600519.SH")
    parser.add_argument("--train-start", default="20200101")
    parser.add_argument("--train-end", default="20231231")
    parser.add_argument("--test-start", default="20240101")
    parser.add_argument("--test-end", default="20241231")
    parser.add_argument("--steps", type=int, default=150000)
    args = parser.parse_args()
    from src.rl import TradingEnv, PPOTrainer, PPOConfig, evaluate
    csv_path = str(Path(args.csv).expanduser())
    name = NAMES.get(args.stock, args.stock)
    train_df = load_stock_data(csv_path, args.stock, args.train_start, args.train_end)
    test_df = load_stock_data(csv_path, args.stock, args.test_start, args.test_end)
    logger.info(f"训练集: {len(train_df)}天 | 测试集: {len(test_df)}天")
    avg_price = train_df["close"].mean()
    max_sh = max(int(100_000 / avg_price / 100) * 100, 100)
    logger.info(f"均价 {avg_price:.2f}, max_shares={max_sh}")
    train_env = TradingEnv(train_df, initial_cash=100_000.0, commission=0.001, max_shares=max_sh)
    config = PPOConfig(lr=1e-4, gamma=0.995, gae_lambda=0.97, clip_eps=0.2, entropy_coef=0.03, value_coef=0.5, max_grad_norm=0.5, n_epochs=6, batch_size=128, rollout_steps=1024, hidden_dim=128)
    trainer = PPOTrainer(train_env, config)
    logger.info("=" * 60)
    logger.info(f"开始训练 | {name}({args.stock}) | {args.steps:,}步")
    logger.info("=" * 60)
    trainer.train(total_timesteps=args.steps)
    save_dir = str(_root / "checkpoints" / f"ppo_{args.stock.replace('.','_')}")
    trainer.save(save_dir)
    logger.info("=" * 60)
    logger.info(f"测试集评估 ({args.test_start}~{args.test_end})...")
    logger.info("=" * 60)
    test_env = TradingEnv(test_df, initial_cash=100_000.0, commission=0.001, max_shares=max_sh)
    m = evaluate(trainer.policy, test_env, n_episodes=1, deterministic=True)[0]
    bh = float(test_df["close"].iloc[-1] / test_df["close"].iloc[0] - 1.0)
    print(f"\n{'='*60}")
    print(f"  📊 {name}({args.stock}) 测试集评估")
    print(f"{'='*60}")
    print(f"  训练: {args.train_start}~{args.train_end} ({len(train_df)}天)")
    print(f"  测试: {args.test_start}~{args.test_end} ({len(test_df)}天)")
    print(f"\n  {'指标':<12} {'PPO Agent':>12} {'Buy&Hold':>12}")
    print(f"  {'-'*38}")
    print(f"  {'总收益率':<12} {m['total_return']:>+11.2%} {bh:>+11.2%}")
    print(f"  {'夏普比率':<12} {m['sharpe_ratio']:>+11.2f} {'—':>12}")
    print(f"  {'最大回撤':<12} {m['max_drawdown']:>11.2%} {'—':>12}")
    print(f"  {'波动率':<12} {m['volatility']:>11.2%} {'—':>12}")
    print(f"  {'交易次数':<12} {m['trade_count']:>11d} {'0':>12}")
    print(f"  {'终值(¥)':<12} {m['final_value']:>11,.2f} {100_000*(1+bh):>11,.2f}")
    alpha = m["total_return"] - bh
    print(f"\n  {'✅ 跑赢!' if alpha>0 else '⚠️ 未跑赢'} Alpha: {alpha:+.2%}")
    print(f"  模型: {save_dir}/\n{'='*60}")

if __name__ == "__main__":
    main()
