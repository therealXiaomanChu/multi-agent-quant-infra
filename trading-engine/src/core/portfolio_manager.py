#!/usr/bin/env python3
"""
Portfolio Manager Module
投资组合管理器模块
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from collections import defaultdict

import pandas as pd
import numpy as np
from loguru import logger

from ..utils.config import Config
from ..utils.database import DatabaseManager
from ..models.strategy import Strategy, Position, Trade


@dataclass
class PortfolioMetrics:
    """投资组合指标"""
    total_value: float = 0.0
    total_pnl: float = 0.0
    total_return: float = 0.0
    daily_return: float = 0.0
    volatility: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0
    current_positions: int = 0
    cash_balance: float = 0.0
    margin_used: float = 0.0
    margin_available: float = 0.0
    leverage: float = 0.0


@dataclass
class AssetAllocation:
    """资产配置"""
    symbol: str
    weight: float
    value: float
    pnl: float
    return_pct: float


class PortfolioManager:
    """投资组合管理器"""
    
    def __init__(self, config: Config, db_manager: DatabaseManager):
        self.config = config
        self.db_manager = db_manager
        
        # 投资组合配置
        self.initial_capital = 100000.0  # 初始资金10万
        self.current_capital = self.initial_capital
        self.cash_balance = self.initial_capital
        
        # 投资组合数据
        self.strategies: Dict[str, Strategy] = {}
        self.portfolio_history: List[Dict[str, Any]] = []
        self.daily_returns: List[float] = []
        self.equity_curve: List[Tuple[datetime, float]] = []
        
        # 性能缓存
        self._metrics_cache: Optional[PortfolioMetrics] = None
        self._cache_timestamp: Optional[datetime] = None
        self._cache_ttl = timedelta(seconds=30)  # 缓存30秒
        
        logger.info("🔧 投资组合管理器初始化完成")
    
    async def initialize(self) -> None:
        """初始化投资组合管理器"""
        try:
            logger.info("🚀 初始化投资组合管理器...")
            
            # 加载历史数据
            await self._load_portfolio_history()
            
            # 初始化权益曲线
            self.equity_curve.append((datetime.now(), self.current_capital))
            
            logger.info("✅ 投资组合管理器初始化成功")
            
        except Exception as e:
            logger.error(f"❌ 投资组合管理器初始化失败: {e}")
            raise
    
    async def shutdown(self) -> None:
        """关闭投资组合管理器"""
        try:
            logger.info("🛑 关闭投资组合管理器...")
            
            # 保存投资组合数据
            await self._save_portfolio_data()
            
            logger.info("✅ 投资组合管理器已关闭")
            
        except Exception as e:
            logger.error(f"❌ 关闭投资组合管理器失败: {e}")
    
    async def add_strategy(self, strategy: Strategy) -> None:
        """添加策略到投资组合"""
        try:
            self.strategies[strategy.id] = strategy
            logger.info(f"📈 策略已添加到投资组合: {strategy.name}")
            
            # 清除缓存
            self._clear_cache()
            
        except Exception as e:
            logger.error(f"❌ 添加策略失败: {e}")
            raise
    
    async def remove_strategy(self, strategy_id: str) -> None:
        """从投资组合移除策略"""
        try:
            if strategy_id in self.strategies:
                strategy = self.strategies[strategy_id]
                del self.strategies[strategy_id]
                logger.info(f"📉 策略已从投资组合移除: {strategy.name}")
                
                # 清除缓存
                self._clear_cache()
            
        except Exception as e:
            logger.error(f"❌ 移除策略失败: {e}")
            raise
    
    async def update(self) -> None:
        """更新投资组合"""
        try:
            # 更新所有策略的市场价格
            await self._update_market_prices()
            
            # 计算当前资金
            await self._calculate_current_capital()
            
            # 更新权益曲线
            self._update_equity_curve()
            
            # 计算日收益率
            self._calculate_daily_returns()
            
            # 清除缓存
            self._clear_cache()
            
        except Exception as e:
            logger.error(f"❌ 更新投资组合失败: {e}")
    
    async def get_metrics(self) -> PortfolioMetrics:
        """获取投资组合指标"""
        try:
            # 检查缓存
            if self._is_cache_valid():
                return self._metrics_cache
            
            # 计算指标
            metrics = await self._calculate_metrics()
            
            # 更新缓存
            self._metrics_cache = metrics
            self._cache_timestamp = datetime.now()
            
            return metrics
            
        except Exception as e:
            logger.error(f"❌ 获取投资组合指标失败: {e}")
            return PortfolioMetrics()
    
    async def get_asset_allocation(self) -> List[AssetAllocation]:
        """获取资产配置"""
        try:
            allocations = []
            total_value = await self._get_total_portfolio_value()
            
            if total_value == 0:
                return allocations
            
            # 按交易对汇总持仓
            symbol_positions = defaultdict(list)
            for strategy in self.strategies.values():
                for position in strategy.positions:
                    if position.size != 0:
                        symbol_positions[position.symbol].append(position)
            
            # 计算每个交易对的配置
            for symbol, positions in symbol_positions.items():
                total_size = sum(pos.size for pos in positions)
                avg_price = sum(pos.avg_price * abs(pos.size) for pos in positions) / sum(abs(pos.size) for pos in positions)
                market_price = positions[0].market_price  # 假设市场价格相同
                
                value = abs(total_size) * market_price
                weight = value / total_value
                pnl = sum(pos.unrealized_pnl for pos in positions)
                return_pct = pnl / (abs(total_size) * avg_price) if abs(total_size) * avg_price > 0 else 0
                
                allocations.append(AssetAllocation(
                    symbol=symbol,
                    weight=weight,
                    value=value,
                    pnl=pnl,
                    return_pct=return_pct
                ))
            
            # 按权重排序
            allocations.sort(key=lambda x: x.weight, reverse=True)
            
            return allocations
            
        except Exception as e:
            logger.error(f"❌ 获取资产配置失败: {e}")
            return []
    
    async def get_equity_curve(self, days: int = 30) -> List[Dict[str, Any]]:
        """获取权益曲线"""
        try:
            # 获取最近N天的数据
            cutoff_date = datetime.now() - timedelta(days=days)
            recent_curve = [
                {'timestamp': timestamp, 'value': value}
                for timestamp, value in self.equity_curve
                if timestamp >= cutoff_date
            ]
            
            return recent_curve
            
        except Exception as e:
            logger.error(f"❌ 获取权益曲线失败: {e}")
            return []
    
    async def get_performance_summary(self) -> Dict[str, Any]:
        """获取业绩摘要"""
        try:
            metrics = await self.get_metrics()
            allocations = await self.get_asset_allocation()
            
            return {
                'total_value': metrics.total_value,
                'total_return': metrics.total_return,
                'daily_return': metrics.daily_return,
                'sharpe_ratio': metrics.sharpe_ratio,
                'max_drawdown': metrics.max_drawdown,
                'win_rate': metrics.win_rate,
                'total_trades': metrics.total_trades,
                'current_positions': metrics.current_positions,
                'top_holdings': allocations[:5],  # 前5大持仓
                'last_updated': datetime.now()
            }
            
        except Exception as e:
            logger.error(f"❌ 获取业绩摘要失败: {e}")
            return {}
    
    async def _calculate_metrics(self) -> PortfolioMetrics:
        """计算投资组合指标"""
        try:
            metrics = PortfolioMetrics()
            
            # 基本指标
            metrics.total_value = await self._get_total_portfolio_value()
            metrics.cash_balance = self.cash_balance
            metrics.total_pnl = metrics.total_value - self.initial_capital
            metrics.total_return = metrics.total_pnl / self.initial_capital if self.initial_capital > 0 else 0
            
            # 收集所有交易
            all_trades = []
            all_positions = []
            for strategy in self.strategies.values():
                all_trades.extend(strategy.trades)
                all_positions.extend([pos for pos in strategy.positions if pos.size != 0])
            
            metrics.total_trades = len(all_trades)
            metrics.current_positions = len(all_positions)
            
            if all_trades:
                # 交易统计
                trade_pnls = [trade.pnl for trade in all_trades if trade.pnl is not None]
                if trade_pnls:
                    winning_trades = [pnl for pnl in trade_pnls if pnl > 0]
                    losing_trades = [pnl for pnl in trade_pnls if pnl < 0]
                    
                    metrics.winning_trades = len(winning_trades)
                    metrics.losing_trades = len(losing_trades)
                    metrics.win_rate = metrics.winning_trades / len(trade_pnls)
                    
                    if winning_trades:
                        metrics.avg_win = np.mean(winning_trades)
                        metrics.largest_win = max(winning_trades)
                    
                    if losing_trades:
                        metrics.avg_loss = np.mean(losing_trades)
                        metrics.largest_loss = min(losing_trades)
                    
                    # 盈亏比
                    if metrics.avg_loss != 0:
                        metrics.profit_factor = abs(metrics.avg_win / metrics.avg_loss)
            
            # 计算波动率和夏普比率
            if len(self.daily_returns) > 1:
                metrics.volatility = np.std(self.daily_returns)
                if metrics.volatility > 0:
                    mean_return = np.mean(self.daily_returns)
                    risk_free_rate = self.config.risk_free_rate / 252  # 日化无风险利率
                    metrics.sharpe_ratio = (mean_return - risk_free_rate) / metrics.volatility
            
            # 计算最大回撤
            if len(self.equity_curve) > 1:
                values = [value for _, value in self.equity_curve]
                running_max = np.maximum.accumulate(values)
                drawdowns = (np.array(values) - running_max) / running_max
                metrics.max_drawdown = abs(np.min(drawdowns)) if len(drawdowns) > 0 else 0
            
            # 计算杠杆率
            total_position_value = sum(abs(pos.size * pos.market_price) for pos in all_positions)
            metrics.leverage = total_position_value / metrics.total_value if metrics.total_value > 0 else 0
            
            # 保证金计算
            metrics.margin_used = total_position_value * 0.1  # 假设10%保证金
            metrics.margin_available = metrics.total_value - metrics.margin_used
            
            # 计算日收益率
            if len(self.daily_returns) > 0:
                metrics.daily_return = self.daily_returns[-1]
            
            return metrics
            
        except Exception as e:
            logger.error(f"❌ 计算投资组合指标失败: {e}")
            return PortfolioMetrics()
    
    async def _get_total_portfolio_value(self) -> float:
        """获取投资组合总价值"""
        try:
            total_value = self.cash_balance
            
            for strategy in self.strategies.values():
                for position in strategy.positions:
                    if position.size != 0:
                        position_value = abs(position.size) * position.market_price
                        total_value += position_value + position.unrealized_pnl
            
            return total_value
            
        except Exception as e:
            logger.error(f"❌ 计算投资组合总价值失败: {e}")
            return self.cash_balance
    
    async def _update_market_prices(self) -> None:
        """更新市场价格"""
        try:
            # 收集所有需要更新价格的交易对
            symbols = set()
            for strategy in self.strategies.values():
                for position in strategy.positions:
                    if position.size != 0:
                        symbols.add(position.symbol)
            
            # 更新价格（这里应该从市场数据提供者获取）
            for symbol in symbols:
                # 模拟价格更新
                new_price = 100.0 + np.random.normal(0, 2)  # 模拟价格波动
                
                # 更新所有相关持仓的市场价格
                for strategy in self.strategies.values():
                    for position in strategy.positions:
                        if position.symbol == symbol:
                            position.market_price = new_price
                            # 更新未实现盈亏
                            position.unrealized_pnl = (
                                position.size * (new_price - position.avg_price)
                            )
                            position.updated_at = datetime.now()
            
        except Exception as e:
            logger.error(f"❌ 更新市场价格失败: {e}")
    
    async def _calculate_current_capital(self) -> None:
        """计算当前资金"""
        try:
            self.current_capital = await self._get_total_portfolio_value()
        except Exception as e:
            logger.error(f"❌ 计算当前资金失败: {e}")
    
    def _update_equity_curve(self) -> None:
        """更新权益曲线"""
        try:
            now = datetime.now()
            self.equity_curve.append((now, self.current_capital))
            
            # 限制权益曲线长度
            if len(self.equity_curve) > 10000:
                self.equity_curve = self.equity_curve[-5000:]
            
        except Exception as e:
            logger.error(f"❌ 更新权益曲线失败: {e}")
    
    def _calculate_daily_returns(self) -> None:
        """计算日收益率"""
        try:
            if len(self.equity_curve) < 2:
                return
            
            # 获取昨日和今日的价值
            today = datetime.now().date()
            yesterday = today - timedelta(days=1)
            
            today_values = [value for timestamp, value in self.equity_curve if timestamp.date() == today]
            yesterday_values = [value for timestamp, value in self.equity_curve if timestamp.date() == yesterday]
            
            if today_values and yesterday_values:
                today_value = today_values[-1]
                yesterday_value = yesterday_values[-1]
                
                daily_return = (today_value - yesterday_value) / yesterday_value if yesterday_value > 0 else 0
                self.daily_returns.append(daily_return)
                
                # 限制历史长度
                if len(self.daily_returns) > 252:  # 保留一年的数据
                    self.daily_returns = self.daily_returns[-252:]
            
        except Exception as e:
            logger.error(f"❌ 计算日收益率失败: {e}")
    
    def _is_cache_valid(self) -> bool:
        """检查缓存是否有效"""
        if self._metrics_cache is None or self._cache_timestamp is None:
            return False
        
        return datetime.now() - self._cache_timestamp < self._cache_ttl
    
    def _clear_cache(self) -> None:
        """清除缓存"""
        self._metrics_cache = None
        self._cache_timestamp = None
    
    async def _load_portfolio_history(self) -> None:
        """加载投资组合历史数据"""
        try:
            # 这里应该从数据库加载历史数据
            # 暂时跳过
            pass
        except Exception as e:
            logger.error(f"❌ 加载投资组合历史数据失败: {e}")
    
    async def _save_portfolio_data(self) -> None:
        """保存投资组合数据"""
        try:
            # 这里应该保存数据到数据库
            # 暂时跳过
            pass
        except Exception as e:
            logger.error(f"❌ 保存投资组合数据失败: {e}")