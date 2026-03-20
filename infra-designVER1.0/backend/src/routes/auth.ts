import express from 'express'
import { authController } from '@/controllers/authController'
import { authenticate } from '@/middleware/auth'

const router = express.Router()

// 用户注册
router.post('/register', authController.register)

// 用户登录
router.post('/login', authController.login)

// 用户登出
router.post('/logout', authenticate, authController.logout)

// 刷新令牌
router.post('/refresh', authController.refreshToken)

// 获取当前用户信息
router.get('/me', authenticate, authController.getMe)

// 更新用户信息
router.put('/me', authenticate, authController.updateMe)

// 修改密码
router.put('/change-password', authenticate, authController.changePassword)

// 忘记密码
router.post('/forgot-password', authController.forgotPassword)

// 重置密码
router.post('/reset-password', authController.resetPassword)

// 验证邮箱
router.post('/verify-email', authController.verifyEmail)

// 重新发送验证邮件
router.post('/resend-verification', authController.resendVerification)

export default router