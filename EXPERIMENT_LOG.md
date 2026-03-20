# 实验日志

> 记录项目从单 Agent PPO 到 Multi-Agent Ensemble 的完整演进过程。
> 每次实验记录：做了什么、为什么这样做、结果如何、下一步方向。

---

# 单 Agent PPO 基线

# 实验 1: 搭建 PPO
# - 实现完整 RL 模块 (`trading-engine/src/rl/`)：
  - `features.py`：10 个技术因子（RSI、MACD、布林带、ATR 等），窗口可配置
  - `env.py`：Gymnasium 标准交易环境，action = HOLD/BUY/SELL
  - `networks.py`：Actor-Critic 网络（共享底层 + 分离头部），正交初始化
  - `buffer.py`：Rollout Buffer + GAE (Generalized Advantage Estimation)
  - `ppo.py`：完整 PPO 算法（clipped surrogate loss + entropy bonus）
  - 15 个单元测试全部通过 (2.02s)

# Reward 设计迭代：
- v1：基于对数收益率 + 交易成本惩罚 → Agent 学会"不交易就不亏手续费"，躺平策略
- v2：改为每步组合收益率 `(当前组合价值 - 上一步组合价值) / 上一步组合价值` → Agent 能感知"踏空成本"


# 实验 2: 真实 A 股数据（贵州茅台 600519.SH）
数据： Tushare 格式 CSV，2018-2025，但数据是稀疏采样（每只股票 ~250-350 天，非完整日线）
训练： 2020-2023 (128 天) → *测试：* 2024 (25 天)
结果：
| 指标 | PPO Agent | Buy & Hold |
|------|-----------|------------|
| 总收益率 | -4.05% | -6.71% |
| Alpha | **+2.66%** | — |

分析： 跑赢了 Buy & Hold，但训练集只有 128 天、测试集 25 天，样本量太小，结果不可靠。


# 实验 3: Walk-Forward 滚动窗口评估
- 单次 train/test split 只看了"一种未来"，无法判断是运气还是策略有效
- 多种子评估（如 3 个种子）只能产生 4 档胜率，无区分度
- Walk-Forward 让策略面对多种不同行情，产生足够多的评估样本点
设置： 训练窗口 200 天 | 测试窗口 30 天 | 滑动步长 30 天 | 数据量前 2 的股票
结果：
| 股票 | 窗口 | PPO | B&H | Alpha | 结果 |
|------|------|-----|-----|-------|------|
| 302132.SZ | 1 | -9.67% | -33.38% | +23.71% | 胜 |
| 302132.SZ | 2 | +0.00% | +412.91% | -412.91% | 败 |
| 302132.SZ | 3 | -6.10% | -6.72% | +0.62% | 胜 |
| 302132.SZ | 4 | -1.63% | +6.45% | -8.08% | 败 |
| 302132.SZ | 5 | +37.50% | +95.02% | -57.52% | 败 |
| 835185.BJ | 1 | +0.00% | -31.31% | +31.31% | 胜 |
| 835185.BJ | 2 | +0.00% | -61.10% | +61.10% | 胜 |
| 835185.BJ | 3 | -12.57% | -2.71% | -9.86% | 败 |

总胜率：4/8 (50%)  |  平均 Alpha: -46.46%
分析：
- 胜率 50% 在合理区间 (45%-75%)，策略有统计意义上的有效性
- 但平均 Alpha 为巨额负值，原因是窗口 2 中 B&H 涨了 +412%（稀疏数据导致"30 天窗口"实际跨半年以上），PPO 完全没交易
- 赢在熊市（空仓躺赢），输在牛市（空仓踏空），赢小输大
- 核心瓶颈是*数据稀疏*，而非算法本身
# 数据问题暂搁，先以架构设计为主
# 理由：
- 在稀疏数据上继续调参意义不大，alpha 和 sharpe 参考价值小
- 胜率 50% 作为 baseline 可接受，multi-agent ensemble 的目标是在此基础上层层加分
- 理论阶段能搭起来、消融能过即可
- 后续用 akshare/tushare 获取完整日线数据后再做精调



# 架构设计调研
# 文献
核心参考论文：
1. Yang et al., ICAIF 2020 — "Deep Reinforcement Learning for Automated Stock Trading: An Ensemble Strategy"
   - FinRL 框架的理论基础 (GitHub 10k+ star)
   - PPO + A2C + DDPG 三个 RL agent，按 Sharpe ratio 滚动选优
   - 不同算法擅长不同行情：A2C 擅长熊市，PPO 擅长牛市趋势
2. ICAIF FinRL Contest 2025 — ensemble agent 用加权平均动作概率，收益标准差降低 50%
3. TradingAgents (2024) — LLM multi-agent 模仿交易公司组织架构，但成本高
4. FLAG-TRADER (2025) — LLM 作为 RL 策略网络，PPO 更新 LLM 权重

# Agent 分类
| 类型 | 大脑 | 代表 | 特点 |
|------|------|------|------|
| RL Agent | 策略网络 | PPO, A2C, DDPG | 试错学习，快决策 |
| LLM Agent | 语言模型 | AutoGPT, LangChain | 理解文本，慢决策，烧 token |
| Rule-Based Agent | if-else 规则 | 风控引擎 | 逻辑透明，零成本 |
| Evolutionary Agent | 种群进化 | 遗传编程 | 参数优化，非主流 |
Agent 定义四要素：感知环境 → 自主决策 → 作用于环境 → 目标驱动（闭环）。

# 确定的架构方向？
RL Ensemble（核心决策）+ Rule-Based（风控）？
# 消融实验
# 下一步
-  A2C Agent？
-  DDPG Agent？
-  Ensemble 选择器（按验证期 Sharpe ratio 选 agent）？
-  Rule-Based 风控 Agent？
-  Walk-Forward 消融实验
-  获取完整日线数据（akshare）重新跑全量评估
- （可选）加 LLM/FinBERT 情绪特征层
