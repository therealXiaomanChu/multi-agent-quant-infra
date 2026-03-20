"""
RL 模块单元测试
"""

import sys
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

import pytest
import numpy as np
import pandas as pd
import torch

from src.rl.features import compute_features, get_feature_names, get_observation_dim
from src.rl.env import TradingEnv
from src.rl.networks import ActorCritic
from src.rl.buffer import RolloutBuffer
from src.rl.ppo import PPOTrainer, PPOConfig, evaluate


@pytest.fixture
def sample_ohlcv() -> pd.DataFrame:
    np.random.seed(42)
    n = 200
    dates = pd.date_range("2023-01-01", periods=n, freq="B")
    close = 100.0 + np.cumsum(np.random.randn(n) * 0.5)
    close = np.maximum(close, 10.0)
    df = pd.DataFrame({
        "open": close + np.random.randn(n) * 0.2,
        "high": close + np.abs(np.random.randn(n) * 0.5),
        "low": close - np.abs(np.random.randn(n) * 0.5),
        "close": close,
        "volume": np.random.randint(1_000_000, 10_000_000, size=n).astype(float),
    }, index=dates)
    return df


@pytest.fixture
def env(sample_ohlcv: pd.DataFrame) -> TradingEnv:
    return TradingEnv(sample_ohlcv, initial_cash=100_000.0, commission=0.001)


class TestFeatures:
    def test_compute_features_shape(self, sample_ohlcv):
        features = compute_features(sample_ohlcv, window=20)
        assert features.shape[1] == len(get_feature_names())
        assert len(features) < len(sample_ohlcv)
        assert len(features) > 0

    def test_no_nans(self, sample_ohlcv):
        features = compute_features(sample_ohlcv, window=20)
        assert not features.isna().any().any()

    def test_observation_dim(self):
        assert get_observation_dim() == len(get_feature_names()) + 1


class TestTradingEnv:
    def test_reset(self, env):
        obs, info = env.reset()
        assert obs.shape == (get_observation_dim(),)
        assert info["cash"] == 100_000.0
        assert info["shares"] == 0

    def test_step_hold(self, env):
        env.reset()
        obs, reward, terminated, truncated, info = env.step(0)
        assert info["shares"] == 0
        assert info["trade_count"] == 0

    def test_buy_sell_cycle(self, env):
        env.reset()
        _, _, _, _, info = env.step(1)  # BUY
        assert info["shares"] > 0
        assert info["trade_count"] == 1

        _, _, _, _, info = env.step(2)  # SELL
        assert info["shares"] == 0
        assert info["trade_count"] == 2

    def test_episode_terminates(self, env):
        env.reset()
        done = False
        steps = 0
        while not done:
            _, _, terminated, truncated, _ = env.step(0)
            done = terminated or truncated
            steps += 1
        assert steps == env.n_steps - 1

    def test_metrics(self, env):
        env.reset()
        done = False
        while not done:
            _, _, terminated, truncated, _ = env.step(0)
            done = terminated or truncated
        metrics = env.get_metrics()
        assert "total_return" in metrics
        assert "sharpe_ratio" in metrics
        assert "max_drawdown" in metrics


class TestActorCritic:
    def test_forward_shape(self):
        obs_dim = get_observation_dim()
        net = ActorCritic(obs_dim=obs_dim, hidden_dim=64, n_actions=3)
        obs = torch.randn(8, obs_dim)
        logits, value = net(obs)
        assert logits.shape == (8, 3)
        assert value.shape == (8, 1)

    def test_get_action(self):
        obs_dim = get_observation_dim()
        net = ActorCritic(obs_dim=obs_dim, hidden_dim=64)
        obs = torch.randn(1, obs_dim)
        action, log_prob, value = net.get_action(obs)
        assert action.shape == (1,)
        assert 0 <= action.item() <= 2

    def test_evaluate_actions(self):
        obs_dim = get_observation_dim()
        net = ActorCritic(obs_dim=obs_dim, hidden_dim=64)
        obs = torch.randn(16, obs_dim)
        actions = torch.randint(0, 3, (16,))
        log_probs, values, entropy = net.evaluate_actions(obs, actions)
        assert log_probs.shape == (16,)
        assert (entropy >= 0).all()


class TestRolloutBuffer:
    def test_add_and_compute(self):
        obs_dim = get_observation_dim()
        buf = RolloutBuffer(capacity=100, obs_dim=obs_dim)
        for i in range(50):
            obs = np.random.randn(obs_dim).astype(np.float32)
            buf.add(obs, action=1, reward=0.01, value=0.5, log_prob=-0.5, done=False)
        buf.compute_gae(last_value=0.5)
        batches = list(buf.get_batches(batch_size=16))
        assert len(batches) > 0


class TestPPOTrainer:
    def test_short_training(self, env):
        config = PPOConfig(lr=1e-3, rollout_steps=64, batch_size=32, n_epochs=2, hidden_dim=32)
        trainer = PPOTrainer(env, config)
        log = trainer.train(total_timesteps=200)
        assert isinstance(log, list)

    def test_evaluate(self, env):
        obs_dim = get_observation_dim()
        policy = ActorCritic(obs_dim=obs_dim, hidden_dim=32)
        results = evaluate(policy, env, n_episodes=1, deterministic=True)
        assert len(results) == 1
        assert "total_return" in results[0]

    def test_save_load(self, env, tmp_path):
        config = PPOConfig(hidden_dim=32, rollout_steps=64, batch_size=32, n_epochs=1)
        trainer = PPOTrainer(env, config)
        trainer.train(total_timesteps=100)
        save_dir = str(tmp_path / "test_model")
        trainer.save(save_dir)
        trainer2 = PPOTrainer(env, config)
        trainer2.load(save_dir)
        for p1, p2 in zip(trainer.policy.parameters(), trainer2.policy.parameters()):
            assert torch.allclose(p1, p2)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
