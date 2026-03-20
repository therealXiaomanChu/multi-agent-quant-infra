import { Agent } from '../models/Agent';
import { Battle } from '../models/Battle';
import { Trade } from '../models/Trade';
import { Backtest } from '../models/Backtest';
import { logger } from '../utils/logger';
import { redisClient } from './redis';
import { AgentMetrics } from './evaluationService';
import moment from 'moment';
import _ from 'lodash';

/**
 * 排行榜类型
 */
export type LeaderboardType = 
  | 'overall'           // 综合排行榜
  | 'return'            // 收益排行榜
  | 'risk_adjusted'     // 风险调整排行榜
  | 'stability'         // 稳定性排行榜
  | 'win_rate'          // 胜率排行榜
  | 'battle'            // 对战排行榜
  | 'monthly'           // 月度排行榜
  | 'weekly'            // 周度排行榜
  | 'rookie';           // 新手排行榜

/**
 * 排行榜条目
 */
export interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  userId: string;
  userName: string;
  avatar?: string;
  
  // 排名信息
  rank: number;
  previousRank: number;
  rankChange: number;
  percentile: number;
  
  // 核心指标
  score: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  
  // 统计信息
  totalTrades: number;
  totalBattles: number;
  battleWins: number;
  activeDays: number;
  
  // 时间信息
  lastActive: Date;
  createdAt: Date;
  evaluatedAt: Date;
}

/**
 * 排行榜配置
 */
interface LeaderboardConfig {
  type: LeaderboardType;
  title: string;
  description: string;
  sortField: keyof LeaderboardEntry;
  sortOrder: 'asc' | 'desc';
  cacheKey: string;
  cacheTTL: number; // 缓存时间（秒）
  updateInterval: number; // 更新间隔（分钟）
}

/**
 * 排名变化记录
 */
interface RankingHistory {
  agentId: string;
  date: Date;
  leaderboardType: LeaderboardType;
  rank: number;
  score: number;
  change: number;
}

/**
 * 排名服务
 */
export class RankingService {
  private static instance: RankingService;
  private leaderboardConfigs: Map<LeaderboardType, LeaderboardConfig>;
  private updateTimers: Map<LeaderboardType, NodeJS.Timeout>;

  constructor() {
    this.leaderboardConfigs = new Map();
    this.updateTimers = new Map();
    this.initializeConfigs();
  }

  public static getInstance(): RankingService {
    if (!RankingService.instance) {
      RankingService.instance = new RankingService();
    }
    return RankingService.instance;
  }

  /**
   * 初始化排行榜配置
   */
  private initializeConfigs(): void {
    const configs: LeaderboardConfig[] = [
      {
        type: 'overall',
        title: '综合排行榜',
        description: '基于综合评分的总排行榜',
        sortField: 'score',
        sortOrder: 'desc',
        cacheKey: 'leaderboard:overall',
        cacheTTL: 300, // 5分钟
        updateInterval: 10 // 10分钟更新
      },
      {
        type: 'return',
        title: '收益排行榜',
        description: '基于总收益率的排行榜',
        sortField: 'totalReturn',
        sortOrder: 'desc',
        cacheKey: 'leaderboard:return',
        cacheTTL: 300,
        updateInterval: 10
      },
      {
        type: 'risk_adjusted',
        title: '风险调整排行榜',
        description: '基于夏普比率的风险调整排行榜',
        sortField: 'sharpeRatio',
        sortOrder: 'desc',
        cacheKey: 'leaderboard:risk_adjusted',
        cacheTTL: 300,
        updateInterval: 10
      },
      {
        type: 'stability',
        title: '稳定性排行榜',
        description: '基于最大回撤的稳定性排行榜',
        sortField: 'maxDrawdown',
        sortOrder: 'asc',
        cacheKey: 'leaderboard:stability',
        cacheTTL: 300,
        updateInterval: 10
      },
      {
        type: 'win_rate',
        title: '胜率排行榜',
        description: '基于交易胜率的排行榜',
        sortField: 'winRate',
        sortOrder: 'desc',
        cacheKey: 'leaderboard:win_rate',
        cacheTTL: 300,
        updateInterval: 10
      },
      {
        type: 'battle',
        title: '对战排行榜',
        description: '基于对战胜率的排行榜',
        sortField: 'battleWins',
        sortOrder: 'desc',
        cacheKey: 'leaderboard:battle',
        cacheTTL: 180, // 3分钟
        updateInterval: 5 // 5分钟更新
      },
      {
        type: 'monthly',
        title: '月度排行榜',
        description: '当月表现排行榜',
        sortField: 'score',
        sortOrder: 'desc',
        cacheKey: 'leaderboard:monthly',
        cacheTTL: 600, // 10分钟
        updateInterval: 30 // 30分钟更新
      },
      {
        type: 'weekly',
        title: '周度排行榜',
        description: '本周表现排行榜',
        sortField: 'score',
        sortOrder: 'desc',
        cacheKey: 'leaderboard:weekly',
        cacheTTL: 300,
        updateInterval: 15 // 15分钟更新
      },
      {
        type: 'rookie',
        title: '新手排行榜',
        description: '新注册用户排行榜（30天内）',
        sortField: 'score',
        sortOrder: 'desc',
        cacheKey: 'leaderboard:rookie',
        cacheTTL: 600,
        updateInterval: 60 // 1小时更新
      }
    ];

    configs.forEach(config => {
      this.leaderboardConfigs.set(config.type, config);
    });
  }

