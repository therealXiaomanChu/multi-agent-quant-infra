"""
A2C (Advantage Actor-Critic) 算法实现
与 PPO 共享 env、features、networks、buffer，仅训练循环不同。

核心区别：
- PPO 用 clipped surrogate loss 限制更新幅度 → 稳健但保守
- A2C 直接用 advantage × log_prob 做策略梯度 → 更新激进，反应更快
"""

import torch
import torch.nn as nn
import numpy as np
import json
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict

from .networks import ActorCritic
from .buffer import RolloutBuffer
from .env import TradingEnv
from .features import get_observation_dim

logger = logging.getLogger(__name__)


@dataclass
class A2CConfig:
    """A2C 超参数配置。"""
    lr: float = 7e-4
    gamma: float = 0.99
    gae_lambda: float = 0.95
    entropy_coef: float = 0.01
    value_coef: float = 0.5
    max_grad_norm: float = 0.5
    rollout_steps: int = 256      # A2C 通常用更短的 rollout
    hidden_dim: int = 128
    device: str = "cpu"

    def save(self, path: str) -> None:
        with open(path, "w") as f:
            json.dump(asdict(self), f, indent=2)

    @classmethod
    def load(cls, path: str) -> "A2CConfig":
        with open(path) as f:
            return cls(**json.load(f))


class A2CTrainer:
    """
    A2C 训练器。

    与 PPO 的关键区别：
    - 不存储 old_log_probs，不计算 ratio
    - 每个 rollout 只做一次梯度更新（不做多轮 mini-batch epoch）
    - 更新更激进，适合快速变化的市场环境
    """

    def __init__(self, env: TradingEnv, config: Optional[A2CConfig] = None):
        self.env = env
        self.config = config or A2CConfig()
        self.device = torch.device(self.config.device)

        obs_dim = get_observation_dim()
        self.policy = ActorCritic(
            obs_dim=obs_dim,
            hidden_dim=self.config.hidden_dim,
        ).to(self.device)

        self.optimizer = torch.optim.RMSprop(
            self.policy.parameters(), lr=self.config.lr, alpha=0.99, eps=1e-5
        )

        self.buffer = RolloutBuffer(
            capacity=self.config.rollout_steps,
            obs_dim=obs_dim,
            gamma=self.config.gamma,
            gae_lambda=self.config.gae_lambda,
            device=self.config.device,
        )

        # 训练统计
        self.total_timesteps = 0
        self.episode_count = 0
        self.best_reward = -np.inf
        self.training_log: list[dict] = []

    def train(self, total_timesteps: int) -> list[dict]:
        """
        训练入口。

        Args:
            total_timesteps: 总训练步数

        Returns:
            训练日志列表
        """
        obs, _ = self.env.reset()
        episode_reward = 0.0

        while self.total_timesteps < total_timesteps:
            # ---- 1) 收集 rollout ----
            self.buffer.reset()

            for _ in range(self.config.rollout_steps):
                obs_tensor = torch.tensor(
                    obs, dtype=torch.float32, device=self.device
                ).unsqueeze(0)

                with torch.no_grad():
                    action, log_prob, value = self.policy.get_action(obs_tensor)

                action_int = action.item()
                value_val = value.item()

                next_obs, reward, terminated, truncated, info = self.env.step(action_int)
                done = terminated or truncated

                self.buffer.add(
                    obs, action_int, reward, value_val, log_prob.item(), done
                )
                episode_reward += reward
                self.total_timesteps += 1

                if done:
                    self.episode_count += 1
                    metrics = self.env.get_metrics()
                    log_entry = {
                        "episode": self.episode_count,
                        "timestep": self.total_timesteps,
                        "episode_reward": round(episode_reward, 4),
                        **metrics,
                    }
                    self.training_log.append(log_entry)

                    if episode_reward > self.best_reward:
                        self.best_reward = episode_reward

                    logger.info(
                        f"Episode {self.episode_count:4d} | "
                        f"Reward: {episode_reward:+.4f} | "
                        f"Return: {metrics['total_return']:+.2%} | "
                        f"Sharpe: {metrics['sharpe_ratio']:.2f} | "
                        f"Trades: {metrics['trade_count']}"
                    )

                    obs, _ = self.env.reset()
                    episode_reward = 0.0
                else:
                    obs = next_obs

                if self.total_timesteps >= total_timesteps:
                    break

            # ---- 2) 计算 GAE ----
            with torch.no_grad():
                last_obs = torch.tensor(
                    obs, dtype=torch.float32, device=self.device
                ).unsqueeze(0)
                _, last_value = self.policy(last_obs)
                last_value = last_value.item()

            self.buffer.compute_gae(last_value)

            # ---- 3) A2C 单次全量更新 ----
            update_stats = self._update()
            logger.debug(f"A2C Update | {update_stats}")

        return self.training_log

    def _update(self) -> dict:
        """
        A2C 核心更新：单次全量梯度更新，不做多轮 epoch。

        Loss = policy_loss + value_coef * value_loss - entropy_coef * entropy
        其中 policy_loss = -(advantage * log_prob).mean()
        """
        n = self.buffer.ptr

        # 取出 buffer 中的全部数据
        obs = torch.tensor(self.buffer.observations[:n], device=self.device)
        actions = torch.tensor(self.buffer.actions[:n], device=self.device)

        # advantage 标准化
        adv = self.buffer.advantages[:n].copy()
        adv = (adv - adv.mean()) / (adv.std() + 1e-8)
        advantages = torch.tensor(adv, device=self.device)

        returns = torch.tensor(self.buffer.returns[:n], device=self.device)

        # 前向传播：重新计算当前策略下的 log_prob、value、entropy
        log_probs, values, entropy = self.policy.evaluate_actions(obs, actions)

        # ---- Policy Loss: 直接策略梯度 ----
        policy_loss = -(advantages * log_probs).mean()

        # ---- Value Loss ----
        value_loss = nn.functional.mse_loss(values, returns)

        # ---- Total Loss ----
        loss = (
            policy_loss
            + self.config.value_coef * value_loss
            - self.config.entropy_coef * entropy.mean()
        )

        self.optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(
            self.policy.parameters(), self.config.max_grad_norm
        )
        self.optimizer.step()

        return {
            "policy_loss": round(policy_loss.item(), 4),
            "value_loss": round(value_loss.item(), 4),
            "entropy": round(entropy.mean().item(), 4),
        }

    # ------------------------------------------------------------------
    # 保存 / 加载
    # ------------------------------------------------------------------

    def save(self, dirpath: str) -> None:
        """保存模型权重和配置。"""
        path = Path(dirpath)
        path.mkdir(parents=True, exist_ok=True)

        torch.save(self.policy.state_dict(), path / "policy.pt")
        self.config.save(str(path / "config.json"))

        with open(path / "training_log.json", "w") as f:
            json.dump(self.training_log, f, indent=2)

        logger.info(f"模型已保存至 {path}")

    def load(self, dirpath: str) -> None:
        """加载模型权重。"""
        path = Path(dirpath)
        state_dict = torch.load(
            path / "policy.pt", map_location=self.device, weights_only=True
        )
        self.policy.load_state_dict(state_dict)
        logger.info(f"模型已加载自 {path}")
