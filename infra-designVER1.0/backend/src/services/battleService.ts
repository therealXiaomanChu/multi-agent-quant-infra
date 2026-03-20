import { Types } from 'mongoose';
import { Battle, Agent, Trade } from '../models';
import { IBattle, IBattleParticipant, IBattleResult, ITrade } from '../types';
import { getTradingEngine } from './tradingEngine';
import { getWebSocketService } from './websocketService';
import { logger } from '../utils/logger';
import { RedisService } from './redis';

export interface IBattleConfig {
  name: string;
  description: string;
  startTime: Date;
  endTime: Date;
  initialCapital: number;
  maxParticipants: number;
  entryFee: number;
  symbols: string[];
  rules: {
    maxPositionSize: number;
    allowedOrderTypes: string[];
    maxDailyTrades: number;
    riskLimits: {
      maxDrawdown: number;
      maxLeverage: number;
    };
  };
  rewards: {
    first: number;
    second: number;
    third: number;
    participationReward: number;
  };
}

export interface IBattleStats {
  totalReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  avgTradeReturn: number;
  volatility: number;
  currentEquity: number;
  rank: number;
}

export class BattleService {
  private redisService: RedisService;
  private tradingEngine: any;
  private webSocketService: any;
  private activeBattles: Map<string, IBattle> = new Map();
  private battleStats: Map<string, Map<string, IBattleStats>> = new Map();

  constructor() {
    this.redisService = new RedisService();
    this.tradingEngine = getTradingEngine();
    this.webSocketService = getWebSocketService();
  }

  /**
   * 创建新的对战
   */
  async createBattle(config: IBattleConfig, creatorId: string): Promise<IBattle> {
    try {
      const battle = new Battle({
        name: config.name,
        description: config.description,
        creator: new Types.ObjectId(creatorId),
        startTime: config.startTime,
        endTime: config.endTime,
        status: 'upcoming',
        config: {
          initialCapital: config.initialCapital,
          maxParticipants: config.maxParticipants,
          entryFee: config.entryFee,
          symbols: config.symbols,
          rules: config.rules
        },
        rewards: config.rewards,
        participants: [],
        results: [],
        statistics: {
          totalParticipants: 0,
          totalVolume: 0,
          totalTrades: 0,
          avgReturn: 0,
          topPerformer: null
        }
      });

      await battle.save();
      logger.info(`Battle created: ${battle._id}`);

      // 通知所有用户新对战创建
      this.webSocketService.broadcast('battle:created', {
        battleId: battle._id,
        name: battle.name,
        startTime: battle.startTime,
        maxParticipants: battle.config.maxParticipants
      });

      return battle;
    } catch (error) {
      logger.error('Failed to create battle:', error);
      throw error;
    }
  }

  /**
   * 加入对战
   */
  async joinBattle(battleId: string, agentId: string, userId: string): Promise<void> {
    try {
      const battle = await Battle.findById(battleId);
      if (!battle) {
        throw new Error('Battle not found');
      }

      if (battle.status !== 'upcoming') {
        throw new Error('Battle is not accepting participants');
      }

      if (battle.participants.length >= battle.config.maxParticipants) {
        throw new Error('Battle is full');
      }

      // 检查agent是否已经参加
      const existingParticipant = battle.participants.find(
        p => p.agent.toString() === agentId
      );
      if (existingParticipant) {
        throw new Error('Agent already joined this battle');
      }

      // 验证agent存在且属于用户
      const agent = await Agent.findOne({ _id: agentId, creator: userId });
      if (!agent) {
        throw new Error('Agent not found or not owned by user');
      }

      // 添加参与者
      const participant: IBattleParticipant = {
        agent: new Types.ObjectId(agentId),
        user: new Types.ObjectId(userId),
        joinedAt: new Date(),
        initialCapital: battle.config.initialCapital,
        currentCapital: battle.config.initialCapital,
        totalReturn: 0,
        trades: [],
        statistics: {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          totalVolume: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          avgTradeReturn: 0
        }
      };

      battle.participants.push(participant);
      battle.statistics.totalParticipants = battle.participants.length;
      await battle.save();

      logger.info(`Agent ${agentId} joined battle ${battleId}`);

      // 通知对战更新
      this.webSocketService.toBattleRoom(battleId, 'battle:participant_joined', {
        battleId,
        participant: {
          agentId,
          agentName: agent.name,
          userId,
          joinedAt: participant.joinedAt
        },
        totalParticipants: battle.participants.length
      });

    } catch (error) {
      logger.error('Failed to join battle:', error);
      throw error;
    }
  }

