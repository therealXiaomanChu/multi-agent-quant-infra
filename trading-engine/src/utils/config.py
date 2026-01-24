#!/usr/bin/env python3
"""
Configuration Management Module (AI Quant Infrastructure)
配置管理模块 - 适配 A股/港股/美股 多市场环境
"""

import os
from typing import Optional, Dict, Any
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger

# 加载环境变量
load_dotenv()


@dataclass
class Config:
    """全局配置类"""
    
    # -------------------------
    # 基础环境配置
    # -------------------------
    app_name: str = "AI-Quant-Infrastructure"
    environment: str = os.getenv('ENVIRONMENT', 'development')
    debug: bool = os.getenv('DEBUG', 'false').lower() == 'true'
    host: str = os.getenv('HOST', '0.0.0.0')
    port: int = int(os.getenv('PORT', 8000))
    
    # -------------------------
    # 基础设施配置 (Database & Cache)
    # -------------------------
    # 修改默认库名为 ai_quant_db，显得更专业且去重
    mongodb_uri: str = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/ai_quant_db')
    redis_url: str = os.getenv('REDIS_URL', 'redis://localhost:6379')
    
    # -------------------------
    # 市场数据配置 (Data Feeds)
    # -------------------------
    # 仅保留通用接口配置，移除特定交易所(如Binance)的硬编码
    # 增加 Tushare (A股常用) 占位符，符合国内量化习惯
    tushare_token: Optional[str] = os.getenv('TUSHARE_TOKEN')
    alpha_vantage_api_key: Optional[str] = os.getenv('ALPHA_VANTAGE_API_KEY')
    
    # 通用交易所接口 (适配实盘)
    exchange_api_key: Optional[str] = os.getenv('EXCHANGE_API_KEY')
    exchange_secret_key: Optional[str] = os.getenv('EXCHANGE_SECRET_KEY')
    
    # -------------------------
    # 交易风控配置 (Risk & Trading)
    # -------------------------
    default_commission: float = float(os.getenv('DEFAULT_COMMISSION', 0.0003)) # A股万三手续费
    default_slippage: float = float(os.getenv('DEFAULT_SLIPPAGE', 0.0001)) # 万一滑点
    max_position_size: float = float(os.getenv('MAX_POSITION_SIZE', 0.1))  # 单票最大仓位 10%
    max_daily_loss: float = float(os.getenv('MAX_DAILY_LOSS', 0.05))  # 单日停损线 5%
    
    # 风险管理
    max_drawdown_limit: float = float(os.getenv('MAX_DRAWDOWN_LIMIT', 0.2))  # 最大回撤 20%
    risk_free_rate: float = float(os.getenv('RISK_FREE_RATE', 0.02))  # 无风险利率 2%
    
    # -------------------------
    # 系统与并发配置
    # -------------------------
    log_level: str = os.getenv('LOG_LEVEL', 'INFO')
    log_file: str = os.getenv('LOG_FILE', 'logs/engine.log')
    
    max_workers: int = int(os.getenv('MAX_WORKERS', 4))
    
    # 回测配置
    backtest_data_path: str = os.getenv('BACKTEST_DATA_PATH', 'data/backtest')
    
    def __post_init__(self):
        """初始化后处理"""
        self._create_directories()
        self._validate_config()
        logger.info(f"🚀 [{self.app_name}] Config Loaded - Env: {self.environment}")
    
    def _create_directories(self) -> None:
        """创建必要的目录"""
        directories = [
            Path(self.log_file).parent,
            Path(self.backtest_data_path),
            Path('data/cache'),
            Path('data/exports')
        ]
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
    
    def _validate_config(self) -> None:
        """验证配置有效性"""
        if not (0 < self.max_position_size <= 1):
            raise ValueError(f"Max position size must be between 0 and 1: {self.max_position_size}")
    
    def get_market_data_config(self) -> Dict[str, Any]:
        """获取市场数据配置"""
        return {
            'tushare_token': self.tushare_token,
            'alpha_vantage_api_key': self.alpha_vantage_api_key,
            'exchange_api_key': '******' if self.exchange_api_key else None
        }
    
    def to_dict(self) -> Dict[str, Any]:
        """安全导出配置 (自动脱敏)"""
        config_dict = {}
        for key, value in self.__dict__.items():
            # 隐藏敏感信息
            if any(sensitive in key.lower() for sensitive in ['key', 'secret', 'password', 'token']):
                config_dict[key] = '******' if value else None
            else:
                config_dict[key] = value
        return config_dict


# 全局配置实例
config = Config()
   
