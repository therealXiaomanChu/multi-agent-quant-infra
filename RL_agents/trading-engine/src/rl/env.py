"""
量化交易 Gym 环境 (v3)

支持两种动作空间：
  - "discrete": HOLD/BUY/SELL (用于 PPO, A2C)
  - "continuous": 目标仓位比例 [0, 1] (用于 DDPG)

Reward 设计支持三种模式：
  - "delta": FinRL 风格, (V(t)-V(t-1)) * scaling (默认, 推荐)
  - "absolute": 归一化收益率 (V(t)-V(t-1))/V(t-1) (旧版)
  - "relative": 收益率 - 基准收益率 (实验性)

Observation Space:
    技术因子向量 + 当前持仓比例 (连续值 0~1)
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

    Reward 模式:
      "delta" (v4, FinRL 风格, 默认):
        reward = (V(t) - V(t-1)) * reward_scaling
        不归一化 → 持仓越多、涨幅越大，reward 绝对值越大 → 激励重仓
        Yang et al. (ICAIF 2020) 和 FinRL 框架使用此设计

      "absolute" (v2, 旧版):
        reward = (V(t) - V(t-1)) / V(t-1)
        归一化 → 消除仓位规模信号 → 导致"躺平"

      "relative" (v3, 实验性):
        reward = portfolio_return - benchmark_return
        牛市 reward 永久为负 → 信号嘈杂
    """

    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        df: pd.DataFrame,
        initial_cash: float = 100_000.0,
        commission: float = 0.001,
        max_shares: int = 100,
        window: int = 20,
        reward_mode: str = "delta",
        reward_scaling: float = 1e-4,
        action_type: str = "discrete",
    ):
        super().__init__()

        self.features_df = compute_features(df, window=window)
        self.price_df = df.loc[self.features_df.index].copy()

        self.initial_cash = initial_cash
        self.commission = commission
        self.max_shares = max_shares
        self.reward_mode = reward_mode
        self.reward_scaling = reward_scaling
        self.action_type = action_type
        self.n_steps = len(self.features_df)

        if action_type == "continuous":
            # DDPG: 输出目标仓位比例 [0, 1]
            self.action_space = spaces.Box(
                low=0.0, high=1.0, shape=(1,), dtype=np.float32
            )
        else:
            # PPO/A2C: 离散动作 HOLD/BUY/SELL
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
        self._prev_price = float(self.price_df.iloc[0]["close"])
        self._portfolio_values = [self.initial_cash]
        return self._get_obs(), self._get_info()

    def step(self, action) -> Tuple[np.ndarray, float, bool, bool, dict]:
        price = self._current_price()
        prev_shares = self._shares

        if self.action_type == "continuous":
            self._execute_continuous(action, price)
        else:
            self._execute_discrete(action, price)

        traded = (self._shares != prev_shares)

        # ---- 计算 reward ----
        current_value = self._portfolio_value()

        if self.reward_mode == "delta":
            # v4 (FinRL 风格): 原始差值，不归一化
            # 持仓越多、涨幅越大 → reward 绝对值越大 → 激励重仓
            reward = (current_value - self._prev_portfolio_value) * self.reward_scaling
        elif self.reward_mode == "relative":
            portfolio_return = (current_value - self._prev_portfolio_value) / (self._prev_portfolio_value + 1e-10)
            prev_price = self._prev_price if hasattr(self, '_prev_price') else price
            benchmark_return = (price - prev_price) / (prev_price + 1e-10)
            reward = portfolio_return - benchmark_return
        else:
            # absolute: 归一化收益率（旧版 v2）
            reward = (current_value - self._prev_portfolio_value) / (self._prev_portfolio_value + 1e-10)

        self._prev_portfolio_value = current_value
        self._prev_price = price

        # ---- 推进时间步 ----
        self._current_step += 1
        self._total_reward += reward
        self._portfolio_values.append(current_value)

        terminated = self._current_step >= self.n_steps - 1
        truncated = False

        # 到期强制平仓
        if terminated and self._shares > 0:
            price_now = self._current_price()
            revenue = self._shares * price_now * (1 - self.commission)
            self._cash += revenue
            self._shares = 0
            final_value = self._cash
            if self.reward_mode == "delta":
                reward += (final_value - current_value) * self.reward_scaling
            elif self.reward_mode == "relative":
                liquidation_return = (final_value - current_value) / (current_value + 1e-10)
                benchmark_final = (price_now - price) / (price + 1e-10)
                reward += liquidation_return - benchmark_final
            else:
                reward += (final_value - current_value) / (current_value + 1e-10)
            self._portfolio_values[-1] = final_value

        return self._get_obs(), reward, terminated, truncated, self._get_info()

    # ------------------------------------------------------------------
    # 动作执行
    # ------------------------------------------------------------------

    def _execute_discrete(self, action: int, price: float) -> None:
        """离散动作：HOLD(0) / BUY(1) / SELL(2)。"""
        if action == 1 and self._shares == 0:  # BUY
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

    def _execute_continuous(self, action, price: float) -> None:
        """
        连续动作：目标仓位比例 [0, 1]。
        action=0.0 表示全部现金，action=1.0 表示满仓。
        环境自动计算需要买入/卖出多少股来达到目标仓位。
        """
        target_ratio = float(np.clip(action, 0.0, 1.0))
        portfolio_value = self._portfolio_value()

        target_stock_value = portfolio_value * target_ratio
        target_shares = int(target_stock_value / (price + 1e-10))
        target_shares = min(target_shares, self.max_shares)

        delta = target_shares - self._shares

        if delta > 0:  # 需要买入
            affordable = int(self._cash / (price * (1 + self.commission)))
            n_buy = min(delta, affordable)
            if n_buy > 0:
                cost = n_buy * price * (1 + self.commission)
                self._cash -= cost
                self._shares += n_buy
                self._trade_count += 1
        elif delta < 0:  # 需要卖出
            n_sell = min(-delta, self._shares)
            if n_sell > 0:
                revenue = n_sell * price * (1 - self.commission)
                self._cash += revenue
                self._shares -= n_sell
                self._trade_count += 1

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------

    def _get_obs(self) -> np.ndarray:
        idx = min(self._current_step, self.n_steps - 1)
        features = self.features_df.iloc[idx].values.astype(np.float32)
        # 持仓比例：股票市值 / 组合总值
        pv = self._portfolio_value()
        stock_value = self._shares * self._current_price()
        position_ratio = np.array(
            [stock_value / (pv + 1e-10)], dtype=np.float32
        )
        obs = np.concatenate([features, position_ratio])
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
