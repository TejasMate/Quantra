// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title MerchantTreasury
 * @dev Treasury contract controlled by DAO governance for protocol fees and slashed collateral
 */
contract MerchantTreasury is ReentrancyGuard, Pausable, AccessControl {
    using SafeERC20 for IERC20;
    using Address for address payable;
    
    // Roles
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant TREASURY_MANAGER_ROLE = keccak256("TREASURY_MANAGER_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    // Treasury categories
    enum FundCategory {
        PROTOCOL_FEES,
        SLASHED_COLLATERAL,
        GRANTS,
        OPERATIONS,
        EMERGENCY_FUND,
        STAKING_REWARDS
    }
    
    struct FundAllocation {
        uint256 totalAmount;
        uint256 allocatedAmount;
        uint256 spentAmount;
        bool active;
    }
    
    struct Proposal {
        address recipient;
        uint256 amount;
        address token;
        FundCategory category;
        string description;
        bool executed;
        uint256 createdAt;
        uint256 executedAt;
    }
    
    // State variables
    mapping(FundCategory => mapping(address => FundAllocation)) public fundAllocations;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => bool) public supportedTokens;
    mapping(address => uint256) public tokenBalances;
    
    uint256 public proposalCounter;
    uint256 public emergencyWithdrawalLimit = 1000000e18; // 1M tokens
    uint256 public dailyWithdrawalLimit = 100000e18; // 100K tokens per day
    mapping(uint256 => uint256) public dailyWithdrawals; // day => amount
    
    // Events
    event FundsReceived(
        address indexed from,
        address indexed token,
        uint256 amount,
        FundCategory category
    );
    
    event FundsAllocated(
        FundCategory indexed category,
        address indexed token,
        uint256 amount
    );
    
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed recipient,
        uint256 amount,
        address indexed token,
        FundCategory category
    );
    
    event ProposalExecuted(
        uint256 indexed proposalId,
        address indexed recipient,
        uint256 amount,
        address indexed token
    );
    
    event EmergencyWithdrawal(
        address indexed token,
        address indexed recipient,
        uint256 amount,
        string reason
    );
    
    event TokenSupportUpdated(address indexed token, bool supported);
    
    modifier onlyGovernor() {
        require(hasRole(GOVERNOR_ROLE, msg.sender), "Not a governor");
        _;
    }
    
    modifier onlyTreasuryManager() {
        require(hasRole(TREASURY_MANAGER_ROLE, msg.sender), "Not a treasury manager");
        _;
    }
    
    modifier onlyEmergency() {
        require(hasRole(EMERGENCY_ROLE, msg.sender), "Not authorized for emergency");
        _;
    }
    
    modifier supportedToken(address token) {
        require(supportedTokens[token] || token == address(0), "Token not supported");
        _;
    }
    
    constructor(address governor, address treasuryManager) {
        _grantRole(DEFAULT_ADMIN_ROLE, governor);
        _grantRole(GOVERNOR_ROLE, governor);
        _grantRole(TREASURY_MANAGER_ROLE, treasuryManager);
        _grantRole(EMERGENCY_ROLE, governor);
        
        // Support ETH by default
        supportedTokens[address(0)] = true;
        emit TokenSupportUpdated(address(0), true);
    }
    
    /**
     * @dev Receive ETH deposits
     */
    receive() external payable {
        _recordFunds(msg.sender, address(0), msg.value, FundCategory.PROTOCOL_FEES);
    }
    
    /**
     * @dev Deposit tokens to treasury
     */
    function depositTokens(
        address token,
        uint256 amount,
        FundCategory category
    ) external nonReentrant supportedToken(token) {
        require(amount > 0, "Amount must be > 0");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _recordFunds(msg.sender, token, amount, category);
    }
    
    /**
     * @dev Deposit ETH to treasury
     */
    function depositETH(FundCategory category) external payable nonReentrant {
        require(msg.value > 0, "Amount must be > 0");
        _recordFunds(msg.sender, address(0), msg.value, category);
    }
    
    /**
     * @dev Record funds internally
     */
    function _recordFunds(
        address from,
        address token,
        uint256 amount,
        FundCategory category
    ) internal {
        tokenBalances[token] += amount;
        
        FundAllocation storage allocation = fundAllocations[category][token];
        allocation.totalAmount += amount;
        allocation.active = true;
        
        emit FundsReceived(from, token, amount, category);
    }
    
    /**
     * @dev Create a spending proposal
     */
    function createProposal(
        address recipient,
        uint256 amount,
        address token,
        FundCategory category,
        string memory description
    ) external onlyTreasuryManager supportedToken(token) returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(bytes(description).length > 0, "Description required");
        
        // Check if funds are available
        FundAllocation storage allocation = fundAllocations[category][token];
        require(allocation.totalAmount >= allocation.spentAmount + amount, "Insufficient funds");
        
        uint256 proposalId = proposalCounter++;
        proposals[proposalId] = Proposal({
            recipient: recipient,
            amount: amount,
            token: token,
            category: category,
            description: description,
            executed: false,
            createdAt: block.timestamp,
            executedAt: 0
        });
        
        emit ProposalCreated(proposalId, recipient, amount, token, category);
        return proposalId;
    }
    
    /**
     * @dev Execute a proposal (only by governor/DAO)
     */
    function executeProposal(uint256 proposalId) 
        external 
        onlyGovernor 
        nonReentrant 
        whenNotPaused 
    {
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Already executed");
        require(proposal.recipient != address(0), "Invalid proposal");
        
        // Check daily withdrawal limits
        uint256 today = block.timestamp / 1 days;
        require(
            dailyWithdrawals[today] + proposal.amount <= dailyWithdrawalLimit,
            "Daily limit exceeded"
        );
        
        // Update allocations
        FundAllocation storage allocation = fundAllocations[proposal.category][proposal.token];
        require(
            allocation.totalAmount >= allocation.spentAmount + proposal.amount,
            "Insufficient category funds"
        );
        
        allocation.spentAmount += proposal.amount;
        dailyWithdrawals[today] += proposal.amount;
        tokenBalances[proposal.token] -= proposal.amount;
        
        // Execute transfer
        if (proposal.token == address(0)) {
            payable(proposal.recipient).sendValue(proposal.amount);
        } else {
            IERC20(proposal.token).safeTransfer(proposal.recipient, proposal.amount);
        }
        
        proposal.executed = true;
        proposal.executedAt = block.timestamp;
        
        emit ProposalExecuted(
            proposalId,
            proposal.recipient,
            proposal.amount,
            proposal.token
        );
    }
    
    /**
     * @dev Emergency withdrawal (limited amount)
     */
    function emergencyWithdraw(
        address token,
        address recipient,
        uint256 amount,
        string memory reason
    ) external onlyEmergency nonReentrant supportedToken(token) {
        require(amount <= emergencyWithdrawalLimit, "Exceeds emergency limit");
        require(tokenBalances[token] >= amount, "Insufficient balance");
        require(bytes(reason).length > 0, "Reason required");
        
        tokenBalances[token] -= amount;
        
        if (token == address(0)) {
            payable(recipient).sendValue(amount);
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
        
        emit EmergencyWithdrawal(token, recipient, amount, reason);
    }
    
    /**
     * @dev Add/remove supported tokens
     */
    function updateTokenSupport(address token, bool supported) 
        external 
        onlyGovernor 
    {
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }
    
    /**
     * @dev Update withdrawal limits
     */
    function updateWithdrawalLimits(
        uint256 newDailyLimit,
        uint256 newEmergencyLimit
    ) external onlyGovernor {
        dailyWithdrawalLimit = newDailyLimit;
        emergencyWithdrawalLimit = newEmergencyLimit;
    }
    
    /**
     * @dev Allocate funds to categories
     */
    function allocateFunds(
        FundCategory category,
        address token,
        uint256 amount
    ) external onlyTreasuryManager supportedToken(token) {
        require(tokenBalances[token] >= amount, "Insufficient balance");
        
        FundAllocation storage allocation = fundAllocations[category][token];
        allocation.allocatedAmount += amount;
        
        emit FundsAllocated(category, token, amount);
    }
    
    /**
     * @dev Get treasury balance for a token
     */
    function getBalance(address token) external view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }
    
    /**
     * @dev Get fund allocation details
     */
    function getFundAllocation(FundCategory category, address token)
        external
        view
        returns (FundAllocation memory)
    {
        return fundAllocations[category][token];
    }
    
    /**
     * @dev Get available funds for a category
     */
    function getAvailableFunds(FundCategory category, address token)
        external
        view
        returns (uint256)
    {
        FundAllocation memory allocation = fundAllocations[category][token];
        return allocation.totalAmount - allocation.spentAmount;
    }
    
    /**
     * @dev Pause treasury operations
     */
    function pause() external onlyGovernor {
        _pause();
    }
    
    /**
     * @dev Unpause treasury operations
     */
    function unpause() external onlyGovernor {
        _unpause();
    }
}