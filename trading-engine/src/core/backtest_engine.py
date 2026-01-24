#!/usr/bin/env python3
"""
Backtest Engine Module
回测引擎模块
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import json
import uuid

import pandas as pd
import numpy as np
from loguru import logger
import backtrader as bt
from scipy import stats

from ..utils.config import Config
from ..data.market_data import MarketDataProvider
from ..utils.database import DatabaseManager
from ..models.strategy import BacktestResult, Trade, Position


@dataclass
class BacktestMetrics:
    """回测指标"""
    total_return: float = 0.0
    annual_return: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
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
    volatility: float = 0.0
    calmar_ratio: float = 0.0
    var_95: float = 0.0  # 95% Value at Risk
    cvar_95: float = 0.0  # 95% Conditional Value at Risk


class BacktestStrategy(bt.Strategy):
    """Backtrader策略包装器"""
    
    def __init__(self):
        super().__init__()
        self.trades_data = []
        self.positions_data = []
        self.custom_code = None
        self.custom_params = {}
        
    def set_custom_strategy(self, code: str, params: Dict[str, Any]):
        """设置自定义策略代码"""
        self.custom_code = code
        self.custom_params = params
        
        # 执行自定义初始化代码
        if hasattr(self, 'custom_init'):
            self.custom_init()
    
    def next(self):
        """策略主逻辑"""
        try:
            # 执行自定义策略逻辑
            if hasattr(self, 'custom_next'):
                self.custom_next()
        except Exception as e:
            logger.error(f"策略执行错误: {e}")
    
    def notify_trade(self, trade):
        """交易通知"""
        if trade.isclosed:
            trade_data = {
                'id': str(uuid.uuid4()),
                'symbol': trade.data._name,
                'side': 'buy' if trade.size > 0 else 'sell',
                'size': abs(trade.size),
                'entry_price': trade.price,
                'exit_price': trade.price,
                'entry_time': bt.num2date(trade.dtopen),
                'exit_time': bt.num2date(trade.dtclose),
                'pnl': trade.pnl,
                'commission': trade.commission
            }
            self.trades_data.append(trade_data)
    
    def notify_order(self, order):
        """订单通知"""
        if order.status in [order.Completed]:
            logger.debug(f"订单完成: {order.data._name} {order.size} @ {order.executed.price}")


class BacktestEngine:
    """回测引擎"""
    
    def __init__(
        self,
        config: Config,
        market_data: MarketDataProvider,
        db_manager: DatabaseManager
    ):
        self.config = config
        self.market_data = market_data
        self.db_manager = db_manager
        
        # 回测配置
        self.default_commission = 0.001  # 0.1% 手续费
        self.default_slippage = 0.0001   # 0.01% 滑点
        
        logger.info("🔧 回测引擎初始化完成")
    
    async def run_backtest(
        self,
        strategy_code: str,
        start_date: datetime,
        end_date: datetime,
        initial_capital: float = 100000.0,
        symbols: List[str] = None,
        parameters: Dict[str, Any] = None,
        commission: float = None,
        slippage: float = None
    ) -> BacktestResult:
        """运行回测"""
        try:
            logger.info(f"🎯 开始回测: {start_date} - {end_date}")
            
            # 设置默认参数
            if symbols is None:
                symbols = ['AAPL']  # 默认使用苹果股票
            if parameters is None:
                parameters = {}
            if commission is None:
                commission = self.default_commission
            if slippage is None:
                slippage = self.default_slippage
            
            # 创建Backtrader引擎
            cerebro = bt.Cerebro()
            
            # 设置初始资金
            cerebro.broker.setcash(initial_capital)
            
            # 设置手续费和滑点
            cerebro.broker.setcommission(commission=commission)
            
            # 添加数据源
            for symbol in symbols:
                data = await self._get_backtest_data(symbol, start_date, end_date)
                if data is not None and not data.empty:
                    bt_data = self._create_backtrader_data(data, symbol)
                    cerebro.adddata(bt_data)
            
            # 添加策略
            strategy_class = self._create_strategy_class(strategy_code, parameters)
            cerebro.addstrategy(strategy_class)
            
            # 添加分析器
            cerebro.addanalyzer(bt.analyzers.Returns, _name='returns')
            cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name='sharpe')
            cerebro.addanalyzer(bt.analyzers.DrawDown, _name='drawdown')
            cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name='trades')
            cerebro.addanalyzer(bt.analyzers.SQN, _name='sqn')
            
            # 运行回测
            logger.info("🚀 执行回测...")
            results = cerebro.run()
            
            if not results:
                raise ValueError("回测执行失败，没有返回结果")
            
            strategy_result = results[0]
            
            # 计算指标
            metrics = await self._calculate_metrics(
                strategy_result,
                initial_capital,
                start_date,
                end_date
            )
            
            # 创建回测结果
            backtest_result = BacktestResult(
                id=str(uuid.uuid4()),
                strategy_code=strategy_code,
                start_date=start_date,
                end_date=end_date,
                initial_capital=initial_capital,
                final_capital=cerebro.broker.getvalue(),
                symbols=symbols,
                parameters=parameters,
                metrics=asdict(metrics),
                trades=strategy_result.trades_data if hasattr(strategy_result, 'trades_data') else [],
                equity_curve=await self._generate_equity_curve(strategy_result),
                created_at=datetime.now()
            )
            
            # 保存回测结果
            await self._save_backtest_result(backtest_result)
            
            logger.info(f"✅ 回测完成，总收益: {metrics.total_return:.2%}")
            return backtest_result
            
        except Exception as e:
            logger.error(f"❌ 回测执行失败: {e}")
            raise
    
    async def get_backtest_result(self, backtest_id: str) -> Optional[BacktestResult]:
        """获取回测结果"""
        try:
            result_data = await self.db_manager.get_backtest_result(backtest_id)
            if result_data:
                return BacktestResult(**result_data)
            return None
        except Exception as e:
            logger.error(f"❌ 获取回测结果失败: {e}")
            return None
    
    async def list_backtest_results(
        self,
        strategy_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[BacktestResult]:
        """列出回测结果"""
        try:
            results_data = await self.db_manager.list_backtest_results(
                strategy_id, limit, offset
            )
            return [BacktestResult(**data) for data in results_data]
        except Exception as e:
            logger.error(f"❌ 列出回测结果失败: {e}")
            return []
    
    async def compare_strategies(
        self,
        backtest_ids: List[str]
    ) -> Dict[str, Any]:
        """比较多个策略的回测结果"""
        try:
            results = []
            for backtest_id in backtest_ids:
                result = await self.get_backtest_result(backtest_id)
                if result:
                    results.append(result)
            
            if not results:
                return {"error": "没有找到有效的回测结果"}
            
            # 生成比较报告
            comparison = {
                "strategies": [],
                "summary": {
                    "best_return": None,
                    "best_sharpe": None,
                    "lowest_drawdown": None,
                    "highest_win_rate": None
                }
            }
            
            best_return = float('-inf')
            best_sharpe = float('-inf')
            lowest_drawdown = float('inf')
            highest_win_rate = 0.0
            
            for result in results:
                metrics = result.metrics
                strategy_info = {
                    "id": result.id,
                    "total_return": metrics.get('total_return', 0),
                    "sharpe_ratio": metrics.get('sharpe_ratio', 0),
                    "max_drawdown": metrics.get('max_drawdown', 0),
                    "win_rate": metrics.get('win_rate', 0),
                    "total_trades": metrics.get('total_trades', 0)
                }
                comparison["strategies"].append(strategy_info)
                
                # 更新最佳指标
                if strategy_info["total_return"] > best_return:
                    best_return = strategy_info["total_return"]
                    comparison["summary"]["best_return"] = result.id
                
                if strategy_info["sharpe_ratio"] > best_sharpe:
                    best_sharpe = strategy_info["sharpe_ratio"]
                    comparison["summary"]["best_sharpe"] = result.id
                
                if strategy_info["max_drawdown"] < lowest_drawdown:
                    lowest_drawdown = strategy_info["max_drawdown"]
                    comparison["summary"]["lowest_drawdown"] = result.id
                
                if strategy_info["win_rate"] > highest_win_rate:
                    highest_win_rate = strategy_info["win_rate"]
                    comparison["summary"]["highest_win_rate"] = result.id
            
            return comparison
            
        except Exception as e:
            logger.error(f"❌ 策略比较失败: {e}")
            return {"error": str(e)}
    
    async def _get_backtest_data(
        self,
        symbol: str,
        start_date: datetime,
        end_date: datetime
    ) -> Optional[pd.DataFrame]:
        """获取回测数据"""
        try:
            # 从市场数据提供者获取历史数据
            data = await self.market_data.get_historical_data(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                timeframe='1d'
            )
            
            if data is None or data.empty:
                logger.warning(f"没有获取到 {symbol} 的历史数据")
                return None
            
            # 确保数据格式正确
            required_columns = ['open', 'high', 'low', 'close', 'volume']
            for col in required_columns:
                if col not in data.columns:
                    logger.error(f"缺少必需的数据列: {col}")
                    return None
            
            return data
            
        except Exception as e:
            logger.error(f"❌ 获取回测数据失败 {symbol}: {e}")
            return None
    
    def _create_backtrader_data(self, data: pd.DataFrame, symbol: str):
        """创建Backtrader数据源"""
        try:
            # 确保索引是日期时间格式
            if not isinstance(data.index, pd.DatetimeIndex):
                data.index = pd.to_datetime(data.index)
            
            # 创建Backtrader数据源
            bt_data = bt.feeds.PandasData(
                dataname=data,
                name=symbol,
                openinterest=None
            )
            
            return bt_data
            
        except Exception as e:
            logger.error(f"❌ 创建Backtrader数据源失败: {e}")
            raise
    
    def _create_strategy_class(self, strategy_code: str, parameters: Dict[str, Any]):
        """创建策略类"""
        try:
            # 创建动态策略类
            class DynamicStrategy(BacktestStrategy):
                def __init__(self):
                    super().__init__()
                    self.set_custom_strategy(strategy_code, parameters)
                    
                    # 执行自定义初始化代码
                    try:
                        # 创建安全的执行环境
                        exec_globals = {
                            'self': self,
                            'bt': bt,
                            'pd': pd,
                            'np': np,
                            'logger': logger,
                            'parameters': parameters
                        }
                        
                        # 执行策略代码
                        exec(strategy_code, exec_globals)
                        
                        # 如果策略代码定义了init函数，调用它
                        if 'init' in exec_globals:
                            exec_globals['init']()
                            
                    except Exception as e:
                        logger.error(f"策略初始化失败: {e}")
                        raise
                
                def next(self):
                    try:
                        # 创建安全的执行环境
                        exec_globals = {
                            'self': self,
                            'bt': bt,
                            'pd': pd,
                            'np': np,
                            'logger': logger,
                            'parameters': parameters,
                            'data': self.data,
                            'position': self.position
                        }
                        
                        # 执行策略代码中的next函数
                        exec(strategy_code, exec_globals)
                        
                        if 'next' in exec_globals:
                            exec_globals['next']()
                            
                    except Exception as e:
                        logger.error(f"策略执行失败: {e}")
            
            return DynamicStrategy
            
        except Exception as e:
            logger.error(f"❌ 创建策略类失败: {e}")
            raise
    
    async def _calculate_metrics(
        self,
        strategy_result,
        initial_capital: float,
        start_date: datetime,
        end_date: datetime
    ) -> BacktestMetrics:
        """计算回测指标"""
        try:
            metrics = BacktestMetrics()
            
            # 获取分析器结果
            returns_analyzer = strategy_result.analyzers.returns.get_analysis()
            sharpe_analyzer = strategy_result.analyzers.sharpe.get_analysis()
            drawdown_analyzer = strategy_result.analyzers.drawdown.get_analysis()
            trades_analyzer = strategy_result.analyzers.trades.get_analysis()
            
            # 基本收益指标
            final_value = strategy_result.broker.getvalue()
            metrics.total_return = (final_value - initial_capital) / initial_capital
            
            # 年化收益率
            days = (end_date - start_date).days
            if days > 0:
                metrics.annual_return = (1 + metrics.total_return) ** (365.25 / days) - 1
            
            # 夏普比率
            if 'sharperatio' in sharpe_analyzer:
                metrics.sharpe_ratio = sharpe_analyzer['sharperatio'] or 0.0
            
            # 最大回撤
            if 'max' in drawdown_analyzer and 'drawdown' in drawdown_analyzer['max']:
                metrics.max_drawdown = drawdown_analyzer['max']['drawdown'] / 100.0
            
            # 交易统计
            if 'total' in trades_analyzer and 'total' in trades_analyzer['total']:
                metrics.total_trades = trades_analyzer['total']['total']
                
            if 'won' in trades_analyzer and 'total' in trades_analyzer['won']:
                metrics.winning_trades = trades_analyzer['won']['total']
                
            if 'lost' in trades_analyzer and 'total' in trades_analyzer['lost']:
                metrics.losing_trades = trades_analyzer['lost']['total']
            
            # 胜率
            if metrics.total_trades > 0:
                metrics.win_rate = metrics.winning_trades / metrics.total_trades
            
            # 平均盈亏
            if 'won' in trades_analyzer and 'pnl' in trades_analyzer['won'] and 'average' in trades_analyzer['won']['pnl']:
                metrics.avg_win = trades_analyzer['won']['pnl']['average']
                
            if 'lost' in trades_analyzer and 'pnl' in trades_analyzer['lost'] and 'average' in trades_analyzer['lost']['pnl']:
                metrics.avg_loss = trades_analyzer['lost']['pnl']['average']
            
            # 最大单笔盈亏
            if 'won' in trades_analyzer and 'pnl' in trades_analyzer['won'] and 'max' in trades_analyzer['won']['pnl']:
                metrics.largest_win = trades_analyzer['won']['pnl']['max']
                
            if 'lost' in trades_analyzer and 'pnl' in trades_analyzer['lost'] and 'max' in trades_analyzer['lost']['pnl']:
                metrics.largest_loss = trades_analyzer['lost']['pnl']['max']
            
            # 盈亏比
            if metrics.avg_loss != 0:
                metrics.profit_factor = abs(metrics.avg_win / metrics.avg_loss)
            
            # Calmar比率
            if metrics.max_drawdown != 0:
                metrics.calmar_ratio = metrics.annual_return / metrics.max_drawdown
            
            return metrics
            
        except Exception as e:
            logger.error(f"❌ 计算回测指标失败: {e}")
            return BacktestMetrics()
    
    async def _generate_equity_curve(self, strategy_result) -> List[Dict[str, Any]]:
        """生成权益曲线"""
        try:
            equity_curve = []
            
            # 从策略结果中提取权益数据
            # 这里需要根据实际的Backtrader结果结构来实现
            # 暂时返回空列表
            
            return equity_curve
            
        except Exception as e:
            logger.error(f"❌ 生成权益曲线失败: {e}")
            return []
    
    async def _save_backtest_result(self, result: BacktestResult) -> None:
        """保存回测结果"""
        try:
            await self.db_manager.save_backtest_result(asdict(result))
            logger.info(f"✅ 回测结果已保存: {result.id}")
        except Exception as e:
            logger.error(f"❌ 保存回测结果失败: {e}")
            raise