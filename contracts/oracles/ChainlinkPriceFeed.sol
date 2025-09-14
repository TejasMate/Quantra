// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IPriceFeed.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ChainlinkPriceFeed
 * @dev Chainlink price feed adapter implementing IPriceFeed interface
 */
contract ChainlinkPriceFeed is IPriceFeed, Ownable {
    IChainlinkAggregator public immutable aggregator;
    uint256 public constant PRICE_STALENESS_THRESHOLD = 3600; // 1 hour
    
    event PriceFeedUpdated(address indexed newAggregator);
    event StalePriceDetected(uint256 timestamp, uint256 threshold);
    
    constructor(address _aggregator) Ownable(msg.sender) {
        require(_aggregator != address(0), "Invalid aggregator address");
        aggregator = IChainlinkAggregator(_aggregator);
    }
    
    /**
     * @dev Get the latest price from the oracle
     * @return price The latest price
     * @return timestamp The timestamp of the price
     * @return priceDecimals The number of decimals in the price
     */
    function getLatestPrice() external view override returns (int256 price, uint256 timestamp, uint8 priceDecimals) {
        (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = aggregator.latestRoundData();
        
        require(answer > 0, "Invalid price from oracle");
        require(updatedAt > 0, "Price data not available");
        require(block.timestamp - updatedAt <= PRICE_STALENESS_THRESHOLD, "Price data is stale");
        require(answeredInRound >= roundId, "Price data is incomplete");
        
        return (answer, updatedAt, aggregator.decimals());
    }
    
    /**
     * @dev Returns the price at a specific round
     * @param roundId The round ID to get price for
     * @return price The price at the specified round
     * @return timestamp The timestamp of the price update
     * @return priceDecimals The number of decimals in the price
     */
    function getPriceAtRound(uint256 roundId) external view override returns (int256 price, uint256 timestamp, uint8 priceDecimals) {
        (
            uint80 returnedRoundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = aggregator.getRoundData(uint80(roundId));
        
        require(answer > 0, "Invalid price from oracle");
        require(updatedAt > 0, "Price data not available");
        
        return (answer, updatedAt, aggregator.decimals());
    }
    
    /**
     * @dev Returns the description of the price feed
     * @return description The description (e.g., "ETH/USD")
     */
    function description() external view override returns (string memory) {
        return aggregator.description();
    }
    
    /**
     * @dev Returns the number of decimals in the price
     * @return decimals The number of decimals
     */
    function decimals() external view override returns (uint8) {
        return aggregator.decimals();
    }
    
    /**
     * @dev Returns the version of the price feed
     * @return version The version number
     */
    function version() external view override returns (uint256) {
        return aggregator.version();
    }
    
    /**
     * @dev Check if price data is fresh (not stale)
     * @return isFresh True if price is fresh, false if stale
     */
    function isPriceFresh() external view returns (bool isFresh) {
        (
            ,
            ,
            ,
            uint256 updatedAt,
        ) = aggregator.latestRoundData();
        
        return (block.timestamp - updatedAt <= PRICE_STALENESS_THRESHOLD);
    }
    
    /**
     * @dev Get price with safety checks
     * @return price The latest safe price
     * @return isValid True if price is valid and fresh
     */
    function getSafePrice() external view returns (int256 price, bool isValid) {
        try this.getLatestPrice() returns (int256 _price, uint256, uint8) {
            return (_price, true);
        } catch {
            return (0, false);
        }
    }
}