const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const moment = require('moment');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3005' }));
app.use(express.json());
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

// Mock Settlement Database
const settlementDatabase = {
  pendingSettlements: [
    {
      id: 'settle_001',
      merchantId: '1',
      merchantName: 'CryptoMart Electronics',
      amount: 1250.75,
      currency: 'AVAX',
      transactionCount: 45,
      escrowBalance: 1375.82,
      status: 'pending',
      dueDate: new Date(Date.now() + 86400000),
      createdAt: new Date(Date.now() - 3600000)
    },
    {
      id: 'settle_002',
      merchantId: '2',
      merchantName: 'Blockchain Books',
      amount: 456.30,
      currency: 'AVAX',
      transactionCount: 23,
      escrowBalance: 502.93,
      status: 'pending',
      dueDate: new Date(Date.now() + 172800000),
      createdAt: new Date(Date.now() - 7200000)
    }
  ],

  escrowAccounts: [
    {
      id: 'escrow_001',
      merchantId: '1',
      balance: 1375.82,
      lockedAmount: 125.07,
      availableAmount: 1250.75,
      currency: 'AVAX',
      lastActivity: new Date(Date.now() - 1800000),
      status: 'active'
    },
    {
      id: 'escrow_002',
      merchantId: '2',
      balance: 502.93,
      lockedAmount: 46.63,
      availableAmount: 456.30,
      currency: 'AVAX',
      lastActivity: new Date(Date.now() - 3600000),
      status: 'active'
    }
  ],

  disputes: [
    {
      id: 'dispute_001',
      transactionId: 'tx_12345',
      merchantId: '1',
      payerId: 'user_789',
      amount: 25.50,
      reason: 'Product not delivered',
      status: 'open',
      priority: 'high',
      createdAt: new Date(Date.now() - 14400000),
      assignedTo: 'settler_001'
    }
  ],

  settlementHistory: [
    {
      id: 'settle_h_001',
      merchantId: '1',
      amount: 2340.15,
      transactionCount: 87,
      settledAt: new Date(Date.now() - 86400000),
      status: 'completed',
      settlementAddress: '0x742d35Cc6634C0532925a3b8D',
      txHash: '0xabcd1234567890'
    }
  ]
};

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
};

// Auth endpoints
app.post('/api/auth/connect-wallet', async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body;

    const recoveredAddress = ethers.utils.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    const token = jwt.sign(
      { walletAddress: walletAddress.toLowerCase(), role: 'settler' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: { walletAddress: walletAddress.toLowerCase(), role: 'settler' }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Settler endpoints
app.get('/api/settler/dashboard', authenticateToken, (req, res) => {
  const totalPending = settlementDatabase.pendingSettlements.reduce((sum, s) => sum + s.amount, 0);
  const totalEscrow = settlementDatabase.escrowAccounts.reduce((sum, e) => sum + e.balance, 0);
  
  res.json({
    success: true,
    dashboard: {
      totalPendingSettlements: settlementDatabase.pendingSettlements.length,
      totalPendingAmount: totalPending,
      totalEscrowBalance: totalEscrow,
      activeDisputes: settlementDatabase.disputes.filter(d => d.status === 'open').length,
      recentSettlements: settlementDatabase.settlementHistory.slice(0, 5)
    }
  });
});

app.get('/api/settler/pending-settlements', authenticateToken, (req, res) => {
  res.json({
    success: true,
    settlements: settlementDatabase.pendingSettlements
  });
});

app.post('/api/settler/process-settlement/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const settlement = settlementDatabase.pendingSettlements.find(s => s.id === id);
  
  if (!settlement) {
    return res.status(404).json({ success: false, error: 'Settlement not found' });
  }

  // Move to history
  settlementDatabase.settlementHistory.push({
    ...settlement,
    settledAt: new Date(),
    status: 'completed',
    settlementAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
    txHash: `0x${Math.random().toString(16).substr(2, 64)}`
  });

  // Remove from pending
  const index = settlementDatabase.pendingSettlements.indexOf(settlement);
  settlementDatabase.pendingSettlements.splice(index, 1);

  res.json({ success: true, message: 'Settlement processed successfully' });
});

app.get('/api/settler/escrow-accounts', authenticateToken, (req, res) => {
  res.json({
    success: true,
    accounts: settlementDatabase.escrowAccounts
  });
});

app.get('/api/settler/disputes', authenticateToken, (req, res) => {
  res.json({
    success: true,
    disputes: settlementDatabase.disputes
  });
});

app.post('/api/settler/resolve-dispute/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { resolution, refundAmount } = req.body;
  
  const dispute = settlementDatabase.disputes.find(d => d.id === id);
  if (!dispute) {
    return res.status(404).json({ success: false, error: 'Dispute not found' });
  }

  dispute.status = 'resolved';
  dispute.resolution = resolution;
  dispute.refundAmount = refundAmount;
  dispute.resolvedAt = new Date();

  res.json({ success: true, message: 'Dispute resolved successfully' });
});

app.get('/api/settler/settlement-history', authenticateToken, (req, res) => {
  res.json({
    success: true,
    history: settlementDatabase.settlementHistory
  });
});

app.get('/api/settler/analytics', authenticateToken, (req, res) => {
  const totalSettled = settlementDatabase.settlementHistory.reduce((sum, s) => sum + s.amount, 0);
  const avgSettlementTime = 24; // hours
  
  res.json({
    success: true,
    analytics: {
      totalSettled,
      avgSettlementTime,
      disputeResolutionRate: 95.5,
      monthlyVolume: generateMonthlyData(),
      topMerchants: [
        { name: 'CryptoMart Electronics', volume: 12450.75, settlements: 45 },
        { name: 'Blockchain Books', volume: 5670.30, settlements: 23 }
      ]
    }
  });
});

function generateMonthlyData() {
  const data = [];
  for (let i = 11; i >= 0; i--) {
    data.push({
      month: moment().subtract(i, 'months').format('MMM YYYY'),
      volume: Math.floor(Math.random() * 50000) + 10000,
      settlements: Math.floor(Math.random() * 200) + 50
    });
  }
  return data;
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🔧 QuantraPay Settler Dashboard running on port ${PORT}`);
});