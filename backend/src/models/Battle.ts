import mongoose, { Schema } from 'mongoose'
import { IBattle, IBattleParticipant, IBattleResult } from '@/types'

// 参与者子模式
const participantSchema = new Schema<IBattleParticipant>({
  agent: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  agentInfo: {
    name: { type: String, required: true },
    version: { type: String, required: true },
    category: { type: String, required: true }
  },
  userInfo: {
    username: { type: String, required: true },
    avatar: String
  },
  initialCapital: {
    type: Number,
    required: true,
    min: [1000, '初始资金不能少于1000']
  },
  finalCapital: {
    type: Number,
    default: 0
  },
  totalReturn: {
    type: Number,
    default: 0
  },
  totalTrades: {
    type: Number,
    default: 0
  },
  winningTrades: {
    type: Number,
    default: 0
  },
  maxDrawdown: {
    type: Number,
    default: 0
  },
  sharpeRatio: {
    type: Number,
    default: 0
  },
  rank: {
    type: Number,
    min: 1
  },
  isWinner: {
    type: Boolean,
    default: false
  }
}, { _id: false })

// 对战结果子模式
const battleResultSchema = new Schema<IBattleResult>({
  winner: {
    type: Schema.Types.ObjectId,
    ref: 'Agent'
  },
  rankings: [{
    agent: {
      type: Schema.Types.ObjectId,
      ref: 'Agent',
      required: true
    },
    rank: {
      type: Number,
      required: true,
      min: 1
    },
    score: {
      type: Number,
      required: true
    },
    metrics: {
      totalReturn: Number,
      sharpeRatio: Number,
      maxDrawdown: Number,
      winRate: Number,
      profitFactor: Number
    }
  }],
  summary: {
    totalTrades: {
      type: Number,
      default: 0
    },
    totalVolume: {
      type: Number,
      default: 0
    },
    avgReturn: {
      type: Number,
      default: 0
    },
    bestPerformer: {
      agent: {
        type: Schema.Types.ObjectId,
        ref: 'Agent'
      },
      return: Number
    },
    worstPerformer: {
      agent: {
        type: Schema.Types.ObjectId,
        ref: 'Agent'
      },
      return: Number
    }
  }
}, { _id: false })

const battleSchema = new Schema<IBattle>({
  title: {
    type: String,
    required: [true, '对战标题是必需的'],
    trim: true,
    minlength: [5, '对战标题至少需要5个字符'],
    maxlength: [200, '对战标题不能超过200个字符']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, '对战描述不能超过1000个字符']
  },
  type: {
    type: String,
    enum: ['public', 'private', 'tournament'],
    default: 'public'
  },
  mode: {
    type: String,
    enum: ['realtime', 'backtest', 'simulation'],
    required: [true, '对战模式是必需的']
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'cancelled'],
    default: 'pending'
  },
  creator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '创建者是必需的']
  },
  participants: [participantSchema],
  maxParticipants: {
    type: Number,
    default: 10,
    min: [2, '至少需要2个参与者'],
    max: [100, '最多支持100个参与者']
  },
  minParticipants: {
    type: Number,
    default: 2,
    min: [2, '至少需要2个参与者']
  },
  // 对战配置
  config: {
    duration: {
      type: Number,
      required: true,
      min: [1, '对战时长至少1分钟']
    },
    durationUnit: {
      type: String,
      enum: ['minutes', 'hours', 'days'],
      default: 'hours'
    },
    initialCapital: {
      type: Number,
      required: true,
      min: [1000, '初始资金不能少于1000']
    },
    allowedSymbols: [{
      type: String,
      uppercase: true
    }],
    tradingRules: {
      maxPositionSize: {
        type: Number,
        min: [0.01, '最大仓位不能小于0.01'],
        max: [1, '最大仓位不能超过1']
      },
      maxDailyTrades: {
        type: Number,
        min: [1, '每日最大交易次数不能小于1']
      },
      commission: {
        type: Number,
        default: 0.001,
        min: [0, '手续费不能为负数']
      },
      slippage: {
        type: Number,
        default: 0.001,
        min: [0, '滑点不能为负数']
      }
    }
  },
  // 时间设置
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  registrationDeadline: {
    type: Date,
    required: true
  },
  // 奖励设置
  rewards: {
    enabled: {
      type: Boolean,
      default: false
    },
    prize: {
      first: Number,
      second: Number,
      third: Number,
      participation: Number
    },
    currency: {
      type: String,
      default: 'USD'
    }
  },
  // 对战结果
  result: battleResultSchema,
  // 统计信息
  stats: {
    totalViews: {
      type: Number,
      default: 0
    },
    totalLikes: {
      type: Number,
      default: 0
    },
    totalComments: {
      type: Number,
      default: 0
    }
  },
  // 标签
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, '标签不能超过30个字符']
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// 索引
battleSchema.index({ creator: 1, createdAt: -1 })
battleSchema.index({ status: 1, startTime: 1 })
battleSchema.index({ type: 1, isPublic: 1 })
battleSchema.index({ startTime: 1, endTime: 1 })
battleSchema.index({ 'participants.agent': 1 })
battleSchema.index({ 'participants.user': 1 })
battleSchema.index({ tags: 1 })
battleSchema.index({ isFeatured: 1, createdAt: -1 })
battleSchema.index({ title: 'text', description: 'text' })

// 虚拟字段
battleSchema.virtual('participantCount').get(function() {
  return this.participants.length
})

battleSchema.virtual('isActive').get(function() {
  const now = new Date()
  return this.status === 'active' && now >= this.startTime && now <= this.endTime
})

