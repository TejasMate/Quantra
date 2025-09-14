const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Mock database for DAO governance
const mockDB = {
  members: new Map(),
  proposals: new Map(),
  votes: new Map(),
  regions: new Map(),
  parameters: new Map(),
  emergencyActions: new Map()
};

// Initialize default regions and parameters
initializeDefaultData();

// Blockchain configuration
const AVALANCHE_RPC = process.env.AVALANCHE_RPC || 'https://api.avax-test.network/ext/bc/C/rpc';
const provider = new ethers.JsonRpcProvider(AVALANCHE_RPC);

// DAO Contract configuration
const DAO_CONTRACT_ADDRESS = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const DAO_CONTRACT_ABI = [
  "function createProposal(string memory description, uint256 votingPeriod) external returns (uint256)",
  "function vote(uint256 proposalId, bool support) external",
  "function executeProposal(uint256 proposalId) external",
  "function getProposal(uint256 proposalId) external view returns (tuple(string description, uint256 forVotes, uint256 againstVotes, bool executed, uint256 deadline))",
  "event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string description)",
  "event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight)"
];

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'dao-governance-secret-key';

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

// Check DAO membership
const checkMembership = (req, res, next) => {
  const member = mockDB.members.get(req.user.walletAddress);
  if (!member || !member.isActive) {
    return res.status(403).json({ error: 'DAO membership required' });
  }
  req.member = member;
  next();
};

function initializeDefaultData() {
  // Initialize regions
  const regions = [
    { id: 'NA', name: 'North America', status: 'active', manager: null },
    { id: 'EU', name: 'Europe', status: 'active', manager: null },
    { id: 'APAC', name: 'Asia Pacific', status: 'active', manager: null },
    { id: 'LATAM', name: 'Latin America', status: 'pending', manager: null },
    { id: 'MEA', name: 'Middle East & Africa', status: 'pending', manager: null }
  ];

  regions.forEach(region => {
    mockDB.regions.set(region.id, region);
  });

  // Initialize system parameters
  const parameters = [
    { key: 'escrow_fee_rate', value: '0.5', description: 'Escrow service fee percentage' },
    { key: 'settlement_time', value: '86400', description: 'Default settlement time in seconds' },
    { key: 'dispute_resolution_time', value: '604800', description: 'Dispute resolution period in seconds' },
    { key: 'min_stake_amount', value: '1000', description: 'Minimum stake amount for DAO participation' },
    { key: 'voting_period', value: '259200', description: 'Default voting period in seconds (3 days)' },
    { key: 'proposal_threshold', value: '10000', description: 'Minimum tokens required to create proposal' }
  ];

  parameters.forEach(param => {
    mockDB.parameters.set(param.key, param);
  });
}

// Wallet connection and DAO member authentication
app.post('/api/auth/connect-wallet', async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body;
    
    // Verify wallet signature
    const recoveredAddress = ethers.verifyMessage(message, signature);
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    // Check if member exists
    let member = mockDB.members.get(walletAddress.toLowerCase());
    
    if (!member) {
      // Create new member with pending status
      member = {
        id: uuidv4(),
        walletAddress: walletAddress.toLowerCase(),
        role: 'member',
        votingPower: 0,
        isActive: false,
        joinedAt: new Date().toISOString(),
        proposals: [],
        votes: []
      };
      mockDB.members.set(walletAddress.toLowerCase(), member);
    }

    // Generate JWT token
    const token = jwt.sign(
      { memberId: member.id, walletAddress: member.walletAddress, role: member.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      member: {
        id: member.id,
        walletAddress: member.walletAddress,
        role: member.role,
        votingPower: member.votingPower,
        isActive: member.isActive
      }
    });
  } catch (error) {
    console.error('Wallet connection error:', error);
    res.status(500).json({ error: 'Failed to connect wallet' });
  }
});

