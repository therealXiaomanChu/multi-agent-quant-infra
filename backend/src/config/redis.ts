import { createClient } from 'redis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// 创建Redis客户端
export const redisClient = createClient({
  url: REDIS_URL,
  retry_delay_on_failure: 100,
  max_attempts: 3
})

// 连接Redis
export const connectRedis = async (): Promise<void> => {
  try {
    await redisClient.connect()
    console.log('Redis连接成功')

    // 监听错误事件
    redisClient.on('error', (err) => {
      console.error('Redis错误:', err)
    })

    redisClient.on('connect', () => {
      console.log('Redis重新连接成功')
    })

    redisClient.on('disconnect', () => {
      console.log('Redis连接断开')
    })

  } catch (error) {
    console.error('Redis连接失败:', error)
    throw error
  }
}

// Redis工具函数
export class RedisService {
  // 设置缓存
  static async set(key: string, value: any, expireInSeconds?: number): Promise<void> {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
      if (expireInSeconds) {
        await redisClient.setEx(key, expireInSeconds, stringValue)
      } else {
        await redisClient.set(key, stringValue)
      }
    } catch (error) {
      console.error('Redis设置失败:', error)
      throw error
    }
  }

  // 获取缓存
  static async get(key: string): Promise<any> {
    try {
      const value = await redisClient.get(key)
      if (!value) return null
      
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    } catch (error) {
      console.error('Redis获取失败:', error)
      throw error
    }
  }

  // 删除缓存
  static async del(key: string): Promise<void> {
    try {
      await redisClient.del(key)
    } catch (error) {
      console.error('Redis删除失败:', error)
      throw error
    }
  }

  // 检查键是否存在
  static async exists(key: string): Promise<boolean> {
    try {
      const result = await redisClient.exists(key)
      return result === 1
    } catch (error) {
      console.error('Redis检查存在失败:', error)
      throw error
    }
  }

  // 设置过期时间
  static async expire(key: string, seconds: number): Promise<void> {
    try {
      await redisClient.expire(key, seconds)
    } catch (error) {
      console.error('Redis设置过期时间失败:', error)
      throw error
    }
  }

  // 获取所有匹配的键
  static async keys(pattern: string): Promise<string[]> {
    try {
      return await redisClient.keys(pattern)
    } catch (error) {
      console.error('Redis获取键失败:', error)
      throw error
    }
  }

  // 哈希操作
  static async hSet(key: string, field: string, value: any): Promise<void> {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
      await redisClient.hSet(key, field, stringValue)
    } catch (error) {
      console.error('Redis哈希设置失败:', error)
      throw error
    }
  }

  static async hGet(key: string, field: string): Promise<any> {
    try {
      const value = await redisClient.hGet(key, field)
      if (!value) return null
      
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    } catch (error) {
      console.error('Redis哈希获取失败:', error)
      throw error
    }
  }

  static async hGetAll(key: string): Promise<Record<string, any>> {
    try {
      const hash = await redisClient.hGetAll(key)
      const result: Record<string, any> = {}
      
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value)
        } catch {
          result[field] = value
        }
      }
      
      return result
    } catch (error) {
      console.error('Redis哈希获取全部失败:', error)
      throw error
    }
  }

  // 列表操作
  static async lPush(key: string, ...values: any[]): Promise<void> {
    try {
      const stringValues = values.map(v => typeof v === 'string' ? v : JSON.stringify(v))
      await redisClient.lPush(key, stringValues)
    } catch (error) {
      console.error('Redis列表推入失败:', error)
      throw error
    }
  }

  static async lRange(key: string, start: number, stop: number): Promise<any[]> {
    try {
      const values = await redisClient.lRange(key, start, stop)
      return values.map(v => {
        try {
          return JSON.parse(v)
        } catch {
          return v
        }
      })
    } catch (error) {
      console.error('Redis列表范围获取失败:', error)
      throw error
    }
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  await redisClient.quit()
  console.log('Redis连接已关闭')
})

export default redisClient