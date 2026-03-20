#!/usr/bin/env python3
"""
Database Management Module
数据库管理模块
"""

import asyncio
from typing import Dict, List, Any, Optional, Union
from datetime import datetime, timedelta
import json

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from redis.asyncio import Redis
from loguru import logger

from .config import Config


class DatabaseManager:
    """数据库管理器"""
    
    def __init__(self, config: Config):
        self.config = config
        
        # MongoDB连接
        self.mongo_client: Optional[AsyncIOMotorClient] = None
        self.mongo_db: Optional[AsyncIOMotorDatabase] = None
        
        # Redis连接
        self.redis_client: Optional[Redis] = None
        
        # 集合引用
        self.collections: Dict[str, AsyncIOMotorCollection] = {}
        
        logger.info("🔧 数据库管理器初始化完成")
    
    async def connect(self) -> None:
        """连接数据库"""
        try:
            logger.info("🚀 连接数据库...")
            
            # 连接MongoDB
            await self._connect_mongodb()
            
            # 连接Redis
            await self._connect_redis()
            
            # 初始化集合
            await self._initialize_collections()
            
            # 创建索引
            await self._create_indexes()
            
            logger.info("✅ 数据库连接成功")
            
        except Exception as e:
            logger.error(f"❌ 数据库连接失败: {e}")
            raise
    
    async def disconnect(self) -> None:
        """断开数据库连接"""
        try:
            logger.info("🛑 断开数据库连接...")
            
            # 关闭Redis连接
            if self.redis_client:
                await self.redis_client.close()
            
            # 关闭MongoDB连接
            if self.mongo_client:
                self.mongo_client.close()
            
            logger.info("✅ 数据库连接已断开")
            
        except Exception as e:
            logger.error(f"❌ 断开数据库连接失败: {e}")
    
    async def is_connected(self) -> bool:
        """检查数据库连接状态"""
        try:
            # 检查MongoDB连接
            if self.mongo_client:
                await self.mongo_client.admin.command('ping')
            
            # 检查Redis连接
            if self.redis_client:
                await self.redis_client.ping()
            
            return True
            
        except Exception:
            return False
    
    # MongoDB操作方法
    async def save_strategy_result(self, result: Dict[str, Any]) -> str:
        """保存策略结果"""
        try:
            collection = self.collections['strategy_results']
            
            # 添加时间戳
            result['created_at'] = datetime.now()
            result['updated_at'] = datetime.now()
            
            # 插入或更新
            await collection.replace_one(
                {'id': result['id']},
                result,
                upsert=True
            )
            
            logger.debug(f"✅ 策略结果已保存: {result['id']}")
            return result['id']
            
        except Exception as e:
            logger.error(f"❌ 保存策略结果失败: {e}")
            raise
    
    async def get_strategy_result(self, strategy_id: str) -> Optional[Dict[str, Any]]:
        """获取策略结果"""
        try:
            collection = self.collections['strategy_results']
            result = await collection.find_one({'id': strategy_id})
            
            if result:
                # 移除MongoDB的_id字段
                result.pop('_id', None)
            
            return result
            
        except Exception as e:
            logger.error(f"❌ 获取策略结果失败: {e}")
            return None
    
    async def save_backtest_result(self, result: Dict[str, Any]) -> str:
        """保存回测结果"""
        try:
            collection = self.collections['backtest_results']
            
            # 添加时间戳
            result['created_at'] = datetime.now()
            result['updated_at'] = datetime.now()
            
            # 插入或更新
            await collection.replace_one(
                {'id': result['id']},
                result,
                upsert=True
            )
            
            logger.debug(f"✅ 回测结果已保存: {result['id']}")
            return result['id']
            
        except Exception as e:
            logger.error(f"❌ 保存回测结果失败: {e}")
            raise
    
    async def get_backtest_result(self, backtest_id: str) -> Optional[Dict[str, Any]]:
        """获取回测结果"""
        try:
            collection = self.collections['backtest_results']
            result = await collection.find_one({'id': backtest_id})
            
            if result:
                result.pop('_id', None)
            
            return result
            
        except Exception as e:
            logger.error(f"❌ 获取回测结果失败: {e}")
            return None
    
    async def list_backtest_results(
        self,
        strategy_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """列出回测结果"""
        try:
            collection = self.collections['backtest_results']
            
            # 构建查询条件
            query = {}
            if strategy_id:
                query['strategy_id'] = strategy_id
            
            # 执行查询
            cursor = collection.find(query).sort('created_at', -1).skip(offset).limit(limit)
            results = await cursor.to_list(length=limit)
            
            # 移除_id字段
            for result in results:
                result.pop('_id', None)
            
            return results
            
        except Exception as e:
            logger.error(f"❌ 列出回测结果失败: {e}")
            return []
    
    async def get_active_strategies(self) -> List[Dict[str, Any]]:
        """获取活跃策略"""
        try:
            collection = self.collections['strategy_results']
            
            # 查询状态为running的策略
            cursor = collection.find({
                'status': 'running',
                'updated_at': {
                    '$gte': datetime.now() - timedelta(hours=1)  # 1小时内更新的
                }
            })
            
            results = await cursor.to_list(length=None)
            
            # 移除_id字段
            for result in results:
                result.pop('_id', None)
            
            return results
            
        except Exception as e:
            logger.error(f"❌ 获取活跃策略失败: {e}")
            return []
    
    async def count_strategies(self) -> int:
        """统计策略数量"""
        try:
            collection = self.collections['strategy_results']
            count = await collection.count_documents({})
            return count
            
        except Exception as e:
            logger.error(f"❌ 统计策略数量失败: {e}")
            return 0
    
    async def save_market_data(
        self,
        symbol: str,
        timeframe: str,
        data: List[Dict[str, Any]]
    ) -> None:
        """保存市场数据"""
        try:
            collection = self.collections['market_data']
            
            # 批量插入数据
            if data:
                # 添加元数据
                for item in data:
                    item['symbol'] = symbol
                    item['timeframe'] = timeframe
                    item['created_at'] = datetime.now()
                
                await collection.insert_many(data, ordered=False)
                logger.debug(f"✅ 市场数据已保存: {symbol} {len(data)}条")
            
        except Exception as e:
            logger.error(f"❌ 保存市场数据失败: {e}")
    
    async def get_market_data(
        self,
        symbol: str,
        timeframe: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 1000
    ) -> List[Dict[str, Any]]:
        """获取市场数据"""
        try:
            collection = self.collections['market_data']
            
            # 构建查询条件
            query = {
                'symbol': symbol,
                'timeframe': timeframe
            }
            
            if start_time or end_time:
                query['timestamp'] = {}
                if start_time:
                    query['timestamp']['$gte'] = start_time
                if end_time:
                    query['timestamp']['$lte'] = end_time
            
            # 执行查询
            cursor = collection.find(query).sort('timestamp', 1).limit(limit)
            results = await cursor.to_list(length=limit)
            
            # 移除_id字段
            for result in results:
                result.pop('_id', None)
            
            return results
            
        except Exception as e:
            logger.error(f"❌ 获取市场数据失败: {e}")
            return []
    
    # Redis操作方法
    async def cache_set(
        self,
        key: str,
        value: Union[str, Dict, List],
        expire: Optional[int] = None
    ) -> bool:
        """设置缓存"""
        try:
            if not self.redis_client:
                return False
            
            # 序列化值
            if isinstance(value, (dict, list)):
                value = json.dumps(value, default=str)
            
            # 设置缓存
            if expire:
                await self.redis_client.setex(key, expire, value)
            else:
                await self.redis_client.set(key, value)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ 设置缓存失败: {e}")
            return False
    
    async def cache_get(self, key: str) -> Optional[Any]:
        """获取缓存"""
        try:
            if not self.redis_client:
                return None
            
            value = await self.redis_client.get(key)
            if value is None:
                return None
            
            # 尝试反序列化
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value.decode('utf-8') if isinstance(value, bytes) else value
            
        except Exception as e:
            logger.error(f"❌ 获取缓存失败: {e}")
            return None
    
    async def cache_delete(self, key: str) -> bool:
        """删除缓存"""
        try:
            if not self.redis_client:
                return False
            
            result = await self.redis_client.delete(key)
            return result > 0
            
        except Exception as e:
            logger.error(f"❌ 删除缓存失败: {e}")
            return False
    
    async def cache_exists(self, key: str) -> bool:
        """检查缓存是否存在"""
        try:
            if not self.redis_client:
                return False
            
            result = await self.redis_client.exists(key)
            return result > 0
            
        except Exception as e:
            logger.error(f"❌ 检查缓存失败: {e}")
            return False
    
    # 私有方法
    async def _connect_mongodb(self) -> None:
        """连接MongoDB"""
        try:
            self.mongo_client = AsyncIOMotorClient(
                self.config.mongodb_uri,
                serverSelectionTimeoutMS=5000
            )
            
            # 测试连接
            await self.mongo_client.admin.command('ping')
            
            # 获取数据库
            db_name = self.config.mongodb_uri.split('/')[-1].split('?')[0]
            self.mongo_db = self.mongo_client[db_name]
            
            logger.info(f"✅ MongoDB连接成功: {db_name}")
            
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            logger.error(f"❌ MongoDB连接失败: {e}")
            raise
    
    async def _connect_redis(self) -> None:
        """连接Redis"""
        try:
            self.redis_client = Redis.from_url(
                self.config.redis_url,
                decode_responses=True
            )
            
            # 测试连接
            await self.redis_client.ping()
            
            logger.info("✅ Redis连接成功")
            
        except Exception as e:
            logger.error(f"❌ Redis连接失败: {e}")
            # Redis连接失败不阻止启动，只是缓存功能不可用
            self.redis_client = None
    
    async def _initialize_collections(self) -> None:
        """初始化集合"""
        try:
            collection_names = [
                'strategy_results',
                'backtest_results',
                'market_data',
                'trades',
                'positions',
                'performance_metrics'
            ]
            
            for name in collection_names:
                self.collections[name] = self.mongo_db[name]
            
            logger.info(f"✅ 已初始化 {len(collection_names)} 个集合")
            
        except Exception as e:
            logger.error(f"❌ 初始化集合失败: {e}")
            raise
    
    async def _create_indexes(self) -> None:
        """创建索引"""
        try:
            # 策略结果索引
            await self.collections['strategy_results'].create_index('id', unique=True)
            await self.collections['strategy_results'].create_index('status')
            await self.collections['strategy_results'].create_index('created_at')
            
            # 回测结果索引
            await self.collections['backtest_results'].create_index('id', unique=True)
            await self.collections['backtest_results'].create_index('strategy_id')
            await self.collections['backtest_results'].create_index('created_at')
            
            # 市场数据索引
            await self.collections['market_data'].create_index([
                ('symbol', 1),
                ('timeframe', 1),
                ('timestamp', 1)
            ], unique=True)
            
            logger.info("✅ 数据库索引创建完成")
            
        except Exception as e:
            logger.error(f"❌ 创建索引失败: {e}")
            # 索引创建失败不阻止启动