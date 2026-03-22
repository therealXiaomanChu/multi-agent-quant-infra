#!/usr/bin/env python3
"""
A2C vs PPO 消融实验 (v2 — relative reward)

实验设计:
  1. 贵州茅台 600519.SH — reward_mode 对比 (absolute vs relative)
  2. 贵州茅台 600519.SH — A2C vs PPO (relative reward)
  3. Walk-Forward 302132.SZ — A2C vs PPO 滚动窗口消融

Usage:
    cd trading-engine
    python -m scripts.a2c_vs_ppo --csv ~/Desktop/daily_price_data_2018_2025.csv
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
logger = logging.getLogger("a2c_vs_ppo")


# ======================================================================
# 数据加载
# ======================================================================

def load_stock_data(csv_path: str, ts_code: str,
                    start_date: str, end_date: str) -> pd.DataFrame:
    df = pd.read_csv(
        csv_path,
        usecols=["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
        dtype={"ts_code": str, "trade_date": str},
    )
    mask = ((df["ts_code"] == ts_code)
            & (df["trade_date"] >= start_date)
            & (df["trade_date"] <= end_date))
    stock = df[mask].copy()
    if stock.empty:
        raise ValueError(f"{ts_code} 在 {start_date}~{end_date} 无数据")
    stock["trade_date"] = pd.to_datetime(stock["trade_date"], format="%Y%m%d")
    stock = stock.sort_values("trade_date").set_index("trade_date")
    stock = stock.rename(columns={"vol": "volume"})
    stock["volume"] = stock["volume"] * 100
    stock = stock[["open", "high", "low", "close", "volume"]].dropna()
    return stock


def load_stock_full(csv_path: str, ts_code: str) -> pd.DataFrame:
    df = pd.read_csv(
        csv_path,
        usecols=["ts_code", "trade_date", "open", "high", "low", "close", "vol"],
        dtype={"ts_code": str, "trade_date": str},
    )
    stock = df[df["ts_code"] == ts_code].copy()
    stock["trade_date"] = pd.to_datetime(stock["trade_date"], format="%Y%m%d")
    stock = stock.sort_values("trade_date").set_index("trade_date")
    stock = stock.rename(columns={"vol": "volume"})
    stock["volume"] = stock["volume"] * 100
    stock = stock[["open", "high", "low", "close", "volume"]].dropna()
    return stock


# ======================================================================
# 训练+评估 工具函数
# ======================================================================

def train_and_eval(algo: str, train_df, test_df, max_sh: int,
                   train_steps: int, reward_mode: str = "relative",
                   hidden_dim: int = 128, seed: int = 42) -> dict:
    """统一的训练+评估接口。"""
    from src.rl import (TradingEnv, PPOTrainer, PPOConfig,
                        A2CTrainer, A2CConfig, evaluate)

    torch.manual_seed(seed)
    np.random.seed(seed)

    train_env = TradingEnv(
        train_df, initial_cash=100_000.0, commission=0.001,
        max_shares=max_sh, reward_mode=reward_mode,
    )

    if algo == "PPO":
        config = PPOConfig(
            lr=1e-4, gamma=0.995, gae_lambda=0.97, clip_eps=0.2,
            entropy_coef=0.03, value_coef=0.5, max_grad_norm=0.5,
            n_epochs=6, batch_size=128, rollout_steps=1024,
            hidden_dim=hidden_dim,
        )
        trainer = PPOTrainer(train_env, config)
    else:
        config = A2CConfig(
            lr=7e-4, gamma=0.995, gae_lambda=0.97,
            entropy_coef=0.03, value_coef=0.5, max_grad_norm=0.5,
            rollout_steps=256, hidden_dim=hidden_dim,
        )
        trainer = A2CTrainer(train_env, config)

    trainer.train(total_timesteps=train_steps)

    # 评估时用 absolute reward（不影响决策，只影响 metrics 记录）
    test_env = TradingEnv(
        test_df, initial_cash=100_000.0, commission=0.001,
        max_shares=max_sh, reward_mode="absolute",
    )
    metrics = evaluate(trainer.policy, test_env, n_episodes=1, deterministic=True)[0]
    return metrics


def train_and_eval_wf(algo: str, train_slice, test_slice, max_sh: int,
                      train_steps: int, reward_mode: str = "relative",
                      hidden_dim: int = 64, seed: int = 42) -> dict:
    """Walk-Forward 用的训练+评估（更小网络、更短 rollout）。"""
    from src.rl import (TradingEnv, PPOTrainer, PPOConfig,
                        A2CTrainer, A2CConfig, evaluate)

    torch.manual_seed(seed)
    np.random.seed(seed)

    train_env = TradingEnv(
        train_slice, initial_cash=100_000.0, commission=0.001,
        max_shares=max_sh, reward_mode=reward_mode,
    )

    if algo == "PPO":
        config = PPOConfig(
            lr=3e-4, gamma=0.99, gae_lambda=0.95, clip_eps=0.2,
            entropy_coef=0.05, value_coef=0.5, max_grad_norm=0.5,
            n_epochs=8, batch_size=64, rollout_steps=256,
            hidden_dim=hidden_dim,
        )
        trainer = PPOTrainer(train_env, config)
    else:
        config = A2CConfig(
            lr=7e-4, gamma=0.99, gae_lambda=0.95,
            entropy_coef=0.05, value_coef=0.5, max_grad_norm=0.5,
            rollout_steps=256, hidden_dim=hidden_dim,
        )
        trainer = A2CTrainer(train_env, config)

    trainer.train(total_timesteps=train_steps)

    test_env = TradingEnv(
        test_slice, initial_cash=100_000.0, commission=0.001,
        max_shares=max_sh, reward_mode="absolute",
    )
    metrics = evaluate(trainer.policy, test_env, n_episodes=1, deterministic=True)[0]
    return metrics


# ======================================================================
# 实验 1: Reward Mode 消融 (absolute vs relative)
# ======================================================================

def experiment_reward_ablation(csv_path: str, train_steps: int) -> dict:
    logger.info("=" * 60)
    logger.info("实验 1: Reward 消融 — absolute(v2) vs relative(v3)")
    logger.info("  贵州茅台 600519.SH | PPO + A2C 各跑两种 reward")
    logger.info("=" * 60)

    train_df = load_stock_data(csv_path, "600519.SH", "20200101", "20231231")
    test_df = load_stock_data(csv_path, "600519.SH", "20240101", "20241231")
    logger.info(f"训练集: {len(train_df)} 天 | 测试集: {len(test_df)} 天")

    avg_price = train_df["close"].mean()
    max_sh = max(int(100_000 / avg_price / 100) * 100, 100)
    bh = float(test_df["close"].iloc[-1] / test_df["close"].iloc[0] - 1.0)

    results = {"bh_return": bh}

    for algo in ["PPO", "A2C"]:
        for mode in ["absolute", "relative"]:
            key = f"{algo.lower()}_{mode}"
            logger.info(f"\n--- {algo} + {mode} reward ({train_steps:,} 步) ---")
            m = train_and_eval(algo, train_df, test_df, max_sh, train_steps,
                               reward_mode=mode)
            results[key] = m
            logger.info(
                f"  {key}: return={m['total_return']:+.2%} "
                f"trades={m['trade_count']} sharpe={m['sharpe_ratio']:.2f}"
            )

    return results


# ======================================================================
# 实验 2: Walk-Forward 302132.SZ (relative reward)
# ======================================================================

@dataclass
class WFResult:
    stock: str
    window_id: int
    algo: str
    agent_return: float
    bh_return: float
    alpha: float
    sharpe: float
    max_dd: float
    trades: int
    win: bool


def experiment_walk_forward(csv_path: str, train_steps: int) -> list[WFResult]:
    logger.info("\n" + "=" * 60)
    logger.info("实验 2: Walk-Forward 302132.SZ — A2C vs PPO (relative reward)")
    logger.info("=" * 60)

    df = load_stock_full(csv_path, "302132.SZ")
    logger.info(f"302132.SZ: {len(df)} 天 ({df.index[0].date()} ~ {df.index[-1].date()})")

    total_days = len(df)
    train_len, test_len, slide = 200, 30, 30
    results = []
    window_id = 0
    start = 0

    while start + train_len + test_len <= total_days:
        window_id += 1
        train_slice = df.iloc[start: start + train_len]
        test_slice = df.iloc[start + train_len: start + train_len + test_len]

        logger.info(
            f"  窗口 {window_id}: "
            f"训练 {train_slice.index[0].date()}~{train_slice.index[-1].date()} ({len(train_slice)}天) → "
            f"测试 {test_slice.index[0].date()}~{test_slice.index[-1].date()} ({len(test_slice)}天)"
        )

        avg_price = train_slice["close"].mean()
        max_sh = max(int(100_000 / avg_price / 100) * 100, 100)
        bh = float(test_slice["close"].iloc[-1] / test_slice["close"].iloc[0] - 1.0)

        for algo in ["PPO", "A2C"]:
            m = train_and_eval_wf(
                algo, train_slice, test_slice, max_sh, train_steps,
                reward_mode="relative", seed=window_id * 42,
            )
            alpha = m["total_return"] - bh

            results.append(WFResult(
                stock="302132.SZ", window_id=window_id, algo=algo,
                agent_return=m["total_return"], bh_return=bh,
                alpha=alpha, sharpe=m["sharpe_ratio"],
                max_dd=m["max_drawdown"], trades=m["trade_count"],
                win=alpha > 0,
            ))
            logger.info(
                f"    {algo}: {m['total_return']:+.2%} | B&H: {bh:+.2%} | "
                f"Alpha: {alpha:+.2%} | trades: {m['trade_count']} "
                f"{'WIN' if alpha > 0 else 'LOSE'}"
            )

        start += slide

    return results


# ======================================================================
# 打印结果
# ======================================================================

def print_reward_ablation(results: dict) -> None:
    bh = results["bh_return"]

    print(f"\n{'='*78}")
    print(f"  实验 1: Reward 消融 — 贵州茅台 600519.SH")
    print(f"  目的: 验证 relative reward 是否解决「躺平」问题")
    print(f"{'='*78}")
    print(f"  {'配置':<20} {'收益率':>10} {'Sharpe':>8} {'MaxDD':>8} {'交易次数':>8} {'终值':>12}")
    print(f"  {'-'*68}")

    for key in ["ppo_absolute", "ppo_relative", "a2c_absolute", "a2c_relative"]:
        m = results[key]
        label = key.replace("_", " ").upper()
        print(
            f"  {label:<20} {m['total_return']:>+9.2%} {m['sharpe_ratio']:>+7.2f} "
            f"{m['max_drawdown']:>7.2%} {m['trade_count']:>8d} {m['final_value']:>11,.2f}"
        )

    print(f"  {'-'*68}")
    print(f"  {'Buy & Hold':<20} {bh:>+9.2%} {'—':>8} {'—':>8} {'0':>8} {100_000*(1+bh):>11,.2f}")
    print(f"{'='*78}")

    # 分析
    ppo_abs_trades = results["ppo_absolute"]["trade_count"]
    ppo_rel_trades = results["ppo_relative"]["trade_count"]
    a2c_abs_trades = results["a2c_absolute"]["trade_count"]
    a2c_rel_trades = results["a2c_relative"]["trade_count"]

    print(f"\n  交易次数变化:")
    print(f"    PPO: {ppo_abs_trades} (absolute) → {ppo_rel_trades} (relative)")
    print(f"    A2C: {a2c_abs_trades} (absolute) → {a2c_rel_trades} (relative)")

    if ppo_rel_trades > ppo_abs_trades or a2c_rel_trades > a2c_abs_trades:
        print(f"    -> relative reward 成功激活了交易行为")
    else:
        print(f"    -> 交易次数无显著变化")
    print()


def print_walk_forward_results(results: list[WFResult]) -> None:
    print(f"\n{'='*78}")
    print(f"  实验 2: Walk-Forward 302132.SZ — A2C vs PPO (relative reward)")
    print(f"{'='*78}")

    print(f"\n  {'窗口':>4} {'算法':<5} {'收益率':>8} {'B&H':>8} {'Alpha':>8} {'Sharpe':>7} {'MaxDD':>7} {'交易':>4} {'结果':>4}")
    print(f"  {'-'*62}")

    windows = sorted(set(r.window_id for r in results))
    for wid in windows:
        for algo in ["PPO", "A2C"]:
            r = [x for x in results if x.window_id == wid and x.algo == algo][0]
            flag = "WIN" if r.win else "LOSE"
            print(
                f"  {r.window_id:>4} {r.algo:<5} "
                f"{r.agent_return:>+7.2%} {r.bh_return:>+7.2%} {r.alpha:>+7.2%} "
                f"{r.sharpe:>+6.2f} {r.max_dd:>6.2%} {r.trades:>4d}  {flag}"
            )
        print(f"  {'-'*62}")

    # 汇总统计
    stats = {}
    for algo in ["PPO", "A2C"]:
        ar = [r for r in results if r.algo == algo]
        n = len(ar)
        wins = sum(1 for r in ar if r.win)
        stats[algo] = {
            "wins": wins, "n": n,
            "win_rate": wins / n if n > 0 else 0,
            "avg_alpha": np.mean([r.alpha for r in ar]),
            "avg_sharpe": np.mean([r.sharpe for r in ar]),
            "avg_dd": np.mean([r.max_dd for r in ar]),
            "avg_trades": np.mean([r.trades for r in ar]),
            "avg_return": np.mean([r.agent_return for r in ar]),
        }

    print(f"\n  汇总统计:")
    print(f"  {'':>14} {'PPO':>12} {'A2C':>12}")
    print(f"  {'-'*40}")
    p, a = stats["PPO"], stats["A2C"]
    print(f"  {'胜率 vs B&H':<14} {p['wins']}/{p['n']} ({p['win_rate']:.0%}){' ':>5} {a['wins']}/{a['n']} ({a['win_rate']:.0%})")
    print(f"  {'平均收益率':<14} {p['avg_return']:>+11.2%} {a['avg_return']:>+11.2%}")
    print(f"  {'平均Alpha':<14} {p['avg_alpha']:>+11.2%} {a['avg_alpha']:>+11.2%}")
    print(f"  {'平均Sharpe':<14} {p['avg_sharpe']:>+11.2f} {a['avg_sharpe']:>+11.2f}")
    print(f"  {'平均MaxDD':<14} {p['avg_dd']:>11.2%} {a['avg_dd']:>11.2%}")
    print(f"  {'平均交易数':<14} {p['avg_trades']:>11.1f} {a['avg_trades']:>11.1f}")
    print(f"  {'-'*40}")

    # Head-to-head
    h2h = {"PPO": 0, "A2C": 0, "tie": 0}
    for wid in windows:
        ppo_r = [x for x in results if x.window_id == wid and x.algo == "PPO"][0]
        a2c_r = [x for x in results if x.window_id == wid and x.algo == "A2C"][0]
        if a2c_r.alpha > ppo_r.alpha:
            h2h["A2C"] += 1
        elif ppo_r.alpha > a2c_r.alpha:
            h2h["PPO"] += 1
        else:
            h2h["tie"] += 1

    print(f"\n  Head-to-Head (同窗口 Alpha 对比):")
    print(f"    PPO 胜: {h2h['PPO']} | A2C 胜: {h2h['A2C']} | 平局: {h2h['tie']}")

    # Base agent 建议
    print(f"\n  Base Agent 分析:")
    if p['win_rate'] > a['win_rate']:
        print(f"    胜率: PPO > A2C → PPO 更稳定")
    elif a['win_rate'] > p['win_rate']:
        print(f"    胜率: A2C > PPO → A2C 更稳定")
    else:
        print(f"    胜率: 持平")

    if h2h["PPO"] > h2h["A2C"]:
        print(f"    H2H:  PPO 领先 → PPO 在直接对比中表现更好")
    elif h2h["A2C"] > h2h["PPO"]:
        print(f"    H2H:  A2C 领先 → A2C 在直接对比中表现更好")
    else:
        print(f"    H2H:  持平")

    print(f"{'='*78}")


# ======================================================================
# Main
# ======================================================================

def main():
    parser = argparse.ArgumentParser(description="A2C vs PPO 消融实验 (v2)")
    parser.add_argument("--csv", default="~/Desktop/daily_price_data_2018_2025.csv")
    parser.add_argument("--steps", type=int, default=150000, help="贵州茅台训练步数")
    parser.add_argument("--wf-steps", type=int, default=100000, help="Walk-Forward 每窗口训练步数")
    args = parser.parse_args()

    csv_path = str(Path(args.csv).expanduser())

    # 实验 1: Reward 消融
    reward_results = experiment_reward_ablation(csv_path, args.steps)
    print_reward_ablation(reward_results)

    # 实验 2: Walk-Forward
    wf_results = experiment_walk_forward(csv_path, args.wf_steps)
    print_walk_forward_results(wf_results)

    # 保存
    out_dir = _root / "checkpoints" / "ablation_v2"
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for r in wf_results:
        rows.append({
            "stock": r.stock, "window": r.window_id, "algo": r.algo,
            "return": r.agent_return, "bh_return": r.bh_return,
            "alpha": r.alpha, "sharpe": r.sharpe,
            "max_dd": r.max_dd, "trades": r.trades, "win": r.win,
        })
    pd.DataFrame(rows).to_csv(out_dir / "walk_forward_relative.csv", index=False)
    logger.info(f"结果已保存至 {out_dir}")


if __name__ == "__main__":
    main()
