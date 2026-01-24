#!/usr/bin/env python3
"""
Strategy Models Module
策略模型模块
"""

from typing import Dict, List, Any, Optional, Union
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
from pydantic import BaseModel, Field
import uuid


class StrategyStatus(Enum):
    """策略状态枚举"""
    PENDING = "pending"
    STARTING = "starting"
    RUNNING = "running"
    PAUSED = "paused"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"
    COMPLETED = "completed"


class OrderSide(Enum):
    """订单方向"""
    BUY = "buy"
    SELL = "sell"


class OrderType(Enum):
    """订单类型"""
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderStatus(Enum):
    """订单状态"""
    PENDING = "pending"
    OPEN = "open"
    FILLED = "filled"
    PARTIALLY_FILLED = "partially_filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


@dataclass
class Trade:
    """交易记录"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    strategy_id: str = ""
    symbol: str = ""
    side: OrderSide = OrderSide.BUY
    size: float = 0.0
    entry_price: float = 0.0
    exit_price: Optional[float] = None
    entry_time: datetime = field(default_factory=datetime.now)
    exit_time: Optional[datetime] = None
    pnl: Optional[float] = None
    commission: float = 0.0
    slippage: float = 0.0
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Position:
    """持仓信息"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    strategy_id: str = ""
    symbol: str = ""
    size: float = 0.0  # 正数为多头，负数为空头
    avg_price: float = 0.0
    market_price: float = 0.0
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def market_value(self) -> float:
        """市值"""
        return abs(self.size) * self.market_price
    
    @property
    def is_long(self) -> bool:
        """是否为多头"""
        return self.size > 0
    
    @property
    def is_short(self) -> bool:
        """是否为空头"""
        return self.size < 0


@dataclass
class Order:
    """订单信息"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    strategy_id: str = ""
    symbol: str = ""
    side: OrderSide = OrderSide.BUY
    type: OrderType = OrderType.MARKET
    size: float = 0.0
    price: Optional[float] = None
    stop_price: Optional[float] = None
    status: OrderStatus = OrderStatus.PENDING
    filled_size: float = 0.0
    avg_fill_price: float = 0.0
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    filled_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def remaining_size(self) -> float:
        """剩余数量"""
        return self.size - self.filled_size
    
    @property
    def is_filled(self) -> bool:
        """是否完全成交"""
        return self.status == OrderStatus.FILLED
    
    @property
    def is_active(self) -> bool:
        """是否为活跃订单"""
        return self.status in [OrderStatus.PENDING, OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]


@dataclass
class Strategy:
    """策略信息"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    code: str = ""
    language: str = "python"
    parameters: Dict[str, Any] = field(default_factory=dict)
    status: StrategyStatus = StrategyStatus.PENDING
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    
    # 交易数据
    trades: List[Trade] = field(default_factory=list)
    positions: List[Position] = field(default_factory=list)
    orders: List[Order] = field(default_factory=list)
    
    # 性能指标
    total_pnl: float = 0.0
    win_rate: float = 0.0
    max_drawdown: float = 0.0
    sharpe_ratio: float = 0.0
    
    # 风险控制
    max_position_size: float = 0.1  # 最大仓位比例
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    
    # 其他信息
    symbols: List[str] = field(default_factory=list)
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def add_trade(self, trade: Trade) -> None:
        """添加交易记录"""
        trade.strategy_id = self.id
        self.trades.append(trade)
    
    def add_position(self, position: Position) -> None:
        """添加持仓"""
        position.strategy_id = self.id
        self.positions.append(position)
    
    def add_order(self, order: Order) -> None:
        """添加订单"""
        order.strategy_id = self.id
        self.orders.append(order)
    
    def get_position(self, symbol: str) -> Optional[Position]:
        """获取指定交易对的持仓"""
        for position in self.positions:
            if position.symbol == symbol:
                return position
        return None
    
    def get_active_orders(self, symbol: Optional[str] = None) -> List[Order]:
        """获取活跃订单"""
        active_orders = [order for order in self.orders if order.is_active]
        if symbol:
            active_orders = [order for order in active_orders if order.symbol == symbol]
        return active_orders


@dataclass
class BacktestResult:
    """回测结果"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    strategy_code: str = ""
    start_date: datetime = field(default_factory=datetime.now)
    end_date: datetime = field(default_factory=datetime.now)
    initial_capital: float = 100000.0
    final_capital: float = 100000.0
    symbols: List[str] = field(default_factory=list)
    parameters: Dict[str, Any] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)
    trades: List[Dict[str, Any]] = field(default_factory=list)
    equity_curve: List[Dict[str, Any]] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    
    @property
    def total_return(self) -> float:
        """总收益率"""
        if self.initial_capital == 0:
            return 0.0
        return (self.final_capital - self.initial_capital) / self.initial_capital
    
    @property
    def duration_days(self) -> int:
        """回测天数"""
        return (self.end_date - self.start_date).days


# Pydantic模型用于API请求/响应
class StrategyRequest(BaseModel):
    """策略执行请求"""
    strategy_id: str = Field(..., description="策略ID")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="策略参数")
    symbols: Optional[List[str]] = Field(default_factory=list, description="交易对列表")
    max_position_size: Optional[float] = Field(0.1, description="最大仓位比例")
    stop_loss: Optional[float] = Field(None, description="止损比例")
    take_profit: Optional[float] = Field(None, description="止盈比例")


class BacktestRequest(BaseModel):
    """回测请求"""
    strategy_code: str = Field(..., description="策略代码")
    start_date: datetime = Field(..., description="开始日期")
    end_date: datetime = Field(..., description="结束日期")
    initial_capital: float = Field(100000.0, description="初始资金")
    symbols: List[str] = Field(default_factory=lambda: ['AAPL'], description="交易对列表")
    parameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="策略参数")
    commission: Optional[float] = Field(0.001, description="手续费率")
    slippage: Optional[float] = Field(0.0001, description="滑点")


class OrderRequest(BaseModel):
    """下单请求"""
    strategy_id: str = Field(..., description="策略ID")
    symbol: str = Field(..., description="交易对")
    side: OrderSide = Field(..., description="买卖方向")
    type: OrderType = Field(OrderType.MARKET, description="订单类型")
    size: float = Field(..., description="数量")
    price: Optional[float] = Field(None, description="价格")
    stop_price: Optional[float] = Field(None, description="止损价格")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="元数据")


class PositionResponse(BaseModel):
    """持仓响应"""
    id: str
    strategy_id: str
    symbol: str
    size: float
    avg_price: float
    market_price: float
    unrealized_pnl: float
    realized_pnl: float
    market_value: float
    is_long: bool
    is_short: bool
    created_at: datetime
    updated_at: datetime


class TradeResponse(BaseModel):
    """交易响应"""
    id: str
    strategy_id: str
    symbol: str
    side: OrderSide
    size: float
    entry_price: float
    exit_price: Optional[float]
    entry_time: datetime
    exit_time: Optional[datetime]
    pnl: Optional[float]
    commission: float
    slippage: float


class StrategyStatusResponse(BaseModel):
    """策略状态响应"""
    id: str
    name: str
    status: StrategyStatus
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    total_trades: int
    open_positions: int
    total_pnl: float
    win_rate: float
    max_drawdown: float
    sharpe_ratio: float
    error_message: Optional[str]
    last_update: datetime


class BacktestResultResponse(BaseModel):
    """回测结果响应"""
    id: str
    start_date: datetime
    end_date: datetime
    initial_capital: float
    final_capital: float
    total_return: float
    duration_days: int
    symbols: List[str]
    metrics: Dict[str, Any]
    trade_count: int
    created_at: datetime