battleSchema.virtual('canRegister').get(function() {
  const now = new Date()
  return this.status === 'pending' && 
         now < this.registrationDeadline && 
         this.participants.length < this.maxParticipants
})

battleSchema.virtual('duration').get(function() {
  return this.endTime.getTime() - this.startTime.getTime()
})

// 静态方法
battleSchema.statics.getActiveBattles = function() {
  const now = new Date()
  return this.find({
    status: 'active',
    startTime: { $lte: now },
    endTime: { $gte: now },
    isPublic: true
  })
  .populate('creator', 'username avatar')
  .populate('participants.agent', 'name category')
  .populate('participants.user', 'username avatar')
  .sort({ startTime: 1 })
}

battleSchema.statics.getUpcomingBattles = function(limit = 10) {
  const now = new Date()
  return this.find({
    status: 'pending',
    startTime: { $gt: now },
    isPublic: true
  })
  .populate('creator', 'username avatar')
  .sort({ startTime: 1 })
  .limit(limit)
}

battleSchema.statics.getFeaturedBattles = function(limit = 5) {
  return this.find({
    isFeatured: true,
    isPublic: true
  })
  .populate('creator', 'username avatar')
  .populate('participants.agent', 'name category')
  .sort({ createdAt: -1 })
  .limit(limit)
}

battleSchema.statics.searchBattles = function(query: string, options: any = {}) {
  const { status, type, limit = 20, skip = 0 } = options
  
  const searchQuery: any = {
    $text: { $search: query },
    isPublic: true
  }
  
  if (status) searchQuery.status = status
  if (type) searchQuery.type = type
  
  return this.find(searchQuery)
    .populate('creator', 'username avatar')
    .populate('participants.agent', 'name category')
    .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
    .limit(limit)
    .skip(skip)
}

// 实例方法
battleSchema.methods.addParticipant = async function(agentId: string, userId: string) {
  if (this.participants.length >= this.maxParticipants) {
    throw new Error('对战参与者已满')
  }
  
  if (!this.canRegister) {
    throw new Error('当前无法注册参与对战')
  }
  
  // 检查是否已经参与
  const existingParticipant = this.participants.find(
    (p: any) => p.agent.toString() === agentId || p.user.toString() === userId
  )
  
  if (existingParticipant) {
    throw new Error('用户或代理已经参与此对战')
  }
  
  // 获取代理和用户信息
  const Agent = mongoose.model('Agent')
  const User = mongoose.model('User')
  
  const agent = await Agent.findById(agentId)
  const user = await User.findById(userId)
  
  if (!agent || !user) {
    throw new Error('代理或用户不存在')
  }
  
  this.participants.push({
    agent: agentId,
    user: userId,
    agentInfo: {
      name: agent.name,
      version: agent.version,
      category: agent.category
    },
    userInfo: {
      username: user.username,
      avatar: user.avatar
    },
    initialCapital: this.config.initialCapital
  })
  
  return this.save()
}

battleSchema.methods.removeParticipant = async function(participantId: string) {
  if (this.status !== 'pending') {
    throw new Error('只能在对战开始前移除参与者')
  }
  
  this.participants = this.participants.filter(
    (p: any) => p.agent.toString() !== participantId && p.user.toString() !== participantId
  )
  
  return this.save()
}

battleSchema.methods.start = async function() {
  if (this.participants.length < this.minParticipants) {
    throw new Error(`参与者不足，至少需要${this.minParticipants}个参与者`)
  }
  
  this.status = 'active'
  this.startTime = new Date()
  
  return this.save()
}

battleSchema.methods.complete = async function() {
  this.status = 'completed'
  this.endTime = new Date()
  
  // 计算结果和排名
  await this.calculateResults()
  
  return this.save()
}

battleSchema.methods.calculateResults = async function() {
  // 按总收益率排序
  const sortedParticipants = this.participants.sort((a: any, b: any) => b.totalReturn - a.totalReturn)
  
  // 设置排名和获胜者
  const rankings = sortedParticipants.map((participant: any, index: number) => {
    participant.rank = index + 1
    participant.isWinner = index === 0
    
    return {
      agent: participant.agent,
      rank: index + 1,
      score: participant.totalReturn,
      metrics: {
        totalReturn: participant.totalReturn,
        sharpeRatio: participant.sharpeRatio,
        maxDrawdown: participant.maxDrawdown,
        winRate: participant.winningTrades / Math.max(participant.totalTrades, 1) * 100,
        profitFactor: participant.totalReturn > 0 ? Math.abs(participant.totalReturn) : 0
      }
    }
  })
  
  // 计算汇总统计
  const totalTrades = this.participants.reduce((sum: number, p: any) => sum + p.totalTrades, 0)
  const avgReturn = this.participants.reduce((sum: number, p: any) => sum + p.totalReturn, 0) / this.participants.length
  
  const bestPerformer = sortedParticipants[0]
  const worstPerformer = sortedParticipants[sortedParticipants.length - 1]
  
  this.result = {
    winner: bestPerformer.agent,
    rankings,
    summary: {
      totalTrades,
      totalVolume: 0, // 需要从实际交易数据计算
      avgReturn,
      bestPerformer: {
        agent: bestPerformer.agent,
        return: bestPerformer.totalReturn
      },
      worstPerformer: {
        agent: worstPerformer.agent,
        return: worstPerformer.totalReturn
      }
    }
  }
}

export const Battle = mongoose.model<IBattle>('Battle', battleSchema)
export default Battle