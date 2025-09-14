const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Mock database for demo
const mockDB = {
  merchants: new Map(),
  paymentMethods: new Map(),
  escrows: new Map(),
  transactions: new Map(),
  disputes: new Map()
};

// Blockchain configuration
const AVALANCHE_RPC = process.env.AVALANCHE_RPC || 'https://api.avax-test.network/ext/bc/C/rpc';
const provider = new ethers.JsonRpcProvider(AVALANCHE_RPC);

// Contract ABIs and addresses (from deployed contracts)
const ESCROW_FACTORY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ESCROW_FACTORY_ABI = [
  "function createEscrow(address _merchant, address _customer, uint256 _amount, uint256 _settlementTime, string memory _description) external returns (address)",
  "function getEscrowsByMerchant(address _merchant) external view returns (address[])",
  "event EscrowCreated(address indexed escrow, address indexed merchant, address indexed customer, uint256 amount)"
];

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'merchant-secret-key';

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Wallet connection and merchant registration
app.post('/api/auth/connect-wallet', async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body;
    
    // Verify wallet signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Check if merchant exists
    let merchant = mockDB.merchants.get(walletAddress.toLowerCase());
    
    if (!merchant) {
      // Create new merchant
      merchant = {
        id: uuidv4(),
        walletAddress: walletAddress.toLowerCase(),
        businessName: '',
        email: '',
        status: 'pending_kyc',
        createdAt: new Date().toISOString(),
        settings: {
          notifications: true,
          autoSettle: false,
          settlementTime: 24 * 60 * 60 // 24 hours in seconds
        }
      };
      mockDB.merchants.set(walletAddress.toLowerCase(), merchant);
    }

    // Generate JWT token
    const token = jwt.sign(
      { merchantId: merchant.id, walletAddress: merchant.walletAddress },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      merchant: {
        id: merchant.id,
        walletAddress: merchant.walletAddress,
        businessName: merchant.businessName,
        status: merchant.status
      }
    });
  } catch (error) {
    console.error('Wallet connection error:', error);
    res.status(500).json({ error: 'Failed to connect wallet' });
  }
});

