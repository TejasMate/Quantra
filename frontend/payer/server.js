const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Mock database for payer interface
const mockDB = {
  payers: new Map(),
  wallets: new Map(),
  transactions: new Map(),
  paymentMethods: new Map(),
  merchants: new Map(),
  qrCodes: new Map()
};

// Initialize demo merchants
initializeDemoMerchants();

// Blockchain configuration
const AVALANCHE_RPC = process.env.AVALANCHE_RPC || 'https://api.avax-test.network/ext/bc/C/rpc';
const provider = new ethers.JsonRpcProvider(AVALANCHE_RPC);

// Contract configuration
const ESCROW_FACTORY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const PAYMENT_PROCESSOR_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const PAYMENT_PROCESSOR_ABI = [
  "function processPayment(address merchant, uint256 amount, string memory description) external payable returns (bytes32)",
  "function getPaymentStatus(bytes32 paymentId) external view returns (uint8)",
  "event PaymentProcessed(bytes32 indexed paymentId, address indexed payer, address indexed merchant, uint256 amount)"
];

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'payer-interface-secret-key';

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

function initializeDemoMerchants() {
  const merchants = [
    { id: '1', name: 'Coffee Shop', category: 'food', address: ethers.Wallet.createRandom().address },
    { id: '2', name: 'Tech Store', category: 'electronics', address: ethers.Wallet.createRandom().address },
    { id: '3', name: 'Bookstore', category: 'books', address: ethers.Wallet.createRandom().address },
    { id: '4', name: 'Gas Station', category: 'fuel', address: ethers.Wallet.createRandom().address },
    { id: '5', name: 'Restaurant', category: 'food', address: ethers.Wallet.createRandom().address }
  ];

  merchants.forEach(merchant => {
    mockDB.merchants.set(merchant.id, merchant);
  });
}

// Wallet connection and payer registration
app.post('/api/auth/connect-wallet', async (req, res) => {
  try {
    const { walletAddress, signature, message, network = 'avalanche' } = req.body;
    
    // Verify wallet signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Check if payer exists
    let payer = mockDB.payers.get(walletAddress.toLowerCase());
    
    if (!payer) {
      // Create new payer
      payer = {
        id: uuidv4(),
        walletAddress: walletAddress.toLowerCase(),
        preferredNetwork: network,
        isVerified: false,
        createdAt: new Date().toISOString(),
        profile: {
          nickname: '',
          email: '',
          phone: '',
          preferences: {
            currency: 'USD',
            notifications: true,
            biometrics: false
          }
        },
        stats: {
          totalTransactions: 0,
          totalSpent: '0',
          favoritesMerchants: []
        }
      };
      mockDB.payers.set(walletAddress.toLowerCase(), payer);

      // Create wallet entry
      const wallet = {
        id: uuidv4(),
        payerId: payer.id,
        address: walletAddress.toLowerCase(),
        network: network,
        balance: '0',
        isActive: true,
        addedAt: new Date().toISOString()
      };
      mockDB.wallets.set(walletAddress.toLowerCase(), wallet);
    }

    // Generate JWT token
    const token = jwt.sign(
      { payerId: payer.id, walletAddress: payer.walletAddress },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      payer: {
        id: payer.id,
        walletAddress: payer.walletAddress,
        preferredNetwork: payer.preferredNetwork,
        isVerified: payer.isVerified
      }
    });
  } catch (error) {
    console.error('Wallet connection error:', error);
    res.status(500).json({ error: 'Failed to connect wallet' });
  }
});

