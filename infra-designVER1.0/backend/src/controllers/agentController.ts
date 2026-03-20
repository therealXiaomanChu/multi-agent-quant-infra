import { Response } from 'express'
import Joi from 'joi'
import { Agent } from '@/models/Agent'
import { User } from '@/models/User'
import { IAuthRequest, IApiResponse, IPaginationQuery } from '@/types'
import { AppError, asyncHandler } from '@/middleware/errorHandler'
import { RedisService } from '@/config/redis'

// 验证模式
const createAgentSchema = Joi.object({
  name: Joi.string()
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.min': '代理名称至少需要3个字符',
      'string.max': '代理名称不能超过100个字符',
      'any.required': '代理名称是必需的'
    }),
  description: Joi.string()
    .min(10)
    .max(1000)
    .required()
    .messages({
      'string.min': '描述至少需要10个字符',
      'string.max': '描述不能超过1000个字符',
      'any.required': '描述是必需的'
    }),
  code: Joi.string()
    .min(50)
    .max(50000)
    .required()
    .messages({
      'string.min': '代码至少需要50个字符',
      'string.max': '代码不能超过50000个字符',
      'any.required': '代码是必需的'
    }),
  language: Joi.string()
    .valid('python', 'javascript', 'typescript', 'java', 'cpp', 'csharp')
    .required()
    .messages({
      'any.only': '不支持的编程语言',
      'any.required': '编程语言是必需的'
    }),
  tags: Joi.array()
    .items(Joi.string().max(20))
    .max(10)
    .default([])
    .messages({
      'array.max': '标签不能超过10个',
      'string.max': '每个标签不能超过20个字符'
    }),
  category: Joi.string()
    .valid('trend_following', 'mean_reversion', 'arbitrage', 'market_making', 'momentum', 'other')
    .default('other')
    .messages({
      'any.only': '无效的策略类别'
    }),
  isPublic: Joi.boolean().default(true)
})

const updateAgentSchema = Joi.object({
  name: Joi.string().min(3).max(100),
  description: Joi.string().min(10).max(1000),
  code: Joi.string().min(50).max(50000),
  language: Joi.string().valid('python', 'javascript', 'typescript', 'java', 'cpp', 'csharp'),
  tags: Joi.array().items(Joi.string().max(20)).max(10),
  category: Joi.string().valid('trend_following', 'mean_reversion', 'arbitrage', 'market_making', 'momentum', 'other'),
  isPublic: Joi.boolean(),
  isActive: Joi.boolean()
})

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('createdAt', 'updatedAt', 'rating', 'totalTrades', 'totalProfit', 'winRate').default('createdAt'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().max(100).allow(''),
  category: Joi.string().valid('trend_following', 'mean_reversion', 'arbitrage', 'market_making', 'momentum', 'other'),
  language: Joi.string().valid('python', 'javascript', 'typescript', 'java', 'cpp', 'csharp'),
  tags: Joi.array().items(Joi.string()),
  author: Joi.string(),
  minRating: Joi.number().min(0).max(5),
  maxRating: Joi.number().min(0).max(5)
})

class AgentController {
  // 创建新的交易代理
  createAgent = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证输入数据
    const { error, value } = createAgentSchema.validate(req.body)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    // 检查用户是否存在
    const user = await User.findById(req.user.id)
    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    // 检查代理名称是否已存在（同一用户）
    const existingAgent = await Agent.findOne({
      name: value.name,
      author: req.user.id
    })

    if (existingAgent) {
      throw new AppError('您已经有一个同名的代理', 400)
    }

    // 创建新代理
    const agent = await Agent.create({
      ...value,
      author: req.user.id
    })

    // 更新用户统计
    await user.updateStats()

    const response: IApiResponse = {
      success: true,
      message: '代理创建成功',
      data: {
        agent: {
          id: agent._id,
          name: agent.name,
          description: agent.description,
          author: {
            id: user._id,
            username: user.username,
            avatar: user.avatarUrl
          },
          language: agent.language,
          tags: agent.tags,
          category: agent.category,
          isPublic: agent.isPublic,
          isActive: agent.isActive,
          version: agent.version,
          stats: agent.stats,
          rating: agent.rating,
          createdAt: agent.createdAt
        }
      }
    }

