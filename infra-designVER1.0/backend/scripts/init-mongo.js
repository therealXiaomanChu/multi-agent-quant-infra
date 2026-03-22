// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

// Switch to the trading_agent database
db = db.getSiblingDB('trading_agent');

// Create application user
db.createUser({
  user: 'app_user',
  pwd: 'app_password123',
  roles: [
    {
      role: 'readWrite',
      db: 'trading_agent'
    }
  ]
});

print('Created application user: app_user');

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['username', 'email', 'password'],
      properties: {
        username: {
          bsonType: 'string',
          minLength: 3,
          maxLength: 30
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        password: {
          bsonType: 'string',
          minLength: 8
        },
        role: {
          bsonType: 'string',
          enum: ['user', 'admin', 'moderator']
        },
        status: {
          bsonType: 'string',
          enum: ['active', 'inactive', 'banned']
        }
      }
    }
  }
});

db.createCollection('agents', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'description', 'strategy', 'creator'],
      properties: {
        name: {
          bsonType: 'string',
          minLength: 3,
          maxLength: 100
        },
        description: {
          bsonType: 'string',
          maxLength: 1000
        },
        strategy: {
          bsonType: 'string',
          enum: ['trend_following', 'mean_reversion', 'momentum', 'arbitrage', 'scalping', 'swing', 'custom']
        },
        status: {
          bsonType: 'string',
          enum: ['draft', 'active', 'inactive', 'banned']
        },
        performance: {
          bsonType: 'object',
          properties: {
            totalReturn: { bsonType: 'number' },
            sharpeRatio: { bsonType: 'number' },
            maxDrawdown: { bsonType: 'number' },
            winRate: { bsonType: 'number' },
            totalTrades: { bsonType: 'number' }
          }
        }
      }
    }
  }
});

db.createCollection('trades', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['agentId', 'symbol', 'type', 'quantity', 'price'],
      properties: {
        type: {
          bsonType: 'string',
          enum: ['buy', 'sell']
        },
        status: {
          bsonType: 'string',
          enum: ['pending', 'executed', 'cancelled', 'failed']
        },
        quantity: {
          bsonType: 'number',
          minimum: 0
        },
        price: {
          bsonType: 'number',
          minimum: 0
        }
      }
    }
  }
});

db.createCollection('battles', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'creator', 'participants', 'startTime', 'endTime'],
      properties: {
        name: {
          bsonType: 'string',
          minLength: 3,
          maxLength: 100
        },
        status: {
          bsonType: 'string',
          enum: ['pending', 'active', 'completed', 'cancelled']
        },
        participants: {
          bsonType: 'array',
          minItems: 2,
          maxItems: 10
        }
      }
    }
  }
});

db.createCollection('backtests', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['agentId', 'startDate', 'endDate', 'initialBalance'],
      properties: {
        status: {
          bsonType: 'string',
          enum: ['pending', 'running', 'completed', 'failed']
        },
        initialBalance: {
          bsonType: 'number',
          minimum: 0
        }
      }
    }
  }
});

print('Created collections with validation rules');

// Create indexes for better performance

// Users indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ createdAt: -1 });
db.users.createIndex({ status: 1 });
db.users.createIndex({ role: 1 });

// Agents indexes
db.agents.createIndex({ creator: 1 });
db.agents.createIndex({ name: 1 });
db.agents.createIndex({ strategy: 1 });
db.agents.createIndex({ status: 1 });
db.agents.createIndex({ createdAt: -1 });
db.agents.createIndex({ 'performance.totalReturn': -1 });
db.agents.createIndex({ 'performance.sharpeRatio': -1 });
db.agents.createIndex({ viewCount: -1 });
db.agents.createIndex({ category: 1 });

// Trades indexes
db.trades.createIndex({ agentId: 1 });
db.trades.createIndex({ symbol: 1 });
db.trades.createIndex({ executedAt: -1 });
db.trades.createIndex({ status: 1 });
db.trades.createIndex({ type: 1 });
db.trades.createIndex({ agentId: 1, executedAt: -1 });

// Battles indexes
db.battles.createIndex({ creator: 1 });
db.battles.createIndex({ status: 1 });
db.battles.createIndex({ startTime: -1 });
db.battles.createIndex({ endTime: 1 });
db.battles.createIndex({ 'participants.agentId': 1 });
db.battles.createIndex({ createdAt: -1 });

// Backtests indexes
db.backtests.createIndex({ agentId: 1 });
db.backtests.createIndex({ userId: 1 });
db.backtests.createIndex({ status: 1 });
db.backtests.createIndex({ createdAt: -1 });
db.backtests.createIndex({ agentId: 1, createdAt: -1 });

print('Created database indexes');

// Insert sample data for development
if (db.getName() === 'trading_agent_dev') {
  // Sample admin user
  db.users.insertOne({
    username: 'admin',
    email: 'admin@trading-agent.com',
    password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uDfS', // password: admin123
    role: 'admin',
    status: 'active',
    profile: {
      firstName: 'Admin',
      lastName: 'User',
      bio: 'System Administrator'
    },
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Sample regular user
  db.users.insertOne({
    username: 'trader1',
    email: 'trader1@example.com',
    password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uDfS', // password: admin123
    role: 'user',
    status: 'active',
    profile: {
      firstName: 'John',
      lastName: 'Trader',
      bio: 'Experienced algorithmic trader'
    },
    createdAt: new Date(),
    updatedAt: new Date()
  });

  print('Inserted sample users for development');

  // Sample trading agent
  const userId = db.users.findOne({ username: 'trader1' })._id;
  
  db.agents.insertOne({
    name: 'Moving Average Crossover',
    description: 'A simple moving average crossover strategy that buys when short MA crosses above long MA and sells when it crosses below.',
    strategy: 'trend_following',
    category: 'Technical Analysis',
    creator: userId,
    status: 'active',
    code: `
      // Simple Moving Average Crossover Strategy
      function execute(marketData) {
        const shortMA = calculateMA(marketData.prices, 10);
        const longMA = calculateMA(marketData.prices, 20);
        
        if (shortMA > longMA && !this.position) {
          return { action: 'buy', quantity: 100 };
        } else if (shortMA < longMA && this.position) {
          return { action: 'sell', quantity: this.position.quantity };
        }
        
        return { action: 'hold' };
      }
    `,
    parameters: {
      shortPeriod: 10,
      longPeriod: 20,
      riskPerTrade: 0.02
    },
    performance: {
      totalReturn: 0.15,
      sharpeRatio: 1.2,
      maxDrawdown: 0.08,
      winRate: 0.65,
      totalTrades: 150,
      profitFactor: 1.8
    },
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  print('Inserted sample trading agent for development');
}

print('MongoDB initialization completed successfully!');
