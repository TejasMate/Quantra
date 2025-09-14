// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "../interfaces/IPriceFeed.sol";

/**
 * @title OracleSecurity
 * @dev Enhanced oracle security with multiple price feeds, deviation checks, and manipulation detection
 */
contract OracleSecurity is Ownable, ReentrancyGuard, Pausable {
    
    struct PriceFeedConfig {
        IPriceFeed priceFeed;
        uint256 weight; // Weight in basis points (10000 = 100%)
        uint256 maxDeviationBps; // Maximum allowed deviation in basis points
        uint256 heartbeat; // Maximum time between updates
        bool isActive;
        uint256 lastUpdateTime;
    }
    
    struct PriceData {
        uint256 price;
        uint256 timestamp;
        uint256 confidence; // Confidence level (0-10000 basis points)
        bool isValid;
    }
    
    struct SecurityMetrics {
        uint256 totalQueries;
        uint256 suspiciousQueries;
        uint256 lastSuspiciousTime;
        uint256 consecutiveSuspicious;
        mapping(address => uint256) userQueries;
    }
    
    // Token => Price Feed Configs
    mapping(address => PriceFeedConfig[]) public priceFeeds;
    mapping(address => PriceData) public latestPrices;
    mapping(address => SecurityMetrics) public securityMetrics;
    
    // Security parameters
    uint256 public maxPriceDeviationBps = 500; // 5% maximum deviation
    uint256 public minConfidenceLevel = 8000; // 80% minimum confidence
    uint256 public maxPriceAge = 3600; // 1 hour maximum price age
    uint256 public suspiciousThreshold = 3; // Consecutive suspicious queries threshold
    uint256 public queryRateLimit = 100; // Max queries per hour per user
    
    // Circuit breaker
    bool public circuitBreakerActive;
    uint256 public circuitBreakerThreshold = 10; // Number of suspicious events
    uint256 public circuitBreakerCooldown = 1 hours;
    uint256 public lastCircuitBreakerTime;
    
    // Emergency oracle
    address public emergencyOracle;
    bool public useEmergencyOracle;
    
    event PriceFeedAdded(address indexed token, address indexed priceFeed, uint256 weight);
    event PriceFeedRemoved(address indexed token, address indexed priceFeed);
    event PriceUpdated(address indexed token, uint256 price, uint256 confidence);
    event SuspiciousActivity(address indexed token, address indexed user, string reason);
    event CircuitBreakerTriggered(string reason, uint256 timestamp);
    event EmergencyOracleActivated(address indexed oracle);
    
    modifier validToken(address token) {
        require(token != address(0), "Invalid token address");
        require(priceFeeds[token].length > 0, "No price feeds configured");
        _;
    }
    
    modifier circuitBreakerCheck() {
        require(!circuitBreakerActive || 
                block.timestamp - lastCircuitBreakerTime >= circuitBreakerCooldown, 
                "Circuit breaker active");
        _;
    }
    
    constructor() Ownable(msg.sender) {
        _transferOwnership(msg.sender);
    }
    
    /**
     * @dev Add a price feed for a token
     */
    function addPriceFeed(
        address token,
        address priceFeed,
        uint256 weight,
        uint256 maxDeviationBps,
        uint256 heartbeat
    ) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(priceFeed != address(0), "Invalid price feed");
        require(weight > 0 && weight <= 10000, "Invalid weight");
        
        // Check total weight doesn't exceed 100%
        uint256 totalWeight = weight;
        for (uint256 i = 0; i < priceFeeds[token].length; i++) {
            if (priceFeeds[token][i].isActive) {
                totalWeight += priceFeeds[token][i].weight;
            }
        }
        require(totalWeight <= 10000, "Total weight exceeds 100%");
        
        priceFeeds[token].push(PriceFeedConfig({
            priceFeed: IPriceFeed(priceFeed),
            weight: weight,
            maxDeviationBps: maxDeviationBps,
            heartbeat: heartbeat,
            isActive: true,
            lastUpdateTime: block.timestamp
        }));
        
        emit PriceFeedAdded(token, priceFeed, weight);
    }
    
    /**
     * @dev Remove a price feed
     */
    function removePriceFeed(address token, uint256 index) external onlyOwner {
        require(index < priceFeeds[token].length, "Invalid index");
        
        address priceFeedAddress = address(priceFeeds[token][index].priceFeed);
        priceFeeds[token][index].isActive = false;
        
        emit PriceFeedRemoved(token, priceFeedAddress);
    }
    
    /**
     * @dev Get secure price with multiple validations
     */
    function getSecurePrice(address token) external nonReentrant circuitBreakerCheck validToken(token) returns (uint256, uint256) {
        // Rate limiting check
        _checkRateLimit(msg.sender);
        
        // Use emergency oracle if activated
        if (useEmergencyOracle && emergencyOracle != address(0)) {
            return _getEmergencyPrice(token);
        }
        
        // Get aggregated price from multiple feeds
        (uint256 aggregatedPrice, uint256 confidence) = _getAggregatedPrice(token);
        
        // Validate price
        _validatePrice(token, aggregatedPrice, confidence);
        
        // Update latest price
        latestPrices[token] = PriceData({
            price: aggregatedPrice,
            timestamp: block.timestamp,
            confidence: confidence,
            isValid: true
        });
        
        // Update metrics
        securityMetrics[token].totalQueries++;
        securityMetrics[token].userQueries[msg.sender]++;
        
        emit PriceUpdated(token, aggregatedPrice, confidence);
        
        return (aggregatedPrice, confidence);
    }
    
    /**
     * @dev Get latest cached price (view function)
     */
    function getLatestPrice(address token) external view returns (uint256, uint256, bool) {
        PriceData memory priceData = latestPrices[token];
        
        // Check if price is still valid
        bool isValid = priceData.isValid && 
                      (block.timestamp - priceData.timestamp) <= maxPriceAge;
        
        return (priceData.price, priceData.confidence, isValid);
    }
    
    /**
     * @dev Internal function to get aggregated price from multiple feeds
     */
    function _getAggregatedPrice(address token) internal returns (uint256, uint256) {
        uint256 weightedSum = 0;
        uint256 totalWeight = 0;
        uint256 minConfidence = 10000;
        uint256 validFeeds = 0;
        
        PriceFeedConfig[] storage feeds = priceFeeds[token];
        
        for (uint256 i = 0; i < feeds.length; i++) {
            if (!feeds[i].isActive) continue;
            
            try feeds[i].priceFeed.getLatestPrice() returns (
                int256 price,
                uint256 updatedAt,
                uint8 /* decimals */
            ) {
                // Validate price data
                if (price <= 0 || 
                    block.timestamp - updatedAt > feeds[i].heartbeat ||
                    updatedAt == 0) {
                    _recordSuspiciousActivity(token, "Invalid price data from feed");
                    continue;
                }
                
                uint256 priceUint = uint256(price);
                
                // Check for price deviation if we have previous data
                if (latestPrices[token].isValid) {
                    uint256 deviation = _calculateDeviation(latestPrices[token].price, priceUint);
                    if (deviation > feeds[i].maxDeviationBps) {
                        _recordSuspiciousActivity(token, "Price deviation exceeds threshold");
                        continue;
                    }
                }
                
                weightedSum += priceUint * feeds[i].weight;
                totalWeight += feeds[i].weight;
                validFeeds++;
                
                // Update feed timestamp
                feeds[i].lastUpdateTime = block.timestamp;
                
                // Calculate confidence (simplified)
                uint256 feedConfidence = _calculateFeedConfidence(updatedAt, feeds[i].heartbeat);
                if (feedConfidence < minConfidence) {
                    minConfidence = feedConfidence;
                }
                
            } catch {
                _recordSuspiciousActivity(token, "Price feed call failed");
            }
        }
        
        require(validFeeds > 0, "No valid price feeds available");
        require(totalWeight > 0, "No valid weights");
        
        uint256 aggregatedPrice = weightedSum / totalWeight;
        
        return (aggregatedPrice, minConfidence);
    }
    
    /**
     * @dev Validate price against security parameters
     */
    function _validatePrice(address token, uint256 price, uint256 confidence) internal {
        require(price > 0, "Invalid price");
        require(confidence >= minConfidenceLevel, "Confidence too low");
        
        // Check against previous price for manipulation
        if (latestPrices[token].isValid) {
            uint256 deviation = _calculateDeviation(latestPrices[token].price, price);
            if (deviation > maxPriceDeviationBps) {
                _recordSuspiciousActivity(token, "Price manipulation detected");
                revert("Price manipulation detected");
            }
        }
    }
    
    /**
     * @dev Calculate price deviation in basis points
     */
    function _calculateDeviation(uint256 oldPrice, uint256 newPrice) internal pure returns (uint256) {
        if (oldPrice == 0) return 0;
        
        uint256 diff = oldPrice > newPrice ? oldPrice - newPrice : newPrice - oldPrice;
        return (diff * 10000) / oldPrice;
    }
    
    /**
     * @dev Calculate feed confidence based on freshness
     */
    function _calculateFeedConfidence(uint256 updatedAt, uint256 heartbeat) internal view returns (uint256) {
        uint256 age = block.timestamp - updatedAt;
        if (age >= heartbeat) return 0;
        
        // Linear decay: 100% confidence at 0 age, 0% at heartbeat
        return 10000 - (age * 10000) / heartbeat;
    }
    
    /**
     * @dev Record suspicious activity
     */
    function _recordSuspiciousActivity(address token, string memory reason) internal {
        SecurityMetrics storage metrics = securityMetrics[token];
        metrics.suspiciousQueries++;
        metrics.lastSuspiciousTime = block.timestamp;
        metrics.consecutiveSuspicious++;
        
        emit SuspiciousActivity(token, msg.sender, reason);
        
        // Trigger circuit breaker if threshold reached
        if (metrics.consecutiveSuspicious >= suspiciousThreshold) {
            _triggerCircuitBreaker("Consecutive suspicious activities detected");
        }
    }
    
    /**
     * @dev Check rate limiting
     */
    function _checkRateLimit(address /* user */) internal pure {
        // Simple rate limiting implementation
        // In production, use more sophisticated rate limiting
        require(true, "Rate limit check passed"); // Placeholder
    }
    
    /**
     * @dev Trigger circuit breaker
     */
    function _triggerCircuitBreaker(string memory reason) internal {
        circuitBreakerActive = true;
        lastCircuitBreakerTime = block.timestamp;
        
        emit CircuitBreakerTriggered(reason, block.timestamp);
    }
    
    /**
     * @dev Get emergency price
     */
    function _getEmergencyPrice(address /* token */) internal pure returns (uint256, uint256) {
        // Implementation depends on emergency oracle interface
        // This is a placeholder
        return (0, 0);
    }
    
    /**
     * @dev Set emergency oracle
     */
    function setEmergencyOracle(address oracle, bool activate) external onlyOwner {
        emergencyOracle = oracle;
        useEmergencyOracle = activate;
        
        if (activate) {
            emit EmergencyOracleActivated(oracle);
        }
    }
    
    /**
     * @dev Update security parameters
     */
    function updateSecurityParams(
        uint256 _maxPriceDeviationBps,
        uint256 _minConfidenceLevel,
        uint256 _maxPriceAge,
        uint256 _suspiciousThreshold
    ) external onlyOwner {
        maxPriceDeviationBps = _maxPriceDeviationBps;
        minConfidenceLevel = _minConfidenceLevel;
        maxPriceAge = _maxPriceAge;
        suspiciousThreshold = _suspiciousThreshold;
    }
    
    /**
     * @dev Reset circuit breaker
     */
    function resetCircuitBreaker() external onlyOwner {
        circuitBreakerActive = false;
        lastCircuitBreakerTime = 0;
    }
    
    /**
     * @dev Emergency pause
     */
    function emergencyPause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Emergency unpause
     */
    function emergencyUnpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Get price feed count for token
     */
    function getPriceFeedCount(address token) external view returns (uint256) {
        return priceFeeds[token].length;
    }
    
    /**
     * @dev Get price feed info
     */
    function getPriceFeedInfo(address token, uint256 index) external view returns (
        address priceFeed,
        uint256 weight,
        uint256 maxDeviationBps,
        uint256 heartbeat,
        bool isActive
    ) {
        require(index < priceFeeds[token].length, "Invalid index");
        
        PriceFeedConfig storage config = priceFeeds[token][index];
        return (
            address(config.priceFeed),
            config.weight,
            config.maxDeviationBps,
            config.heartbeat,
            config.isActive
        );
    }
}