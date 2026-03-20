import { Router } from 'express'
import authRoutes from './auth'
import agentRoutes from './agents'
import userRoutes from './users'
import tradingRoutes from './trading'
import backtestRoutes from './backtest'
import battleRoutes from './battle'
import rankingRoutes from './ranking'
import marketDataRoutes from './marketData'

const router = Router()

// API路由
router.use('/auth', authRoutes)
router.use('/agents', agentRoutes)
router.use('/users', userRoutes)
router.use('/trading', tradingRoutes)
router.use('/backtest', backtestRoutes)
router.use('/battles', battleRoutes)
router.use('/ranking', rankingRoutes)
router.use('/market-data', marketDataRoutes)

// 健康检查端点
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Trading Agent Platform API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// API文档端点
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Trading Agent Platform API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      agents: '/api/agents',
      users: '/api/users',
      trading: '/api/trading',
      backtest: '/api/backtest',
      battles: '/api/battles',
      ranking: '/api/ranking',
      health: '/api/health'
    },
    documentation: 'https://github.com/your-repo/trading-agent-platform'
  })
})

export default router