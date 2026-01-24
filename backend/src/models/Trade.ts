import mongoose, { Schema } from 'mongoose'
import { ITrade } from '@/types'

const tradeSchema = new Schema<ITrade>({
  agent: {
    type: Schema.Types.ObjectId,
    ref: 'Agent',
    required: [true, '代理ID是必需的']
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '用户ID是必需的']
  },
  symbol: {
    type: String,
    required: [true, '交易标的是必需的'],
    uppercase: true,
    trim: true
  },
  side: {
    type: String,
    enum: ['buy', 'sell'],
    required: [true, '交易方向是必需的']
  },
  type: {
    type: String,
    enum: ['market', 'limit', 'stop', 'stop_limit'],
    default: 'market'
  },
  quantity: {
    type: Number,
    required: [true, '交易数量是必需的'],
    min: [0.000001, '交易数量必须大于0']
  },
  price: {
    type: Number,
    required: [true, '交易价格是必需的'],
    min: [0, '交易价格不能为负数']
  },
  executedPrice: {
    type: Number,
    min: [0, '执行价格不能为负数']
  },
  executedQuantity: {
    type: Number,
    min: [0, '执行数量不能为负数']
  },
  status: {
    type: String,
    enum: ['pending', 'filled', 'partially_filled', 'cancelled', 'rejected'],
    default: 'pending'
  },
  orderTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  executionTime: {
    type: Date
  },
  profit: {
    type: Number,
    default: 0
  },
  commission: {
    type: Number,
    default: 0,
    min: [0, '手续费不能为负数']
  },
  reason: {
    type: String,
    trim: true,
    maxlength: [500, '交易原因不能超过500个字符']
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  // 市场数据快照
  marketData: {
    bid: Number,
    ask: Number,
    volume: Number,
    timestamp: Date
  },
  // 风险指标
  riskMetrics: {
    stopLoss: Number,
    takeProfit: Number,
    riskReward: Number,
    positionSize: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// 索引
tradeSchema.index({ agent: 1, createdAt: -1 })
tradeSchema.index({ user: 1, createdAt: -1 })
tradeSchema.index({ symbol: 1, createdAt: -1 })
tradeSchema.index({ status: 1 })
tradeSchema.index({ orderTime: -1 })
tradeSchema.index({ profit: -1 })
tradeSchema.index({ agent: 1, symbol: 1, createdAt: -1 })

// 虚拟字段
tradeSchema.virtual('netProfit').get(function() {
  return this.profit - this.commission
})

tradeSchema.virtual('isProfit').get(function() {
  return this.profit > 0
})

tradeSchema.virtual('executionDelay').get(function() {
  if (this.executionTime && this.orderTime) {
    return this.executionTime.getTime() - this.orderTime.getTime()
  }
  return null
})

// 静态方法
tradeSchema.statics.getTradesByAgent = function(agentId: string, options: any = {}) {
  const { limit = 100, skip = 0, status, symbol, startDate, endDate } = options
  
  const query: any = { agent: agentId }
  
  if (status) query.status = status
  if (symbol) query.symbol = symbol
  if (startDate || endDate) {
    query.createdAt = {}
    if (startDate) query.createdAt.$gte = new Date(startDate)
    if (endDate) query.createdAt.$lte = new Date(endDate)
  }
  
  return this.find(query)
    .populate('agent', 'name')
    .populate('user', 'username')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
}

tradeSchema.statics.getTradeStats = async function(agentId: string, period?: string) {
  const matchStage: any = { agent: new mongoose.Types.ObjectId(agentId) }
  
  if (period) {
    const now = new Date()
    let startDate: Date
    
    switch (period) {
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(0)
    }
    
    matchStage.createdAt = { $gte: startDate }
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalTrades: { $sum: 1 },
        totalProfit: { $sum: '$profit' },
        totalCommission: { $sum: '$commission' },
        winningTrades: {
          $sum: { $cond: [{ $gt: ['$profit', 0] }, 1, 0] }
        },
        losingTrades: {
          $sum: { $cond: [{ $lt: ['$profit', 0] }, 1, 0] }
        },
        avgProfit: { $avg: '$profit' },
        maxProfit: { $max: '$profit' },
        minProfit: { $min: '$profit' }
      }
    }
  ])
  
  if (stats.length === 0) {
    return {
      totalTrades: 0,
      totalProfit: 0,
      totalCommission: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgProfit: 0,
      maxProfit: 0,
      minProfit: 0,
      netProfit: 0
    }
  }
  
  const result = stats[0]
  result.winRate = result.totalTrades > 0 ? (result.winningTrades / result.totalTrades) * 100 : 0
  result.netProfit = result.totalProfit - result.totalCommission
  
  return result
}

// 实例方法
tradeSchema.methods.execute = async function(executedPrice: number, executedQuantity?: number) {
  this.executedPrice = executedPrice
  this.executedQuantity = executedQuantity || this.quantity
  this.executionTime = new Date()
  this.status = this.executedQuantity === this.quantity ? 'filled' : 'partially_filled'
  
  // 计算利润（简化版本，实际应该考虑持仓成本）
  if (this.side === 'sell') {
    this.profit = (executedPrice - this.price) * this.executedQuantity
  }
  
  return this.save()
}

tradeSchema.methods.cancel = async function(reason?: string) {
  this.status = 'cancelled'
  if (reason) this.reason = reason
  return this.save()
}

export const Trade = mongoose.model<ITrade>('Trade', tradeSchema)
export default Trade