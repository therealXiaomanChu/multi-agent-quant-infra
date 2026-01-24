import { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  PlusIcon, 
  MagnifyingGlassIcon,
  FunnelIcon,
  ChartBarIcon,
  CpuChipIcon,
  StarIcon
} from '@heroicons/react/24/outline'

// 模拟数据
const agents = [
  {
    id: 1,
    name: 'AlphaBot Pro',
    description: '基于深度学习的量化交易策略，专注于趋势跟踪和风险控制',
    author: 'TradeMaster',
    avatar: 'https://ui-avatars.com/api/?name=TradeMaster&background=3b82f6&color=fff',
    tags: ['深度学习', '趋势跟踪', '风险控制'],
    stats: {
      profit: '+24.5%',
      trades: 156,
      winRate: '78%',
      maxDrawdown: '-5.2%'
    },
    rating: 4.8,
    reviews: 23,
    isPublic: true,
    createdAt: '2024-01-15'
  },
  {
    id: 2,
    name: 'Quantum Trader',
    description: '量子计算启发的交易算法，适用于高频交易场景',
    author: 'AIExpert',
    avatar: 'https://ui-avatars.com/api/?name=AIExpert&background=10b981&color=fff',
    tags: ['高频交易', '量子算法', '套利'],
    stats: {
      profit: '+19.8%',
      trades: 203,
      winRate: '72%',
      maxDrawdown: '-3.8%'
    },
    rating: 4.6,
    reviews: 18,
    isPublic: true,
    createdAt: '2024-01-20'
  },
  {
    id: 3,
    name: 'Neural Network V2',
    description: '多层神经网络模型，结合技术分析和基本面分析',
    author: 'DeepTrade',
    avatar: 'https://ui-avatars.com/api/?name=DeepTrade&background=f59e0b&color=fff',
    tags: ['神经网络', '技术分析', '基本面'],
    stats: {
      profit: '+18.2%',
      trades: 89,
      winRate: '81%',
      maxDrawdown: '-4.1%'
    },
    rating: 4.7,
    reviews: 31,
    isPublic: true,
    createdAt: '2024-02-01'
  },
  {
    id: 4,
    name: 'Momentum Hunter',
    description: '动量策略专家，捕捉市场短期价格动量',
    author: 'SpeedTrader',
    avatar: 'https://ui-avatars.com/api/?name=SpeedTrader&background=ef4444&color=fff',
    tags: ['动量策略', '短线交易', '技术指标'],
    stats: {
      profit: '+16.7%',
      trades: 134,
      winRate: '69%',
      maxDrawdown: '-6.3%'
    },
    rating: 4.4,
    reviews: 15,
    isPublic: true,
    createdAt: '2024-02-10'
  },
  {
    id: 5,
    name: 'Risk Manager',
    description: '专注风险管理的保守型策略，稳定收益为主',
    author: 'SafeBot',
    avatar: 'https://ui-avatars.com/api/?name=SafeBot&background=8b5cf6&color=fff',
    tags: ['风险管理', '稳健收益', '资金管理'],
    stats: {
      profit: '+15.3%',
      trades: 267,
      winRate: '85%',
      maxDrawdown: '-2.1%'
    },
    rating: 4.9,
    reviews: 42,
    isPublic: true,
    createdAt: '2024-02-15'
  },
]

const categories = [
  { name: '全部', count: 156 },
  { name: '深度学习', count: 23 },
  { name: '高频交易', count: 18 },
  { name: '趋势跟踪', count: 34 },
  { name: '套利策略', count: 12 },
  { name: '风险管理', count: 28 },
]

export function AgentsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [sortBy, setSortBy] = useState('profit')

  return (
    <div className="space-y-6">
      {/* 页面标题和操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">交易代理</h1>
          <p className="mt-1 text-sm text-gray-500">
            浏览和管理您的交易代理，发现优秀的策略
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            to="/agents/create"
            className="btn btn-primary inline-flex items-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            创建代理
          </Link>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          {/* 搜索框 */}
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="搜索代理名称、作者或标签..."
                className="input pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* 筛选和排序 */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FunnelIcon className="h-5 w-5 text-gray-400" />
              <select
                className="text-sm border border-gray-300 rounded-md px-3 py-2"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map((category) => (
                  <option key={category.name} value={category.name}>
                    {category.name} ({category.count})
                  </option>
                ))}
              </select>
            </div>
            
            <select
              className="text-sm border border-gray-300 rounded-md px-3 py-2"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="profit">按收益率排序</option>
              <option value="rating">按评分排序</option>
              <option value="trades">按交易次数排序</option>
              <option value="created">按创建时间排序</option>
            </select>
          </div>
        </div>
      </div>

      {/* 代理列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {agents.map((agent) => (
          <div key={agent.id} className="card hover:shadow-md transition-shadow">
            {/* 代理头部 */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <img
                  src={agent.avatar}
                  alt={agent.author}
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                  <p className="text-sm text-gray-500">by {agent.author}</p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <StarIcon className="h-4 w-4 text-yellow-400 fill-current" />
                <span className="text-sm font-medium">{agent.rating}</span>
                <span className="text-sm text-gray-500">({agent.reviews})</span>
              </div>
            </div>

            {/* 代理描述 */}
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
              {agent.description}
            </p>

            {/* 标签 */}
            <div className="flex flex-wrap gap-2 mb-4">
              {agent.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* 统计数据 */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <p className="text-lg font-bold text-green-600">{agent.stats.profit}</p>
                <p className="text-xs text-gray-500">总收益</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{agent.stats.winRate}</p>
                <p className="text-xs text-gray-500">胜率</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">{agent.stats.trades}</p>
                <p className="text-xs text-gray-500">交易次数</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-red-600">{agent.stats.maxDrawdown}</p>
                <p className="text-xs text-gray-500">最大回撤</p>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex space-x-2">
              <Link
                to={`/agents/${agent.id}`}
                className="btn btn-primary flex-1 text-center"
              >
                查看详情
              </Link>
              <button className="btn btn-secondary px-3">
                <ChartBarIcon className="h-4 w-4" />
              </button>
              <button className="btn btn-secondary px-3">
                <CpuChipIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 加载更多 */}
      <div className="text-center">
        <button className="btn btn-secondary">
          加载更多代理
        </button>
      </div>
    </div>
  )
}