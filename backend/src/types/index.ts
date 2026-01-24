import { Request } from 'express'
import { Document } from 'mongoose'

// 用户相关类型
export interface IUser extends Document {
  _id: string
  username: string
  email: string
  password: string
  avatar?: string
  role: 'user' | 'admin'
  isActive: boolean
  profile: {
    firstName?: string
    lastName?: string
    bio?: string
    location?: string
    website?: string
  }
  stats: {
    totalAgents: number
    totalTrades: number
    totalProfit: number
    winRate: number
  }
  createdAt: Date
  updatedAt: Date
  comparePassword(candidatePassword: string): Promise<boolean>
}

// 交易代理相关类型
export interface IAgent extends Document {
  _id: string
  name: string
  description: string
  author: string // User ID
  authorInfo: {
    username: string
    avatar?: string
  }
  code: string // 策略代码
  language: 'python' | 'javascript' | 'pine'
  tags: string[]
  category: string
  isPublic: boolean
  isActive: boolean
  version: string
  
  // 性能统计
  stats: {
    totalTrades: number
    winningTrades: number
    losingTrades: number
    totalProfit: number
    totalLoss: number
    winRate: number
    profitFactor: number
    maxDrawdown: number
    sharpeRatio: number
    averageReturn: number
    volatility: number
  }
  
  // 评分和评论
  rating: {
    average: number
    count: number
    reviews: string[] // Review IDs
  }
  
  // 回测结果
  backtestResults: {
    period: string
    initialCapital: number
    finalCapital: number
    totalReturn: number
    annualizedReturn: number
    maxDrawdown: number
    sharpeRatio: number
    trades: ITradeRecord[]
    equity: IEquityPoint[]
    createdAt: Date
  }[]
  
  createdAt: Date
  updatedAt: Date
}

// 交易记录类型
export interface ITradeRecord {
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  price: number
  timestamp: Date
  profit?: number
  commission?: number
  reason?: string // 交易原因/信号
}

// 完整交易类型
export interface ITrade extends Document {
  _id: string
  agent: string // Agent ID
  user: string // User ID
  symbol: string
  side: 'buy' | 'sell'
  type: 'market' | 'limit' | 'stop' | 'stop_limit'
  quantity: number
  price: number
  executedPrice?: number
  executedQuantity?: number
  status: 'pending' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected'
  orderTime: Date
  executionTime?: Date
  profit: number
  commission: number
  reason?: string
  metadata: any
  marketData?: {
    bid?: number
    ask?: number
    volume?: number
    timestamp?: Date
  }
  riskMetrics?: {
    stopLoss?: number
    takeProfit?: number
    riskReward?: number
    positionSize?: number
  }
  createdAt: Date
  updatedAt: Date
}

// 权益曲线点
export interface IEquityPoint {
  timestamp: Date
  equity: number
  drawdown: number
}

// 对战参与者类型
export interface IBattleParticipant {
  agent: string
  user: string
  agentInfo: {
    name: string
    version: string
    category: string
  }
  userInfo: {
    username: string
    avatar?: string
  }
  initialCapital: number
  finalCapital: number
  totalReturn: number
  totalTrades: number
  winningTrades: number
  maxDrawdown: number
  sharpeRatio: number
  rank?: number
  isWinner: boolean
}

// 对战结果类型
export interface IBattleResult {
  winner?: string
  rankings: {
    agent: string
    rank: number
    score: number
    metrics: {
      totalReturn?: number
      sharpeRatio?: number
      maxDrawdown?: number
      winRate?: number
      profitFactor?: number
    }
  }[]
  summary: {
    totalTrades: number
    totalVolume: number
    avgReturn: number
    bestPerformer: {
      agent?: string
      return?: number
    }
    worstPerformer: {
      agent?: string
      return?: number
    }
  }
}

// 对战相关类型
export interface IBattle extends Document {
  _id: string
  title: string
  description?: string
  type: 'public' | 'private' | 'tournament'
  mode: 'realtime' | 'backtest' | 'simulation'
  status: 'pending' | 'active' | 'completed' | 'cancelled'
  creator: string // User ID
  participants: IBattleParticipant[]
  maxParticipants: number
  minParticipants: number
  
  config: {
    duration: number
    durationUnit: 'minutes' | 'hours' | 'days'
    initialCapital: number
    allowedSymbols: string[]
    tradingRules: {
      maxPositionSize: number
      maxDailyTrades?: number
      commission: number
      slippage: number
    }
  }
  
  startTime: Date
  endTime: Date
  registrationDeadline: Date
  
  rewards?: {
    enabled: boolean
    prize: {
      first?: number
      second?: number
      third?: number
      participation?: number
    }
    currency: string
  }
  
  result?: IBattleResult
  
  stats: {
    totalViews: number
    totalLikes: number
    totalComments: number
  }
  
  tags: string[]
  isPublic: boolean
  isFeatured: boolean
  
  createdAt: Date
  updatedAt: Date
}

// 评论类型
export interface IReview extends Document {
  _id: string
  agent: string // Agent ID
  user: string // User ID
  rating: number // 1-5星
  title: string
  content: string
  
