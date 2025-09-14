// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title SecurityAudit
 * @dev Comprehensive security audit and monitoring contract for the Merchant Protocol
 */
contract SecurityAudit is Ownable, ReentrancyGuard, Pausable {
    
    // Security event types
    enum SecurityEventType {
        REENTRANCY_ATTEMPT,
        UNAUTHORIZED_ACCESS,
        SUSPICIOUS_TRANSACTION,
        ORACLE_MANIPULATION,
        LARGE_WITHDRAWAL,
        RAPID_TRANSACTIONS,
        PRICE_DEVIATION,
        CONTRACT_UPGRADE
    }
    
    struct SecurityEvent {
        SecurityEventType eventType;
        address contractAddress;
        address user;
        uint256 amount;
        uint256 timestamp;
        string description;
        bool resolved;
    }
    
    struct SecurityMetrics {
        uint256 totalEvents;
        uint256 criticalEvents;
        uint256 resolvedEvents;
        uint256 lastAuditTime;
        mapping(SecurityEventType => uint256) eventCounts;
    }
    
    struct ContractSecurity {
        bool isAudited;
        uint256 auditScore; // 0-100
        uint256 lastAuditTime;
        address auditor;
        string auditReport; // IPFS hash
        bool hasReentrancyGuard;
        bool hasAccessControl;
        bool hasPauseFunction;
        bool hasUpgradeability;
    }
    
    mapping(uint256 => SecurityEvent) public securityEvents;
    mapping(address => SecurityMetrics) public contractMetrics;
    mapping(address => ContractSecurity) public contractSecurity;
    mapping(address => bool) public authorizedAuditors;
    mapping(address => bool) public monitoredContracts;
    
    uint256 public eventCounter;
    uint256 public criticalThreshold = 5; // Number of critical events before emergency pause
    uint256 public auditValidityPeriod = 180 days; // 6 months
    
    // Emergency response
    mapping(address => bool) public emergencyResponders;
    bool public emergencyMode;
    
    event SecurityEventLogged(
        uint256 indexed eventId,
        SecurityEventType indexed eventType,
        address indexed contractAddress,
        address user,
        uint256 amount
    );
    
    event ContractAudited(
        address indexed contractAddress,
        address indexed auditor,
        uint256 score,
        string reportHash
    );
    
    event EmergencyModeActivated(address indexed activator, string reason);
    event EmergencyModeDeactivated(address indexed deactivator);
    
    modifier onlyAuditor() {
        require(authorizedAuditors[msg.sender] || msg.sender == owner(), "Not authorized auditor");
        _;
    }
    
    modifier onlyEmergencyResponder() {
        require(emergencyResponders[msg.sender] || msg.sender == owner(), "Not emergency responder");
        _;
    }
    
    modifier onlyMonitoredContract() {
        require(monitoredContracts[msg.sender], "Contract not monitored");
        _;
    }
    
    constructor() Ownable(msg.sender) {
        _transferOwnership(msg.sender);
        authorizedAuditors[msg.sender] = true;
        emergencyResponders[msg.sender] = true;
    }
    
    /**
     * @dev Log a security event
     */
    function logSecurityEvent(
        SecurityEventType eventType,
        address user,
        uint256 amount,
        string memory description
    ) external onlyMonitoredContract nonReentrant {
        uint256 eventId = ++eventCounter;
        
        securityEvents[eventId] = SecurityEvent({
            eventType: eventType,
            contractAddress: msg.sender,
            user: user,
            amount: amount,
            timestamp: block.timestamp,
            description: description,
            resolved: false
        });
        
        SecurityMetrics storage metrics = contractMetrics[msg.sender];
        metrics.totalEvents++;
        metrics.eventCounts[eventType]++;
        
        // Check if it's a critical event
        if (_isCriticalEvent(eventType)) {
            metrics.criticalEvents++;
            
            // Auto-trigger emergency mode if threshold reached
            if (metrics.criticalEvents >= criticalThreshold) {
                _activateEmergencyMode("Critical security threshold reached");
            }
        }
        
        emit SecurityEventLogged(eventId, eventType, msg.sender, user, amount);
    }
    
    /**
     * @dev Audit a contract
     */
    function auditContract(
        address contractAddress,
        uint256 score,
        string memory reportHash,
        bool hasReentrancyGuard,
        bool hasAccessControl,
        bool hasPauseFunction,
        bool hasUpgradeability
    ) external onlyAuditor {
        require(score <= 100, "Invalid audit score");
        
        contractSecurity[contractAddress] = ContractSecurity({
            isAudited: true,
            auditScore: score,
            lastAuditTime: block.timestamp,
            auditor: msg.sender,
            auditReport: reportHash,
            hasReentrancyGuard: hasReentrancyGuard,
            hasAccessControl: hasAccessControl,
            hasPauseFunction: hasPauseFunction,
            hasUpgradeability: hasUpgradeability
        });
        
        emit ContractAudited(contractAddress, msg.sender, score, reportHash);
    }
    
    /**
     * @dev Check if a contract needs re-audit
     */
    function needsReaudit(address contractAddress) external view returns (bool) {
        ContractSecurity memory security = contractSecurity[contractAddress];
        
        if (!security.isAudited) {
            return true;
        }
        
        return (block.timestamp - security.lastAuditTime) > auditValidityPeriod;
    }
    
    /**
     * @dev Get security score for a contract
     */
    function getSecurityScore(address contractAddress) external view returns (uint256) {
        ContractSecurity memory security = contractSecurity[contractAddress];
        
        if (!security.isAudited) {
            return 0;
        }
        
        // Reduce score based on time since audit
        uint256 timeSinceAudit = block.timestamp - security.lastAuditTime;
        uint256 scoreReduction = (timeSinceAudit * 20) / auditValidityPeriod; // Max 20% reduction
        
        return security.auditScore > scoreReduction ? security.auditScore - scoreReduction : 0;
    }
    
    /**
     * @dev Resolve a security event
     */
    function resolveSecurityEvent(
        uint256 eventId,
        string memory resolution
    ) external onlyAuditor {
        require(eventId <= eventCounter && eventId > 0, "Invalid event ID");
        require(!securityEvents[eventId].resolved, "Event already resolved");
        
        securityEvents[eventId].resolved = true;
        contractMetrics[securityEvents[eventId].contractAddress].resolvedEvents++;
        
        // Emit resolution event or store resolution details if needed
    }
    
    /**
     * @dev Activate emergency mode
     */
    function activateEmergencyMode(string memory reason) external onlyEmergencyResponder {
        _activateEmergencyMode(reason);
    }
    
    /**
     * @dev Deactivate emergency mode
     */
    function deactivateEmergencyMode() external onlyEmergencyResponder {
        emergencyMode = false;
        emit EmergencyModeDeactivated(msg.sender);
    }
    
    /**
     * @dev Add contract to monitoring
     */
    function addMonitoredContract(address contractAddress) external onlyOwner {
        monitoredContracts[contractAddress] = true;
    }
    
    /**
     * @dev Remove contract from monitoring
     */
    function removeMonitoredContract(address contractAddress) external onlyOwner {
        monitoredContracts[contractAddress] = false;
    }
    
    /**
     * @dev Authorize auditor
     */
    function authorizeAuditor(address auditor, bool authorized) external onlyOwner {
        authorizedAuditors[auditor] = authorized;
    }
    
    /**
     * @dev Authorize emergency responder
     */
    function authorizeEmergencyResponder(address responder, bool authorized) external onlyOwner {
        emergencyResponders[responder] = authorized;
    }
    
    /**
     * @dev Update critical threshold
     */
    function updateCriticalThreshold(uint256 newThreshold) external onlyOwner {
        criticalThreshold = newThreshold;
    }
    
    /**
     * @dev Update audit validity period
     */
    function updateAuditValidityPeriod(uint256 newPeriod) external onlyOwner {
        auditValidityPeriod = newPeriod;
    }
    
    /**
     * @dev Get contract metrics
     */
    function getContractMetrics(address contractAddress) external view returns (
        uint256 totalEvents,
        uint256 criticalEvents,
        uint256 resolvedEvents,
        uint256 lastAuditTime
    ) {
        SecurityMetrics storage metrics = contractMetrics[contractAddress];
        return (
            metrics.totalEvents,
            metrics.criticalEvents,
            metrics.resolvedEvents,
            metrics.lastAuditTime
        );
    }
    
    /**
     * @dev Get event count by type
     */
    function getEventCountByType(
        address contractAddress,
        SecurityEventType eventType
    ) external view returns (uint256) {
        return contractMetrics[contractAddress].eventCounts[eventType];
    }
    
    /**
     * @dev Internal function to activate emergency mode
     */
    function _activateEmergencyMode(string memory reason) internal {
        emergencyMode = true;
        emit EmergencyModeActivated(msg.sender, reason);
    }
    
    /**
     * @dev Check if event type is critical
     */
    function _isCriticalEvent(SecurityEventType eventType) internal pure returns (bool) {
        return eventType == SecurityEventType.REENTRANCY_ATTEMPT ||
               eventType == SecurityEventType.ORACLE_MANIPULATION ||
               eventType == SecurityEventType.LARGE_WITHDRAWAL;
    }
    
    /**
     * @dev Emergency pause function
     */
    function emergencyPause() external onlyEmergencyResponder {
        _pause();
    }
    
    /**
     * @dev Emergency unpause function
     */
    function emergencyUnpause() external onlyOwner {
        _unpause();
    }
}