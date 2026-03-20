import { Router } from 'express'
import { backtestController } from '@/controllers/backtestController'
import { authenticate, optionalAuth } from '@/middleware/auth'

const router = Router()

/**
 * @route   POST /api/backtest/run
 * @desc    运行回测
 * @access  Private
 */
router.post('/run', authenticate, backtestController.runBacktest)

/**
 * @route   GET /api/backtest/results
 * @desc    获取回测结果列表
 * @access  Private
 */
router.get('/results', authenticate, backtestController.getBacktestResults)

/**
 * @route   GET /api/backtest/results/:id
 * @desc    获取单个回测结果详情
 * @access  Public/Private (根据代理可见性)
 */
router.get('/results/:id', optionalAuth, backtestController.getBacktestResult)

/**
 * @route   GET /api/backtest/compare
 * @desc    比较多个回测结果
 * @access  Public
 */
router.get('/compare', backtestController.compareBacktestResults)

/**
 * @route   DELETE /api/backtest/results/:id
 * @desc    删除回测结果
 * @access  Private (仅作者或管理员)
 */
router.delete('/results/:id', authenticate, backtestController.deleteBacktestResult)

/**
 * @route   GET /api/backtest/stats
 * @desc    获取回测统计
 * @access  Private
 */
router.get('/stats', authenticate, backtestController.getBacktestStats)

export default router