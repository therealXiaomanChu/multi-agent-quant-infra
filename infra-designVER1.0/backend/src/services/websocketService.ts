import { Server as HttpServer } from 'http'
import { Server as SocketIOServer, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import Redis from 'ioredis'
import { IUser, IMarketData, IWebSocketMessage, ITrade } from '@/types'
import { getMarketDataService } from './marketDataService'
import logger from '@/utils/logger'
import User from '@/models/User'

// WebSocket事件类型
export enum WSEventType {
  // 认证相关
  AUTHENTICATE = 'authenticate',
  AUTHENTICATED = 'authenticated',
  AUTHENTICATION_ERROR = 'authentication_error',
  
  // 市场数据相关
  SUBSCRIBE_MARKET_DATA = 'subscribe_market_data',
  UNSUBSCRIBE_MARKET_DATA = 'unsubscribe_market_data',
  MARKET_DATA = 'market_data',
  
  // 交易相关
  TRADE_EXECUTED = 'trade_executed',
  TRADE_UPDATED = 'trade_updated',
  
  // Agent相关
  AGENT_STATUS_CHANGED = 'agent_status_changed',
  AGENT_PERFORMANCE_UPDATED = 'agent_performance_updated',
  
  // 对战相关
  BATTLE_STARTED = 'battle_started',
  BATTLE_UPDATED = 'battle_updated',
  BATTLE_ENDED = 'battle_ended',
  
  // 回测相关
  BACKTEST_PROGRESS = 'backtest_progress',
  BACKTEST_COMPLETED = 'backtest_completed',
  
  // 系统相关
  ERROR = 'error',
  NOTIFICATION = 'notification',
  HEARTBEAT = 'heartbeat'
}

// 客户端连接信息
interface ClientConnection {
  socket: Socket
  user: IUser | null
  subscribedSymbols: Set<string>
  subscribedAgents: Set<string>
  subscribedBattles: Set<string>
  lastHeartbeat: Date
}

// WebSocket服务类
export class WebSocketService {
  private io: SocketIOServer
  private redis: Redis
  private redisSubscriber: Redis
  private clients: Map<string, ClientConnection> = new Map()
  private marketDataService = getMarketDataService()
  private heartbeatInterval: NodeJS.Timeout | null = null

  constructor(httpServer: HttpServer) {
    // 初始化Socket.IO服务器
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    })

    // 初始化Redis连接
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    })

    // Redis订阅者（用于接收发布的消息）
    this.redisSubscriber = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD
    })

    this.setupEventHandlers()
    this.setupRedisSubscriptions()
    this.startHeartbeat()
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`)
      
      // 创建客户端连接记录
      const clientConnection: ClientConnection = {
        socket,
        user: null,
        subscribedSymbols: new Set(),
        subscribedAgents: new Set(),
        subscribedBattles: new Set(),
        lastHeartbeat: new Date()
      }
      
      this.clients.set(socket.id, clientConnection)

      // 认证
      socket.on(WSEventType.AUTHENTICATE, async (data: { token: string }) => {
        await this.handleAuthentication(socket, data.token)
      })

      // 订阅市场数据
      socket.on(WSEventType.SUBSCRIBE_MARKET_DATA, async (data: { symbols: string[] }) => {
        await this.handleMarketDataSubscription(socket, data.symbols)
      })

      // 取消订阅市场数据
      socket.on(WSEventType.UNSUBSCRIBE_MARKET_DATA, async (data: { symbols: string[] }) => {
        await this.handleMarketDataUnsubscription(socket, data.symbols)
      })

      // 心跳
      socket.on(WSEventType.HEARTBEAT, () => {
        const client = this.clients.get(socket.id)
        if (client) {
          client.lastHeartbeat = new Date()
          socket.emit(WSEventType.HEARTBEAT, { timestamp: new Date() })
        }
      })

      // 断开连接
      socket.on('disconnect', (reason) => {
        logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`)
        this.handleDisconnection(socket)
      })

      // 错误处理
      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error)
      })
    })
  }

  private setupRedisSubscriptions(): void {
    // 订阅市场数据频道
    this.redisSubscriber.psubscribe('market_data:*')
    
    // 订阅交易频道
    this.redisSubscriber.psubscribe('trade:*')
    
    // 订阅Agent频道
    this.redisSubscriber.psubscribe('agent:*')
    
    // 订阅对战频道
    this.redisSubscriber.psubscribe('battle:*')
    
    // 订阅回测频道
    this.redisSubscriber.psubscribe('backtest:*')

    this.redisSubscriber.on('pmessage', (pattern, channel, message) => {
      this.handleRedisMessage(pattern, channel, message)
    })
  }

  private async handleAuthentication(socket: Socket, token: string): Promise<void> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
      const user = await User.findById(decoded.userId).select('-password')
      
      if (!user) {
        socket.emit(WSEventType.AUTHENTICATION_ERROR, { message: 'User not found' })
        return
      }

      const client = this.clients.get(socket.id)
      if (client) {
        client.user = user
        socket.join(`user:${user._id}`) // 加入用户房间
        socket.emit(WSEventType.AUTHENTICATED, { user: user.toJSON() })
        logger.info(`User ${user.username} authenticated on socket ${socket.id}`)
      }
    } catch (error) {
      logger.error('Authentication error:', error)
      socket.emit(WSEventType.AUTHENTICATION_ERROR, { message: 'Invalid token' })
    }
  }

  private async handleMarketDataSubscription(socket: Socket, symbols: string[]): Promise<void> {
    const client = this.clients.get(socket.id)
    if (!client) return

    try {
      // 添加到客户端订阅列表
      symbols.forEach(symbol => {
        client.subscribedSymbols.add(symbol)
        socket.join(`market:${symbol}`) // 加入市场数据房间
      })

      // 订阅市场数据服务
      await this.marketDataService.subscribe(symbols)

      // 发送最新价格
      const latestPrices: { [symbol: string]: IMarketData | null } = {}
      symbols.forEach(symbol => {
        latestPrices[symbol] = this.marketDataService.getLatestPrice(symbol)
      })

      socket.emit('market_data_subscribed', { symbols, latestPrices })
      logger.info(`Socket ${socket.id} subscribed to market data: ${symbols.join(', ')}`)
    } catch (error) {
      logger.error('Market data subscription error:', error)
      socket.emit(WSEventType.ERROR, { message: 'Failed to subscribe to market data' })
    }
  }

  private async handleMarketDataUnsubscription(socket: Socket, symbols: string[]): Promise<void> {
    const client = this.clients.get(socket.id)
    if (!client) return

    try {
      // 从客户端订阅列表移除
      symbols.forEach(symbol => {
        client.subscribedSymbols.delete(symbol)
        socket.leave(`market:${symbol}`) // 离开市场数据房间
      })

      socket.emit('market_data_unsubscribed', { symbols })
      logger.info(`Socket ${socket.id} unsubscribed from market data: ${symbols.join(', ')}`)
    } catch (error) {
      logger.error('Market data unsubscription error:', error)
      socket.emit(WSEventType.ERROR, { message: 'Failed to unsubscribe from market data' })
    }
  }

  private handleDisconnection(socket: Socket): void {
    const client = this.clients.get(socket.id)
    if (client) {
      // 清理订阅
      client.subscribedSymbols.forEach(symbol => {
        socket.leave(`market:${symbol}`)
      })
      
      client.subscribedAgents.forEach(agentId => {
        socket.leave(`agent:${agentId}`)
      })
      
      client.subscribedBattles.forEach(battleId => {
        socket.leave(`battle:${battleId}`)
      })
      
      if (client.user) {
        socket.leave(`user:${client.user._id}`)
      }
      
      this.clients.delete(socket.id)
    }
  }

  private handleRedisMessage(pattern: string, channel: string, message: string): void {
    try {
      const data = JSON.parse(message)
      
      if (pattern === 'market_data:*') {
        // 市场数据更新
        const symbol = channel.split(':')[1]
        this.io.to(`market:${symbol}`).emit(WSEventType.MARKET_DATA, data)
      } else if (pattern === 'trade:*') {
        // 交易更新
        const parts = channel.split(':')
        if (parts[1] === 'executed') {
          this.io.to(`user:${data.userId}`).emit(WSEventType.TRADE_EXECUTED, data)
        } else if (parts[1] === 'updated') {
          this.io.to(`user:${data.userId}`).emit(WSEventType.TRADE_UPDATED, data)
        }
      } else if (pattern === 'agent:*') {
        // Agent更新
        const parts = channel.split(':')
        const agentId = parts[1]
        const eventType = parts[2]
        
        if (eventType === 'status') {
          this.io.to(`agent:${agentId}`).emit(WSEventType.AGENT_STATUS_CHANGED, data)
        } else if (eventType === 'performance') {
          this.io.to(`agent:${agentId}`).emit(WSEventType.AGENT_PERFORMANCE_UPDATED, data)
        }
      } else if (pattern === 'battle:*') {
        // 对战更新
        const parts = channel.split(':')
        const battleId = parts[1]
        const eventType = parts[2]
        
        if (eventType === 'started') {
          this.io.to(`battle:${battleId}`).emit(WSEventType.BATTLE_STARTED, data)
        } else if (eventType === 'updated') {
          this.io.to(`battle:${battleId}`).emit(WSEventType.BATTLE_UPDATED, data)
        } else if (eventType === 'ended') {
          this.io.to(`battle:${battleId}`).emit(WSEventType.BATTLE_ENDED, data)
        }
      } else if (pattern === 'backtest:*') {
        // 回测更新
        const parts = channel.split(':')
        const backtestId = parts[1]
        const eventType = parts[2]
        
        if (eventType === 'progress') {
          this.io.to(`user:${data.userId}`).emit(WSEventType.BACKTEST_PROGRESS, data)
        } else if (eventType === 'completed') {
          this.io.to(`user:${data.userId}`).emit(WSEventType.BACKTEST_COMPLETED, data)
        }
      }
    } catch (error) {
      logger.error('Error handling Redis message:', error)
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = new Date()
      const timeout = 60000 // 60秒超时
      
      this.clients.forEach((client, socketId) => {
        const timeSinceLastHeartbeat = now.getTime() - client.lastHeartbeat.getTime()
        
        if (timeSinceLastHeartbeat > timeout) {
          logger.warn(`Client ${socketId} heartbeat timeout, disconnecting`)
          client.socket.disconnect(true)
          this.clients.delete(socketId)
        }
      })
    }, 30000) // 每30秒检查一次
  }

  // 公共方法：发送通知给特定用户
  public sendNotificationToUser(userId: string, notification: any): void {
    this.io.to(`user:${userId}`).emit(WSEventType.NOTIFICATION, notification)
  }

  // 公共方法：发送通知给所有用户
  public broadcastNotification(notification: any): void {
    this.io.emit(WSEventType.NOTIFICATION, notification)
  }

  // 公共方法：发送交易执行通知
  public notifyTradeExecution(trade: ITrade): void {
    this.redis.publish(`trade:executed`, JSON.stringify(trade))
  }

  // 公共方法：发送Agent状态变更通知
  public notifyAgentStatusChange(agentId: string, status: any): void {
    this.redis.publish(`agent:${agentId}:status`, JSON.stringify(status))
  }

  // 公共方法：发送对战更新通知
  public notifyBattleUpdate(battleId: string, eventType: string, data: any): void {
    this.redis.publish(`battle:${battleId}:${eventType}`, JSON.stringify(data))
  }

  // 公共方法：发送回测进度通知
  public notifyBacktestProgress(backtestId: string, progress: any): void {
    this.redis.publish(`backtest:${backtestId}:progress`, JSON.stringify(progress))
  }

  // 获取连接统计
  public getConnectionStats(): {
    totalConnections: number
    authenticatedConnections: number
    subscribedSymbols: { [symbol: string]: number }
  } {
    const stats = {
      totalConnections: this.clients.size,
      authenticatedConnections: 0,
      subscribedSymbols: {} as { [symbol: string]: number }
    }

    this.clients.forEach(client => {
      if (client.user) {
        stats.authenticatedConnections++
      }
      
      client.subscribedSymbols.forEach(symbol => {
        stats.subscribedSymbols[symbol] = (stats.subscribedSymbols[symbol] || 0) + 1
      })
    })

    return stats
  }

  // 关闭服务
  public async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }
    
    await this.redis.quit()
    await this.redisSubscriber.quit()
    
    this.io.close()
    logger.info('WebSocket service closed')
  }
}

// 单例实例
let webSocketService: WebSocketService | null = null

export const createWebSocketService = (httpServer: HttpServer): WebSocketService => {
  if (!webSocketService) {
    webSocketService = new WebSocketService(httpServer)
  }
  return webSocketService
}

export const getWebSocketService = (): WebSocketService | null => {
  return webSocketService
}

export default WebSocketService