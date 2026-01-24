import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { config } from './config';
import { RedisService } from './services/redis';
import { createWebSocketService } from './services/websocketService';
import { getMarketDataService } from './services/marketDataService';
import { getTradingEngine } from './services/tradingEngine';
import { BacktestService } from './services/backtestService';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { logger } from './utils/logger';

class App {
  public app: express.Application;
  public server: any;
  public io: Server;
  private redisService: RedisService;
  private webSocketService: any;
  private marketDataService: any;
  private tradingEngine: any;
  private backtestService: BacktestService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: config.cors.origin,
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    this.initializeServices();
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeServices(): void {
    // Initialize Redis service
    this.redisService = new RedisService();
    
    // Initialize Market Data service
    this.marketDataService = getMarketDataService(process.env.USE_REAL_DATA === 'true');
    
    // Initialize WebSocket service
    this.webSocketService = createWebSocketService(this.server);
    
    // Initialize Trading Engine
    this.tradingEngine = getTradingEngine();
    
    // Initialize Backtest service
    this.backtestService = new BacktestService();
  }

  private initializeMiddlewares(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"]
        }
      }
    }));

    // CORS
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
        services: {
          database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
          redis: this.redisService.isConnected() ? 'connected' : 'disconnected',
          tradingEngine: this.tradingEngine.isRunning() ? 'running' : 'stopped'
        }
      });
    });

    // API routes
    this.app.use('/api', routes);

    // Serve static files in production
    if (config.env === 'production') {
      this.app.use(express.static('public'));
      
      // Catch all handler for SPA
      this.app.get('*', (req, res) => {
        res.sendFile('index.html', { root: 'public' });
      });
    }
  }

  private initializeErrorHandling(): void {
    // 404 handler
    this.app.use(notFound);
    
    // Global error handler
    this.app.use(errorHandler);
  }

  public async connectDatabase(): Promise<void> {
    try {
      await mongoose.connect(config.database.uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
        bufferMaxEntries: 0
      });
      
      logger.info('Connected to MongoDB');
      
      // Set up mongoose event listeners
      mongoose.connection.on('error', (error) => {
        logger.error('MongoDB connection error:', error);
      });
      
      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });
      
      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
      });
      
    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    }
  }

  public async connectRedis(): Promise<void> {
    try {
      await this.redisService.connect();
      logger.info('Connected to Redis');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      process.exit(1);
    }
  }

  public async startTradingEngine(): Promise<void> {
    try {
      // 启动市场数据服务
      await this.marketDataService.start();
      logger.info('Market data service started successfully');
      
      // 启动交易引擎
      await this.tradingEngine.start();
      logger.info('Trading engine started successfully');
    } catch (error) {
      logger.error('Failed to start trading services:', error);
      throw error;
    }
  }

  public listen(): void {
    this.server.listen(config.port, () => {
      logger.info(`Server is running on port ${config.port} in ${config.env} mode`);
    });
  }

  public async gracefulShutdown(): Promise<void> {
    logger.info('Starting graceful shutdown...');
    
    try {
      // Stop trading engine
      if (this.tradingEngine) {
        await this.tradingEngine.stop();
        logger.info('Trading engine stopped');
      }
      
      // Stop market data service
      if (this.marketDataService) {
        await this.marketDataService.stop();
        logger.info('Market data service stopped');
      }
      
      // Close WebSocket connections
      if (this.webSocketService) {
        await this.webSocketService.close();
        logger.info('WebSocket service closed');
      }
      
      // Close Redis connection
      if (this.redisService) {
        await this.redisService.disconnect();
        logger.info('Redis disconnected');
      }
      
      // Close database connection
      await mongoose.connection.close();
      logger.info('Database disconnected');
      
      // Close HTTP server
      this.server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  // Getters for services (for testing or external access)
  public getRedisService(): RedisService {
    return this.redisService;
  }

  public getWebSocketService(): WebSocketService {
    return this.webSocketService;
  }

  public getTradingEngine(): TradingEngine {
    return this.tradingEngine;
  }

  public getBacktestService(): BacktestService {
    return this.backtestService;
  }
}

export default App;