// Proposal management
app.post('/api/dao/proposals', authenticateToken, checkMembership, async (req, res) => {
  try {
    const { title, description, type, details, votingPeriod = 3 } = req.body;
    
    // Check proposal threshold (simplified for demo)
    if (req.member.votingPower < 10000) {
      return res.status(403).json({ error: 'Insufficient voting power to create proposal' });
    }

    const proposal = {
      id: uuidv4(),
      title,
      description,
      type, // 'parameter', 'region', 'emergency', 'general'
      details,
      proposerId: req.member.id,
      proposerAddress: req.member.walletAddress,
      status: 'active',
      forVotes: 0,
      againstVotes: 0,
      abstainVotes: 0,
      totalVotes: 0,
      votingPeriod: votingPeriod * 24 * 60 * 60 * 1000, // Convert days to milliseconds
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (votingPeriod * 24 * 60 * 60 * 1000)).toISOString(),
      executed: false,
      voters: new Set()
    };

    mockDB.proposals.set(proposal.id, proposal);

    // Add to member's proposals
    req.member.proposals.push(proposal.id);
    mockDB.members.set(req.member.walletAddress, req.member);

    res.json({
      success: true,
      proposal: {
        ...proposal,
        voters: Array.from(proposal.voters)
      }
    });
  } catch (error) {
    console.error('Proposal creation error:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

app.get('/api/dao/proposals', authenticateToken, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;
    
    let proposals = Array.from(mockDB.proposals.values());

    // Apply filters
    if (status) {
      proposals = proposals.filter(p => p.status === status);
    }
    if (type) {
      proposals = proposals.filter(p => p.type === type);
    }

    // Sort by creation date (newest first)
    proposals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedProposals = proposals.slice(startIndex, startIndex + parseInt(limit));

    // Convert Sets to Arrays for JSON serialization
    const formattedProposals = paginatedProposals.map(proposal => ({
      ...proposal,
      voters: Array.from(proposal.voters)
    }));

    res.json({
      success: true,
      proposals: formattedProposals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: proposals.length,
        pages: Math.ceil(proposals.length / limit)
      }
    });
  } catch (error) {
    console.error('Get proposals error:', error);
    res.status(500).json({ error: 'Failed to get proposals' });
  }
});

app.get('/api/dao/proposals/:proposalId', authenticateToken, async (req, res) => {
  try {
    const { proposalId } = req.params;
    const proposal = mockDB.proposals.get(proposalId);
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    res.json({
      success: true,
      proposal: {
        ...proposal,
        voters: Array.from(proposal.voters)
      }
    });
  } catch (error) {
    console.error('Get proposal error:', error);
    res.status(500).json({ error: 'Failed to get proposal' });
  }
});

// Voting system
app.post('/api/dao/proposals/:proposalId/vote', authenticateToken, checkMembership, async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { support, reason } = req.body; // support: 'for', 'against', 'abstain'
    
    const proposal = mockDB.proposals.get(proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check if voting period is still active
    if (new Date() > new Date(proposal.expiresAt)) {
      return res.status(400).json({ error: 'Voting period has ended' });
    }

    // Check if already voted
    if (proposal.voters.has(req.member.walletAddress)) {
      return res.status(400).json({ error: 'Already voted on this proposal' });
    }

    // Cast vote
    const vote = {
      id: uuidv4(),
      proposalId,
      voterId: req.member.id,
      voterAddress: req.member.walletAddress,
      support,
      reason,
      votingPower: req.member.votingPower || 1000, // Default voting power for demo
      timestamp: new Date().toISOString()
    };

    mockDB.votes.set(vote.id, vote);

    // Update proposal vote counts
    switch (support) {
      case 'for':
        proposal.forVotes += vote.votingPower;
        break;
      case 'against':
        proposal.againstVotes += vote.votingPower;
        break;
      case 'abstain':
        proposal.abstainVotes += vote.votingPower;
        break;
    }

    proposal.totalVotes += vote.votingPower;
    proposal.voters.add(req.member.walletAddress);

    mockDB.proposals.set(proposalId, proposal);

    // Add to member's votes
    req.member.votes.push(vote.id);
    mockDB.members.set(req.member.walletAddress, req.member);

    res.json({
      success: true,
      vote,
      proposal: {
        ...proposal,
        voters: Array.from(proposal.voters)
      }
    });
  } catch (error) {
    console.error('Voting error:', error);
    res.status(500).json({ error: 'Failed to cast vote' });
  }
});

