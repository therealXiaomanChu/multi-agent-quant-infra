import mongoose, { Schema } from 'mongoose'
import { IReview } from '@/types'

const reviewSchema = new Schema<IReview>({
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
  rating: {
    type: Number,
    required: [true, '评分是必需的'],
    min: [1, '评分不能低于1星'],
    max: [5, '评分不能超过5星']
  },
  title: {
    type: String,
    required: [true, '评价标题是必需的'],
    trim: true,
    minlength: [5, '评价标题至少需要5个字符'],
    maxlength: [200, '评价标题不能超过200个字符']
  },
  content: {
    type: String,
    required: [true, '评价内容是必需的'],
    trim: true,
    minlength: [10, '评价内容至少需要10个字符'],
    maxlength: [2000, '评价内容不能超过2000个字符']
  },
  // 详细评分
  detailedRating: {
    performance: {
      type: Number,
      min: [1, '性能评分不能低于1星'],
      max: [5, '性能评分不能超过5星']
    },
    stability: {
      type: Number,
      min: [1, '稳定性评分不能低于1星'],
      max: [5, '稳定性评分不能超过5星']
    },
    profitability: {
      type: Number,
      min: [1, '盈利能力评分不能低于1星'],
      max: [5, '盈利能力评分不能超过5星']
    },
    riskManagement: {
      type: Number,
      min: [1, '风险管理评分不能低于1星'],
      max: [5, '风险管理评分不能超过5星']
    },
    easeOfUse: {
      type: Number,
      min: [1, '易用性评分不能低于1星'],
      max: [5, '易用性评分不能超过5星']
    }
  },
  // 使用体验
  experience: {
    usageDuration: {
      type: String,
      enum: ['less_than_week', 'week_to_month', 'month_to_quarter', 'quarter_to_year', 'more_than_year']
    },
    tradingStyle: {
      type: String,
      enum: ['conservative', 'moderate', 'aggressive', 'mixed']
    },
    marketConditions: {
      type: String,
      enum: ['bull', 'bear', 'sideways', 'volatile', 'mixed']
    },
    profitLoss: {
      type: String,
      enum: ['significant_profit', 'moderate_profit', 'break_even', 'moderate_loss', 'significant_loss']
    }
  },
  // 优缺点
  pros: [{
    type: String,
    trim: true,
    maxlength: [200, '优点描述不能超过200个字符']
  }],
  cons: [{
    type: String,
    trim: true,
    maxlength: [200, '缺点描述不能超过200个字符']
  }],
  // 推荐度
  recommendation: {
    wouldRecommend: {
      type: Boolean,
      required: true
    },
    targetAudience: [{
      type: String,
      enum: ['beginners', 'intermediate', 'advanced', 'professionals', 'institutions']
    }]
  },
  // 验证信息
  verification: {
    isVerified: {
      type: Boolean,
      default: false
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    verificationDate: {
      type: Date
    },
    verificationNote: {
      type: String,
      trim: true
    }
  },
  // 状态
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'hidden'],
    default: 'pending'
  },
  // 互动统计
  stats: {
    helpfulVotes: {
      type: Number,
      default: 0,
      min: [0, '有用投票数不能为负数']
    },
    unhelpfulVotes: {
      type: Number,
      default: 0,
      min: [0, '无用投票数不能为负数']
    },
    reportCount: {
      type: Number,
      default: 0,
      min: [0, '举报次数不能为负数']
    },
    views: {
      type: Number,
      default: 0,
      min: [0, '查看次数不能为负数']
    }
  },
  // 回复
  replies: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [1000, '回复内容不能超过1000个字符']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isAuthorReply: {
      type: Boolean,
      default: false
    }
  }],
  // 标签
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, '标签不能超过30个字符']
  }],
  // 语言
  language: {
    type: String,
    default: 'zh-CN'
  },
  // 是否匿名
  isAnonymous: {
    type: Boolean,
    default: false
  },
  // 编辑历史
  editHistory: [{
    editedAt: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      trim: true
    },
    changes: {
      type: Schema.Types.Mixed
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
})

// 复合索引
reviewSchema.index({ agent: 1, user: 1 }, { unique: true }) // 每个用户对每个代理只能评价一次
reviewSchema.index({ agent: 1, createdAt: -1 })
reviewSchema.index({ user: 1, createdAt: -1 })
reviewSchema.index({ rating: -1 })
reviewSchema.index({ status: 1 })
reviewSchema.index({ 'verification.isVerified': 1 })
reviewSchema.index({ 'stats.helpfulVotes': -1 })
reviewSchema.index({ title: 'text', content: 'text' })

// 虚拟字段
reviewSchema.virtual('helpfulnessRatio').get(function() {
  const total = this.stats.helpfulVotes + this.stats.unhelpfulVotes
  return total > 0 ? this.stats.helpfulVotes / total : 0
})

reviewSchema.virtual('isHelpful').get(function() {
  return this.helpfulnessRatio > 0.6 && this.stats.helpfulVotes >= 3
})

reviewSchema.virtual('averageDetailedRating').get(function() {
  if (!this.detailedRating) return this.rating
  
  const ratings = Object.values(this.detailedRating).filter(r => typeof r === 'number')
  return ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : this.rating
})

reviewSchema.virtual('replyCount').get(function() {
  return this.replies ? this.replies.length : 0
})

