import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimePicker } from '@/components/ui/datetime-picker';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Plus, 
  X, 
  Calendar, 
  DollarSign, 
  Users, 
  Trophy,
  Target,
  Clock,
  Info
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface BattleConfig {
  name: string;
  description: string;
  startTime: Date;
  endTime: Date;
  initialCapital: number;
  maxParticipants: number;
  entryFee: number;
  symbols: string[];
  rules: {
    allowShortSelling: boolean;
    maxPositionSize: number;
    stopLossRequired: boolean;
    maxDrawdown: number;
  };
  rewards: {
    first: number;
    second: number;
    third: number;
    participationReward: number;
  };
}

const AVAILABLE_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT',
  'SOLUSDT', 'DOTUSDT', 'DOGEUSDT', 'AVAXUSDT', 'MATICUSDT',
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA',
  'NVDA', 'META', 'NFLX', 'SPY', 'QQQ'
];

const CreateBattlePage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<BattleConfig>({
    name: '',
    description: '',
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 默认明天
    endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 默认一周后
    initialCapital: 100000,
    maxParticipants: 10,
    entryFee: 0,
    symbols: ['BTCUSDT'],
    rules: {
      allowShortSelling: true,
      maxPositionSize: 0.2, // 20%
      stopLossRequired: false,
      maxDrawdown: 0.3 // 30%
    },
    rewards: {
      first: 5000,
      second: 2000,
      third: 1000,
      participationReward: 100
    }
  });
  
  const [newSymbol, setNewSymbol] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateConfig = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!config.name.trim()) {
      newErrors.name = '对战名称不能为空';
    }
    
    if (!config.description.trim()) {
      newErrors.description = '对战描述不能为空';
    }
    
    if (config.startTime <= new Date()) {
      newErrors.startTime = '开始时间必须在当前时间之后';
    }
    
    if (config.endTime <= config.startTime) {
      newErrors.endTime = '结束时间必须在开始时间之后';
    }
    
    if (config.initialCapital <= 0) {
      newErrors.initialCapital = '初始资金必须大于0';
    }
    
    if (config.maxParticipants < 2) {
      newErrors.maxParticipants = '最大参与者数量必须至少为2';
    }
    
    if (config.entryFee < 0) {
      newErrors.entryFee = '报名费不能为负数';
    }
    
    if (config.symbols.length === 0) {
      newErrors.symbols = '至少需要选择一个交易标的';
    }
    
    if (config.rules.maxPositionSize <= 0 || config.rules.maxPositionSize > 1) {
      newErrors.maxPositionSize = '最大仓位比例必须在0-100%之间';
    }
    
    if (config.rules.maxDrawdown <= 0 || config.rules.maxDrawdown > 1) {
      newErrors.maxDrawdown = '最大回撤限制必须在0-100%之间';
    }
    
    const totalRewards = config.rewards.first + config.rewards.second + config.rewards.third + 
                        (config.rewards.participationReward * config.maxParticipants);
    const totalFees = config.entryFee * config.maxParticipants;
    
    if (totalRewards > totalFees && config.entryFee > 0) {
      newErrors.rewards = '奖励总额不能超过报名费总收入';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateConfig()) {
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch('/api/battles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(config)
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "成功",
          description: "对战创建成功！"
        });
        navigate(`/battles/${data.data._id}`);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Failed to create battle:', error);
      toast({
        title: "错误",
        description: error.message || "创建对战失败",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addSymbol = () => {
    if (newSymbol && !config.symbols.includes(newSymbol)) {
      setConfig(prev => ({
        ...prev,
        symbols: [...prev.symbols, newSymbol]
      }));
      setNewSymbol('');
    }
  };

  const removeSymbol = (symbol: string) => {
    setConfig(prev => ({
      ...prev,
      symbols: prev.symbols.filter(s => s !== symbol)
    }));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button 
          variant="outline" 
          onClick={() => navigate('/battles')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回对战列表
        </Button>
        
        <div>
          <h1 className="text-3xl font-bold">创建新对战</h1>
          <p className="text-gray-600 mt-2">配置你的AI交易对战参数</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Info className="w-5 h-5" />
              <span>基本信息</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">对战名称 *</Label>
              <Input
                id="name"
                value={config.name}
                onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                placeholder="输入对战名称"
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
            </div>
            
            <div>
              <Label htmlFor="description">对战描述 *</Label>
              <Textarea
                id="description"
                value={config.description}
                onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
                placeholder="描述对战的目标、规则或特色"
                rows={3}
                className={errors.description ? 'border-red-500' : ''}
              />
              {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description}</p>}
            </div>
          </CardContent>
        </Card>

        {/* 时间设置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="w-5 h-5" />
              <span>时间设置</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startTime">开始时间 *</Label>
                <DateTimePicker
                  value={config.startTime}
                  onChange={(date) => setConfig(prev => ({ ...prev, startTime: date }))}
                  className={errors.startTime ? 'border-red-500' : ''}
                />
                {errors.startTime && <p className="text-red-500 text-sm mt-1">{errors.startTime}</p>}
              </div>
              
              <div>
                <Label htmlFor="endTime">结束时间 *</Label>
                <DateTimePicker
                  value={config.endTime}
                  onChange={(date) => setConfig(prev => ({ ...prev, endTime: date }))}
                  className={errors.endTime ? 'border-red-500' : ''}
                />
                {errors.endTime && <p className="text-red-500 text-sm mt-1">{errors.endTime}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 参与设置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>参与设置</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="initialCapital">初始资金 (USD) *</Label>
                <Input
                  id="initialCapital"
                  type="number"
                  value={config.initialCapital}
                  onChange={(e) => setConfig(prev => ({ ...prev, initialCapital: Number(e.target.value) }))}
                  min="1000"
                  step="1000"
                  className={errors.initialCapital ? 'border-red-500' : ''}
                />
                {errors.initialCapital && <p className="text-red-500 text-sm mt-1">{errors.initialCapital}</p>}
              </div>
              
              <div>
                <Label htmlFor="maxParticipants">最大参与者数量 *</Label>
                <Input
                  id="maxParticipants"
                  type="number"
                  value={config.maxParticipants}
                  onChange={(e) => setConfig(prev => ({ ...prev, maxParticipants: Number(e.target.value) }))}
                  min="2"
                  max="50"
                  className={errors.maxParticipants ? 'border-red-500' : ''}
                />
                {errors.maxParticipants && <p className="text-red-500 text-sm mt-1">{errors.maxParticipants}</p>}
              </div>
              
              <div>
                <Label htmlFor="entryFee">报名费 (USD)</Label>
                <Input
                  id="entryFee"
                  type="number"
                  value={config.entryFee}
                  onChange={(e) => setConfig(prev => ({ ...prev, entryFee: Number(e.target.value) }))}
                  min="0"
                  step="10"
                  className={errors.entryFee ? 'border-red-500' : ''}
                />
                {errors.entryFee && <p className="text-red-500 text-sm mt-1">{errors.entryFee}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 交易标的 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="w-5 h-5" />
              <span>交易标的</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>选择交易标的 *</Label>
              <div className="flex space-x-2 mt-2">
                <Select value={newSymbol} onValueChange={setNewSymbol}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="选择标的" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_SYMBOLS.filter(symbol => !config.symbols.includes(symbol)).map(symbol => (
                      <SelectItem key={symbol} value={symbol}>{symbol}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" onClick={addSymbol} disabled={!newSymbol}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-3">
                {config.symbols.map(symbol => (
                  <Badge key={symbol} variant="secondary" className="flex items-center space-x-1">
                    <span>{symbol}</span>
                    <button
                      type="button"
                      onClick={() => removeSymbol(symbol)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              {errors.symbols && <p className="text-red-500 text-sm mt-1">{errors.symbols}</p>}
            </div>
          </CardContent>
        </Card>

        {/* 交易规则 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>交易规则</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maxPositionSize">最大仓位比例 (%) *</Label>
                <Input
                  id="maxPositionSize"
                  type="number"
                  value={config.rules.maxPositionSize * 100}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    rules: { ...prev.rules, maxPositionSize: Number(e.target.value) / 100 }
                  }))}
                  min="1"
                  max="100"
                  step="1"
                  className={errors.maxPositionSize ? 'border-red-500' : ''}
                />
                {errors.maxPositionSize && <p className="text-red-500 text-sm mt-1">{errors.maxPositionSize}</p>}
              </div>
              
              <div>
                <Label htmlFor="maxDrawdown">最大回撤限制 (%) *</Label>
                <Input
                  id="maxDrawdown"
                  type="number"
                  value={config.rules.maxDrawdown * 100}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    rules: { ...prev.rules, maxDrawdown: Number(e.target.value) / 100 }
                  }))}
                  min="1"
                  max="100"
                  step="1"
                  className={errors.maxDrawdown ? 'border-red-500' : ''}
                />
                {errors.maxDrawdown && <p className="text-red-500 text-sm mt-1">{errors.maxDrawdown}</p>}
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="allowShortSelling"
                  checked={config.rules.allowShortSelling}
                  onCheckedChange={(checked) => setConfig(prev => ({
                    ...prev,
                    rules: { ...prev.rules, allowShortSelling: checked as boolean }
                  }))}
                />
                <Label htmlFor="allowShortSelling">允许做空交易</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="stopLossRequired"
                  checked={config.rules.stopLossRequired}
                  onCheckedChange={(checked) => setConfig(prev => ({
                    ...prev,
                    rules: { ...prev.rules, stopLossRequired: checked as boolean }
                  }))}
                />
                <Label htmlFor="stopLossRequired">强制设置止损</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 奖励设置 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Trophy className="w-5 h-5" />
              <span>奖励设置</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="firstPrize">冠军奖励 (USD)</Label>
                <Input
                  id="firstPrize"
                  type="number"
                  value={config.rewards.first}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    rewards: { ...prev.rewards, first: Number(e.target.value) }
                  }))}
                  min="0"
                  step="100"
                />
              </div>
              
              <div>
                <Label htmlFor="secondPrize">亚军奖励 (USD)</Label>
                <Input
                  id="secondPrize"
                  type="number"
                  value={config.rewards.second}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    rewards: { ...prev.rewards, second: Number(e.target.value) }
                  }))}
                  min="0"
                  step="100"
                />
              </div>
              
              <div>
                <Label htmlFor="thirdPrize">季军奖励 (USD)</Label>
                <Input
                  id="thirdPrize"
                  type="number"
                  value={config.rewards.third}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    rewards: { ...prev.rewards, third: Number(e.target.value) }
                  }))}
                  min="0"
                  step="100"
                />
              </div>
              
              <div>
                <Label htmlFor="participationReward">参与奖励 (USD)</Label>
                <Input
                  id="participationReward"
                  type="number"
                  value={config.rewards.participationReward}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    rewards: { ...prev.rewards, participationReward: Number(e.target.value) }
                  }))}
                  min="0"
                  step="10"
                />
              </div>
            </div>
            
            {errors.rewards && <p className="text-red-500 text-sm mt-1">{errors.rewards}</p>}
            
            {/* 奖励预览 */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">奖励预览</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p>总报名费收入: {formatCurrency(config.entryFee * config.maxParticipants)}</p>
                  <p>奖励总支出: {formatCurrency(
                    config.rewards.first + config.rewards.second + config.rewards.third + 
                    (config.rewards.participationReward * config.maxParticipants)
                  )}</p>
                </div>
                <div>
                  <p>平台收益: {formatCurrency(
                    (config.entryFee * config.maxParticipants) - 
                    (config.rewards.first + config.rewards.second + config.rewards.third + 
                     (config.rewards.participationReward * config.maxParticipants))
                  )}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 提交按钮 */}
        <div className="flex justify-end space-x-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => navigate('/battles')}
          >
            取消
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? '创建中...' : '创建对战'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateBattlePage;