import { Router } from 'express';
import { body, param, query } from 'express-validator';
import rankingController from '../controllers/rankingController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// 排行榜查询限流
const leaderboardRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30次请求
  message: {
    success: false,
    message: '请求过于频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 管理员操作限流
const adminRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 10, // 每5分钟最多10次请求
  message: {
    success: false,
    message: '管理员操作过于频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 排行榜类型验证
const leaderboardTypes = [
  'overall',
  'return',
  'risk_adjusted',
  'stability',
  'win_rate',
  'battle',
  'monthly',
  'weekly',
  'rookie'
];

/**
 * @route GET /api/ranking/leaderboard
 * @desc 获取排行榜
 * @access Public
 */
router.get(
  '/leaderboard',
  leaderboardRateLimit,
  [
    query('type')
      .optional()
      .isIn(leaderboardTypes)
      .withMessage('无效的排行榜类型'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('限制数量必须在1-100之间'),
    query('offset')
      .optional()
      .isInt({ min: 0 })
      .withMessage('偏移量必须大于等于0'),
    query('refresh')
      .optional()
      .isBoolean()
      .withMessage('刷新参数必须是布尔值')
  ],
  rankingController.getLeaderboard
);

/**
 * @route GET /api/ranking/agent/:agentId/rank
 * @desc 获取Agent排名
 * @access Public
 */
router.get(
  '/agent/:agentId/rank',
  leaderboardRateLimit,
  [
    param('agentId')
      .isMongoId()
      .withMessage('无效的Agent ID'),
    query('type')
      .optional()
      .isIn(leaderboardTypes)
      .withMessage('无效的排行榜类型')
  ],
  rankingController.getAgentRank
);

/**
 * @route GET /api/ranking/agent/:agentId/history
 * @desc 获取Agent排名历史
 * @access Private
 */
router.get(
  '/agent/:agentId/history',
  authenticateToken,
  leaderboardRateLimit,
  [
    param('agentId')
      .isMongoId()
      .withMessage('无效的Agent ID'),
    query('type')
      .optional()
      .isIn(leaderboardTypes)
      .withMessage('无效的排行榜类型'),
    query('days')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('天数必须在1-365之间')
  ],
  rankingController.getRankingHistory
);

/**
 * @route GET /api/ranking/agent/:agentId/around
 * @desc 获取Agent周围的排名
 * @access Public
 */
router.get(
  '/agent/:agentId/around',
  leaderboardRateLimit,
  [
    param('agentId')
      .isMongoId()
      .withMessage('无效的Agent ID'),
    query('type')
      .optional()
      .isIn(leaderboardTypes)
      .withMessage('无效的排行榜类型'),
    query('range')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('范围必须在1-50之间')
  ],
  rankingController.getLeaderboardAround
);

/**
 * @route GET /api/ranking/user/:userId/agents
 * @desc 获取用户的所有Agent排名
 * @access Private
 */
router.get(
  '/user/:userId/agents',
  authenticateToken,
  leaderboardRateLimit,
  [
    param('userId')
      .isMongoId()
      .withMessage('无效的用户ID'),
    query('type')
      .optional()
      .isIn(leaderboardTypes)
      .withMessage('无效的排行榜类型')
  ],
  rankingController.getUserAgentRankings
);

/**
 * @route GET /api/ranking/types
 * @desc 获取所有排行榜类型
 * @access Public
 */
router.get(
  '/types',
  leaderboardRateLimit,
  rankingController.getLeaderboardTypes
);

/**
 * @route GET /api/ranking/stats
 * @desc 获取排行榜统计信息
 * @access Public
 */
router.get(
  '/stats',
  leaderboardRateLimit,
  [
    query('type')
      .optional()
      .isIn(leaderboardTypes)
      .withMessage('无效的排行榜类型')
  ],
  rankingController.getLeaderboardStats
);

/**
 * @route POST /api/ranking/evaluate/:agentId
 * @desc 评估Agent性能
 * @access Private
 */
router.post(
  '/evaluate/:agentId',
  authenticateToken,
  adminRateLimit,
  [
    param('agentId')
      .isMongoId()
      .withMessage('无效的Agent ID'),
    body('startDate')
      .optional()
      .isISO8601()
      .withMessage('开始日期格式无效'),
    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('结束日期格式无效')
  ],
  rankingController.evaluateAgent
);

/**
 * @route POST /api/ranking/evaluate/all
 * @desc 批量评估所有Agent
 * @access Admin
 */
router.post(
  '/evaluate/all',
  authenticateToken,
  requireRole(['admin']),
  adminRateLimit,
  [
    body('startDate')
      .optional()
      .isISO8601()
      .withMessage('开始日期格式无效'),
    body('endDate')
      .optional()
      .isISO8601()
      .withMessage('结束日期格式无效')
  ],
  rankingController.evaluateAllAgents
);

/**
 * @route POST /api/ranking/update
 * @desc 手动更新排行榜
 * @access Admin
 */
router.post(
  '/update',
  authenticateToken,
  requireRole(['admin']),
  adminRateLimit,
  [
    body('type')
      .isIn([...leaderboardTypes, 'all'])
      .withMessage('无效的排行榜类型')
  ],
  rankingController.updateLeaderboard
);

/**
 * @route POST /api/ranking/cache/clear
 * @desc 清除排行榜缓存
 * @access Admin
 */
router.post(
  '/cache/clear',
  authenticateToken,
  requireRole(['admin']),
  adminRateLimit,
  [
    body('type')
      .optional()
      .isIn(leaderboardTypes)
      .withMessage('无效的排行榜类型')
  ],
  rankingController.clearCache
);

// 排行榜WebSocket事件（如果需要实时更新）
/**
 * WebSocket事件处理
 * 
 * 客户端可以订阅以下事件：
 * - 'leaderboard:subscribe' - 订阅排行榜更新
 * - 'leaderboard:unsubscribe' - 取消订阅
 * - 'agent:rank:subscribe' - 订阅特定Agent排名更新
 * 
 * 服务端推送事件：
 * - 'leaderboard:updated' - 排行榜更新
 * - 'agent:rank:changed' - Agent排名变化
 * - 'leaderboard:stats' - 排行榜统计更新
 */

export default router;