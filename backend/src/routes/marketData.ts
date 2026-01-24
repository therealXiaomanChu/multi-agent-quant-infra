import { Router } from 'express'
import { Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { body, query, validationResult } from 'express-validator'
import { getMarketDataService } from '@/services/marketDataService'
import { getTradingEngine } from '@/services/tradingEngine'
import { authenticateToken } from '@/middleware/auth'
import logger from '@/utils/logger'

const router = Router()

// 速率限制
const marketDataRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 100, // 每分钟最多100次请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
})

const subscriptionRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 20, // 每分钟最多20次订阅操作
  message: { error: '订阅操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
})

// 获取支持的交易标的列表
router.get('/symbols', marketDataRateLimit, async (req: Request, res: Response) => {
  try {
    // 支持的交易标的
    const symbols = [
      // 加密货币
      { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'crypto', exchange: 'binance' },
      { symbol: 'ETHUSDT', name: 'Ethereum', category: 'crypto', exchange: 'binance' },
      { symbol: 'ADAUSDT', name: 'Cardano', category: 'crypto', exchange: 'binance' },
      { symbol: 'DOTUSDT', name: 'Polkadot', category: 'crypto', exchange: 'binance' },
      { symbol: 'LINKUSDT', name: 'Chainlink', category: 'crypto', exchange: 'binance' },
      
      // 美股
      { symbol: 'AAPL', name: 'Apple Inc.', category: 'stock', exchange: 'nasdaq' },
      { symbol: 'GOOGL', name: 'Alphabet Inc.', category: 'stock', exchange: 'nasdaq' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', category: 'stock', exchange: 'nasdaq' },
      { symbol: 'TSLA', name: 'Tesla Inc.', category: 'stock', exchange: 'nasdaq' },
      { symbol: 'AMZN', name: 'Amazon.com Inc.', category: 'stock', exchange: 'nasdaq' },
      
      // ETF
      { symbol: 'SPY', name: 'SPDR S&P 500 ETF', category: 'etf', exchange: 'nyse' },
      { symbol: 'QQQ', name: 'Invesco QQQ Trust', category: 'etf', exchange: 'nasdaq' },
      { symbol: 'IWM', name: 'iShares Russell 2000 ETF', category: 'etf', exchange: 'nyse' }
    ]

    res.json({
      success: true,
      data: symbols,
      total: symbols.length
    })
  } catch (error) {
    logger.error('获取交易标的列表失败:', error)
    res.status(500).json({
      success: false,
      error: '获取交易标的列表失败'
    })
  }
})

// 获取实时价格
router.get('/price/:symbol', marketDataRateLimit, async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params
    const marketDataService = getMarketDataService()
    
    const latestPrice = marketDataService.getLatestPrice(symbol.toUpperCase())
    
    if (!latestPrice) {
      return res.status(404).json({
        success: false,
        error: `未找到 ${symbol} 的价格数据`
      })
    }

    res.json({
      success: true,
      data: latestPrice
    })
  } catch (error) {
    logger.error('获取实时价格失败:', error)
    res.status(500).json({
      success: false,
      error: '获取实时价格失败'
    })
  }
})

// 获取多个标的的实时价格
router.post('/prices', 
  marketDataRateLimit,
  [
    body('symbols')
      .isArray({ min: 1, max: 20 })
      .withMessage('symbols必须是数组，长度1-20'),
    body('symbols.*')
      .isString()
      .isLength({ min: 1, max: 20 })
      .withMessage('每个symbol必须是字符串，长度1-20')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: '参数验证失败',
          details: errors.array()
        })
      }

      const { symbols } = req.body
      const marketDataService = getMarketDataService()
      
      const prices: { [symbol: string]: any } = {}
      
      for (const symbol of symbols) {
        const latestPrice = marketDataService.getLatestPrice(symbol.toUpperCase())
        prices[symbol] = latestPrice
      }

      res.json({
        success: true,
        data: prices
      })
    } catch (error) {
      logger.error('获取多个实时价格失败:', error)
      res.status(500).json({
        success: false,
        error: '获取多个实时价格失败'
      })
    }
  }
)

// 获取历史数据
router.get('/history/:symbol',
  marketDataRateLimit,
  [
    query('startTime')
      .optional()
      .isISO8601()
      .withMessage('startTime必须是有效的ISO8601日期'),
    query('endTime')
      .optional()
      .isISO8601()
      .withMessage('endTime必须是有效的ISO8601日期'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('limit必须是1-1000之间的整数')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: '参数验证失败',
          details: errors.array()
        })
      }

      const { symbol } = req.params
      const { startTime, endTime, limit } = req.query
      
      const marketDataService = getMarketDataService()
      
      const startDate = startTime ? new Date(startTime as string) : undefined
      const endDate = endTime ? new Date(endTime as string) : undefined
      const limitNum = limit ? parseInt(limit as string) : 100
      
      const historicalData = await marketDataService.getStoredData(
        symbol.toUpperCase(),
        startDate,
        endDate,
        limitNum
      )

      res.json({
        success: true,
        data: historicalData,
        total: historicalData.length
      })
    } catch (error) {
      logger.error('获取历史数据失败:', error)
      res.status(500).json({
        success: false,
        error: '获取历史数据失败'
      })
    }
  }
)

