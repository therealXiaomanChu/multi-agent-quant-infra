"""
Rollout Buffer
存储 on-policy 轨迹数据，并计算 GAE (Generalized Advantage Estimation)。
"""

import torch
import numpy as np
from typing import Generator, NamedTuple


class RolloutBatch(NamedTuple):
    """PPO 更新所需的一个 mini-batch。"""
    observations: torch.Tensor
    actions: torch.Tensor
    old_log_probs: torch.Tensor
    advantages: torch.Tensor
    returns: torch.Tensor


class RolloutBuffer:
    """
    固定容量的 Rollout Buffer，支持 GAE 计算和 mini-batch 迭代。

    Args:
        capacity: buffer 容量（一个 rollout 的总步数）
        obs_dim: 观测维度
        gamma: 折扣因子
        gae_lambda: GAE λ 参数
        device: torch 设备
    """

    def __init__(
        self,
        capacity: int,
        obs_dim: int,
        gamma: float = 0.99,
        gae_lambda: float = 0.95,
        device: str = "cpu",
    ):
        self.capacity = capacity
        self.gamma = gamma
        self.gae_lambda = gae_lambda
        self.device = torch.device(device)

        # 预分配存储
        self.observations = np.zeros((capacity, obs_dim), dtype=np.float32)
        self.actions = np.zeros(capacity, dtype=np.int64)
        self.rewards = np.zeros(capacity, dtype=np.float32)
        self.values = np.zeros(capacity, dtype=np.float32)
        self.log_probs = np.zeros(capacity, dtype=np.float32)
        self.dones = np.zeros(capacity, dtype=np.float32)

        # GAE 计算结果
        self.advantages = np.zeros(capacity, dtype=np.float32)
        self.returns = np.zeros(capacity, dtype=np.float32)

        self.ptr = 0
        self.full = False

    def add(
        self,
        obs: np.ndarray,
        action: int,
        reward: float,
        value: float,
        log_prob: float,
        done: bool,
    ) -> None:
        """添加一步转移数据。"""
        self.observations[self.ptr] = obs
        self.actions[self.ptr] = action
        self.rewards[self.ptr] = reward
        self.values[self.ptr] = value
        self.log_probs[self.ptr] = log_prob
        self.dones[self.ptr] = float(done)
        self.ptr += 1
        if self.ptr >= self.capacity:
            self.full = True

    def compute_gae(self, last_value: float) -> None:
        """
        计算 GAE 和 returns。

        Args:
            last_value: 最后一步之后的 V(s') 估计
        """
        n = self.ptr
        last_gae = 0.0

        for t in reversed(range(n)):
            if t == n - 1:
                next_value = last_value
                next_non_terminal = 1.0 - self.dones[t]
            else:
                next_value = self.values[t + 1]
                next_non_terminal = 1.0 - self.dones[t]

            delta = self.rewards[t] + self.gamma * next_value * next_non_terminal - self.values[t]
            last_gae = delta + self.gamma * self.gae_lambda * next_non_terminal * last_gae
            self.advantages[t] = last_gae

        self.returns[:n] = self.advantages[:n] + self.values[:n]

    def get_batches(
        self, batch_size: int
    ) -> Generator[RolloutBatch, None, None]:
        """
        随机打乱后按 mini-batch 迭代。

        Yields:
            RolloutBatch
        """
        n = self.ptr
        indices = np.random.permutation(n)

        # Advantage 标准化
        adv = self.advantages[:n]
        adv = (adv - adv.mean()) / (adv.std() + 1e-8)

        for start in range(0, n, batch_size):
            end = min(start + batch_size, n)
            batch_idx = indices[start:end]

            yield RolloutBatch(
                observations=torch.tensor(
                    self.observations[batch_idx], device=self.device
                ),
                actions=torch.tensor(
                    self.actions[batch_idx], device=self.device
                ),
                old_log_probs=torch.tensor(
                    self.log_probs[batch_idx], device=self.device
                ),
                advantages=torch.tensor(
                    adv[batch_idx], device=self.device
                ),
                returns=torch.tensor(
                    self.returns[batch_idx], device=self.device
                ),
            )

    def reset(self) -> None:
        """清空 buffer，准备下一个 rollout。"""
        self.ptr = 0
        self.full = False
