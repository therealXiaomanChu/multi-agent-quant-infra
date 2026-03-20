import { Response } from 'express'
import Joi from 'joi'
import { Agent } from '@/models/Agent'
import { IAuthRequest, IApiResponse, IBacktestConfig, IEquityPoint } from '@/types'
import { AppError, asyncHandler } from '@/middleware/errorHandler'
import { RedisService } from '@/config/redis'

// 验证模式
const backtestConfigSchema = Joi.object({
  agentId: Joi.string().required().messages({
    'any.required': '代理ID是必需的'
  }),
  symbol: Joi.string().required().messages({
    'any.required': '交易品种是必需的'
  }),
  startDate: Joi.date().required().messages({
    'any.required': '开始日期是必需的'
  }),
  endDate: Joi.date().min(Joi.ref('startDate')).required().messages({
    'date.min': '结束日期必须晚于开始日期',
    'any.required': '结束日期是必需的'
  }),
  initialCapital: Joi.number().positive().default(10000).messages({
    'number.positive': '初始资金必须大于0'
  }),
  commission: Joi.number().min(0).max(0.1).default(0.001).messages({
    'number.min': '手续费不能为负数',
    'number.max': '手续费不能超过10%'
  }),
  slippage: Joi.number().min(0).max(0.1).default(0.001).messages({
    'number.min': '滑点不能为负数',
    'number.max': '滑点不能超过10%'
  }),
  maxPositionSize: Joi.number().positive().default(1).messages({
    'number.positive': '最大持仓必须大于0'
  }),
  riskFreeRate: Joi.number().min(0).max(1).default(0.02).messages({
    'number.min': '无风险利率不能为负数',
    'number.max': '无风险利率不能超过100%'
  })
})

const getBacktestSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('createdAt', 'totalReturn', 'sharpeRatio', 'maxDrawdown', 'winRate').default('createdAt'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  agentId: Joi.string().optional(),
  symbol: Joi.string().optional(),
  minReturn: Joi.number().optional(),
  maxDrawdown: Joi.number().optional()
})

class BacktestController {
  // 运行回测
  runBacktest = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证输入数据
    const { error, value } = backtestConfigSchema.validate(req.body)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const config: IBacktestConfig = value

    // 检查代理是否存在且用户有权限
    const agent = await Agent.findById(config.agentId)
    if (!agent) {
      throw new AppError('代理不存在', 404)
    }

    if (agent.author.toString() !== req.user.id && !agent.isPublic) {
      throw new AppError('无权对此代理进行回测', 403)
    }

    // 检查是否已有相同配置的回测正在运行
    const runningKey = `backtest_running:${config.agentId}:${config.symbol}:${config.startDate}:${config.endDate}`
    const isRunning = await RedisService.exists(runningKey)
    
    if (isRunning) {
      throw new AppError('相同配置的回测正在运行中', 400)
    }

    // 标记回测正在运行
    await RedisService.set(runningKey, '1', 300) // 5分钟超时

