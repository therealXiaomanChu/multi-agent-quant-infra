"""
DDPG (Deep Deterministic Policy Gradient) 算法实现

与 PPO/A2C 的核心区别：
- Off-policy：使用 Replay Buffer 存储历史经验，随机采样更新
- 连续动作空间：输出目标仓位比例 [0, 1]，而非离散 HOLD/BUY/SELL
- 四个网络：Actor, Critic, Target Actor, Target Critic
- Target 网络通过 polyak averaging 软更新，稳定训练
- 探索：通过 Ornstein-Uhlenbeck 噪声实现
"""

import torch
import torch.nn as nn
import numpy as np
import json
import copy
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict

from .env import TradingEnv
from .features import get_observation_dim
from .replay_buffer import ReplayBuffer

logger = logging.getLogger(__name__)


# ======================================================================
# 网络
# ======================================================================

class DDPGActor(nn.Module):
    """
    DDPG Actor 网络。
    输入: 观测向量
    输出: 连续动作 [0, 1]（目标仓位比例）
    """

    def __init__(self, obs_dim: int, hidden_dim: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
            nn.Sigmoid(),  # 输出 [0, 1]
        )
        self._init_weights()

    def _init_weights(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.orthogonal_(module.weight, gain=0.5)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(self, obs: torch.Tensor) -> torch.Tensor:
        return self.net(obs)


class DDPGCritic(nn.Module):
    """
    DDPG Critic 网络。
    输入: 观测向量 + 动作
    输出: Q 值标量
    """

    def __init__(self, obs_dim: int, action_dim: int = 1, hidden_dim: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(obs_dim + action_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )
        self._init_weights()

    def _init_weights(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.orthogonal_(module.weight, gain=0.5)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)

    def forward(self, obs: torch.Tensor, action: torch.Tensor) -> torch.Tensor:
        x = torch.cat([obs, action], dim=-1)
        return self.net(x)


# ======================================================================
# OU 噪声
# ======================================================================

class OUNoise:
    """Ornstein-Uhlenbeck 过程，用于连续动作空间的探索。"""

    def __init__(
        self, size: int = 1, mu: float = 0.0,
        theta: float = 0.15, sigma: float = 0.2,
    ):
        self.mu = mu
        self.theta = theta
        self.sigma = sigma
        self.state = np.full(size, mu, dtype=np.float32)

    def reset(self) -> None:
        self.state = np.full_like(self.state, self.mu)

    def sample(self) -> np.ndarray:
        dx = self.theta * (self.mu - self.state) + self.sigma * np.random.randn(*self.state.shape)
        self.state = self.state + dx
        return self.state.copy()


# ======================================================================
# 配置
# ======================================================================

@dataclass
class DDPGConfig:
    """DDPG 超参数配置。"""
    actor_lr: float = 1e-4
    critic_lr: float = 1e-3
    gamma: float = 0.99
    tau: float = 0.005          # target 网络软更新系数
    batch_size: int = 128
    buffer_size: int = 100_000
    warmup_steps: int = 1000    # 开始训练前的随机探索步数
    update_every: int = 1       # 每隔多少步更新一次网络
    noise_sigma: float = 0.2    # OU 噪声强度
    noise_decay: float = 0.999  # 噪声衰减
    hidden_dim: int = 128
    device: str = "cpu"

    def save(self, path: str) -> None:
        with open(path, "w") as f:
            json.dump(asdict(self), f, indent=2)

    @classmethod
    def load(cls, path: str) -> "DDPGConfig":
        with open(path) as f:
            return cls(**json.load(f))


# ======================================================================
# 训练器
# ======================================================================

class DDPGTrainer:
    """
    DDPG 训练器。

    训练循环：
    1. Actor 选动作 + OU 噪声探索
    2. 存入 Replay Buffer
    3. 从 Buffer 随机采样 mini-batch
    4. Critic 更新：最小化 TD error
    5. Actor 更新：最大化 Critic 给出的 Q 值
    6. Target 网络软更新（polyak averaging）
    """

    def __init__(self, env: TradingEnv, config: Optional[DDPGConfig] = None):
        self.env = env
        self.config = config or DDPGConfig()
        self.device = torch.device(self.config.device)

        obs_dim = get_observation_dim()

        # 主网络
        self.actor = DDPGActor(obs_dim, self.config.hidden_dim).to(self.device)
        self.critic = DDPGCritic(obs_dim, 1, self.config.hidden_dim).to(self.device)

        # Target 网络（主网络的延迟副本）
        self.target_actor = copy.deepcopy(self.actor)
        self.target_critic = copy.deepcopy(self.critic)

        # 冻结 target 网络的梯度
        for p in self.target_actor.parameters():
            p.requires_grad = False
        for p in self.target_critic.parameters():
            p.requires_grad = False

        self.actor_optimizer = torch.optim.Adam(
            self.actor.parameters(), lr=self.config.actor_lr
        )
        self.critic_optimizer = torch.optim.Adam(
            self.critic.parameters(), lr=self.config.critic_lr
        )

        self.buffer = ReplayBuffer(
            capacity=self.config.buffer_size,
            obs_dim=obs_dim,
            action_dim=1,
            device=self.config.device,
        )

        self.noise = OUNoise(size=1, sigma=self.config.noise_sigma)

        # 训练统计
        self.total_timesteps = 0
        self.episode_count = 0
        self.best_reward = -np.inf
        self.training_log: list[dict] = []

    def train(self, total_timesteps: int) -> list[dict]:
        """训练入口。"""
        obs, _ = self.env.reset()
        episode_reward = 0.0
        self.noise.reset()
        current_sigma = self.config.noise_sigma

        while self.total_timesteps < total_timesteps:
            # ---- 选择动作 ----
            if self.total_timesteps < self.config.warmup_steps:
                # warmup 阶段：随机动作
                action = np.random.uniform(0.0, 1.0, size=(1,)).astype(np.float32)
            else:
                action = self._select_action(obs, noise=True)

            # ---- 与环境交互 ----
            next_obs, reward, terminated, truncated, info = self.env.step(action)
            done = terminated or truncated

            self.buffer.add(obs, float(action), reward, next_obs, done)
            episode_reward += reward
            self.total_timesteps += 1

            # ---- 更新网络 ----
            if (self.total_timesteps >= self.config.warmup_steps
                    and len(self.buffer) >= self.config.batch_size
                    and self.total_timesteps % self.config.update_every == 0):
                update_stats = self._update()

            # ---- Episode 结束 ----
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
                self.noise.reset()

                # 噪声衰减
                current_sigma *= self.config.noise_decay
                self.noise.sigma = current_sigma
            else:
                obs = next_obs

        return self.training_log

    def _select_action(self, obs: np.ndarray, noise: bool = True) -> np.ndarray:
        """用 Actor 网络选择动作，可选加入 OU 噪声。"""
        obs_tensor = torch.tensor(
            obs, dtype=torch.float32, device=self.device
        ).unsqueeze(0)

        with torch.no_grad():
            action = self.actor(obs_tensor).cpu().numpy().flatten()

        if noise:
            action = action + self.noise.sample()

        return np.clip(action, 0.0, 1.0).astype(np.float32)

    def _update(self) -> dict:
        """执行一次 DDPG 更新。"""
        batch = self.buffer.sample(self.config.batch_size)

        # ---- Critic 更新 ----
        with torch.no_grad():
            target_actions = self.target_actor(batch.next_observations)
            target_q = self.target_critic(batch.next_observations, target_actions).squeeze(-1)
            td_target = batch.rewards + self.config.gamma * (1.0 - batch.dones) * target_q

        current_q = self.critic(batch.observations, batch.actions).squeeze(-1)
        critic_loss = nn.functional.mse_loss(current_q, td_target)

        self.critic_optimizer.zero_grad()
        critic_loss.backward()
        nn.utils.clip_grad_norm_(self.critic.parameters(), 1.0)
        self.critic_optimizer.step()

        # ---- Actor 更新 ----
        predicted_actions = self.actor(batch.observations)
        actor_loss = -self.critic(batch.observations, predicted_actions).mean()

        self.actor_optimizer.zero_grad()
        actor_loss.backward()
        nn.utils.clip_grad_norm_(self.actor.parameters(), 1.0)
        self.actor_optimizer.step()

        # ---- Target 网络软更新 ----
        self._soft_update(self.actor, self.target_actor)
        self._soft_update(self.critic, self.target_critic)

        return {
            "critic_loss": round(critic_loss.item(), 4),
            "actor_loss": round(actor_loss.item(), 4),
        }

    def _soft_update(self, source: nn.Module, target: nn.Module) -> None:
        """Polyak averaging: target = tau * source + (1 - tau) * target。"""
        tau = self.config.tau
        for sp, tp in zip(source.parameters(), target.parameters()):
            tp.data.copy_(tau * sp.data + (1.0 - tau) * tp.data)

    # ------------------------------------------------------------------
    # 保存 / 加载
    # ------------------------------------------------------------------

    def save(self, dirpath: str) -> None:
        """保存模型权重和配置。"""
        path = Path(dirpath)
        path.mkdir(parents=True, exist_ok=True)

        torch.save({
            "actor": self.actor.state_dict(),
            "critic": self.critic.state_dict(),
            "target_actor": self.target_actor.state_dict(),
            "target_critic": self.target_critic.state_dict(),
        }, path / "policy.pt")
        self.config.save(str(path / "config.json"))

        with open(path / "training_log.json", "w") as f:
            json.dump(self.training_log, f, indent=2)

        logger.info(f"模型已保存至 {path}")

    def load(self, dirpath: str) -> None:
        """加载模型权重。"""
        path = Path(dirpath)
        checkpoint = torch.load(
            path / "policy.pt", map_location=self.device, weights_only=True
        )
        self.actor.load_state_dict(checkpoint["actor"])
        self.critic.load_state_dict(checkpoint["critic"])
        self.target_actor.load_state_dict(checkpoint["target_actor"])
        self.target_critic.load_state_dict(checkpoint["target_critic"])
        logger.info(f"模型已加载自 {path}")


# ======================================================================
# 评估
# ======================================================================

def evaluate_ddpg(
    actor: DDPGActor,
    env: TradingEnv,
    n_episodes: int = 1,
    device: str = "cpu",
) -> list[dict]:
    """
    评估 DDPG Actor 在环境上的表现（无噪声，确定性推理）。
    """
    results = []
    dev = torch.device(device)

    for _ in range(n_episodes):
        obs, _ = env.reset()
        done = False

        while not done:
            obs_tensor = torch.tensor(
                obs, dtype=torch.float32, device=dev
            ).unsqueeze(0)
            with torch.no_grad():
                action = actor(obs_tensor).cpu().numpy().flatten()
            obs, _, terminated, truncated, _ = env.step(action)
            done = terminated or truncated

        results.append(env.get_metrics())

    return results
