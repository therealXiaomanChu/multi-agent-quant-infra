import time
import random
import json
import logging
import asyncio
from datetime import datetime
from typing import Dict, Any

# 引入配置
try:
    from ..utils.config import config
except ImportError:
    # 防止直接运行时路径报错
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from utils.config import config

# 配置日志 - 使用 Config 中的设置
logging.basicConfig(
    level=getattr(logging, config.log_level.upper(), logging.INFO),
    format='%(asctime)s - [AI-ENGINE] - %(levelname)s - %(message)s'
)
logger = logging.getLogger("TradingEngine")

class PPOAgent:
    """
    Mock PPO (Proximal Policy Optimization) Agent.
    模拟强化学习智能体。在真实环境中，这里会加载 PyTorch/TensorFlow 模型权重。
    Model Path: models/ppo_weights_v2.pt
    """
    def __init__(self, agent_id: str, risk_level: str = "aggressive"):
        self.agent_id = agent_id
        self.risk_level = risk_level
        logger.info(f"🧠 Initialized RL Agent: {agent_id} | Risk Profile: {risk_level}")

    def get_action(self, market_state: Dict[str, Any]) -> tuple:
        """
        模拟策略网络的推理过程 (Inference)
        """
        # 1. 特征提取 (Feature Extraction)
        # 模拟读取 Level-2 数据的 Order Flow Imbalance
        price = market_state.get('price', 100)
        volatility = market_state.get('volatility', 0)
        
        # 2. 策略网络输出 (Policy Network Output)
        # 模拟神经网络输出的概率分布 (Logits)
        confidence = random.uniform(0.65, 0.98)
        
        # 3. 决策逻辑 (Mock PPO Logic)
        # 波动率高时，PPO 倾向于风控 (Hold/Sell)
        if volatility > 0.03:
            action = "HOLD"
        # 随机模拟买卖决策，制造交易流
        elif random.random() > 0.45: # 稍微偏多头
            action = "BUY"
        else:
            action = "SELL"
            
        return action, confidence

class TradingEngine:
    """
    核心 AI 交易引擎 - 负责驱动实盘信号生成与 AI 博弈
    """
    def __init__(self):
        self.is_running = False
        # 初始化两个对战的 Agent (模拟 Multi-Agent PK 场景)
        self.agent_a = PPOAgent("Alpha_PPO_Bot", risk_level="high")
        self.agent_b = PPOAgent("Baseline_CTA", risk_level="low")
        logger.info(f"🔧 Engine Configured. Environment: {config.environment}")

    def start(self):
        self.is_running = True
        logger.info(f"🚀 AI Engine Started. Connecting to Redis Bus ({config.redis_url})...")
        logger.info("📡 Subscribing to A-Share Level-2 Market Data Stream...")
        
        try:
            # 使用 asyncio.run 如果是异步环境，或者直接调用同步循环
            self.run_loop()
        except KeyboardInterrupt:
            self.stop()

    def stop(self):
        self.is_running = False
        logger.info("🛑 Engine stopping...")

    def run_loop(self):
        """主事件循环 (Event Loop)"""
        logger.info("🟢 Event Loop Active. Processing ticks...")
        
        while self.is_running:
            # 1. Mock 市场数据 (Tick) - 模拟 A股 贵州茅台 (600519)
            base_price = 1700.0
            current_price = base_price + random.uniform(-20, 20)
            
            market_tick = {
                "symbol": "600519.SH", 
                "price": round(current_price, 2),
                "volatility": random.uniform(0.01, 0.05),
                "bid1": round(current_price - 0.1, 2),
                "ask1": round(current_price + 0.1, 2),
                "timestamp": datetime.now().isoformat()
            }

            # 2. Agent A (PPO) 进行推理
            action_a, conf_a = self.agent_a.get_action(market_tick)
            
            # 3. 记录日志 (模拟产生交易信号)
            # 只有置信度高时才打印，模拟真实交易中的信号过滤
            if conf_a > 0.75:
                log_payload = {
                    "tick": market_tick['price'],
                    "agent": self.agent_a.agent_id,
                    "action": action_a,
                    "confidence": f"{conf_a:.2%}",
                    "latency": f"{random.randint(2, 8)}ms" # 模拟极低延迟
                }
                logger.info(f"⚡ Signal Generated: {json.dumps(log_payload)}")
            
            # 模拟高频交易的间隔 (Mock环境下放慢速度以免刷屏，设为1秒)
            time.sleep(1.0)

# 确保直接运行也能跑
if __name__ == "__main__":
    engine = TradingEngine()
    engine.start()