    try {
      // 运行回测（模拟）
      const backtestResult = await this.executeBacktest(agent, config)
      
      // 保存回测结果到代理
      agent.backtestResults.push(backtestResult)
      await agent.save()

      // 清除运行标记
      await RedisService.del(runningKey)

      const response: IApiResponse = {
        success: true,
        message: '回测完成',
        data: {
          backtest: backtestResult
        }
      }

      res.status(200).json(response)
    } catch (error) {
      // 清除运行标记
      await RedisService.del(runningKey)
      throw error
    }
  })

  // 获取回测结果列表
  getBacktests = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证查询参数
    const { error, value } = getBacktestSchema.validate(req.query)
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
      minReturn,
      maxDrawdown
    } = value

    // 构建查询条件
    const matchConditions: any = {
      author: req.user.id,
      'backtestResults.0': { $exists: true } // 确保有回测结果
    }

    if (agentId) {
      matchConditions._id = agentId
    }

    // 构建回测结果过滤条件
    const backtestFilters: any = {}
    if (symbol) backtestFilters['backtestResults.config.symbol'] = symbol
    if (minReturn !== undefined) backtestFilters['backtestResults.totalReturn'] = { $gte: minReturn }
    if (maxDrawdown !== undefined) {
      backtestFilters['backtestResults.maxDrawdown'] = { $lte: Math.abs(maxDrawdown) }
    }

    // 聚合查询
    const pipeline: any[] = [
      { $match: matchConditions },
      { $unwind: '$backtestResults' },
      { $match: backtestFilters },
      {
        $project: {
          _id: 0,
          agentId: '$_id',
          agentName: '$name',
          backtest: '$backtestResults'
        }
      },
      { $sort: { [`backtest.${sort}`]: order === 'asc' ? 1 : -1 } },
      {
        $facet: {
          backtests: [
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
    const backtests = result.backtests || []
    const total = result.totalCount[0]?.count || 0

    const response: IApiResponse = {
      success: true,
      message: '获取回测结果成功',
      data: {
        backtests: backtests.map((item: any) => ({
          agentId: item.agentId,
          agentName: item.agentName,
          ...item.backtest
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

  // 获取单个回测详情
  getBacktest = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { agentId, backtestId } = req.params

    const agent = await Agent.findById(agentId)
    if (!agent) {
      throw new AppError('代理不存在', 404)
    }

    // 检查访问权限
    if (!agent.isPublic && (!req.user || req.user.id !== agent.author.toString())) {
      throw new AppError('无权访问此回测结果', 403)
    }

    // 查找回测结果
    const backtest = agent.backtestResults.find(b => b.id === backtestId)
    if (!backtest) {
      throw new AppError('回测结果不存在', 404)
    }

    const response: IApiResponse = {
      success: true,
      message: '获取回测详情成功',
      data: {
        agent: {
          id: agent._id,
          name: agent.name,
          author: agent.author
        },
        backtest
      }
    }

    res.status(200).json(response)
  })

  // 删除回测结果
  deleteBacktest = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const { agentId, backtestId } = req.params

    const agent = await Agent.findById(agentId)
    if (!agent) {
      throw new AppError('代理不存在', 404)
    }

    // 检查权限
    if (agent.author.toString() !== req.user.id) {
      throw new AppError('无权删除此回测结果', 403)
    }

    // 删除回测结果
    const backtestIndex = agent.backtestResults.findIndex(b => b.id === backtestId)
    if (backtestIndex === -1) {
      throw new AppError('回测结果不存在', 404)
    }

    agent.backtestResults.splice(backtestIndex, 1)
    await agent.save()

    const response: IApiResponse = {
      success: true,
      message: '回测结果删除成功'
    }

    res.status(200).json(response)
  })

  // 比较多个回测结果
  compareBacktests = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { backtestIds } = req.body

    if (!Array.isArray(backtestIds) || backtestIds.length < 2 || backtestIds.length > 5) {
      throw new AppError('请选择2-5个回测结果进行比较', 400)
    }

    // 查找所有回测结果
    const backtests: any[] = []
    
    for (const backtestId of backtestIds) {
      const agent = await Agent.findOne({
        'backtestResults.id': backtestId
      })
      
      if (!agent) {
        throw new AppError(`回测结果 ${backtestId} 不存在`, 404)
      }

      // 检查访问权限
      if (!agent.isPublic && (!req.user || req.user.id !== agent.author.toString())) {
        throw new AppError('无权访问某些回测结果', 403)
      }

      const backtest = agent.backtestResults.find(b => b.id === backtestId)
      if (backtest) {
        backtests.push({
          agentId: agent._id,
          agentName: agent.name,
          ...backtest
        })
      }
    }

    // 计算比较指标
    const comparison = {
      backtests,
      summary: {
        bestReturn: backtests.reduce((best, current) => 
          current.totalReturn > best.totalReturn ? current : best
        ),
        bestSharpe: backtests.reduce((best, current) => 
          current.sharpeRatio > best.sharpeRatio ? current : best
        ),
        lowestDrawdown: backtests.reduce((best, current) => 
          current.maxDrawdown < best.maxDrawdown ? current : best
        ),
        highestWinRate: backtests.reduce((best, current) => 
          current.winRate > best.winRate ? current : best
        )
      },
      metrics: {
        avgReturn: backtests.reduce((sum, b) => sum + b.totalReturn, 0) / backtests.length,
        avgSharpe: backtests.reduce((sum, b) => sum + b.sharpeRatio, 0) / backtests.length,
        avgDrawdown: backtests.reduce((sum, b) => sum + b.maxDrawdown, 0) / backtests.length,
        avgWinRate: backtests.reduce((sum, b) => sum + b.winRate, 0) / backtests.length
      }
    }

    const response: IApiResponse = {
      success: true,
      message: '回测比较完成',
      data: {
        comparison
      }
    }

    res.status(200).json(response)
  })

  // 获取回测统计
  getBacktestStats = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 聚合统计
    const pipeline = [
      {
        $match: {
          author: req.user.id,
          'backtestResults.0': { $exists: true }
        }
      },
      { $unwind: '$backtestResults' },
      {
        $group: {
          _id: null,
          totalBacktests: { $sum: 1 },
          avgReturn: { $avg: '$backtestResults.totalReturn' },
          avgSharpe: { $avg: '$backtestResults.sharpeRatio' },
          avgDrawdown: { $avg: '$backtestResults.maxDrawdown' },
          avgWinRate: { $avg: '$backtestResults.winRate' },
          bestReturn: { $max: '$backtestResults.totalReturn' },
          worstReturn: { $min: '$backtestResults.totalReturn' },
          bestSharpe: { $max: '$backtestResults.sharpeRatio' },
          worstDrawdown: { $max: '$backtestResults.maxDrawdown' },
          symbols: { $addToSet: '$backtestResults.config.symbol' },
          agents: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          _id: 0,
          totalBacktests: 1,
          avgReturn: { $round: ['$avgReturn', 4] },
          avgSharpe: { $round: ['$avgSharpe', 4] },
          avgDrawdown: { $round: ['$avgDrawdown', 4] },
          avgWinRate: { $round: ['$avgWinRate', 2] },
          bestReturn: { $round: ['$bestReturn', 4] },
          worstReturn: { $round: ['$worstReturn', 4] },
          bestSharpe: { $round: ['$bestSharpe', 4] },
          worstDrawdown: { $round: ['$worstDrawdown', 4] },
          symbolCount: { $size: '$symbols' },
          agentCount: { $size: '$agents' },
          symbols: 1
        }
      }
    ]

    const [stats] = await Agent.aggregate(pipeline)

    const response: IApiResponse = {
      success: true,
      message: '获取回测统计成功',
      data: {
        stats: stats || {
          totalBacktests: 0,
          avgReturn: 0,
          avgSharpe: 0,
          avgDrawdown: 0,
          avgWinRate: 0,
          bestReturn: 0,
          worstReturn: 0,
          bestSharpe: 0,
          worstDrawdown: 0,
          symbolCount: 0,
          agentCount: 0,
          symbols: []
        }
      }
    }

    res.status(200).json(response)
  })

  // 执行回测的核心逻辑（模拟）
  private async executeBacktest(agent: any, config: IBacktestConfig): Promise<any> {
    // 模拟回测执行
    const { symbol, startDate, endDate, initialCapital, commission, slippage } = config
    
    // 生成模拟的历史数据和交易信号
    const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24))
    const trades: any[] = []
    const equityCurve: IEquityPoint[] = []
    
    let currentCapital = initialCapital
    let position = 0
    let totalTrades = 0
    let winningTrades = 0
    let totalCommission = 0
    let maxCapital = initialCapital
    let maxDrawdown = 0
    
    // 模拟每日交易
    for (let day = 0; day < days; day++) {
      const currentDate = new Date(startDate)
      currentDate.setDate(currentDate.getDate() + day)
      
      // 模拟价格（随机游走）
      const basePrice = 100 + Math.sin(day / 10) * 20 + (Math.random() - 0.5) * 10
      
      // 模拟交易信号（简化逻辑）
      const shouldTrade = Math.random() < 0.1 // 10%概率产生交易信号
      
      if (shouldTrade) {
        const action = position === 0 ? 'buy' : (Math.random() < 0.5 ? 'sell' : 'buy')
        const quantity = Math.floor(currentCapital * 0.1 / basePrice) // 10%资金
        
        if (quantity > 0) {
          const tradePrice = basePrice * (1 + (Math.random() - 0.5) * slippage * 2)
          const tradeCommission = quantity * tradePrice * commission
          
          if (action === 'buy' && currentCapital >= quantity * tradePrice + tradeCommission) {
            currentCapital -= quantity * tradePrice + tradeCommission
            position += quantity
            totalCommission += tradeCommission
            
            trades.push({
              date: currentDate,
              action: 'buy',
              quantity,
              price: tradePrice,
              commission: tradeCommission
            })
            totalTrades++
          } else if (action === 'sell' && position >= quantity) {
            const profit = quantity * (tradePrice - trades[trades.length - 1]?.price || tradePrice)
            currentCapital += quantity * tradePrice - tradeCommission
            position -= quantity
            totalCommission += tradeCommission
            
            trades.push({
              date: currentDate,
              action: 'sell',
              quantity,
              price: tradePrice,
              commission: tradeCommission,
              profit
            })
            
            if (profit > 0) winningTrades++
            totalTrades++
          }
        }
      }
      
      // 计算当前权益
      const currentEquity = currentCapital + position * basePrice
      equityCurve.push({
        date: currentDate,
        equity: currentEquity,
        drawdown: maxCapital > 0 ? (maxCapital - currentEquity) / maxCapital : 0
      })
      
      // 更新最大权益和最大回撤
      if (currentEquity > maxCapital) {
        maxCapital = currentEquity
      }
      
      const currentDrawdown = (maxCapital - currentEquity) / maxCapital
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown
      }
    }
    
    // 计算最终指标
    const finalEquity = currentCapital + position * (100 + Math.sin(days / 10) * 20)
    const totalReturn = (finalEquity - initialCapital) / initialCapital
    const annualizedReturn = Math.pow(1 + totalReturn, 365 / days) - 1
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0
    
    // 计算夏普比率（简化）
    const returns = equityCurve.map((point, index) => {
      if (index === 0) return 0
      return (point.equity - equityCurve[index - 1].equity) / equityCurve[index - 1].equity
    }).slice(1)
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const returnStd = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
    const sharpeRatio = returnStd > 0 ? (annualizedReturn - config.riskFreeRate) / (returnStd * Math.sqrt(365)) : 0
    
    return {
      id: `backtest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      config,
      startDate,
      endDate,
      duration: days,
      initialCapital,
      finalCapital: finalEquity,
      totalReturn,
      annualizedReturn,
      maxDrawdown,
      sharpeRatio,
      totalTrades,
      winningTrades,
      losingTrades: totalTrades - winningTrades,
      winRate,
      totalCommission,
      netProfit: finalEquity - initialCapital - totalCommission,
      trades,
      equityCurve,
      createdAt: new Date()
    }
  }
}

export const backtestController = new BacktestController()
export default backtestController