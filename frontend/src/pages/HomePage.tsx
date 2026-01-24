import { 
  ChartBarIcon, 
  CpuChipIcon, 
  FireIcon, 
  TrophyIcon,
  ArrowTrendingUpIcon,
  UsersIcon
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// 模拟数据
const stats = [
  {
    name: '活跃代理',
    value: '1,234',
    change: '+12%',
    changeType: 'positive' as const,
    icon: CpuChipIcon,
  },
  {
    name: '总交易量',
    value: '¥8.9M',
    change: '+18%',
    changeType: 'positive' as const,
    icon: ChartBarIcon,
  },
  {
    name: '今日PK',
    value: '89',
    change: '+5%',
    changeType: 'positive' as const,
    icon: FireIcon,
  },
  {
    name: '注册用户',
    value: '5,678',
    change: '+23%',
    changeType: 'positive' as const,
    icon: UsersIcon,
  },
]

const marketData = [
  { time: '09:00', value: 100 },
  { time: '10:00', value: 105 },
  { time: '11:00', value: 103 },
  { time: '12:00', value: 108 },
  { time: '13:00', value: 112 },
  { time: '14:00', value: 110 },
  { time: '15:00', value: 115 },
  { time: '16:00', value: 118 },
]

const topAgents = [
  { id: 1, name: 'AlphaBot Pro', author: 'TradeMaster', profit: '+24.5%', trades: 156 },
  { id: 2, name: 'Quantum Trader', author: 'AIExpert', profit: '+19.8%', trades: 203 },
  { id: 3, name: 'Neural Network V2', author: 'DeepTrade', profit: '+18.2%', trades: 89 },
  { id: 4, name: 'Momentum Hunter', author: 'SpeedTrader', profit: '+16.7%', trades: 134 },
  { id: 5, name: 'Risk Manager', author: 'SafeBot', profit: '+15.3%', trades: 267 },
]

const recentBattles = [
  {
    id: 1,
    agent1: 'AlphaBot Pro',
    agent2: 'Quantum Trader',
    winner: 'AlphaBot Pro',
    profit1: '+2.3%',
    profit2: '+1.8%',
    time: '2小时前'
  },
  {
    id: 2,
    agent1: 'Neural Network V2',
    agent2: 'Momentum Hunter',
    winner: 'Neural Network V2',
    profit1: '+1.9%',
    profit2: '+1.2%',
    time: '4小时前'
  },
  {
    id: 3,
    agent1: 'Risk Manager',
    agent2: 'Speed Demon',
    winner: 'Risk Manager',
    profit1: '+1.5%',
    profit2: '-0.3%',
    time: '6小时前'
  },
]

export function HomePage() {
  return (
    <div className="space-y-8">
      {/* 欢迎横幅 */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-8 text-white">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold mb-4">
            欢迎来到 Trading Agent Platform
          </h1>
          <p className="text-xl opacity-90 mb-6">
            构建、测试和对比您的交易代理，与全球顶尖策略一较高下
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/agents/create"
              className="bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              创建代理
            </Link>
            <Link
              to="/battle"
              className="border-2 border-white text-white px-6 py-3 rounded-lg font-semibold hover:bg-white hover:text-blue-600 transition-colors"
            >
              观看对战
            </Link>
          </div>
        </div>
      </div>

      {/* 统计数据 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.name} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-full">
                  <Icon className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center">
                <ArrowTrendingUpIcon className="h-4 w-4 text-green-500 mr-1" />
                <span className="text-sm font-medium text-green-600">{stat.change}</span>
                <span className="text-sm text-gray-500 ml-2">vs 上周</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 市场趋势图 */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">市场趋势</h2>
              <select className="text-sm border border-gray-300 rounded-md px-3 py-1">
                <option>今日</option>
                <option>本周</option>
                <option>本月</option>
              </select>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={marketData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 排行榜 */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">今日排行榜</h2>
            <Link to="/leaderboard" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              查看全部
            </Link>
          </div>
          <div className="space-y-4">
            {topAgents.map((agent, index) => (
              <div key={agent.id} className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-800' :
                    index === 1 ? 'bg-gray-100 text-gray-800' :
                    index === 2 ? 'bg-orange-100 text-orange-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {index + 1}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {agent.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    by {agent.author}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-green-600">
                    {agent.profit}
                  </p>
                  <p className="text-xs text-gray-500">
                    {agent.trades} 笔
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 最近对战 */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">最近对战</h2>
          <Link to="/battle" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
            查看更多
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-900">对战双方</th>
                <th className="text-left py-3 px-4 font-medium text-gray-900">收益率</th>
                <th className="text-left py-3 px-4 font-medium text-gray-900">获胜者</th>
                <th className="text-left py-3 px-4 font-medium text-gray-900">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {recentBattles.map((battle) => (
                <tr key={battle.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="text-sm">
                      <span className="font-medium">{battle.agent1}</span>
                      <span className="text-gray-500 mx-2">vs</span>
                      <span className="font-medium">{battle.agent2}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm">
                      <span className="text-green-600">{battle.profit1}</span>
                      <span className="text-gray-500 mx-2">|</span>
                      <span className={battle.profit2.startsWith('+') ? 'text-green-600' : 'text-red-600'}>
                        {battle.profit2}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center">
                      <TrophyIcon className="h-4 w-4 text-yellow-500 mr-1" />
                      <span className="text-sm font-medium">{battle.winner}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500">
                    {battle.time}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}