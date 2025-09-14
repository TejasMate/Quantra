const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const moment = require('moment');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3004;

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3004',
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Mock Database for System Analytics
const systemDatabase = {
  networkStats: {
    totalTransactions: 156789,
    totalValue: 234567.89,
    activeUsers: 12345,
    totalMerchants: 456,
    totalWallets: 23456,
    averageTransactionValue: 1.5,
    transactionVelocity: 12.5, // transactions per minute
    networkUptime: 99.95
  },
  
  blockchainMetrics: [
    {
      network: 'avalanche',
      blockHeight: 2345678,
      blockTime: 2.1,
      gasPrice: 25,
      tps: 4500,
      status: 'healthy'
    },
    {
      network: 'ethereum',
      blockHeight: 18567890,
      blockTime: 12.8,
      gasPrice: 35,
      tps: 15,
      status: 'healthy'
    }
  ],

  dailyMetrics: generateDailyMetrics(30),
  topMerchants: [
    {
      id: '1',
      name: 'CryptoMart Electronics',
      category: 'electronics',
      transactionCount: 2456,
      totalVolume: 45678.9,
      avgTransactionValue: 18.6,
      uptime: 99.8
    },
    {
      id: '2', 
      name: 'Blockchain Books',
      category: 'books',
      transactionCount: 1867,
      totalVolume: 12345.7,
      avgTransactionValue: 6.6,
      uptime: 99.9
    },
    {
      id: '3',
      name: 'DeFi Coffee Shop',
      category: 'food',
      transactionCount: 3456,
      totalVolume: 8976.5,
      avgTransactionValue: 2.6,
      uptime: 99.7
    }
  ],

  regionMetrics: [
    { region: 'North America', users: 5678, transactions: 67890, volume: 123456.7 },
    { region: 'Europe', users: 4321, transactions: 54321, volume: 98765.4 },
    { region: 'Asia Pacific', users: 2134, transactions: 34567, volume: 67890.1 },
    { region: 'Others', users: 432, transactions: 4567, volume: 12345.6 }
  ],

  errorLogs: [
    {
      id: '1',
      timestamp: new Date(Date.now() - 3600000),
      type: 'API_ERROR',
      message: 'Rate limit exceeded for IP 192.168.1.100',
      severity: 'warning',
      resolved: true
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 7200000),
      type: 'BLOCKCHAIN_ERROR',
      message: 'Transaction timeout on Avalanche network',
      severity: 'error',
      resolved: true
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 1800000),
      type: 'WALLET_ERROR',
      message: 'Invalid signature verification',
      severity: 'warning',
      resolved: false
    }
  ],

  systemHealth: {
    overallStatus: 'healthy',
    services: [
      { name: 'API Gateway', status: 'healthy', uptime: 99.98, responseTime: 45 },
      { name: 'Payment Processor', status: 'healthy', uptime: 99.95, responseTime: 123 },
      { name: 'Blockchain Bridge', status: 'healthy', uptime: 99.92, responseTime: 89 },
      { name: 'Analytics Engine', status: 'healthy', uptime: 99.88, responseTime: 156 },
      { name: 'Notification Service', status: 'warning', uptime: 98.45, responseTime: 234 }
    ]
  },

  userAnalytics: {
    totalUsers: 12345,
    activeUsersToday: 2345,
    activeUsersWeek: 5678,
    newUsersToday: 234,
    userRetention: {
      '1d': 95.2,
      '7d': 78.4,
      '30d': 65.7,
      '90d': 45.2
    },
    deviceBreakdown: {
      'Mobile': 65.3,
      'Desktop': 28.7,
      'Tablet': 6.0
    },
    countryStats: [
      { country: 'United States', users: 3456, percentage: 28.0 },
      { country: 'United Kingdom', users: 2134, percentage: 17.3 },
      { country: 'Germany', users: 1567, percentage: 12.7 },
      { country: 'Japan', users: 1234, percentage: 10.0 },
      { country: 'Canada', users: 987, percentage: 8.0 },
      { country: 'Others', users: 2967, percentage: 24.0 }
    ]
  }
};

