#!/usr/bin/env python3
"""
API Response Models Module
API响应模型模块
"""

from typing import Any, Optional, Dict, List, Union
from pydantic import BaseModel, Field
from datetime import datetime


class APIResponse(BaseModel):
    """标准API响应格式"""
    success: bool = Field(..., description="请求是否成功")
    message: str = Field(..., description="响应消息")
    data: Optional[Union[Dict[str, Any], List[Any], str, int, float]] = Field(None, description="响应数据")
    error_code: Optional[str] = Field(None, description="错误代码")
    timestamp: datetime = Field(default_factory=datetime.now, description="响应时间戳")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PaginatedResponse(BaseModel):
    """分页响应格式"""
    success: bool = Field(..., description="请求是否成功")
    message: str = Field(..., description="响应消息")
    data: List[Any] = Field(..., description="数据列表")
    pagination: Dict[str, Any] = Field(..., description="分页信息")
    timestamp: datetime = Field(default_factory=datetime.now, description="响应时间戳")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ErrorResponse(BaseModel):
    """错误响应格式"""
    success: bool = Field(False, description="请求失败")
    message: str = Field(..., description="错误消息")
    error_code: str = Field(..., description="错误代码")
    details: Optional[Dict[str, Any]] = Field(None, description="错误详情")
    timestamp: datetime = Field(default_factory=datetime.now, description="响应时间戳")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class HealthCheckResponse(BaseModel):
    """健康检查响应"""
    status: str = Field(..., description="服务状态")
    version: str = Field(..., description="版本号")
    uptime: float = Field(..., description="运行时间（秒）")
    components: Dict[str, bool] = Field(..., description="组件状态")
    timestamp: datetime = Field(default_factory=datetime.now, description="检查时间")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class MetricsResponse(BaseModel):
    """指标响应"""
    total_strategies: int = Field(..., description="总策略数")
    active_strategies: int = Field(..., description="活跃策略数")
    total_trades: int = Field(..., description="总交易数")
    successful_trades: int = Field(..., description="成功交易数")
    total_pnl: float = Field(..., description="总盈亏")
    win_rate: float = Field(..., description="胜率")
    average_return: float = Field(..., description="平均收益率")
    timestamp: datetime = Field(default_factory=datetime.now, description="统计时间")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }