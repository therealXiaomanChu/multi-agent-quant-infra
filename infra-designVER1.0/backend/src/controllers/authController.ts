import { Response } from 'express'
import Joi from 'joi'
import { User } from '@/models/User'
import { IAuthRequest, IApiResponse } from '@/types'
import { AppError, asyncHandler } from '@/middleware/errorHandler'
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  setTokenCookie,
  clearTokenCookie
} from '@/middleware/auth'
import { RedisService } from '@/config/redis'

// 验证模式
const registerSchema = Joi.object({
  username: Joi.string()
    .alphanum()
    .min(3)
    .max(30)
    .required()
    .messages({
      'string.alphanum': '用户名只能包含字母和数字',
      'string.min': '用户名至少需要3个字符',
      'string.max': '用户名不能超过30个字符',
      'any.required': '用户名是必需的'
    }),
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': '请输入有效的邮箱地址',
      'any.required': '邮箱是必需的'
    }),
  password: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      'string.min': '密码至少需要6个字符',
      'string.max': '密码不能超过128个字符',
      'any.required': '密码是必需的'
    }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': '确认密码必须与密码匹配',
      'any.required': '确认密码是必需的'
    })
})

const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': '请输入有效的邮箱地址',
      'any.required': '邮箱是必需的'
    }),
  password: Joi.string()
    .required()
    .messages({
      'any.required': '密码是必需的'
    })
})

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string()
    .required()
    .messages({
      'any.required': '当前密码是必需的'
    }),
  newPassword: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      'string.min': '新密码至少需要6个字符',
      'string.max': '新密码不能超过128个字符',
      'any.required': '新密码是必需的'
    }),
  confirmNewPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': '确认新密码必须与新密码匹配',
      'any.required': '确认新密码是必需的'
    })
})

class AuthController {
  // 用户注册
  register = asyncHandler(async (req: IAuthRequest, res: Response) => {
    // 验证输入数据
    const { error, value } = registerSchema.validate(req.body)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { username, email, password } = value

    // 检查用户是否已存在
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    })

    if (existingUser) {
      if (existingUser.email === email) {
        throw new AppError('该邮箱已被注册', 400)
      }
      if (existingUser.username === username) {
        throw new AppError('该用户名已被使用', 400)
      }
    }

    // 创建新用户
    const user = await User.create({
      username,
      email,
      password
    })

    // 生成令牌
    const token = generateToken(user._id.toString())
    const refreshToken = generateRefreshToken(user._id.toString())

    // 设置Cookie
    setTokenCookie(res, token)

    // 缓存刷新令牌
    await RedisService.set(
      `refresh_token:${user._id}`,
      refreshToken,
      30 * 24 * 60 * 60 // 30天
    )

