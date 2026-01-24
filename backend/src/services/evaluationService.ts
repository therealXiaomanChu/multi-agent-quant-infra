import { Agent } from '../models/Agent';
import { Trade } from '../models/Trade';
import { Backtest } from '../models/Backtest';
import { Battle } from '../models/Battle';
import { logger } from '../utils/logger';
import moment from 'moment';
import _ from 'lodash';

/**
 * Agent评估指标接口
 */
export interface AgentMetrics {
  // 基础指标
  totalReturn: number;          // 总收益率
  annualizedReturn: number;     // 年化收益率
  volatility: number;           // 波动率
  sharpeRatio: number;          // 夏普比率
  maxDrawdown: number;          // 最大回撤
  
  // 风险指标
  var95: number;                // 95% VaR
  var99: number;                // 99% VaR
  calmarRatio: number;          // 卡玛比率
  sortinoRatio: number;         // 索提诺比率
  
  // 交易指标
  winRate: number;              // 胜率
  profitFactor: number;         // 盈利因子
  avgWin: number;               // 平均盈利
  avgLoss: number;              // 平均亏损
  maxConsecutiveWins: number;   // 最大连续盈利
  maxConsecutiveLosses: number; // 最大连续亏损
  
  // 稳定性指标
  consistency: number;          // 一致性评分
  stability: number;            // 稳定性评分
  robustness: number;           // 鲁棒性评分
  
  // 综合评分
  overallScore: number;         // 综合评分 (0-100)
  riskAdjustedScore: number;    // 风险调整后评分
  
  // 排名相关
  rank: number;                 // 当前排名
  rankChange: number;           // 排名变化
  percentile: number;           // 百分位数
  
  // 时间相关
  evaluationDate: Date;         // 评估日期
  dataStartDate: Date;          // 数据开始日期
  dataEndDate: Date;            // 数据结束日期
}

/**
 * 排名权重配置
 */
interface RankingWeights {
  return: number;               // 收益权重
  risk: number;                 // 风险权重
  stability: number;            // 稳定性权重
  winRate: number;              // 胜率权重
  drawdown: number;             // 回撤权重
}

/**
 * Agent评估服务
 */
export class EvaluationService {
  private static instance: EvaluationService;
  private defaultWeights: RankingWeights = {
    return: 0.3,
    risk: 0.25,
    stability: 0.2,
    winRate: 0.15,
    drawdown: 0.1
  };

  public static getInstance(): EvaluationService {
    if (!EvaluationService.instance) {
      EvaluationService.instance = new EvaluationService();
    }
    return EvaluationService.instance;
  }

