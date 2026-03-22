#!/usr/bin/env python3
"""
端到端 Demo：训练 PPO 交易 Agent 并与 Buy-and-Hold 基线对比。

Usage:
    python -m scripts.demo
"""

import sys
import logging
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("demo")


def download_data(symbol: str = "SPY", period: str = "5y") -> pd.DataFrame:
    """通过 yfinance 下载历史数据，失败时自动生成模拟数据。"""
    try:
        import yfinance as yf
        logger.info(f"正在下载 {symbol} 最近 {period} 的日线数据...")
        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, auto_adjust=True)
        df.columns = [c.lower() for c in df.columns]
        df = df[["open", "high", "low", "close", "volume"]].dropna()
        if len(df) > 100:
            logger.info(f"下载完成: {len(df)} 个交易日 ({df.index[0].date()} ~ {df.index[-1].date()})")
            return df
        else:
            logger.warning("yfinance 返回数据不足，切换到模拟数据")
    except Exception as e:
        logger.warning(f"yfinance 下载失败 ({e})，切换到模拟数据")

    return generate_synthetic_data()


def generate_synthetic_data(n_days: int = 1260) -> pd.DataFrame:
    """
    生成 ~5 年模拟股价数据。
    包含牛市、熊市、震荡市三段，更贴近真实行情。
    """
    logger.info(f"正在生成 {n_days} 天模拟数据 (多阶段 GBM)...")
    np.random.seed(42)

    dt = 1 / 252
    s0 = 400.0
    dates = pd.bdate_range("2020-01-02", periods=n_days, freq="B")

    # 三段行情：牛市 → 熊市 → 震荡恢复
    segments = [
        (0, int(n_days * 0.4), 0.15, 0.14),
        (int(n_days * 0.4), int(n_days * 0.65), -0.10, 0.25),
        (int(n_days * 0.65), n_days, 0.08, 0.18),
    ]

    log_returns = np.zeros(n_days)
    for start, end, mu, sigma in segments:
        n = end - start
        log_returns[start:end] = (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * np.random.randn(n)

    close = s0 * np.exp(np.cumsum(log_returns))

    daily_range = close * np.abs(np.random.randn(n_days)) * 0.005
    open_prices = close + np.random.randn(n_days) * daily_range * 0.3
    high = np.maximum(close, open_prices) + daily_range
    low = np.minimum(close, open_prices) - daily_range
    volume = np.random.lognormal(mean=17, sigma=0.5, size=n_days).astype(int)

    df = pd.DataFrame({
        "open": open_prices,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume.astype(float),
    }, index=dates[:n_days])

    logger.info(
        f"模拟数据生成完成: {len(df)} 天 "
        f"({df.index[0].date()} ~ {df.index[-1].date()}) "
        f"总涨幅: {close[-1]/close[0]-1:.1%}"
    )
    return df


def buy_and_hold_return(df: pd.DataFrame) -> float:
    return float(df["close"].iloc[-1] / df["close"].iloc[0] - 1.0)


def main() -> None:
    from src.rl import TradingEnv, PPOTrainer, PPOConfig, evaluate

    # ================================================================
    # 1. 数据准备
    # ================================================================
    df = download_data("SPY", period="5y")

    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()
    logger.info(f"训练集: {len(train_df)} 天 | 测试集: {len(test_df)} 天")

    # ================================================================
    # 2. 训练
    # ================================================================
    train_env = TradingEnv(train_df, initial_cash=100_000.0, commission=0.0005)

    config = PPOConfig(
        lr=1e-4,
        gamma=0.995,
        gae_lambda=0.97,
        clip_eps=0.2,
        entropy_coef=0.03,
        value_coef=0.5,
        max_grad_norm=0.5,
        n_epochs=6,
        batch_size=128,
        rollout_steps=1024,
        hidden_dim=128,
    )

    trainer = PPOTrainer(train_env, config)

    total_steps = 150_000

    logger.info("=" * 60)
    logger.info(f"开始训练 PPO Agent（{total_steps:,} 步）...")
    logger.info("=" * 60)

    training_log = trainer.train(total_timesteps=total_steps)

    save_dir = str(_root / "checkpoints" / "ppo_spy")
    trainer.save(save_dir)

    # ================================================================
    # 3. 评估
    # ================================================================
    logger.info("=" * 60)
    logger.info("在测试集上评估...")
    logger.info("=" * 60)

    test_env = TradingEnv(test_df, initial_cash=100_000.0, commission=0.0005)
    eval_results = evaluate(
        trainer.policy, test_env, n_episodes=1, deterministic=True
    )
    ppo_metrics = eval_results[0]

    bh_return = buy_and_hold_return(test_df)

    # ================================================================
    # 4. 打印结果
    # ================================================================
    print("\n" + "=" * 60)
    print("  📊 测试集评估结果")
    print("=" * 60)
    print(f"  测试区间: {test_df.index[0].date()} ~ {test_df.index[-1].date()}")
    print(f"  交易天数: {len(test_df)}")
    print()

    print("  ┌─────────────────────┬──────────────┬──────────────┐")
    print("  │       指标          │   PPO Agent  │ Buy & Hold   │")
    print("  ├─────────────────────┼──────────────┼──────────────┤")
    print(f"  │ 总收益率            │ {ppo_metrics['total_return']:>+11.2%} │ {bh_return:>+11.2%} │")
    print(f"  │ 夏普比率            │ {ppo_metrics['sharpe_ratio']:>+11.2f} │       —      │")
    print(f"  │ 最大回撤            │ {ppo_metrics['max_drawdown']:>11.2%} │       —      │")
    print(f"  │ 年化波动率          │ {ppo_metrics['volatility']:>11.2%} │       —      │")
    print(f"  │ 交易次数            │ {ppo_metrics['trade_count']:>11d} │       0      │")
    print(f"  │ 终值 ($)            │ {ppo_metrics['final_value']:>11,.2f} │ {100_000 * (1 + bh_return):>11,.2f} │")
    print("  └─────────────────────┴──────────────┴──────────────┘")
    print()

    outperform = ppo_metrics["total_return"] > bh_return
    if outperform:
        print("  ✅ PPO Agent 跑赢了 Buy & Hold 基线！")
    else:
        alpha = ppo_metrics["total_return"] - bh_return
        print(f"  ⚠️  PPO Agent 未跑赢 Buy & Hold（差距: {alpha:+.2%}）")
        print("     可尝试: 增加训练步数 / 调整 entropy_coef / 使用真实数据")

    print(f"\n  模型已保存至: {save_dir}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
