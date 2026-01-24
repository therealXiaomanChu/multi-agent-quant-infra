import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getBattleService, IBattleConfig } from '../services/battleService';
import { auth } from '../middleware/auth';
import { rateLimit } from 'express-rate-limit';
import { logger } from '../utils/logger';

const router = Router();
const battleService = getBattleService();

// 速率限制
const createBattleLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 最多创建5个对战
  message: { error: 'Too many battles created, please try again later' }
});

const joinBattleLimit = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 最多加入10个对战
  message: { error: 'Too many join attempts, please try again later' }
});

/**
 * @route GET /api/battles
 * @desc 获取对战列表
 * @access Public
 */
router.get('/',
  [
    query('status').optional().isIn(['upcoming', 'active', 'completed']).withMessage('Invalid status'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { status, limit = 20, offset = 0 } = req.query;
      const battles = await battleService.getBattles(
        status as string,
        parseInt(limit as string),
        parseInt(offset as string)
      );

      res.json({
        success: true,
        data: battles,
        pagination: {
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          total: battles.length
        }
      });
    } catch (error) {
      logger.error('Failed to get battles:', error);
      res.status(500).json({ error: 'Failed to get battles' });
    }
  }
);

/**
 * @route GET /api/battles/:id
 * @desc 获取对战详情
 * @access Public
 */
router.get('/:id',
  [
    param('id').isMongoId().withMessage('Invalid battle ID')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const battle = await battleService.getBattleById(req.params.id);
      if (!battle) {
        return res.status(404).json({ error: 'Battle not found' });
      }

      // 获取实时统计数据（如果对战正在进行）
      let liveStats = null;
      if (battle.status === 'active') {
        const stats = battleService.getBattleStats(req.params.id);
        if (stats) {
          liveStats = Array.from(stats.entries()).map(([agentId, stat]) => ({
            agentId,
            ...stat
          }));
        }
      }

      res.json({
        success: true,
        data: {
          ...battle.toObject(),
          liveStats
        }
      });
    } catch (error) {
      logger.error('Failed to get battle details:', error);
      res.status(500).json({ error: 'Failed to get battle details' });
    }
  }
);

/**
 * @route POST /api/battles
 * @desc 创建新对战
 * @access Private
 */
router.post('/',
  auth,
  createBattleLimit,
  [
    body('name').isLength({ min: 3, max: 100 }).withMessage('Name must be between 3 and 100 characters'),
    body('description').isLength({ min: 10, max: 500 }).withMessage('Description must be between 10 and 500 characters'),
    body('startTime').isISO8601().withMessage('Invalid start time format'),
    body('endTime').isISO8601().withMessage('Invalid end time format'),
    body('initialCapital').isFloat({ min: 1000, max: 1000000 }).withMessage('Initial capital must be between 1000 and 1000000'),
    body('maxParticipants').isInt({ min: 2, max: 100 }).withMessage('Max participants must be between 2 and 100'),
    body('entryFee').isFloat({ min: 0, max: 10000 }).withMessage('Entry fee must be between 0 and 10000'),
    body('symbols').isArray({ min: 1, max: 20 }).withMessage('Must provide 1-20 trading symbols'),
    body('symbols.*').isString().isLength({ min: 3, max: 10 }).withMessage('Invalid symbol format'),
    body('rules.maxPositionSize').isFloat({ min: 0.01, max: 1 }).withMessage('Max position size must be between 0.01 and 1'),
    body('rules.allowedOrderTypes').isArray().withMessage('Allowed order types must be an array'),
    body('rules.maxDailyTrades').isInt({ min: 1, max: 1000 }).withMessage('Max daily trades must be between 1 and 1000'),
    body('rules.riskLimits.maxDrawdown').isFloat({ min: 0.01, max: 0.5 }).withMessage('Max drawdown must be between 0.01 and 0.5'),
    body('rules.riskLimits.maxLeverage').isFloat({ min: 1, max: 10 }).withMessage('Max leverage must be between 1 and 10'),
    body('rewards.first').isFloat({ min: 0 }).withMessage('First place reward must be non-negative'),
    body('rewards.second').isFloat({ min: 0 }).withMessage('Second place reward must be non-negative'),
    body('rewards.third').isFloat({ min: 0 }).withMessage('Third place reward must be non-negative'),
    body('rewards.participationReward').isFloat({ min: 0 }).withMessage('Participation reward must be non-negative')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const startTime = new Date(req.body.startTime);
      const endTime = new Date(req.body.endTime);
      const now = new Date();

      // 验证时间逻辑
      if (startTime <= now) {
        return res.status(400).json({ error: 'Start time must be in the future' });
      }

      if (endTime <= startTime) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }

      const duration = endTime.getTime() - startTime.getTime();
      const minDuration = 30 * 60 * 1000; // 30分钟
      const maxDuration = 30 * 24 * 60 * 60 * 1000; // 30天

      if (duration < minDuration || duration > maxDuration) {
        return res.status(400).json({ error: 'Battle duration must be between 30 minutes and 30 days' });
      }

      const config: IBattleConfig = {
        name: req.body.name,
        description: req.body.description,
        startTime,
        endTime,
        initialCapital: req.body.initialCapital,
        maxParticipants: req.body.maxParticipants,
        entryFee: req.body.entryFee,
        symbols: req.body.symbols,
        rules: req.body.rules,
        rewards: req.body.rewards
      };

      const battle = await battleService.createBattle(config, req.user.id);

      res.status(201).json({
        success: true,
        data: battle,
        message: 'Battle created successfully'
      });
    } catch (error) {
      logger.error('Failed to create battle:', error);
      res.status(500).json({ error: 'Failed to create battle' });
    }
  }
);

