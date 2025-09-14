// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IRegionalRegistry
 * @dev Interface for managing regional configurations and merchant assignments
 * @notice Provides standardized regional management across different geographic areas
 */
interface IRegionalRegistry {
    // Enums
    enum Region {
        GLOBAL,
        NORTH_AMERICA,
        EUROPE,
        ASIA_PACIFIC,
        LATIN_AMERICA,
        MIDDLE_EAST_AFRICA,
        CUSTOM
    }
    
    // Structs
    struct RegionalConfig {
        bool active;
        uint256 minStakeAmount;
        uint256 maxMerchantsPerRegion;
        address regionalManager;
        string[] supportedChains;
        string[] supportedPaymentMethods;
        uint256 createdAt;
        uint256 updatedAt;
    }
    
    struct RegionalStats {
        uint256 totalMerchants;
        uint256 activeMerchants;
        uint256 totalTransactions;
        uint256 totalVolume;
        uint256 lastUpdated;
    }
    
    // Events
    event RegionConfigured(Region indexed region, address indexed manager, uint256 minStake);
    event RegionalManagerUpdated(Region indexed region, address indexed oldManager, address indexed newManager);
    event MerchantAssignedToRegion(address indexed merchant, Region indexed region);
    event MerchantRemovedFromRegion(address indexed merchant, Region indexed region);
    event RegionActivated(Region indexed region);
    event RegionDeactivated(Region indexed region);
    event PaymentMethodAddedToRegion(Region indexed region, string paymentMethod);
    event PaymentMethodRemovedFromRegion(Region indexed region, string paymentMethod);
    
    // Core functions
    function configureRegion(
        Region region,
        uint256 minStakeAmount,
        uint256 maxMerchantsPerRegion,
        address regionalManager,
        string[] calldata supportedChains,
        string[] calldata supportedPaymentMethods
    ) external;
    
    function assignMerchantToRegion(address merchant, Region region) external;
    function removeMerchantFromRegion(address merchant, Region region) external;
    
    function setRegionalManager(Region region, address manager) external;
    function activateRegion(Region region) external;
    function deactivateRegion(Region region) external;
    
    function addPaymentMethodToRegion(Region region, string calldata paymentMethod) external;
    function removePaymentMethodFromRegion(Region region, string calldata paymentMethod) external;
    
    function addChainToRegion(Region region, string calldata chain) external;
    function removeChainFromRegion(Region region, string calldata chain) external;
    
    // View functions
    function getRegionalConfig(Region region) external view returns (RegionalConfig memory);
    function getRegionalStats(Region region) external view returns (RegionalStats memory);
    function getMerchantRegion(address merchant) external view returns (Region);
    function getRegionalMerchants(Region region) external view returns (address[] memory);
    
    function isRegionActive(Region region) external view returns (bool);
    function isChainSupportedInRegion(Region region, string calldata chain) external view returns (bool);
    function isPaymentMethodSupportedInRegion(Region region, string calldata paymentMethod) external view returns (bool);
    function canMerchantJoinRegion(address merchant, Region region) external view returns (bool);
    function isRegionSupported(Region region) external view returns (bool);
    
    function getActiveRegions() external view returns (Region[] memory);
    function getTotalMerchantsInRegion(Region region) external view returns (uint256);
    function getRegionalManager(Region region) external view returns (address);
    
    // Admin functions
    function setMerchantRegistry(address registry) external;
    function updateRegionalStats(Region region, uint256 transactions, uint256 volume) external;
    function pause() external;
    function unpause() external;
}