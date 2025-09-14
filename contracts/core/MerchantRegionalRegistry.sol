// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "../interfaces/IRegionalRegistry.sol";

/**
 * @title MerchantRegionalRegistry
 * @dev Handles regional management and merchant assignment to regions
 * Split from MerchantRegistry to focus on geographical organization
 */
contract MerchantRegionalRegistry is 
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;
    
    struct RegionalConfig {
        bool active;
        uint256 minStakeAmount;
        uint256 maxMerchantsPerRegion;
        address regionalManager;
        string[] supportedChains;
        mapping(string => bool) chainSupported;
        uint256 currentMerchantCount;
    }
    
    struct RegionalStats {
        uint256 totalMerchants;
        uint256 activeMerchants;
        uint256 totalStake;
        uint256 averageReputation;
        uint256 lastUpdated;
    }
    
    // State variables
    mapping(IRegionalRegistry.Region => RegionalConfig) public regionalConfigs;
    mapping(IRegionalRegistry.Region => EnumerableSet.UintSet) private regionalMerchants;
    mapping(uint256 => IRegionalRegistry.Region) public merchantRegions;
    mapping(address => bool) public regionalManagers;
    mapping(IRegionalRegistry.Region => RegionalStats) public regionalStats;
    
    address public merchantCoreRegistry;
    address public dao;
    
    // Events
    event RegionConfigured(IRegionalRegistry.Region indexed region, bool active, uint256 minStake, uint256 maxMerchants);
    event RegionalManagerSet(IRegionalRegistry.Region indexed region, address indexed manager);
    event MerchantAssignedToRegion(uint256 indexed merchantId, IRegionalRegistry.Region indexed region);
    event MerchantRemovedFromRegion(uint256 indexed merchantId, IRegionalRegistry.Region indexed region);
    event ChainSupportAdded(IRegionalRegistry.Region indexed region, string chain);
    event ChainSupportRemoved(IRegionalRegistry.Region indexed region, string chain);
    event RegionalStatsUpdated(IRegionalRegistry.Region indexed region);
    event MerchantCoreRegistryUpdated(address indexed newRegistry);
    event DAOUpdated(address indexed oldDAO, address indexed newDAO);
    
    // Modifiers
    modifier onlyRegionalManager(IRegionalRegistry.Region region) {
        require(
            regionalManagers[msg.sender] || 
            msg.sender == regionalConfigs[region].regionalManager ||
            msg.sender == owner(),
            "MerchantRegionalRegistry: Not authorized regional manager"
        );
        _;
    }
    
    modifier onlyDAO() {
        require(msg.sender == dao, "MerchantRegionalRegistry: Only DAO can call this function");
        _;
    }
    
    modifier onlyMerchantCoreRegistry() {
        require(msg.sender == merchantCoreRegistry, "MerchantRegionalRegistry: Only core registry can call");
        _;
    }
    
    modifier validRegion(IRegionalRegistry.Region region) {
        require(region != IRegionalRegistry.Region.GLOBAL, "MerchantRegionalRegistry: Invalid region");
        _;
    }
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(
        address _owner,
        address _dao,
        address _merchantCoreRegistry
    ) external initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        
        dao = _dao;
        merchantCoreRegistry = _merchantCoreRegistry;
        
        // Initialize default regional configurations
        _initializeDefaultRegions();
        
        // Transfer ownership to the specified owner
        _transferOwnership(_owner);
    }
    
    /**
     * @dev Initialize default regional configurations
     */
    function _initializeDefaultRegions() internal {
        // Configure GLOBAL region
        regionalConfigs[IRegionalRegistry.Region.GLOBAL].active = true;
        regionalConfigs[IRegionalRegistry.Region.GLOBAL].minStakeAmount = 0.1 ether;
        regionalConfigs[IRegionalRegistry.Region.GLOBAL].maxMerchantsPerRegion = 10000;
        
        // Configure NORTH_AMERICA region
        regionalConfigs[IRegionalRegistry.Region.NORTH_AMERICA].active = true;
        regionalConfigs[IRegionalRegistry.Region.NORTH_AMERICA].minStakeAmount = 0.5 ether;
        regionalConfigs[IRegionalRegistry.Region.NORTH_AMERICA].maxMerchantsPerRegion = 5000;
        
        // Configure EUROPE region
        regionalConfigs[IRegionalRegistry.Region.EUROPE].active = true;
        regionalConfigs[IRegionalRegistry.Region.EUROPE].minStakeAmount = 0.3 ether;
        regionalConfigs[IRegionalRegistry.Region.EUROPE].maxMerchantsPerRegion = 5000;
        
        // Configure ASIA_PACIFIC region
        regionalConfigs[IRegionalRegistry.Region.ASIA_PACIFIC].active = true;
        regionalConfigs[IRegionalRegistry.Region.ASIA_PACIFIC].minStakeAmount = 0.2 ether;
        regionalConfigs[IRegionalRegistry.Region.ASIA_PACIFIC].maxMerchantsPerRegion = 8000;
        
        // Configure LATIN_AMERICA region
        regionalConfigs[IRegionalRegistry.Region.LATIN_AMERICA].active = true;
        regionalConfigs[IRegionalRegistry.Region.LATIN_AMERICA].minStakeAmount = 0.15 ether;
        regionalConfigs[IRegionalRegistry.Region.LATIN_AMERICA].maxMerchantsPerRegion = 3000;
        
        // Configure AFRICA region
        regionalConfigs[IRegionalRegistry.Region.MIDDLE_EAST_AFRICA].active = true;
        regionalConfigs[IRegionalRegistry.Region.MIDDLE_EAST_AFRICA].minStakeAmount = 0.1 ether;
        regionalConfigs[IRegionalRegistry.Region.MIDDLE_EAST_AFRICA].maxMerchantsPerRegion = 2000;
    }
    
    /**
     * @dev Configure a region
     */
    function configureRegion(
        IRegionalRegistry.Region region,
        bool active,
        uint256 minStakeAmount,
        uint256 maxMerchantsPerRegion,
        address regionalManager
    ) external onlyOwner validRegion(region) {
        regionalConfigs[region].active = active;
        regionalConfigs[region].minStakeAmount = minStakeAmount;
        regionalConfigs[region].maxMerchantsPerRegion = maxMerchantsPerRegion;
        regionalConfigs[region].regionalManager = regionalManager;
        
        if (regionalManager != address(0)) {
            regionalManagers[regionalManager] = true;
        }
        
        emit RegionConfigured(region, active, minStakeAmount, maxMerchantsPerRegion);
        if (regionalManager != address(0)) {
            emit RegionalManagerSet(region, regionalManager);
        }
    }
    
    /**
     * @dev Add chain support to a region
     */
    function addChainSupport(
        IRegionalRegistry.Region region,
        string memory chain
    ) external onlyRegionalManager(region) validRegion(region) {
        require(bytes(chain).length > 0, "MerchantRegionalRegistry: Invalid chain");
        require(!regionalConfigs[region].chainSupported[chain], "MerchantRegionalRegistry: Chain already supported");
        
        regionalConfigs[region].supportedChains.push(chain);
        regionalConfigs[region].chainSupported[chain] = true;
        
        emit ChainSupportAdded(region, chain);
    }
    
    /**
     * @dev Remove chain support from a region
     */
    function removeChainSupport(
        IRegionalRegistry.Region region,
        string memory chain
    ) external onlyRegionalManager(region) validRegion(region) {
        require(regionalConfigs[region].chainSupported[chain], "MerchantRegionalRegistry: Chain not supported");
        
        regionalConfigs[region].chainSupported[chain] = false;
        
        // Remove from array
        string[] storage chains = regionalConfigs[region].supportedChains;
        for (uint256 i = 0; i < chains.length; i++) {
            if (keccak256(bytes(chains[i])) == keccak256(bytes(chain))) {
                chains[i] = chains[chains.length - 1];
                chains.pop();
                break;
            }
        }
        
        emit ChainSupportRemoved(region, chain);
    }
    
    /**
     * @dev Assign merchant to region (called by MerchantCoreRegistry)
     */
    function assignMerchantToRegion(
        uint256 merchantId,
        IRegionalRegistry.Region region
    ) external onlyMerchantCoreRegistry validRegion(region) {
        require(regionalConfigs[region].active, "MerchantRegionalRegistry: Region not active");
        require(
            regionalConfigs[region].currentMerchantCount < regionalConfigs[region].maxMerchantsPerRegion,
            "MerchantRegionalRegistry: Region at capacity"
        );
        
        // Remove from previous region if assigned
        IRegionalRegistry.Region previousRegion = merchantRegions[merchantId];
        if (previousRegion != IRegionalRegistry.Region.GLOBAL) {
            regionalMerchants[previousRegion].remove(merchantId);
            regionalConfigs[previousRegion].currentMerchantCount--;
        }
        
        // Assign to new region
        regionalMerchants[region].add(merchantId);
        merchantRegions[merchantId] = region;
        regionalConfigs[region].currentMerchantCount++;
        
        emit MerchantAssignedToRegion(merchantId, region);
        _updateRegionalStats(region);
    }
    
    /**
     * @dev Remove merchant from region
     */
    function removeMerchantFromRegion(
        uint256 merchantId
    ) external onlyMerchantCoreRegistry {
        IRegionalRegistry.Region region = merchantRegions[merchantId];
        require(region != IRegionalRegistry.Region.GLOBAL, "MerchantRegionalRegistry: Merchant not in any region");
        
        regionalMerchants[region].remove(merchantId);
        merchantRegions[merchantId] = IRegionalRegistry.Region.GLOBAL;
        regionalConfigs[region].currentMerchantCount--;
        
        emit MerchantRemovedFromRegion(merchantId, region);
        _updateRegionalStats(region);
    }
    
    /**
     * @dev Check if region is active
     */
    function isRegionActive(IRegionalRegistry.Region region) external view returns (bool) {
        return regionalConfigs[region].active;
    }
    
    /**
     * @dev Check if merchant can be registered in region
     */
    function canRegisterMerchant(IRegionalRegistry.Region region) external view returns (bool) {
        return regionalConfigs[region].active && 
               regionalConfigs[region].currentMerchantCount < regionalConfigs[region].maxMerchantsPerRegion;
    }
    
    /**
     * @dev Get minimum stake for region
     */
    function getMinStake(IRegionalRegistry.Region region) external view returns (uint256) {
        return regionalConfigs[region].minStakeAmount;
    }
    
    /**
     * @dev Get merchants in region
     */
    function getMerchantsInRegion(IRegionalRegistry.Region region) external view returns (uint256[] memory) {
        return regionalMerchants[region].values();
    }
    
    /**
     * @dev Get merchant's region
     */
    function getMerchantRegion(uint256 merchantId) external view returns (IRegionalRegistry.Region) {
        return merchantRegions[merchantId];
    }
    
    /**
     * @dev Get supported chains for region
     */
    function getSupportedChains(IRegionalRegistry.Region region) external view returns (string[] memory) {
        return regionalConfigs[region].supportedChains;
    }
    
    /**
     * @dev Check if chain is supported in region
     */
    function isChainSupported(IRegionalRegistry.Region region, string memory chain) external view returns (bool) {
        return regionalConfigs[region].chainSupported[chain];
    }
    
    /**
     * @dev Get regional statistics
     */
    function getRegionalStats(IRegionalRegistry.Region region) external view returns (RegionalStats memory) {
        return regionalStats[region];
    }
    
    /**
     * @dev Get regional configuration
     */
    function getRegionalConfig(IRegionalRegistry.Region region) external view returns (
        bool active,
        uint256 minStakeAmount,
        uint256 maxMerchantsPerRegion,
        address regionalManager,
        uint256 currentMerchantCount
    ) {
        RegionalConfig storage config = regionalConfigs[region];
        return (
            config.active,
            config.minStakeAmount,
            config.maxMerchantsPerRegion,
            config.regionalManager,
            config.currentMerchantCount
        );
    }
    
    /**
     * @dev Update regional statistics
     */
    function _updateRegionalStats(IRegionalRegistry.Region region) internal {
        regionalStats[region].totalMerchants = regionalMerchants[region].length();
        regionalStats[region].lastUpdated = block.timestamp;
        
        emit RegionalStatsUpdated(region);
    }
    
    /**
     * @dev Set regional manager
     */
    function setRegionalManager(
        IRegionalRegistry.Region region,
        address manager
    ) external onlyOwner validRegion(region) {
        regionalConfigs[region].regionalManager = manager;
        if (manager != address(0)) {
            regionalManagers[manager] = true;
        }
        
        emit RegionalManagerSet(region, manager);
    }
    
    /**
     * @dev Update merchant core registry address
     */
    function updateMerchantCoreRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "MerchantRegionalRegistry: Invalid registry address");
        merchantCoreRegistry = newRegistry;
        emit MerchantCoreRegistryUpdated(newRegistry);
    }
    
    /**
     * @dev Update DAO address
     */
    function updateDAO(address newDAO) external onlyOwner {
        require(newDAO != address(0), "MerchantRegionalRegistry: Invalid DAO address");
        address oldDAO = dao;
        dao = newDAO;
        emit DAOUpdated(oldDAO, newDAO);
    }
    
    /**
     * @dev Pause contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Get total merchants across all regions
     */
    function getTotalMerchantsAcrossRegions() external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 1; i <= uint256(IRegionalRegistry.Region.MIDDLE_EAST_AFRICA); i++) {
            total += regionalMerchants[IRegionalRegistry.Region(i)].length();
        }
        return total;
    }
    
    // ===== DAO GOVERNANCE FUNCTIONS =====
    
    // DAO governance state for stake overrides
    mapping(IRegionalRegistry.Region => uint256) public daoStakeOverrides;
    mapping(IRegionalRegistry.Region => bool) public daoStakeOverrideEnabled;
    
    // DAO governance state for KYC bypass
    mapping(IRegionalRegistry.Region => bool) public daoKycBypassEnabled;
    bool public globalKycBypassEnabled;
    mapping(address => bool) public addressKycBypass;
    
    // DAO governance events
    event DAOStakeOverrideSet(IRegionalRegistry.Region indexed region, uint256 newStake, bool enabled);
    event DAOKycBypassSet(IRegionalRegistry.Region indexed region, bool bypassed);
    event GlobalKycBypassSet(bool bypassed);
    event AddressKycBypassSet(address indexed merchant, bool bypassed);
    
    /**
     * @dev DAO can override stake amount for any region
     */
    function setDAOStakeOverride(
        IRegionalRegistry.Region region,
        uint256 newStakeAmount,
        bool enabled
    ) external onlyDAO {
        daoStakeOverrides[region] = newStakeAmount;
        daoStakeOverrideEnabled[region] = enabled;
        emit DAOStakeOverrideSet(region, newStakeAmount, enabled);
    }
    
    /**
     * @dev DAO can enable/disable KYC bypass for specific region
     */
    function setDAOKycBypass(
        IRegionalRegistry.Region region,
        bool bypassed
    ) external onlyDAO {
        daoKycBypassEnabled[region] = bypassed;
        emit DAOKycBypassSet(region, bypassed);
    }
    
    /**
     * @dev DAO can enable/disable global KYC bypass (affects all regions)
     */
    function setGlobalKycBypass(bool bypassed) external onlyDAO {
        globalKycBypassEnabled = bypassed;
        emit GlobalKycBypassSet(bypassed);
    }
    
    /**
     * @dev DAO can set KYC bypass for specific merchant address
     */
    function setAddressKycBypass(address merchant, bool bypassed) external onlyDAO {
        addressKycBypass[merchant] = bypassed;
        emit AddressKycBypassSet(merchant, bypassed);
    }
    
    /**
     * @dev Get effective stake amount (considering DAO overrides)
     */
    function getEffectiveStakeAmount(IRegionalRegistry.Region region) external view returns (uint256) {
        if (daoStakeOverrideEnabled[region]) {
            return daoStakeOverrides[region];
        }
        return regionalConfigs[region].minStakeAmount;
    }
    
    /**
     * @dev Check if KYC should be bypassed for merchant in region
     */
    function shouldBypassKyc(address merchant, IRegionalRegistry.Region region) external view returns (bool) {
        // Global bypass affects all
        if (globalKycBypassEnabled) return true;
        
        // Address-specific bypass
        if (addressKycBypass[merchant]) return true;
        
        // Region-specific bypass
        if (daoKycBypassEnabled[region]) return true;
        
        return false;
    }
    
    /**
     * @dev Get governance status for region
     */
    function getGovernanceStatus(IRegionalRegistry.Region region) external view returns (
        uint256 originalStake,
        uint256 effectiveStake,
        bool stakeOverridden,
        bool kycBypassed,
        bool globalBypass
    ) {
        originalStake = regionalConfigs[region].minStakeAmount;
        effectiveStake = daoStakeOverrideEnabled[region] ? daoStakeOverrides[region] : originalStake;
        stakeOverridden = daoStakeOverrideEnabled[region];
        kycBypassed = daoKycBypassEnabled[region];
        globalBypass = globalKycBypassEnabled;
        
        return (originalStake, effectiveStake, stakeOverridden, kycBypassed, globalBypass);
    }
}