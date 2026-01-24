#!/usr/bin/env python3
import sys
import os

# 将 src 目录加入 Python 路径，防止 Import Error
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(current_dir, 'src')
sys.path.append(src_dir)

from core.engine import TradingEngine

if __name__ == "__main__":
    print("=========================================")
    print("   AI QUANT INFRASTRUCTURE - STARTING    ")
    print("=========================================")
    
    # 实例化并启动引擎
    engine = TradingEngine()
    engine.start()
