"""
rl 模块 — 强化学习交易核心

算法:
  - PPO (on-policy, 离散动作)
  - A2C (on-policy, 离散动作)
  - DDPG (off-policy, 连续动作)

共享组件:
  - TradingEnv: 交易环境 (支持离散/连续动作空间)
  - ActorCritic: PPO/A2C 共享网络
  - RolloutBuffer: on-policy 轨迹缓冲区
  - ReplayBuffer: off-policy 经验回放缓冲区
"""

from .env import TradingEnv
from .networks import ActorCritic
from .ppo import PPOTrainer, PPOConfig, evaluate
from .a2c import A2CTrainer, A2CConfig
from .ddpg import DDPGTrainer, DDPGConfig, DDPGActor, DDPGCritic, evaluate_ddpg
from .ensemble import run_ensemble_walk_forward, print_ensemble_report
from .risk_manager import RiskConfig, evaluate_with_risk
from .features import compute_features, get_observation_dim, get_feature_names
from .buffer import RolloutBuffer
from .replay_buffer import ReplayBuffer

__all__ = [
    "TradingEnv",
    # PPO / A2C (on-policy, discrete)
    "ActorCritic",
    "PPOTrainer",
    "PPOConfig",
    "A2CTrainer",
    "A2CConfig",
    "evaluate",
    "RolloutBuffer",
    # DDPG (off-policy, continuous)
    "DDPGTrainer",
    "DDPGConfig",
    "DDPGActor",
    "DDPGCritic",
    "evaluate_ddpg",
    "ReplayBuffer",
    # Features
    "compute_features",
    "get_observation_dim",
    "get_feature_names",
]
