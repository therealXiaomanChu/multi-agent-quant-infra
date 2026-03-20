import mongoose, { Schema } from 'mongoose'
import { IBacktest, IBacktestConfig, IBacktestResult } from '@/types'

// 回测配置子模式
const backtestConfigSchema = new Schema<IBacktestConfig>({
  startDate: {
    type: Date,
    required: [true, '开始日期是必需的']
  },
  endDate: {
    type: Date,
    required: [true, '结束日期是必需的']
  },
  initialCapital: {
    type: Number,
    required: [true, '初始资金是必需的'],
    min: [1000, '初始资金不能少于1000']
  },
  symbols: [{
    type: String,
    required: true,
    uppercase: true
  }],
  timeframe: {
    type: String,
    enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'],
    default: '1h'
  },
  commission: {
    type: Number,
    default: 0.001,
    min: [0, '手续费不能为负数'],
    max: [0.1, '手续费不能超过10%']
  },
  slippage: {
    type: Number,
    default: 0.001,
    min: [0, '滑点不能为负数'],
    max: [0.01, '滑点不能超过1%']
  },
  maxPositionSize: {
    type: Number,
    default: 1.0,
    min: [0.01, '最大仓位不能小于1%'],
    max: [1.0, '最大仓位不能超过100%']
  },
  riskFreeRate: {
    type: Number,
    default: 0.02,
    min: [0, '无风险利率不能为负数']
  },
  benchmark: {
    type: String,
    default: 'SPY'
  }
}, { _id: false })

// 回测结果子模式
const backtestResultSchema = new Schema<IBacktestResult>({
  // 基本指标
  finalCapital: {
    type: Number,
    required: true,
    min: [0, '最终资金不能为负数']
  },
  totalReturn: {
    type: Number,
    required: true
  },
  annualizedReturn: {
    type: Number,
    required: true
  },
  totalTrades: {
    type: Number,
    default: 0,
    min: [0, '交易次数不能为负数']
  },
  winningTrades: {
    type: Number,
    default: 0,
    min: [0, '盈利交易次数不能为负数']
  },
  losingTrades: {
    type: Number,
    default: 0,
    min: [0, '亏损交易次数不能为负数']
  },
  winRate: {
    type: Number,
    default: 0,
    min: [0, '胜率不能为负数'],
    max: [100, '胜率不能超过100%']
  },
  
  // 风险指标
  maxDrawdown: {
    type: Number,
    default: 0,
    min: [0, '最大回撤不能为负数']
  },
  maxDrawdownDuration: {
    type: Number,
    default: 0,
    min: [0, '最大回撤持续时间不能为负数']
  },
  volatility: {
    type: Number,
    default: 0,
    min: [0, '波动率不能为负数']
  },
  sharpeRatio: {
    type: Number,
    default: 0
  },
  sortinoRatio: {
    type: Number,
    default: 0
  },
  calmarRatio: {
    type: Number,
    default: 0
  },
  
  // 收益指标
  profitFactor: {
    type: Number,
    default: 0,
    min: [0, '盈利因子不能为负数']
  },
  averageWin: {
    type: Number,
    default: 0
  },
  averageLoss: {
    type: Number,
    default: 0
  },
  largestWin: {
    type: Number,
    default: 0
  },
  largestLoss: {
    type: Number,
    default: 0
  },
  
  // 基准比较
  benchmarkReturn: {
    type: Number,
    default: 0
  },
  alpha: {
    type: Number,
    default: 0
  },
  beta: {
    type: Number,
    default: 0
  },
  informationRatio: {
    type: Number,
    default: 0
  },
  
  // 详细数据
  equityCurve: [{
    date: {
      type: Date,
      required: true
    },
    equity: {
      type: Number,
      required: true,
      min: [0, '权益不能为负数']
    },
    drawdown: {
      type: Number,
      required: true,
      min: [0, '回撤不能为负数']
    },
    benchmark: {
      type: Number,
      default: 0
    }
  }],
  
  monthlyReturns: [{
    year: {
      type: Number,
      required: true
    },
    month: {
      type: Number,
      required: true,
      min: [1, '月份不能小于1'],
      max: [12, '月份不能大于12']
    },
    return: {
      type: Number,
      required: true
    }
  }],
  
  // 交易分析
  tradeAnalysis: {
    avgHoldingPeriod: {
      type: Number,
      default: 0,
      min: [0, '平均持仓时间不能为负数']
    },
    avgTradesPerDay: {
      type: Number,
      default: 0,
      min: [0, '日均交易次数不能为负数']
    },
    maxConsecutiveWins: {
      type: Number,
      default: 0,
      min: [0, '最大连续盈利次数不能为负数']
    },
    maxConsecutiveLosses: {
      type: Number,
      default: 0,
      min: [0, '最大连续亏损次数不能为负数']
    }
  }
}, { _id: false })

