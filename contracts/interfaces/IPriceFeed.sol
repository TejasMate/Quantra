// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPriceFeed
 * @dev Interface for price feed oracles (Chainlink/Pyth compatible)
 */
interface IPriceFeed {
    /**
     * @dev Get the latest price from the oracle
     * @return price The latest price
     * @return timestamp The timestamp of the price
     * @return priceDecimals The number of decimals in the price
     */
    function getLatestPrice() external view returns (int256 price, uint256 timestamp, uint8 priceDecimals);
    
    /**
     * @dev Get price at a specific round
     * @param roundId The round ID to get price for
     * @return price The price at the specified round
     * @return timestamp The timestamp of the price
     * @return priceDecimals The number of decimals in the price
     */
    function getPriceAtRound(uint256 roundId) external view returns (int256 price, uint256 timestamp, uint8 priceDecimals);
    
    /**
     * @dev Returns the description of the price feed
     * @return description The description (e.g., "ETH/USD")
     */
    function description() external view returns (string memory);
    
    /**
     * @dev Returns the number of decimals in the price
     * @return decimals The number of decimals
     */
    function decimals() external view returns (uint8);
    
    /**
     * @dev Returns the version of the price feed
     * @return version The version number
     */
    function version() external view returns (uint256);
}

/**
 * @title IChainlinkAggregator
 * @dev Chainlink-specific aggregator interface
 */
interface IChainlinkAggregator {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
        
    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
        
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
}