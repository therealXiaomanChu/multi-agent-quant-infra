# AI Quant Infra

A high-performance, event-driven quantitative trading system architecture designed for multi-agent reinforcement learning (MARL) research and high-frequency simulation.

# Overview

This project implements a decoupled trading infrastructure that separates strategy logic from execution mechanisms. It is designed to simulate Level-2 market data environments and support asynchronous signal generation using PPO (Proximal Policy Optimization) agents.

The system addresses the latency and concurrency challenges in traditional backtesting frameworks by utilizing a microservices architecture with Redis as the high-throughput message bus.

# System Architecture

The platform consists of four core components:

1. Trading Engine (Python/PyTorch):
   - Handles market event loops and signal generation.
   - Implements PPO inference logic with state management.
   - Manages order flow simulation and latency modeling.

2. API Gateway (Node.js):
   - RESTful API for strategy management and configuration.
   - WebSocket services for real-time frontend communication.

3. Data Infrastructure (Redis + MongoDB):
   - Redis: Pub/Sub channel for tick data and trade signals.
   - MongoDB: Persistence layer for trade logs and strategy performance metrics.

4. Visualization (React/TypeScript):
   - Real-time dashboard for monitoring PnL curves and exposure.

# Core Logic

The strategy core utilizes an event-driven model to process market ticks. Below is the simplified logic flow for the PPO agent:

- Data Ingestion: Consumes Level-2 tick data (Price, Volume, Order Book Imbalance).
- Feature Engineering: Computes real-time volatility and momentum factors.
- Inference: The RL model outputs action probabilities based on the current market state.
- Risk Control: Post-inference checks for drawdown limits and exposure constraints.

## Tech Stack

- Language: Python 3.9, TypeScript, JavaScript
- Frameworks: PyTorch, Express.js, React 18
- Infrastructure: Docker, Docker Compose
- Middleware: Redis, MongoDB

# Quick Start

# Prerequisites

- Docker & Docker Compose
- Python 3.9+ (For local debugging)

# Deployment

1. Clone the repository:
   git clone https://github.com/XiaomanChu/ai-quant-infrastructure.git
   cd ai-quant-infrastructure

2. Start services:
   docker-compose up -d

3. Access endpoints:
   - Dashboard: http://localhost:3000
   - API: http://localhost:5000



# 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   前端 (React)   │────│  后端 (Node.js) │────│  数据库 (MongoDB)│
│                 │    │                 │    │                 │
│ - Agent提交界面  │    │ - RESTful API   │    │ - Agent存储     │
│ - 对比展示      │    │ - WebSocket服务  │    │ - 交易记录      │
│ - 实时图表      │    │ - 认证授权      │    │ - 用户数据      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ├─────────────────┐
                              │                 │
                    ┌─────────────────┐ ┌─────────────────┐
                    │  交易引擎        │ │  实时数据源      │
                    │                 │ │                 │
                    │ - 策略执行      │ │ - 市场数据API   │
                    │ - 回测系统      │ │ - WebSocket连接 │
                    │ - 风险管理      │ │ - 数据清洗      │
                    └─────────────────┘ └─────────────────┘
```

# 核心功能

# 1. Agent管理
- 用户注册和认证
- Agent代码提交和验证
- Agent配置和参数设置
- 版本控制和历史记录

# 2. 交易执行
- 实时市场数据接入
- 策略信号生成和执行
- 风险控制和资金管理
- 交易记录和日志

# 3. 回测系统
- 历史数据回测
- 多种评估指标
- 性能分析报告
- 参数优化建议

# 4. Arena mode
- Agent间实时对比
- 排行榜和评分系统
- 可视化对比图表
- 社区投票和评论

# 5. 数据分析
- 收益率分析
- 风险指标计算
- 回撤分析
- 夏普比率等专业指标

# 项目结构

```
trading_agent/
├── frontend/          # React前端应用
├── backend/           # Node.js后端服务
├── trading-engine/    # 交易引擎 (Python)
├── database/          # 数据库脚本和配置
├── docker/            # Docker配置文件
├── docs/              # 项目文档
└── scripts/           # 部署和工具脚本
```


# 许可证
MIT License

---
Copyright (c) 2026 CiciOntheRun. All rights reserved.