  /**
   * 开始对战
   */
  async startBattle(battleId: string): Promise<void> {
    try {
      const battle = await Battle.findById(battleId);
      if (!battle) {
        throw new Error('Battle not found');
      }

      if (battle.status !== 'upcoming') {
        throw new Error('Battle cannot be started');
      }

      if (battle.participants.length < 2) {
        throw new Error('Battle needs at least 2 participants');
      }

      battle.status = 'active';
      battle.actualStartTime = new Date();
      await battle.save();

      // 将对战添加到活跃对战列表
      this.activeBattles.set(battleId, battle);
      this.battleStats.set(battleId, new Map());

      // 为每个参与者初始化统计数据
      for (const participant of battle.participants) {
        const stats: IBattleStats = {
          totalReturn: 0,
          winRate: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          totalTrades: 0,
          avgTradeReturn: 0,
          volatility: 0,
          currentEquity: battle.config.initialCapital,
          rank: 0
        };
        this.battleStats.get(battleId)!.set(participant.agent.toString(), stats);
      }

      logger.info(`Battle ${battleId} started`);

      // 通知对战开始
      this.webSocketService.toBattleRoom(battleId, 'battle:started', {
        battleId,
        startTime: battle.actualStartTime,
        participants: battle.participants.length
      });

      // 设置对战结束定时器
      this.scheduleBattleEnd(battleId, battle.endTime);

    } catch (error) {
      logger.error('Failed to start battle:', error);
      throw error;
    }
  }

  /**
   * 处理对战中的交易
   */
  async processBattleTrade(trade: ITrade): Promise<void> {
    try {
      // 查找包含此agent的活跃对战
      for (const [battleId, battle] of this.activeBattles) {
        const participant = battle.participants.find(
          p => p.agent.toString() === trade.agent.toString()
        );

        if (participant && battle.status === 'active') {
          // 更新参与者交易记录
          participant.trades.push(trade._id as Types.ObjectId);
          participant.statistics.totalTrades++;
          participant.statistics.totalVolume += Math.abs(trade.quantity * trade.price);

          if (trade.profit > 0) {
            participant.statistics.winningTrades++;
          } else if (trade.profit < 0) {
            participant.statistics.losingTrades++;
          }

          // 更新当前资本
          participant.currentCapital += trade.profit - trade.commission;
          participant.totalReturn = (participant.currentCapital - battle.config.initialCapital) / battle.config.initialCapital;

          // 更新统计数据
          await this.updateBattleStats(battleId, participant.agent.toString(), trade);

          // 保存对战更新
          await Battle.findByIdAndUpdate(battleId, battle);

          // 实时推送更新
          this.webSocketService.toBattleRoom(battleId, 'battle:trade_executed', {
            battleId,
            agentId: trade.agent,
            trade: {
              symbol: trade.symbol,
              side: trade.side,
              quantity: trade.quantity,
              price: trade.price,
              profit: trade.profit,
              timestamp: trade.executedAt
            },
            newEquity: participant.currentCapital,
            totalReturn: participant.totalReturn
          });

          // 更新排行榜
          await this.updateBattleRankings(battleId);
        }
      }
    } catch (error) {
      logger.error('Failed to process battle trade:', error);
    }
  }