// Generate sample daily metrics
function generateDailyMetrics(days) {
  const metrics = [];
  for (let i = days; i >= 0; i--) {
    const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
    metrics.push({
      date,
      transactions: Math.floor(Math.random() * 1000) + 500,
      volume: Math.floor(Math.random() * 10000) + 5000,
      users: Math.floor(Math.random() * 200) + 100,
      avgGasPrice: Math.floor(Math.random() * 50) + 20,
      networkLatency: Math.floor(Math.random() * 100) + 50
    });
  }
  return metrics;
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
};

// Public endpoints (no authentication required)

// System health check - public endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Public network statistics - basic metrics
app.get('/api/public/stats', (req, res) => {
  const publicStats = {
    totalTransactions: systemDatabase.networkStats.totalTransactions,
    totalValue: systemDatabase.networkStats.totalValue,
    activeUsers: systemDatabase.networkStats.activeUsers,
    totalMerchants: systemDatabase.networkStats.totalMerchants,
    networkUptime: systemDatabase.networkStats.networkUptime,
    transactionVelocity: systemDatabase.networkStats.transactionVelocity
  };

  res.json({
    success: true,
    stats: publicStats
  });
});

// Public blockchain metrics
app.get('/api/public/blockchain', (req, res) => {
  res.json({
    success: true,
    metrics: systemDatabase.blockchainMetrics
  });
});

// Authentication endpoints

// Connect wallet and authenticate
app.post('/api/auth/connect-wallet', async (req, res) => {
  try {
    const { walletAddress, signature, message, network } = req.body;

    if (!walletAddress || !signature || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Verify the signature
    try {
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      
      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid signature'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Signature verification failed'
      });
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        walletAddress: walletAddress.toLowerCase(),
        network: network || 'avalanche',
        role: 'system_viewer'
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        walletAddress: walletAddress.toLowerCase(),
        network: network || 'avalanche',
        role: 'system_viewer'
      }
    });

  } catch (error) {
    console.error('Wallet connection error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to connect wallet'
    });
  }
});

// Protected endpoints (require authentication)

// System overview dashboard
app.get('/api/admin/overview', authenticateToken, (req, res) => {
  res.json({
    success: true,
    overview: {
      networkStats: systemDatabase.networkStats,
      blockchainMetrics: systemDatabase.blockchainMetrics,
      systemHealth: systemDatabase.systemHealth,
      recentMetrics: systemDatabase.dailyMetrics.slice(-7)
    }
  });
});

// Detailed analytics
app.get('/api/admin/analytics', authenticateToken, (req, res) => {
  const { period = '30d' } = req.query;
  
  let days = 30;
  if (period === '7d') days = 7;
  else if (period === '90d') days = 90;
  
  const metrics = systemDatabase.dailyMetrics.slice(-days);
  
  res.json({
    success: true,
    analytics: {
      metrics,
      summary: {
        totalTransactions: metrics.reduce((sum, m) => sum + m.transactions, 0),
        totalVolume: metrics.reduce((sum, m) => sum + m.volume, 0),
        avgDailyUsers: Math.round(metrics.reduce((sum, m) => sum + m.users, 0) / metrics.length),
        avgGasPrice: Math.round(metrics.reduce((sum, m) => sum + m.avgGasPrice, 0) / metrics.length * 100) / 100
      },
      userAnalytics: systemDatabase.userAnalytics,
      regionMetrics: systemDatabase.regionMetrics
    }
  });
});

