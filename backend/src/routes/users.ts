import { Router } from 'express'
import { userController } from '@/controllers/userController'
import { authenticate, authorize } from '@/middleware/auth'

const router = Router()

/**
 * @route   GET /api/users
 * @desc    获取用户列表 (管理员)
 * @access  Private (Admin only)
 */
router.get('/', authenticate, authorize(['admin']), userController.getUsers)

/**
 * @route   GET /api/users/leaderboard
 * @desc    获取用户排行榜
 * @access  Public
 */
router.get('/leaderboard', userController.getLeaderboard)

/**
 * @route   GET /api/users/:id
 * @desc    获取单个用户详情
 * @access  Public
 */
router.get('/:id', userController.getUser)

/**
 * @route   PUT /api/users/:id
 * @desc    更新用户资料
 * @access  Private (仅本人或管理员)
 */
router.put('/:id', authenticate, userController.updateUser)

/**
 * @route   PUT /api/users/:id/avatar
 * @desc    更新用户头像
 * @access  Private (仅本人或管理员)
 */
router.put('/:id/avatar', authenticate, userController.updateAvatar)

/**
 * @route   GET /api/users/:id/stats
 * @desc    获取用户统计信息
 * @access  Public
 */
router.get('/:id/stats', userController.getUserStats)

/**
 * @route   GET /api/users/:id/agents
 * @desc    获取用户的代理列表
 * @access  Public
 */
router.get('/:id/agents', userController.getUserAgents)

/**
 * @route   PUT /api/users/:id/status
 * @desc    切换用户状态 (管理员)
 * @access  Private (Admin only)
 */
router.put('/:id/status', authenticate, authorize(['admin']), userController.toggleUserStatus)

/**
 * @route   PUT /api/users/:id/role
 * @desc    更改用户角色 (管理员)
 * @access  Private (Admin only)
 */
router.put('/:id/role', authenticate, authorize(['admin']), userController.changeUserRole)

export default router