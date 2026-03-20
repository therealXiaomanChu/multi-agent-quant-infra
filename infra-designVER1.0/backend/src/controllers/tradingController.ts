import { Response } from 'express'
import Joi from 'joi'
import { Agent } from '@/models/Agent'
import { User } from '@/models/User'
import { IAuthRequest, IApiResponse, ITradingSignal, ITradeRecord } from '@/types'
import { AppError, asyncHandler } from '@/middleware/errorHandler'
import { RedisService } from '@/config/redis'

// 验证模式
const executeTradeSchema = Joi.object({
  agentId: Joi.string().required().messages({
    'any.required': '代理ID是必需的'
  }),
  symbol: Joi.string().required().messages({
    'any.required': '交易品种是必需的'
  }),
  action: Joi.string().valid('buy', 'sell').required().messages({
    'any.only': '交易动作必须是buy或sell',
    'any.required': '交易动作是必需的'
  }),
  quantity: Joi.number().positive().required().messages({
    'number.positive': '交易数量必须大于0',
    'any.required': '交易数量是必需的'
  }),
  price: Joi.number().positive().optional().messages({
    'number.positive': '价格必须大于0'
  }),
  orderType: Joi.string().valid('market', 'limit', 'stop', 'stop_limit').default('market').messages({
    'any.only': '无效的订单类型'
  }),
  stopPrice: Joi.number().positive().optional().messages({
    'number.positive': '止损价格必须大于0'
  }),
  timeInForce: Joi.string().valid('GTC', 'IOC', 'FOK', 'DAY').default('GTC').messages({
    'any.only': '无效的时效类型'
  })
})

const getTradesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('timestamp', 'profit', 'quantity', 'price').default('timestamp'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  agentId: Joi.string().optional(),
  symbol: Joi.string().optional(),
  action: Joi.string().valid('buy', 'sell').optional(),
  status: Joi.string().valid('pending', 'filled', 'cancelled', 'rejected').optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional()
})

class TradingController {
  // 执行交易
  executeTrade = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证输入数据
    const { error, value } = executeTradeSchema.validate(req.body)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { agentId, symbol, action, quantity, price, orderType, stopPrice, timeInForce } = value

    // 检查代理是否存在且用户有权限
    const agent = await Agent.findById(agentId)
    if (!agent) {
      throw new AppError('代理不存在', 404)
    }

    if (agent.author.toString() !== req.user.id && !agent.isPublic) {
      throw new AppError('无权使用此代理', 403)
    }

    if (!agent.isActive) {
      throw new AppError('代理未激活', 400)
    }

    // 模拟交易执行（实际项目中这里会调用真实的交易API）
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const executionPrice = price || this.getMarketPrice(symbol) // 模拟获取市场价格
    const executionTime = new Date()
    
    // 模拟交易结果
    const isSuccessful = Math.random() > 0.1 // 90%成功率
    const status = isSuccessful ? 'filled' : 'rejected'
    const executedQuantity = isSuccessful ? quantity : 0
    
    // 计算手续费（模拟）
    const commission = executedQuantity * executionPrice * 0.001 // 0.1%手续费
    
    // 创建交易记录
    const tradeRecord: ITradeRecord = {
      tradeId,
      symbol,
      action,
      quantity,
      executedQuantity,
      price: executionPrice,
      orderType,
      stopPrice,
      timeInForce,
      status,
      timestamp: executionTime,
      commission,
      profit: 0 // 初始利润为0，平仓时计算
    }

    // 更新代理的交易记录
    agent.trades.push(tradeRecord)
    
    // 更新代理统计
    if (status === 'filled') {
      agent.stats.totalTrades += 1
      agent.stats.totalVolume += executedQuantity * executionPrice
      
      // 如果是卖出操作，计算利润（简化逻辑）
      if (action === 'sell') {
        const profit = this.calculateProfit(agent.trades, symbol, tradeRecord)
        tradeRecord.profit = profit
        agent.stats.totalProfit += profit
        
        if (profit > 0) {
          agent.stats.winningTrades += 1
        } else {
          agent.stats.losingTrades += 1
        }
        
        agent.stats.winRate = agent.stats.winningTrades / (agent.stats.winningTrades + agent.stats.losingTrades) * 100
      }
    }
    
    await agent.save()

    // 更新用户统计
    const user = await User.findById(req.user.id)
    if (user) {
      await user.updateStats()
    }

