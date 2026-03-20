import mongoose, { Schema } from 'mongoose'
import { IAgent, ITradeRecord, IEquityPoint } from '@/types'

// 交易记录子模式
const tradeRecordSchema = new Schema<ITradeRecord>({
  symbol: {
    type: String,
    required: true,
    uppercase: true
  },
  side: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  profit: {
    type: Number,
    default: 0
  },
  commission: {
    type: Number,
    default: 0
  },
  reason: {
    type: String,
    trim: true
  }
}, { _id: false })

// 权益曲线点子模式
const equityPointSchema = new Schema<IEquityPoint>({
  timestamp: {
    type: Date,
    required: true
  },
  equity: {
    type: Number,
    required: true,
    min: 0
  },
  drawdown: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  }
}, { _id: false })

// 回测结果子模式
const backtestResultSchema = new Schema({
  period: {
    type: String,
    required: true
  },
  initialCapital: {
    type: Number,
    required: true,
    min: 0
  },
  finalCapital: {
    type: Number,
    required: true,
    min: 0
  },
  totalReturn: {
    type: Number,
    required: true
  },
  annualizedReturn: {
    type: Number,
    required: true
  },
  maxDrawdown: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  sharpeRatio: {
    type: Number,
    required: true
  },
  trades: [tradeRecordSchema],
  equity: [equityPointSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false })

// 代理主模式
const agentSchema = new Schema<IAgent>({
  name: {
    type: String,
    required: [true, '代理名称是必需的'],
    trim: true,
    minlength: [3, '代理名称至少需要3个字符'],
    maxlength: [100, '代理名称不能超过100个字符']
  },
  description: {
    type: String,
    required: [true, '代理描述是必需的'],
    trim: true,
    minlength: [10, '代理描述至少需要10个字符'],
    maxlength: [1000, '代理描述不能超过1000个字符']
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, '作者是必需的']
  },
  authorInfo: {
    username: {
      type: String,
      required: true
    },
    avatar: {
      type: String
    }
  },
  code: {
    type: String,
    required: [true, '策略代码是必需的'],
    minlength: [50, '策略代码至少需要50个字符']
  },
  language: {
    type: String,
    enum: ['python', 'javascript', 'pine'],
    required: [true, '编程语言是必需的']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, '标签不能超过30个字符']
  }],
  category: {
    type: String,
    required: [true, '分类是必需的'],
    enum: [
      '趋势跟踪',
      '均值回归',
      '动量策略',
      '套利策略',
      '高频交易',
      '机器学习',
      '深度学习',
      '量化分析',
      '风险管理',
      '其他'
    ]
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  version: {
    type: String,
    default: '1.0.0',
    match: [/^\d+\.\d+\.\d+$/, '版本号格式应为 x.y.z']
  },
  
  // 性能统计
  stats: {
    totalTrades: {
      type: Number,
      default: 0,
      min: 0
    },
    winningTrades: {
      type: Number,
      default: 0,
      min: 0
    },
    losingTrades: {
      type: Number,
      default: 0,
      min: 0
    },
    totalProfit: {
      type: Number,
      default: 0
    },
    totalLoss: {
      type: Number,
      default: 0
    },
    winRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    profitFactor: {
      type: Number,
      default: 0,
      min: 0
    },
    maxDrawdown: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    sharpeRatio: {
      type: Number,
      default: 0
    },
    averageReturn: {
      type: Number,
      default: 0
    },
    volatility: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // 评分和评论
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    },
    reviews: [{
      type: Schema.Types.ObjectId,
      ref: 'Review'
    }]
  },
  
  // 回测结果
  backtestResults: [backtestResultSchema]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// 索引
agentSchema.index({ author: 1 })
agentSchema.index({ category: 1 })
agentSchema.index({ tags: 1 })
agentSchema.index({ isPublic: 1, isActive: 1 })
agentSchema.index({ 'stats.totalProfit': -1 })
agentSchema.index({ 'stats.winRate': -1 })
agentSchema.index({ 'rating.average': -1 })
agentSchema.index({ createdAt: -1 })
agentSchema.index({ name: 'text', description: 'text' }) // 全文搜索

// 虚拟字段：净收益
agentSchema.virtual('netProfit').get(function() {
  return this.stats.totalProfit - this.stats.totalLoss
})

