import { Response } from 'express'
import Joi from 'joi'
import { User } from '@/models/User'
import { Agent } from '@/models/Agent'
import { IAuthRequest, IApiResponse, IPaginationQuery } from '@/types'
import { AppError, asyncHandler } from '@/middleware/errorHandler'

// 验证模式
const updateProfileSchema = Joi.object({
  firstName: Joi.string().max(50).allow(''),
  lastName: Joi.string().max(50).allow(''),
  bio: Joi.string().max(500).allow(''),
  location: Joi.string().max(100).allow(''),
  website: Joi.string().uri().allow('')
})

const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('createdAt', 'updatedAt', 'username', 'totalAgents', 'totalTrades', 'totalProfit', 'winRate').default('createdAt'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().max(100).allow(''),
  role: Joi.string().valid('user', 'admin', 'moderator')
})

class UserController {
  // 获取用户列表（管理员功能）
  getUsers = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user || req.user.role !== 'admin') {
      throw new AppError('无权访问', 403)
    }

    // 验证查询参数
    const { error, value } = paginationSchema.validate(req.query)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { page, limit, sort, order, search, role } = value as IPaginationQuery

    // 构建查询条件
    const query: any = {}

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'profile.firstName': { $regex: search, $options: 'i' } },
        { 'profile.lastName': { $regex: search, $options: 'i' } }
      ]
    }

    if (role) query.role = role

    // 构建排序
    const sortObj: any = {}
    if (sort === 'totalAgents') {
      sortObj['stats.totalAgents'] = order === 'asc' ? 1 : -1
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
    const [users, total] = await Promise.all([
      User.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .select('-password'),
      User.countDocuments(query)
    ])

    const response: IApiResponse = {
      success: true,
      message: '获取用户列表成功',
      data: {
        users: users.map(user => ({
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatarUrl,
          role: user.role,
          isActive: user.isActive,
          profile: user.profile,
          stats: user.stats,
          fullName: user.fullName,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
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

  // 获取单个用户详情
  getUser = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { id } = req.params

    const user = await User.findById(id).select('-password')
    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    // 获取用户的公开代理
    const agents = await Agent.find({
      author: id,
      isPublic: true
    })
      .select('name description language tags category stats rating createdAt')
      .sort({ createdAt: -1 })
      .limit(10)

    const response: IApiResponse = {
      success: true,
      message: '获取用户详情成功',
      data: {
        user: {
          id: user._id,
          username: user.username,
          avatar: user.avatarUrl,
          role: user.role,
          profile: user.profile,
          stats: user.stats,
          fullName: user.fullName,
          createdAt: user.createdAt
        },
        agents: agents.map(agent => ({
          id: agent._id,
          name: agent.name,
          description: agent.description,
          language: agent.language,
          tags: agent.tags,
          category: agent.category,
          stats: agent.stats,
          rating: agent.rating,
          createdAt: agent.createdAt
        }))
      }
    }

    res.status(200).json(response)
  })

  // 更新用户资料
  updateProfile = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    // 验证输入数据
    const { error, value } = updateProfileSchema.validate(req.body)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          'profile.firstName': value.firstName,
          'profile.lastName': value.lastName,
          'profile.bio': value.bio,
          'profile.location': value.location,
          'profile.website': value.website
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).select('-password')

    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    const response: IApiResponse = {
      success: true,
      message: '用户资料更新成功',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatarUrl,
          role: user.role,
          profile: user.profile,
          stats: user.stats,
          fullName: user.fullName
        }
      }
    }

    res.status(200).json(response)
  })

  // 更新头像
  updateAvatar = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('用户未认证', 401)
    }

    const { avatar } = req.body

    if (!avatar || typeof avatar !== 'string') {
      throw new AppError('头像URL是必需的', 400)
    }

    // 简单的URL验证
    try {
      new URL(avatar)
    } catch {
      throw new AppError('无效的头像URL', 400)
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar },
      {
        new: true,
        runValidators: true
      }
    ).select('-password')

    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    const response: IApiResponse = {
      success: true,
      message: '头像更新成功',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatarUrl,
          role: user.role
        }
      }
    }

    res.status(200).json(response)
  })

  // 获取用户统计信息
  getUserStats = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { id } = req.params

    const user = await User.findById(id).select('stats')
    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    // 获取详细统计
    const [totalAgents, publicAgents, activeAgents] = await Promise.all([
      Agent.countDocuments({ author: id }),
      Agent.countDocuments({ author: id, isPublic: true }),
      Agent.countDocuments({ author: id, isActive: true })
    ])

    // 获取最佳表现代理
    const bestAgent = await Agent.findOne({ author: id })
      .sort({ 'stats.totalProfit': -1 })
      .select('name stats.totalProfit stats.winRate')

    const response: IApiResponse = {
      success: true,
      message: '获取用户统计成功',
      data: {
        stats: {
          ...user.stats,
          totalAgents,
          publicAgents,
          activeAgents,
          bestAgent: bestAgent ? {
            name: bestAgent.name,
            totalProfit: bestAgent.stats.totalProfit,
            winRate: bestAgent.stats.winRate
          } : null
        }
      }
    }

    res.status(200).json(response)
  })

  // 获取用户的代理列表
  getUserAgents = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const { id } = req.params

    // 验证查询参数
    const { error, value } = paginationSchema.validate(req.query)
    if (error) {
      throw new AppError(error.details[0].message, 400)
    }

    const { page, limit, sort, order } = value as IPaginationQuery

    // 检查用户是否存在
    const user = await User.findById(id)
    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    // 构建查询条件（只显示公开的代理，除非是用户本人）
    const query: any = { author: id }
    if (!req.user || req.user.id !== id) {
      query.isPublic = true
    }

    // 构建排序
    const sortObj: any = {}
    if (sort === 'totalTrades') {
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
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .select('-code'), // 不返回代码内容
      Agent.countDocuments(query)
    ])

    const response: IApiResponse = {
      success: true,
      message: '获取用户代理列表成功',
      data: {
        user: {
          id: user._id,
          username: user.username,
          avatar: user.avatarUrl
        },
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

  // 获取排行榜用户
  getLeaderboard = asyncHandler(async (req: IAuthRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50
    const sortBy = req.query.sortBy as string || 'totalProfit'

    let sortField: string
    switch (sortBy) {
      case 'totalAgents':
        sortField = 'stats.totalAgents'
        break
      case 'totalTrades':
        sortField = 'stats.totalTrades'
        break
      case 'winRate':
        sortField = 'stats.winRate'
        break
      case 'totalProfit':
      default:
        sortField = 'stats.totalProfit'
        break
    }

    const users = await User.find({ isActive: true })
      .sort({ [sortField]: -1 })
      .limit(limit)
      .select('username avatar profile stats createdAt')

    const response: IApiResponse = {
      success: true,
      message: '获取排行榜成功',
      data: {
        leaderboard: users.map((user, index) => ({
          rank: index + 1,
          id: user._id,
          username: user.username,
          avatar: user.avatarUrl,
          fullName: user.fullName,
          stats: user.stats,
          createdAt: user.createdAt
        })),
        sortBy
      }
    }

    res.status(200).json(response)
  })

  // 禁用/启用用户（管理员功能）
  toggleUserStatus = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user || req.user.role !== 'admin') {
      throw new AppError('无权访问', 403)
    }

    const { id } = req.params
    const { isActive } = req.body

    if (typeof isActive !== 'boolean') {
      throw new AppError('isActive必须是布尔值', 400)
    }

    const user = await User.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    ).select('-password')

    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    const response: IApiResponse = {
      success: true,
      message: `用户已${isActive ? '启用' : '禁用'}`,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isActive: user.isActive,
          role: user.role
        }
      }
    }

    res.status(200).json(response)
  })

  // 更改用户角色（管理员功能）
  changeUserRole = asyncHandler(async (req: IAuthRequest, res: Response) => {
    if (!req.user || req.user.role !== 'admin') {
      throw new AppError('无权访问', 403)
    }

    const { id } = req.params
    const { role } = req.body

    if (!['user', 'admin', 'moderator'].includes(role)) {
      throw new AppError('无效的角色', 400)
    }

    // 防止管理员修改自己的角色
    if (id === req.user.id) {
      throw new AppError('不能修改自己的角色', 400)
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select('-password')

    if (!user) {
      throw new AppError('用户不存在', 404)
    }

    const response: IApiResponse = {
      success: true,
      message: '用户角色更新成功',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    }

    res.status(200).json(response)
  })
}

export const userController = new UserController()
export default userController