#!/usr/bin/env python3
"""
Market Data Provider Module
市场数据提供者模块
"""

import asyncio
from typing import Dict, List, Any, Optional, Union
from datetime import datetime, timedelta
from dataclasses import dataclass
import json

import pandas as pd
import numpy as np
from loguru import logger
import yfinance as yf
import ccxt
import aiohttp
import websockets
from redis import Redis

from ..utils.config import Config


@dataclass
class MarketTick:
    """市场tick数据"""
    symbol: str
    timestamp: datetime
    price: float
    volume: float
    bid: Optional[float] = None
    ask: Optional[float] = None
    bid_size: Optional[float] = None
    ask_size: Optional[float] = None


@dataclass
class OHLCV:
    """OHLCV数据"""
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class MarketDataProvider:
    """市场数据提供者"""
    
    def __init__(self, config: Config):
        self.config = config
        self.redis_client: Optional[Redis] = None
        
        # 数据源配置
        self.data_sources = {
            'stocks': 'yfinance',  # 股票数据使用yfinance
            'crypto': 'binance',   # 加密货币使用币安
            'forex': 'oanda'       # 外汇使用OANDA
        }
        
        # 加密货币交易所
        self.crypto_exchanges = {}
        
        # 数据缓存
        self.data_cache: Dict[str, pd.DataFrame] = {}
        self.tick_cache: Dict[str, List[MarketTick]] = {}
        
        # WebSocket连接
        self.ws_connections: Dict[str, Any] = {}
        self.ws_tasks: Dict[str, asyncio.Task] = {}
        
        # 订阅的交易对
        self.subscribed_symbols: set = set()
        
        logger.info("🔧 市场数据提供者初始化完成")
    
    async def initialize(self) -> None:
        """初始化数据提供者"""
        try:
            logger.info("🚀 初始化市场数据提供者...")
            
            # 初始化Redis连接
            if self.config.redis_url:
                self.redis_client = Redis.from_url(self.config.redis_url)
                await self._test_redis_connection()
            
            # 初始化加密货币交易所
            await self._initialize_crypto_exchanges()
            
            logger.info("✅ 市场数据提供者初始化成功")
            
        except Exception as e:
            logger.error(f"❌ 市场数据提供者初始化失败: {e}")
            raise
    
    async def close(self) -> None:
        """关闭数据提供者"""
        try:
            logger.info("🛑 关闭市场数据提供者...")
            
            # 关闭WebSocket连接
            for task in self.ws_tasks.values():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            
            # 关闭交易所连接
            for exchange in self.crypto_exchanges.values():
                if hasattr(exchange, 'close'):
                    await exchange.close()
            
            # 关闭Redis连接
            if self.redis_client:
                self.redis_client.close()
            
            logger.info("✅ 市场数据提供者已关闭")
            
        except Exception as e:
            logger.error(f"❌ 关闭市场数据提供者失败: {e}")
    
    async def get_historical_data(
        self,
        symbol: str,
        timeframe: str = '1d',
        limit: int = 100,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Optional[pd.DataFrame]:
        """获取历史数据"""
        try:
            logger.debug(f"获取历史数据: {symbol} {timeframe} {limit}")
            
            # 检查缓存
            cache_key = f"{symbol}_{timeframe}_{limit}"
            if cache_key in self.data_cache:
                cached_data = self.data_cache[cache_key]
                if not cached_data.empty and self._is_cache_valid(cached_data):
                    return cached_data
            
            # 根据交易对类型选择数据源
            data_source = self._get_data_source(symbol)
            
            if data_source == 'yfinance':
                data = await self._get_stock_data(symbol, timeframe, limit, start_date, end_date)
            elif data_source == 'binance':
                data = await self._get_crypto_data(symbol, timeframe, limit, start_date, end_date)
            else:
                logger.warning(f"不支持的数据源: {data_source}")
                return None
            
            if data is not None and not data.empty:
                # 缓存数据
                self.data_cache[cache_key] = data
                
                # 保存到Redis
                if self.redis_client:
                    await self._cache_to_redis(cache_key, data)
            
            return data
            
        except Exception as e:
            logger.error(f"❌ 获取历史数据失败 {symbol}: {e}")
            return None
    
    async def get_real_time_data(self, symbol: str) -> Optional[MarketTick]:
        """获取实时数据"""
        try:
            # 从tick缓存获取最新数据
            if symbol in self.tick_cache and self.tick_cache[symbol]:
                return self.tick_cache[symbol][-1]
            
            # 如果没有实时数据，获取最新的历史数据
            historical_data = await self.get_historical_data(symbol, '1m', 1)
            if historical_data is not None and not historical_data.empty:
                latest = historical_data.iloc[-1]
                return MarketTick(
                    symbol=symbol,
                    timestamp=latest.name,
                    price=latest['close'],
                    volume=latest['volume']
                )
            
            return None
            
        except Exception as e:
            logger.error(f"❌ 获取实时数据失败 {symbol}: {e}")
            return None
    
    async def subscribe_real_time(self, symbols: List[str]) -> None:
        """订阅实时数据"""
        try:
            logger.info(f"订阅实时数据: {symbols}")
            
            for symbol in symbols:
                if symbol not in self.subscribed_symbols:
                    self.subscribed_symbols.add(symbol)
                    
                    # 启动WebSocket连接
                    data_source = self._get_data_source(symbol)
                    if data_source == 'binance':
                        task = asyncio.create_task(self._subscribe_binance_ws(symbol))
                        self.ws_tasks[symbol] = task
            
            logger.info(f"✅ 已订阅 {len(symbols)} 个交易对的实时数据")
            
        except Exception as e:
            logger.error(f"❌ 订阅实时数据失败: {e}")
    
    async def unsubscribe_real_time(self, symbols: List[str]) -> None:
        """取消订阅实时数据"""
        try:
            for symbol in symbols:
                if symbol in self.subscribed_symbols:
                    self.subscribed_symbols.remove(symbol)
                    
                    # 取消WebSocket任务
                    if symbol in self.ws_tasks:
                        task = self.ws_tasks[symbol]
                        task.cancel()
                        try:
                            await task
                        except asyncio.CancelledError:
                            pass
                        del self.ws_tasks[symbol]
            
            logger.info(f"✅ 已取消订阅 {len(symbols)} 个交易对")
            
        except Exception as e:
            logger.error(f"❌ 取消订阅失败: {e}")
    
    async def update_data(self, symbols: List[str]) -> None:
        """更新数据"""
        try:
            # 批量更新历史数据
            tasks = []
            for symbol in symbols:
                task = asyncio.create_task(
                    self.get_historical_data(symbol, '1m', 100)
                )
                tasks.append(task)
            
            await asyncio.gather(*tasks, return_exceptions=True)
            
        except Exception as e:
            logger.error(f"❌ 更新数据失败: {e}")
    
    def is_connected(self) -> bool:
        """检查连接状态"""
        try:
            # 检查Redis连接
            if self.redis_client:
                self.redis_client.ping()
            
            # 检查交易所连接
            for exchange in self.crypto_exchanges.values():
                if hasattr(exchange, 'check_required_credentials'):
                    if not exchange.check_required_credentials():
                        return False
            
            return True
            
        except Exception:
            return False
    
    def _get_data_source(self, symbol: str) -> str:
        """根据交易对确定数据源"""
        symbol_upper = symbol.upper()
        
        # 加密货币
        if any(crypto in symbol_upper for crypto in ['BTC', 'ETH', 'BNB', 'ADA', 'DOT', 'USDT', 'USDC']):
            return 'binance'
        
        # 外汇
        if any(forex in symbol_upper for forex in ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD']):
            if len(symbol_upper) == 6:  # 外汇对格式如EURUSD
                return 'oanda'
        
        # 默认股票
        return 'yfinance'
    
    async def _get_stock_data(
        self,
        symbol: str,
        timeframe: str,
        limit: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Optional[pd.DataFrame]:
        """获取股票数据"""
        try:
            # 转换时间框架
            period_map = {
                '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
                '1h': '1h', '1d': '1d', '1w': '1wk', '1M': '1mo'
            }
            
            yf_timeframe = period_map.get(timeframe, '1d')
            
            # 创建ticker对象
            ticker = yf.Ticker(symbol)
            
            # 获取数据
            if start_date and end_date:
                data = ticker.history(
                    start=start_date,
                    end=end_date,
                    interval=yf_timeframe
                )
            else:
                # 计算时间范围
                if timeframe in ['1m', '5m', '15m', '30m']:
                    period = '7d'  # 分钟级数据最多7天
                elif timeframe == '1h':
                    period = '60d'  # 小时级数据最多60天
                else:
                    period = 'max'  # 日级以上数据获取最大范围
                
                data = ticker.history(
                    period=period,
                    interval=yf_timeframe
                )
            
            if data.empty:
                logger.warning(f"没有获取到股票数据: {symbol}")
                return None
            
            # 标准化列名
            data.columns = [col.lower() for col in data.columns]
            
            # 限制数据量
            if len(data) > limit:
                data = data.tail(limit)
            
            return data
            
        except Exception as e:
            logger.error(f"❌ 获取股票数据失败 {symbol}: {e}")
            return None
    
    async def _get_crypto_data(
        self,
        symbol: str,
        timeframe: str,
        limit: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Optional[pd.DataFrame]:
        """获取加密货币数据"""
        try:
            if 'binance' not in self.crypto_exchanges:
                logger.error("币安交易所未初始化")
                return None
            
            exchange = self.crypto_exchanges['binance']
            
            # 转换交易对格式
            if '/' not in symbol:
                # 假设是BTCUSDT格式，转换为BTC/USDT
                if symbol.endswith('USDT'):
                    base = symbol[:-4]
                    symbol = f"{base}/USDT"
                elif symbol.endswith('BTC'):
                    base = symbol[:-3]
                    symbol = f"{base}/BTC"
            
            # 获取OHLCV数据
            if start_date:
                since = int(start_date.timestamp() * 1000)
                ohlcv = await exchange.fetch_ohlcv(
                    symbol, timeframe, since=since, limit=limit
                )
            else:
                ohlcv = await exchange.fetch_ohlcv(
                    symbol, timeframe, limit=limit
                )
            
            if not ohlcv:
                logger.warning(f"没有获取到加密货币数据: {symbol}")
                return None
            
            # 转换为DataFrame
            df = pd.DataFrame(
                ohlcv,
                columns=['timestamp', 'open', 'high', 'low', 'close', 'volume']
            )
            
            # 转换时间戳
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            df.set_index('timestamp', inplace=True)
            
            return df
            
        except Exception as e:
            logger.error(f"❌ 获取加密货币数据失败 {symbol}: {e}")
            return None
    
    async def _initialize_crypto_exchanges(self) -> None:
        """初始化加密货币交易所"""
        try:
            # 初始化币安交易所
            self.crypto_exchanges['binance'] = ccxt.binance({
                'apiKey': self.config.binance_api_key,
                'secret': self.config.binance_secret_key,
                'sandbox': self.config.binance_sandbox,
                'enableRateLimit': True,
            })
            
            logger.info("✅ 加密货币交易所初始化成功")
            
        except Exception as e:
            logger.error(f"❌ 初始化加密货币交易所失败: {e}")
    
    async def _subscribe_binance_ws(self, symbol: str) -> None:
        """订阅币安WebSocket"""
        try:
            # 转换交易对格式为币安格式
            binance_symbol = symbol.replace('/', '').lower()
            ws_url = f"wss://stream.binance.com:9443/ws/{binance_symbol}@ticker"
            
            async with websockets.connect(ws_url) as websocket:
                logger.info(f"✅ 已连接币安WebSocket: {symbol}")
                
                while symbol in self.subscribed_symbols:
                    try:
                        message = await asyncio.wait_for(
                            websocket.recv(), timeout=30
                        )
                        
                        data = json.loads(message)
                        
                        # 创建tick数据
                        tick = MarketTick(
                            symbol=symbol,
                            timestamp=datetime.fromtimestamp(data['E'] / 1000),
                            price=float(data['c']),
                            volume=float(data['v']),
                            bid=float(data['b']),
                            ask=float(data['a'])
                        )
                        
                        # 缓存tick数据
                        if symbol not in self.tick_cache:
                            self.tick_cache[symbol] = []
                        
                        self.tick_cache[symbol].append(tick)
                        
                        # 限制缓存大小
                        if len(self.tick_cache[symbol]) > 1000:
                            self.tick_cache[symbol] = self.tick_cache[symbol][-500:]
                        
                    except asyncio.TimeoutError:
                        # 发送ping保持连接
                        await websocket.ping()
                    except Exception as e:
                        logger.error(f"❌ WebSocket数据处理错误 {symbol}: {e}")
                        break
                        
        except Exception as e:
            logger.error(f"❌ 币安WebSocket连接失败 {symbol}: {e}")
    
    async def _test_redis_connection(self) -> None:
        """测试Redis连接"""
        try:
            self.redis_client.ping()
            logger.info("✅ Redis连接测试成功")
        except Exception as e:
            logger.error(f"❌ Redis连接测试失败: {e}")
            raise
    
    async def _cache_to_redis(self, key: str, data: pd.DataFrame) -> None:
        """缓存数据到Redis"""
        try:
            if self.redis_client:
                # 将DataFrame转换为JSON
                data_json = data.to_json(orient='records', date_format='iso')
                
                # 设置过期时间为1小时
                self.redis_client.setex(
                    f"market_data:{key}",
                    3600,
                    data_json
                )
        except Exception as e:
            logger.error(f"❌ 缓存数据到Redis失败: {e}")
    
    def _is_cache_valid(self, data: pd.DataFrame) -> bool:
        """检查缓存是否有效"""
        try:
            if data.empty:
                return False
            
            # 检查数据是否过期（5分钟内的数据认为有效）
            latest_time = data.index[-1]
            if isinstance(latest_time, str):
                latest_time = pd.to_datetime(latest_time)
            
            time_diff = datetime.now() - latest_time.to_pydatetime()
            return time_diff < timedelta(minutes=5)
            
        except Exception:
            return False