// 虚拟字段：收益率
agentSchema.virtual('returnRate').get(function() {
  if (this.backtestResults.length === 0) return 0
  const latestResult = this.backtestResults[this.backtestResults.length - 1]
  return ((latestResult.finalCapital - latestResult.initialCapital) / latestResult.initialCapital) * 100
})

// 虚拟字段：是否为热门代理
agentSchema.virtual('isPopular').get(function() {
  return this.rating.count >= 10 && this.rating.average >= 4.0
})

// 静态方法：获取热门代理
agentSchema.statics.getPopularAgents = function(limit = 10) {
  return this.find({
    isPublic: true,
    isActive: true,
    'rating.count': { $gte: 5 }
  })
  .sort({ 'rating.average': -1, 'rating.count': -1 })
  .limit(limit)
  .populate('author', 'username avatar')
}

// 静态方法：按分类获取代理
agentSchema.statics.getAgentsByCategory = function(category: string, limit = 20) {
  return this.find({
    category,
    isPublic: true,
    isActive: true
  })
  .sort({ 'stats.totalProfit': -1 })
  .limit(limit)
  .populate('author', 'username avatar')
}

// 静态方法：搜索代理
agentSchema.statics.searchAgents = function(query: string, options: any = {}) {
  const { page = 1, limit = 20, category, tags, sortBy = 'relevance' } = options
  
  let searchQuery: any = {
    $text: { $search: query },
    isPublic: true,
    isActive: true
  }
  
  if (category) {
    searchQuery.category = category
  }
  
  if (tags && tags.length > 0) {
    searchQuery.tags = { $in: tags }
  }
  
  let sortOptions: any = {}
  switch (sortBy) {
    case 'profit':
      sortOptions = { 'stats.totalProfit': -1 }
      break
    case 'rating':
      sortOptions = { 'rating.average': -1, 'rating.count': -1 }
      break
    case 'recent':
      sortOptions = { createdAt: -1 }
      break
    default:
      sortOptions = { score: { $meta: 'textScore' } }
  }
  
  return this.find(searchQuery)
    .sort(sortOptions)
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('author', 'username avatar')
}

// 实例方法：更新统计数据
agentSchema.methods.updateStats = async function() {
  // 基于回测结果更新统计数据
  if (this.backtestResults.length === 0) return
  
  const latestResult = this.backtestResults[this.backtestResults.length - 1]
  const trades = latestResult.trades
  
  if (trades.length === 0) return
  
  const winningTrades = trades.filter(trade => (trade.profit || 0) > 0)
  const losingTrades = trades.filter(trade => (trade.profit || 0) < 0)
  
  const totalProfit = trades.reduce((sum, trade) => sum + Math.max(trade.profit || 0, 0), 0)
  const totalLoss = Math.abs(trades.reduce((sum, trade) => sum + Math.min(trade.profit || 0, 0), 0))
  
  this.stats = {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    totalProfit,
    totalLoss,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0,
    maxDrawdown: latestResult.maxDrawdown,
    sharpeRatio: latestResult.sharpeRatio,
    averageReturn: trades.length > 0 ? trades.reduce((sum, trade) => sum + (trade.profit || 0), 0) / trades.length : 0,
    volatility: this.calculateVolatility(trades)
  }
  
  await this.save()
}

// 实例方法：计算波动率
agentSchema.methods.calculateVolatility = function(trades: ITradeRecord[]): number {
  if (trades.length < 2) return 0
  
  const returns = trades.map(trade => trade.profit || 0)
  const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1)
  
  return Math.sqrt(variance)
}

// 实例方法：添加回测结果
agentSchema.methods.addBacktestResult = async function(result: any) {
  this.backtestResults.push(result)
  
  // 只保留最近10次回测结果
  if (this.backtestResults.length > 10) {
    this.backtestResults = this.backtestResults.slice(-10)
  }
  
  await this.updateStats()
  await this.save()
}

// 实例方法：检查用户权限
agentSchema.methods.canUserEdit = function(userId: string): boolean {
  return this.author.toString() === userId
}

// 导出模型
export const Agent = mongoose.model<IAgent>('Agent', agentSchema)
export default Agent