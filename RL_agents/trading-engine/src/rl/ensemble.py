"""
Ensemble 选择器 — 按验证期 Sharpe ratio 滚动选优

实现 Yang et al. (ICAIF 2020) 的核心思想：
  - 每个滚动窗口训练 PPO、A2C、DDPG 三个 agent
  - 在验证期上各跑一遍，计算 Sharpe ratio
  - 选 Sharpe 最高的 agent 用于实际交易窗口

窗口划分：
  |<--- train_len --->|<- val ->|<- test ->|
  |     训练集         | 验证期  | 测试期    |
                       ↑ 选agent  ↑ 评估
"""

import logging
import numpy as np
import pandas as pd
import torch
from dataclasses import dataclass
from typing import Optional

from .env import TradingEnv
from .ppo import PPOTrainer, PPOConfig, evaluate
from .a2c import A2CTrainer, A2CConfig
from .ddpg import DDPGTrainer, DDPGConfig, evaluate_ddpg
from .risk_manager import RiskConfig, evaluate_with_risk, compute_vol_threshold
from .features import get_observation_dim

logger = logging.getLogger(__name__)

ALGO_NAMES = ["PPO", "A2C", "DDPG"]


@dataclass
class EnsembleWindowResult:
    """单个窗口的 ensemble 评估结果。"""
    window_id: int
    test_start: str
    test_end: str
    # 验证期各 agent 的 Sharpe
    val_sharpe_ppo: float
    val_sharpe_a2c: float
    val_sharpe_ddpg: float
    # 选中的 agent
    selected_algo: str
    # 选中 agent 在测试期的表现
    ensemble_return: float
    ensemble_sharpe: float
    ensemble_trades: int
    ensemble_max_dd: float
    # 各 agent 在测试期的表现（用于对比）
    ppo_return: float
    a2c_return: float
    ddpg_return: float
    bh_return: float
    # Alpha
    ensemble_alpha: float
    oracle_alpha: float
    oracle_algo: str
    # 风控后结果 (None if no risk_config)
    risk_return: Optional[float] = None
    risk_alpha: Optional[float] = None
    risk_stopped: Optional[bool] = None


def _make_trainer(algo: str, env: TradingEnv, hidden_dim: int = 64):
    """创建指定算法的 trainer。"""
    if algo == "PPO":
        cfg = PPOConfig(
            lr=3e-4, gamma=0.99, gae_lambda=0.95, clip_eps=0.2,
            entropy_coef=0.05, value_coef=0.5, max_grad_norm=0.5,
            n_epochs=8, batch_size=64, rollout_steps=512,
            hidden_dim=hidden_dim,
        )
        return PPOTrainer(env, cfg)
    elif algo == "A2C":
        cfg = A2CConfig(
            lr=7e-4, gamma=0.99, gae_lambda=0.95,
            entropy_coef=0.05, value_coef=0.5, max_grad_norm=0.5,
            rollout_steps=256, hidden_dim=hidden_dim,
        )
        return A2CTrainer(env, cfg)
    elif algo == "DDPG":
        cfg = DDPGConfig(
            actor_lr=1e-4, critic_lr=1e-3, gamma=0.99, tau=0.005,
            batch_size=64, buffer_size=50000, warmup_steps=500,
            noise_sigma=0.3, noise_decay=0.9995, hidden_dim=hidden_dim,
        )
        return DDPGTrainer(env, cfg)
    else:
        raise ValueError(f"Unknown algo: {algo}")


def _eval_agent(algo: str, trainer, env: TradingEnv) -> dict:
    """评估单个 agent（自动处理 discrete/continuous 区别）。"""
    if algo == "DDPG":
        return evaluate_ddpg(trainer.actor, env, n_episodes=1)[0]
    else:
        return evaluate(trainer.policy, env, n_episodes=1, deterministic=True)[0]