  /**
   * 启动排行榜自动更新
   */
  public startAutoUpdate(): void {
    logger.info('启动排行榜自动更新服务');
    
    this.leaderboardConfigs.forEach((config, type) => {
      const timer = setInterval(async () => {
        try {
          await this.updateLeaderboard(type);
        } catch (error) {
          logger.error(`自动更新排行榜失败: ${type}`, error);
        }
      }, config.updateInterval * 60 * 1000);
      
      this.updateTimers.set(type, timer);
    });

    // 立即执行一次更新
    this.updateAllLeaderboards();
  }

  /**
   * 停止自动更新
   */
  public stopAutoUpdate(): void {
    logger.info('停止排行榜自动更新服务');
    
    this.updateTimers.forEach((timer, type) => {
      clearInterval(timer);
    });
    
    this.updateTimers.clear();
  }

  /**
   * 获取排行榜
   */
  async getLeaderboard(
    type: LeaderboardType,
    limit: number = 50,
    offset: number = 0,
    forceRefresh: boolean = false
  ): Promise<LeaderboardEntry[]> {
    try {
      const config = this.leaderboardConfigs.get(type);
      if (!config) {
        throw new Error(`未知的排行榜类型: ${type}`);
      }

      // 尝试从缓存获取
      if (!forceRefresh) {
        const cached = await this.getFromCache(config.cacheKey);
        if (cached) {
          return cached.slice(offset, offset + limit);
        }
      }

      // 生成新的排行榜
      const leaderboard = await this.generateLeaderboard(type);
      
      // 缓存结果
      await this.saveToCache(config.cacheKey, leaderboard, config.cacheTTL);
      
      return leaderboard.slice(offset, offset + limit);
    } catch (error) {
      logger.error(`获取排行榜失败: ${type}`, error);
      throw error;
    }
  }

  /**
   * 获取Agent在特定排行榜中的排名
   */
  async getAgentRank(
    agentId: string,
    type: LeaderboardType
  ): Promise<{ rank: number; entry: LeaderboardEntry | null }> {
    try {
      const leaderboard = await this.getLeaderboard(type, 1000); // 获取更多数据
      const entry = leaderboard.find(e => e.agentId === agentId);
      
      return {
        rank: entry ? entry.rank : -1,
        entry: entry || null
      };
    } catch (error) {
      logger.error(`获取Agent排名失败: ${agentId}, ${type}`, error);
      throw error;
    }
  }

  /**
   * 获取排名历史
   */
  async getRankingHistory(
    agentId: string,
    type: LeaderboardType,
    days: number = 30
  ): Promise<RankingHistory[]> {
    try {
      const startDate = moment().subtract(days, 'days').toDate();
      const cacheKey = `ranking_history:${agentId}:${type}:${days}`;
      
      // 尝试从缓存获取
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      // 从数据库查询（这里需要实现历史记录存储）
      // 暂时返回空数组，实际实现需要创建RankingHistory模型
      const history: RankingHistory[] = [];
      
      // 缓存结果
      await this.saveToCache(cacheKey, history, 3600); // 1小时缓存
      
      return history;
    } catch (error) {
      logger.error(`获取排名历史失败: ${agentId}, ${type}`, error);
      throw error;
    }
  }

  /**
   * 更新所有排行榜
   */
  async updateAllLeaderboards(): Promise<void> {
    logger.info('开始更新所有排行榜');
    
    const updatePromises = Array.from(this.leaderboardConfigs.keys()).map(type => 
      this.updateLeaderboard(type).catch(error => {
        logger.error(`更新排行榜失败: ${type}`, error);
        return null;
      })
    );
    
    await Promise.allSettled(updatePromises);
    logger.info('所有排行榜更新完成');
  }

