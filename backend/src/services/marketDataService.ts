import WebSocket from 'ws'
import EventEmitter from 'events'
import Redis from 'ioredis'
import { IMarketData } from '@/types'
import logger from '@/utils/logger'

// 市场数据提供商接口
interface IMarketDataProvider {
  connect(): Promise<void>
  disconnect(): Promise<void>
  subscribe(symbols: string[]): Promise<void>
  unsubscribe(symbols: string[]): Promise<void>
  isConnected(): boolean
}

// 模拟市场数据提供商（用于开发和测试）
class MockMarketDataProvider extends EventEmitter implements IMarketDataProvider {
  private connected = false
  private subscribedSymbols: Set<string> = new Set()
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private prices: Map<string, number> = new Map()

  async connect(): Promise<void> {
    this.connected = true
    logger.info('Mock market data provider connected')
    this.emit('connected')
  }

  async disconnect(): Promise<void> {
    this.connected = false
    // 清理所有定时器
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals.clear()
    logger.info('Mock market data provider disconnected')
    this.emit('disconnected')
  }

  async subscribe(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      if (!this.subscribedSymbols.has(symbol)) {
        this.subscribedSymbols.add(symbol)
        
        // 初始化价格
        if (!this.prices.has(symbol)) {
          this.prices.set(symbol, this.getRandomPrice(symbol))
        }
        
        // 创建定时器生成模拟数据
        const interval = setInterval(() => {
          this.generateMockData(symbol)
        }, 1000) // 每秒生成一次数据
        
        this.intervals.set(symbol, interval)
        logger.info(`Subscribed to ${symbol}`)
      }
    }
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      if (this.subscribedSymbols.has(symbol)) {
        this.subscribedSymbols.delete(symbol)
        
        const interval = this.intervals.get(symbol)
        if (interval) {
          clearInterval(interval)
          this.intervals.delete(symbol)
        }
        
        logger.info(`Unsubscribed from ${symbol}`)
      }
    }
  }

  isConnected(): boolean {
    return this.connected
  }

  private getRandomPrice(symbol: string): number {
    // 根据不同标的返回不同的基础价格
    const basePrices: { [key: string]: number } = {
      'BTCUSDT': 45000,
      'ETHUSDT': 3000,
      'AAPL': 150,
      'GOOGL': 2800,
      'TSLA': 800,
      'SPY': 450,
      'QQQ': 380
    }
    
    return basePrices[symbol] || 100
  }

  private generateMockData(symbol: string): void {
    const currentPrice = this.prices.get(symbol) || this.getRandomPrice(symbol)
    
    // 生成随机价格变动（-2% 到 +2%）
    const changePercent = (Math.random() - 0.5) * 0.04
    const newPrice = currentPrice * (1 + changePercent)
    
    // 生成OHLCV数据
    const high = newPrice * (1 + Math.random() * 0.01)
    const low = newPrice * (1 - Math.random() * 0.01)
    const volume = Math.floor(Math.random() * 1000000) + 100000
    
    const marketData: IMarketData = {
      symbol,
      timestamp: new Date(),
      open: currentPrice,
      high,
      low,
      close: newPrice,
      volume
    }
    
    this.prices.set(symbol, newPrice)
    this.emit('data', marketData)
  }
}

// Binance WebSocket 数据提供商
class BinanceMarketDataProvider extends EventEmitter implements IMarketDataProvider {
  private ws: WebSocket | null = null
  private subscribedSymbols: Set<string> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 5000

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket('wss://stream.binance.com:9443/ws/!ticker@arr')
        
        this.ws.on('open', () => {
          logger.info('Binance WebSocket connected')
          this.reconnectAttempts = 0
          this.emit('connected')
          resolve()
        })
        
        this.ws.on('message', (data: Buffer) => {
          try {
            const tickers = JSON.parse(data.toString())
            if (Array.isArray(tickers)) {
              tickers.forEach(ticker => this.processTicker(ticker))
            }
          } catch (error) {
            logger.error('Error parsing Binance data:', error)
          }
        })
        
        this.ws.on('close', () => {
          logger.warn('Binance WebSocket disconnected')
          this.emit('disconnected')
          this.handleReconnect()
        })
        
