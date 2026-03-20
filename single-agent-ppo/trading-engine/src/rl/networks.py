"""
Actor-Critic 网络
用于 PPO 算法的策略网络（Actor）和价值网络（Critic）。
"""

import torch
import torch.nn as nn
from typing import Tuple

from .features import get_observation_dim


def _build_mlp(input_dim: int, hidden_dim: int, output_dim: int) -> nn.Sequential:
    """构建带 LayerNorm 的三层 MLP。"""
    return nn.Sequential(
        nn.Linear(input_dim, hidden_dim),
        nn.LayerNorm(hidden_dim),
        nn.Tanh(),
        nn.Linear(hidden_dim, hidden_dim),
        nn.LayerNorm(hidden_dim),
        nn.Tanh(),
        nn.Linear(hidden_dim, output_dim),
    )


class ActorCritic(nn.Module):
    """
    共享底层特征、分离头部的 Actor-Critic 网络。

    Actor 输出离散动作的 logits (3 维: HOLD/BUY/SELL)。
    Critic 输出状态价值标量。
    """

    def __init__(self, obs_dim: int = 0, hidden_dim: int = 128, n_actions: int = 3):
        super().__init__()
        if obs_dim == 0:
            obs_dim = get_observation_dim()

        # 共享特征层
        self.shared = nn.Sequential(
            nn.Linear(obs_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.Tanh(),
        )

        # Actor 头
        self.actor_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, n_actions),
        )

        # Critic 头
        self.critic_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.Tanh(),
            nn.Linear(hidden_dim, 1),
        )

        self._init_weights()

    def _init_weights(self) -> None:
        """正交初始化，有助于 PPO 训练稳定性。"""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.orthogonal_(module.weight, gain=0.5)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(self, obs: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        前向传播。

        Args:
            obs: (batch, obs_dim)

        Returns:
            action_logits: (batch, n_actions)
            state_value:   (batch, 1)
        """
        features = self.shared(obs)
        logits = self.actor_head(features)
        value = self.critic_head(features)
        return logits, value

    def get_action(
        self, obs: torch.Tensor, deterministic: bool = False
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        采样动作 + 计算 log_prob 和 value（用于与环境交互）。

        Returns:
            action, log_prob, value
        """
        logits, value = self.forward(obs)
        dist = torch.distributions.Categorical(logits=logits)

        if deterministic:
            action = logits.argmax(dim=-1)
        else:
            action = dist.sample()

        log_prob = dist.log_prob(action)
        return action, log_prob, value.squeeze(-1)

    def evaluate_actions(
        self, obs: torch.Tensor, actions: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        给定 obs 和 actions，重新计算 log_prob、value、entropy（用于 PPO 更新）。

        Returns:
            log_probs, values, entropy
        """
        logits, value = self.forward(obs)
        dist = torch.distributions.Categorical(logits=logits)
        log_probs = dist.log_prob(actions)
        entropy = dist.entropy()
        return log_probs, value.squeeze(-1), entropy
