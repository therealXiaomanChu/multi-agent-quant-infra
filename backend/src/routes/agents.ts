import { Router } from 'express'
import { agentController } from '@/controllers/agentController'
import { authenticate, optionalAuth, authorize } from '@/middleware/auth'

const router = Router()

/**
 * @route   POST /api/agents
 * @desc    创建新的交易代理
 * @access  Private
 */
router.post('/', authenticate, agentController.createAgent)

/**
 * @route   GET /api/agents
 * @desc    获取代理列表
 * @access  Public
 */
router.get('/', agentController.getAgents)

/**
 * @route   GET /api/agents/popular
 * @desc    获取热门代理
 * @access  Public
 */
router.get('/popular', agentController.getPopularAgents)

/**
 * @route   GET /api/agents/category/:category
 * @desc    根据分类获取代理
 * @access  Public
 */
router.get('/category/:category', agentController.getAgentsByCategory)

/**
 * @route   GET /api/agents/search
 * @desc    搜索代理
 * @access  Public
 */
router.get('/search', agentController.searchAgents)

/**
 * @route   GET /api/agents/my
 * @desc    获取我的代理
 * @access  Private
 */
router.get('/my', authenticate, agentController.getMyAgents)

/**
 * @route   GET /api/agents/:id
 * @desc    获取单个代理详情
 * @access  Public
 */
router.get('/:id', optionalAuth, agentController.getAgent)

/**
 * @route   PUT /api/agents/:id
 * @desc    更新代理
 * @access  Private (仅作者或管理员)
 */
router.put('/:id', authenticate, agentController.updateAgent)

/**
 * @route   DELETE /api/agents/:id
 * @desc    删除代理
 * @access  Private (仅作者或管理员)
 */
router.delete('/:id', authenticate, agentController.deleteAgent)

export default router