    // 缓存交易信号（用于实时推送）
    const tradingSignal: ITradingSignal = {
      agentId,
      agentName: agent.name,
      symbol,
      action,
      quantity: executedQuantity,
      price: executionPrice,
      timestamp: executionTime,
      confidence: Math.random() * 0.3 + 0.7, // 模拟置信度70-100%
      reason: `${agent.name}代理执行${action === 'buy' ? '买入' : '卖出'}信号`
    }

    await RedisService.lPush('trading_signals', JSON.stringify(tradingSignal))
    await RedisService.expire('trading_signals', 3600) // 1小时过期

    const response: IApiResponse = {
      success: true,
      message: status === 'filled' ? '交易执行成功' : '交易执行失败',
      data: {
        trade: {
          tradeId,
          agentId,
          agentName: agent.name,
          symbol,
          action,
          quantity,
          executedQuantity,
          price: executionPrice,
          orderType,
          status,
          timestamp: executionTime,
          commission,
          profit: tradeRecord.profit
        }
      }
    }

    res.status(status === 'filled' ? 200 : 400).json(response)
  })

  // 获取交易记录
  getTrades = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证查询参数
    const { error, value } = getTradesSchema.validate(req.query)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const {
      page,
      limit,
      sort,
      order,
      agentId,
      symbol,
      action,
      status,
      startDate,
      endDate
    } = value

    // 构建查询条件
    const matchConditions: any = {
      author: req.user.id
    }

    const tradeFilters: any = {}
    if (symbol) tradeFilters['trades.symbol'] = symbol
    if (action) tradeFilters['trades.action'] = action
    if (status) tradeFilters['trades.status'] = status
    if (startDate || endDate) {
      tradeFilters['trades.timestamp'] = {}
      if (startDate) tradeFilters['trades.timestamp'].$gte = new Date(startDate)
      if (endDate) tradeFilters['trades.timestamp'].$lte = new Date(endDate)
    }

    if (agentId) {
      matchConditions._id = agentId
    }

    // 聚合查询
    const pipeline: any[] = [
      { $match: matchConditions },
      { $unwind: '$trades' },
      { $match: tradeFilters },
      {
        $project: {
          _id: 0,
          agentId: '$_id',
          agentName: '$name',
          trade: '$trades'
        }
      },
      { $sort: { [`trade.${sort}`]: order === 'asc' ? 1 : -1 } },
      {
        $facet: {
          trades: [
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ],
          totalCount: [
            { $count: 'count' }
          ]
        }
      }
    ]

    const [result] = await Agent.aggregate(pipeline)
    const trades = result.trades || []
    const total = result.totalCount[0]?.count || 0

    const response: IApiResponse = {
      success: true,
      message: '获取交易记录成功',
      data: {
        trades: trades.map((item: any) => ({
          agentId: item.agentId,
          agentName: item.agentName,
          ...item.trade
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    }

    res.status(200).json(response)
  })

  // 获取代理的交易记录
  getAgentTrades = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { agentId } = req.params

    // 验证查询参数
    const { error, value } = getTradesSchema.validate(req.query)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { page, limit, sort, order } = value

    const agent = await Agent.findById(agentId)
    if (!agent) {
      throw new AppError('代理不存在', 404)
    }

    // 检查访问权限
    if (!agent.isPublic && (!req.user || req.user.id !== agent.author.toString())) {
      throw new AppError('无权访问此代理的交易记录', 403)
    }

    // 排序和分页
    const sortedTrades = agent.trades.sort((a, b) => {
      const aValue = a[sort as keyof ITradeRecord]
      const bValue = b[sort as keyof ITradeRecord]
      
      if (sort === 'timestamp') {
        return order === 'asc' 
          ? new Date(aValue as Date).getTime() - new Date(bValue as Date).getTime()
          : new Date(bValue as Date).getTime() - new Date(aValue as Date).getTime()
      }
      
      return order === 'asc' 
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number)
    })

    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedTrades = sortedTrades.slice(startIndex, endIndex)

    const response: IApiResponse = {
      success: true,
      message: '获取代理交易记录成功',
      data: {
        agent: {
          id: agent._id,
          name: agent.name,
          author: agent.author
        },
        trades: paginatedTrades,
        pagination: {
          page,
          limit,
          total: agent.trades.length,
          pages: Math.ceil(agent.trades.length / limit)
        }
      }
    }

    res.status(200).json(response)
  })

  // 获取交易统计
  getTradingStats = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const { agentId } = req.query

    // 构建查询条件
    const matchConditions: any = { author: req.user.id }
    if (agentId) {
      matchConditions._id = agentId
    }

    // 聚合统计
    const pipeline = [
      { $match: matchConditions },
      { $unwind: '$trades' },
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          totalVolume: { $sum: { $multiply: ['$trades.executedQuantity', '$trades.price'] } },
          totalProfit: { $sum: '$trades.profit' },
          totalCommission: { $sum: '$trades.commission' },
          winningTrades: {
            $sum: {
              $cond: [{ $gt: ['$trades.profit', 0] }, 1, 0]
            }
          },
          losingTrades: {
            $sum: {
              $cond: [{ $lt: ['$trades.profit', 0] }, 1, 0]
            }
          },
          avgProfit: { $avg: '$trades.profit' },
          maxProfit: { $max: '$trades.profit' },
          minProfit: { $min: '$trades.profit' },
          symbols: { $addToSet: '$trades.symbol' }
        }
      },
      {
        $project: {
          _id: 0,
          totalTrades: 1,
          totalVolume: 1,
          totalProfit: 1,
          totalCommission: 1,
          winningTrades: 1,
          losingTrades: 1,
          winRate: {
            $cond: [
              { $eq: ['$totalTrades', 0] },
              0,
              { $multiply: [{ $divide: ['$winningTrades', '$totalTrades'] }, 100] }
            ]
          },
          avgProfit: 1,
          maxProfit: 1,
          minProfit: 1,
          netProfit: { $subtract: ['$totalProfit', '$totalCommission'] },
          symbolCount: { $size: '$symbols' },
          symbols: 1
        }
      }
    ]

    const [stats] = await Agent.aggregate(pipeline)

    const response: IApiResponse = {
      success: true,
      message: '获取交易统计成功',
      data: {
        stats: stats || {
          totalTrades: 0,
          totalVolume: 0,
          totalProfit: 0,
          totalCommission: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          avgProfit: 0,
          maxProfit: 0,
          minProfit: 0,
          netProfit: 0,
          symbolCount: 0,
          symbols: []
        }
      }
    }

    res.status(200).json(response)
  })

  // 获取实时交易信号
  getTradingSignals = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50

    // 从Redis获取最新的交易信号
    const signals = await RedisService.lRange('trading_signals', 0, limit - 1)
    const parsedSignals = signals.map(signal => JSON.parse(signal))

    const response: IApiResponse = {
      success: true,
      message: '获取交易信号成功',
      data: {
        signals: parsedSignals
      }
    }

    res.status(200).json(response)
  })

  // 取消交易（模拟）
  cancelTrade = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const { tradeId } = req.params

    // 查找包含该交易的代理
    const agent = await Agent.findOne({
      author: req.user.id,
      'trades.tradeId': tradeId
    })

    if (!agent) {
      throw new AppError('交易不存在', 404)
    }

    // 查找具体的交易
    const trade = agent.trades.find(t => t.tradeId === tradeId)
    if (!trade) {
      throw new AppError('交易不存在', 404)
    }

    // 只能取消待处理的交易
    if (trade.status !== 'pending') {
      throw new AppError('只能取消待处理的交易', 400)
    }

    // 更新交易状态
    trade.status = 'cancelled'
    await agent.save()

    const response: IApiResponse = {
      success: true,
      message: '交易取消成功',
      data: {
        trade: {
          tradeId: trade.tradeId,
          status: trade.status
        }
      }
    }

    res.status(200).json(response)
  })

  // 辅助方法：获取市场价格（模拟）
  private getMarketPrice(symbol: string): number {
    // 模拟不同品种的价格
    const basePrices: { [key: string]: number } = {
      'BTCUSDT': 45000,
      'ETHUSDT': 3000,
      'AAPL': 150,
      'GOOGL': 2800,
      'TSLA': 800,
      'EURUSD': 1.1,
      'GBPUSD': 1.3,
      'USDJPY': 110
    }

    const basePrice = basePrices[symbol] || 100
    // 添加随机波动 ±2%
    const volatility = (Math.random() - 0.5) * 0.04
    return basePrice * (1 + volatility)
  }

  // 辅助方法：计算利润（简化逻辑）
  private calculateProfit(trades: ITradeRecord[], symbol: string, sellTrade: ITradeRecord): number {
    // 查找最近的买入交易
    const buyTrades = trades
      .filter(t => t.symbol === symbol && t.action === 'buy' && t.status === 'filled')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    if (buyTrades.length === 0) {
      return 0 // 没有对应的买入交易
    }

    const buyTrade = buyTrades[0]
    const profit = (sellTrade.price - buyTrade.price) * sellTrade.executedQuantity - sellTrade.commission - buyTrade.commission
    
    return Math.round(profit * 100) / 100 // 保留两位小数
  }
}

export const tradingController = new TradingController()
export default tradingController