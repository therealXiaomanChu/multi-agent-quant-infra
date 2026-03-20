import { Agent } from '@/models/Agent'
import { Trade } from '@/models/Trade'
import { RedisService } from '@/config/redis'
import { ITradingSignal, IMarketData, ITradeRecord, ITrade } from '@/types'
import { getMarketDataService } from './marketDataService'
import { getWebSocketService } from './websocketService'
import logger from '@/utils/logger'
import Redis from 'ioredis'

interface IPosition {
  symbol: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  currentPrice: number
  unrealizedPnL: number
  timestamp: Date
}

interface IAgentContext {
  agentId: string
  balance: number
  positions: IPosition[]
  trades: ITradeRecord[]
  equity: number
  drawdown: number
  maxDrawdown: number
  isActive: boolean
}

class TradingEngine {
  private agentContexts = new Map<string, IAgentContext>()
  private marketData = new Map<string, IMarketData>()
  private redis: Redis
  private marketDataService = getMarketDataService()
  private isRunning = false
  private marketDataInterval?: NodeJS.Timeout
  private tradingInterval?: NodeJS.Timeout
  private commission = 0.001 // 0.1% 手续费
  private slippage = 0.0005 // 0.05% 滑点

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    })
    
    this.initializeMarketData()
    this.setupMarketDataListener()
  }

  private setupMarketDataListener() {
    // 监听市场数据服务的实时数据
    this.marketDataService.on('data', (data: IMarketData) => {
      this.handleRealTimeMarketData(data)
    })
  }

  // 处理实时市场数据
  private handleRealTimeMarketData(data: IMarketData) {
    // 更新本地市场数据缓存
    this.marketData.set(data.symbol, data)
    
    // 更新所有持仓的未实现盈亏
    for (const context of this.agentContexts.values()) {
      this.updateUnrealizedPnL(context)
      this.updateEquity(context)
    }
    
    // 缓存到Redis
    RedisService.set(`market_data:${data.symbol}`, JSON.stringify(data), 60).catch(err => {
      logger.error('缓存市场数据失败:', err)
    })
    
    logger.debug(`更新市场数据: ${data.symbol} @ ${data.price}`)
  }

  // 启动交易引擎
  public async start() {
    if (this.isRunning) return
    
    this.isRunning = true
    logger.info('交易引擎启动')
    
    // 启动市场数据服务
    await this.marketDataService.start()
    
    // 启动市场数据更新
    this.startMarketDataUpdates()
    
    // 启动交易处理
    this.startTradingLoop()
  }

  // 停止交易引擎
  public async stop() {
    if (!this.isRunning) return
    
    this.isRunning = false
    
    if (this.marketDataInterval) {
      clearInterval(this.marketDataInterval)
    }
    
    if (this.tradingInterval) {
      clearInterval(this.tradingInterval)
    }
    
    // 停止市场数据服务
    await this.marketDataService.stop()
    await this.redis.quit()
    
    logger.info('交易引擎停止')
  }

  // 注册代理
  public async registerAgent(agentId: string, initialBalance: number = 10000) {
    if (this.agentContexts.has(agentId)) {
      return this.agentContexts.get(agentId)!
    }

    const context: IAgentContext = {
      agentId,
      balance: initialBalance,
      positions: [],
      trades: [],
      equity: initialBalance,
      drawdown: 0,
      maxDrawdown: 0,
      isActive: true
    }

    this.agentContexts.set(agentId, context)
    
    // 保存到Redis
    await RedisService.set(`agent_context:${agentId}`, JSON.stringify(context), 24 * 60 * 60)
    
    console.log(`代理 ${agentId} 已注册到交易引擎`)
    return context
  }

  // 注销代理
  public async unregisterAgent(agentId: string) {
    const context = this.agentContexts.get(agentId)
    if (context) {
      context.isActive = false
      await RedisService.del(`agent_context:${agentId}`)
      this.agentContexts.delete(agentId)
      console.log(`代理 ${agentId} 已从交易引擎注销`)
    }
  }

  // 执行交易
  public async executeTrade(agentId: string, signal: ITradingSignal): Promise<ITrade | null> {
    const context = this.agentContexts.get(agentId)
    if (!context || !context.isActive) {
      logger.warn(`Agent ${agentId} 不活跃或不存在`)
      return null
    }

    if (!this.validateTradingSignal(signal)) {
      logger.warn(`交易信号验证失败: ${JSON.stringify(signal)}`)
      return null
    }

    const marketData = this.marketDataService.getLatestPrice(signal.symbol)
    if (!marketData) {
      logger.warn(`无法获取 ${signal.symbol} 的市场数据`)
      return null
    }

    const price = marketData.close
    const size = this.calculateTradeSize(context, signal, price)
    
    if (size <= 0) {
      logger.warn(`计算的交易大小无效: ${size}`)
      return null
    }

    try {
      // 创建交易记录
      const trade = new Trade({
        agentId,
        userId: context.agentId, // 假设agentId也是userId，实际应该从context获取
        symbol: signal.symbol,
        side: signal.action === 'buy' ? 'buy' : 'sell',
        type: 'market',
        quantity: size,
        requestedPrice: price,
        executedPrice: price * (signal.action === 'buy' ? (1 + this.slippage) : (1 - this.slippage)),
        executedQuantity: size,
        commission: price * size * this.commission,
        status: 'filled',
        submittedAt: new Date(),
        executedAt: new Date(),
        marketData: {
          symbol: marketData.symbol,
          timestamp: marketData.timestamp,
          open: marketData.open,
          high: marketData.high,
          low: marketData.low,
          close: marketData.close,
          volume: marketData.volume
        }
      })

      await trade.save()

      // 更新余额
      context.balance -= trade.commission
      
      // 更新持仓
      this.updatePositionFromTrade(context, trade)
      
      // 更新权益
      this.updateEquity(context)
      
      // 保存交易记录到上下文
      const tradeRecord: ITradeRecord = {
        id: trade._id.toString(),
        agentId,
        symbol: signal.symbol,
        side: signal.action === 'buy' ? 'long' : 'short',
        size,
        entryPrice: trade.executedPrice!,
        exitPrice: null,
        pnl: 0,
        commission: trade.commission,
        timestamp: new Date(),
        status: 'open'
      }
      
      context.trades.push(tradeRecord)
      
      // 保存上下文
      await RedisService.set(`agent_context:${agentId}`, JSON.stringify(context), 24 * 60 * 60)
      
      // 通知WebSocket
      const wsService = getWebSocketService()
      if (wsService) {
        wsService.notifyTradeExecution(trade)
      }
      
      logger.info(`执行交易: ${agentId} ${signal.action} ${signal.symbol} ${size}@${trade.executedPrice}`)
      
      return trade
    } catch (error) {
      logger.error('执行交易失败:', error)
      return null
    }
  }

  // 平仓
  public async closePosition(agentId: string, positionIndex: number): Promise<ITradeRecord | null> {
    const context = this.agentContexts.get(agentId)
    if (!context || !context.isActive) {
      throw new Error('代理未注册或已停用')
    }

    if (positionIndex < 0 || positionIndex >= context.positions.length) {
      throw new Error('无效的持仓索引')
    }

    const position = context.positions[positionIndex]
    const marketData = this.marketData.get(position.symbol)
    if (!marketData) {
      throw new Error(`市场数据不可用: ${position.symbol}`)
    }

    // 创建平仓交易
    const closeTrade: ITradeRecord = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      symbol: position.symbol,
      side: position.side === 'long' ? 'short' : 'long',
      size: position.size,
      entryPrice: position.entryPrice,
      exitPrice: marketData.price,
      pnl: this.calculatePnL(position, marketData.price),
      commission: position.size * marketData.price * 0.001,
      timestamp: new Date(),
      status: 'closed'
    }

    // 更新余额
    context.balance += closeTrade.pnl - closeTrade.commission
    
    // 移除持仓
    context.positions.splice(positionIndex, 1)
    
    // 添加交易记录
    context.trades.push(closeTrade)
    
    // 更新权益
    this.updateEquity(context)
    
    // 保存上下文
    await RedisService.set(`agent_context:${agentId}`, JSON.stringify(context), 24 * 60 * 60)
    
    // 保存交易记录
    await this.saveTradeToDatabase(closeTrade)
    
    console.log(`代理 ${agentId} 平仓: ${position.side} ${position.size} ${position.symbol} PnL: ${closeTrade.pnl}`)
    
    return closeTrade
  }

  // 获取代理上下文
  public getAgentContext(agentId: string): IAgentContext | undefined {
    return this.agentContexts.get(agentId)
  }

  // 获取市场数据
  public getMarketData(symbol: string): IMarketData | undefined {
    return this.marketData.get(symbol)
  }

  // 获取所有市场数据
  public getAllMarketData(): Map<string, IMarketData> {
    return new Map(this.marketData)
  }

  // 初始化市场数据
  private initializeMarketData() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT']
    const basePrices = {
      'BTCUSDT': 45000,
      'ETHUSDT': 3000,
      'BNBUSDT': 400,
      'ADAUSDT': 1.2,
      'DOTUSDT': 25,
      'LINKUSDT': 15
    }

    symbols.forEach(symbol => {
      this.marketData.set(symbol, {
        symbol,
        price: basePrices[symbol as keyof typeof basePrices],
        volume: Math.random() * 1000000,
        change24h: (Math.random() - 0.5) * 0.1, // -5% to +5%
        high24h: basePrices[symbol as keyof typeof basePrices] * (1 + Math.random() * 0.05),
        low24h: basePrices[symbol as keyof typeof basePrices] * (1 - Math.random() * 0.05),
        timestamp: new Date()
      })
    })
  }

  // 启动市场数据更新
  private startMarketDataUpdates() {
    this.marketDataInterval = setInterval(() => {
      this.updateMarketData()
    }, 1000) // 每秒更新一次
  }

  // 更新市场数据
  private updateMarketData() {
    for (const [symbol, data] of this.marketData.entries()) {
      // 模拟价格波动
      const volatility = 0.001 // 0.1% 波动率
      const change = (Math.random() - 0.5) * volatility * 2
      const newPrice = data.price * (1 + change)
      
      // 更新数据
      data.price = Math.max(newPrice, 0.01) // 防止负价格
      data.volume += Math.random() * 1000
      data.timestamp = new Date()
      
      // 更新24小时高低点
      if (data.price > data.high24h) {
        data.high24h = data.price
      }
      if (data.price < data.low24h) {
        data.low24h = data.price
      }
    }

    // 更新所有持仓的未实现盈亏
    for (const context of this.agentContexts.values()) {
      this.updateUnrealizedPnL(context)
      this.updateEquity(context)
    }
  }

  // 启动交易循环
  private startTradingLoop() {
    this.tradingInterval = setInterval(async () => {
      await this.processTradingSignals()
    }, 5000) // 每5秒处理一次交易信号
  }

  // 处理交易信号
  private async processTradingSignals() {
    try {
      // 从Redis获取待处理的交易信号
      const signals = await RedisService.lRange('trading_signals', 0, -1)
      
      for (const signalStr of signals) {
        try {
          const signal: ITradingSignal = JSON.parse(signalStr)
          
          // 验证信号是否过期（5分钟内有效）
          const signalAge = Date.now() - new Date(signal.timestamp).getTime()
          if (signalAge > 5 * 60 * 1000) {
            continue // 跳过过期信号
          }
          
          // 执行交易
          await this.executeTrade(signal.agentId, signal)
          
        } catch (error) {
          console.error('处理交易信号失败:', error)
        }
      }
      
      // 清空已处理的信号
      if (signals.length > 0) {
        await RedisService.del('trading_signals')
      }
      
    } catch (error) {
      console.error('处理交易信号循环失败:', error)
    }
  }

  // 验证交易信号
  private validateTradingSignal(signal: ITradingSignal): boolean {
    if (!signal.agentId || !signal.symbol || !signal.action) {
      return false
    }
    
    if (!['buy', 'sell'].includes(signal.action)) {
      return false
    }
    
    if (signal.quantity && signal.quantity <= 0) {
      return false
    }
    
    return true
  }

  // 计算交易大小
  private calculateTradeSize(context: IAgentContext, signal: ITradingSignal, price: number): number {
    if (signal.quantity) {
      return signal.quantity
    }
    
    // 默认使用2%的资金
    const riskPercentage = 0.02
    const availableBalance = context.balance * riskPercentage
    
    return Math.floor(availableBalance / price * 100) / 100 // 保留2位小数
  }

  // 更新持仓
  private updatePosition(context: IAgentContext, trade: ITradeRecord) {
    const existingPosition = context.positions.find(p => 
      p.symbol === trade.symbol && p.side === trade.side
    )
    
    if (existingPosition) {
      // 增加现有持仓
      const totalSize = existingPosition.size + trade.size
      const totalValue = existingPosition.size * existingPosition.entryPrice + trade.size * trade.entryPrice
      existingPosition.entryPrice = totalValue / totalSize
      existingPosition.size = totalSize
    } else {
      // 创建新持仓
      context.positions.push({
        symbol: trade.symbol,
        side: trade.side,
        size: trade.size,
        entryPrice: trade.entryPrice,
        currentPrice: trade.entryPrice,
        unrealizedPnL: 0,
        timestamp: trade.timestamp
      })
    }
  }

  // 从Trade模型更新持仓
  private updatePositionFromTrade(context: IAgentContext, trade: ITrade) {
    const side = trade.side === 'buy' ? 'long' : 'short'
    const existingPosition = context.positions.find(p => 
      p.symbol === trade.symbol && p.side === side
    )
    
    if (existingPosition) {
      // 增加现有持仓
      const totalSize = existingPosition.size + trade.executedQuantity!
      const totalValue = existingPosition.size * existingPosition.entryPrice + trade.executedQuantity! * trade.executedPrice!
      existingPosition.entryPrice = totalValue / totalSize
      existingPosition.size = totalSize
    } else {
      // 创建新持仓
      context.positions.push({
        symbol: trade.symbol,
        side: side,
        size: trade.executedQuantity!,
        entryPrice: trade.executedPrice!,
        currentPrice: trade.executedPrice!,
        unrealizedPnL: 0,
        timestamp: trade.executedAt!
      })
    }
  }

  // 更新未实现盈亏
  private updateUnrealizedPnL(context: IAgentContext) {
    for (const position of context.positions) {
      const marketData = this.marketData.get(position.symbol)
      if (marketData) {
        position.currentPrice = marketData.price
        position.unrealizedPnL = this.calculatePnL(position, marketData.price)
      }
    }
  }

  // 计算盈亏
  private calculatePnL(position: IPosition, currentPrice: number): number {
    const priceDiff = position.side === 'long' 
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice
    
    return priceDiff * position.size
  }

  // 更新权益
  private updateEquity(context: IAgentContext) {
    const unrealizedPnL = context.positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0)
    context.equity = context.balance + unrealizedPnL
    
    // 计算回撤
    const peak = Math.max(context.equity, context.balance)
    context.drawdown = (peak - context.equity) / peak
    context.maxDrawdown = Math.max(context.maxDrawdown, context.drawdown)
  }

  // 保存交易记录到数据库
  private async saveTradeToDatabase(trade: ITradeRecord) {
    try {
      // 这里应该保存到MongoDB，暂时保存到Redis
      await RedisService.set(`trade:${trade.id}`, JSON.stringify(trade), 30 * 24 * 60 * 60)
      
      // 添加到代理的交易列表
      await RedisService.lPush(`agent_trades:${trade.agentId}`, trade.id)
      
    } catch (error) {
      console.error('保存交易记录失败:', error)
    }
  }
}

export default TradingEngine