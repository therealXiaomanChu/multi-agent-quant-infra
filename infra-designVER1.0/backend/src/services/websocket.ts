import { Server as SocketIOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import jwt from 'jsonwebtoken'
import { User } from '@/models/User'
import { RedisService } from '@/config/redis'
import { IWebSocketMessage, IBattle, ITradingSignal } from '@/types'

interface AuthenticatedSocket extends Socket {
  userId?: string
  user?: any
}

class WebSocketService {
  private io: SocketIOServer
  private connectedUsers = new Map<string, string>() // userId -> socketId
  private battleRooms = new Map<string, Set<string>>() // battleId -> Set<socketId>
  private tradingRooms = new Map<string, Set<string>>() // agentId -> Set<socketId>

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    })

    this.setupMiddleware()
    this.setupEventHandlers()
  }

  private setupMiddleware() {
    // 身份验证中间件
    this.io.use(async (socket: any, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '')
        
        if (!token) {
          // 允许匿名连接（只能观看公开内容）
          return next()
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
        const user = await User.findById(decoded.id).select('-password')
        
        if (!user || !user.isActive) {
          return next(new Error('用户不存在或已被禁用'))
        }

        socket.userId = user._id.toString()
        socket.user = user
        next()
      } catch (error) {
        next(new Error('身份验证失败'))
      }
    })
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`WebSocket连接建立: ${socket.id}${socket.userId ? ` (用户: ${socket.userId})` : ' (匿名)'}`)

      // 用户连接管理
      if (socket.userId) {
        this.connectedUsers.set(socket.userId, socket.id)
        socket.emit('authenticated', { userId: socket.userId, user: socket.user })
      }

      // 加入对战房间
      socket.on('join_battle', async (data: { battleId: string }) => {
        try {
          const { battleId } = data
          
          // 验证对战是否存在
          const battleData = await RedisService.get(`battle:${battleId}`)
          if (!battleData) {
            socket.emit('error', { message: '对战不存在' })
            return
          }

          const battle: IBattle = JSON.parse(battleData)
          
          // 检查访问权限
          if (!battle.isPublic && socket.userId && 
              battle.challengerAgent.author.toString() !== socket.userId && 
              battle.opponentAgent.author.toString() !== socket.userId) {
            socket.emit('error', { message: '无权访问此对战' })
            return
          }

          // 加入房间
          socket.join(`battle:${battleId}`)
          
          if (!this.battleRooms.has(battleId)) {
            this.battleRooms.set(battleId, new Set())
          }
          this.battleRooms.get(battleId)!.add(socket.id)

          // 更新观众数
          if (socket.userId && 
              battle.challengerAgent.author.toString() !== socket.userId && 
              battle.opponentAgent.author.toString() !== socket.userId) {
            battle.spectators += 1
            await RedisService.set(`battle:${battleId}`, JSON.stringify(battle), 30 * 24 * 60 * 60)
          }

          socket.emit('battle_joined', { battleId, spectators: battle.spectators })
          socket.to(`battle:${battleId}`).emit('spectator_joined', { spectators: battle.spectators })
          
          console.log(`用户 ${socket.userId || '匿名'} 加入对战房间: ${battleId}`)
        } catch (error) {
          console.error('加入对战房间失败:', error)
          socket.emit('error', { message: '加入对战房间失败' })
        }
      })

      // 离开对战房间
      socket.on('leave_battle', async (data: { battleId: string }) => {
        try {
          const { battleId } = data
          
          socket.leave(`battle:${battleId}`)
          
          if (this.battleRooms.has(battleId)) {
            this.battleRooms.get(battleId)!.delete(socket.id)
            if (this.battleRooms.get(battleId)!.size === 0) {
              this.battleRooms.delete(battleId)
            }
          }

          // 更新观众数
          const battleData = await RedisService.get(`battle:${battleId}`)
          if (battleData) {
            const battle: IBattle = JSON.parse(battleData)
            if (socket.userId && 
                battle.challengerAgent.author.toString() !== socket.userId && 
                battle.opponentAgent.author.toString() !== socket.userId) {
              battle.spectators = Math.max(0, battle.spectators - 1)
              await RedisService.set(`battle:${battleId}`, JSON.stringify(battle), 30 * 24 * 60 * 60)
            }
            socket.to(`battle:${battleId}`).emit('spectator_left', { spectators: battle.spectators })
          }

          socket.emit('battle_left', { battleId })
          console.log(`用户 ${socket.userId || '匿名'} 离开对战房间: ${battleId}`)
        } catch (error) {
          console.error('离开对战房间失败:', error)
        }
      })

      // 加入交易房间（观看特定代理的实时交易）
      socket.on('join_trading', (data: { agentId: string }) => {
        const { agentId } = data
        
        socket.join(`trading:${agentId}`)
        
        if (!this.tradingRooms.has(agentId)) {
          this.tradingRooms.set(agentId, new Set())
        }
        this.tradingRooms.get(agentId)!.add(socket.id)

        socket.emit('trading_joined', { agentId })
        console.log(`用户 ${socket.userId || '匿名'} 加入交易房间: ${agentId}`)
      })

      // 离开交易房间
      socket.on('leave_trading', (data: { agentId: string }) => {
        const { agentId } = data
        
        socket.leave(`trading:${agentId}`)
        
        if (this.tradingRooms.has(agentId)) {
          this.tradingRooms.get(agentId)!.delete(socket.id)
          if (this.tradingRooms.get(agentId)!.size === 0) {
            this.tradingRooms.delete(agentId)
          }
        }

        socket.emit('trading_left', { agentId })
        console.log(`用户 ${socket.userId || '匿名'} 离开交易房间: ${agentId}`)
      })

      // 发送对战评论
      socket.on('battle_comment', async (data: { battleId: string, message: string }) => {
        try {
          if (!socket.userId) {
            socket.emit('error', { message: '请先登录' })
            return
          }

          const { battleId, message } = data
          
          if (!message || message.trim().length === 0) {
            socket.emit('error', { message: '评论内容不能为空' })
            return
          }

          if (message.length > 500) {
            socket.emit('error', { message: '评论内容不能超过500个字符' })
            return
          }

          // 获取对战信息
          const battleData = await RedisService.get(`battle:${battleId}`)
          if (!battleData) {
            socket.emit('error', { message: '对战不存在' })
            return
          }

          const battle: IBattle = JSON.parse(battleData)
          
          // 添加评论
          const comment = {
            id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId: socket.userId,
            username: socket.user.username,
            avatar: socket.user.avatar,
            message: message.trim(),
            timestamp: new Date()
          }

          battle.comments.push(comment)
          
          // 保持最新100条评论
          if (battle.comments.length > 100) {
            battle.comments = battle.comments.slice(-100)
          }

          await RedisService.set(`battle:${battleId}`, JSON.stringify(battle), 30 * 24 * 60 * 60)

          // 广播评论
          this.io.to(`battle:${battleId}`).emit('battle_comment', comment)
          
          console.log(`用户 ${socket.userId} 在对战 ${battleId} 发表评论`)
        } catch (error) {
          console.error('发送对战评论失败:', error)
          socket.emit('error', { message: '发送评论失败' })
        }
      })

      // 心跳检测
      socket.on('ping', () => {
        socket.emit('pong')
      })

      // 断开连接处理
      socket.on('disconnect', async () => {
        console.log(`WebSocket连接断开: ${socket.id}${socket.userId ? ` (用户: ${socket.userId})` : ' (匿名)'}`)
        
        // 清理用户连接
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId)
        }

        // 清理房间
        for (const [battleId, sockets] of this.battleRooms.entries()) {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id)
            if (sockets.size === 0) {
              this.battleRooms.delete(battleId)
            }
            
            // 更新观众数
            try {
              const battleData = await RedisService.get(`battle:${battleId}`)
              if (battleData) {
                const battle: IBattle = JSON.parse(battleData)
                if (socket.userId && 
                    battle.challengerAgent.author.toString() !== socket.userId && 
                    battle.opponentAgent.author.toString() !== socket.userId) {
                  battle.spectators = Math.max(0, battle.spectators - 1)
                  await RedisService.set(`battle:${battleId}`, JSON.stringify(battle), 30 * 24 * 60 * 60)
                }
                socket.to(`battle:${battleId}`).emit('spectator_left', { spectators: battle.spectators })
              }
            } catch (error) {
              console.error('更新观众数失败:', error)
            }
          }
        }

        for (const [agentId, sockets] of this.tradingRooms.entries()) {
          if (sockets.has(socket.id)) {
            sockets.delete(socket.id)
            if (sockets.size === 0) {
              this.tradingRooms.delete(agentId)
            }
          }
        }
      })
    })
  }

  // 广播对战更新
  public broadcastBattleUpdate(battleId: string, update: any) {
    this.io.to(`battle:${battleId}`).emit('battle_update', update)
  }

  // 广播交易信号
  public broadcastTradingSignal(agentId: string, signal: ITradingSignal) {
    this.io.to(`trading:${agentId}`).emit('trading_signal', signal)
  }

  // 发送私人消息
  public sendPrivateMessage(userId: string, message: IWebSocketMessage) {
    const socketId = this.connectedUsers.get(userId)
    if (socketId) {
      this.io.to(socketId).emit('private_message', message)
    }
  }

  // 广播系统通知
  public broadcastSystemNotification(notification: any) {
    this.io.emit('system_notification', notification)
  }

  // 获取在线用户数
  public getOnlineUsersCount(): number {
    return this.connectedUsers.size
  }

  // 获取对战房间观众数
  public getBattleSpectators(battleId: string): number {
    return this.battleRooms.get(battleId)?.size || 0
  }

  // 获取交易房间观众数
  public getTradingSpectators(agentId: string): number {
    return this.tradingRooms.get(agentId)?.size || 0
  }
}

export default WebSocketService