        this.ws.on('error', (error) => {
          logger.error('Binance WebSocket error:', error)
          reject(error)
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  async subscribe(symbols: string[]): Promise<void> {
    symbols.forEach(symbol => {
      this.subscribedSymbols.add(symbol.toUpperCase())
    })
    logger.info(`Subscribed to symbols: ${symbols.join(', ')}`)
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    symbols.forEach(symbol => {
      this.subscribedSymbols.delete(symbol.toUpperCase())
    })
    logger.info(`Unsubscribed from symbols: ${symbols.join(', ')}`)
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private processTicker(ticker: any): void {
    const symbol = ticker.s
    
    // 只处理订阅的标的
    if (!this.subscribedSymbols.has(symbol)) {
      return
    }
    
    const marketData: IMarketData = {
      symbol,
      timestamp: new Date(ticker.E), // Event time
      open: parseFloat(ticker.o),
      high: parseFloat(ticker.h),
      low: parseFloat(ticker.l),
      close: parseFloat(ticker.c),
      volume: parseFloat(ticker.v)
    }
    
    this.emit('data', marketData)
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      
      setTimeout(() => {
        this.connect().catch(error => {
          logger.error('Reconnection failed:', error)
        })
      }, this.reconnectDelay)
    } else {
      logger.error('Max reconnection attempts reached')
      this.emit('error', new Error('Max reconnection attempts reached'))
    }
  }
}

// 市场数据服务主类
export class MarketDataService extends EventEmitter {
  private provider: IMarketDataProvider
  private redis: Redis
  private subscribedSymbols: Set<string> = new Set()
  private dataBuffer: Map<string, IMarketData[]> = new Map()
  private bufferSize = 100 // 每个标的保留最近100条数据

  constructor(useRealData = false) {
    super()
    
    // 根据配置选择数据提供商
    this.provider = useRealData ? new BinanceMarketDataProvider() : new MockMarketDataProvider()
    
    // 初始化Redis连接
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    })
    
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.provider.on('connected', () => {
      logger.info('Market data provider connected')
      this.emit('connected')
    })

    this.provider.on('disconnected', () => {
      logger.warn('Market data provider disconnected')
      this.emit('disconnected')
    })

    this.provider.on('data', (data: IMarketData) => {
      this.handleMarketData(data)
    })

    this.provider.on('error', (error: Error) => {
      logger.error('Market data provider error:', error)
      this.emit('error', error)
    })
  }

  async start(): Promise<void> {
    try {
      await this.provider.connect()
      logger.info('Market data service started')
    } catch (error) {
      logger.error('Failed to start market data service:', error)
      throw error
    }
  }

  async stop(): Promise<void> {
    try {
      await this.provider.disconnect()
      await this.redis.quit()
      logger.info('Market data service stopped')
    } catch (error) {
      logger.error('Error stopping market data service:', error)
      throw error
    }
  }

  async subscribe(symbols: string[]): Promise<void> {
    const newSymbols = symbols.filter(symbol => !this.subscribedSymbols.has(symbol))
    
    if (newSymbols.length > 0) {
      await this.provider.subscribe(newSymbols)
      newSymbols.forEach(symbol => {
        this.subscribedSymbols.add(symbol)
        this.dataBuffer.set(symbol, [])
      })
      
      logger.info(`Subscribed to new symbols: ${newSymbols.join(', ')}`)
    }
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    const existingSymbols = symbols.filter(symbol => this.subscribedSymbols.has(symbol))
    
    if (existingSymbols.length > 0) {
      await this.provider.unsubscribe(existingSymbols)
      existingSymbols.forEach(symbol => {
        this.subscribedSymbols.delete(symbol)
        this.dataBuffer.delete(symbol)
      })
      
      logger.info(`Unsubscribed from symbols: ${existingSymbols.join(', ')}`)
    }
  }

  getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols)
  }

  getLatestPrice(symbol: string): IMarketData | null {
    const buffer = this.dataBuffer.get(symbol)
    return buffer && buffer.length > 0 ? buffer[buffer.length - 1] : null
  }

  getHistoricalData(symbol: string, limit = 50): IMarketData[] {
    const buffer = this.dataBuffer.get(symbol)
    if (!buffer) return []
    
    return buffer.slice(-limit)
  }

  async getStoredData(symbol: string, startTime?: Date, endTime?: Date, limit = 1000): Promise<IMarketData[]> {
    try {
      const key = `market_data:${symbol}`
      const data = await this.redis.zrevrange(key, 0, limit - 1, 'WITHSCORES')
      
      const result: IMarketData[] = []
      for (let i = 0; i < data.length; i += 2) {
        const marketData = JSON.parse(data[i])
        const timestamp = new Date(parseInt(data[i + 1]))
        
        if (startTime && timestamp < startTime) continue
        if (endTime && timestamp > endTime) continue
        
        result.push({ ...marketData, timestamp })
      }
      
      return result.reverse() // 返回时间正序
    } catch (error) {
      logger.error(`Error getting stored data for ${symbol}:`, error)
      return []
    }
  }

  isConnected(): boolean {
    return this.provider.isConnected()
  }

  private async handleMarketData(data: IMarketData): Promise<void> {
    try {
      // 更新内存缓冲区
      const buffer = this.dataBuffer.get(data.symbol) || []
      buffer.push(data)
      
      // 限制缓冲区大小
      if (buffer.length > this.bufferSize) {
        buffer.shift()
      }
      
      this.dataBuffer.set(data.symbol, buffer)
      
      // 存储到Redis（使用有序集合，以时间戳为分数）
      const key = `market_data:${data.symbol}`
      const score = data.timestamp.getTime()
      const value = JSON.stringify({
        symbol: data.symbol,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume
      })
      
      await this.redis.zadd(key, score, value)
      
      // 设置过期时间（保留7天数据）
      await this.redis.expire(key, 7 * 24 * 60 * 60)
      
      // 清理旧数据（保留最近1000条）
      await this.redis.zremrangebyrank(key, 0, -1001)
      
      // 发布实时数据到Redis频道
      await this.redis.publish(`market_data:${data.symbol}`, JSON.stringify(data))
      
      // 触发事件
      this.emit('data', data)
      
    } catch (error) {
      logger.error('Error handling market data:', error)
    }
  }
}

// 单例实例
let marketDataService: MarketDataService | null = null

export const getMarketDataService = (useRealData = false): MarketDataService => {
  if (!marketDataService) {
    marketDataService = new MarketDataService(useRealData)
  }
  return marketDataService
}

export default MarketDataService