  detailedRating?: {
    performance?: number
    stability?: number
    profitability?: number
    riskManagement?: number
    easeOfUse?: number
  }
  
  experience?: {
    usageDuration?: 'less_than_week' | 'week_to_month' | 'month_to_quarter' | 'quarter_to_year' | 'more_than_year'
    tradingStyle?: 'conservative' | 'moderate' | 'aggressive' | 'mixed'
    marketConditions?: 'bull' | 'bear' | 'sideways' | 'volatile' | 'mixed'
    profitLoss?: 'significant_profit' | 'moderate_profit' | 'break_even' | 'moderate_loss' | 'significant_loss'
  }
  
  pros: string[]
  cons: string[]
  
  recommendation: {
    wouldRecommend: boolean
    targetAudience: ('beginners' | 'intermediate' | 'advanced' | 'professionals' | 'institutions')[]
  }
  
  verification: {
    isVerified: boolean
    verifiedBy?: string
    verificationDate?: Date
    verificationNote?: string
  }
  
  status: 'pending' | 'approved' | 'rejected' | 'hidden'
  
  stats: {
    helpfulVotes: number
    unhelpfulVotes: number
    reportCount: number
    views: number
  }
  
  replies: {
    user: string
    content: string
    createdAt: Date
    isAuthorReply: boolean
  }[]
  
  tags: string[]
  language: string
  isAnonymous: boolean
  
  editHistory: {
    editedAt: Date
    reason?: string
    changes: any
  }[]
  
  createdAt: Date
  updatedAt: Date
}

// 市场数据类型
export interface IMarketData {
  symbol: string
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// WebSocket消息类型
export interface IWebSocketMessage {
  type: 'trade' | 'price_update' | 'battle_update' | 'agent_status' | 'notification'
  data: any
  timestamp: Date
}

// API响应类型
export interface IApiResponse<T = any> {
  success: boolean
  message: string
  data?: T
  error?: string
  pagination?: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

// 认证请求类型
export interface IAuthRequest extends Request {
  user?: {
    id: string
    username: string
    email: string
    role: string
  }
}

// 分页查询参数
export interface IPaginationQuery {
  page?: number
  limit?: number
  sort?: string
  order?: 'asc' | 'desc'
  search?: string
  filter?: Record<string, any>
}

// 交易信号类型
export interface ITradingSignal {
  agentId: string
  symbol: string
  action: 'buy' | 'sell' | 'hold'
  quantity: number
  price: number
  confidence: number // 0-1
  reason: string
  timestamp: Date
}

// 回测配置类型
export interface IBacktestConfig {
  startDate: Date
  endDate: Date
  initialCapital: number
  symbols: string[]
  timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d'
  commission: number
  slippage: number
  maxPositionSize: number
  riskFreeRate: number
  benchmark: string
}

// 回测结果类型
export interface IBacktestResult {
  finalCapital: number
  totalReturn: number
  annualizedReturn: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  maxDrawdown: number
  maxDrawdownDuration: number
  volatility: number
  sharpeRatio: number
  sortinoRatio: number
  calmarRatio: number
  profitFactor: number
  averageWin: number
  averageLoss: number
  largestWin: number
  largestLoss: number
  benchmarkReturn: number
  alpha: number
  beta: number
  informationRatio: number
  equityCurve: {
    date: Date
    equity: number
    drawdown: number
    benchmark: number
  }[]
  monthlyReturns: {
    year: number
    month: number
    return: number
  }[]
  tradeAnalysis: {
    avgHoldingPeriod: number
    avgTradesPerDay: number
    maxConsecutiveWins: number
    maxConsecutiveLosses: number
  }
}

// 回测类型
export interface IBacktest extends Document {
  _id: string
  agent: string // Agent ID
  user: string // User ID
  name: string
  description?: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  config: IBacktestConfig
  result?: IBacktestResult
  startedAt?: Date
  completedAt?: Date
  duration?: number
  error?: {
    message: string
    stack?: string
    code?: string
  }
  logs: {
    timestamp: Date
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
  }[]
  tags: string[]
  isPublic: boolean
  stats: {
    views: number
    likes: number
    shares: number
  }
  createdAt: Date
  updatedAt: Date
}

// 通知类型
export interface INotification extends Document {
  _id: string
  userId: string
  type: 'trade' | 'battle' | 'review' | 'system'
  title: string
  message: string
  data?: any
  isRead: boolean
  createdAt: Date
}

// 系统配置类型
export interface ISystemConfig {
  tradingHours: {
    start: string
    end: string
    timezone: string
  }
  limits: {
    maxAgentsPerUser: number
    maxTradesPerDay: number
    maxBattleParticipants: number
  }
  fees: {
    tradingCommission: number
    battleEntryFee: number
  }
}

export default {
  IUser,
  IAgent,
  ITradeRecord,
  ITrade,
  IEquityPoint,
  IBattle,
  IBattleParticipant,
  IBattleResult,
  IBacktest,
  IBacktestConfig,
  IBacktestResult,
  IReview,
  IMarketData,
  IWebSocketMessage,
  IApiResponse,
  IAuthRequest,
  IPaginationQuery,
  ITradingSignal,
  INotification,
  ISystemConfig
}