# Trading Agent Platform - Backend API

一个强大的交易代理平台后端API，支持用户提交、管理和对比交易策略代理。

## 🚀 功能特性

### 核心功能
- **用户管理**: 注册、登录、权限控制
- **交易代理管理**: 创建、编辑、删除交易策略
- **实时交易**: 模拟交易执行和信号生成
- **回测系统**: 历史数据回测和性能分析
- **代理对战**: 多个代理实时PK对比
- **WebSocket**: 实时数据推送和通信

### 技术特性
- **TypeScript**: 类型安全的开发体验
- **MongoDB**: 灵活的文档数据库
- **Redis**: 高性能缓存和会话存储
- **Socket.IO**: 实时双向通信
- **JWT**: 安全的身份验证
- **Docker**: 容器化部署

## 📋 系统要求

- Node.js >= 18.0.0
- npm >= 8.0.0
- MongoDB >= 5.0
- Redis >= 6.0

## 🛠️ 快速开始

### 1. 克隆项目
```bash
git clone <repository-url>
cd trading-agent-platform/backend
```

### 2. 安装依赖
```bash
npm install
```

### 3. 环境配置
```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
nano .env
```

### 4. 启动数据库服务 (使用Docker)
```bash
# 启动开发环境数据库
docker-compose -f docker-compose.dev.yml up -d

# 查看服务状态
docker-compose -f docker-compose.dev.yml ps
```

### 5. 启动开发服务器
```bash
npm run dev
```

服务器将在 http://localhost:3001 启动

## 🐳 Docker 部署

### 开发环境
```bash
# 启动所有服务（仅数据库）
docker-compose -f docker-compose.dev.yml up -d

# 本地运行API服务
npm run dev
```

### 生产环境
```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f api
```

## 📚 API 文档

### 认证相关
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `POST /api/auth/refresh` - 刷新令牌
- `GET /api/auth/profile` - 获取用户信息
- `PUT /api/auth/profile` - 更新用户信息

### 交易代理
- `GET /api/agents` - 获取代理列表
- `POST /api/agents` - 创建新代理
- `GET /api/agents/:id` - 获取代理详情
- `PUT /api/agents/:id` - 更新代理
- `DELETE /api/agents/:id` - 删除代理
- `GET /api/agents/popular` - 热门代理
- `GET /api/agents/search` - 搜索代理

### 交易相关
- `POST /api/trading/execute` - 执行交易
- `GET /api/trading/records` - 交易记录
- `GET /api/trading/signals` - 实时信号
- `GET /api/trading/statistics` - 交易统计
- `DELETE /api/trading/:id` - 取消交易

### 回测系统
- `POST /api/backtest/run` - 运行回测
- `GET /api/backtest/results` - 回测结果
- `GET /api/backtest/results/:id` - 单个回测结果
- `DELETE /api/backtest/results/:id` - 删除回测结果
- `GET /api/backtest/compare` - 对比回测结果

### 代理对战
- `POST /api/battle/create` - 创建对战
- `POST /api/battle/:id/join` - 加入对战
- `GET /api/battle` - 对战列表
- `GET /api/battle/:id` - 对战详情
- `GET /api/battle/statistics` - 对战统计

### 用户管理
- `GET /api/users` - 用户列表（管理员）
- `GET /api/users/:id` - 用户详情
- `GET /api/users/leaderboard` - 排行榜
- `PUT /api/users/:id/status` - 更改用户状态（管理员）

## 🔧 开发脚本

```bash
# 开发模式（热重载）
npm run dev

# 构建项目
npm run build

# 生产模式启动
npm start

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage

# 代码检查
npm run lint

# 代码格式化
npm run format

# 类型检查
npm run typecheck

# 清理构建文件
npm run clean

# 清理日志文件
npm run logs:clear
```

## 📁 项目结构

```
src/
├── app.ts              # 应用主类
├── server.ts           # 服务器入口
├── config/             # 配置文件
│   └── index.ts        # 主配置
├── controllers/        # 控制器
│   ├── authController.ts
│   ├── agentController.ts
│   ├── tradingController.ts
│   ├── backtestController.ts
│   ├── battleController.ts
│   └── userController.ts
├── middleware/         # 中间件
│   ├── auth.ts
│   ├── errorHandler.ts
│   └── notFound.ts
├── models/             # 数据模型
│   ├── User.ts
│   ├── Agent.ts
│   ├── Trade.ts
│   ├── Battle.ts
│   └── Backtest.ts
├── routes/             # 路由定义
│   ├── index.ts
│   ├── auth.ts
│   ├── agents.ts
│   ├── trading.ts
│   ├── backtest.ts
│   ├── battle.ts
│   └── users.ts
├── services/           # 业务服务
│   ├── redis.ts
│   ├── websocket.ts
│   ├── tradingEngine.ts
│   └── backtestService.ts
├── types/              # 类型定义
│   └── index.ts
└── utils/              # 工具函数
    ├── index.ts
    └── logger.ts
```

## 🔐 环境变量

### 必需变量
```env
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://localhost:27017/trading_agent
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_REFRESH_SECRET=your-super-secret-refresh-key-at-least-32-characters-long
```

### 可选变量
```env
FRONTEND_URL=http://localhost:3000
TRADING_DEFAULT_BALANCE=10000
BATTLE_DEFAULT_DURATION=24
LOG_LEVEL=debug
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 📊 监控和日志

### 健康检查
- 访问 `GET /health` 查看服务状态
- 包含数据库连接、Redis连接、交易引擎状态

### 日志管理
- 日志文件位于 `logs/` 目录
- 错误日志: `logs/error.log`
- 综合日志: `logs/combined.log`
- 使用 `npm run logs:clear` 清理日志

### 数据库管理界面
- MongoDB Express: http://localhost:8081 (admin/admin123)
- Redis Commander: http://localhost:8082 (admin/admin123)

## 🔒 安全特性

- **JWT认证**: 安全的令牌认证机制
- **密码加密**: bcrypt哈希加密
- **速率限制**: 防止API滥用
- **CORS配置**: 跨域请求控制
- **Helmet**: 安全头部设置
- **输入验证**: Joi数据验证
- **SQL注入防护**: MongoDB参数化查询

## 🚀 性能优化

- **Redis缓存**: 热点数据缓存
- **数据库索引**: 优化查询性能
- **连接池**: 数据库连接复用
- **压缩**: Gzip响应压缩
- **分页**: 大数据集分页处理

## 🐛 故障排除

### 常见问题

1. **数据库连接失败**
   ```bash
   # 检查MongoDB服务状态
   docker-compose -f docker-compose.dev.yml ps mongodb-dev
   
   # 查看MongoDB日志
   docker-compose -f docker-compose.dev.yml logs mongodb-dev
   ```

2. **Redis连接失败**
   ```bash
   # 检查Redis服务状态
   docker-compose -f docker-compose.dev.yml ps redis-dev
   
   # 测试Redis连接
   docker exec -it trading-agent-redis-dev redis-cli -a password123 ping
   ```

3. **端口占用**
   ```bash
   # 查看端口占用
   netstat -tulpn | grep :3001
   
   # 杀死占用进程
   kill -9 <PID>
   ```

4. **权限问题**
   ```bash
   # 检查文件权限
   ls -la logs/
   
   # 修复权限
   chmod 755 logs/
   ```

## 📝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🤝 支持

如果您遇到问题或有疑问，请：

1. 查看 [FAQ](docs/FAQ.md)
2. 搜索 [Issues](https://github.com/your-username/trading-agent-platform/issues)
3. 创建新的 Issue
4. 联系维护者

## 🔄 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新历史。