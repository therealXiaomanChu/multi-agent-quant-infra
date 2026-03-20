import { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { User } from '@/models/User'
import { IAuthRequest } from '@/types'
import { AppError, asyncHandler } from './errorHandler'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

// 验证JWT令牌
export const authenticate = asyncHandler(async (
  req: IAuthRequest,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined

  // 从请求头获取令牌
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1]
  }
  // 从cookie获取令牌（如果需要）
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token
  }

  // 检查令牌是否存在
  if (!token) {
    return next(new AppError('访问被拒绝，请提供有效的访问令牌', 401))
  }

  try {
    // 验证令牌
    const decoded = jwt.verify(token, JWT_SECRET) as any

    // 获取用户信息
    const user = await User.findById(decoded.id).select('-password')
    if (!user) {
      return next(new AppError('令牌对应的用户不存在', 401))
    }

    // 检查用户是否激活
    if (!user.isActive) {
      return next(new AppError('用户账户已被禁用', 401))
    }

    // 将用户信息添加到请求对象
    req.user = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      role: user.role
    }

    next()
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('无效的访问令牌', 401))
    } else if (error.name === 'TokenExpiredError') {
      return next(new AppError('访问令牌已过期', 401))
    } else {
      return next(new AppError('令牌验证失败', 401))
    }
  }
})

// 可选认证（不强制要求登录）
export const optionalAuth = asyncHandler(async (
  req: IAuthRequest,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1]
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any
      const user = await User.findById(decoded.id).select('-password')
      
      if (user && user.isActive) {
        req.user = {
          id: user._id.toString(),
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    } catch (error) {
      // 忽略令牌错误，继续处理请求
      console.log('可选认证令牌无效:', error)
    }
  }

  next()
})

// 角色授权
export const authorize = (...roles: string[]) => {
  return (req: IAuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('访问被拒绝，请先登录', 401))
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('权限不足，无法访问此资源', 403))
    }

    next()
  }
}

// 检查资源所有权
export const checkOwnership = (resourceField: string = 'author') => {
  return (req: IAuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('访问被拒绝，请先登录', 401))
    }

    // 管理员可以访问所有资源
    if (req.user.role === 'admin') {
      return next()
    }

    // 检查资源所有权的逻辑将在控制器中实现
    // 这里只是标记需要检查所有权
    req.checkOwnership = { field: resourceField, userId: req.user.id }
    next()
  }
}

// 生成JWT令牌
export const generateToken = (userId: string): string => {
  return jwt.sign(
    { id: userId },
    JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  )
}

// 生成刷新令牌
export const generateRefreshToken = (userId: string): string => {
  return jwt.sign(
    { id: userId, type: 'refresh' },
    JWT_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
    }
  )
}

// 验证刷新令牌
export const verifyRefreshToken = (token: string): any => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    if (decoded.type !== 'refresh') {
      throw new Error('无效的刷新令牌类型')
    }
    return decoded
  } catch (error) {
    throw new AppError('无效的刷新令牌', 401)
  }
}

// 设置令牌Cookie
export const setTokenCookie = (res: Response, token: string): void => {
  const cookieOptions = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRES_IN ? 
        parseInt(process.env.JWT_COOKIE_EXPIRES_IN) * 24 * 60 * 60 * 1000 : 
        7 * 24 * 60 * 60 * 1000)
    ),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const
  }

  res.cookie('token', token, cookieOptions)
}

// 清除令牌Cookie
export const clearTokenCookie = (res: Response): void => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  })
}

// 速率限制（基于用户）
export const userRateLimit = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>()

  return (req: IAuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next()
    }

    const userId = req.user.id
    const now = Date.now()
    const userRequests = requests.get(userId)

    if (!userRequests || now > userRequests.resetTime) {
      requests.set(userId, {
        count: 1,
        resetTime: now + windowMs
      })
      return next()
    }

    if (userRequests.count >= maxRequests) {
      return next(new AppError('请求过于频繁，请稍后再试', 429))
    }

    userRequests.count++
    next()
  }
}

export default {
  authenticate,
  optionalAuth,
  authorize,
  checkOwnership,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  setTokenCookie,
  clearTokenCookie,
  userRateLimit
}