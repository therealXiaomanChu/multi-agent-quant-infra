import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, TrendingUp, TrendingDown, Activity, DollarSign, Target } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface BattleStats {
  agentId: string;
  agentName: string;
  totalReturn: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalTrades: number;
  avgTradeReturn: number;
  volatility: number;
  currentEquity: number;
  rank: number;
}

interface BattleData {
  battleId: string;
  name: string;
  status: 'upcoming' | 'active' | 'completed';
  startTime: string;
  endTime: string;
  participants: any[];
  liveStats?: BattleStats[];
}

interface EquityPoint {
  timestamp: string;
  [agentId: string]: number | string;
}

interface TradeEvent {
  agentId: string;
  agentName: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  profit: number;
  timestamp: string;
}

interface BattleVisualizationProps {
  battle: BattleData;
}

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00',
  '#ff00ff', '#00ffff', '#ff0000', '#0000ff', '#ffff00'
];

const BattleVisualization: React.FC<BattleVisualizationProps> = ({ battle }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [liveStats, setLiveStats] = useState<BattleStats[]>(battle.liveStats || []);
  const [equityHistory, setEquityHistory] = useState<EquityPoint[]>([]);
  const [recentTrades, setRecentTrades] = useState<TradeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (battle.status === 'active') {
      // 连接WebSocket
      const newSocket = io(process.env.REACT_APP_WS_URL || 'http://localhost:3001', {
        transports: ['websocket']
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
        // 加入对战房间
        newSocket.emit('join_battle_room', battle.battleId);
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
      });

      // 监听对战更新事件
      newSocket.on('battle:rankings_updated', (data) => {
        if (data.battleId === battle.battleId) {
          setLiveStats(data.rankings);
        }
      });

      newSocket.on('battle:trade_executed', (data) => {
        if (data.battleId === battle.battleId) {
          // 添加新交易到历史记录
          const newTrade: TradeEvent = {
            agentId: data.agentId,
            agentName: data.agentName || `Agent ${data.agentId.slice(-6)}`,
            symbol: data.trade.symbol,
            side: data.trade.side,
            quantity: data.trade.quantity,
            price: data.trade.price,
            profit: data.trade.profit,
            timestamp: data.trade.timestamp
          };
          
          setRecentTrades(prev => [newTrade, ...prev.slice(0, 49)]); // 保留最近50笔交易

          // 更新权益曲线
          const newEquityPoint: EquityPoint = {
            timestamp: new Date(data.trade.timestamp).toLocaleTimeString(),
            [data.agentId]: data.newEquity
          };
          
          setEquityHistory(prev => {
            const updated = [...prev];
            const lastPoint = updated[updated.length - 1];
            
            if (lastPoint) {
              // 更新最后一个点的数据
              updated[updated.length - 1] = {
                ...lastPoint,
                [data.agentId]: data.newEquity
              };
            } else {
              updated.push(newEquityPoint);
            }
            
            return updated.slice(-100); // 保留最近100个数据点
          });
        }
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    }
  }, [battle.battleId, battle.status]);

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return 'text-yellow-500';
      case 2: return 'text-gray-400';
      case 3: return 'text-amber-600';
      default: return 'text-gray-600';
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank <= 3) {
      return <Trophy className={`w-4 h-4 ${getRankColor(rank)}`} />;
    }
    return <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">{rank}</span>;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  if (battle.status !== 'active' && battle.status !== 'completed') {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>对战尚未开始，暂无可视化数据</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 连接状态指示器 */}
      {battle.status === 'active' && (
        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">
              {isConnected ? '实时数据连接正常' : '连接中断，尝试重连...'}
            </span>
          </div>
          <Badge variant={battle.status === 'active' ? 'default' : 'secondary'}>
            {battle.status === 'active' ? '进行中' : '已结束'}
          </Badge>
        </div>
      )}

      <Tabs defaultValue="leaderboard" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="leaderboard">排行榜</TabsTrigger>
          <TabsTrigger value="equity">权益曲线</TabsTrigger>
          <TabsTrigger value="trades">交易记录</TabsTrigger>
          <TabsTrigger value="analytics">数据分析</TabsTrigger>
        </TabsList>

        {/* 排行榜 */}
        <TabsContent value="leaderboard" className="space-y-4">
          <div className="grid gap-4">
            {liveStats.map((stat, index) => (
              <Card key={stat.agentId} className={`transition-all duration-300 ${stat.rank <= 3 ? 'ring-2 ring-yellow-200' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getRankIcon(stat.rank)}
                      <Avatar className="w-10 h-10">
                        <AvatarFallback>{stat.agentName?.slice(0, 2) || 'AG'}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-semibold">{stat.agentName || `Agent ${stat.agentId.slice(-6)}`}</h3>
                        <p className="text-sm text-gray-500">#{stat.rank}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-sm text-gray-500">总收益率</p>
                        <p className={`font-bold ${stat.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatPercentage(stat.totalReturn)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">当前权益</p>
                        <p className="font-bold">{formatCurrency(stat.currentEquity)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">胜率</p>
                        <p className="font-bold">{formatPercentage(stat.winRate)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">交易次数</p>
                        <p className="font-bold">{stat.totalTrades}</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* 进度条显示收益率 */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>收益进度</span>
                      <span>{formatPercentage(stat.totalReturn)}</span>
                    </div>
                    <Progress 
                      value={Math.max(0, Math.min(100, (stat.totalReturn + 0.5) * 100))} 
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* 权益曲线 */}
        <TabsContent value="equity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5" />
                <span>实时权益曲线</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={equityHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" />
                  <YAxis />
                  <Tooltip formatter={(value, name) => [formatCurrency(value as number), `Agent ${(name as string).slice(-6)}`]} />
                  <Legend />
                  {liveStats.map((stat, index) => (
                    <Line
                      key={stat.agentId}
                      type="monotone"
                      dataKey={stat.agentId}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 交易记录 */}
        <TabsContent value="trades">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>实时交易记录</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recentTrades.map((trade, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback>{trade.agentName.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{trade.agentName}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(trade.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <Badge variant={trade.side === 'buy' ? 'default' : 'secondary'}>
                        {trade.side.toUpperCase()}
                      </Badge>
                      <p className="text-sm font-medium">{trade.symbol}</p>
                    </div>
                    
                    <div className="text-right">
                      <p className="font-medium">
                        {trade.quantity} @ {formatCurrency(trade.price)}
                      </p>
                      <p className={`text-sm ${trade.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.profit >= 0 ? '+' : ''}{formatCurrency(trade.profit)}
                      </p>
                    </div>
                  </div>
                ))}
                
                {recentTrades.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>暂无交易记录</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 数据分析 */}
        <TabsContent value="analytics">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 收益率分布 */}
            <Card>
              <CardHeader>
                <CardTitle>收益率分布</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={liveStats.map(stat => ({
                        name: stat.agentName || `Agent ${stat.agentId.slice(-6)}`,
                        value: Math.abs(stat.totalReturn),
                        return: stat.totalReturn
                      }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, return: ret }) => `${name}: ${formatPercentage(ret)}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {liveStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name, props) => [formatPercentage(props.payload.return), name]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 风险指标 */}
            <Card>
              <CardHeader>
                <CardTitle>风险指标对比</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={liveStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey={(stat) => stat.agentName?.slice(0, 8) || `Agent${stat.agentId.slice(-4)}`} />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => {
                        if (name === 'maxDrawdown' || name === 'volatility') {
                          return [formatPercentage(value as number), name];
                        }
                        return [value, name];
                      }}
                    />
                    <Legend />
                    <Bar dataKey="sharpeRatio" fill="#8884d8" name="夏普比率" />
                    <Bar dataKey="maxDrawdown" fill="#82ca9d" name="最大回撤" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BattleVisualization;