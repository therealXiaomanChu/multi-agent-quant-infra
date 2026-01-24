import winston from 'winston';
import path from 'path';
import { config } from '../config';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white'
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Define which transports the logger must use
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.colorize({ all: true }),
      winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`
      )
    )
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.json()
    )
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.json()
    )
  })
];

// Create the logger
const logger = winston.createLogger({
  level: config.env === 'development' ? 'debug' : 'info',
  levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
  // Don't exit on handled exceptions
  exitOnError: false
});

// Create a stream object with a 'write' function that will be used by morgan
const stream = {
  write: (message: string) => {
    // Use the 'info' log level so the output will be picked up by both transports
    logger.info(message.trim());
  }
};

// Helper functions for structured logging
const logWithContext = (level: string, message: string, context?: any) => {
  const logData: any = { message };
  
  if (context) {
    if (typeof context === 'object') {
      Object.assign(logData, context);
    } else {
      logData.context = context;
    }
  }
  
  logger.log(level, logData);
};

// Enhanced logger with additional methods
const enhancedLogger = {
  ...logger,
  stream,
  
  // Request logging
  request: (req: any, res?: any, responseTime?: number) => {
    const logData = {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      ...(responseTime && { responseTime: `${responseTime}ms` }),
      ...(res && { statusCode: res.statusCode })
    };
    
    logger.info('HTTP Request', logData);
  },
  
  // Database operation logging
  database: (operation: string, collection?: string, query?: any, duration?: number) => {
    const logData = {
      operation,
      ...(collection && { collection }),
      ...(query && { query: JSON.stringify(query) }),
      ...(duration && { duration: `${duration}ms` })
    };
    
    logger.info('Database Operation', logData);
  },
  
  // Trading operation logging
  trading: (action: string, agentId?: string, symbol?: string, data?: any) => {
    const logData = {
      action,
      ...(agentId && { agentId }),
      ...(symbol && { symbol }),
      ...(data && { data })
    };
    
    logger.info('Trading Operation', logData);
  },
  
  // WebSocket logging
  websocket: (event: string, socketId?: string, data?: any) => {
    const logData = {
      event,
      ...(socketId && { socketId }),
      ...(data && { data })
    };
    
    logger.info('WebSocket Event', logData);
  },
  
  // Security logging
  security: (event: string, userId?: string, ip?: string, details?: any) => {
    const logData = {
      event,
      ...(userId && { userId }),
      ...(ip && { ip }),
      ...(details && { details })
    };
    
    logger.warn('Security Event', logData);
  },
  
  // Performance logging
  performance: (operation: string, duration: number, details?: any) => {
    const logData = {
      operation,
      duration: `${duration}ms`,
      ...(details && { details })
    };
    
    if (duration > 1000) {
      logger.warn('Slow Operation', logData);
    } else {
      logger.info('Performance', logData);
    }
  },
  
  // Error logging with context
  errorWithContext: (error: Error, context?: any) => {
    const logData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...(context && { context })
    };
    
    logger.error('Error with Context', logData);
  }
};

export { enhancedLogger as logger };
export default enhancedLogger;