// Complete merchant profile
app.post('/api/merchant/profile', authenticateToken, async (req, res) => {
  try {
    const { businessName, email, businessType, address, phone } = req.body;
    const merchant = mockDB.merchants.get(req.user.walletAddress);
    
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Update merchant profile
    Object.assign(merchant, {
      businessName,
      email,
      businessType,
      address,
      phone,
      status: 'active', // In real system, would be 'pending_verification'
      updatedAt: new Date().toISOString()
    });

    mockDB.merchants.set(req.user.walletAddress, merchant);

    res.json({
      success: true,
      merchant: {
        id: merchant.id,
        walletAddress: merchant.walletAddress,
        businessName: merchant.businessName,
        email: merchant.email,
        status: merchant.status
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Payment method management
app.post('/api/merchant/payment-methods', authenticateToken, async (req, res) => {
  try {
    const { type, currency, isActive, configuration } = req.body;
    
    const paymentMethod = {
      id: uuidv4(),
      merchantId: req.user.merchantId,
      type,
      currency,
      isActive: isActive !== false,
      configuration,
      createdAt: new Date().toISOString()
    };

    mockDB.paymentMethods.set(paymentMethod.id, paymentMethod);

    res.json({
      success: true,
      paymentMethod
    });
  } catch (error) {
    console.error('Payment method creation error:', error);
    res.status(500).json({ error: 'Failed to create payment method' });
  }
});

app.get('/api/merchant/payment-methods', authenticateToken, async (req, res) => {
  try {
    const paymentMethods = Array.from(mockDB.paymentMethods.values())
      .filter(pm => pm.merchantId === req.user.merchantId);

    res.json({
      success: true,
      paymentMethods
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: 'Failed to get payment methods' });
  }
});

// Escrow management
app.post('/api/merchant/escrows', authenticateToken, async (req, res) => {
  try {
    const { customerAddress, amount, description, settlementTime } = req.body;
    
    // Create escrow on blockchain
    const factoryContract = new ethers.Contract(
      ESCROW_FACTORY_ADDRESS,
      ESCROW_FACTORY_ABI,
      provider
    );

    // For demo purposes, we'll simulate the blockchain interaction
    const escrowAddress = ethers.getCreateAddress({
      from: ESCROW_FACTORY_ADDRESS,
      nonce: Math.floor(Math.random() * 1000000)
    });

    const escrow = {
      id: uuidv4(),
      escrowAddress,
      merchantId: req.user.merchantId,
      merchantAddress: req.user.walletAddress,
      customerAddress: customerAddress.toLowerCase(),
      amount: ethers.parseEther(amount.toString()).toString(),
      description,
      settlementTime: settlementTime || 24 * 60 * 60,
      status: 'active',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (settlementTime || 24 * 60 * 60) * 1000).toISOString()
    };

    mockDB.escrows.set(escrow.id, escrow);

    res.json({
      success: true,
      escrow: {
        ...escrow,
        amount: ethers.formatEther(escrow.amount)
      }
    });
  } catch (error) {
    console.error('Escrow creation error:', error);
    res.status(500).json({ error: 'Failed to create escrow' });
  }
});

app.get('/api/merchant/escrows', authenticateToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    let escrows = Array.from(mockDB.escrows.values())
      .filter(escrow => escrow.merchantId === req.user.merchantId);

    if (status) {
      escrows = escrows.filter(escrow => escrow.status === status);
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedEscrows = escrows.slice(startIndex, startIndex + parseInt(limit));

    // Format amounts for display
    const formattedEscrows = paginatedEscrows.map(escrow => ({
      ...escrow,
      amount: ethers.formatEther(escrow.amount)
    }));

    res.json({
      success: true,
      escrows: formattedEscrows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: escrows.length,
        pages: Math.ceil(escrows.length / limit)
      }
    });
  } catch (error) {
    console.error('Get escrows error:', error);
    res.status(500).json({ error: 'Failed to get escrows' });
  }
});

// Transaction monitoring
app.get('/api/merchant/transactions', authenticateToken, async (req, res) => {
  try {
    const { status, dateFrom, dateTo, page = 1, limit = 10 } = req.query;
    
    // Generate mock transaction data
    const transactions = [];
    for (let i = 0; i < 50; i++) {
      const transaction = {
        id: uuidv4(),
        merchantId: req.user.merchantId,
        amount: (Math.random() * 1000).toFixed(2),
        currency: 'AVAX',
        status: ['completed', 'pending', 'failed'][Math.floor(Math.random() * 3)],
        type: ['payment', 'refund', 'settlement'][Math.floor(Math.random() * 3)],
        customerAddress: ethers.Wallet.createRandom().address,
        txHash: ethers.keccak256(ethers.toUtf8Bytes(`tx-${i}`)),
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      };
      transactions.push(transaction);
    }

    // Apply filters
    let filteredTransactions = transactions;
    if (status) {
      filteredTransactions = filteredTransactions.filter(tx => tx.status === status);
    }
    if (dateFrom) {
      filteredTransactions = filteredTransactions.filter(tx => new Date(tx.createdAt) >= new Date(dateFrom));
    }
    if (dateTo) {
      filteredTransactions = filteredTransactions.filter(tx => new Date(tx.createdAt) <= new Date(dateTo));
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      success: true,
      transactions: paginatedTransactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredTransactions.length,
        pages: Math.ceil(filteredTransactions.length / limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Analytics
app.get('/api/merchant/analytics', authenticateToken, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    // Generate mock analytics data
    const now = new Date();
    const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
    
    const analytics = {
      totalRevenue: (Math.random() * 10000).toFixed(2),
      totalTransactions: Math.floor(Math.random() * 1000),
      successRate: (85 + Math.random() * 10).toFixed(1),
      avgTransactionValue: (Math.random() * 100).toFixed(2),
      chartData: []
    };

    // Generate chart data
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      analytics.chartData.push({
        date: date.toISOString().split('T')[0],
        revenue: (Math.random() * 1000).toFixed(2),
        transactions: Math.floor(Math.random() * 100)
      });
    }

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Dispute management
app.get('/api/merchant/disputes', authenticateToken, async (req, res) => {
  try {
    const disputes = Array.from(mockDB.disputes.values())
      .filter(dispute => dispute.merchantId === req.user.merchantId);

    res.json({
      success: true,
      disputes
    });
  } catch (error) {
    console.error('Get disputes error:', error);
    res.status(500).json({ error: 'Failed to get disputes' });
  }
});

app.post('/api/merchant/disputes/:disputeId/respond', authenticateToken, async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { response, evidence } = req.body;
    
    const dispute = mockDB.disputes.get(disputeId);
    if (!dispute || dispute.merchantId !== req.user.merchantId) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    dispute.merchantResponse = response;
    dispute.evidence = evidence;
    dispute.status = 'under_review';
    dispute.respondedAt = new Date().toISOString();

    mockDB.disputes.set(disputeId, dispute);

    res.json({
      success: true,
      dispute
    });
  } catch (error) {
    console.error('Dispute response error:', error);
    res.status(500).json({ error: 'Failed to respond to dispute' });
  }
});

// Settings management
app.get('/api/merchant/settings', authenticateToken, async (req, res) => {
  try {
    const merchant = mockDB.merchants.get(req.user.walletAddress);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    res.json({
      success: true,
      settings: merchant.settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

app.put('/api/merchant/settings', authenticateToken, async (req, res) => {
  try {
    const merchant = mockDB.merchants.get(req.user.walletAddress);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    merchant.settings = { ...merchant.settings, ...req.body };
    merchant.updatedAt = new Date().toISOString();

    mockDB.merchants.set(req.user.walletAddress, merchant);

    res.json({
      success: true,
      settings: merchant.settings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Serve the dashboard HTML
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Merchant Dashboard Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view the dashboard`);
});