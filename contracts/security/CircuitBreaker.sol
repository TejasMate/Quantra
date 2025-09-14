// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CircuitBreaker
 * @dev Advanced security contract that implements circuit breaker patterns for DeFi protocols
 * Provides automatic protection against various attack vectors and unusual market conditions
 */
contract CircuitBreaker is Ownable, Pausable, ReentrancyGuard {
    
    // Circuit breaker states
    enum CircuitState {
        CLOSED,    // Normal operation
        HALF_OPEN, // Limited operation for testing
        OPEN       // Emergency stop - no operations allowed
    }
    
    // Risk levels for different operations
    enum RiskLevel {
        LOW,
        MEDIUM,
        HIGH,
        CRITICAL
    }
    
    struct CircuitConfig {
        uint256 failureThreshold;     // Number of failures before opening circuit
        uint256 recoveryTimeout;      // Time before attempting recovery
        uint256 halfOpenLimit;       // Max operations allowed in half-open state
        uint256 volumeThreshold;     // Max volume per time window
        uint256 timeWindow;          // Time window for volume tracking
        bool isActive;               // Whether this circuit is active
    }
    
    struct OperationMetrics {
        uint256 successCount;
        uint256 failureCount;
        uint256 totalVolume;
        uint256 lastFailureTime;
        uint256 windowStartTime;
        uint256 halfOpenCount;
    }
    
    struct SecurityAlert {
        string alertType;
        uint256 timestamp;
        address triggeredBy;
        uint256 severity; // 1-5 scale
        string description;
        bool isResolved;
    }
    
    // State variables
    mapping(string => CircuitState) public circuitStates;
    mapping(string => CircuitConfig) public circuitConfigs;
    mapping(string => OperationMetrics) public operationMetrics;
    mapping(address => bool) public authorizedCallers;
    mapping(address => uint256) public userRiskScores;
    mapping(uint256 => SecurityAlert) public securityAlerts;
    
    uint256 public nextAlertId = 1;
    uint256 public globalRiskLevel = 1; // 1-5 scale
    uint256 public emergencyStopThreshold = 5;
    bool public globalEmergencyStop = false;
    
    // Time-based limits
    mapping(address => mapping(uint256 => uint256)) public userDailyVolume; // user => day => volume
    mapping(string => uint256) public lastCircuitCheck;
    
    // Events
    event CircuitOpened(string indexed circuitName, string reason, uint256 timestamp);
    event CircuitClosed(string indexed circuitName, uint256 timestamp);
    event CircuitHalfOpened(string indexed circuitName, uint256 timestamp);
    event OperationBlocked(string indexed circuitName, address indexed user, string reason);
    event SecurityAlertTriggered(uint256 indexed alertId, string alertType, uint256 severity);
    event RiskScoreUpdated(address indexed user, uint256 oldScore, uint256 newScore);
    event EmergencyStopActivated(address indexed triggeredBy, string reason);
    event EmergencyStopDeactivated(address indexed triggeredBy);
    
    constructor() Ownable(msg.sender) {
        // Initialize default circuit configurations
        _initializeDefaultCircuits();
    }
    
    modifier onlyAuthorizedCaller() {
        require(authorizedCallers[msg.sender] || msg.sender == owner(), "Not authorized caller");
        _;
    }
    
    modifier circuitCheck(string memory _circuitName) {
        require(!globalEmergencyStop, "Global emergency stop active");
        require(_isOperationAllowed(_circuitName), "Circuit breaker: Operation not allowed");
        _;
        _recordOperation(_circuitName, true);
    }
    
    modifier riskCheck(address _user, uint256 _amount, RiskLevel _requiredLevel) {
        require(_checkUserRisk(_user, _amount, _requiredLevel), "Risk check failed");
        _;
    }
    
    /**
     * @dev Check if an operation is allowed through the circuit breaker
     */
    function isOperationAllowed(string memory _circuitName) external view returns (bool) {
        return _isOperationAllowed(_circuitName);
    }
    
    /**
     * @dev Record a successful operation
     */
    function recordSuccess(string memory _circuitName) external onlyAuthorizedCaller {
        _recordOperation(_circuitName, true);
    }
    
    /**
     * @dev Record a failed operation
     */
    function recordFailure(string memory _circuitName, string memory _reason) external onlyAuthorizedCaller {
        _recordOperation(_circuitName, false);
        _triggerSecurityAlert("OPERATION_FAILURE", 2, _reason);
    }
    
    /**
     * @dev Execute operation with circuit breaker protection
     */
    function executeWithProtection(
        string memory _circuitName,
        address _user,
        uint256 _amount,
        RiskLevel _riskLevel
    ) external 
        onlyAuthorizedCaller 
        circuitCheck(_circuitName) 
        riskCheck(_user, _amount, _riskLevel) 
        nonReentrant 
        returns (bool) {
        
        // Update user daily volume
        uint256 today = block.timestamp / 86400; // Current day
        userDailyVolume[_user][today] += _amount;
        
        // Check volume limits
        CircuitConfig memory config = circuitConfigs[_circuitName];
        if (config.volumeThreshold > 0) {
            OperationMetrics storage metrics = operationMetrics[_circuitName];
            
            // Reset window if needed
            if (block.timestamp > metrics.windowStartTime + config.timeWindow) {
                metrics.totalVolume = 0;
                metrics.windowStartTime = block.timestamp;
            }
            
            require(metrics.totalVolume + _amount <= config.volumeThreshold, "Volume threshold exceeded");
            metrics.totalVolume += _amount;
        }
        
        return true;
    }
    
    /**
     * @dev Manually open a circuit (emergency stop)
     */
    function openCircuit(string memory _circuitName, string memory _reason) external onlyOwner {
        circuitStates[_circuitName] = CircuitState.OPEN;
        emit CircuitOpened(_circuitName, _reason, block.timestamp);
        _triggerSecurityAlert("MANUAL_CIRCUIT_OPEN", 4, _reason);
    }
    
    /**
     * @dev Manually close a circuit (resume normal operation)
     */
    function closeCircuit(string memory _circuitName) external onlyOwner {
        circuitStates[_circuitName] = CircuitState.CLOSED;
        _resetMetrics(_circuitName);
        emit CircuitClosed(_circuitName, block.timestamp);
    }
    
    /**
     * @dev Set circuit to half-open state for testing
     */
    function setHalfOpen(string memory _circuitName) external onlyOwner {
        require(circuitStates[_circuitName] == CircuitState.OPEN, "Circuit must be open first");
        circuitStates[_circuitName] = CircuitState.HALF_OPEN;
        operationMetrics[_circuitName].halfOpenCount = 0;
        emit CircuitHalfOpened(_circuitName, block.timestamp);
    }
    
    /**
     * @dev Activate global emergency stop
     */
    function activateEmergencyStop(string memory _reason) external onlyOwner {
        globalEmergencyStop = true;
        emit EmergencyStopActivated(msg.sender, _reason);
        _triggerSecurityAlert("GLOBAL_EMERGENCY_STOP", 5, _reason);
    }
    
    /**
     * @dev Deactivate global emergency stop
     */
    function deactivateEmergencyStop() external onlyOwner {
        globalEmergencyStop = false;
        emit EmergencyStopDeactivated(msg.sender);
    }
    
    /**
     * @dev Update user risk score
     */
    function updateUserRiskScore(address _user, uint256 _newScore) external onlyAuthorizedCaller {
        require(_newScore <= 100, "Risk score must be <= 100");
        uint256 oldScore = userRiskScores[_user];
        userRiskScores[_user] = _newScore;
        emit RiskScoreUpdated(_user, oldScore, _newScore);
        
        if (_newScore >= 80) {
            _triggerSecurityAlert("HIGH_RISK_USER", 3, "User risk score elevated");
        }
    }
    
    /**
     * @dev Configure circuit parameters
     */
    function configureCircuit(
        string memory _circuitName,
        uint256 _failureThreshold,
        uint256 _recoveryTimeout,
        uint256 _halfOpenLimit,
        uint256 _volumeThreshold,
        uint256 _timeWindow
    ) external onlyOwner {
        circuitConfigs[_circuitName] = CircuitConfig({
            failureThreshold: _failureThreshold,
            recoveryTimeout: _recoveryTimeout,
            halfOpenLimit: _halfOpenLimit,
            volumeThreshold: _volumeThreshold,
            timeWindow: _timeWindow,
            isActive: true
        });
    }
    
    /**
     * @dev Authorize caller to interact with circuit breaker
     */
    function authorizeCaller(address _caller, bool _authorized) external onlyOwner {
        authorizedCallers[_caller] = _authorized;
    }
    
    /**
     * @dev Get circuit status and metrics
     */
    function getCircuitStatus(string memory _circuitName) external view returns (
        CircuitState state,
        uint256 successCount,
        uint256 failureCount,
        uint256 totalVolume,
        uint256 lastFailureTime
    ) {
        OperationMetrics memory metrics = operationMetrics[_circuitName];
        return (
            circuitStates[_circuitName],
            metrics.successCount,
            metrics.failureCount,
            metrics.totalVolume,
            metrics.lastFailureTime
        );
    }
    
    /**
     * @dev Get security alert details
     */
    function getSecurityAlert(uint256 _alertId) external view returns (SecurityAlert memory) {
        return securityAlerts[_alertId];
    }
    
    /**
     * @dev Resolve security alert
     */
    function resolveSecurityAlert(uint256 _alertId) external onlyOwner {
        securityAlerts[_alertId].isResolved = true;
    }
    
    // Internal functions
    function _isOperationAllowed(string memory _circuitName) internal view returns (bool) {
        CircuitState state = circuitStates[_circuitName];
        CircuitConfig memory config = circuitConfigs[_circuitName];
        
        if (!config.isActive) return true;
        
        if (state == CircuitState.CLOSED) {
            return true;
        } else if (state == CircuitState.HALF_OPEN) {
            OperationMetrics memory metrics = operationMetrics[_circuitName];
            return metrics.halfOpenCount < config.halfOpenLimit;
        } else {
            // OPEN state - check if recovery timeout has passed
            OperationMetrics memory metrics = operationMetrics[_circuitName];
            return block.timestamp > metrics.lastFailureTime + config.recoveryTimeout;
        }
    }
    
    function _recordOperation(string memory _circuitName, bool _success) internal {
        OperationMetrics storage metrics = operationMetrics[_circuitName];
        CircuitConfig memory config = circuitConfigs[_circuitName];
        
        if (_success) {
            metrics.successCount++;
            
            // If in half-open state, check if we can close the circuit
            if (circuitStates[_circuitName] == CircuitState.HALF_OPEN) {
                metrics.halfOpenCount++;
                if (metrics.halfOpenCount >= config.halfOpenLimit) {
                    circuitStates[_circuitName] = CircuitState.CLOSED;
                    emit CircuitClosed(_circuitName, block.timestamp);
                }
            }
        } else {
            metrics.failureCount++;
            metrics.lastFailureTime = block.timestamp;
            
            // Check if we should open the circuit
            if (metrics.failureCount >= config.failureThreshold) {
                circuitStates[_circuitName] = CircuitState.OPEN;
                emit CircuitOpened(_circuitName, "Failure threshold exceeded", block.timestamp);
            }
        }
        
        lastCircuitCheck[_circuitName] = block.timestamp;
    }
    
    function _checkUserRisk(address _user, uint256 _amount, RiskLevel _requiredLevel) internal view returns (bool) {
        uint256 userRisk = userRiskScores[_user];
        
        // Check daily volume limits
        uint256 today = block.timestamp / 86400;
        uint256 dailyVolume = userDailyVolume[_user][today];
        
        // Risk-based volume limits
        uint256 maxDailyVolume;
        if (_requiredLevel == RiskLevel.LOW) {
            maxDailyVolume = 1000 ether;
        } else if (_requiredLevel == RiskLevel.MEDIUM) {
            maxDailyVolume = 500 ether;
        } else if (_requiredLevel == RiskLevel.HIGH) {
            maxDailyVolume = 100 ether;
        } else {
            maxDailyVolume = 50 ether;
        }
        
        // Adjust limits based on user risk score
        if (userRisk > 50) {
            maxDailyVolume = maxDailyVolume * (100 - userRisk) / 100;
        }
        
        return dailyVolume + _amount <= maxDailyVolume;
    }
    
    function _triggerSecurityAlert(string memory _alertType, uint256 _severity, string memory _description) internal {
        uint256 alertId = nextAlertId++;
        securityAlerts[alertId] = SecurityAlert({
            alertType: _alertType,
            timestamp: block.timestamp,
            triggeredBy: msg.sender,
            severity: _severity,
            description: _description,
            isResolved: false
        });
        
        emit SecurityAlertTriggered(alertId, _alertType, _severity);
        
        // Auto-trigger emergency stop for critical alerts
        if (_severity >= emergencyStopThreshold && !globalEmergencyStop) {
            globalEmergencyStop = true;
            emit EmergencyStopActivated(address(this), "Critical security alert triggered");
        }
    }
    
    function _resetMetrics(string memory _circuitName) internal {
        OperationMetrics storage metrics = operationMetrics[_circuitName];
        metrics.successCount = 0;
        metrics.failureCount = 0;
        metrics.totalVolume = 0;
        metrics.lastFailureTime = 0;
        metrics.windowStartTime = block.timestamp;
        metrics.halfOpenCount = 0;
    }
    
    function _initializeDefaultCircuits() internal {
        // Escrow operations circuit
        circuitConfigs["ESCROW_OPERATIONS"] = CircuitConfig({
            failureThreshold: 5,
            recoveryTimeout: 300, // 5 minutes
            halfOpenLimit: 3,
            volumeThreshold: 10000 ether,
            timeWindow: 3600, // 1 hour
            isActive: true
        });
        
        // Merchant registration circuit
        circuitConfigs["MERCHANT_REGISTRATION"] = CircuitConfig({
            failureThreshold: 10,
            recoveryTimeout: 600, // 10 minutes
            halfOpenLimit: 5,
            volumeThreshold: 0, // No volume limit
            timeWindow: 0,
            isActive: true
        });
        
        // Payment verification circuit
        circuitConfigs["PAYMENT_VERIFICATION"] = CircuitConfig({
            failureThreshold: 3,
            recoveryTimeout: 180, // 3 minutes
            halfOpenLimit: 2,
            volumeThreshold: 5000 ether,
            timeWindow: 1800, // 30 minutes
            isActive: true
        });
    }
    
    // Emergency functions
    function pause() external onlyOwner {
        _pause();
    }
    
    function unpause() external onlyOwner {
        _unpause();
    }
}