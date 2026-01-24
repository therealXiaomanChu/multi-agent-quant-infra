import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/trading_agent'

export const connectDatabase = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      // 移除已弃用的选项
    })

    console.log(`MongoDB连接成功: ${conn.connection.host}`)

    // 监听连接事件
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB连接错误:', err)
    })

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB连接断开')
    })

    // 优雅关闭
    process.on('SIGINT', async () => {
      await mongoose.connection.close()
      console.log('MongoDB连接已关闭')
      process.exit(0)
    })

  } catch (error) {
    console.error('MongoDB连接失败:', error)
    process.exit(1)
  }
}

export default mongoose