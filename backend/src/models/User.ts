import mongoose, { Schema } from 'mongoose'
import bcrypt from 'bcryptjs'
import { IUser } from '@/types'

const userSchema = new Schema<IUser>({
  username: {
    type: String,
    required: [true, '用户名是必需的'],
    unique: true,
    trim: true,
    minlength: [3, '用户名至少需要3个字符'],
    maxlength: [30, '用户名不能超过30个字符'],
    match: [/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线']
  },
  email: {
    type: String,
    required: [true, '邮箱是必需的'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, '请输入有效的邮箱地址']
  },
  password: {
    type: String,
    required: [true, '密码是必需的'],
    minlength: [6, '密码至少需要6个字符'],
    select: false // 默认不返回密码字段
  },
  avatar: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, '名字不能超过50个字符']
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, '姓氏不能超过50个字符']
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, '个人简介不能超过500个字符']
    },
    location: {
      type: String,
      trim: true,
      maxlength: [100, '位置不能超过100个字符']
    },
    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\/.+/, '请输入有效的网站URL']
    }
  },
  stats: {
    totalAgents: {
      type: Number,
      default: 0,
      min: 0
    },
    totalTrades: {
      type: Number,
      default: 0,
      min: 0
    },
    totalProfit: {
      type: Number,
      default: 0
    },
    winRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password
      return ret
    }
  },
  toObject: {
    transform: function(doc, ret) {
      delete ret.password
      return ret
    }
  }
})

// 索引
userSchema.index({ email: 1 })
userSchema.index({ username: 1 })
userSchema.index({ createdAt: -1 })
userSchema.index({ 'stats.totalProfit': -1 })

// 密码加密中间件
userSchema.pre('save', async function(next) {
  // 只有密码被修改时才加密
  if (!this.isModified('password')) return next()
  
  try {
    // 生成盐值并加密密码
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error as Error)
  }
})

// 密码比较方法
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password)
  } catch (error) {
    throw new Error('密码比较失败')
  }
}

// 虚拟字段：全名
userSchema.virtual('fullName').get(function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`
  }
  return this.username
})

// 虚拟字段：头像URL
userSchema.virtual('avatarUrl').get(function() {
  if (this.avatar) {
    return this.avatar
  }
  // 使用用户名生成默认头像
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.username)}&background=3b82f6&color=fff&size=128`
})

// 静态方法：根据邮箱或用户名查找用户
userSchema.statics.findByEmailOrUsername = function(identifier: string) {
  return this.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier }
    ]
  })
}

// 静态方法：获取用户统计信息
userSchema.statics.getUserStats = async function(userId: string) {
  const user = await this.findById(userId)
  if (!user) throw new Error('用户不存在')
  
  // 这里可以添加更复杂的统计逻辑
  return user.stats
}

// 实例方法：更新用户统计
userSchema.methods.updateStats = async function() {
  // 这里需要根据实际的Agent和Trade模型来计算统计数据
  // 暂时保留接口，后续实现
  console.log('更新用户统计数据:', this._id)
}

// 实例方法：检查用户权限
userSchema.methods.hasPermission = function(permission: string): boolean {
  if (this.role === 'admin') return true
  
  // 根据需要添加更细粒度的权限控制
  const userPermissions = {
    'create_agent': true,
    'edit_own_agent': true,
    'delete_own_agent': true,
    'participate_battle': true,
    'create_review': true
  }
  
  return userPermissions[permission as keyof typeof userPermissions] || false
}

// 导出模型
export const User = mongoose.model<IUser>('User', userSchema)
export default User