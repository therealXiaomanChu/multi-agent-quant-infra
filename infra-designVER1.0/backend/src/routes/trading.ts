import { Router } from 'express'
import { tradingController } from '@/controllers/tradingController'
import { authenticate, optionalAuth } from '@/middleware/auth'

const router = Router()

/**
 * @route   POST /api/trading/execute
 * @desc    执行交易
 * @access  Private
 */
router.post('/execute', authenticate, tradingController.executeTrade)

/**
 * @route   GET /api/trading/records
 * @desc    获取交易记录
 * @access  Private
 */
router.get('/records', authenticate, tradingController.getTradeRecords)

/**
 * @route   GET /api/trading/agents/:agentId/records
 * @desc    获取特定代理的交易记录
 * @access  Public/Private (根据代理可见性)
 */
router.get('/agents/:agentId/records', optionalAuth, tradingController.getAgentTradeRecords)

/**
 * @route   GET /api/trading/stats
 * @desc    获取交易统计
 * @access  Private
 */
router.get('/stats', authenticate, tradingController.getTradingStats)

/**
 * @route   GET /api/trading/signals
 * @desc    获取实时交易信号
 * @access  Private
 */
router.get('/signals', authenticate, tradingController.getTradingSignals)

/**
 * @route   DELETE /api/trading/:tradeId
 * @desc    取消交易
 * @access  Private
 */
router.delete('/:tradeId', authenticate, tradingController.cancelTrade)

export default router