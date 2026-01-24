import { Response } from 'express'
import Joi from 'joi'
import { Agent } from '@/models/Agent'
import { User } from '@/models/User'
import { IAuthRequest, IApiResponse, IBattle } from '@/types'
import { AppError, asyncHandler } from '@/middleware/errorHandler'
import { RedisService } from '@/config/redis'

// 验证模式
const createBattleSchema = Joi.object({
  challengerAgentId: Joi.string().required().messages({
    'any.required': '挑战者代理ID是必需的'
  }),
  opponentAgentId: Joi.string().required().messages({
    'any.required': '对手代理ID是必需的'
  }),
  symbol: Joi.string().required().messages({
    'any.required': '交易品种是必需的'
  }),
  duration: Joi.number().integer().min(1).max(30).default(7).messages({
    'number.min': '对战时长至少1天',
    'number.max': '对战时长最多30天'
  }),
  initialCapital: Joi.number().positive().default(10000).messages({
    'number.positive': '初始资金必须大于0'
  }),
  isPublic: Joi.boolean().default(true),
  description: Joi.string().max(500).allow('').messages({
    'string.max': '描述不能超过500个字符'
  })
})

const getBattlesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('createdAt', 'startTime', 'endTime', 'status').default('createdAt'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  status: Joi.string().valid('pending', 'active', 'completed', 'cancelled').optional(),
  symbol: Joi.string().optional(),
  participantId: Joi.string().optional()
})

class BattleController {
  // 创建对战
  createBattle = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证输入数据
    const { error, value } = createBattleSchema.validate(req.body)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const {
      challengerAgentId,
      opponentAgentId,
      symbol,
      duration,
      initialCapital,
      isPublic,
      description
    } = value

    // 检查两个代理是否存在
    const [challengerAgent, opponentAgent] = await Promise.all([
      Agent.findById(challengerAgentId),
      Agent.findById(opponentAgentId)
    ])

    if (!challengerAgent) {
      throw new AppError('挑战者代理不存在', 404)
    }

    if (!opponentAgent) {
      throw new AppError('对手代理不存在', 404)
    }

    // 检查权限
    if (challengerAgent.author.toString() !== req.user.id) {
      throw new AppError('只能使用自己的代理发起挑战', 403)
    }

    if (!challengerAgent.isActive || !opponentAgent.isActive) {
      throw new AppError('参与对战的代理必须处于激活状态', 400)
    }

    if (!challengerAgent.isPublic || !opponentAgent.isPublic) {
      throw new AppError('参与对战的代理必须是公开的', 400)
    }

    // 不能与自己的代理对战
    if (challengerAgent.author.toString() === opponentAgent.author.toString()) {
      throw new AppError('不能与自己的代理对战', 400)
    }

    // 检查是否已有相同的对战
    const existingBattle = await this.findExistingBattle(challengerAgentId, opponentAgentId, symbol)
    if (existingBattle) {
      throw new AppError('已存在相同的对战', 400)
    }

