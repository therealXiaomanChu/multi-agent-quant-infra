// 统一导出所有数据模型
export { default as User } from './User'
export { default as Agent } from './Agent'
export { default as Trade } from './Trade'
export { default as Battle } from './Battle'
export { default as Backtest } from './Backtest'
export { default as Review } from './Review'

// 重新导出类型定义
export * from '@/types'

// 模型初始化函数
export const initializeModels = () => {
  // 这里可以添加模型初始化逻辑
  // 比如创建默认索引、初始数据等
  console.log('数据模型已初始化')
}

// 模型列表（用于批量操作）
export const models = {
  User: require('./User').default,
  Agent: require('./Agent').default,
  Trade: require('./Trade').default,
  Battle: require('./Battle').default,
  Backtest: require('./Backtest').default,
  Review: require('./Review').default
}

// 获取所有模型名称
export const getModelNames = (): string[] => {
  return Object.keys(models)
}

// 根据名称获取模型
export const getModel = (name: string) => {
  return models[name as keyof typeof models]
}

// 清理所有集合（仅用于测试环境）
export const clearAllCollections = async () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('清理集合操作仅允许在测试环境中执行')
  }
  
  const promises = Object.values(models).map(model => {
    return model.deleteMany({})
  })
  
  await Promise.all(promises)
  console.log('所有集合已清理')
}

// 创建索引（用于生产环境优化）
export const createIndexes = async () => {
  const promises = Object.values(models).map(model => {
    return model.createIndexes()
  })
  
  await Promise.all(promises)
  console.log('所有索引已创建')
}