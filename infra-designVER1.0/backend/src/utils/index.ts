import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { IUser } from '@/types'

// 密码相关工具
export class PasswordUtils {
  // 生成盐值和哈希密码
  static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12)
    return bcrypt.hash(password, salt)
  }

  // 验证密码
  static async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword)
  }

  // 生成随机密码
  static generateRandomPassword(length: number = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let password = ''
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    return password
  }

  // 验证密码强度
  static validatePasswordStrength(password: string): {
    isValid: boolean
    score: number
    feedback: string[]
  } {
    const feedback: string[] = []
    let score = 0

    if (password.length < 8) {
      feedback.push('密码长度至少8位')
    } else {
      score += 1
    }

    if (!/[a-z]/.test(password)) {
      feedback.push('密码需要包含小写字母')
    } else {
      score += 1
    }

    if (!/[A-Z]/.test(password)) {
      feedback.push('密码需要包含大写字母')
    } else {
      score += 1
    }

    if (!/\d/.test(password)) {
      feedback.push('密码需要包含数字')
    } else {
      score += 1
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      feedback.push('密码需要包含特殊字符')
    } else {
      score += 1
    }

    return {
      isValid: score >= 4,
      score,
      feedback
    }
  }
}

// JWT工具
export class JWTUtils {
  // 生成访问令牌
  static generateAccessToken(user: IUser): string {
    return jwt.sign(
      {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: process.env.JWT_EXPIRE || '15m',
        issuer: 'trading-agent-platform',
        audience: 'trading-agent-users'
      }
    )
  }

  // 生成刷新令牌
  static generateRefreshToken(user: IUser): string {
    return jwt.sign(
      {
        id: user._id,
        tokenType: 'refresh'
      },
      process.env.JWT_REFRESH_SECRET!,
      {
        expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
        issuer: 'trading-agent-platform',
        audience: 'trading-agent-users'
      }
    )
  }

  // 验证令牌
  static verifyToken(token: string, secret: string): any {
    return jwt.verify(token, secret, {
      issuer: 'trading-agent-platform',
      audience: 'trading-agent-users'
    })
  }

  // 解码令牌（不验证）
  static decodeToken(token: string): any {
    return jwt.decode(token)
  }
}

// 加密工具
export class CryptoUtils {
  // 生成随机字符串
  static generateRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex')
  }

  // 生成UUID
  static generateUUID(): string {
    return crypto.randomUUID()
  }

  // MD5哈希
  static md5Hash(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex')
  }

  // SHA256哈希
  static sha256Hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  // AES加密
  static encrypt(text: string, key: string): string {
    const algorithm = 'aes-256-cbc'
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipher(algorithm, key)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
  }

  // AES解密
  static decrypt(encryptedText: string, key: string): string {
    const algorithm = 'aes-256-cbc'
    const textParts = encryptedText.split(':')
    const iv = Buffer.from(textParts.shift()!, 'hex')
    const encrypted = textParts.join(':')
    const decipher = crypto.createDecipher(algorithm, key)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }
}

// 验证工具
export class ValidationUtils {
  // 验证邮箱
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // 验证用户名
  static isValidUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
    return usernameRegex.test(username)
  }

  // 验证手机号
  static isValidPhone(phone: string): boolean {
    const phoneRegex = /^1[3-9]\d{9}$/
    return phoneRegex.test(phone)
  }

  // 验证URL
  static isValidURL(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  // 验证IP地址
  static isValidIP(ip: string): boolean {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
    return ipRegex.test(ip)
  }

  // 清理HTML标签
  static sanitizeHTML(html: string): string {
    return html.replace(/<[^>]*>/g, '')
  }

  // 验证MongoDB ObjectId
  static isValidObjectId(id: string): boolean {
    const objectIdRegex = /^[0-9a-fA-F]{24}$/
    return objectIdRegex.test(id)
  }
}

// 时间工具
export class DateUtils {
  // 格式化日期
  static formatDate(date: Date, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return format
      .replace('YYYY', year.toString())
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
  }

  // 获取时间差
  static getTimeDifference(date1: Date, date2: Date): {
    days: number
    hours: number
    minutes: number
    seconds: number
  } {
    const diff = Math.abs(date2.getTime() - date1.getTime())
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    return { days, hours, minutes, seconds }
  }

  // 添加时间
  static addTime(date: Date, amount: number, unit: 'days' | 'hours' | 'minutes' | 'seconds'): Date {
    const newDate = new Date(date)
    
    switch (unit) {
      case 'days':
        newDate.setDate(newDate.getDate() + amount)
        break
      case 'hours':
        newDate.setHours(newDate.getHours() + amount)
        break
      case 'minutes':
        newDate.setMinutes(newDate.getMinutes() + amount)
        break
      case 'seconds':
        newDate.setSeconds(newDate.getSeconds() + amount)
        break
    }
    
    return newDate
  }

