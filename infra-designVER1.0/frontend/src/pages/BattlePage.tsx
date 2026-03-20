import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Trophy, 
  Users, 
  Clock, 
  DollarSign, 
  Plus, 
  Search, 
  Filter,
  Calendar,
  Target,
  TrendingUp,
  Activity
} from 'lucide-react';
import BattleVisualization from '@/components/Battle/BattleVisualization';
import { useToast } from '@/components/ui/use-toast';

interface Battle {
  _id: string;
  name: string;
  description: string;
  status: 'upcoming' | 'active' | 'completed';
  startTime: string;
  endTime: string;
  creator: {
    _id: string;
    username: string;
    avatar?: string;
  };
  config: {
    initialCapital: number;
    maxParticipants: number;
    entryFee: number;
    symbols: string[];
  };
  participants: any[];
  rewards: {
    first: number;
    second: number;
    third: number;
    participationReward: number;
  };
  statistics?: {
    totalParticipants: number;
    totalVolume: number;
    avgReturn: number;
  };
  liveStats?: any[];
}

export function BattlePage() {
  const navigate = useNavigate();
  const { battleId } = useParams();
  const { toast } = useToast();
  
  const [battles, setBattles] = useState<Battle[]>([]);
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchBattles();
  }, [statusFilter, currentPage]);

  useEffect(() => {
    if (battleId) {
      fetchBattleDetails(battleId);
    }
  }, [battleId]);

  const fetchBattles = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: '20',
        offset: ((currentPage - 1) * 20).toString()
      });
      
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const response = await fetch(`/api/battles?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setBattles(data.data);
        setTotalPages(Math.ceil(data.pagination.total / 20));
      }
    } catch (error) {
      console.error('Failed to fetch battles:', error);
      toast({
        title: "错误",
        description: "获取对战列表失败",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBattleDetails = async (id: string) => {
    try {
      const response = await fetch(`/api/battles/${id}`);
      const data = await response.json();
      
      if (data.success) {
        setSelectedBattle(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch battle details:', error);
      toast({
        title: "错误",
        description: "获取对战详情失败",
        variant: "destructive"
      });
    }
  };

  const handleJoinBattle = async (battleId: string, agentId: string) => {
    try {
      const response = await fetch(`/api/battles/${battleId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ agentId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "成功",
          description: "成功加入对战！"
        });
        fetchBattles();
        if (selectedBattle?._id === battleId) {
          fetchBattleDetails(battleId);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to join battle:', error);
      toast({
        title: "错误",
        description: error.message || "加入对战失败",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'upcoming':
        return <Badge variant="secondary">即将开始</Badge>;
      case 'active':
        return <Badge variant="default">进行中</Badge>;
      case 'completed':
        return <Badge variant="outline">已结束</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const filteredBattles = battles.filter(battle =>
    battle.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    battle.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (battleId && selectedBattle) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={() => navigate('/battles')}
            className="mb-4"
          >
            ← 返回对战列表
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{selectedBattle.name}</h1>
              <p className="text-gray-600 mt-2">{selectedBattle.description}</p>
            </div>
            {getStatusBadge(selectedBattle.status)}
          </div>
        </div>

        {/* 对战信息卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-sm text-gray-500">参与者</p>
                  <p className="font-bold">
                    {selectedBattle.participants.length}/{selectedBattle.config.maxParticipants}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm text-gray-500">初始资金</p>
                  <p className="font-bold">{formatCurrency(selectedBattle.config.initialCapital)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <div>
                  <p className="text-sm text-gray-500">冠军奖励</p>
                  <p className="font-bold">{formatCurrency(selectedBattle.rewards.first)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-sm text-gray-500">状态</p>
                  <p className="font-bold">{selectedBattle.status === 'active' ? '进行中' : selectedBattle.status === 'upcoming' ? '即将开始' : '已结束'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 对战可视化 */}
        <BattleVisualization battle={selectedBattle} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Trading Agent 对战平台</h1>
          <p className="text-gray-600 mt-2">参与激烈的AI交易对战，展示你的策略实力</p>
        </div>
        <Button onClick={() => navigate('/battles/create')} className="flex items-center space-x-2">
          <Plus className="w-4 h-4" />
          <span>创建对战</span>
        </Button>
      </div>

      {/* 搜索和过滤 */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="搜索对战名称或描述..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="筛选状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="upcoming">即将开始</SelectItem>
            <SelectItem value="active">进行中</SelectItem>
            <SelectItem value="completed">已结束</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">全部对战</TabsTrigger>
          <TabsTrigger value="upcoming">即将开始</TabsTrigger>
          <TabsTrigger value="active">进行中</TabsTrigger>
          <TabsTrigger value="completed">已结束</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-gray-200 rounded mb-4"></div>
                    <div className="h-3 bg-gray-200 rounded mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded mb-4"></div>
                    <div className="flex justify-between">
                      <div className="h-8 bg-gray-200 rounded w-20"></div>
                      <div className="h-8 bg-gray-200 rounded w-16"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBattles.map((battle) => (
                <Card key={battle._id} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{battle.name}</CardTitle>
                      {getStatusBadge(battle.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 mb-4 line-clamp-2">{battle.description}</p>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center space-x-1">
                          <Users className="w-4 h-4" />
                          <span>参与者</span>
                        </span>
                        <span className="font-medium">
                          {battle.participants.length}/{battle.config.maxParticipants}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center space-x-1">
                          <DollarSign className="w-4 h-4" />
                          <span>初始资金</span>
                        </span>
                        <span className="font-medium">{formatCurrency(battle.config.initialCapital)}</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center space-x-1">
                          <Trophy className="w-4 h-4" />
                          <span>冠军奖励</span>
                        </span>
                        <span className="font-medium">{formatCurrency(battle.rewards.first)}</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-4 h-4" />
                          <span>开始时间</span>
                        </span>
                        <span className="font-medium">{formatDateTime(battle.startTime)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 mt-4">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={battle.creator.avatar} />
                        <AvatarFallback>{battle.creator.username.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-gray-500">by {battle.creator.username}</span>
                    </div>
                    
                    <div className="flex space-x-2 mt-4">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => navigate(`/battles/${battle._id}`)}
                        className="flex-1"
                      >
                        查看详情
                      </Button>
                      {battle.status === 'upcoming' && (
                        <Button 
                          size="sm" 
                          onClick={() => {
                            // 这里应该打开agent选择对话框
                            // 暂时使用固定的agentId进行测试
                            // handleJoinBattle(battle._id, 'your-agent-id');
                          }}
                          className="flex-1"
                        >
                          加入对战
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {!loading && filteredBattles.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <Activity className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">暂无对战</h3>
                <p className="text-gray-600 mb-4">还没有符合条件的对战，创建一个新的对战吧！</p>
                <Button onClick={() => navigate('/battles/create')}>
                  创建对战
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* 其他标签页内容类似，这里省略 */}
      </Tabs>
      
      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-8">
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => prev - 1)}
            >
              上一页
            </Button>
            <span className="flex items-center px-4">
              第 {currentPage} 页，共 {totalPages} 页
            </span>
            <Button 
              variant="outline" 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => prev + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}