import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import rankingService, { LeaderboardType } from '../services/rankingService';
import evaluationService from '../services/evaluationService';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types';

/**
 * 排名控制器
 */
export class RankingController {
  /**
   * 获取排行榜
   */
  async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: '参数验证失败',
          errors: errors.array()
        } as ApiResponse);
        return;
      }

      const {
        type = 'overall',
        limit = 50,
        offset = 0,
        refresh = false
      } = req.query;

      const leaderboardType = type as LeaderboardType;
      const limitNum = Math.min(parseInt(limit as string) || 50, 100);
      const offsetNum = Math.max(parseInt(offset as string) || 0, 0);
      const forceRefresh = refresh === 'true';

      logger.info(`获取排行榜请求: ${leaderboardType}, limit: ${limitNum}, offset: ${offsetNum}`);

      const leaderboard = await rankingService.getLeaderboard(
        leaderboardType,
        limitNum,
        offsetNum,
        forceRefresh
      );

      // 获取排行榜统计信息
      const stats = await rankingService.getLeaderboardStats(leaderboardType);

      res.json({
        success: true,
        message: '获取排行榜成功',
        data: {
          leaderboard,
          pagination: {
            limit: limitNum,
            offset: offsetNum,
            total: stats.totalAgents,
            hasMore: offsetNum + limitNum < stats.totalAgents
          },
          meta: {
            type: leaderboardType,
            lastUpdated: stats.lastUpdated,
            cacheHit: stats.cacheHit,
            totalAgents: stats.totalAgents
          }
        }
      } as ApiResponse);
    } catch (error) {
      logger.error('获取排行榜失败', error);
      res.status(500).json({
        success: false,
        message: '获取排行榜失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 获取Agent排名
   */
  async getAgentRank(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: '参数验证失败',
          errors: errors.array()
        } as ApiResponse);
        return;
      }

      const { agentId } = req.params;
      const { type = 'overall' } = req.query;
      const leaderboardType = type as LeaderboardType;

      logger.info(`获取Agent排名: ${agentId}, 类型: ${leaderboardType}`);

      const rankInfo = await rankingService.getAgentRank(agentId, leaderboardType);

      if (rankInfo.rank === -1) {
        res.status(404).json({
          success: false,
          message: 'Agent未在排行榜中找到'
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        message: '获取Agent排名成功',
        data: {
          agentId,
          leaderboardType,
          rank: rankInfo.rank,
          entry: rankInfo.entry
        }
      } as ApiResponse);
    } catch (error) {
      logger.error('获取Agent排名失败', error);
      res.status(500).json({
        success: false,
        message: '获取Agent排名失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 获取排名历史
   */
  async getRankingHistory(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: '参数验证失败',
          errors: errors.array()
        } as ApiResponse);
        return;
      }

      const { agentId } = req.params;
      const {
        type = 'overall',
        days = 30
      } = req.query;

      const leaderboardType = type as LeaderboardType;
      const daysNum = Math.min(parseInt(days as string) || 30, 365);

      logger.info(`获取排名历史: ${agentId}, 类型: ${leaderboardType}, 天数: ${daysNum}`);

      const history = await rankingService.getRankingHistory(
        agentId,
        leaderboardType,
        daysNum
      );

      res.json({
        success: true,
        message: '获取排名历史成功',
        data: {
          agentId,
          leaderboardType,
          days: daysNum,
          history
        }
      } as ApiResponse);
    } catch (error) {
      logger.error('获取排名历史失败', error);
      res.status(500).json({
        success: false,
        message: '获取排名历史失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 获取所有排行榜类型
   */
  async getLeaderboardTypes(req: Request, res: Response): Promise<void> {
    try {
      const configs = rankingService.getLeaderboardConfigs();
      
      const types = configs.map(config => ({
        type: config.type,
        title: config.title,
        description: config.description,
        sortField: config.sortField,
        sortOrder: config.sortOrder
      }));

      res.json({
        success: true,
        message: '获取排行榜类型成功',
        data: { types }
      } as ApiResponse);
    } catch (error) {
      logger.error('获取排行榜类型失败', error);
      res.status(500).json({
        success: false,
        message: '获取排行榜类型失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 手动更新排行榜（管理员功能）
   */
  async updateLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: '参数验证失败',
          errors: errors.array()
        } as ApiResponse);
        return;
      }

      const { type } = req.body;
      const leaderboardType = type as LeaderboardType;

      logger.info(`手动更新排行榜: ${leaderboardType}`);

      if (leaderboardType === 'all') {
        await rankingService.updateAllLeaderboards();
      } else {
        await rankingService.updateLeaderboard(leaderboardType);
      }

      res.json({
        success: true,
        message: '排行榜更新成功'
      } as ApiResponse);
    } catch (error) {
      logger.error('更新排行榜失败', error);
      res.status(500).json({
        success: false,
        message: '更新排行榜失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 清除排行榜缓存（管理员功能）
   */
  async clearCache(req: Request, res: Response): Promise<void> {
    try {
      const { type } = req.body;
      const leaderboardType = type as LeaderboardType | undefined;

      logger.info(`清除排行榜缓存: ${leaderboardType || 'all'}`);

      await rankingService.clearCache(leaderboardType);

      res.json({
        success: true,
        message: '缓存清除成功'
      } as ApiResponse);
    } catch (error) {
      logger.error('清除缓存失败', error);
      res.status(500).json({
        success: false,
        message: '清除缓存失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 评估Agent性能
   */
  async evaluateAgent(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: '参数验证失败',
          errors: errors.array()
        } as ApiResponse);
        return;
      }

      const { agentId } = req.params;
      const { startDate, endDate } = req.body;

      logger.info(`评估Agent性能: ${agentId}`);

      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;

      const metrics = await evaluationService.evaluateAgent(agentId, start, end);

      res.json({
        success: true,
        message: 'Agent评估完成',
        data: { metrics }
      } as ApiResponse);
    } catch (error) {
      logger.error('评估Agent失败', error);
      res.status(500).json({
        success: false,
        message: '评估Agent失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 批量评估所有Agent
   */
  async evaluateAllAgents(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.body;

      logger.info('开始批量评估所有Agent');

      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;

      // 异步执行批量评估
      evaluationService.evaluateAllAgents(start, end)
        .then(() => {
          logger.info('批量评估完成');
        })
        .catch(error => {
          logger.error('批量评估失败', error);
        });

      res.json({
        success: true,
        message: '批量评估已启动，请稍后查看结果'
      } as ApiResponse);
    } catch (error) {
      logger.error('启动批量评估失败', error);
      res.status(500).json({
        success: false,
        message: '启动批量评估失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 获取排行榜统计信息
   */
  async getLeaderboardStats(req: Request, res: Response): Promise<void> {
    try {
      const { type = 'overall' } = req.query;
      const leaderboardType = type as LeaderboardType;

      const stats = await rankingService.getLeaderboardStats(leaderboardType);

      res.json({
        success: true,
        message: '获取统计信息成功',
        data: {
          leaderboardType,
          ...stats
        }
      } as ApiResponse);
    } catch (error) {
      logger.error('获取统计信息失败', error);
      res.status(500).json({
        success: false,
        message: '获取统计信息失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 获取用户的所有Agent排名
   */
  async getUserAgentRankings(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { type = 'overall' } = req.query;
      const leaderboardType = type as LeaderboardType;

      logger.info(`获取用户Agent排名: ${userId}, 类型: ${leaderboardType}`);

      // 获取用户的所有Agent
      const agents = await rankingService.getLeaderboard(leaderboardType, 1000);
      const userAgents = agents.filter(entry => entry.userId === userId);

      res.json({
        success: true,
        message: '获取用户Agent排名成功',
        data: {
          userId,
          leaderboardType,
          agents: userAgents,
          totalAgents: userAgents.length
        }
      } as ApiResponse);
    } catch (error) {
      logger.error('获取用户Agent排名失败', error);
      res.status(500).json({
        success: false,
        message: '获取用户Agent排名失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }

  /**
   * 获取排行榜周围的Agent（获取指定Agent前后的排名）
   */
  async getLeaderboardAround(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: '参数验证失败',
          errors: errors.array()
        } as ApiResponse);
        return;
      }

      const { agentId } = req.params;
      const {
        type = 'overall',
        range = 10
      } = req.query;

      const leaderboardType = type as LeaderboardType;
      const rangeNum = Math.min(parseInt(range as string) || 10, 50);

      logger.info(`获取Agent周围排名: ${agentId}, 类型: ${leaderboardType}, 范围: ${rangeNum}`);

      // 获取Agent当前排名
      const rankInfo = await rankingService.getAgentRank(agentId, leaderboardType);
      
      if (rankInfo.rank === -1) {
        res.status(404).json({
          success: false,
          message: 'Agent未在排行榜中找到'
        } as ApiResponse);
        return;
      }

      // 计算获取范围
      const startRank = Math.max(1, rankInfo.rank - rangeNum);
      const offset = startRank - 1;
      const limit = rangeNum * 2 + 1;

      const leaderboard = await rankingService.getLeaderboard(
        leaderboardType,
        limit,
        offset
      );

      res.json({
        success: true,
        message: '获取周围排名成功',
        data: {
          agentId,
          leaderboardType,
          currentRank: rankInfo.rank,
          range: rangeNum,
          leaderboard
        }
      } as ApiResponse);
    } catch (error) {
      logger.error('获取周围排名失败', error);
      res.status(500).json({
        success: false,
        message: '获取周围排名失败',
        error: error instanceof Error ? error.message : '未知错误'
      } as ApiResponse);
    }
  }
}

export default new RankingController();