// Payer profile management
app.get('/api/payer/profile', authenticateToken, async (req, res) => {
  try {
    const payer = mockDB.payers.get(req.user.walletAddress);
    if (!payer) {
      return res.status(404).json({ error: 'Payer not found' });
    }

    res.json({
      success: true,
      profile: payer.profile,
      stats: payer.stats
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

app.put('/api/payer/profile', authenticateToken, async (req, res) => {
  try {
    const payer = mockDB.payers.get(req.user.walletAddress);
    if (!payer) {
      return res.status(404).json({ error: 'Payer not found' });
    }

    const updates = req.body;
    payer.profile = { ...payer.profile, ...updates };
    payer.updatedAt = new Date().toISOString();

    mockDB.payers.set(req.user.walletAddress, payer);

    res.json({
      success: true,
      profile: payer.profile
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Wallet management
app.get('/api/payer/wallets', authenticateToken, async (req, res) => {
  try {
    const wallets = Array.from(mockDB.wallets.values())
      .filter(wallet => wallet.payerId === req.user.payerId);

    // Simulate balance fetching
    for (let wallet of wallets) {
      try {
        const balance = await provider.getBalance(wallet.address);
        wallet.balance = ethers.formatEther(balance);
      } catch (error) {
        wallet.balance = '0';
      }
    }

    res.json({
      success: true,
      wallets
    });
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({ error: 'Failed to get wallets' });
  }
});

app.post('/api/payer/wallets', authenticateToken, async (req, res) => {
  try {
    const { address, network, nickname } = req.body;
    
    // Validate address
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const wallet = {
      id: uuidv4(),
      payerId: req.user.payerId,
      address: address.toLowerCase(),
      network: network || 'avalanche',
      nickname: nickname || '',
      balance: '0',
      isActive: true,
      addedAt: new Date().toISOString()
    };

    mockDB.wallets.set(address.toLowerCase(), wallet);

    res.json({
      success: true,
      wallet
    });
  } catch (error) {
    console.error('Add wallet error:', error);
    res.status(500).json({ error: 'Failed to add wallet' });
  }
});

// Payment processing
app.post('/api/payer/payments', authenticateToken, async (req, res) => {
  try {
    const { merchantId, amount, description, paymentMethod = 'wallet' } = req.body;
    
    const merchant = mockDB.merchants.get(merchantId);
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    // Create payment transaction
    const payment = {
      id: uuidv4(),
      payerId: req.user.payerId,
      payerAddress: req.user.walletAddress,
      merchantId,
      merchantAddress: merchant.address,
      amount: amount.toString(),
      description,
      paymentMethod,
      status: 'pending',
      network: 'avalanche',
      txHash: null,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      failedAt: null,
      metadata: {
        gasUsed: null,
        gasFee: null,
        blockNumber: null
      }
    };

    // Simulate blockchain transaction
    try {
      // For demo, simulate transaction hash
      payment.txHash = ethers.keccak256(ethers.toUtf8Bytes(`payment-${payment.id}-${Date.now()}`));
      payment.status = 'confirmed';
      payment.confirmedAt = new Date().toISOString();
      payment.metadata.gasUsed = '21000';
      payment.metadata.gasFee = '0.0001';
      payment.metadata.blockNumber = Math.floor(Math.random() * 1000000);
    } catch (error) {
      payment.status = 'failed';
      payment.failedAt = new Date().toISOString();
      payment.error = error.message;
    }

    mockDB.transactions.set(payment.id, payment);

    // Update payer stats
    const payer = mockDB.payers.get(req.user.walletAddress);
    if (payer && payment.status === 'confirmed') {
      payer.stats.totalTransactions += 1;
      payer.stats.totalSpent = (parseFloat(payer.stats.totalSpent) + parseFloat(amount)).toString();
      mockDB.payers.set(req.user.walletAddress, payer);
    }

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// QR Code payment
app.post('/api/payer/qr-payment', authenticateToken, async (req, res) => {
  try {
    const { qrData } = req.body;
    
    // Parse QR code data (assume JSON format)
    let paymentData;
    try {
      paymentData = JSON.parse(qrData);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid QR code format' });
    }

    const { merchantId, amount, description, reference } = paymentData;
    
    // Process payment similar to regular payment
    const payment = {
      id: uuidv4(),
      payerId: req.user.payerId,
      payerAddress: req.user.walletAddress,
      merchantId,
      amount: amount.toString(),
      description,
      reference,
      paymentMethod: 'qr_code',
      status: 'confirmed',
      network: 'avalanche',
      txHash: ethers.keccak256(ethers.toUtf8Bytes(`qr-payment-${Date.now()}`)),
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString()
    };

    mockDB.transactions.set(payment.id, payment);

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('QR payment error:', error);
    res.status(500).json({ error: 'Failed to process QR payment' });
  }
});

// Generate payment QR code
app.post('/api/payer/generate-qr', authenticateToken, async (req, res) => {
  try {
    const { merchantId, amount, description } = req.body;
    
    const qrData = {
      merchantId,
      amount,
      description,
      payerId: req.user.payerId,
      timestamp: Date.now()
    };

    const qrCodeData = await QRCode.toDataURL(JSON.stringify(qrData));

    res.json({
      success: true,
      qrCode: qrCodeData,
      qrData
    });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Transaction history
app.get('/api/payer/transactions', authenticateToken, async (req, res) => {
  try {
    const { status, dateFrom, dateTo, page = 1, limit = 20 } = req.query;
    
    let transactions = Array.from(mockDB.transactions.values())
      .filter(tx => tx.payerId === req.user.payerId);

    // Apply filters
    if (status) {
      transactions = transactions.filter(tx => tx.status === status);
    }
    if (dateFrom) {
      transactions = transactions.filter(tx => new Date(tx.createdAt) >= new Date(dateFrom));
    }
    if (dateTo) {
      transactions = transactions.filter(tx => new Date(tx.createdAt) <= new Date(dateTo));
    }

    // Sort by creation date (newest first)
    transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedTransactions = transactions.slice(startIndex, startIndex + parseInt(limit));

    // Add merchant details
    const enrichedTransactions = paginatedTransactions.map(tx => {
      const merchant = mockDB.merchants.get(tx.merchantId);
      return {
        ...tx,
        merchant: merchant || { name: 'Unknown Merchant', category: 'unknown' }
      };
    });

    res.json({
      success: true,
      transactions: enrichedTransactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: transactions.length,
        pages: Math.ceil(transactions.length / limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Merchant discovery
app.get('/api/payer/merchants', authenticateToken, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 10 } = req.query;
    
    let merchants = Array.from(mockDB.merchants.values());

    // Apply filters
    if (category) {
      merchants = merchants.filter(m => m.category === category);
    }
    if (search) {
      merchants = merchants.filter(m => 
        m.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedMerchants = merchants.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      success: true,
      merchants: paginatedMerchants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: merchants.length,
        pages: Math.ceil(merchants.length / limit)
      }
    });
  } catch (error) {
    console.error('Get merchants error:', error);
    res.status(500).json({ error: 'Failed to get merchants' });
  }
});

// Payment analytics for payer
app.get('/api/payer/analytics', authenticateToken, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    const transactions = Array.from(mockDB.transactions.values())
      .filter(tx => tx.payerId === req.user.payerId && tx.status === 'confirmed');

    const totalSpent = transactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const totalTransactions = transactions.length;
    
    // Category spending
    const categorySpending = {};
    transactions.forEach(tx => {
      const merchant = mockDB.merchants.get(tx.merchantId);
      const category = merchant?.category || 'other';
      categorySpending[category] = (categorySpending[category] || 0) + parseFloat(tx.amount);
    });

    // Monthly spending chart data
    const monthlyData = [];
    const days = period === '30d' ? 30 : period === '7d' ? 7 : 90;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayTransactions = transactions.filter(tx => {
        const txDate = new Date(tx.createdAt);
        return txDate.toDateString() === date.toDateString();
      });
      
      monthlyData.push({
        date: date.toISOString().split('T')[0],
        amount: dayTransactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0),
        count: dayTransactions.length
      });
    }

    res.json({
      success: true,
      analytics: {
        totalSpent: totalSpent.toFixed(2),
        totalTransactions,
        averageTransaction: totalTransactions > 0 ? (totalSpent / totalTransactions).toFixed(2) : '0',
        categorySpending,
        monthlyData,
        topMerchants: getTopMerchants(transactions, 5)
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

function getTopMerchants(transactions, limit) {
  const merchantSpending = {};
  
  transactions.forEach(tx => {
    const merchant = mockDB.merchants.get(tx.merchantId);
    if (merchant) {
      if (!merchantSpending[merchant.id]) {
        merchantSpending[merchant.id] = {
          merchant,
          totalSpent: 0,
          transactionCount: 0
        };
      }
      merchantSpending[merchant.id].totalSpent += parseFloat(tx.amount);
      merchantSpending[merchant.id].transactionCount += 1;
    }
  });

  return Object.values(merchantSpending)
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
}

// Payment methods management
app.get('/api/payer/payment-methods', authenticateToken, async (req, res) => {
  try {
    const paymentMethods = Array.from(mockDB.paymentMethods.values())
      .filter(pm => pm.payerId === req.user.payerId);

    res.json({
      success: true,
      paymentMethods
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: 'Failed to get payment methods' });
  }
});

app.post('/api/payer/payment-methods', authenticateToken, async (req, res) => {
  try {
    const { type, details, isDefault = false } = req.body;
    
    const paymentMethod = {
      id: uuidv4(),
      payerId: req.user.payerId,
      type, // 'wallet', 'card', 'bank'
      details,
      isDefault,
      isActive: true,
      addedAt: new Date().toISOString()
    };

    // If this is set as default, update others
    if (isDefault) {
      Array.from(mockDB.paymentMethods.values())
        .filter(pm => pm.payerId === req.user.payerId)
        .forEach(pm => {
          pm.isDefault = false;
          mockDB.paymentMethods.set(pm.id, pm);
        });
    }

    mockDB.paymentMethods.set(paymentMethod.id, paymentMethod);

    res.json({
      success: true,
      paymentMethod
    });
  } catch (error) {
    console.error('Add payment method error:', error);
    res.status(500).json({ error: 'Failed to add payment method' });
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
  console.log(`Payer Interface Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view the dashboard`);
});