    // 创建对战
    const battleId = `battle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const battle: IBattle = {
      id: battleId,
      challengerAgent: {
        id: challengerAgent._id.toString(),
        name: challengerAgent.name,
        author: challengerAgent.author
      },
      opponentAgent: {
        id: opponentAgent._id.toString(),
        name: opponentAgent.name,
        author: opponentAgent.author
      },
      symbol,
      duration,
      initialCapital,
      status: 'pending',
      isPublic,
      description,
      createdAt: new Date(),
      startTime: null,
      endTime: null,
      result: null,
      trades: [],
      performance: {
        challenger: {
          totalTrades: 0,
          totalProfit: 0,
          winRate: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          currentEquity: initialCapital,
          equityCurve: []
        },
        opponent: {
          totalTrades: 0,
          totalProfit: 0,
          winRate: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          currentEquity: initialCapital,
          equityCurve: []
        }
      },
      spectators: 0,
      comments: []
    }

    // 保存到Redis
    await RedisService.set(`battle:${battleId}`, JSON.stringify(battle), 30 * 24 * 60 * 60) // 30天
    
    // 添加到对战列表
    await RedisService.lPush('battles:pending', battleId)

    const response: IApiResponse = {
      success: true,
      message: '对战创建成功',
      data: {
        battle: {
          id: battle.id,
          challengerAgent: battle.challengerAgent,
          opponentAgent: battle.opponentAgent,
          symbol: battle.symbol,
          duration: battle.duration,
          initialCapital: battle.initialCapital,
          status: battle.status,
          isPublic: battle.isPublic,
          description: battle.description,
          createdAt: battle.createdAt
        }
      }
    }

    res.status(201).json(response)
  })

  // 接受对战挑战
  acceptBattle = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const { battleId } = req.params

    // 获取对战信息
    const battleData = await RedisService.get(`battle:${battleId}`)
    if (!battleData) {
      throw new AppError('对战不存在', 404)
    }

    const battle: IBattle = JSON.parse(battleData)

    if (battle.status !== 'pending') {
      throw new AppError('对战已开始或已结束', 400)
    }

    // 检查权限（必须是对手代理的作者）
    if (battle.opponentAgent.author.toString() !== req.user.id) {
      throw new AppError('只有对手代理的作者可以接受挑战', 403)
    }

    // 开始对战
    battle.status = 'active'
    battle.startTime = new Date()
    battle.endTime = new Date(Date.now() + battle.duration * 24 * 60 * 60 * 1000)

    // 更新Redis
    await RedisService.set(`battle:${battleId}`, JSON.stringify(battle), 30 * 24 * 60 * 60)
    
    // 从待处理列表移除，添加到活跃列表
    await RedisService.lPush('battles:active', battleId)
    await this.removeFromList('battles:pending', battleId)

    const response: IApiResponse = {
      success: true,
      message: '对战已开始',
      data: {
        battle: {
          id: battle.id,
          status: battle.status,
          startTime: battle.startTime,
          endTime: battle.endTime
        }
      }
    }

    res.status(200).json(response)
  })

  // 拒绝对战挑战
  rejectBattle = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const { battleId } = req.params

    // 获取对战信息
    const battleData = await RedisService.get(`battle:${battleId}`)
    if (!battleData) {
      throw new AppError('对战不存在', 404)
    }

    const battle: IBattle = JSON.parse(battleData)

    if (battle.status !== 'pending') {
      throw new AppError('对战已开始或已结束', 400)
    }

    // 检查权限
    if (battle.opponentAgent.author.toString() !== req.user.id) {
      throw new AppError('只有对手代理的作者可以拒绝挑战', 403)
    }

    // 取消对战
    battle.status = 'cancelled'

    // 更新Redis
    await RedisService.set(`battle:${battleId}`, JSON.stringify(battle), 30 * 24 * 60 * 60)
    
    // 从待处理列表移除
    await this.removeFromList('battles:pending', battleId)

    const response: IApiResponse = {
      success: true,
      message: '对战已拒绝'
    }

    res.status(200).json(response)
  })

  // 获取对战列表
  getBattles = asyncHandler(async (req: IAuthRequest, res: Response) => {
    // 验证查询参数
    const { error, value } = getBattlesSchema.validate(req.query)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { page, limit, sort, order, status, symbol, participantId } = value

    // 获取对战ID列表
    let battleIds: string[] = []
    
    if (status) {
      battleIds = await RedisService.lRange(`battles:${status}`, 0, -1)
    } else {
      // 获取所有状态的对战
      const [pending, active, completed] = await Promise.all([
        RedisService.lRange('battles:pending', 0, -1),
        RedisService.lRange('battles:active', 0, -1),
        RedisService.lRange('battles:completed', 0, -1)
      ])
      battleIds = [...pending, ...active, ...completed]
    }

    // 获取对战详情
    const battles: IBattle[] = []
    for (const battleId of battleIds) {
      const battleData = await RedisService.get(`battle:${battleId}`)
      if (battleData) {
        const battle: IBattle = JSON.parse(battleData)
        
        // 应用过滤条件
        if (symbol && battle.symbol !== symbol) continue
        if (participantId && 
            battle.challengerAgent.author.toString() !== participantId && 
            battle.opponentAgent.author.toString() !== participantId) continue
        
        // 只显示公开的对战（除非是参与者）
        if (!battle.isPublic && req.user && 
            battle.challengerAgent.author.toString() !== req.user.id && 
            battle.opponentAgent.author.toString() !== req.user.id) continue
        
        battles.push(battle)
      }
    }

    // 排序
    battles.sort((a, b) => {
      let aValue: any, bValue: any
      
      switch (sort) {
        case 'startTime':
          aValue = a.startTime ? new Date(a.startTime).getTime() : 0
          bValue = b.startTime ? new Date(b.startTime).getTime() : 0
          break
        case 'endTime':
          aValue = a.endTime ? new Date(a.endTime).getTime() : 0
          bValue = b.endTime ? new Date(b.endTime).getTime() : 0
          break
        case 'createdAt':
        default:
          aValue = new Date(a.createdAt).getTime()
          bValue = new Date(b.createdAt).getTime()
          break
      }
      
      return order === 'asc' ? aValue - bValue : bValue - aValue
    })

    // 分页
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedBattles = battles.slice(startIndex, endIndex)

    const response: IApiResponse = {
      success: true,
      message: '获取对战列表成功',
      data: {
        battles: paginatedBattles.map(battle => ({
          id: battle.id,
          challengerAgent: battle.challengerAgent,
          opponentAgent: battle.opponentAgent,
          symbol: battle.symbol,
          duration: battle.duration,
          initialCapital: battle.initialCapital,
          status: battle.status,
          isPublic: battle.isPublic,
          description: battle.description,
          createdAt: battle.createdAt,
          startTime: battle.startTime,
          endTime: battle.endTime,
          result: battle.result,
          spectators: battle.spectators,
          performance: battle.performance
        })),
        pagination: {
          page,
          limit,
          total: battles.length,
          pages: Math.ceil(battles.length / limit)
        }
      }
    }

    res.status(200).json(response)
  })

  // 获取单个对战详情
  getBattle = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { battleId } = req.params

    const battleData = await RedisService.get(`battle:${battleId}`)
    if (!battleData) {
      throw new AppError('对战不存在', 404)
    }

    const battle: IBattle = JSON.parse(battleData)

    // 检查访问权限
    if (!battle.isPublic && req.user && 
        battle.challengerAgent.author.toString() !== req.user.id && 
        battle.opponentAgent.author.toString() !== req.user.id) {
      throw new AppError('无权访问此对战', 403)
    }

    // 增加观众数（如果不是参与者）
    if (req.user && 
        battle.challengerAgent.author.toString() !== req.user.id && 
        battle.opponentAgent.author.toString() !== req.user.id) {
      battle.spectators += 1
      await RedisService.set(`battle:${battleId}`, JSON.stringify(battle), 30 * 24 * 60 * 60)
    }

    const response: IApiResponse = {
      success: true,
      message: '获取对战详情成功',
      data: {
        battle
      }
    }

    res.status(200).json(response)
  })

  // 获取我的对战
  getMyBattles = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证查询参数
    const { error, value } = getBattlesSchema.validate(req.query)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { page, limit, sort, order, status } = value

    // 获取所有对战ID
    let battleIds: string[] = []
    
    if (status) {
      battleIds = await RedisService.lRange(`battles:${status}`, 0, -1)
    } else {
      const [pending, active, completed] = await Promise.all([
        RedisService.lRange('battles:pending', 0, -1),
        RedisService.lRange('battles:active', 0, -1),
        RedisService.lRange('battles:completed', 0, -1)
      ])
      battleIds = [...pending, ...active, ...completed]
    }

    // 过滤我参与的对战
    const myBattles: IBattle[] = []
    for (const battleId of battleIds) {
      const battleData = await RedisService.get(`battle:${battleId}`)
      if (battleData) {
        const battle: IBattle = JSON.parse(battleData)
        
        if (battle.challengerAgent.author.toString() === req.user.id || 
            battle.opponentAgent.author.toString() === req.user.id) {
          myBattles.push(battle)
        }
      }
    }

    // 排序和分页（与getBattles相同逻辑）
    myBattles.sort((a, b) => {
      let aValue: any, bValue: any
      
      switch (sort) {
        case 'startTime':
          aValue = a.startTime ? new Date(a.startTime).getTime() : 0
          bValue = b.startTime ? new Date(b.startTime).getTime() : 0
          break
        case 'endTime':
          aValue = a.endTime ? new Date(a.endTime).getTime() : 0
          bValue = b.endTime ? new Date(b.endTime).getTime() : 0
          break
        case 'createdAt':
        default:
          aValue = new Date(a.createdAt).getTime()
          bValue = new Date(b.createdAt).getTime()
          break
      }
      
      return order === 'asc' ? aValue - bValue : bValue - aValue
    })

    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedBattles = myBattles.slice(startIndex, endIndex)

    const response: IApiResponse = {
      success: true,
      message: '获取我的对战成功',
      data: {
        battles: paginatedBattles,
        pagination: {
          page,
          limit,
          total: myBattles.length,
          pages: Math.ceil(myBattles.length / limit)
        }
      }
    }

    res.status(200).json(response)
  })

  // 获取对战统计
  getBattleStats = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 获取所有对战
    const [pending, active, completed] = await Promise.all([
      RedisService.lRange('battles:pending', 0, -1),
      RedisService.lRange('battles:active', 0, -1),
      RedisService.lRange('battles:completed', 0, -1)
    ])

    const allBattleIds = [...pending, ...active, ...completed]
    
    let totalBattles = 0
    let wonBattles = 0
    let lostBattles = 0
    let totalProfit = 0
    const symbols = new Set<string>()
    
    for (const battleId of allBattleIds) {
      const battleData = await RedisService.get(`battle:${battleId}`)
      if (battleData) {
        const battle: IBattle = JSON.parse(battleData)
        
        // 检查是否是我参与的对战
        const isChallenger = battle.challengerAgent.author.toString() === req.user.id
        const isOpponent = battle.opponentAgent.author.toString() === req.user.id
        
        if (isChallenger || isOpponent) {
          totalBattles++
          symbols.add(battle.symbol)
          
          if (battle.status === 'completed' && battle.result) {
            const myPerformance = isChallenger ? battle.performance.challenger : battle.performance.opponent
            totalProfit += myPerformance.totalProfit
            
            if (battle.result.winner === (isChallenger ? 'challenger' : 'opponent')) {
              wonBattles++
            } else {
              lostBattles++
            }
          }
        }
      }
    }

    const winRate = totalBattles > 0 ? (wonBattles / totalBattles) * 100 : 0

    const response: IApiResponse = {
      success: true,
      message: '获取对战统计成功',
      data: {
        stats: {
          totalBattles,
          wonBattles,
          lostBattles,
          winRate: Math.round(winRate * 100) / 100,
          totalProfit: Math.round(totalProfit * 100) / 100,
          symbolCount: symbols.size,
          symbols: Array.from(symbols),
          pendingBattles: pending.length,
          activeBattles: active.length,
          completedBattles: completed.length
        }
      }
    }

    res.status(200).json(response)
  })

  // 辅助方法：查找已存在的对战
  private async findExistingBattle(challengerAgentId: string, opponentAgentId: string, symbol: string): Promise<boolean> {
    const [pending, active] = await Promise.all([
      RedisService.lRange('battles:pending', 0, -1),
      RedisService.lRange('battles:active', 0, -1)
    ])

    const allBattleIds = [...pending, ...active]
    
    for (const battleId of allBattleIds) {
      const battleData = await RedisService.get(`battle:${battleId}`)
      if (battleData) {
        const battle: IBattle = JSON.parse(battleData)
        
        if (battle.symbol === symbol && 
            ((battle.challengerAgent.id === challengerAgentId && battle.opponentAgent.id === opponentAgentId) ||
             (battle.challengerAgent.id === opponentAgentId && battle.opponentAgent.id === challengerAgentId))) {
          return true
        }
      }
    }
    
    return false
  }

  // 辅助方法：从列表中移除元素
  private async removeFromList(listKey: string, value: string): Promise<void> {
    // Redis LREM命令：移除列表中的元素
    // 这里简化处理，实际项目中可能需要更复杂的逻辑
    const list = await RedisService.lRange(listKey, 0, -1)
    const filteredList = list.filter(item => item !== value)
    
    // 清空列表并重新添加
    await RedisService.del(listKey)
    if (filteredList.length > 0) {
      for (const item of filteredList) {
        await RedisService.lPush(listKey, item)
      }
    }
  }
}

export const battleController = new BattleController()
export default battleController