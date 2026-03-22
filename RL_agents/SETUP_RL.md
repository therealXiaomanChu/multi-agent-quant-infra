# 🚀 本地部署指南

## 前置条件

- Python 3.10+
- Git

## Step 1: 安装 RL 依赖

```bash
cd trading-engine
pip install -r requirements-rl.txt
```

> 如果 PyTorch 装太慢，用 CPU 版：
> ```bash
> pip install torch --index-url https://download.pytorch.org/whl/cpu
> pip install gymnasium numpy pandas yfinance scipy loguru pytest
> ```

## Step 2: 跑测试

```bash
# 项目根目录
make test
# 或手动
cd trading-engine && python -m pytest tests/test_rl.py -v
```

预期输出：12 个 test 全部 PASSED。

## Step 3: 端到端 Demo

```bash
make demo
# 或
cd trading-engine && python -m scripts.demo
```

这会：
1. 用 yfinance 下载 SPY 5 年日线数据
2. 80/20 切分训练集/测试集
3. 训练 PPO Agent（~30s）
4. 在测试集上评估，打印与 Buy & Hold 的对比表格
5. 模型保存到 `trading-engine/checkpoints/ppo_spy/`

## Step 4: 启动模拟引擎

```bash
make engine
```

会启动 tick 事件循环，PPO Agent 和启发式 Agent 对同一 tick 做实时推理。

## Step 5: 推送到 GitHub

```bash
git add -A
git commit -m "feat: add real PPO trading agent with env, training, tests"
git push origin main
```

## 新增文件一览

```
trading-engine/
├── src/rl/                  # 新增 RL 模块
│   ├── __init__.py
│   ├── features.py          # 10 个技术因子
│   ├── env.py               # Gym 交易环境
│   ├── networks.py          # Actor-Critic 网络
│   ├── buffer.py            # GAE Rollout Buffer
│   └── ppo.py               # PPO 算法 + evaluate
├── src/core/
│   └── engine_v2.py         # 真实模型推理引擎（替换 mock）
├── scripts/
│   └── demo.py              # 端到端训练+评估 Demo
├── tests/
│   ├── __init__.py
│   └── test_rl.py           # 12 个单元测试
├── requirements-rl.txt      # 精简依赖
Makefile                     # make test / make demo / make engine
```