const backtestSchema = new Schema<IBacktest>({
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
  name: {
    type: String,
    required: [true, '回测名称是必需的'],
    trim: true,
    minlength: [3, '回测名称至少需要3个字符'],
    maxlength: [200, '回测名称不能超过200个字符']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, '回测描述不能超过1000个字符']
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  progress: {
    type: Number,
    default: 0,
    min: [0, '进度不能为负数'],
    max: [100, '进度不能超过100%']
  },
  config: {
    type: backtestConfigSchema,
    required: [true, '回测配置是必需的']
  },
  result: backtestResultSchema,
  
  // 执行信息
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  duration: {
    type: Number,
    min: [0, '执行时间不能为负数']
  },
  
  // 错误信息
  error: {
    message: String,
    stack: String,
    code: String
  },
  
  // 日志
  logs: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'debug'],
      default: 'info'
    },
    message: {
      type: String,
      required: true
    }
  }],
  
  // 标签和分类
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, '标签不能超过30个字符']
  }],
  
  isPublic: {
    type: Boolean,
    default: false
  },
  
  // 统计信息
  stats: {
    views: {
      type: Number,
      default: 0,
      min: [0, '查看次数不能为负数']
    },
    likes: {
      type: Number,
      default: 0,
      min: [0, '点赞次数不能为负数']
    },
    shares: {
      type: Number,
      default: 0,
      min: [0, '分享次数不能为负数']
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// 索引
backtestSchema.index({ agent: 1, createdAt: -1 })
backtestSchema.index({ user: 1, createdAt: -1 })
backtestSchema.index({ status: 1 })
backtestSchema.index({ 'config.startDate': 1, 'config.endDate': 1 })
backtestSchema.index({ 'result.totalReturn': -1 })
backtestSchema.index({ 'result.sharpeRatio': -1 })
backtestSchema.index({ isPublic: 1, createdAt: -1 })
backtestSchema.index({ tags: 1 })
backtestSchema.index({ name: 'text', description: 'text' })

// 虚拟字段
backtestSchema.virtual('isCompleted').get(function() {
  return this.status === 'completed'
})

backtestSchema.virtual('isRunning').get(function() {
  return this.status === 'running'
})

backtestSchema.virtual('hasError').get(function() {
  return this.status === 'failed' && this.error
})

backtestSchema.virtual('executionTime').get(function() {
  if (this.startedAt && this.completedAt) {
    return this.completedAt.getTime() - this.startedAt.getTime()
  }
  return null
})

backtestSchema.virtual('periodDays').get(function() {
  if (this.config && this.config.startDate && this.config.endDate) {
    return Math.ceil((this.config.endDate.getTime() - this.config.startDate.getTime()) / (1000 * 60 * 60 * 24))
  }
  return 0
})

// 静态方法
backtestSchema.statics.getBacktestsByAgent = function(agentId: string, options: any = {}) {
  const { limit = 20, skip = 0, status, isPublic } = options
  
  const query: any = { agent: agentId }
  if (status) query.status = status
  if (typeof isPublic === 'boolean') query.isPublic = isPublic
  
  return this.find(query)
    .populate('agent', 'name category')
    .populate('user', 'username avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
}

backtestSchema.statics.getTopPerformingBacktests = function(metric = 'totalReturn', limit = 10) {
  const sortField = `result.${metric}`
  
  return this.find({
    status: 'completed',
    isPublic: true,
    [`result.${metric}`]: { $exists: true }
  })
  .populate('agent', 'name category')
  .populate('user', 'username avatar')
  .sort({ [sortField]: -1 })
  .limit(limit)
}

backtestSchema.statics.getBacktestStats = async function(agentId?: string) {
  const matchStage: any = { status: 'completed' }
  if (agentId) matchStage.agent = new mongoose.Types.ObjectId(agentId)
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalBacktests: { $sum: 1 },
        avgTotalReturn: { $avg: '$result.totalReturn' },
        avgSharpeRatio: { $avg: '$result.sharpeRatio' },
        avgMaxDrawdown: { $avg: '$result.maxDrawdown' },
        bestReturn: { $max: '$result.totalReturn' },
        worstReturn: { $min: '$result.totalReturn' },
        bestSharpe: { $max: '$result.sharpeRatio' },
        worstSharpe: { $min: '$result.sharpeRatio' }
      }
    }
  ])
  
  return stats.length > 0 ? stats[0] : {
    totalBacktests: 0,
    avgTotalReturn: 0,
    avgSharpeRatio: 0,
    avgMaxDrawdown: 0,
    bestReturn: 0,
    worstReturn: 0,
    bestSharpe: 0,
    worstSharpe: 0
  }
}