  /**
   * 更新特定排行榜
   */
  async updateLeaderboard(type: LeaderboardType): Promise<void> {
    try {
      logger.info(`开始更新排行榜: ${type}`);
      
      const config = this.leaderboardConfigs.get(type);
      if (!config) {
        throw new Error(`未知的排行榜类型: ${type}`);
      }

      // 生成新的排行榜
      const leaderboard = await this.generateLeaderboard(type);
      
      // 获取旧的排行榜用于计算排名变化
      const oldLeaderboard = await this.getFromCache(config.cacheKey) || [];
      
      // 计算排名变化
      const updatedLeaderboard = this.calculateRankChanges(leaderboard, oldLeaderboard);
      
      // 保存到缓存
      await this.saveToCache(config.cacheKey, updatedLeaderboard, config.cacheTTL);
      
      // 记录排名历史（如果需要）
      await this.saveRankingHistory(updatedLeaderboard, type);
      
      logger.info(`排行榜更新完成: ${type}, 共${updatedLeaderboard.length}个条目`);
    } catch (error) {
      logger.error(`更新排行榜失败: ${type}`, error);
      throw error;
    }
  }

  /**
   * 生成排行榜
   */
  private async generateLeaderboard(type: LeaderboardType): Promise<LeaderboardEntry[]> {
    const config = this.leaderboardConfigs.get(type)!;
    
    // 根据类型设置查询条件
    let query: any = { status: 'active' };
    let dateFilter: any = {};
    
    switch (type) {
      case 'monthly':
        dateFilter = {
          createdAt: {
            $gte: moment().startOf('month').toDate(),
            $lte: moment().endOf('month').toDate()
          }
        };
        break;
      case 'weekly':
        dateFilter = {
          createdAt: {
            $gte: moment().startOf('week').toDate(),
            $lte: moment().endOf('week').toDate()
          }
        };
        break;
      case 'rookie':
        query.createdAt = {
          $gte: moment().subtract(30, 'days').toDate()
        };
        break;
    }

    // 获取Agent数据
    const agents = await Agent.find(query)
      .populate('user', 'username avatar')
      .populate('evaluationMetrics')
      .lean();

    // 构建排行榜条目
    const entries: LeaderboardEntry[] = [];
    
    for (const agent of agents) {
      try {
        const entry = await this.buildLeaderboardEntry(agent, type, dateFilter);
        if (entry) {
          entries.push(entry);
        }
      } catch (error) {
        logger.error(`构建排行榜条目失败: ${agent._id}`, error);
      }
    }

    // 排序
    entries.sort((a, b) => {
      const aValue = a[config.sortField] as number;
      const bValue = b[config.sortField] as number;
      
      if (config.sortOrder === 'desc') {
        return bValue - aValue;
      } else {
        return aValue - bValue;
      }
    });

    // 设置排名和百分位数
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
      entry.percentile = ((entries.length - index) / entries.length) * 100;
    });

    return entries;
  }

  /**
   * 构建排行榜条目
   */
  private async buildLeaderboardEntry(
    agent: any,
    type: LeaderboardType,
    dateFilter: any
  ): Promise<LeaderboardEntry | null> {
    try {
      const agentId = agent._id.toString();
      const metrics = agent.evaluationMetrics as AgentMetrics;
      
      if (!metrics) {
        return null; // 没有评估数据的Agent不参与排名
      }

      // 获取统计数据
      const [trades, battles] = await Promise.all([
        Trade.find({ agentId, ...dateFilter }).lean(),
        Battle.find({
          $or: [
            { 'participants.agentId': agentId },
            { 'results.agentId': agentId }
          ],
          ...dateFilter
        }).lean()
      ]);

      // 计算对战胜利次数
      const battleWins = battles.filter(battle => {
        const result = battle.results?.find((r: any) => r.agentId.toString() === agentId);
        return result?.rank === 1;
      }).length;

      // 计算活跃天数
      const activeDays = this.calculateActiveDays(trades, agent.createdAt);

      // 根据排行榜类型调整评分
      let score = metrics.overallScore;
      switch (type) {
        case 'return':
          score = metrics.totalReturn * 100;
          break;
        case 'risk_adjusted':
          score = metrics.riskAdjustedScore;
          break;
        case 'stability':
          score = 100 - (metrics.maxDrawdown * 100); // 回撤越小分数越高
          break;
        case 'win_rate':
          score = metrics.winRate * 100;
          break;
        case 'battle':
          score = battles.length > 0 ? (battleWins / battles.length) * 100 : 0;
          break;
      }

      return {
        agentId,
        agentName: agent.name,
        userId: agent.user._id.toString(),
        userName: agent.user.username,
        avatar: agent.user.avatar,
        
        rank: 0, // 将在排序后设置
        previousRank: 0, // 将在计算变化时设置
        rankChange: 0,
        percentile: 0,
        
        score,
        totalReturn: metrics.totalReturn,
        sharpeRatio: metrics.sharpeRatio,
        maxDrawdown: metrics.maxDrawdown,
        winRate: metrics.winRate,
        
        totalTrades: trades.length,
        totalBattles: battles.length,
        battleWins,
        activeDays,
        
        lastActive: agent.lastActive || agent.updatedAt,
        createdAt: agent.createdAt,
        evaluatedAt: metrics.evaluationDate
      };
    } catch (error) {
      logger.error(`构建排行榜条目失败: ${agent._id}`, error);
      return null;
    }
  }

  /**
   * 计算活跃天数
   */
  private calculateActiveDays(trades: any[], createdAt: Date): number {
    if (trades.length === 0) {
      return moment().diff(moment(createdAt), 'days');
    }
    
    const tradeDates = trades.map(trade => moment(trade.createdAt).format('YYYY-MM-DD'));
    const uniqueDates = new Set(tradeDates);
    
    return uniqueDates.size;
  }

  /**
   * 计算排名变化
   */
  private calculateRankChanges(
    newLeaderboard: LeaderboardEntry[],
    oldLeaderboard: LeaderboardEntry[]
  ): LeaderboardEntry[] {
    const oldRankMap = new Map<string, number>();
    
    oldLeaderboard.forEach(entry => {
      oldRankMap.set(entry.agentId, entry.rank);
    });
    
    return newLeaderboard.map(entry => {
      const previousRank = oldRankMap.get(entry.agentId) || 0;
      const rankChange = previousRank > 0 ? previousRank - entry.rank : 0;
      
      return {
        ...entry,
        previousRank,
        rankChange
      };
    });
  }

  /**
   * 保存排名历史
   */
  private async saveRankingHistory(
    leaderboard: LeaderboardEntry[],
    type: LeaderboardType
  ): Promise<void> {
    try {
      // 这里应该保存到数据库的RankingHistory集合
      // 暂时只记录到日志
      const topEntries = leaderboard.slice(0, 10);
      logger.info(`排名历史记录 - ${type}:`, {
        date: new Date(),
        topAgents: topEntries.map(e => ({
          agentId: e.agentId,
          rank: e.rank,
          score: e.score
        }))
      });
    } catch (error) {
      logger.error(`保存排名历史失败: ${type}`, error);
    }
  }

  /**
   * 从缓存获取数据
   */
  private async getFromCache(key: string): Promise<any> {
    try {
      const cached = await redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.error(`从缓存获取数据失败: ${key}`, error);
      return null;
    }
  }

  /**
   * 保存数据到缓存
   */
  private async saveToCache(key: string, data: any, ttl: number): Promise<void> {
    try {
      await redisClient.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      logger.error(`保存数据到缓存失败: ${key}`, error);
    }
  }

  /**
   * 清除排行榜缓存
   */
  async clearCache(type?: LeaderboardType): Promise<void> {
    try {
      if (type) {
        const config = this.leaderboardConfigs.get(type);
        if (config) {
          await redisClient.del(config.cacheKey);
          logger.info(`清除排行榜缓存: ${type}`);
        }
      } else {
        // 清除所有排行榜缓存
        const keys = Array.from(this.leaderboardConfigs.values()).map(c => c.cacheKey);
        if (keys.length > 0) {
          await redisClient.del(...keys);
          logger.info('清除所有排行榜缓存');
        }
      }
    } catch (error) {
      logger.error('清除排行榜缓存失败', error);
    }
  }

  /**
   * 获取排行榜配置信息
   */
  getLeaderboardConfigs(): LeaderboardConfig[] {
    return Array.from(this.leaderboardConfigs.values());
  }

  /**
   * 获取排行榜统计信息
   */
  async getLeaderboardStats(type: LeaderboardType): Promise<{
    totalAgents: number;
    lastUpdated: Date | null;
    cacheHit: boolean;
  }> {
    try {
      const config = this.leaderboardConfigs.get(type);
      if (!config) {
        throw new Error(`未知的排行榜类型: ${type}`);
      }

      const cached = await this.getFromCache(config.cacheKey);
      const totalAgents = cached ? cached.length : 0;
      const cacheHit = !!cached;
      
      // 获取最后更新时间（从缓存TTL推算）
      let lastUpdated: Date | null = null;
      if (cached) {
        const ttl = await redisClient.ttl(config.cacheKey);
        if (ttl > 0) {
          lastUpdated = moment().subtract(config.cacheTTL - ttl, 'seconds').toDate();
        }
      }

      return {
        totalAgents,
        lastUpdated,
        cacheHit
      };
    } catch (error) {
      logger.error(`获取排行榜统计失败: ${type}`, error);
      throw error;
    }
  }
}

export default RankingService.getInstance();