"""
Replay Buffer — off-policy 经验回放缓冲区，用于 DDPG。
与 on-policy 的 RolloutBuffer 不同：
  - 存储历史经验，不按 episode 清空
  - 随机采样 mini-batch（打破时间相关性）
  - 不计算 GAE（DDPG 用 TD target）
"""

import numpy as np
import torch
from typing import NamedTuple


class ReplayBatch(NamedTuple):
    """DDPG 更新所需的一个 mini-batch。"""
    observations: torch.Tensor
    actions: torch.Tensor
    rewards: torch.Tensor
    next_observations: torch.Tensor
    dones: torch.Tensor


class ReplayBuffer:
    """
    固定容量的环形 Replay Buffer。

    Args:
        capacity: 最大存储量
        obs_dim: 观测维度
        action_dim: 动作维度（DDPG 为 1）
        device: torch 设备
    """

    def __init__(
        self,
        capacity: int,
        obs_dim: int,
        action_dim: int = 1,
        device: str = "cpu",
    ):
        self.capacity = capacity
        self.device = torch.device(device)

        self.observations = np.zeros((capacity, obs_dim), dtype=np.float32)
        self.actions = np.zeros((capacity, action_dim), dtype=np.float32)
        self.rewards = np.zeros(capacity, dtype=np.float32)
        self.next_observations = np.zeros((capacity, obs_dim), dtype=np.float32)
        self.dones = np.zeros(capacity, dtype=np.float32)

        self.ptr = 0
        self.size = 0

    def add(
        self,
        obs: np.ndarray,
        action: float,
        reward: float,
        next_obs: np.ndarray,
        done: bool,
    ) -> None:
        """添加一条经验。"""
        self.observations[self.ptr] = obs
        self.actions[self.ptr] = action
        self.rewards[self.ptr] = reward
        self.next_observations[self.ptr] = next_obs
        self.dones[self.ptr] = float(done)

        self.ptr = (self.ptr + 1) % self.capacity
        self.size = min(self.size + 1, self.capacity)

    def sample(self, batch_size: int) -> ReplayBatch:
        """随机采样一个 mini-batch。"""
        indices = np.random.randint(0, self.size, size=batch_size)

        return ReplayBatch(
            observations=torch.tensor(
                self.observations[indices], device=self.device
            ),
            actions=torch.tensor(
                self.actions[indices], device=self.device
            ),
            rewards=torch.tensor(
                self.rewards[indices], device=self.device
            ),
            next_observations=torch.tensor(
                self.next_observations[indices], device=self.device
            ),
            dones=torch.tensor(
                self.dones[indices], device=self.device
            ),
        )

    def __len__(self) -> int:
        return self.size