// Proposal execution
app.post('/api/dao/proposals/:proposalId/execute', authenticateToken, checkMembership, async (req, res) => {
  try {
    const { proposalId } = req.params;
    const proposal = mockDB.proposals.get(proposalId);
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check if voting period has ended
    if (new Date() < new Date(proposal.expiresAt)) {
      return res.status(400).json({ error: 'Voting period is still active' });
    }

    // Check if already executed
    if (proposal.executed) {
      return res.status(400).json({ error: 'Proposal already executed' });
    }

    // Check if proposal passed (simple majority for demo)
    const passed = proposal.forVotes > proposal.againstVotes;
    
    if (!passed) {
      proposal.status = 'rejected';
      proposal.executed = true;
      proposal.executedAt = new Date().toISOString();
      mockDB.proposals.set(proposalId, proposal);
      
      return res.json({
        success: true,
        proposal: {
          ...proposal,
          voters: Array.from(proposal.voters)
        },
        result: 'rejected'
      });
    }

    // Execute proposal based on type
    let executionResult = 'executed';
    
    switch (proposal.type) {
      case 'parameter':
        // Update system parameter
        if (proposal.details.parameterKey && proposal.details.newValue) {
          const param = mockDB.parameters.get(proposal.details.parameterKey);
          if (param) {
            param.value = proposal.details.newValue;
            param.lastUpdated = new Date().toISOString();
            mockDB.parameters.set(proposal.details.parameterKey, param);
          }
        }
        break;
        
      case 'region':
        // Update region configuration
        if (proposal.details.regionId) {
          const region = mockDB.regions.get(proposal.details.regionId);
          if (region) {
            Object.assign(region, proposal.details.changes);
            region.lastUpdated = new Date().toISOString();
            mockDB.regions.set(proposal.details.regionId, region);
          }
        }
        break;
        
      case 'emergency':
        // Execute emergency action
        const emergencyAction = {
          id: uuidv4(),
          proposalId,
          action: proposal.details.action,
          executedBy: req.member.walletAddress,
          executedAt: new Date().toISOString(),
          status: 'executed'
        };
        mockDB.emergencyActions.set(emergencyAction.id, emergencyAction);
        break;
    }

    proposal.status = 'executed';
    proposal.executed = true;
    proposal.executedAt = new Date().toISOString();
    proposal.executedBy = req.member.walletAddress;
    
    mockDB.proposals.set(proposalId, proposal);

    res.json({
      success: true,
      proposal: {
        ...proposal,
        voters: Array.from(proposal.voters)
      },
      result: executionResult
    });
  } catch (error) {
    console.error('Proposal execution error:', error);
    res.status(500).json({ error: 'Failed to execute proposal' });
  }
});

// Region management
app.get('/api/dao/regions', authenticateToken, async (req, res) => {
  try {
    const regions = Array.from(mockDB.regions.values());
    res.json({
      success: true,
      regions
    });
  } catch (error) {
    console.error('Get regions error:', error);
    res.status(500).json({ error: 'Failed to get regions' });
  }
});

app.put('/api/dao/regions/:regionId', authenticateToken, checkMembership, async (req, res) => {
  try {
    const { regionId } = req.params;
    const updates = req.body;
    
    const region = mockDB.regions.get(regionId);
    if (!region) {
      return res.status(404).json({ error: 'Region not found' });
    }

    // Check permissions (simplified for demo)
    if (req.member.role !== 'admin' && req.member.role !== 'region_manager') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    Object.assign(region, updates);
    region.lastUpdated = new Date().toISOString();
    region.updatedBy = req.member.walletAddress;

    mockDB.regions.set(regionId, region);

    res.json({
      success: true,
      region
    });
  } catch (error) {
    console.error('Update region error:', error);
    res.status(500).json({ error: 'Failed to update region' });
  }
});

