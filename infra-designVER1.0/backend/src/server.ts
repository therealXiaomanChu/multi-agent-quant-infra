import App from './app';
import { logger } from './utils/logger';

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

async function startServer() {
  try {
    // Create app instance
    const app = new App();
    
    // Connect to databases
    await app.connectDatabase();
    await app.connectRedis();
    
    // Start trading engine
    await app.startTradingEngine();
    
    // Start HTTP server
    app.listen();
    
    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      await app.gracefulShutdown();
    };
    
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();