    res.status(201).json(response)
  })

  // 获取代理列表
  getAgents = asyncHandler(async (req: IAuthRequest, res: Response) => {
    // 验证查询参数
    const { error, value } = paginationSchema.validate(req.query)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const {
      page,
      limit,
      sort,
      order,
      search,
      category,
      language,
      tags,
      author,
      minRating,
      maxRating
    } = value as IPaginationQuery

    // 构建查询条件
    const query: any = { isPublic: true }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ]
    }

    if (category) query.category = category
    if (language) query.language = language
    if (tags && tags.length > 0) query.tags = { $in: tags }
    if (author) query.author = author
    if (minRating !== undefined) query['rating.average'] = { $gte: minRating }
    if (maxRating !== undefined) {
      query['rating.average'] = { ...query['rating.average'], $lte: maxRating }
    }

    // 构建排序
    const sortObj: any = {}
    if (sort === 'rating') {
      sortObj['rating.average'] = order === 'asc' ? 1 : -1
    } else if (sort === 'totalTrades') {
      sortObj['stats.totalTrades'] = order === 'asc' ? 1 : -1
    } else if (sort === 'totalProfit') {
      sortObj['stats.totalProfit'] = order === 'asc' ? 1 : -1
    } else if (sort === 'winRate') {
      sortObj['stats.winRate'] = order === 'asc' ? 1 : -1
    } else {
      sortObj[sort] = order === 'asc' ? 1 : -1
    }

    // 执行查询
    const skip = (page - 1) * limit
    const [agents, total] = await Promise.all([
      Agent.find(query)
        .populate('author', 'username avatar')
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .select('-code'), // 不返回代码内容
      Agent.countDocuments(query)
    ])

    const response: IApiResponse = {
      success: true,
      message: '获取代理列表成功',
      data: {
        agents: agents.map(agent => ({
          id: agent._id,
          name: agent.name,
          description: agent.description,
          author: agent.author,
          language: agent.language,
          tags: agent.tags,
          category: agent.category,
          version: agent.version,
          stats: agent.stats,
          rating: agent.rating,
          netProfit: agent.netProfit,
          returnRate: agent.returnRate,
          popularity: agent.popularity,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    }

    res.status(200).json(response)
  })

  // 获取单个代理详情
  getAgent = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { id } = req.params

    const agent = await Agent.findById(id)
      .populate('author', 'username avatar profile')

    if (!agent) {
      throw new AppError('代理不存在', 404)
    }

    // 检查访问权限
    if (!agent.isPublic && (!req.user || req.user.id !== agent.author._id.toString())) {
      throw new AppError('无权访问此代理', 403)
    }

    // 增加浏览量（使用Redis缓存）
    const viewKey = `agent_views:${id}`
    await RedisService.set(viewKey, '1', 60 * 60) // 1小时内同一IP只计算一次浏览

    const response: IApiResponse = {
      success: true,
      message: '获取代理详情成功',
      data: {
        agent: {
          id: agent._id,
          name: agent.name,
          description: agent.description,
          code: req.user && req.user.id === agent.author._id.toString() ? agent.code : undefined,
          author: agent.author,
          language: agent.language,
          tags: agent.tags,
          category: agent.category,
          isPublic: agent.isPublic,
          isActive: agent.isActive,
          version: agent.version,
          stats: agent.stats,
          rating: agent.rating,
          backtestResults: agent.backtestResults,
          netProfit: agent.netProfit,
          returnRate: agent.returnRate,
          popularity: agent.popularity,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt
        }
      }
    }

    res.status(200).json(response)
  })

  // 更新代理
  updateAgent = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const { id } = req.params

    // 验证输入数据
    const { error, value } = updateAgentSchema.validate(req.body)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const agent = await Agent.findById(id)
    if (!agent) {
      throw new AppError('代理不存在', 404)
    }

    // 检查权限
    if (!agent.canEdit(req.user.id, req.user.role)) {
      throw new AppError('无权修改此代理', 403)
    }

    // 如果修改了代码，增加版本号
    if (value.code && value.code !== agent.code) {
      value.version = agent.version + 1
    }

    // 更新代理
    const updatedAgent = await Agent.findByIdAndUpdate(
      id,
      value,
      {
        new: true,
        runValidators: true
      }
    ).populate('author', 'username avatar')

    const response: IApiResponse = {
      success: true,
      message: '代理更新成功',
      data: {
        agent: {
          id: updatedAgent!._id,
          name: updatedAgent!.name,
          description: updatedAgent!.description,
          author: updatedAgent!.author,
          language: updatedAgent!.language,
          tags: updatedAgent!.tags,
          category: updatedAgent!.category,
          isPublic: updatedAgent!.isPublic,
          isActive: updatedAgent!.isActive,
          version: updatedAgent!.version,
          stats: updatedAgent!.stats,
          rating: updatedAgent!.rating,
          createdAt: updatedAgent!.createdAt,
          updatedAt: updatedAgent!.updatedAt
        }
      }
    }

    res.status(200).json(response)
  })

  // 删除代理
  deleteAgent = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const { id } = req.params

    const agent = await Agent.findById(id)
    if (!agent) {
      throw new AppError('代理不存在', 404)
    }

    // 检查权限
    if (!agent.canEdit(req.user.id, req.user.role)) {
      throw new AppError('无权删除此代理', 403)
    }

    await Agent.findByIdAndDelete(id)

    // 更新用户统计
    const user = await User.findById(req.user.id)
    if (user) {
      await user.updateStats()
    }

    const response: IApiResponse = {
      success: true,
      message: '代理删除成功'
    }

    res.status(200).json(response)
  })

  // 获取我的代理列表
  getMyAgents = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证查询参数
    const { error, value } = paginationSchema.validate(req.query)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { page, limit, sort, order, search } = value as IPaginationQuery

    // 构建查询条件
    const query: any = { author: req.user.id }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    }

    // 构建排序
    const sortObj: any = {}
    sortObj[sort] = order === 'asc' ? 1 : -1

    // 执行查询
    const skip = (page - 1) * limit
    const [agents, total] = await Promise.all([
      Agent.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit),
      Agent.countDocuments(query)
    ])

    const response: IApiResponse = {
      success: true,
      message: '获取我的代理列表成功',
      data: {
        agents: agents.map(agent => ({
          id: agent._id,
          name: agent.name,
          description: agent.description,
          language: agent.language,
          tags: agent.tags,
          category: agent.category,
          isPublic: agent.isPublic,
          isActive: agent.isActive,
          version: agent.version,
          stats: agent.stats,
          rating: agent.rating,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    }

    res.status(200).json(response)
  })

  // 获取热门代理
  getPopularAgents = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 10

    const agents = await Agent.getPopularAgents(limit)

    const response: IApiResponse = {
      success: true,
      message: '获取热门代理成功',
      data: {
        agents: agents.map(agent => ({
          id: agent._id,
          name: agent.name,
          description: agent.description,
          author: agent.author,
          language: agent.language,
          tags: agent.tags,
          category: agent.category,
          stats: agent.stats,
          rating: agent.rating,
          popularity: agent.popularity,
          createdAt: agent.createdAt
        }))
      }
    }

    res.status(200).json(response)
  })

  // 按类别获取代理
  getAgentsByCategory = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { category } = req.params
    const limit = parseInt(req.query.limit as string) || 20

    const agents = await Agent.getAgentsByCategory(category, limit)

    const response: IApiResponse = {
      success: true,
      message: `获取${category}类别代理成功`,
      data: {
        agents: agents.map(agent => ({
          id: agent._id,
          name: agent.name,
          description: agent.description,
          author: agent.author,
          language: agent.language,
          tags: agent.tags,
          stats: agent.stats,
          rating: agent.rating,
          createdAt: agent.createdAt
        }))
      }
    }

    res.status(200).json(response)
  })

  // 搜索代理
  searchAgents = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { q } = req.query
    const limit = parseInt(req.query.limit as string) || 20

    if (!q || typeof q !== 'string') {
      throw new AppError('搜索关键词是必需的', 400)
    }

    const agents = await Agent.searchAgents(q, limit)

    const response: IApiResponse = {
      success: true,
      message: '搜索代理成功',
      data: {
        agents: agents.map(agent => ({
          id: agent._id,
          name: agent.name,
          description: agent.description,
          author: agent.author,
          language: agent.language,
          tags: agent.tags,
          category: agent.category,
          stats: agent.stats,
          rating: agent.rating,
          createdAt: agent.createdAt
        })),
        query: q
      }
    }

    res.status(200).json(response)
  })
}

export const agentController = new AgentController()
export default agentController