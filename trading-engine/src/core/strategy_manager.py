#!/usr/bin/env python3
"""
Strategy Manager Module
策略管理器模块
"""

import asyncio
from typing import Dict, List, Any, Optional
from datetime import datetime
import json
import subprocess
import sys
from pathlib import Path

from loguru import logger
import pandas as pd
import numpy as np

from ..utils.config import Config
from ..utils.database import DatabaseManager
from ..models.strategy import Strategy, StrategyStatus, Trade, Position, Order


class StrategyManager:
    """策略管理器"""
    
    def __init__(self, config: Config, db_manager: DatabaseManager):
        self.config = config
        self.db_manager = db_manager
        
        # 策略执行环境
        self.execution_globals = {
            'pd': pd,
            'np': np,
            'logger': logger,
            'datetime': datetime
        }
        
        logger.info("🔧 策略管理器初始化完成")
    
    async def get_strategy(self, strategy_id: str) -> Optional[Dict[str, Any]]:
        """获取策略信息"""
        try:
            # 这里应该从数据库或API获取策略信息
            # 暂时返回模拟数据
            return {
                'id': strategy_id,
                'name': f'Strategy {strategy_id}',
                'code': self._get_default_strategy_code(),
                'language': 'python',
                'parameters': {}
            }
        except Exception as e:
            logger.error(f"❌ 获取策略失败 {strategy_id}: {e}")
            return None
    
    async def execute_strategy(self, strategy: Strategy) -> None:
        """执行策略"""
        try:
            logger.info(f"🎯 执行策略: {strategy.name}")
            
            # 准备执行环境
            exec_globals = self.execution_globals.copy()
            exec_globals.update({
                'strategy': strategy,
                'parameters': strategy.parameters,
                'buy': lambda symbol, size, price=None: self._place_order(strategy, symbol, 'buy', size, price),
                'sell': lambda symbol, size, price=None: self._place_order(strategy, symbol, 'sell', size, price),
                'get_position': lambda symbol: strategy.get_position(symbol),
                'get_market_data': lambda symbol: self._get_market_data(symbol)
            })
            
            # 执行策略代码
            if strategy.language.lower() == 'python':
                await self._execute_python_strategy(strategy, exec_globals)
            else:
                raise ValueError(f"不支持的策略语言: {strategy.language}")
            
            logger.info(f"✅ 策略执行完成: {strategy.name}")
            
        except Exception as e:
            logger.error(f"❌ 策略执行失败 {strategy.name}: {e}")
            strategy.status = StrategyStatus.ERROR
            strategy.error_message = str(e)
            raise
    
    async def _execute_python_strategy(self, strategy: Strategy, exec_globals: Dict[str, Any]) -> None:
        """执行Python策略"""
        try:
            # 编译策略代码
            compiled_code = compile(strategy.code, f'<strategy_{strategy.id}>', 'exec')
            
            # 执行策略代码
            exec(compiled_code, exec_globals)
            
            # 如果策略定义了main函数，执行它
            if 'main' in exec_globals:
                main_func = exec_globals['main']
                if asyncio.iscoroutinefunction(main_func):
                    await main_func()
                else:
                    main_func()
            
        except Exception as e:
            logger.error(f"❌ Python策略执行失败: {e}")
            raise
    
    async def _place_order(
        self,
        strategy: Strategy,
        symbol: str,
        side: str,
        size: float,
        price: Optional[float] = None
    ) -> str:
        """下单"""
        try:
            from ..models.strategy import OrderSide, OrderType
            
            order = Order(
                strategy_id=strategy.id,
                symbol=symbol,
                side=OrderSide.BUY if side.lower() == 'buy' else OrderSide.SELL,
                type=OrderType.MARKET if price is None else OrderType.LIMIT,
                size=size,
                price=price
            )
            
            strategy.add_order(order)
            
            # 模拟订单执行
            await self._simulate_order_execution(strategy, order)
            
            logger.info(f"📋 下单成功: {symbol} {side} {size}")
            return order.id
            
        except Exception as e:
            logger.error(f"❌ 下单失败: {e}")
            raise
    
    async def _simulate_order_execution(self, strategy: Strategy, order: Order) -> None:
        """模拟订单执行"""
        try:
            from ..models.strategy import OrderStatus
            
            # 获取市场价格
            market_data = await self._get_market_data(order.symbol)
            if not market_data:
                order.status = OrderStatus.REJECTED
                order.error_message = "无法获取市场数据"
                return
            
            current_price = market_data.get('close', 100.0)  # 默认价格
            
            # 模拟订单成交
            order.status = OrderStatus.FILLED
            order.filled_size = order.size
            order.avg_fill_price = current_price
            order.filled_at = datetime.now()
            
            # 更新持仓
            await self._update_position(strategy, order)
            
            # 创建交易记录
            trade = Trade(
                strategy_id=strategy.id,
                symbol=order.symbol,
                side=order.side,
                size=order.size,
                entry_price=current_price,
                entry_time=order.filled_at
            )
            
            strategy.add_trade(trade)
            
        except Exception as e:
            logger.error(f"❌ 模拟订单执行失败: {e}")
            raise
    
    async def _update_position(self, strategy: Strategy, order: Order) -> None:
        """更新持仓"""
        try:
            position = strategy.get_position(order.symbol)
            
            if position is None:
                # 创建新持仓
                position = Position(
                    strategy_id=strategy.id,
                    symbol=order.symbol,
                    size=order.filled_size if order.side.value == 'buy' else -order.filled_size,
                    avg_price=order.avg_fill_price
                )
                strategy.add_position(position)
            else:
                # 更新现有持仓
                if order.side.value == 'buy':
                    new_size = position.size + order.filled_size
                    if position.size >= 0:  # 原来是多头或空仓
                        position.avg_price = (
                            position.avg_price * position.size + 
                            order.avg_fill_price * order.filled_size
                        ) / new_size
                    position.size = new_size
                else:  # sell
                    position.size -= order.filled_size
                
                position.updated_at = datetime.now()
            
        except Exception as e:
            logger.error(f"❌ 更新持仓失败: {e}")
            raise
    
    async def _get_market_data(self, symbol: str) -> Optional[Dict[str, Any]]:
        """获取市场数据"""
        try:
            # 这里应该从市场数据提供者获取实时数据
            # 暂时返回模拟数据
            return {
                'symbol': symbol,
                'open': 100.0,
                'high': 105.0,
                'low': 95.0,
                'close': 102.0,
                'volume': 1000000,
                'timestamp': datetime.now()
            }
        except Exception as e:
            logger.error(f"❌ 获取市场数据失败 {symbol}: {e}")
            return None
    
    def _get_default_strategy_code(self) -> str:
        """获取默认策略代码"""
        return """
# 默认交易策略示例
import asyncio

async def main():
    """策略主函数"""
    logger.info("策略开始执行")
    
    # 获取市场数据
    market_data = await get_market_data('AAPL')
    if market_data:
        current_price = market_data['close']
        logger.info(f"当前价格: {current_price}")
        
        # 简单的买入策略
        position = get_position('AAPL')
        if position is None or position.size == 0:
            # 如果没有持仓，买入
            await buy('AAPL', 100)
            logger.info("执行买入操作")
    
    logger.info("策略执行完成")
"""