// 订阅市场数据（需要认证）
router.post('/subscribe',
  authenticateToken,
  subscriptionRateLimit,
  [
    body('symbols')
      .isArray({ min: 1, max: 10 })
      .withMessage('symbols必须是数组，长度1-10'),
    body('symbols.*')
      .isString()
      .isLength({ min: 1, max: 20 })
      .withMessage('每个symbol必须是字符串，长度1-20')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: '参数验证失败',
          details: errors.array()
        })
      }

      const { symbols } = req.body
      const marketDataService = getMarketDataService()
      
      // 订阅市场数据
      await marketDataService.subscribe(symbols.map((s: string) => s.toUpperCase()))
      
      res.json({
        success: true,
        message: `成功订阅 ${symbols.length} 个标的的市场数据`,
        data: {
          subscribedSymbols: symbols,
          totalSubscribed: marketDataService.getSubscribedSymbols().length
        }
      })
    } catch (error) {
      logger.error('订阅市场数据失败:', error)
      res.status(500).json({
        success: false,
        error: '订阅市场数据失败'
      })
    }
  }
)

// 取消订阅市场数据（需要认证）
router.post('/unsubscribe',
  authenticateToken,
  subscriptionRateLimit,
  [
    body('symbols')
      .isArray({ min: 1, max: 10 })
      .withMessage('symbols必须是数组，长度1-10'),
    body('symbols.*')
      .isString()
      .isLength({ min: 1, max: 20 })
      .withMessage('每个symbol必须是字符串，长度1-20')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: '参数验证失败',
          details: errors.array()
        })
      }

      const { symbols } = req.body
      const marketDataService = getMarketDataService()
      
      // 取消订阅市场数据
      await marketDataService.unsubscribe(symbols.map((s: string) => s.toUpperCase()))
      
      res.json({
        success: true,
        message: `成功取消订阅 ${symbols.length} 个标的的市场数据`,
        data: {
          unsubscribedSymbols: symbols,
          totalSubscribed: marketDataService.getSubscribedSymbols().length
        }
      })
    } catch (error) {
      logger.error('取消订阅市场数据失败:', error)
      res.status(500).json({
        success: false,
        error: '取消订阅市场数据失败'
      })
    }
  }
)

// 获取当前订阅状态（需要认证）
router.get('/subscriptions',
  authenticateToken,
  marketDataRateLimit,
  async (req: Request, res: Response) => {
    try {
      const marketDataService = getMarketDataService()
      
      const subscribedSymbols = marketDataService.getSubscribedSymbols()
      const isConnected = marketDataService.isConnected()
      
      res.json({
        success: true,
        data: {
          subscribedSymbols,
          totalSubscribed: subscribedSymbols.length,
          isConnected,
          connectionStatus: isConnected ? 'connected' : 'disconnected'
        }
      })
    } catch (error) {
      logger.error('获取订阅状态失败:', error)
      res.status(500).json({
        success: false,
        error: '获取订阅状态失败'
      })
    }
  }
)

// 获取市场统计信息
router.get('/stats',
  marketDataRateLimit,
  async (req: Request, res: Response) => {
    try {
      const marketDataService = getMarketDataService()
      const tradingEngine = getTradingEngine()
      
      const subscribedSymbols = marketDataService.getSubscribedSymbols()
      const isConnected = marketDataService.isConnected()
      
      // 获取最新价格统计
      const priceStats: { [symbol: string]: any } = {}
      subscribedSymbols.forEach(symbol => {
        const latestPrice = marketDataService.getLatestPrice(symbol)
        if (latestPrice) {
          priceStats[symbol] = {
            price: latestPrice.close,
            change: latestPrice.close - latestPrice.open,
            changePercent: ((latestPrice.close - latestPrice.open) / latestPrice.open) * 100,
            volume: latestPrice.volume,
            timestamp: latestPrice.timestamp
          }
        }
      })
      
      res.json({
        success: true,
        data: {
          connectionStatus: isConnected ? 'connected' : 'disconnected',
          totalSubscribedSymbols: subscribedSymbols.length,
          subscribedSymbols,
          priceStats,
          serverTime: new Date()
        }
      })
    } catch (error) {
      logger.error('获取市场统计信息失败:', error)
      res.status(500).json({
        success: false,
        error: '获取市场统计信息失败'
      })
    }
  }
)

export default router