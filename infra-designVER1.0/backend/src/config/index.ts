import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  
  // Database
  database: {
    uri: process.env.MONGODB_URI!,
    options: {
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || '10', 10),
      serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT || '5000', 10),
      socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT || '45000', 10),
      bufferCommands: process.env.DB_BUFFER_COMMANDS === 'true',
      bufferMaxEntries: parseInt(process.env.DB_BUFFER_MAX_ENTRIES || '0', 10)
    }
  },
  
  // Redis
  redis: {
    url: process.env.REDIS_URL!,
    options: {
      retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100', 10),
      maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
      lazyConnect: true,
      keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE || '30000', 10)
    }
  },
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'trading-agent-platform',
    audience: process.env.JWT_AUDIENCE || 'trading-agent-users'
  },
  
  // CORS
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true'
  },
  
  // File Upload
  upload: {
    maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE || '10485760', 10), // 10MB
    allowedMimeTypes: (process.env.UPLOAD_ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/gif,image/webp').split(','),
    uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads')
  },
  
  // Email (if using email service)
  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || 'noreply@trading-agent.com'
  },
  
  // Trading Engine
  trading: {
    defaultBalance: parseFloat(process.env.TRADING_DEFAULT_BALANCE || '10000'),
    maxPositions: parseInt(process.env.TRADING_MAX_POSITIONS || '10', 10),
    riskLimit: parseFloat(process.env.TRADING_RISK_LIMIT || '0.02'), // 2% risk per trade
    commissionRate: parseFloat(process.env.TRADING_COMMISSION_RATE || '0.001'), // 0.1%
    slippageRate: parseFloat(process.env.TRADING_SLIPPAGE_RATE || '0.0005'), // 0.05%
    marketDataUpdateInterval: parseInt(process.env.MARKET_DATA_UPDATE_INTERVAL || '1000', 10), // 1 second
    signalRetentionTime: parseInt(process.env.SIGNAL_RETENTION_TIME || '3600', 10) // 1 hour
  },
  
  // Backtest
  backtest: {
    maxDuration: parseInt(process.env.BACKTEST_MAX_DURATION || '365', 10), // days
    defaultTimeframe: process.env.BACKTEST_DEFAULT_TIMEFRAME || '1h',
    maxConcurrentBacktests: parseInt(process.env.BACKTEST_MAX_CONCURRENT || '5', 10),
    resultRetentionDays: parseInt(process.env.BACKTEST_RESULT_RETENTION_DAYS || '30', 10)
  },
  
  // Battle System
  battle: {
    defaultDuration: parseInt(process.env.BATTLE_DEFAULT_DURATION || '24', 10), // hours
    maxDuration: parseInt(process.env.BATTLE_MAX_DURATION || '168', 10), // 7 days
    minParticipants: parseInt(process.env.BATTLE_MIN_PARTICIPANTS || '2', 10),
    maxParticipants: parseInt(process.env.BATTLE_MAX_PARTICIPANTS || '10', 10),
    entryFee: parseFloat(process.env.BATTLE_ENTRY_FEE || '0'), // Virtual currency
    prizePoolPercentage: parseFloat(process.env.BATTLE_PRIZE_POOL_PERCENTAGE || '0.9') // 90% to winners
  },
  
  // WebSocket
  websocket: {
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '60000', 10),
    pingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000', 10),
    maxConnections: parseInt(process.env.WS_MAX_CONNECTIONS || '1000', 10)
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    logDir: process.env.LOG_DIR || path.join(process.cwd(), 'logs')
  },
  
  // Security
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
    passwordMaxLength: parseInt(process.env.PASSWORD_MAX_LENGTH || '128', 10),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '900000', 10), // 15 minutes
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000', 10) // 1 hour
  },
  
  // Cache
  cache: {
    defaultTTL: parseInt(process.env.CACHE_DEFAULT_TTL || '3600', 10), // 1 hour
    agentListTTL: parseInt(process.env.CACHE_AGENT_LIST_TTL || '300', 10), // 5 minutes
    userProfileTTL: parseInt(process.env.CACHE_USER_PROFILE_TTL || '1800', 10), // 30 minutes
    tradingDataTTL: parseInt(process.env.CACHE_TRADING_DATA_TTL || '60', 10), // 1 minute
    leaderboardTTL: parseInt(process.env.CACHE_LEADERBOARD_TTL || '600', 10) // 10 minutes
  },
  
  // External APIs
  externalApis: {
    marketDataProvider: process.env.MARKET_DATA_PROVIDER || 'mock',
    marketDataApiKey: process.env.MARKET_DATA_API_KEY,
    marketDataBaseUrl: process.env.MARKET_DATA_BASE_URL,
    newsApiKey: process.env.NEWS_API_KEY,
    newsApiBaseUrl: process.env.NEWS_API_BASE_URL || 'https://newsapi.org/v2'
  },
  
  // Monitoring
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10), // 30 seconds
    alertThresholds: {
      cpuUsage: parseFloat(process.env.ALERT_CPU_THRESHOLD || '80'),
      memoryUsage: parseFloat(process.env.ALERT_MEMORY_THRESHOLD || '80'),
      responseTime: parseInt(process.env.ALERT_RESPONSE_TIME_THRESHOLD || '5000', 10)
    }
  }
};

// Validate configuration
export const validateConfig = () => {
  const errors: string[] = [];
  
  // Validate port range
  if (config.port < 1 || config.port > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  
  // Validate JWT secrets
  if (config.jwt.secret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }
  
  if (config.jwt.refreshSecret.length < 32) {
    errors.push('JWT_REFRESH_SECRET must be at least 32 characters long');
  }
  
  // Validate trading configuration
  if (config.trading.defaultBalance <= 0) {
    errors.push('TRADING_DEFAULT_BALANCE must be greater than 0');
  }
  
  if (config.trading.riskLimit <= 0 || config.trading.riskLimit > 1) {
    errors.push('TRADING_RISK_LIMIT must be between 0 and 1');
  }
  
  // Validate battle configuration
  if (config.battle.minParticipants < 2) {
    errors.push('BATTLE_MIN_PARTICIPANTS must be at least 2');
  }
  
  if (config.battle.maxParticipants < config.battle.minParticipants) {
    errors.push('BATTLE_MAX_PARTICIPANTS must be greater than or equal to BATTLE_MIN_PARTICIPANTS');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
};

// Export individual config sections for convenience
export const {
  env,
  port,
  database,
  redis,
  jwt,
  cors,
  rateLimit,
  upload,
  email,
  trading,
  backtest,
  battle,
  websocket,
  logging,
  security,
  cache,
  externalApis,
  monitoring
} = config;

export default config;