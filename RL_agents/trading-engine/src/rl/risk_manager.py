"""
Rule-Based 风控 Agent — 回撤止损 + 波动率过滤

在 RL agent 做出决策后，风控层有权覆盖其动作：
  1. 最大回撤止损：组合回撤超过阈值 → 强制清仓，冷却 N 天后自动解锁
  2. 波动率过滤：当前波动率超过动态阈值 → 禁止开新仓

设计原则（Yang et al.）：
  - RL agent 负责 alpha 生成（择时）
  - Rule-Based agent 负责风险控制（止损）
  - 两者组合 = "能赚钱" + "不亏大钱"
"""

import numpy as np
import pandas as pd
import torch
import logging
from dataclasses import dataclass
from typing import Optional

from .env import TradingEnv

logger = logging.getLogger(__name__)


@dataclass
class RiskConfig:
    """风控参数。"""
    max_drawdown: float = 0.10          # 最大回撤阈值（10%）
    cooldown_steps: int = 5             # 止损后冷却期（天数，到期自动解锁）
    vol_quantile: float = 0.80          # 波动率阈值分位数（用训练集动态计算）


def compute_vol_threshold(train_df: pd.DataFrame, quantile: float = 0.80) -> float:
    """根据训练集收益率的滚动波动率，取指定分位数作为阈值。"""
    returns = np.log(train_df["close"] / train_df["close"].shift(1)).dropna()
    rolling_vol = returns.rolling(20).std() * np.sqrt(252)
    rolling_vol = rolling_vol.dropna()
    if len(rolling_vol) == 0:
        return 0.5  # fallback
    return float(rolling_vol.quantile(quantile))


def evaluate_with_risk(
    policy,
    env: TradingEnv,
    risk_config: RiskConfig,
    algo: str = "PPO",
    device: str = "cpu",
    vol_threshold: Optional[float] = None,
) -> dict:
    """
    带风控的评估：RL agent 做决策，风控层可覆盖。

    风控逻辑:
      1. 回撤止损：drawdown >= max_drawdown → 强制清仓 + 进入冷却期
         冷却期内锁仓（HOLD/0仓位），冷却期结束后自动解锁，
         peak_value 重置为当前值，允许 agent 重新交易
      2. 波动率过滤：当前波动率 > 阈值 → 禁止开新仓（但不强制卖出）

    Args:
        policy: PPO/A2C 的 ActorCritic 或 DDPG 的 DDPGActor
        env: 交易环境
        risk_config: 风控参数
        algo: "PPO"/"A2C" 或 "DDPG"
        device: torch 设备
        vol_threshold: 波动率阈值（由训练集计算，外部传入）

    Returns:
        环境 metrics + 风控统计
    """
    dev = torch.device(device)
    is_ddpg = algo == "DDPG"

    obs, _ = env.reset()
    done = False

    peak_value = env.initial_cash
    cooldown_remaining = 0      # 冷却期剩余步数
    risk_overrides = 0
    stop_count = 0              # 止损触发次数
    vol_blocks = 0              # 波动率拦截次数

    # 收集最近收益率用于计算实时波动率
    recent_values = [env.initial_cash]

    while not done:
        # ---- RL agent 提议动作 ----
        obs_tensor = torch.tensor(obs, dtype=torch.float32, device=dev).unsqueeze(0)

        with torch.no_grad():
            if is_ddpg:
                action = policy(obs_tensor).cpu().numpy().flatten()
            else:
                action_t, _, _ = policy.get_action(obs_tensor, deterministic=True)
                action = action_t.item()

        # ---- 风控层 ----
        info = env._get_info()
        current_value = info["portfolio_value"]
        recent_values.append(current_value)

        if cooldown_remaining > 0:
            # 冷却期内：强制锁仓
            if is_ddpg:
                action = np.array([0.0], dtype=np.float32)
            else:
                # 如果还有持仓，先卖出（止损清仓）
                if info["shares"] > 0:
                    action = 2  # SELL
                else:
                    action = 0  # HOLD
            cooldown_remaining -= 1
            risk_overrides += 1

            # 冷却期结束：重置 peak，允许重新交易
            if cooldown_remaining == 0:
                peak_value = current_value
                logger.debug("冷却期结束，解锁交易")
        else:
            # 正常状态：检查回撤
            peak_value = max(peak_value, current_value)
            drawdown = (peak_value - current_value) / (peak_value + 1e-10)

            if drawdown >= risk_config.max_drawdown:
                # 触发止损
                if is_ddpg:
                    action = np.array([0.0], dtype=np.float32)
                else:
                    if info["shares"] > 0:
                        action = 2  # SELL
                    else:
                        action = 0  # HOLD
                cooldown_remaining = risk_config.cooldown_steps
                stop_count += 1
                risk_overrides += 1
                logger.debug(
                    f"止损触发: drawdown={drawdown:.2%}, 冷却{risk_config.cooldown_steps}步"
                )

            elif vol_threshold is not None and len(recent_values) >= 20:
                # 波动率过滤：计算最近 20 步的实时波动率
                vals = np.array(recent_values[-21:])
                rets = np.diff(vals) / (vals[:-1] + 1e-10)
                current_vol = float(np.std(rets)) * np.sqrt(252)

                if current_vol > vol_threshold:
                    # 波动率过高：禁止开新仓，但不强制卖出
                    if is_ddpg:
                        # 不允许增仓，只允许减仓或持平
                        current_ratio = info["shares"] * env._current_price() / (current_value + 1e-10)
                        action = np.clip(action, 0.0, current_ratio)
                    else:
                        # 禁止 BUY，允许 HOLD 和 SELL
                        if action == 1:
                            action = 0  # BUY → HOLD
                            vol_blocks += 1
                            risk_overrides += 1

        obs, _, terminated, truncated, _ = env.step(action)
        done = terminated or truncated

    metrics = env.get_metrics()
    metrics["risk_overrides"] = risk_overrides
    metrics["stop_count"] = stop_count
    metrics["vol_blocks"] = vol_blocks
    metrics["stopped_out"] = stop_count > 0
    return metrics