reviewSchema.virtual('hasAuthorReply').get(function() {
  return this.replies ? this.replies.some(reply => reply.isAuthorReply) : false
})

// 静态方法
reviewSchema.statics.getReviewsByAgent = function(agentId: string, options: any = {}) {
  const { limit = 20, skip = 0, rating, status = 'approved', sortBy = 'createdAt' } = options
  
  const query: any = { agent: agentId, status }
  if (rating) query.rating = rating
  
  const sortOptions: any = {}
  switch (sortBy) {
    case 'rating':
      sortOptions.rating = -1
      break
    case 'helpful':
      sortOptions['stats.helpfulVotes'] = -1
      break
    case 'newest':
      sortOptions.createdAt = -1
      break
    case 'oldest':
      sortOptions.createdAt = 1
      break
    default:
      sortOptions.createdAt = -1
  }
  
  return this.find(query)
    .populate('user', 'username avatar')
    .sort(sortOptions)
    .limit(limit)
    .skip(skip)
}

reviewSchema.statics.getReviewStats = async function(agentId: string) {
  const stats = await this.aggregate([
    { $match: { agent: new mongoose.Types.ObjectId(agentId), status: 'approved' } },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        averageRating: { $avg: '$rating' },
        ratingDistribution: {
          $push: '$rating'
        },
        totalHelpfulVotes: { $sum: '$stats.helpfulVotes' },
        verifiedReviews: {
          $sum: { $cond: ['$verification.isVerified', 1, 0] }
        }
      }
    },
    {
      $addFields: {
        ratingCounts: {
          $reduce: {
            input: [1, 2, 3, 4, 5],
            initialValue: {},
            in: {
              $mergeObjects: [
                '$$value',
                {
                  $arrayToObject: [[
                    {
                      k: { $toString: '$$this' },
                      v: {
                        $size: {
                          $filter: {
                            input: '$ratingDistribution',
                            cond: { $eq: ['$$item', '$$this'] }
                          }
                        }
                      }
                    }
                  ]]
                }
              ]
            }
          }
        }
      }
    }
  ])
  
  if (stats.length === 0) {
    return {
      totalReviews: 0,
      averageRating: 0,
      ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      totalHelpfulVotes: 0,
      verifiedReviews: 0
    }
  }
  
  return stats[0]
}

reviewSchema.statics.getTopReviews = function(agentId: string, limit = 5) {
  return this.find({
    agent: agentId,
    status: 'approved',
    'stats.helpfulVotes': { $gte: 3 }
  })
  .populate('user', 'username avatar')
  .sort({ 'stats.helpfulVotes': -1, createdAt: -1 })
  .limit(limit)
}

// 实例方法
reviewSchema.methods.addReply = async function(userId: string, content: string, isAuthorReply = false) {
  this.replies.push({
    user: userId,
    content,
    isAuthorReply,
    createdAt: new Date()
  })
  
  return this.save()
}

reviewSchema.methods.voteHelpful = async function(isHelpful: boolean) {
  if (isHelpful) {
    this.stats.helpfulVotes += 1
  } else {
    this.stats.unhelpfulVotes += 1
  }
  
  return this.save()
}

reviewSchema.methods.report = async function(reason?: string) {
  this.stats.reportCount += 1
  
  // 如果举报次数过多，自动隐藏
  if (this.stats.reportCount >= 5) {
    this.status = 'hidden'
  }
  
  return this.save()
}

reviewSchema.methods.verify = async function(verifierId: string, note?: string) {
  this.verification.isVerified = true
  this.verification.verifiedBy = verifierId
  this.verification.verificationDate = new Date()
  if (note) this.verification.verificationNote = note
  
  return this.save()
}

reviewSchema.methods.edit = async function(updates: any, reason?: string) {
  // 记录编辑历史
  const changes: any = {}
  
  if (updates.title && updates.title !== this.title) {
    changes.title = { from: this.title, to: updates.title }
    this.title = updates.title
  }
  
  if (updates.content && updates.content !== this.content) {
    changes.content = { from: this.content, to: updates.content }
    this.content = updates.content
  }
  
  if (updates.rating && updates.rating !== this.rating) {
    changes.rating = { from: this.rating, to: updates.rating }
    this.rating = updates.rating
  }
  
  if (Object.keys(changes).length > 0) {
    this.editHistory.push({
      editedAt: new Date(),
      reason: reason || '用户编辑',
      changes
    })
  }
  
  return this.save()
}

reviewSchema.methods.approve = async function() {
  this.status = 'approved'
  return this.save()
}

reviewSchema.methods.reject = async function(reason?: string) {
  this.status = 'rejected'
  if (reason) {
    this.editHistory.push({
      editedAt: new Date(),
      reason: `拒绝原因: ${reason}`,
      changes: { status: { from: 'pending', to: 'rejected' } }
    })
  }
  return this.save()
}

reviewSchema.methods.hide = async function(reason?: string) {
  this.status = 'hidden'
  if (reason) {
    this.editHistory.push({
      editedAt: new Date(),
      reason: `隐藏原因: ${reason}`,
      changes: { status: { from: this.status, to: 'hidden' } }
    })
  }
  return this.save()
}

export const Review = mongoose.model<IReview>('Review', reviewSchema)
export default Review