  /**
   * 更新对战统计数据
   */
  private async updateBattleStats(battleId: string, agentId: string, trade: ITrade): Promise<void> {
    const battleStats = this.battleStats.get(battleId);
    if (!battleStats) return;

    const stats = battleStats.get(agentId);
    if (!stats) return;

    // 更新基本统计
    stats.totalTrades++;
    stats.currentEquity += trade.profit - trade.commission;
    stats.totalReturn = (stats.currentEquity - this.activeBattles.get(battleId)!.config.initialCapital) / this.activeBattles.get(battleId)!.config.initialCapital;

    // 计算胜率
    const recentTrades = await Trade.find({ agent: agentId }).sort({ executedAt: -1 }).limit(100);
    const winningTrades = recentTrades.filter(t => t.profit > 0).length;
    stats.winRate = winningTrades / recentTrades.length;

    // 计算平均交易收益
    const totalProfit = recentTrades.reduce((sum, t) => sum + t.profit, 0);
    stats.avgTradeReturn = totalProfit / recentTrades.length;

    // 计算最大回撤
    let maxEquity = this.activeBattles.get(battleId)!.config.initialCapital;
    let maxDrawdown = 0;
    for (const t of recentTrades.reverse()) {
      const equity = maxEquity + t.profit - t.commission;
      if (equity > maxEquity) {
        maxEquity = equity;
      } else {
        const drawdown = (maxEquity - equity) / maxEquity;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }
    stats.maxDrawdown = maxDrawdown;

    // 计算夏普比率（简化版本）
    if (recentTrades.length > 1) {
      const returns = recentTrades.map(t => t.profit / (t.quantity * t.price));
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      stats.sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
      stats.volatility = stdDev;
    }

    battleStats.set(agentId, stats);
  }

  /**
   * 更新对战排行榜
   */
  private async updateBattleRankings(battleId: string): Promise<void> {
    const battleStats = this.battleStats.get(battleId);
    if (!battleStats) return;

    // 按总收益率排序
    const sortedStats = Array.from(battleStats.entries())
      .sort(([, a], [, b]) => b.totalReturn - a.totalReturn);

    // 更新排名
    sortedStats.forEach(([agentId, stats], index) => {
      stats.rank = index + 1;
      battleStats.set(agentId, stats);
    });

    // 推送排行榜更新
    const rankings = sortedStats.map(([agentId, stats]) => ({
      agentId,
      rank: stats.rank,
      totalReturn: stats.totalReturn,
      currentEquity: stats.currentEquity,
      totalTrades: stats.totalTrades,
      winRate: stats.winRate,
      sharpeRatio: stats.sharpeRatio,
      maxDrawdown: stats.maxDrawdown
    }));

    this.webSocketService.toBattleRoom(battleId, 'battle:rankings_updated', {
      battleId,
      rankings,
      timestamp: new Date()
    });
  }

  /**
   * 结束对战
   */
  async endBattle(battleId: string): Promise<void> {
    try {
      const battle = await Battle.findById(battleId);
      if (!battle || battle.status !== 'active') {
        return;
      }

      battle.status = 'completed';
      battle.actualEndTime = new Date();

      // 计算最终结果
      const finalStats = this.battleStats.get(battleId);
      if (finalStats) {
        const sortedResults = Array.from(finalStats.entries())
          .sort(([, a], [, b]) => b.totalReturn - a.totalReturn);

        battle.results = sortedResults.map(([agentId, stats], index) => ({
          agent: new Types.ObjectId(agentId),
          rank: index + 1,
          finalCapital: stats.currentEquity,
          totalReturn: stats.totalReturn,
          totalTrades: stats.totalTrades,
          winRate: stats.winRate,
          sharpeRatio: stats.sharpeRatio,
          maxDrawdown: stats.maxDrawdown,
          reward: this.calculateReward(battle, index + 1)
        }));

        // 更新统计信息
        battle.statistics.totalTrades = battle.participants.reduce((sum, p) => sum + p.statistics.totalTrades, 0);
        battle.statistics.totalVolume = battle.participants.reduce((sum, p) => sum + p.statistics.totalVolume, 0);
        battle.statistics.avgReturn = battle.results.reduce((sum, r) => sum + r.totalReturn, 0) / battle.results.length;
        battle.statistics.topPerformer = battle.results[0]?.agent || null;
      }

      await battle.save();

      // 清理内存中的数据
      this.activeBattles.delete(battleId);
      this.battleStats.delete(battleId);

      logger.info(`Battle ${battleId} ended`);

      // 通知对战结束
      this.webSocketService.toBattleRoom(battleId, 'battle:ended', {
        battleId,
        endTime: battle.actualEndTime,
        results: battle.results,
        statistics: battle.statistics
      });

    } catch (error) {
      logger.error('Failed to end battle:', error);
    }
  }

  /**
   * 计算奖励
   */
  private calculateReward(battle: IBattle, rank: number): number {
    switch (rank) {
      case 1:
        return battle.rewards.first;
      case 2:
        return battle.rewards.second;
      case 3:
        return battle.rewards.third;
      default:
        return battle.rewards.participationReward;
    }
  }

  /**
   * 安排对战结束
   */
  private scheduleBattleEnd(battleId: string, endTime: Date): void {
    const now = new Date();
    const delay = endTime.getTime() - now.getTime();

    if (delay > 0) {
      setTimeout(() => {
        this.endBattle(battleId);
      }, delay);
    }
  }

  /**
   * 获取对战列表
   */
  async getBattles(status?: string, limit: number = 20, offset: number = 0): Promise<IBattle[]> {
    const query = status ? { status } : {};
    return await Battle.find(query)
      .populate('creator', 'username avatar')
      .populate('participants.agent', 'name description')
      .populate('participants.user', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset);
  }

  /**
   * 获取对战详情
   */
  async getBattleById(battleId: string): Promise<IBattle | null> {
    return await Battle.findById(battleId)
      .populate('creator', 'username avatar')
      .populate('participants.agent', 'name description strategy')
      .populate('participants.user', 'username avatar')
      .populate('results.agent', 'name description');
  }

  /**
   * 获取实时对战统计
   */
  getBattleStats(battleId: string): Map<string, IBattleStats> | undefined {
    return this.battleStats.get(battleId);
  }

  /**
   * 获取用户参与的对战
   */
  async getUserBattles(userId: string, limit: number = 10): Promise<IBattle[]> {
    return await Battle.find({
      'participants.user': userId
    })
      .populate('creator', 'username avatar')
      .populate('participants.agent', 'name description')
      .sort({ createdAt: -1 })
      .limit(limit);
  }
}

// 单例模式
let battleServiceInstance: BattleService | null = null;

export function getBattleService(): BattleService {
  if (!battleServiceInstance) {
    battleServiceInstance = new BattleService();
  }
  return battleServiceInstance;
}

export default BattleService;