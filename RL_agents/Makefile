.PHONY: install test demo train lint clean

# ─── 安装依赖 ───
install:
	pip install -r requirements-rl.txt

# ─── 跑测试 ───
test:
	cd trading-engine && python -m pytest tests/test_rl.py -v

# ─── 端到端 Demo（下载数据→训练→评估→对比 Buy&Hold）───
demo:
	cd trading-engine && python -m scripts.demo

# ─── 仅训练（等价于 demo）───
train: demo

# ─── 启动引擎（模拟 tick 循环）───
engine:
	cd trading-engine && python -c "from src.core.engine_v2 import TradingEngine; TradingEngine().start()"

# ─── 清理 ───
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	rm -rf trading-engine/checkpoints