  // 获取时间戳
  static getTimestamp(): number {
    return Date.now()
  }

  // 判断是否为今天
  static isToday(date: Date): boolean {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }
}

// 数学工具
export class MathUtils {
  // 生成随机数
  static randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  // 生成随机浮点数
  static randomFloat(min: number, max: number, decimals: number = 2): number {
    const random = Math.random() * (max - min) + min
    return Math.round(random * Math.pow(10, decimals)) / Math.pow(10, decimals)
  }

  // 计算百分比
  static percentage(value: number, total: number): number {
    if (total === 0) return 0
    return Math.round((value / total) * 10000) / 100
  }

  // 四舍五入到指定小数位
  static round(value: number, decimals: number = 2): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals)
  }

  // 计算平均值
  static average(numbers: number[]): number {
    if (numbers.length === 0) return 0
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length
  }

  // 计算标准差
  static standardDeviation(numbers: number[]): number {
    if (numbers.length === 0) return 0
    const avg = this.average(numbers)
    const squaredDiffs = numbers.map(num => Math.pow(num - avg, 2))
    return Math.sqrt(this.average(squaredDiffs))
  }

  // 计算最大值
  static max(numbers: number[]): number {
    return Math.max(...numbers)
  }

  // 计算最小值
  static min(numbers: number[]): number {
    return Math.min(...numbers)
  }
}

// 字符串工具
export class StringUtils {
  // 首字母大写
  static capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

  // 驼峰命名转换
  static toCamelCase(str: string): string {
    return str.replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
  }

  // 蛇形命名转换
  static toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '')
  }

  // 短横线命名转换
  static toKebabCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/^-/, '')
  }

  // 截断字符串
  static truncate(str: string, length: number, suffix: string = '...'): string {
    if (str.length <= length) return str
    return str.substring(0, length - suffix.length) + suffix
  }

  // 移除HTML标签
  static stripHTML(html: string): string {
    return html.replace(/<[^>]*>/g, '')
  }

  // 生成slug
  static generateSlug(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }
}

// 数组工具
export class ArrayUtils {
  // 数组去重
  static unique<T>(array: T[]): T[] {
    return [...new Set(array)]
  }

  // 数组分块
  static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  // 数组随机排序
  static shuffle<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // 数组分页
  static paginate<T>(array: T[], page: number, limit: number): {
    data: T[]
    pagination: {
      page: number
      limit: number
      total: number
      pages: number
    }
  } {
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const data = array.slice(startIndex, endIndex)
    
    return {
      data,
      pagination: {
        page,
        limit,
        total: array.length,
        pages: Math.ceil(array.length / limit)
      }
    }
  }
}

// 对象工具
export class ObjectUtils {
  // 深拷贝
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }

  // 对象合并
  static merge<T extends object>(target: T, ...sources: Partial<T>[]): T {
    return Object.assign({}, target, ...sources)
  }

  // 获取嵌套属性
  static get(obj: any, path: string, defaultValue?: any): any {
    const keys = path.split('.')
    let result = obj
    
    for (const key of keys) {
      if (result == null || typeof result !== 'object') {
        return defaultValue
      }
      result = result[key]
    }
    
    return result !== undefined ? result : defaultValue
  }

  // 设置嵌套属性
  static set(obj: any, path: string, value: any): void {
    const keys = path.split('.')
    let current = obj
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {}
      }
      current = current[key]
    }
    
    current[keys[keys.length - 1]] = value
  }

  // 移除空值
  static removeEmpty(obj: any): any {
    const cleaned: any = {}
    
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'object' && !Array.isArray(value)) {
          const cleanedNested = this.removeEmpty(value)
          if (Object.keys(cleanedNested).length > 0) {
            cleaned[key] = cleanedNested
          }
        } else {
          cleaned[key] = value
        }
      }
    }
    
    return cleaned
  }
}

// 文件工具
export class FileUtils {
  // 获取文件扩展名
  static getExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || ''
  }

  // 获取文件名（不含扩展名）
  static getBasename(filename: string): string {
    return filename.split('.').slice(0, -1).join('.')
  }

  // 格式化文件大小
  static formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return '0 Bytes'
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  // 验证文件类型
  static isValidFileType(filename: string, allowedTypes: string[]): boolean {
    const extension = this.getExtension(filename)
    return allowedTypes.includes(extension)
  }
}

// 导出所有工具类
export default {
  PasswordUtils,
  JWTUtils,
  CryptoUtils,
  ValidationUtils,
  DateUtils,
  MathUtils,
  StringUtils,
  ArrayUtils,
  ObjectUtils,
  FileUtils
}