  /**
   * 评估单个Agent的性能
   */
  async evaluateAgent(
    agentId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AgentMetrics> {
    try {
      logger.info(`开始评估Agent: ${agentId}`);
      
      // 获取Agent信息
      const agent = await Agent.findById(agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }

      // 设置默认时间范围
      const end = endDate || new Date();
      const start = startDate || moment(end).subtract(1, 'year').toDate();

      // 获取交易数据
      const trades = await this.getAgentTrades(agentId, start, end);
      
      // 获取回测数据
      const backtests = await this.getAgentBacktests(agentId, start, end);
      
      // 获取对战数据
      const battles = await this.getAgentBattles(agentId, start, end);

      // 计算各项指标
      const metrics = await this.calculateMetrics(
        agent,
        trades,
        backtests,
        battles,
        start,
        end
      );

      // 保存评估结果
      await this.saveEvaluationResult(agentId, metrics);

      logger.info(`Agent评估完成: ${agentId}, 综合评分: ${metrics.overallScore}`);
      return metrics;
    } catch (error) {
      logger.error(`Agent评估失败: ${agentId}`, error);
      throw error;
    }
  }

  /**
   * 批量评估所有Agent
   */
  async evaluateAllAgents(
    startDate?: Date,
    endDate?: Date
  ): Promise<AgentMetrics[]> {
    try {
      logger.info('开始批量评估所有Agent');
      
      const agents = await Agent.find({ status: 'active' });
      const results: AgentMetrics[] = [];

      // 并行评估（限制并发数）
      const batchSize = 5;
      for (let i = 0; i < agents.length; i += batchSize) {
        const batch = agents.slice(i, i + batchSize);
        const batchPromises = batch.map(agent => 
          this.evaluateAgent(agent._id.toString(), startDate, endDate)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            logger.error(`Agent评估失败: ${batch[index]._id}`, result.reason);
          }
        });
      }

      // 计算排名
      const rankedResults = this.calculateRankings(results);
      
      // 更新Agent排名信息
      await this.updateAgentRankings(rankedResults);

      logger.info(`批量评估完成，共评估${rankedResults.length}个Agent`);
      return rankedResults;
    } catch (error) {
      logger.error('批量评估失败', error);
      throw error;
    }
  }

  /**
   * 获取Agent排行榜
   */
  async getLeaderboard(
    limit: number = 50,
    category?: 'overall' | 'return' | 'risk' | 'stability'
  ): Promise<AgentMetrics[]> {
    try {
      // 从缓存或数据库获取最新评估结果
      const agents = await Agent.find({ status: 'active' })
        .populate('evaluationMetrics')
        .sort({ 'evaluationMetrics.overallScore': -1 })
        .limit(limit);

      const leaderboard = agents
        .filter(agent => agent.evaluationMetrics)
        .map(agent => agent.evaluationMetrics as AgentMetrics);

      // 根据类别排序
      if (category && category !== 'overall') {
        return this.sortByCategory(leaderboard, category);
      }

      return leaderboard;
    } catch (error) {
      logger.error('获取排行榜失败', error);
      throw error;
    }
  }

  /**
   * 获取Agent交易数据
   */
  private async getAgentTrades(
    agentId: string,
    startDate: Date,
    endDate: Date
  ) {
    return await Trade.find({
      agentId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $in: ['completed', 'closed'] }
    }).sort({ createdAt: 1 });
  }

  /**
   * 获取Agent回测数据
   */
  private async getAgentBacktests(
    agentId: string,
    startDate: Date,
    endDate: Date
  ) {
    return await Backtest.find({
      agentId,
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'completed'
    }).sort({ createdAt: 1 });
  }

  /**
   * 获取Agent对战数据
   */
  private async getAgentBattles(
    agentId: string,
    startDate: Date,
    endDate: Date
  ) {
    return await Battle.find({
      $or: [
        { 'participants.agentId': agentId },
        { 'results.agentId': agentId }
      ],
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'completed'
    }).sort({ createdAt: 1 });
  }

  /**
   * 计算Agent各项指标
   */
  private async calculateMetrics(
    agent: any,
    trades: any[],
    backtests: any[],
    battles: any[],
    startDate: Date,
    endDate: Date
  ): Promise<AgentMetrics> {
    // 计算收益相关指标
    const returns = this.calculateReturns(trades);
    const totalReturn = this.calculateTotalReturn(returns);
    const annualizedReturn = this.calculateAnnualizedReturn(returns, startDate, endDate);
    const volatility = this.calculateVolatility(returns);
    const sharpeRatio = this.calculateSharpeRatio(annualizedReturn, volatility);
    const maxDrawdown = this.calculateMaxDrawdown(returns);

    // 计算风险指标
    const var95 = this.calculateVaR(returns, 0.95);
    const var99 = this.calculateVaR(returns, 0.99);
    const calmarRatio = annualizedReturn / Math.abs(maxDrawdown);
    const sortinoRatio = this.calculateSortinoRatio(returns);

    // 计算交易指标
    const winRate = this.calculateWinRate(trades);
    const profitFactor = this.calculateProfitFactor(trades);
    const { avgWin, avgLoss } = this.calculateAvgWinLoss(trades);
    const { maxConsecutiveWins, maxConsecutiveLosses } = this.calculateConsecutiveWinLoss(trades);

    // 计算稳定性指标
    const consistency = this.calculateConsistency(returns, backtests);
    const stability = this.calculateStability(returns, battles);
    const robustness = this.calculateRobustness(backtests, battles);

    // 计算综合评分
    const overallScore = this.calculateOverallScore({
      totalReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      consistency,
      stability
    });

    const riskAdjustedScore = this.calculateRiskAdjustedScore(
      overallScore,
      volatility,
      maxDrawdown
    );

    return {
      totalReturn,
      annualizedReturn,
      volatility,
      sharpeRatio,
      maxDrawdown,
      var95,
      var99,
      calmarRatio,
      sortinoRatio,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      consistency,
      stability,
      robustness,
      overallScore,
      riskAdjustedScore,
      rank: 0, // 将在排名计算中设置
      rankChange: 0,
      percentile: 0,
      evaluationDate: new Date(),
      dataStartDate: startDate,
      dataEndDate: endDate
    };
  }

  /**
   * 计算收益率序列
   */
  private calculateReturns(trades: any[]): number[] {
    if (trades.length === 0) return [];
    
    const returns: number[] = [];
    let cumulativeValue = 10000; // 初始资金
    
    for (const trade of trades) {
      const pnl = trade.pnl || 0;
      const returnRate = pnl / cumulativeValue;
      returns.push(returnRate);
      cumulativeValue += pnl;
    }
    
    return returns;
  }

  /**
   * 计算总收益率
   */
  private calculateTotalReturn(returns: number[]): number {
    if (returns.length === 0) return 0;
    return returns.reduce((acc, ret) => (1 + acc) * (1 + ret) - 1, 0);
  }

  /**
   * 计算年化收益率
   */
  private calculateAnnualizedReturn(
    returns: number[],
    startDate: Date,
    endDate: Date
  ): number {
    if (returns.length === 0) return 0;
    
    const totalReturn = this.calculateTotalReturn(returns);
    const years = moment(endDate).diff(moment(startDate), 'years', true);
    
    if (years <= 0) return totalReturn;
    return Math.pow(1 + totalReturn, 1 / years) - 1;
  }

  /**
   * 计算波动率
   */
  private calculateVolatility(returns: number[]): number {
    if (returns.length < 2) return 0;
    
    const mean = _.mean(returns);
    const variance = _.mean(returns.map(r => Math.pow(r - mean, 2)));
    return Math.sqrt(variance * 252); // 年化波动率
  }

  /**
   * 计算夏普比率
   */
  private calculateSharpeRatio(annualizedReturn: number, volatility: number): number {
    if (volatility === 0) return 0;
    const riskFreeRate = 0.02; // 假设无风险利率为2%
    return (annualizedReturn - riskFreeRate) / volatility;
  }

  /**
   * 计算最大回撤
   */
  private calculateMaxDrawdown(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    let peak = 1;
    let maxDrawdown = 0;
    let cumulativeReturn = 1;
    
    for (const ret of returns) {
      cumulativeReturn *= (1 + ret);
      peak = Math.max(peak, cumulativeReturn);
      const drawdown = (peak - cumulativeReturn) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  /**
   * 计算VaR
   */
  private calculateVaR(returns: number[], confidence: number): number {
    if (returns.length === 0) return 0;
    
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sortedReturns.length);
    return sortedReturns[index] || 0;
  }

  /**
   * 计算索提诺比率
   */
  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length === 0) return 0;
    
    const mean = _.mean(returns);
    const downside = returns.filter(r => r < 0);
    
    if (downside.length === 0) return 0;
    
    const downsideDeviation = Math.sqrt(
      _.mean(downside.map(r => Math.pow(r, 2)))
    );
    
    return downsideDeviation === 0 ? 0 : mean / downsideDeviation;
  }

  /**
   * 计算胜率
   */
  private calculateWinRate(trades: any[]): number {
    if (trades.length === 0) return 0;
    
    const winningTrades = trades.filter(trade => (trade.pnl || 0) > 0);
    return winningTrades.length / trades.length;
  }

  /**
   * 计算盈利因子
   */
  private calculateProfitFactor(trades: any[]): number {
    const profits = trades.filter(t => (t.pnl || 0) > 0).reduce((sum, t) => sum + t.pnl, 0);
    const losses = Math.abs(trades.filter(t => (t.pnl || 0) < 0).reduce((sum, t) => sum + t.pnl, 0));
    
    return losses === 0 ? (profits > 0 ? Infinity : 0) : profits / losses;
  }

  /**
   * 计算平均盈亏
   */
  private calculateAvgWinLoss(trades: any[]): { avgWin: number; avgLoss: number } {
    const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = trades.filter(t => (t.pnl || 0) < 0);
    
    const avgWin = winningTrades.length > 0 ? _.mean(winningTrades.map(t => t.pnl)) : 0;
    const avgLoss = losingTrades.length > 0 ? _.mean(losingTrades.map(t => Math.abs(t.pnl))) : 0;
    
    return { avgWin, avgLoss };
  }

  /**
   * 计算连续盈亏
   */
  private calculateConsecutiveWinLoss(trades: any[]): {
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
  } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;
    
    for (const trade of trades) {
      const pnl = trade.pnl || 0;
      
      if (pnl > 0) {
        currentWins++;
        currentLosses = 0;
        maxWins = Math.max(maxWins, currentWins);
      } else if (pnl < 0) {
        currentLosses++;
        currentWins = 0;
        maxLosses = Math.max(maxLosses, currentLosses);
      }
    }
    
    return {
      maxConsecutiveWins: maxWins,
      maxConsecutiveLosses: maxLosses
    };
  }

  /**
   * 计算一致性评分
   */
  private calculateConsistency(returns: number[], backtests: any[]): number {
    if (returns.length === 0) return 0;
    
    // 基于收益率的标准差计算一致性
    const volatility = this.calculateVolatility(returns);
    const consistencyScore = Math.max(0, 100 - volatility * 100);
    
    // 如果有回测数据，结合回测一致性
    if (backtests.length > 0) {
      const backtestReturns = backtests.map(bt => bt.totalReturn || 0);
      const backtestVolatility = backtestReturns.length > 1 ? 
        Math.sqrt(_.mean(backtestReturns.map(r => Math.pow(r - _.mean(backtestReturns), 2)))) : 0;
      
      const backtestConsistency = Math.max(0, 100 - backtestVolatility * 100);
      return (consistencyScore + backtestConsistency) / 2;
    }
    
    return consistencyScore;
  }

  /**
   * 计算稳定性评分
   */
  private calculateStability(returns: number[], battles: any[]): number {
    if (returns.length === 0) return 0;
    
    // 基于收益率趋势的稳定性
    const periods = 10;
    const periodSize = Math.floor(returns.length / periods);
    
    if (periodSize === 0) return 50; // 数据不足，给中等评分
    
    const periodReturns: number[] = [];
    for (let i = 0; i < periods; i++) {
      const start = i * periodSize;
      const end = Math.min(start + periodSize, returns.length);
      const periodReturn = returns.slice(start, end).reduce((acc, ret) => (1 + acc) * (1 + ret) - 1, 0);
      periodReturns.push(periodReturn);
    }
    
    const stabilityScore = Math.max(0, 100 - Math.sqrt(_.mean(periodReturns.map(r => Math.pow(r - _.mean(periodReturns), 2)))) * 100);
    
    // 如果有对战数据，结合对战稳定性
    if (battles.length > 0) {
      const battleWins = battles.filter(battle => {
        const result = battle.results?.find((r: any) => r.agentId.toString() === battle.agentId);
        return result?.rank === 1;
      }).length;
      
      const battleStability = battles.length > 0 ? (battleWins / battles.length) * 100 : 50;
      return (stabilityScore + battleStability) / 2;
    }
    
    return stabilityScore;
  }

  /**
   * 计算鲁棒性评分
   */
  private calculateRobustness(backtests: any[], battles: any[]): number {
    let robustnessScore = 50; // 基础分数
    
    // 基于回测数据的鲁棒性
    if (backtests.length > 0) {
      const successfulBacktests = backtests.filter(bt => (bt.totalReturn || 0) > 0).length;
      const backtestRobustness = (successfulBacktests / backtests.length) * 100;
      robustnessScore = (robustnessScore + backtestRobustness) / 2;
    }
    
    // 基于对战数据的鲁棒性
    if (battles.length > 0) {
      const topPerformances = battles.filter(battle => {
        const result = battle.results?.find((r: any) => r.agentId.toString() === battle.agentId);
        return result?.rank <= 3; // 前三名
      }).length;
      
      const battleRobustness = (topPerformances / battles.length) * 100;
      robustnessScore = (robustnessScore + battleRobustness) / 2;
    }
    
    return Math.min(100, Math.max(0, robustnessScore));
  }

  /**
   * 计算综合评分
   */
  private calculateOverallScore(metrics: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    consistency: number;
    stability: number;
  }): number {
    const weights = this.defaultWeights;
    
    // 标准化各项指标到0-100分
    const returnScore = Math.min(100, Math.max(0, metrics.totalReturn * 100 + 50));
    const riskScore = Math.min(100, Math.max(0, metrics.sharpeRatio * 20 + 50));
    const drawdownScore = Math.min(100, Math.max(0, 100 - metrics.maxDrawdown * 100));
    const winRateScore = metrics.winRate * 100;
    const consistencyScore = metrics.consistency;
    const stabilityScore = metrics.stability;
    
    // 加权计算综合评分
    const overallScore = 
      returnScore * weights.return +
      riskScore * weights.risk +
      stabilityScore * weights.stability +
      winRateScore * weights.winRate +
      drawdownScore * weights.drawdown;
    
    return Math.min(100, Math.max(0, overallScore));
  }

  /**
   * 计算风险调整后评分
   */
  private calculateRiskAdjustedScore(
    overallScore: number,
    volatility: number,
    maxDrawdown: number
  ): number {
    // 风险惩罚因子
    const volatilityPenalty = Math.min(0.5, volatility);
    const drawdownPenalty = Math.min(0.5, maxDrawdown);
    
    const riskPenalty = (volatilityPenalty + drawdownPenalty) / 2;
    const adjustedScore = overallScore * (1 - riskPenalty);
    
    return Math.min(100, Math.max(0, adjustedScore));
  }

  /**
   * 计算排名
   */
  private calculateRankings(metrics: AgentMetrics[]): AgentMetrics[] {
    // 按综合评分排序
    const sorted = metrics.sort((a, b) => b.overallScore - a.overallScore);
    
    // 设置排名和百分位数
    sorted.forEach((metric, index) => {
      metric.rank = index + 1;
      metric.percentile = ((sorted.length - index) / sorted.length) * 100;
    });
    
    return sorted;
  }

  /**
   * 按类别排序
   */
  private sortByCategory(metrics: AgentMetrics[], category: string): AgentMetrics[] {
    switch (category) {
      case 'return':
        return metrics.sort((a, b) => b.totalReturn - a.totalReturn);
      case 'risk':
        return metrics.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
      case 'stability':
        return metrics.sort((a, b) => b.stability - a.stability);
      default:
        return metrics;
    }
  }

  /**
   * 保存评估结果
   */
  private async saveEvaluationResult(agentId: string, metrics: AgentMetrics): Promise<void> {
    try {
      await Agent.findByIdAndUpdate(agentId, {
        evaluationMetrics: metrics,
        lastEvaluated: new Date()
      });
    } catch (error) {
      logger.error(`保存评估结果失败: ${agentId}`, error);
      throw error;
    }
  }

  /**
   * 更新Agent排名信息
   */
  private async updateAgentRankings(rankedMetrics: AgentMetrics[]): Promise<void> {
    try {
      const updatePromises = rankedMetrics.map(async (metrics, index) => {
        const agentId = metrics.rank; // 这里需要从metrics中获取agentId
        return Agent.findByIdAndUpdate(agentId, {
          'evaluationMetrics.rank': index + 1,
          'evaluationMetrics.percentile': ((rankedMetrics.length - index) / rankedMetrics.length) * 100
        });
      });
      
      await Promise.all(updatePromises);
      logger.info(`更新了${rankedMetrics.length}个Agent的排名信息`);
    } catch (error) {
      logger.error('更新Agent排名失败', error);
      throw error;
    }
  }
}

export default EvaluationService.getInstance();