import { Agent } from '@/models/Agent'
import { RedisService } from '@/config/redis'
import { IBacktestConfig, IMarketData, ITradeRecord, IEquityPoint } from '@/types'

interface IBacktestResult {
  id: string
  agentId: string
  config: IBacktestConfig
  performance: {
    totalReturn: number
    annualizedReturn: number
    sharpeRatio: number
    maxDrawdown: number
    winRate: number
    totalTrades: number
    profitFactor: number
    averageWin: number
    averageLoss: number
    largestWin: number
    largestLoss: number
  }
  trades: ITradeRecord[]
  equityCurve: IEquityPoint[]
  startTime: Date
  endTime: Date
  duration: number
  status: 'running' | 'completed' | 'failed'
  error?: string
}

interface IBacktestPosition {
  symbol: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  entryTime: Date
}

interface IBacktestContext {
  balance: number
  equity: number
  positions: IBacktestPosition[]
  trades: ITradeRecord[]
  equityCurve: IEquityPoint[]
  maxEquity: number
  drawdown: number
  maxDrawdown: number
}

class BacktestService {
  private runningBacktests = new Map<string, IBacktestResult>()

  // 运行回测
  public async runBacktest(agentId: string, config: IBacktestConfig): Promise<string> {
    // 验证代理
    const agent = await Agent.findById(agentId)
    if (!agent) {
      throw new Error('代理不存在')
    }

    // 生成回测ID
    const backtestId = `backtest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 创建回测结果对象
    const result: IBacktestResult = {
      id: backtestId,
      agentId,
      config,
      performance: {
        totalReturn: 0,
        annualizedReturn: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        totalTrades: 0,
        profitFactor: 0,
        averageWin: 0,
        averageLoss: 0,
        largestWin: 0,
        largestLoss: 0
      },
      trades: [],
      equityCurve: [],
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      status: 'running'
    }

    // 保存到运行中的回测
    this.runningBacktests.set(backtestId, result)
    
    // 保存到Redis
    await RedisService.set(`backtest:${backtestId}`, JSON.stringify(result), 7 * 24 * 60 * 60) // 7天
    
    // 异步执行回测
    this.executeBacktest(backtestId, agent, config).catch(error => {
      console.error(`回测 ${backtestId} 执行失败:`, error)
      result.status = 'failed'
      result.error = error.message
      RedisService.set(`backtest:${backtestId}`, JSON.stringify(result), 7 * 24 * 60 * 60)
    })
    
    console.log(`开始回测: ${backtestId} (代理: ${agentId})`)
    return backtestId
  }

  // 获取回测结果
  public async getBacktestResult(backtestId: string): Promise<IBacktestResult | null> {
    // 先从内存查找
    const runningResult = this.runningBacktests.get(backtestId)
    if (runningResult) {
      return runningResult
    }

    // 从Redis查找
    const resultData = await RedisService.get(`backtest:${backtestId}`)
    if (resultData) {
      return JSON.parse(resultData)
    }

    return null
  }

  // 获取代理的回测历史
  public async getAgentBacktestHistory(agentId: string): Promise<IBacktestResult[]> {
    const backtestIds = await RedisService.lRange(`agent_backtests:${agentId}`, 0, -1)
    const results: IBacktestResult[] = []
    
    for (const backtestId of backtestIds) {
      const result = await this.getBacktestResult(backtestId)
      if (result) {
        results.push(result)
      }
    }
    
    return results.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }

  // 比较多个回测结果
  public async compareBacktests(backtestIds: string[]): Promise<{
    backtests: IBacktestResult[]
    comparison: any
  }> {
    const backtests: IBacktestResult[] = []
    
    for (const id of backtestIds) {
      const result = await this.getBacktestResult(id)
      if (result && result.status === 'completed') {
        backtests.push(result)
      }
    }
    
    if (backtests.length === 0) {
      throw new Error('没有找到有效的回测结果')
    }
    
    // 生成比较数据
    const comparison = {
      performance: backtests.map(bt => ({
        backtestId: bt.id,
        agentId: bt.agentId,
        totalReturn: bt.performance.totalReturn,
        sharpeRatio: bt.performance.sharpeRatio,
        maxDrawdown: bt.performance.maxDrawdown,
        winRate: bt.performance.winRate,
        totalTrades: bt.performance.totalTrades
      })),
      bestPerformer: {
        byReturn: backtests.reduce((best, current) => 
          current.performance.totalReturn > best.performance.totalReturn ? current : best
        ),
        bySharpe: backtests.reduce((best, current) => 
          current.performance.sharpeRatio > best.performance.sharpeRatio ? current : best
        ),
        byDrawdown: backtests.reduce((best, current) => 
          current.performance.maxDrawdown < best.performance.maxDrawdown ? current : best
        )
      }
    }
    
    return { backtests, comparison }
  }

  // 删除回测结果
  public async deleteBacktest(backtestId: string): Promise<boolean> {
    const result = await this.getBacktestResult(backtestId)
    if (!result) {
      return false
    }
    
    // 从Redis删除
    await RedisService.del(`backtest:${backtestId}`)
    
    // 从代理回测列表中移除
    const backtestIds = await RedisService.lRange(`agent_backtests:${result.agentId}`, 0, -1)
    const filteredIds = backtestIds.filter(id => id !== backtestId)
    
    await RedisService.del(`agent_backtests:${result.agentId}`)
    if (filteredIds.length > 0) {
      for (const id of filteredIds) {
        await RedisService.lPush(`agent_backtests:${result.agentId}`, id)
      }
    }
    
    // 从内存删除
    this.runningBacktests.delete(backtestId)
    
    return true
  }

  // 执行回测
  private async executeBacktest(backtestId: string, agent: any, config: IBacktestConfig) {
    const result = this.runningBacktests.get(backtestId)!
    
    try {
      // 初始化回测上下文
      const context: IBacktestContext = {
        balance: config.initialCapital,
        equity: config.initialCapital,
        positions: [],
        trades: [],
        equityCurve: [{
          timestamp: config.startDate,
          equity: config.initialCapital,
          drawdown: 0
        }],
        maxEquity: config.initialCapital,
        drawdown: 0,
        maxDrawdown: 0
      }
      
      // 生成历史市场数据
      const marketData = await this.generateHistoricalData(config)
      
      // 执行策略
      await this.executeStrategy(context, agent, config, marketData)
      
      // 计算性能指标
      const performance = this.calculatePerformance(context, config)
      
      // 更新结果
      result.performance = performance
      result.trades = context.trades
      result.equityCurve = context.equityCurve
      result.endTime = new Date()
      result.duration = result.endTime.getTime() - result.startTime.getTime()
      result.status = 'completed'
      
      // 保存到Redis
      await RedisService.set(`backtest:${backtestId}`, JSON.stringify(result), 7 * 24 * 60 * 60)
      
      // 添加到代理回测列表
      await RedisService.lPush(`agent_backtests:${agent._id}`, backtestId)
      
      // 从运行中移除
      this.runningBacktests.delete(backtestId)
      
      console.log(`回测完成: ${backtestId}, 总收益: ${performance.totalReturn.toFixed(2)}%`)
      
    } catch (error) {
      result.status = 'failed'
      result.error = error.message
      result.endTime = new Date()
      
      await RedisService.set(`backtest:${backtestId}`, JSON.stringify(result), 7 * 24 * 60 * 60)
      this.runningBacktests.delete(backtestId)
      
      throw error
    }
  }

  // 生成历史市场数据
  private async generateHistoricalData(config: IBacktestConfig): Promise<IMarketData[]> {
    const data: IMarketData[] = []
    const startTime = new Date(config.startDate).getTime()
    const endTime = new Date(config.endDate).getTime()
    const interval = 60 * 1000 // 1分钟间隔
    
    let currentTime = startTime
    let currentPrice = 45000 // 起始价格
    
    while (currentTime <= endTime) {
      // 模拟价格波动
      const volatility = 0.02 // 2% 波动率
      const change = (Math.random() - 0.5) * volatility
      currentPrice *= (1 + change)
      currentPrice = Math.max(currentPrice, 1000) // 最低价格
      
      data.push({
        symbol: config.symbol,
        price: currentPrice,
        volume: Math.random() * 1000000,
        change24h: change,
        high24h: currentPrice * (1 + Math.random() * 0.02),
        low24h: currentPrice * (1 - Math.random() * 0.02),
        timestamp: new Date(currentTime)
      })
      
      currentTime += interval
    }
    
    return data
  }

  // 执行策略
  private async executeStrategy(
    context: IBacktestContext,
    agent: any,
    config: IBacktestConfig,
    marketData: IMarketData[]
  ) {
    for (let i = 0; i < marketData.length; i++) {
      const currentData = marketData[i]
      const historicalData = marketData.slice(Math.max(0, i - 100), i + 1) // 最近100个数据点
      
      // 更新持仓价值
      this.updatePositions(context, currentData)
      
      // 生成交易信号（模拟策略执行）
      const signal = this.generateTradingSignal(agent, historicalData, currentData)
      
      if (signal) {
        await this.executeBacktestTrade(context, signal, currentData, config)
      }
      
      // 更新权益曲线
      if (i % 60 === 0) { // 每小时记录一次
        context.equityCurve.push({
          timestamp: currentData.timestamp,
          equity: context.equity,
          drawdown: context.drawdown
        })
      }
    }
  }

  // 生成交易信号（模拟）
  private generateTradingSignal(agent: any, historicalData: IMarketData[], currentData: IMarketData): any {
    // 这里应该执行实际的策略代码
    // 现在使用简单的移动平均策略作为示例
    
    if (historicalData.length < 20) return null
    
    const prices = historicalData.map(d => d.price)
    const sma20 = prices.slice(-20).reduce((sum, price) => sum + price, 0) / 20
    const sma5 = prices.slice(-5).reduce((sum, price) => sum + price, 0) / 5
    
    // 金叉买入，死叉卖出
    if (sma5 > sma20 && prices[prices.length - 2] <= sma20) {
      return {
        action: 'buy',
        symbol: currentData.symbol,
        quantity: null, // 使用默认数量
        price: currentData.price,
        timestamp: currentData.timestamp
      }
    } else if (sma5 < sma20 && prices[prices.length - 2] >= sma20) {
      return {
        action: 'sell',
        symbol: currentData.symbol,
        quantity: null,
        price: currentData.price,
        timestamp: currentData.timestamp
      }
    }
    
    return null
  }

  // 执行回测交易
  private async executeBacktestTrade(
    context: IBacktestContext,
    signal: any,
    marketData: IMarketData,
    config: IBacktestConfig
  ) {
    const commission = 0.001 // 0.1% 手续费
    
    if (signal.action === 'buy') {
      // 买入
      const tradeValue = context.balance * 0.95 // 使用95%的资金
      const quantity = tradeValue / marketData.price
      const commissionCost = tradeValue * commission
      
      if (tradeValue > commissionCost) {
        const trade: ITradeRecord = {
          id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          agentId: config.agentId || '',
          symbol: signal.symbol,
          side: 'long',
          size: quantity,
          entryPrice: marketData.price,
          exitPrice: null,
          pnl: 0,
          commission: commissionCost,
          timestamp: marketData.timestamp,
          status: 'open'
        }
        
        context.positions.push({
          symbol: signal.symbol,
          side: 'long',
          size: quantity,
          entryPrice: marketData.price,
          entryTime: marketData.timestamp
        })
        
        context.balance -= (tradeValue + commissionCost)
        context.trades.push(trade)
      }
    } else if (signal.action === 'sell' && context.positions.length > 0) {
      // 卖出所有持仓
      for (const position of context.positions) {
        const tradeValue = position.size * marketData.price
        const commissionCost = tradeValue * commission
        const pnl = (marketData.price - position.entryPrice) * position.size - commissionCost
        
        const trade: ITradeRecord = {
          id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          agentId: config.agentId || '',
          symbol: position.symbol,
          side: 'short',
          size: position.size,
          entryPrice: position.entryPrice,
          exitPrice: marketData.price,
          pnl,
          commission: commissionCost,
          timestamp: marketData.timestamp,
          status: 'closed'
        }
        
        context.balance += (tradeValue - commissionCost)
        context.trades.push(trade)
      }
      
      context.positions = []
    }
  }

  // 更新持仓
  private updatePositions(context: IBacktestContext, marketData: IMarketData) {
    let totalPositionValue = 0
    
    for (const position of context.positions) {
      if (position.symbol === marketData.symbol) {
        totalPositionValue += position.size * marketData.price
      }
    }
    
    context.equity = context.balance + totalPositionValue
    
    // 更新回撤
    if (context.equity > context.maxEquity) {
      context.maxEquity = context.equity
    }
    
    context.drawdown = (context.maxEquity - context.equity) / context.maxEquity
    context.maxDrawdown = Math.max(context.maxDrawdown, context.drawdown)
  }

  // 计算性能指标
  private calculatePerformance(context: IBacktestContext, config: IBacktestConfig): any {
    const totalReturn = ((context.equity - config.initialCapital) / config.initialCapital) * 100
    
    // 计算年化收益率
    const days = (new Date(config.endDate).getTime() - new Date(config.startDate).getTime()) / (1000 * 60 * 60 * 24)
    const annualizedReturn = Math.pow(context.equity / config.initialCapital, 365 / days) - 1
    
    // 计算胜率和其他指标
    const winningTrades = context.trades.filter(t => t.pnl > 0)
    const losingTrades = context.trades.filter(t => t.pnl < 0)
    const winRate = context.trades.length > 0 ? (winningTrades.length / context.trades.length) * 100 : 0
    
    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0)
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0))
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0
    
    const averageWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0
    const averageLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0
    
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.pnl)) : 0
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.pnl)) : 0
    
    // 计算夏普比率（简化版）
    const returns = context.equityCurve.map((point, i) => {
      if (i === 0) return 0
      return (point.equity - context.equityCurve[i - 1].equity) / context.equityCurve[i - 1].equity
    }).slice(1)
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const returnStd = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
    const sharpeRatio = returnStd > 0 ? (avgReturn / returnStd) * Math.sqrt(252) : 0 // 年化
    
    return {
      totalReturn: Math.round(totalReturn * 100) / 100,
      annualizedReturn: Math.round(annualizedReturn * 10000) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      maxDrawdown: Math.round(context.maxDrawdown * 10000) / 100,
      winRate: Math.round(winRate * 100) / 100,
      totalTrades: context.trades.length,
      profitFactor: Math.round(profitFactor * 100) / 100,
      averageWin: Math.round(averageWin * 100) / 100,
      averageLoss: Math.round(averageLoss * 100) / 100,
      largestWin: Math.round(largestWin * 100) / 100,
      largestLoss: Math.round(largestLoss * 100) / 100
    }
  }
}

export default BacktestService