    const response: IApiResponse = {
      success: true,
      message: '注册成功',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatarUrl,
          role: user.role,
          createdAt: user.createdAt
        },
        token,
        refreshToken
      }
    }

    res.status(201).json(response)
  })

  // 用户登录
  login = asyncHandler(async (req: IAuthRequest, res: Response) => {
    // 验证输入数据
    const { error, value } = loginSchema.validate(req.body)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { email, password } = value

    // 查找用户（包含密码字段）
    const user = await User.findOne({ email }).select('+password')
    if (!user) {
      throw new AppError('邮箱或密码错误', 401)
    }

    // 检查用户是否激活
    if (!user.isActive) {
      throw new AppError('账户已被禁用，请联系管理员', 401)
    }

    // 验证密码
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      throw new AppError('邮箱或密码错误', 401)
    }

    // 生成令牌
    const token = generateToken(user._id.toString())
    const refreshToken = generateRefreshToken(user._id.toString())

    // 设置Cookie
    setTokenCookie(res, token)

    // 缓存刷新令牌
    await RedisService.set(
      `refresh_token:${user._id}`,
      refreshToken,
      30 * 24 * 60 * 60 // 30天
    )

    // 更新最后登录时间
    user.updatedAt = new Date()
    await user.save({ validateBeforeSave: false })

    const response: IApiResponse = {
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatarUrl,
          role: user.role,
          profile: user.profile,
          stats: user.stats
        },
        token,
        refreshToken
      }
    }

    res.status(200).json(response)
  })

  // 用户登出
  logout = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (req.user) {
      // 删除缓存的刷新令牌
      await RedisService.del(`refresh_token:${req.user.id}`)
    }

    // 清除Cookie
    clearTokenCookie(res)

    const response: IApiResponse = {
      success: true,
      message: '登出成功'
    }

    res.status(200).json(response)
  })

  // 刷新令牌
  refreshToken = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { refreshToken } = req.body

    if (!refreshToken) {
      throw new AppError('刷新令牌是必需的', 400)
    }

    // 验证刷新令牌
    const decoded = verifyRefreshToken(refreshToken)
    const userId = decoded.id

    // 检查缓存的刷新令牌
    const cachedToken = await RedisService.get(`refresh_token:${userId}`)
    if (cachedToken !== refreshToken) {
      throw new AppError('无效的刷新令牌', 401)
    }

    // 获取用户信息
    const user = await User.findById(userId)
    if (!user || !user.isActive) {
      throw new AppError('用户不存在或已被禁用', 401)
    }

    // 生成新的令牌
    const newToken = generateToken(userId)
    const newRefreshToken = generateRefreshToken(userId)

    // 设置Cookie
    setTokenCookie(res, newToken)

    // 更新缓存的刷新令牌
    await RedisService.set(
      `refresh_token:${userId}`,
      newRefreshToken,
      30 * 24 * 60 * 60 // 30天
    )

    const response: IApiResponse = {
      success: true,
      message: '令牌刷新成功',
      data: {
        token: newToken,
        refreshToken: newRefreshToken
      }
    }

    res.status(200).json(response)
  })

  // 获取当前用户信息
  getMe = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const user = await User.findById(req.user.id)
    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    const response: IApiResponse = {
      success: true,
      message: '获取用户信息成功',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatarUrl,
          role: user.role,
          profile: user.profile,
          stats: user.stats,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        }
      }
    }

    res.status(200).json(response)
  })

  // 更新用户信息
  updateMe = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const allowedFields = ['profile', 'avatar']
    const updates: any = {}

    // 只允许更新特定字段
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key]
      }
    })

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      {
        new: true,
        runValidators: true
      }
    )

    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    const response: IApiResponse = {
      success: true,
      message: '用户信息更新成功',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatarUrl,
          role: user.role,
          profile: user.profile,
          stats: user.stats
        }
      }
    }

    res.status(200).json(response)
  })

  // 修改密码
  changePassword = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证输入数据
    const { error, value } = changePasswordSchema.validate(req.body)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { currentPassword, newPassword } = value

    // 获取用户（包含密码）
    const user = await User.findById(req.user.id).select('+password')
    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    // 验证当前密码
    const isCurrentPasswordValid = await user.comparePassword(currentPassword)
    if (!isCurrentPasswordValid) {
      throw new AppError('当前密码错误', 400)
    }

    // 更新密码
    user.password = newPassword
    await user.save()

    // 删除所有刷新令牌（强制重新登录）
    await RedisService.del(`refresh_token:${user._id}`)

    const response: IApiResponse = {
      success: true,
      message: '密码修改成功，请重新登录'
    }

    res.status(200).json(response)
  })

  // 忘记密码（占位符）
  forgotPassword = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const response: IApiResponse = {
      success: true,
      message: '忘记密码功能正在开发中'
    }

    res.status(200).json(response)
  })

  // 重置密码（占位符）
  resetPassword = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const response: IApiResponse = {
      success: true,
      message: '重置密码功能正在开发中'
    }

    res.status(200).json(response)
  })

  // 验证邮箱（占位符）
  verifyEmail = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const response: IApiResponse = {
      success: true,
      message: '邮箱验证功能正在开发中'
    }

    res.status(200).json(response)
  })

  // 重新发送验证邮件（占位符）
  resendVerification = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const response: IApiResponse = {
      success: true,
      message: '重新发送验证邮件功能正在开发中'
    }

    res.status(200).json(response)
  })
}

export const authController = new AuthController()
export default authController