// Merchant analytics
app.get('/api/admin/merchants', authenticateToken, (req, res) => {
  const { category, sort = 'volume' } = req.query;
  
  let merchants = [...systemDatabase.topMerchants];
  
  if (category) {
    merchants = merchants.filter(m => m.category === category);
  }
  
  if (sort === 'transactions') {
    merchants.sort((a, b) => b.transactionCount - a.transactionCount);
  } else if (sort === 'volume') {
    merchants.sort((a, b) => b.totalVolume - a.totalVolume);
  }
  
  res.json({
    success: true,
    merchants,
    summary: {
      totalMerchants: merchants.length,
      totalVolume: merchants.reduce((sum, m) => sum + m.totalVolume, 0),
      totalTransactions: merchants.reduce((sum, m) => sum + m.transactionCount, 0),
      avgUptime: merchants.reduce((sum, m) => sum + m.uptime, 0) / merchants.length
    }
  });
});

// Transaction monitoring
app.get('/api/admin/transactions', authenticateToken, (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  
  // Generate mock transactions
  const transactions = [];
  for (let i = 0; i < parseInt(limit); i++) {
    const statuses = ['confirmed', 'pending', 'failed'];
    const txStatus = status || statuses[Math.floor(Math.random() * statuses.length)];
    
    transactions.push({
      id: `tx_${Date.now()}_${i}`,
      hash: `0x${Math.random().toString(16).substr(2, 64)}`,
      from: `0x${Math.random().toString(16).substr(2, 40)}`,
      to: `0x${Math.random().toString(16).substr(2, 40)}`,
      amount: (Math.random() * 10).toFixed(4),
      status: txStatus,
      timestamp: new Date(Date.now() - Math.random() * 86400000),
      network: Math.random() > 0.5 ? 'avalanche' : 'ethereum',
      gasUsed: Math.floor(Math.random() * 100000) + 21000,
      gasPrice: Math.floor(Math.random() * 50) + 20
    });
  }
  
  res.json({
    success: true,
    transactions,
    pagination: {
      offset: parseInt(offset),
      limit: parseInt(limit),
      total: 10000 // Mock total
    }
  });
});