/**
 * @route POST /api/battles/:id/join
 * @desc 加入对战
 * @access Private
 */
router.post('/:id/join',
  auth,
  joinBattleLimit,
  [
    param('id').isMongoId().withMessage('Invalid battle ID'),
    body('agentId').isMongoId().withMessage('Invalid agent ID')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      await battleService.joinBattle(req.params.id, req.body.agentId, req.user.id);

      res.json({
        success: true,
        message: 'Successfully joined the battle'
      });
    } catch (error) {
      logger.error('Failed to join battle:', error);
      if (error.message.includes('not found') || error.message.includes('not owned')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('full') || error.message.includes('already joined') || error.message.includes('not accepting')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to join battle' });
    }
  }
);

/**
 * @route POST /api/battles/:id/start
 * @desc 开始对战（仅创建者可操作）
 * @access Private
 */
router.post('/:id/start',
  auth,
  [
    param('id').isMongoId().withMessage('Invalid battle ID')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      // 验证用户是否为对战创建者
      const battle = await battleService.getBattleById(req.params.id);
      if (!battle) {
        return res.status(404).json({ error: 'Battle not found' });
      }

      if (battle.creator.toString() !== req.user.id) {
        return res.status(403).json({ error: 'Only the battle creator can start the battle' });
      }

      await battleService.startBattle(req.params.id);

      res.json({
        success: true,
        message: 'Battle started successfully'
      });
    } catch (error) {
      logger.error('Failed to start battle:', error);
      if (error.message.includes('cannot be started') || error.message.includes('needs at least')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to start battle' });
    }
  }
);

/**
 * @route GET /api/battles/:id/stats
 * @desc 获取对战实时统计
 * @access Public
 */
router.get('/:id/stats',
  [
    param('id').isMongoId().withMessage('Invalid battle ID')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const stats = battleService.getBattleStats(req.params.id);
      if (!stats) {
        return res.status(404).json({ error: 'Battle not found or not active' });
      }

      const statsArray = Array.from(stats.entries()).map(([agentId, stat]) => ({
        agentId,
        ...stat
      }));

      res.json({
        success: true,
        data: statsArray,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to get battle stats:', error);
      res.status(500).json({ error: 'Failed to get battle stats' });
    }
  }
);

/**
 * @route GET /api/battles/user/:userId
 * @desc 获取用户参与的对战
 * @access Private
 */
router.get('/user/:userId',
  auth,
  [
    param('userId').isMongoId().withMessage('Invalid user ID'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      // 用户只能查看自己的对战记录
      if (req.params.userId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { limit = 10 } = req.query;
      const battles = await battleService.getUserBattles(
        req.params.userId,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: battles
      });
    } catch (error) {
      logger.error('Failed to get user battles:', error);
      res.status(500).json({ error: 'Failed to get user battles' });
    }
  }
);

export default router