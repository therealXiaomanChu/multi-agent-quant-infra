#!/usr/bin/env python3
"""
Risk Manager Module
风险管理器模块
"""

import asyncio
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum

import pandas as pd
import numpy as np
from loguru import logger

from ..utils.config import Config
from ..models.strategy import Strategy, Position, Trade


class RiskLevel(Enum):
    """风险等级"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class RiskCheckResult:
    """风险检查结果"""
    approved: bool
    risk_level: RiskLevel
    reason: str
    recommendations: List[str]
    metrics: Dict[str, float]


@dataclass
class RiskMetrics:
    """风险指标"""
    var_95: float = 0.0  # 95% VaR
    cvar_95: float = 0.0  # 95% CVaR
    max_drawdown: float = 0.0
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    volatility: float = 0.0
    beta: float = 0.0
    correlation: float = 0.0
    leverage: float = 0.0
    concentration_risk: float = 0.0


class RiskManager:
    """风险管理器"""
    
    def __init__(self, config: Config):
        self.config = config
        
        # 风险限制
        self.max_drawdown_limit = config.max_drawdown_limit
        self.max_position_size = config.max_position_size
        self.max_daily_loss = config.max_daily_loss
        self.max_leverage = config.max_leverage
        self.risk_free_rate = config.risk_free_rate
        
        # 风险监控数据
        self.daily_pnl_history: Dict[str, List[float]] = {}
        self.position_history: Dict[str, List[Dict[str, Any]]] = {}
        self.risk_alerts: List[Dict[str, Any]] = []
        
        logger.info("🔧 风险管理器初始化完成")
    
    async def initialize(self) -> None:
        """初始化风险管理器"""
        try:
            logger.info("🚀 初始化风险管理器...")
            
            # 加载历史风险数据
            await self._load_risk_history()
            
            logger.info("✅ 风险管理器初始化成功")
            
        except Exception as e:
            logger.error(f"❌ 风险管理器初始化失败: {e}")
            raise
    
    async def shutdown(self) -> None:
        """关闭风险管理器"""
        try:
            logger.info("🛑 关闭风险管理器...")
            
            # 保存风险数据
            await self._save_risk_history()
            
            logger.info("✅ 风险管理器已关闭")
            
        except Exception as e:
            logger.error(f"❌ 关闭风险管理器失败: {e}")
    
    async def check_strategy_risk(self, strategy: Strategy) -> RiskCheckResult:
        """检查策略风险"""
        try:
            logger.debug(f"🔍 检查策略风险: {strategy.name}")
            
            # 计算风险指标
            metrics = await self._calculate_risk_metrics(strategy)
            
            # 执行风险检查
            checks = [
                self._check_drawdown_risk(metrics),
                self._check_position_size_risk(strategy),
                self._check_leverage_risk(strategy),
                self._check_concentration_risk(strategy),
                self._check_volatility_risk(metrics)
            ]
            
            # 汇总检查结果
            failed_checks = [check for check in checks if not check.approved]
            
            if failed_checks:
                # 有风险检查失败
                highest_risk = max(failed_checks, key=lambda x: x.risk_level.value)
                return RiskCheckResult(
                    approved=False,
                    risk_level=highest_risk.risk_level,
                    reason=highest_risk.reason,
                    recommendations=sum([check.recommendations for check in failed_checks], []),
                    metrics=metrics.__dict__
                )
            else:
                # 所有检查通过
                return RiskCheckResult(
                    approved=True,
                    risk_level=RiskLevel.LOW,
                    reason="所有风险检查通过",
                    recommendations=[],
                    metrics=metrics.__dict__
                )
            
        except Exception as e:
            logger.error(f"❌ 策略风险检查失败: {e}")
            return RiskCheckResult(
                approved=False,
                risk_level=RiskLevel.CRITICAL,
                reason=f"风险检查异常: {str(e)}",
                recommendations=["请检查策略配置和数据"],
                metrics={}
            )
    
    async def monitor_real_time_risk(self, strategy: Strategy) -> List[Dict[str, Any]]:
        """实时风险监控"""
        try:
            alerts = []
            
            # 检查当日损失
            daily_pnl = self._calculate_daily_pnl(strategy)
            if daily_pnl < -self.max_daily_loss * 100000:  # 假设初始资金10万
                alerts.append({
                    'type': 'daily_loss_limit',
                    'severity': 'high',
                    'message': f'当日损失超过限制: {daily_pnl:.2f}',
                    'timestamp': datetime.now()
                })
            
            # 检查最大回撤
            current_drawdown = self._calculate_current_drawdown(strategy)
            if current_drawdown > self.max_drawdown_limit:
                alerts.append({
                    'type': 'max_drawdown_exceeded',
                    'severity': 'critical',
                    'message': f'最大回撤超过限制: {current_drawdown:.2%}',
                    'timestamp': datetime.now()
                })
            
            # 检查持仓集中度
            concentration = self._calculate_concentration_risk(strategy)
            if concentration > 0.5:  # 50%集中度警告
                alerts.append({
                    'type': 'concentration_risk',
                    'severity': 'medium',
                    'message': f'持仓过于集中: {concentration:.2%}',
                    'timestamp': datetime.now()
                })
            
            # 保存警报
            self.risk_alerts.extend(alerts)
            
            return alerts
            
        except Exception as e:
            logger.error(f"❌ 实时风险监控失败: {e}")
            return []
    
    async def _calculate_risk_metrics(self, strategy: Strategy) -> RiskMetrics:
        """计算风险指标"""
        try:
            metrics = RiskMetrics()
            
            if not strategy.trades:
                return metrics
            
            # 计算收益序列
            returns = [trade.pnl for trade in strategy.trades if trade.pnl is not None]
            if not returns:
                return metrics
            
            returns_array = np.array(returns)
            
            # 计算VaR和CVaR
            metrics.var_95 = np.percentile(returns_array, 5)
            metrics.cvar_95 = returns_array[returns_array <= metrics.var_95].mean()
            
            # 计算最大回撤
            cumulative_returns = np.cumsum(returns_array)
            running_max = np.maximum.accumulate(cumulative_returns)
            drawdowns = (cumulative_returns - running_max) / running_max
            metrics.max_drawdown = abs(np.min(drawdowns)) if len(drawdowns) > 0 else 0
            
            # 计算波动率
            metrics.volatility = np.std(returns_array) if len(returns_array) > 1 else 0
            
            # 计算夏普比率
            if metrics.volatility > 0:
                mean_return = np.mean(returns_array)
                metrics.sharpe_ratio = (mean_return - self.risk_free_rate) / metrics.volatility
            
            # 计算Sortino比率
            negative_returns = returns_array[returns_array < 0]
            if len(negative_returns) > 0:
                downside_deviation = np.std(negative_returns)
                if downside_deviation > 0:
                    metrics.sortino_ratio = (np.mean(returns_array) - self.risk_free_rate) / downside_deviation
            
            # 计算杠杆率
            metrics.leverage = self._calculate_leverage(strategy)
            
            # 计算集中度风险
            metrics.concentration_risk = self._calculate_concentration_risk(strategy)
            
            return metrics
            
        except Exception as e:
            logger.error(f"❌ 计算风险指标失败: {e}")
            return RiskMetrics()
    
    def _check_drawdown_risk(self, metrics: RiskMetrics) -> RiskCheckResult:
        """检查回撤风险"""
        if metrics.max_drawdown > self.max_drawdown_limit:
            return RiskCheckResult(
                approved=False,
                risk_level=RiskLevel.HIGH,
                reason=f"最大回撤超过限制: {metrics.max_drawdown:.2%} > {self.max_drawdown_limit:.2%}",
                recommendations=["减少仓位规模", "优化止损策略", "分散投资组合"],
                metrics={}
            )
        
        return RiskCheckResult(
            approved=True,
            risk_level=RiskLevel.LOW,
            reason="回撤风险检查通过",
            recommendations=[],
            metrics={}
        )
    
    def _check_position_size_risk(self, strategy: Strategy) -> RiskCheckResult:
        """检查仓位规模风险"""
        try:
            total_position_value = sum(abs(pos.size * pos.market_price) for pos in strategy.positions)
            # 假设总资金为10万
            total_capital = 100000
            position_ratio = total_position_value / total_capital
            
            if position_ratio > self.max_position_size:
                return RiskCheckResult(
                    approved=False,
                    risk_level=RiskLevel.MEDIUM,
                    reason=f"仓位规模超过限制: {position_ratio:.2%} > {self.max_position_size:.2%}",
                    recommendations=["减少持仓规模", "分批建仓"],
                    metrics={}
                )
            
            return RiskCheckResult(
                approved=True,
                risk_level=RiskLevel.LOW,
                reason="仓位规模检查通过",
                recommendations=[],
                metrics={}
            )
            
        except Exception as e:
            logger.error(f"❌ 仓位规模风险检查失败: {e}")
            return RiskCheckResult(
                approved=False,
                risk_level=RiskLevel.CRITICAL,
                reason=f"仓位检查异常: {str(e)}",
                recommendations=[],
                metrics={}
            )
    
    def _check_leverage_risk(self, strategy: Strategy) -> RiskCheckResult:
        """检查杠杆风险"""
        try:
            leverage = self._calculate_leverage(strategy)
            
            if leverage > self.max_leverage:
                return RiskCheckResult(
                    approved=False,
                    risk_level=RiskLevel.HIGH,
                    reason=f"杠杆率超过限制: {leverage:.2f} > {self.max_leverage:.2f}",
                    recommendations=["降低杠杆率", "增加保证金"],
                    metrics={}
                )
            
            return RiskCheckResult(
                approved=True,
                risk_level=RiskLevel.LOW,
                reason="杠杆风险检查通过",
                recommendations=[],
                metrics={}
            )
            
        except Exception as e:
            logger.error(f"❌ 杠杆风险检查失败: {e}")
            return RiskCheckResult(
                approved=True,  # 检查失败时默认通过
                risk_level=RiskLevel.LOW,
                reason="杠杆检查异常，默认通过",
                recommendations=[],
                metrics={}
            )
    
    def _check_concentration_risk(self, strategy: Strategy) -> RiskCheckResult:
        """检查集中度风险"""
        try:
            concentration = self._calculate_concentration_risk(strategy)
            
            if concentration > 0.6:  # 60%集中度限制
                return RiskCheckResult(
                    approved=False,
                    risk_level=RiskLevel.MEDIUM,
                    reason=f"持仓过于集中: {concentration:.2%}",
                    recommendations=["分散投资", "增加交易品种"],
                    metrics={}
                )
            
            return RiskCheckResult(
                approved=True,
                risk_level=RiskLevel.LOW,
                reason="集中度风险检查通过",
                recommendations=[],
                metrics={}
            )
            
        except Exception as e:
            logger.error(f"❌ 集中度风险检查失败: {e}")
            return RiskCheckResult(
                approved=True,
                risk_level=RiskLevel.LOW,
                reason="集中度检查异常，默认通过",
                recommendations=[],
                metrics={}
            )
    
    def _check_volatility_risk(self, metrics: RiskMetrics) -> RiskCheckResult:
        """检查波动率风险"""
        if metrics.volatility > 0.05:  # 5%波动率限制
            return RiskCheckResult(
                approved=False,
                risk_level=RiskLevel.MEDIUM,
                reason=f"波动率过高: {metrics.volatility:.2%}",
                recommendations=["降低仓位", "使用对冲策略"],
                metrics={}
            )
        
        return RiskCheckResult(
            approved=True,
            risk_level=RiskLevel.LOW,
            reason="波动率风险检查通过",
            recommendations=[],
            metrics={}
        )
    
    def _calculate_leverage(self, strategy: Strategy) -> float:
        """计算杠杆率"""
        try:
            if not strategy.positions:
                return 0.0
            
            total_position_value = sum(abs(pos.size * pos.market_price) for pos in strategy.positions)
            # 假设总资金为10万
            total_capital = 100000
            
            return total_position_value / total_capital if total_capital > 0 else 0.0
            
        except Exception as e:
            logger.error(f"❌ 计算杠杆率失败: {e}")
            return 0.0
    
    def _calculate_concentration_risk(self, strategy: Strategy) -> float:
        """计算集中度风险"""
        try:
            if not strategy.positions:
                return 0.0
            
            position_values = [abs(pos.size * pos.market_price) for pos in strategy.positions]
            total_value = sum(position_values)
            
            if total_value == 0:
                return 0.0
            
            # 计算最大单一持仓占比
            max_position_ratio = max(position_values) / total_value
            return max_position_ratio
            
        except Exception as e:
            logger.error(f"❌ 计算集中度风险失败: {e}")
            return 0.0
    
    def _calculate_daily_pnl(self, strategy: Strategy) -> float:
        """计算当日盈亏"""
        try:
            today = datetime.now().date()
            daily_trades = [
                trade for trade in strategy.trades 
                if trade.entry_time and trade.entry_time.date() == today and trade.pnl is not None
            ]
            
            return sum(trade.pnl for trade in daily_trades)
            
        except Exception as e:
            logger.error(f"❌ 计算当日盈亏失败: {e}")
            return 0.0
    
    def _calculate_current_drawdown(self, strategy: Strategy) -> float:
        """计算当前回撤"""
        try:
            if not strategy.trades:
                return 0.0
            
            returns = [trade.pnl for trade in strategy.trades if trade.pnl is not None]
            if not returns:
                return 0.0
            
            cumulative_pnl = np.cumsum(returns)
            running_max = np.maximum.accumulate(cumulative_pnl)
            current_drawdown = (cumulative_pnl[-1] - running_max[-1]) / running_max[-1]
            
            return abs(current_drawdown)
            
        except Exception as e:
            logger.error(f"❌ 计算当前回撤失败: {e}")
            return 0.0
    
    async def _load_risk_history(self) -> None:
        """加载风险历史数据"""
        try:
            # 这里应该从数据库加载历史风险数据
            # 暂时跳过
            pass
        except Exception as e:
            logger.error(f"❌ 加载风险历史数据失败: {e}")
    
    async def _save_risk_history(self) -> None:
        """保存风险历史数据"""
        try:
            # 这里应该保存风险数据到数据库
            # 暂时跳过
            pass
        except Exception as e:
            logger.error(f"❌ 保存风险历史数据失败: {e}")