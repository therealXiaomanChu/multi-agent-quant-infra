import { Request, Response, NextFunction } from 'express'
import { IApiResponse } from '@/types'

// 自定义错误类
export class AppError extends Error {
  public statusCode: number
  public isOperational: boolean

  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true

    Error.captureStackTrace(this, this.constructor)
  }
}

// 错误处理中间件
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let error = { ...err }
  error.message = err.message

  // 记录错误日志
  console.error('错误详情:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  })

  // MongoDB重复键错误
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    const message = `${field}已存在，请使用其他值`
    error = new AppError(message, 400)
  }

  // MongoDB验证错误
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((val: any) => val.message)
      .join(', ')
    error = new AppError(message, 400)
  }

  // MongoDB转换错误
  if (err.name === 'CastError') {
    const message = '资源未找到'
    error = new AppError(message, 404)
  }

  // JWT错误
  if (err.name === 'JsonWebTokenError') {
    const message = '无效的访问令牌'
    error = new AppError(message, 401)
  }

  // JWT过期错误
  if (err.name === 'TokenExpiredError') {
    const message = '访问令牌已过期'
    error = new AppError(message, 401)
  }

  // 文件上传错误
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = '文件大小超出限制'
    error = new AppError(message, 400)
  }

  // 文件类型错误
  if (err.code === 'INVALID_FILE_TYPE') {
    const message = '不支持的文件类型'
    error = new AppError(message, 400)
  }

  // Redis连接错误
  if (err.code === 'ECONNREFUSED' && err.port === 6379) {
    const message = 'Redis服务连接失败'
    error = new AppError(message, 500)
  }

  // 数据库连接错误
  if (err.name === 'MongoNetworkError') {
    const message = '数据库连接失败'
    error = new AppError(message, 500)
  }

  // 构建响应
  const response: IApiResponse = {
    success: false,
    message: error.message || '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? {
      stack: err.stack,
      details: err
    } : undefined
  }

  // 发送错误响应
  res.status(error.statusCode || 500).json(response)
}

// 异步错误捕获包装器
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// 404错误处理
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new AppError(`路径 ${req.originalUrl} 未找到`, 404)
  next(error)
}

// 开发环境错误处理
export const developmentErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const response: IApiResponse = {
    success: false,
    message: err.message,
    error: {
      status: err.statusCode,
      stack: err.stack,
      details: err
    }
  }

  res.status(err.statusCode || 500).json(response)
}

// 生产环境错误处理
export const productionErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // 只发送操作性错误给客户端
  if (err.isOperational) {
    const response: IApiResponse = {
      success: false,
      message: err.message
    }
    res.status(err.statusCode).json(response)
  } else {
    // 记录错误但不暴露给客户端
    console.error('系统错误:', err)
    
    const response: IApiResponse = {
      success: false,
      message: '服务器内部错误'
    }
    res.status(500).json(response)
  }
}

// 全局未捕获异常处理
process.on('uncaughtException', (err: Error) => {
  console.error('未捕获的异常:', err.name, err.message)
  console.error('堆栈跟踪:', err.stack)
  console.log('正在关闭应用程序...')
  process.exit(1)
})

// 全局未处理的Promise拒绝
process.on('unhandledRejection', (err: any) => {
  console.error('未处理的Promise拒绝:', err.name, err.message)
  console.log('正在关闭服务器...')
  process.exit(1)
})

export default {
  AppError,
  errorHandler,
  asyncHandler,
  notFound,
  developmentErrorHandler,
  productionErrorHandler
}