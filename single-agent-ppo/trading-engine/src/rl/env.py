"""
量化交易 Gym 环境 (v2)
核心改动：reward = 每步组合收益率，让 agent 感知"踏空成本"。

Action Space:
    0 = HOLD, 1 = BUY, 2 = SELL

Observation Space:
    技术因子向量 + 当前持仓状态 (0/1)
"""

import gymnasium as gym
import numpy as np
import pandas as pd
from gymnasium import spaces
from typing import Optional, Tuple

from .features import compute_features, get_observation_dim


class TradingEnv(gym.Env):
    """
    单资产日频交易环境。

    Reward 设计:
        每一步 reward = (当前组合价值 - 上一步组合价值) / 上一步组合价值
        即组合的逐日收益率。这样:
        - 持仓 + 市场涨 → 正 reward
        - 持仓 + 市场跌 → 负 reward
        - 空仓 + 市场涨 → reward ≈ 0（而基线在赚钱，相对落后）
        - 空仓 + 市场跌 → reward ≈ 0（规避了损失）
        交易成本自然体现在组合价值变化中。
    """

    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        df: pd.DataFrame,
        initial_cash: float = 100_000.0,
        commission: float = 0.001,
        max_shares: int = 100,
        window: int = 20,
    ):
        super().__init__()

        self.features_df = compute_features(df, window=window)
        self.price_df = df.loc[self.features_df.index].copy()

        self.initial_cash = initial_cash
        self.commission = commission
        self.max_shares = max_shares
        self.n_steps = len(self.features_df)

        self.action_space = spaces.Discrete(3)
        obs_dim = get_observation_dim()
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(obs_dim,), dtype=np.float32
        )

        # 内部状态
        self._current_step: int = 0
        self._cash: float = initial_cash
        self._shares: int = 0
        self._total_reward: float = 0.0
        self._trade_count: int = 0
        self._prev_portfolio_value: float = initial_cash
        self._portfolio_values: list[float] = []

    def reset(
        self, *, seed: Optional[int] = None, options: Optional[dict] = None
    ) -> Tuple[np.ndarray, dict]:
        super().reset(seed=seed)
        self._current_step = 0
        self._cash = self.initial_cash
        self._shares = 0
        self._total_reward = 0.0
        self._trade_count = 0
        self._prev_portfolio_value = self.initial_cash
        self._portfolio_values = [self.initial_cash]
        return self._get_obs(), self._get_info()

    def step(self, action: int) -> Tuple[np.ndarray, float, bool, bool, dict]:
        assert self.action_space.contains(action)

        price = self._current_price()

        # ---- 执行动作 ----
        if action == 1 and self._shares == 0:  # BUY
            # 买入尽可能多的股数（但不超过 max_shares）
            affordable = int(self._cash / (price * (1 + self.commission)))
            n_buy = min(affordable, self.max_shares)
            if n_buy > 0:
                cost = n_buy * price * (1 + self.commission)
                self._cash -= cost
                self._shares = n_buy
                self._trade_count += 1

        elif action == 2 and self._shares > 0:  # SELL
            revenue = self._shares * price * (1 - self.commission)
            self._cash += revenue
            self._shares = 0
            self._trade_count += 1

        # ---- 计算 reward = 组合逐步收益率 ----
        current_value = self._portfolio_value()
        reward = (current_value - self._prev_portfolio_value) / (self._prev_portfolio_value + 1e-10)
        self._prev_portfolio_value = current_value

        # ---- 推进时间步 ----
        self._current_step += 1
        self._total_reward += reward
        self._portfolio_values.append(current_value)

        terminated = self._current_step >= self.n_steps - 1
        truncated = False

        # 到期强制平仓
        if terminated and self._shares > 0:
            price = self._current_price()
            revenue = self._shares * price * (1 - self.commission)
            self._cash += revenue
            self._shares = 0
            # 重新计算最终 portfolio value
            final_value = self._cash
            reward += (final_value - current_value) / (current_value + 1e-10)
            self._portfolio_values[-1] = final_value

        return self._get_obs(), reward, terminated, truncated, self._get_info()

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------

    def _get_obs(self) -> np.ndarray:
        idx = min(self._current_step, self.n_steps - 1)
        features = self.features_df.iloc[idx].values.astype(np.float32)
        position_flag = np.array([1.0 if self._shares > 0 else 0.0], dtype=np.float32)
        obs = np.concatenate([features, position_flag])
        return np.nan_to_num(obs, nan=0.0)

    def _current_price(self) -> float:
        idx = min(self._current_step, self.n_steps - 1)
        return float(self.price_df.iloc[idx]["close"])

    def _portfolio_value(self) -> float:
        return self._cash + self._shares * self._current_price()

    def _get_info(self) -> dict:
        return {
            "step": self._current_step,
            "cash": self._cash,
            "shares": self._shares,
            "portfolio_value": self._portfolio_value(),
            "total_reward": self._total_reward,
            "trade_count": self._trade_count,
        }

    def get_metrics(self) -> dict:
        values = np.array(self._portfolio_values)
        returns = np.diff(values) / (values[:-1] + 1e-10)

        total_return = (values[-1] / values[0]) - 1.0
        volatility = float(np.std(returns)) * np.sqrt(252) if len(returns) > 1 else 0.0
        sharpe = (float(np.mean(returns)) / (float(np.std(returns)) + 1e-10)) * np.sqrt(252) if len(returns) > 1 else 0.0

        peak = np.maximum.accumulate(values)
        drawdown = (peak - values) / (peak + 1e-10)
        max_drawdown = float(np.max(drawdown))

        return {
            "total_return": round(total_return, 4),
            "sharpe_ratio": round(sharpe, 4),
            "max_drawdown": round(max_drawdown, 4),
            "volatility": round(volatility, 4),
            "trade_count": self._trade_count,
            "final_value": round(values[-1], 2),
        }
