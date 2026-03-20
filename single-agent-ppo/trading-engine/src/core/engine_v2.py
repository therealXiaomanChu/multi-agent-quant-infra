"""
核心 AI 交易引擎
驱动实盘/模拟信号生成，集成 PPO 强化学习策略。
"""

import time
import json
import logging
import numpy as np
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import torch

from .rl.networks import ActorCritic
from .rl.features import compute_features, get_observation_dim

try:
    from .utils.config import config
except ImportError:
    import sys, os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from utils.config import config

logging.basicConfig(
    level=getattr(logging, config.log_level.upper(), logging.INFO),
    format="%(asctime)s - [AI-ENGINE] - %(levelname)s - %(message)s",
)
logger = logging.getLogger("TradingEngine")


class PPOAgent:
    """
    PPO 推理 Agent — 加载训练好的模型权重进行实时决策。

    如果没有模型文件，会退化为启发式策略（基于 RSI + 波动率）。
    """

    ACTION_MAP = {0: "HOLD", 1: "BUY", 2: "SELL"}

    def __init__(
        self,
        agent_id: str,
        model_path: Optional[str] = None,
        risk_level: str = "medium",
        device: str = "cpu",
    ):
        self.agent_id = agent_id
        self.risk_level = risk_level
        self.device = torch.device(device)
        self.policy: Optional[ActorCritic] = None

        # 尝试加载模型
        if model_path and Path(model_path).exists():
            self._load_model(model_path)
            logger.info(f"🧠 Agent [{agent_id}] 已加载 PPO 模型: {model_path}")
        else:
            logger.warning(f"⚠️  Agent [{agent_id}] 未找到模型，使用启发式策略")

        # 维护最近 N 根 K 线的滑动窗口
        self._history: list[Dict[str, float]] = []
        self._window_size = 30  # 需要至少 30 根 K 线来计算特征

    def _load_model(self, model_path: str) -> None:
        """加载 PyTorch 模型权重。"""
        obs_dim = get_observation_dim()
        self.policy = ActorCritic(obs_dim=obs_dim, hidden_dim=128).to(self.device)
        state_dict = torch.load(
            Path(model_path) / "policy.pt",
            map_location=self.device,
            weights_only=True,
        )
        self.policy.load_state_dict(state_dict)
        self.policy.eval()

    def get_action(self, market_state: Dict[str, Any]) -> tuple[str, float]:
        """
        输入市场 tick，输出 (action, confidence)。

        Args:
            market_state: 至少含 price, open, high, low, close, volume

        Returns:
            (action_str, confidence)
        """
        # 追加到历史
        self._history.append({
            "open": market_state.get("open", market_state["price"]),
            "high": market_state.get("high", market_state["price"] + 0.1),
            "low": market_state.get("low", market_state["price"] - 0.1),
            "close": market_state["price"],
            "volume": market_state.get("volume", 1_000_000),
        })

        # 窗口不足时 HOLD
        if len(self._history) < self._window_size:
            return "HOLD", 0.5

        # 保留最近窗口
        self._history = self._history[-self._window_size:]

        # 如果有模型 → 神经网络推理
        if self.policy is not None:
            return self._inference()

        # 否则 → 启发式策略
        return self._heuristic()

    def _inference(self) -> tuple[str, float]:
        """用 PPO 网络推理。"""
        df = pd.DataFrame(self._history)
        features = compute_features(df, window=20)

        if features.empty:
            return "HOLD", 0.5

        # 取最后一行特征 + 持仓标志（暂时设为 0）
        feat_vec = features.iloc[-1].values.astype(np.float32)
        obs = np.concatenate([feat_vec, [0.0]])  # position=0 简化
        obs = np.nan_to_num(obs, nan=0.0)

        obs_tensor = torch.tensor(obs, dtype=torch.float32, device=self.device).unsqueeze(0)

        with torch.no_grad():
            logits, _ = self.policy(obs_tensor)
            probs = torch.softmax(logits, dim=-1).squeeze(0)
            action_idx = probs.argmax().item()
            confidence = probs[action_idx].item()

        return self.ACTION_MAP[action_idx], confidence

    def _heuristic(self) -> tuple[str, float]:
        """基于 RSI + 波动率的简单启发式策略。"""
        df = pd.DataFrame(self._history)
        features = compute_features(df, window=20)

        if features.empty:
            return "HOLD", 0.5

        last = features.iloc[-1]
        rsi = last["rsi"]
        vol = last["volatility"]

        # 高波动 → HOLD
        if vol > 0.03:
            return "HOLD", 0.7

        # RSI 超卖 → BUY
        if rsi < 0.3:
            return "BUY", 0.6 + (0.3 - rsi)

        # RSI 超买 → SELL
        if rsi > 0.7:
            return "SELL", 0.6 + (rsi - 0.7)

        return "HOLD", 0.5


class TradingEngine:
    """
    核心 AI 交易引擎 — 负责驱动实盘信号生成与 AI 博弈。
    """

    def __init__(self, model_path: Optional[str] = None):
        self.is_running = False

        # 初始化两个对战的 Agent
        self.agent_a = PPOAgent(
            "PPO_Alpha", model_path=model_path, risk_level="high"
        )
        self.agent_b = PPOAgent(
            "Heuristic_Baseline", model_path=None, risk_level="low"
        )
        logger.info(f"🔧 Engine Configured. Environment: {config.environment}")

    def start(self) -> None:
        self.is_running = True
        logger.info(f"🚀 AI Engine Started. Redis: {config.redis_url}")
        logger.info("📡 Subscribing to Market Data Stream...")

        try:
            self.run_loop()
        except KeyboardInterrupt:
            self.stop()

    def stop(self) -> None:
        self.is_running = False
        logger.info("🛑 Engine stopping...")

    def run_loop(self) -> None:
        """主事件循环 — 消费 tick 数据，生成交易信号。"""
        logger.info("🟢 Event Loop Active. Processing ticks...")
        import random

        base_price = 1700.0

        while self.is_running:
            # 模拟 tick（生产环境从 Redis Pub/Sub 消费）
            current_price = base_price + random.uniform(-20, 20)
            market_tick = {
                "symbol": "600519.SH",
                "price": round(current_price, 2),
                "open": round(current_price + random.uniform(-2, 2), 2),
                "high": round(current_price + random.uniform(0, 5), 2),
                "low": round(current_price - random.uniform(0, 5), 2),
                "volume": random.randint(500_000, 5_000_000),
                "volatility": random.uniform(0.01, 0.05),
                "timestamp": datetime.now().isoformat(),
            }

            # 双 Agent 推理
            action_a, conf_a = self.agent_a.get_action(market_tick)
            action_b, conf_b = self.agent_b.get_action(market_tick)

            if conf_a > 0.6:
                logger.info(
                    f"⚡ [{self.agent_a.agent_id}] "
                    f"{market_tick['price']} → {action_a} ({conf_a:.0%})"
                )
            if conf_b > 0.6:
                logger.info(
                    f"⚡ [{self.agent_b.agent_id}] "
                    f"{market_tick['price']} → {action_b} ({conf_b:.0%})"
                )

            time.sleep(1.0)


if __name__ == "__main__":
    engine = TradingEngine()
    engine.start()
