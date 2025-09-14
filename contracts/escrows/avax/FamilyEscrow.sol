// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title FamilyEscrow
 * @dev Digital pocket money system where parents control children's spending accounts
 * Parents can create child accounts, fund them, set spending limits, and monitor transactions
 */
contract FamilyEscrow is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    enum AccountStatus {
        Active,
        Frozen,
        Suspended
    }

    struct ChildAccount {
        address parent;
        address child;
        uint256 balance;
        uint256 spendingLimit; // Daily spending limit
        uint256 lastSpendTime; // For daily limit tracking
        uint256 dailySpent; // Amount spent today
        AccountStatus status;
        uint256 createdAt;
        string nickname; // Child's nickname for the account
        uint256 totalSpent; // Lifetime spending
        uint256 totalReceived; // Lifetime funding
    }

    struct Transaction {
        address child;
        address merchant;
        uint256 amount;
        uint256 timestamp;
        string description;
        bool isSpending; // true for spending, false for funding
    }

    // Mappings
    mapping(address => ChildAccount) public childAccounts;
    mapping(address => address[]) public parentChildren; // parent -> array of children
    mapping(address => bool) public isChild;
    mapping(address => bool) public isParent;
    mapping(uint256 => Transaction) public transactions;
    mapping(address => uint256[]) public childTransactions; // child -> transaction IDs
    
    // Counters
    uint256 public transactionCounter;
    uint256 public totalChildAccounts;
    
    // Platform settings
    uint256 public maxSpendingLimit = 1000 ether; // Max daily limit parents can set
    uint256 public minAge = 13; // Minimum age requirement (metadata only)
    address public platformFeeRecipient;
    uint256 public platformFee = 10; // 0.1% in basis points

    // Events
    event ChildAccountCreated(
        address indexed parent,
        address indexed child,
        uint256 spendingLimit,
        string nickname
    );

    event AccountFunded(
        address indexed parent,
        address indexed child,
        uint256 amount,
        uint256 newBalance
    );

    event ChildSpending(
        address indexed child,
        address indexed merchant,
        uint256 amount,
        uint256 remainingBalance,
        string description
    );

    event SpendingLimitUpdated(
        address indexed parent,
        address indexed child,
        uint256 oldLimit,
        uint256 newLimit
    );

    event AccountStatusChanged(
        address indexed parent,
        address indexed child,
        AccountStatus oldStatus,
        AccountStatus newStatus
    );

    event ParentWithdrawal(
        address indexed parent,
        address indexed child,
        uint256 amount,
        string reason
    );

    // Modifiers
    modifier onlyParent(address child) {
        require(childAccounts[child].parent == msg.sender, "Not the parent of this child");
        _;
    }

    modifier onlyChild() {
        require(isChild[msg.sender], "Not a registered child");
        require(childAccounts[msg.sender].status == AccountStatus.Active, "Account not active");
        _;
    }

    modifier validChild(address child) {
        require(isChild[child], "Child account does not exist");
        _;
    }

    constructor(address _platformFeeRecipient) Ownable(msg.sender) {
        platformFeeRecipient = _platformFeeRecipient;
    }

    /**
     * @dev Create a new child account with spending controls
     * @param child Address of the child
     * @param spendingLimit Daily spending limit in wei
     * @param nickname Friendly name for the child's account
     */
    function createChildAccount(
        address child,
        uint256 spendingLimit,
        string memory nickname
    ) external whenNotPaused nonReentrant {
        require(child != address(0), "Invalid child address");
        require(child != msg.sender, "Cannot create account for yourself");
        require(!isChild[child], "Child account already exists");
        require(spendingLimit <= maxSpendingLimit, "Spending limit too high");
        require(bytes(nickname).length > 0, "Nickname cannot be empty");

        // Create child account
        childAccounts[child] = ChildAccount({
            parent: msg.sender,
            child: child,
            balance: 0,
            spendingLimit: spendingLimit,
            lastSpendTime: 0,
            dailySpent: 0,
            status: AccountStatus.Active,
            createdAt: block.timestamp,
            nickname: nickname,
            totalSpent: 0,
            totalReceived: 0
        });

        // Update mappings
        isChild[child] = true;
        isParent[msg.sender] = true;
        parentChildren[msg.sender].push(child);
        totalChildAccounts++;

        emit ChildAccountCreated(msg.sender, child, spendingLimit, nickname);
    }

    /**
     * @dev Fund a child's account (parent only)
     * @param child Address of the child to fund
     */
    function fundChildAccount(address child) 
        external 
        payable 
        onlyParent(child) 
        validChild(child) 
        whenNotPaused 
        nonReentrant 
    {
        require(msg.value > 0, "Must send some ETH");
        
        ChildAccount storage account = childAccounts[child];
        account.balance += msg.value;
        account.totalReceived += msg.value;

        // Record transaction
        _recordTransaction(child, address(0), msg.value, "Parent funding", false);

        emit AccountFunded(msg.sender, child, msg.value, account.balance);
    }

    /**
     * @dev Child spends from their account
     * @param merchant Address to send payment to
     * @param amount Amount to spend
     * @param description Description of the purchase
     */
    function childSpend(
        address merchant,
        uint256 amount,
        string memory description
    ) external onlyChild whenNotPaused nonReentrant {
        require(merchant != address(0), "Invalid merchant address");
        require(amount > 0, "Amount must be greater than 0");
        
        ChildAccount storage account = childAccounts[msg.sender];
        require(account.balance >= amount, "Insufficient balance");

        // Check daily spending limit
        _checkDailyLimit(msg.sender, amount);

        // Calculate platform fee
        uint256 fee = (amount * platformFee) / 10000;
        uint256 merchantAmount = amount - fee;

        // Update account
        account.balance -= amount;
        account.totalSpent += amount;
        _updateDailySpending(msg.sender, amount);

        // Transfer funds
        payable(merchant).transfer(merchantAmount);
        if (fee > 0) {
            payable(platformFeeRecipient).transfer(fee);
        }

        // Record transaction
        _recordTransaction(msg.sender, merchant, amount, description, true);

        emit ChildSpending(msg.sender, merchant, amount, account.balance, description);
    }

    /**
     * @dev Parent withdraws funds from child's account
     * @param child Address of the child
     * @param amount Amount to withdraw
     * @param reason Reason for withdrawal
     */
    function parentWithdraw(
        address child,
        uint256 amount,
        string memory reason
    ) external onlyParent(child) validChild(child) whenNotPaused nonReentrant {
        ChildAccount storage account = childAccounts[child];
        require(account.balance >= amount, "Insufficient balance in child account");
        require(amount > 0, "Amount must be greater than 0");

        account.balance -= amount;
        payable(msg.sender).transfer(amount);

        // Record transaction
        _recordTransaction(child, msg.sender, amount, reason, false);

        emit ParentWithdrawal(msg.sender, child, amount, reason);
    }

    /**
     * @dev Update child's daily spending limit
     * @param child Address of the child
     * @param newLimit New daily spending limit
     */
    function setSpendingLimit(
        address child,
        uint256 newLimit
    ) external onlyParent(child) validChild(child) whenNotPaused {
        require(newLimit <= maxSpendingLimit, "Limit exceeds maximum allowed");
        
        ChildAccount storage account = childAccounts[child];
        uint256 oldLimit = account.spendingLimit;
        account.spendingLimit = newLimit;

        emit SpendingLimitUpdated(msg.sender, child, oldLimit, newLimit);
    }

    /**
     * @dev Freeze or unfreeze child's account
     * @param child Address of the child
     * @param status New account status
     */
    function setAccountStatus(
        address child,
        AccountStatus status
    ) external onlyParent(child) validChild(child) whenNotPaused {
        ChildAccount storage account = childAccounts[child];
        AccountStatus oldStatus = account.status;
        account.status = status;

        emit AccountStatusChanged(msg.sender, child, oldStatus, status);
    }

    /**
     * @dev Check daily spending limit
     * @param child Address of the child
     * @param amount Amount to spend
     */
    function _checkDailyLimit(address child, uint256 amount) internal view {
        ChildAccount storage account = childAccounts[child];
        
        // Check if it's a new day
        if (block.timestamp >= account.lastSpendTime + 1 days) {
            // New day, only check if amount exceeds limit
            require(amount <= account.spendingLimit, "Exceeds daily spending limit");
        } else {
            // Same day, check cumulative spending
            require(
                account.dailySpent + amount <= account.spendingLimit,
                "Exceeds daily spending limit"
            );
        }
    }

    /**
     * @dev Update daily spending tracking
     * @param child Address of the child
     * @param amount Amount spent
     */
    function _updateDailySpending(address child, uint256 amount) internal {
        ChildAccount storage account = childAccounts[child];
        
        // Check if it's a new day
        if (block.timestamp >= account.lastSpendTime + 1 days) {
            // New day, reset daily spending
            account.dailySpent = amount;
        } else {
            // Same day, add to daily spending
            account.dailySpent += amount;
        }
        
        account.lastSpendTime = block.timestamp;
    }

    /**
     * @dev Record a transaction
     * @param child Child involved in transaction
     * @param otherParty Merchant or parent
     * @param amount Transaction amount
     * @param description Transaction description
     * @param isSpending True if child spending, false if funding/withdrawal
     */
    function _recordTransaction(
        address child,
        address otherParty,
        uint256 amount,
        string memory description,
        bool isSpending
    ) internal {
        transactions[transactionCounter] = Transaction({
            child: child,
            merchant: otherParty,
            amount: amount,
            timestamp: block.timestamp,
            description: description,
            isSpending: isSpending
        });

        childTransactions[child].push(transactionCounter);
        transactionCounter++;
    }

    // View functions

    /**
     * @dev Get child account details
     * @param child Address of the child
     */
    function getChildAccount(address child) 
        external 
        view 
        returns (ChildAccount memory) 
    {
        return childAccounts[child];
    }

    /**
     * @dev Get all children of a parent
     * @param parent Address of the parent
     */
    function getParentChildren(address parent) 
        external 
        view 
        returns (address[] memory) 
    {
        return parentChildren[parent];
    }

    /**
     * @dev Get child's transaction history
     * @param child Address of the child
     * @param offset Starting index
     * @param limit Number of transactions to return
     */
    function getChildTransactions(
        address child,
        uint256 offset,
        uint256 limit
    ) external view returns (Transaction[] memory) {
        uint256[] memory txIds = childTransactions[child];
        require(offset < txIds.length, "Offset out of bounds");
        
        uint256 end = offset + limit;
        if (end > txIds.length) {
            end = txIds.length;
        }
        
        Transaction[] memory result = new Transaction[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = transactions[txIds[i]];
        }
        
        return result;
    }

    /**
     * @dev Get remaining daily spending allowance
     * @param child Address of the child
     */
    function getRemainingDailyAllowance(address child) 
        external 
        view 
        returns (uint256) 
    {
        ChildAccount storage account = childAccounts[child];
        
        // Check if it's a new day
        if (block.timestamp >= account.lastSpendTime + 1 days) {
            return account.spendingLimit;
        } else {
            if (account.dailySpent >= account.spendingLimit) {
                return 0;
            }
            return account.spendingLimit - account.dailySpent;
        }
    }

    // Admin functions

    /**
     * @dev Update platform fee (admin only)
     * @param newFee New fee in basis points
     */
    function setPlatformFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1000, "Fee cannot exceed 10%"); // Max 10%
        platformFee = newFee;
    }

    /**
     * @dev Update maximum spending limit (admin only)
     * @param newMaxLimit New maximum daily spending limit
     */
    function setMaxSpendingLimit(uint256 newMaxLimit) external onlyOwner {
        maxSpendingLimit = newMaxLimit;
    }

    /**
     * @dev Emergency pause (admin only)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Emergency unpause (admin only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Withdraw accumulated platform fees (admin only)
     */
    function withdrawPlatformFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        payable(platformFeeRecipient).transfer(balance);
    }

    // Fallback functions
    receive() external payable {
        // Allow contract to receive ETH
    }
}