// 实例方法
backtestSchema.methods.start = async function() {
  this.status = 'running'
  this.startedAt = new Date()
  this.progress = 0
  return this.save()
}

backtestSchema.methods.updateProgress = async function(progress: number, message?: string) {
  this.progress = Math.min(100, Math.max(0, progress))
  
  if (message) {
    this.logs.push({
      level: 'info',
      message,
      timestamp: new Date()
    })
  }
  
  return this.save()
}

backtestSchema.methods.complete = async function(result: IBacktestResult) {
  this.status = 'completed'
  this.completedAt = new Date()
  this.progress = 100
  this.result = result
  
  if (this.startedAt) {
    this.duration = this.completedAt.getTime() - this.startedAt.getTime()
  }
  
  this.logs.push({
    level: 'info',
    message: '回测完成',
    timestamp: new Date()
  })
  
  return this.save()
}

backtestSchema.methods.fail = async function(error: any) {
  this.status = 'failed'
  this.completedAt = new Date()
  
  this.error = {
    message: error.message || '未知错误',
    stack: error.stack,
    code: error.code
  }
  
  if (this.startedAt) {
    this.duration = this.completedAt.getTime() - this.startedAt.getTime()
  }
  
  this.logs.push({
    level: 'error',
    message: `回测失败: ${error.message}`,
    timestamp: new Date()
  })
  
  return this.save()
}

backtestSchema.methods.cancel = async function(reason?: string) {
  this.status = 'cancelled'
  this.completedAt = new Date()
  
  if (this.startedAt) {
    this.duration = this.completedAt.getTime() - this.startedAt.getTime()
  }
  
  this.logs.push({
    level: 'info',
    message: `回测取消${reason ? ': ' + reason : ''}`,
    timestamp: new Date()
  })
  
  return this.save()
}

backtestSchema.methods.addLog = async function(level: string, message: string) {
  this.logs.push({
    level,
    message,
    timestamp: new Date()
  })
  
  // 限制日志数量，避免文档过大
  if (this.logs.length > 1000) {
    this.logs = this.logs.slice(-500)
  }
  
  return this.save()
}

export const Backtest = mongoose.model<IBacktest>('Backtest', backtestSchema)
export default Backtest