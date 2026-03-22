#!/usr/bin/env python3
"""
Walk-Forward 滚动窗口评估
跨多只股票、多个时间窗口评估 PPO Agent 的泛化能力。

核心逻辑:
  对每只股票的时间序列，用固定长度训练窗口训练 → 紧接着的测试窗口评估 → 窗口整体滑动。
  最终汇总所有 (股票 × 窗口) 的胜负，得到有统计意义的胜率。

Usage:
    cd trading-engine
    python -m scripts.walk_forward --csv ~/Desktop/daily_price_data_2018_2025.csv
    python -m scripts.walk_forward --csv ~/Desktop/daily_price_data_2018_2025.csv --top 5 --steps 100000
"""

import sys
import argparse
import logging
from pathlib import Path
from dataclasses import dataclass

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

import numpy as np
import pandas as pd
import torch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("walk_forward")


# ======================================================================
# 数据加载
# ======================================================================

def load_all_stocks(csv_path: str) -> dict[str, pd.DataFrame]:
    """
    读取 CSV，返回 {ts_code: OHLCV DataFrame} 的字典。
    只保留数据量足够的股票（>= min_days）。
    """
    logger.info(f"读取 {csv_path} ...")
    df = pd.read_csv(
        csv_path,
        usecols=["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
        dtype={"ts_code": str, "trade_date": str},
    )
    df["trade_date"] = pd.to_datetime(df["trade_date"], format="%Y%m%d")
    df = df.rename(columns={"vol": "volume"})
    df["volume"] = df["volume"] * 100

    stocks = {}
    for code, group in df.groupby("ts_code"):
        group = group.sort_values("trade_date").set_index("trade_date")
        group = group[["open", "high", "low", "close", "volume"]].dropna()
        stocks[code] = group

    logger.info(f"共 {len(stocks)} 只股票")
    return stocks


def select_top_stocks(stocks: dict[str, pd.DataFrame], top_n: int, min_days: int) -> list[str]:
    """按数据量排序，选出前 top_n 只且数据量 >= min_days 的股票。"""
    qualified = {k: len(v) for k, v in stocks.items() if len(v) >= min_days}
    sorted_codes = sorted(qualified, key=qualified.get, reverse=True)[:top_n]
    for code in sorted_codes:
        logger.info(f"  选中: {code} ({qualified[code]} 天)")
    return sorted_codes


# ======================================================================
# 滚动窗口
# ======================================================================

@dataclass
class WindowResult:
    """单个窗口的评估结果。"""
    stock: str
    window_id: int
    train_start: str
    train_end: str
    test_start: str
    test_end: str
    train_days: int
    test_days: int
    ppo_return: float
    bh_return: float
    ppo_sharpe: float
    ppo_max_dd: float
    ppo_trades: int
    alpha: float
    win: bool


def run_walk_forward(
    df: pd.DataFrame,
    stock_code: str,
    train_len: int,
    test_len: int,
    slide: int,
    train_steps: int,
) -> list[WindowResult]:
    """
    对单只股票执行滚动窗口训练+评估。

    Args:
        df: 该股票的完整 OHLCV 数据
        stock_code: 股票代码（仅用于标记）
        train_len: 训练窗口长度（天数）
        test_len: 测试窗口长度（天数）
        slide: 窗口滑动步长（天数）
        train_steps: 每个窗口的 PPO 训练步数

    Returns:
        每个窗口的评估结果列表
    """
    from src.rl import TradingEnv, PPOTrainer, PPOConfig, evaluate

    total_days = len(df)
    results = []
    window_id = 0

    start = 0
    while start + train_len + test_len <= total_days:
        window_id += 1
        train_slice = df.iloc[start: start + train_len]
        test_slice = df.iloc[start + train_len: start + train_len + test_len]

        logger.info(
            f"  [{stock_code}] 窗口 {window_id}: "
            f"训练 {train_slice.index[0].date()}~{train_slice.index[-1].date()} ({len(train_slice)}天) → "
            f"测试 {test_slice.index[0].date()}~{test_slice.index[-1].date()} ({len(test_slice)}天)"
        )

        # 自适应 max_shares
        avg_price = train_slice["close"].mean()
        max_sh = max(int(100_000 / avg_price / 100) * 100, 100)

        # 训练
        train_env = TradingEnv(
            train_slice, initial_cash=100_000.0, commission=0.001, max_shares=max_sh
        )
        config = PPOConfig(
            lr=3e-4,
            gamma=0.99,
            gae_lambda=0.95,
            clip_eps=0.2,
            entropy_coef=0.05,
            value_coef=0.5,
            max_grad_norm=0.5,
            n_epochs=8,
            batch_size=64,
            rollout_steps=256,
            hidden_dim=64,
        )

        # 每个窗口用不同种子
        torch.manual_seed(window_id * 42)
        np.random.seed(window_id * 42)

        trainer = PPOTrainer(train_env, config)
        trainer.train(total_timesteps=train_steps)

        # 评估
        test_env = TradingEnv(
            test_slice, initial_cash=100_000.0, commission=0.001, max_shares=max_sh
        )
        m = evaluate(trainer.policy, test_env, n_episodes=1, deterministic=True)[0]

        bh = float(test_slice["close"].iloc[-1] / test_slice["close"].iloc[0] - 1.0)
        alpha = m["total_return"] - bh

        result = WindowResult(
            stock=stock_code,
            window_id=window_id,
            train_start=str(train_slice.index[0].date()),
            train_end=str(train_slice.index[-1].date()),
            test_start=str(test_slice.index[0].date()),
            test_end=str(test_slice.index[-1].date()),
            train_days=len(train_slice),
            test_days=len(test_slice),
            ppo_return=m["total_return"],
            bh_return=bh,
            ppo_sharpe=m["sharpe_ratio"],
            ppo_max_dd=m["max_drawdown"],
            ppo_trades=m["trade_count"],
            alpha=alpha,
            win=alpha > 0,
        )
        results.append(result)

        logger.info(
            f"    PPO: {m['total_return']:+.2%} | B&H: {bh:+.2%} | "
            f"Alpha: {alpha:+.2%} {'✅' if alpha > 0 else '❌'}"
        )

        start += slide

    return results


# ======================================================================
# 主函数
# ======================================================================

def main():
    parser = argparse.ArgumentParser(description="Walk-Forward 滚动窗口评估")
    parser.add_argument("--csv", default="~/Desktop/daily_price_data_2018_2025.csv")
    parser.add_argument("--top", type=int, default=5, help="选数据量前 N 的股票")
    parser.add_argument("--train-len", type=int, default=200, help="训练窗口天数")
    parser.add_argument("--test-len", type=int, default=30, help="测试窗口天数")
    parser.add_argument("--slide", type=int, default=30, help="窗口滑动步长")
    parser.add_argument("--steps", type=int, default=100000, help="每窗口训练步数")
    parser.add_argument("--min-days", type=int, default=280, help="股票最少天数")
    args = parser.parse_args()

    csv_path = str(Path(args.csv).expanduser())

    # 加载数据
    all_stocks = load_all_stocks(csv_path)

    # 选股
    logger.info(f"选择数据量前 {args.top} 的股票 (>= {args.min_days} 天):")
    codes = select_top_stocks(all_stocks, args.top, args.min_days)

    if not codes:
        logger.error("没有符合条件的股票！")
        return

    # 逐股票滚动评估
    all_results: list[WindowResult] = []

    for code in codes:
        df = all_stocks[code]
        logger.info(f"\n{'='*60}")
        logger.info(f"股票: {code} ({len(df)} 天)")
        logger.info(f"{'='*60}")

        results = run_walk_forward(
            df, code,
            train_len=args.train_len,
            test_len=args.test_len,
            slide=args.slide,
            train_steps=args.steps,
        )
        all_results.extend(results)

    # ================================================================
    # 汇总报告
    # ================================================================
    n_total = len(all_results)
    n_win = sum(1 for r in all_results if r.win)
    win_rate = n_win / n_total if n_total > 0 else 0

    alphas = [r.alpha for r in all_results]
    avg_alpha = np.mean(alphas)
    std_alpha = np.std(alphas)
    avg_sharpe = np.mean([r.ppo_sharpe for r in all_results])

    print(f"\n{'='*70}")
    print(f"  📊 Walk-Forward 滚动窗口评估报告")
    print(f"{'='*70}")
    print(f"  股票数: {len(codes)} | 总窗口数: {n_total}")
    print(f"  训练窗口: {args.train_len}天 | 测试窗口: {args.test_len}天 | 滑动步长: {args.slide}天")
    print(f"  每窗口训练: {args.steps:,} 步")
    print()

    # 逐窗口明细
    print(f"  {'股票':<12} {'窗口':>4} {'测试区间':<25} {'PPO':>8} {'B&H':>8} {'Alpha':>8} {'结果':>4}")
    print(f"  {'-'*72}")
    for r in all_results:
        flag = "✅" if r.win else "❌"
        print(
            f"  {r.stock:<12} {r.window_id:>4} "
            f"{r.test_start}~{r.test_end}  "
            f"{r.ppo_return:>+7.2%} {r.bh_return:>+7.2%} {r.alpha:>+7.2%}  {flag}"
        )

    print(f"  {'-'*72}")
    print()

    # 汇总统计
    print(f"  ┌────────────────────────────────────┐")
    print(f"  │  总胜率:  {n_win}/{n_total} ({win_rate:.0%})")
    print(f"  │  平均 Alpha:  {avg_alpha:+.2%} (± {std_alpha:.2%})")
    print(f"  │  平均夏普:    {avg_sharpe:+.2f}")
    print(f"  └────────────────────────────────────┘")
    print()

    # 分股票统计
    print(f"  按股票拆分:")
    for code in codes:
        stock_results = [r for r in all_results if r.stock == code]
        sw = sum(1 for r in stock_results if r.win)
        sa = np.mean([r.alpha for r in stock_results])
        print(f"    {code}: {sw}/{len(stock_results)} 胜 | 平均Alpha {sa:+.2%}")

    print()

    if 0.45 <= win_rate <= 0.75:
        print(f"  ✅ 胜率 {win_rate:.0%} 在合理区间 (45%~75%)，策略有效")
    elif win_rate > 0.75:
        print(f"  ⚠️  胜率 {win_rate:.0%} 偏高，可能存在过拟合风险")
    else:
        print(f"  ⚠️  胜率 {win_rate:.0%} 偏低，策略需要优化")

    print(f"\n{'='*70}")

    # 保存结果到 CSV
    results_df = pd.DataFrame([
        {
            "stock": r.stock, "window": r.window_id,
            "test_start": r.test_start, "test_end": r.test_end,
            "ppo_return": r.ppo_return, "bh_return": r.bh_return,
            "alpha": r.alpha, "sharpe": r.ppo_sharpe,
            "max_dd": r.ppo_max_dd, "trades": r.ppo_trades, "win": r.win,
        }
        for r in all_results
    ])
    out_path = _root / "checkpoints" / "walk_forward_results.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    results_df.to_csv(out_path, index=False)
    print(f"  详细结果已保存: {out_path}")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