// System logs and monitoring
app.get('/api/admin/logs', authenticateToken, (req, res) => {
  const { type, severity, resolved } = req.query;
  
  let logs = [...systemDatabase.errorLogs];
  
  if (type) {
    logs = logs.filter(log => log.type === type);
  }
  
  if (severity) {
    logs = logs.filter(log => log.severity === severity);
  }
  
  if (resolved !== undefined) {
    logs = logs.filter(log => log.resolved === (resolved === 'true'));
  }
  
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json({
    success: true,
    logs,
    summary: {
      total: logs.length,
      unresolved: logs.filter(log => !log.resolved).length,
      byType: logs.reduce((acc, log) => {
        acc[log.type] = (acc[log.type] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: logs.reduce((acc, log) => {
        acc[log.severity] = (acc[log.severity] || 0) + 1;
        return acc;
      }, {})
    }
  });
});

// User management
app.get('/api/admin/users', authenticateToken, (req, res) => {
  const { active, network, limit = 50, offset = 0 } = req.query;
  
  // Generate mock users
  const users = [];
  for (let i = 0; i < parseInt(limit); i++) {
    const networks = ['avalanche', 'ethereum', 'polygon'];
    const userNetwork = network || networks[Math.floor(Math.random() * networks.length)];
    
    users.push({
      id: `user_${Date.now()}_${i}`,
      walletAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
      network: userNetwork,
      joinDate: new Date(Date.now() - Math.random() * 31536000000), // Random date within last year
      lastActivity: new Date(Date.now() - Math.random() * 86400000), // Random within last day
      transactionCount: Math.floor(Math.random() * 1000),
      totalVolume: (Math.random() * 10000).toFixed(2),
      status: Math.random() > 0.1 ? 'active' : 'inactive',
      kyc: Math.random() > 0.3 ? 'verified' : 'pending'
    });
  }
  
  res.json({
    success: true,
    users,
    pagination: {
      offset: parseInt(offset),
      limit: parseInt(limit),
      total: 12345 // Mock total
    }
  });
});

// Network performance monitoring
app.get('/api/admin/network-performance', authenticateToken, (req, res) => {
  const { network, hours = 24 } = req.query;
  
  const performanceData = [];
  const hoursCount = parseInt(hours);
  
  for (let i = hoursCount; i >= 0; i--) {
    const timestamp = moment().subtract(i, 'hours');
    performanceData.push({
      timestamp: timestamp.toISOString(),
      hour: timestamp.format('HH:mm'),
      blockTime: Math.random() * 5 + 1, // 1-6 seconds
      tps: Math.floor(Math.random() * 5000) + 500,
      gasPrice: Math.floor(Math.random() * 100) + 20,
      networkUtilization: Math.floor(Math.random() * 100),
      errors: Math.floor(Math.random() * 10),
      latency: Math.floor(Math.random() * 200) + 50
    });
  }
  
  res.json({
    success: true,
    performanceData,
    summary: {
      avgBlockTime: performanceData.reduce((sum, p) => sum + p.blockTime, 0) / performanceData.length,
      avgTps: Math.floor(performanceData.reduce((sum, p) => sum + p.tps, 0) / performanceData.length),
      avgGasPrice: Math.floor(performanceData.reduce((sum, p) => sum + p.gasPrice, 0) / performanceData.length),
      totalErrors: performanceData.reduce((sum, p) => sum + p.errors, 0),
      avgLatency: Math.floor(performanceData.reduce((sum, p) => sum + p.latency, 0) / performanceData.length)
    }
  });
});

// Security monitoring
app.get('/api/admin/security', authenticateToken, (req, res) => {
  const securityMetrics = {
    suspiciousTransactions: Math.floor(Math.random() * 50) + 10,
    blockedIPs: Math.floor(Math.random() * 20) + 5,
    failedLogins: Math.floor(Math.random() * 100) + 20,
    rateLimitHits: Math.floor(Math.random() * 200) + 50,
    securityAlerts: [
      {
        id: '1',
        type: 'SUSPICIOUS_ACTIVITY',
        description: 'Multiple failed wallet connections from IP 192.168.1.100',
        severity: 'medium',
        timestamp: new Date(Date.now() - 3600000),
        resolved: false
      },
      {
        id: '2',
        type: 'RATE_LIMIT_EXCEEDED',
        description: 'API rate limit exceeded for wallet 0x1234...5678',
        severity: 'low',
        timestamp: new Date(Date.now() - 7200000),
        resolved: true
      }
    ],
    fraudDetection: {
      totalChecks: 156789,
      flaggedTransactions: 234,
      falsePositives: 12,
      accuracy: 94.8
    }
  };
  
  res.json({
    success: true,
    security: securityMetrics
  });
});

// System configuration management
app.get('/api/admin/config', authenticateToken, (req, res) => {
  const systemConfig = {
    api: {
      rateLimit: {
        windowMs: 900000,
        maxRequests: 100
      },
      cors: {
        enabled: true,
        origins: ['http://localhost:3004']
      }
    },
    blockchain: {
      networks: ['avalanche', 'ethereum', 'polygon'],
      defaultNetwork: 'avalanche',
      gasLimits: {
        avalanche: 8000000,
        ethereum: 12000000,
        polygon: 30000000
      }
    },
    security: {
      jwtExpiration: '24h',
      encryptionEnabled: true,
      auditLogging: true
    },
    notifications: {
      emailEnabled: true,
      slackEnabled: false,
      webhookEnabled: true
    }
  };
  
  res.json({
    success: true,
    config: systemConfig
  });
});

// Serve the main dashboard page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 QuantraPay System Dashboard running on port ${PORT}`);
  console.log(`📊 Access dashboard at: http://localhost:${PORT}`);
  console.log(`🔧 API endpoints available at: http://localhost:${PORT}/api`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;