def run_ensemble_walk_forward(
    df: pd.DataFrame,
    train_len: int = 480,
    val_len: int = 60,
    test_len: int = 60,
    slide: int = 60,
    train_steps: int = 100_000,
    hidden_dim: int = 64,
    initial_cash: float = 100_000.0,
    commission: float = 0.001,
    risk_config: Optional[RiskConfig] = None,
) -> list[EnsembleWindowResult]:
    """
    执行 ensemble walk-forward 评估。

    Args:
        df: 完整 OHLCV 数据
        train_len: 训练窗口长度
        val_len: 验证期长度（从训练集末尾切出）
        test_len: 测试期长度
        slide: 窗口滑动步长
        train_steps: 每个 agent 的训练步数
        hidden_dim: 网络隐藏层维度
        initial_cash: 初始资金
        commission: 手续费率
    """
    total_days = len(df)
    # 实际训练天数 = train_len - val_len（验证期从训练集末尾切出）
    actual_train_len = train_len - val_len

    results = []
    window_id = 0
    start = 0

    while start + train_len + test_len <= total_days:
        window_id += 1

        train_slice = df.iloc[start: start + actual_train_len]
        val_slice = df.iloc[start + actual_train_len: start + train_len]
        test_slice = df.iloc[start + train_len: start + train_len + test_len]

        logger.info(
            f"窗口 {window_id}: "
            f"训练 {train_slice.index[0].date()}~{train_slice.index[-1].date()} ({len(train_slice)}天) | "
            f"验证 {val_slice.index[0].date()}~{val_slice.index[-1].date()} ({len(val_slice)}天) | "
            f"测试 {test_slice.index[0].date()}~{test_slice.index[-1].date()} ({len(test_slice)}天)"
        )

        avg_price = train_slice["close"].mean()
        max_sh = max(int(initial_cash / avg_price / 100) * 100, 100)
        bh_return = float(
            test_slice["close"].iloc[-1] / test_slice["close"].iloc[0] - 1.0
        )

        # ---- 训练三个 agent ----
        trainers = {}
        val_sharpes = {}
        test_metrics = {}

        for algo in ALGO_NAMES:
            torch.manual_seed(window_id * 42)
            np.random.seed(window_id * 42)

            is_ddpg = algo == "DDPG"
            action_type = "continuous" if is_ddpg else "discrete"

            # 训练
            train_env = TradingEnv(
                train_slice, initial_cash=initial_cash, commission=commission,
                max_shares=max_sh, reward_mode="delta",
                action_type=action_type,
            )
            trainer = _make_trainer(algo, train_env, hidden_dim)
            trainer.train(total_timesteps=train_steps)
            trainers[algo] = trainer

            # 验证期评估 → 计算 Sharpe
            val_env = TradingEnv(
                val_slice, initial_cash=initial_cash, commission=commission,
                max_shares=max_sh, reward_mode="delta",
                action_type=action_type,
            )
            val_m = _eval_agent(algo, trainer, val_env)
            val_sharpes[algo] = val_m["sharpe_ratio"]

            # 测试期评估（所有 agent 都跑，用于对比）
            test_env = TradingEnv(
                test_slice, initial_cash=initial_cash, commission=commission,
                max_shares=max_sh, reward_mode="delta",
                action_type=action_type,
            )
            test_m = _eval_agent(algo, trainer, test_env)
            test_metrics[algo] = test_m

        # ---- 选择 agent ----
        selected = max(val_sharpes, key=val_sharpes.get)
        sel_m = test_metrics[selected]

        # Oracle（事后最优）
        oracle_algo = max(
            ALGO_NAMES,
            key=lambda a: test_metrics[a]["total_return"] - bh_return,
        )
        oracle_alpha = test_metrics[oracle_algo]["total_return"] - bh_return

        ensemble_alpha = sel_m["total_return"] - bh_return

        logger.info(
            f"  验证Sharpe: PPO={val_sharpes['PPO']:+.2f} "
            f"A2C={val_sharpes['A2C']:+.2f} "
            f"DDPG={val_sharpes['DDPG']:+.2f} "
            f"→ 选中 {selected}"
        )
        logger.info(
            f"  测试结果: {selected}={sel_m['total_return']:+.2%} "
            f"B&H={bh_return:+.2%} Alpha={ensemble_alpha:+.2%} "
            f"(Oracle={oracle_algo} {oracle_alpha:+.2%})"
        )

        # ---- 风控评估 ----
        risk_return = None
        risk_alpha = None
        risk_stopped = None

        if risk_config is not None:
            is_sel_ddpg = selected == "DDPG"
            risk_env = TradingEnv(
                test_slice, initial_cash=initial_cash, commission=commission,
                max_shares=max_sh, reward_mode="delta",
                action_type="continuous" if is_sel_ddpg else "discrete",
            )
            sel_policy = trainers[selected].actor if is_sel_ddpg else trainers[selected].policy
            # 用训练集动态计算波动率阈值
            vol_thresh = compute_vol_threshold(
                train_slice, quantile=risk_config.vol_quantile,
            )
            risk_m = evaluate_with_risk(
                sel_policy, risk_env, risk_config, algo=selected,
                vol_threshold=vol_thresh,
            )
            risk_return = risk_m["total_return"]
            risk_alpha = risk_return - bh_return
            risk_stopped = risk_m["stopped_out"]
            logger.info(
                f"  风控: {risk_return:+.2%} (alpha={risk_alpha:+.2%}) "
                f"{'[止损]' if risk_stopped else ''}"
            )

        results.append(EnsembleWindowResult(
            window_id=window_id,
            test_start=str(test_slice.index[0].date()),
            test_end=str(test_slice.index[-1].date()),
            val_sharpe_ppo=val_sharpes["PPO"],
            val_sharpe_a2c=val_sharpes["A2C"],
            val_sharpe_ddpg=val_sharpes["DDPG"],
            selected_algo=selected,
            ensemble_return=sel_m["total_return"],
            ensemble_sharpe=sel_m["sharpe_ratio"],
            ensemble_trades=sel_m["trade_count"],
            ensemble_max_dd=sel_m["max_drawdown"],
            ppo_return=test_metrics["PPO"]["total_return"],
            a2c_return=test_metrics["A2C"]["total_return"],
            ddpg_return=test_metrics["DDPG"]["total_return"],
            bh_return=bh_return,
            ensemble_alpha=ensemble_alpha,
            oracle_alpha=oracle_alpha,
            oracle_algo=oracle_algo,
            risk_return=risk_return,
            risk_alpha=risk_alpha,
            risk_stopped=risk_stopped,
        ))

        start += slide

    return results