// Parameter management
app.get('/api/dao/parameters', authenticateToken, async (req, res) => {
  try {
    const parameters = Array.from(mockDB.parameters.values());
    res.json({
      success: true,
      parameters
    });
  } catch (error) {
    console.error('Get parameters error:', error);
    res.status(500).json({ error: 'Failed to get parameters' });
  }
});

// Emergency actions
app.post('/api/dao/emergency', authenticateToken, checkMembership, async (req, res) => {
  try {
    const { action, reason, severity } = req.body;
    
    // Check emergency permissions
    if (req.member.role !== 'admin' && req.member.role !== 'emergency_responder') {
      return res.status(403).json({ error: 'Emergency action permissions required' });
    }

    const emergencyAction = {
      id: uuidv4(),
      action,
      reason,
      severity, // 'low', 'medium', 'high', 'critical'
      initiatedBy: req.member.walletAddress,
      initiatedAt: new Date().toISOString(),
      status: 'active',
      autoRevertAt: severity === 'critical' ? 
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null // Auto-revert critical actions after 24h
    };

    mockDB.emergencyActions.set(emergencyAction.id, emergencyAction);

    res.json({
      success: true,
      emergencyAction
    });
  } catch (error) {
    console.error('Emergency action error:', error);
    res.status(500).json({ error: 'Failed to execute emergency action' });
  }
});

app.get('/api/dao/emergency', authenticateToken, async (req, res) => {
  try {
    const emergencyActions = Array.from(mockDB.emergencyActions.values())
      .sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt));

    res.json({
      success: true,
      emergencyActions
    });
  } catch (error) {
    console.error('Get emergency actions error:', error);
    res.status(500).json({ error: 'Failed to get emergency actions' });
  }
});

// DAO analytics
app.get('/api/dao/analytics', authenticateToken, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate analytics
    const totalProposals = mockDB.proposals.size;
    const activeProposals = Array.from(mockDB.proposals.values()).filter(p => p.status === 'active').length;
    const totalMembers = mockDB.members.size;
    const activeMembers = Array.from(mockDB.members.values()).filter(m => m.isActive).length;
    const totalVotes = mockDB.votes.size;

    // Proposal statistics by type
    const proposalsByType = {};
    Array.from(mockDB.proposals.values()).forEach(proposal => {
      proposalsByType[proposal.type] = (proposalsByType[proposal.type] || 0) + 1;
    });

    // Participation rates
    const participationData = [];
    const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      participationData.push({
        date: date.toISOString().split('T')[0],
        proposals: Math.floor(Math.random() * 5),
        votes: Math.floor(Math.random() * 50),
        participation: (60 + Math.random() * 30).toFixed(1)
      });
    }

    res.json({
      success: true,
      analytics: {
        totalProposals,
        activeProposals,
        totalMembers,
        activeMembers,
        totalVotes,
        proposalsByType,
        participationData,
        averageParticipation: (70 + Math.random() * 20).toFixed(1)
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Member management
app.get('/api/dao/members', authenticateToken, async (req, res) => {
  try {
    const members = Array.from(mockDB.members.values())
      .map(member => ({
        ...member,
        proposals: member.proposals.length,
        votes: member.votes.length
      }));

    res.json({
      success: true,
      members
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Failed to get members' });
  }
});

// Member activation (for demo purposes)
app.post('/api/dao/members/activate', authenticateToken, async (req, res) => {
  try {
    const member = mockDB.members.get(req.user.walletAddress);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    member.isActive = true;
    member.votingPower = 1000; // Default voting power
    member.activatedAt = new Date().toISOString();

    mockDB.members.set(req.user.walletAddress, member);

    res.json({
      success: true,
      member
    });
  } catch (error) {
    console.error('Member activation error:', error);
    res.status(500).json({ error: 'Failed to activate member' });
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
  console.log(`DAO Governance Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view the dashboard`);
});