def print_ensemble_report(results: list[EnsembleWindowResult]) -> None:
    """打印 ensemble 评估报告。"""
    n = len(results)

    print(f"\n{'='*90}")
    print(f"  Ensemble Walk-Forward 评估报告")
    print(f"  策略: 验证期 Sharpe ratio 选优 (Yang et al. ICAIF 2020)")
    print(f"{'='*90}")

    # 逐窗口
    print(f"\n  {'窗口':>4} {'测试区间':<23} {'选中':>5} {'Ensemble':>9} {'B&H':>8} {'Alpha':>8} {'Oracle':>6} {'Orc_a':>8}")
    print(f"  {'-'*80}")
    for r in results:
        e_flag = "WIN" if r.ensemble_alpha > 0 else "   "
        print(
            f"  {r.window_id:>4} {r.test_start}~{r.test_end} "
            f"{r.selected_algo:>5} {r.ensemble_return:>+8.2%} {r.bh_return:>+7.2%} "
            f"{r.ensemble_alpha:>+7.2%} {r.oracle_algo:>6} {r.oracle_alpha:>+7.2%}  {e_flag}"
        )
    print(f"  {'-'*80}")

    # 汇总
    ens_wins = sum(1 for r in results if r.ensemble_alpha > 0)
    orc_wins = sum(1 for r in results if r.oracle_alpha > 0)
    ppo_wins = sum(1 for r in results if r.ppo_return - r.bh_return > 0)
    a2c_wins = sum(1 for r in results if r.a2c_return - r.bh_return > 0)
    ddpg_wins = sum(1 for r in results if r.ddpg_return - r.bh_return > 0)

    avg_ens_alpha = np.mean([r.ensemble_alpha for r in results])
    avg_orc_alpha = np.mean([r.oracle_alpha for r in results])
    avg_ppo_alpha = np.mean([r.ppo_return - r.bh_return for r in results])
    avg_a2c_alpha = np.mean([r.a2c_return - r.bh_return for r in results])
    avg_ddpg_alpha = np.mean([r.ddpg_return - r.bh_return for r in results])

    avg_ens_ret = np.mean([r.ensemble_return for r in results])
    avg_ens_sharpe = np.mean([r.ensemble_sharpe for r in results])

    print(f"\n  胜率对比 (vs B&H):")
    print(f"    {'Ensemble':>10}: {ens_wins}/{n} ({ens_wins/n:.0%})  avg_alpha={avg_ens_alpha:+.2%}")
    print(f"    {'Oracle':>10}: {orc_wins}/{n} ({orc_wins/n:.0%})  avg_alpha={avg_orc_alpha:+.2%}")
    print(f"    {'PPO':>10}: {ppo_wins}/{n} ({ppo_wins/n:.0%})  avg_alpha={avg_ppo_alpha:+.2%}")
    print(f"    {'A2C':>10}: {a2c_wins}/{n} ({a2c_wins/n:.0%})  avg_alpha={avg_a2c_alpha:+.2%}")
    print(f"    {'DDPG':>10}: {ddpg_wins}/{n} ({ddpg_wins/n:.0%})  avg_alpha={avg_ddpg_alpha:+.2%}")

    # 选择器准确率
    correct = sum(1 for r in results if r.selected_algo == r.oracle_algo)
    print(f"\n  选择器准确率: {correct}/{n} ({correct/n:.0%})")

    # 被选中次数
    from collections import Counter
    sel_counts = Counter(r.selected_algo for r in results)
    print(f"  被选中次数: {dict(sel_counts)}")

    # Ensemble vs 最佳单 agent
    best_single_wins = max(ppo_wins, a2c_wins, ddpg_wins)
    best_single_name = "PPO" if ppo_wins == best_single_wins else (
        "A2C" if a2c_wins == best_single_wins else "DDPG"
    )
    delta = ens_wins - best_single_wins
    print(f"\n  Ensemble vs 最佳单Agent ({best_single_name}):")
    print(f"    胜率提升: {best_single_wins}/{n} → {ens_wins}/{n} ({delta:+d} 窗口)")
    print(f"    Alpha提升: {avg_ens_alpha - max(avg_ppo_alpha, avg_a2c_alpha, avg_ddpg_alpha):+.2%}")

    # 风控结果
    if results[0].risk_return is not None:
        risk_wins = sum(1 for r in results if r.risk_alpha > 0)
        avg_risk_alpha = np.mean([r.risk_alpha for r in results])
        n_stopped = sum(1 for r in results if r.risk_stopped)

        print(f"\n  {'─'*40}")
        print(f"  风控层 (Ensemble + Rule-Based):")
        print(f"    胜率: {risk_wins}/{n} ({risk_wins/n:.0%})  avg_alpha={avg_risk_alpha:+.2%}")
        print(f"    止损触发: {n_stopped}/{n} 窗口")
        print(f"    vs 无风控 Ensemble:")
        print(f"      胜率: {ens_wins}/{n} → {risk_wins}/{n} ({risk_wins-ens_wins:+d})")
        print(f"      Alpha: {avg_ens_alpha:+.2%} → {avg_risk_alpha:+.2%} ({avg_risk_alpha-avg_ens_alpha:+.2%})")

    print(f"{'='*90}")
