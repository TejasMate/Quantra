// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
// IVerifierFactory interface is implemented directly in this contract
import "../interfaces/IMerchantOperations.sol";
import "../interfaces/IMerchantRegistry.sol";
import "../interfaces/IRegionalRegistry.sol";
import "../interfaces/IPaymentVerifier.sol";

/**
 * @title UnifiedVerifierManager
 * @dev Unified contract for deploying, registering, and managing payment verifiers
 * @notice Combines factory deployment capabilities with comprehensive registry management
 */
contract UnifiedVerifierManager is AccessControl, ReentrancyGuard, Pausable {
    // Role definitions
    bytes32 public constant DEPLOYER_ROLE = keccak256("DEPLOYER_ROLE");
    bytes32 public constant TEMPLATE_MANAGER_ROLE = keccak256("TEMPLATE_MANAGER_ROLE");
    bytes32 public constant REGISTRY_MANAGER_ROLE = keccak256("REGISTRY_MANAGER_ROLE");
    bytes32 public constant VERIFIER_MANAGER_ROLE = keccak256("VERIFIER_MANAGER_ROLE");
    
    // Enhanced verifier entry combining factory and registry data
    struct UnifiedVerifierEntry {
        address verifierAddress;
        string verifierType;
        IRegionalRegistry.Region[] supportedRegions;
        bool active;
        bool trusted;
        uint256 registeredAt;
        uint256 lastUpdated;
        string metadata;
        address registrar;
        // Factory-specific fields
        bool deployedByFactory;
        bytes32 deploymentSalt;
    }
    
    struct VerifierStats {
        uint256 totalVerifications;
        uint256 successfulVerifications;
        uint256 failedVerifications;
        uint256 lastVerificationTime;
        uint256 averageProcessingTime;
    }
    
    struct VerifierTemplate {
        string verifierType;
        bytes bytecode;
        string[] constructorParams;
        IRegionalRegistry.Region[] defaultRegions;
        bool approved;
        address submitter;
        uint256 submittedAt;
    }
    
    // State variables
    IMerchantRegistry public merchantRegistry;
    IRegionalRegistry public regionalRegistry;
    
    // Unified mappings
    mapping(address => UnifiedVerifierEntry) public verifierEntries;
    mapping(address => VerifierStats) public verifierStats;
    mapping(string => VerifierTemplate) public verifierTemplates;
    mapping(string => address[]) public verifiersByType;
    mapping(IRegionalRegistry.Region => address[]) public verifiersByRegion;
    mapping(address => mapping(IRegionalRegistry.Region => bool)) public verifierRegionSupport;
    
    // Arrays and counters
    address[] public allVerifiers;
    address[] public trustedVerifiers;
    string[] public supportedTypes;
    mapping(string => bool) public typeExists;
    mapping(address => bool) public blacklistedVerifiers;
    mapping(address => bool) public authorizedDeployers;
    
    uint256 public totalVerifiers;
    uint256 public activeVerifiers;
    uint256 public trustedVerifierCount;
    uint256 public verifierCount;
    
    // Events (combining both contracts)
    event VerifierDeployed(address indexed verifier, string verifierType, address indexed deployer);
    event VerifierRegistered(address indexed verifier, string verifierType, address indexed registrar);
    event VerifierUpdated(address indexed verifier, string metadata);
    event VerifierActivated(address indexed verifier);
    event VerifierDeactivated(address indexed verifier);
    event VerifierTrusted(address indexed verifier, bool trusted);
    event VerifierBlacklisted(address indexed verifier, bool blacklisted);
    event VerifierStatsUpdated(address indexed verifier, uint256 totalVerifications);
    event VerifierRegionsUpdated(address indexed verifier, IRegionalRegistry.Region[] regions);
    event VerifierTemplateAdded(string verifierType, address indexed submitter);
    event VerifierTemplateApproved(string verifierType, bool approved);
    
    constructor(
        address _merchantRegistry,
        address _regionalRegistry
    ) {
        require(_merchantRegistry != address(0), "UnifiedVerifierManager: Invalid merchant registry");
        require(_regionalRegistry != address(0), "UnifiedVerifierManager: Invalid regional registry");
        
        merchantRegistry = IMerchantRegistry(_merchantRegistry);
        regionalRegistry = IRegionalRegistry(_regionalRegistry);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DEPLOYER_ROLE, msg.sender);
        _grantRole(TEMPLATE_MANAGER_ROLE, msg.sender);
        _grantRole(REGISTRY_MANAGER_ROLE, msg.sender);
        _grantRole(VERIFIER_MANAGER_ROLE, msg.sender);
    }
    
    // Modifiers
    modifier onlyAuthorizedDeployer() {
        require(
            hasRole(DEPLOYER_ROLE, msg.sender) || authorizedDeployers[msg.sender],
            "UnifiedVerifierManager: Not authorized deployer"
        );
        _;
    }
    
    modifier validVerifierType(string calldata verifierType) {
        require(bytes(verifierType).length > 0, "UnifiedVerifierManager: Empty verifier type");
        require(verifierTemplates[verifierType].approved, "UnifiedVerifierManager: Template not approved");
        _;
    }
    
    modifier validVerifier(address verifier) {
        require(verifier != address(0), "UnifiedVerifierManager: Invalid verifier address");
        require(verifierEntries[verifier].verifierAddress != address(0), "UnifiedVerifierManager: Verifier not registered");
        _;
    }
    
    modifier notBlacklisted(address verifier) {
        require(!blacklistedVerifiers[verifier], "UnifiedVerifierManager: Verifier blacklisted");
        _;
    }
    
    // =============================================================================
    // FACTORY FUNCTIONS (Deployment & Templates)
    // =============================================================================
    
    /**
     * @dev Deploy a new verifier using Create2 and register it
     */
    function deployVerifier(
        string calldata verifierType,
        bytes calldata constructorData,
        IRegionalRegistry.Region[] calldata supportedRegions,
        string calldata metadata
    ) external onlyAuthorizedDeployer whenNotPaused validVerifierType(verifierType) returns (address verifier) {
        require(supportedRegions.length > 0, "UnifiedVerifierManager: No supported regions");
        
        VerifierTemplate storage template = verifierTemplates[verifierType];
        
        // Generate salt for deterministic deployment
        bytes32 salt = keccak256(abi.encodePacked(
            verifierType,
            msg.sender,
            block.timestamp,
            verifierCount
        ));
        
        // Deploy using Create2
        verifier = Create2.deploy(0, salt, abi.encodePacked(template.bytecode, constructorData));
        require(verifier != address(0), "UnifiedVerifierManager: Deployment failed");
        
        // Initialize the verifier
        IPaymentVerifier(verifier).setMerchantRegistry(address(merchantRegistry));
        
        // Register the verifier with factory flag
        _registerVerifier(verifier, verifierType, supportedRegions, metadata, msg.sender, true, salt);
        
        emit VerifierDeployed(verifier, verifierType, msg.sender);
        
        return verifier;
    }
    
    /**
     * @dev Add a new verifier template
     */
    function addVerifierTemplate(
        string calldata verifierType,
        bytes calldata bytecode,
        string[] calldata constructorParams,
        IRegionalRegistry.Region[] calldata defaultRegions
    ) external onlyRole(TEMPLATE_MANAGER_ROLE) {
        require(bytes(verifierType).length > 0, "UnifiedVerifierManager: Empty verifier type");
        require(bytecode.length > 0, "UnifiedVerifierManager: Empty bytecode");
        require(defaultRegions.length > 0, "UnifiedVerifierManager: No default regions");
        
        verifierTemplates[verifierType] = VerifierTemplate({
            verifierType: verifierType,
            bytecode: bytecode,
            constructorParams: constructorParams,
            defaultRegions: defaultRegions,
            approved: false,
            submitter: msg.sender,
            submittedAt: block.timestamp
        });
        
        if (!typeExists[verifierType]) {
            supportedTypes.push(verifierType);
            typeExists[verifierType] = true;
        }
        
        emit VerifierTemplateAdded(verifierType, msg.sender);
    }
    
    /**
     * @dev Approve or disapprove a verifier template
     */
    function approveVerifierTemplate(string calldata verifierType, bool approved) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(verifierTemplates[verifierType].verifierType).length > 0, "UnifiedVerifierManager: Template not found");
        
        verifierTemplates[verifierType].approved = approved;
        emit VerifierTemplateApproved(verifierType, approved);
    }
    
    // =============================================================================
    // REGISTRY FUNCTIONS (Registration & Management)
    // =============================================================================
    
    /**
     * @dev Register an existing verifier (not deployed by factory)
     */
    function registerExistingVerifier(
        address verifier,
        string calldata verifierType,
        IRegionalRegistry.Region[] calldata supportedRegions,
        string calldata metadata
    ) external onlyRole(REGISTRY_MANAGER_ROLE) whenNotPaused {
        require(verifier != address(0), "UnifiedVerifierManager: Invalid verifier address");
        require(bytes(verifierType).length > 0, "UnifiedVerifierManager: Empty verifier type");
        require(supportedRegions.length > 0, "UnifiedVerifierManager: No supported regions");
        require(verifierEntries[verifier].verifierAddress == address(0), "UnifiedVerifierManager: Already registered");
        
        // Verify the verifier implements IPaymentVerifier
        try IPaymentVerifier(verifier).getVerifierType() returns (string memory) {
            // Verifier is valid
        } catch {
            revert("UnifiedVerifierManager: Invalid verifier interface");
        }
        
        _registerVerifier(verifier, verifierType, supportedRegions, metadata, msg.sender, false, bytes32(0));
        
        emit VerifierRegistered(verifier, verifierType, msg.sender);
    }
    
    /**
     * @dev Internal function to register a verifier
     */
    function _registerVerifier(
        address verifier,
        string calldata verifierType,
        IRegionalRegistry.Region[] calldata supportedRegions,
        string calldata metadata,
        address registrar,
        bool deployedByFactory,
        bytes32 deploymentSalt
    ) internal {
        verifierEntries[verifier] = UnifiedVerifierEntry({
            verifierAddress: verifier,
            verifierType: verifierType,
            supportedRegions: supportedRegions,
            active: true,
            trusted: false,
            registeredAt: block.timestamp,
            lastUpdated: block.timestamp,
            metadata: metadata,
            registrar: registrar,
            deployedByFactory: deployedByFactory,
            deploymentSalt: deploymentSalt
        });
        
        // Initialize stats
        verifierStats[verifier] = VerifierStats({
            totalVerifications: 0,
            successfulVerifications: 0,
            failedVerifications: 0,
            lastVerificationTime: 0,
            averageProcessingTime: 0
        });
        
        // Update mappings
        allVerifiers.push(verifier);
        verifiersByType[verifierType].push(verifier);
        
        for (uint256 i = 0; i < supportedRegions.length; i++) {
            verifiersByRegion[supportedRegions[i]].push(verifier);
            verifierRegionSupport[verifier][supportedRegions[i]] = true;
        }
        
        // Update type tracking
        if (!typeExists[verifierType]) {
            supportedTypes.push(verifierType);
            typeExists[verifierType] = true;
        }
        
        totalVerifiers++;
        activeVerifiers++;
        verifierCount++;
    }
    
    /**
     * @dev Update verifier metadata
     */
    function updateVerifierMetadata(
        address verifier,
        string calldata metadata
    ) external onlyRole(VERIFIER_MANAGER_ROLE) validVerifier(verifier) {
        verifierEntries[verifier].metadata = metadata;
        verifierEntries[verifier].lastUpdated = block.timestamp;
        
        emit VerifierUpdated(verifier, metadata);
    }
    
    /**
     * @dev Activate or deactivate a verifier
     */
    function activateVerifier(address verifier) external onlyRole(VERIFIER_MANAGER_ROLE) validVerifier(verifier) {
        UnifiedVerifierEntry storage entry = verifierEntries[verifier];
        require(!entry.active, "UnifiedVerifierManager: Already active");
        
        entry.active = true;
        entry.lastUpdated = block.timestamp;
        activeVerifiers++;
        
        emit VerifierActivated(verifier);
    }
    
    function deactivateVerifier(address verifier) external onlyRole(VERIFIER_MANAGER_ROLE) validVerifier(verifier) {
        UnifiedVerifierEntry storage entry = verifierEntries[verifier];
        require(entry.active, "UnifiedVerifierManager: Already inactive");
        
        entry.active = false;
        entry.lastUpdated = block.timestamp;
        activeVerifiers--;
        
        emit VerifierDeactivated(verifier);
    }
    
    /**
     * @dev Set verifier trusted status
     */
    function setVerifierTrusted(
        address verifier,
        bool trusted
    ) external onlyRole(DEFAULT_ADMIN_ROLE) validVerifier(verifier) {
        UnifiedVerifierEntry storage entry = verifierEntries[verifier];
        
        if (entry.trusted != trusted) {
            entry.trusted = trusted;
            entry.lastUpdated = block.timestamp;
            
            if (trusted) {
                trustedVerifiers.push(verifier);
                trustedVerifierCount++;
            } else {
                _removeFromTrustedList(verifier);
                trustedVerifierCount--;
            }
            
            emit VerifierTrusted(verifier, trusted);
        }
    }
    
    /**
     * @dev Set verifier blacklist status
     */
    function setVerifierBlacklisted(
        address verifier,
        bool blacklisted
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(verifier != address(0), "UnifiedVerifierManager: Invalid verifier address");
        
        if (blacklistedVerifiers[verifier] != blacklisted) {
            blacklistedVerifiers[verifier] = blacklisted;
            
            if (blacklisted && verifierEntries[verifier].verifierAddress != address(0)) {
                // Automatically deactivate blacklisted verifiers
                if (verifierEntries[verifier].active) {
                    verifierEntries[verifier].active = false;
                    activeVerifiers--;
                    emit VerifierDeactivated(verifier);
                }
            }
            
            emit VerifierBlacklisted(verifier, blacklisted);
        }
    }
    
    /**
     * @dev Update verifier supported regions
     */
    function updateVerifierRegions(
        address verifier,
        IRegionalRegistry.Region[] calldata regions
    ) external onlyRole(VERIFIER_MANAGER_ROLE) validVerifier(verifier) {
        require(regions.length > 0, "UnifiedVerifierManager: No regions provided");
        
        UnifiedVerifierEntry storage entry = verifierEntries[verifier];
        
        // Remove from old region mappings
        for (uint256 i = 0; i < entry.supportedRegions.length; i++) {
            verifierRegionSupport[verifier][entry.supportedRegions[i]] = false;
            _removeFromRegionList(verifier, entry.supportedRegions[i]);
        }
        
        // Add to new region mappings
        entry.supportedRegions = regions;
        for (uint256 i = 0; i < regions.length; i++) {
            verifiersByRegion[regions[i]].push(verifier);
            verifierRegionSupport[verifier][regions[i]] = true;
        }
        
        entry.lastUpdated = block.timestamp;
        
        emit VerifierRegionsUpdated(verifier, regions);
    }
    
    /**
     * @dev Update verifier statistics
     */
    function updateVerifierStats(
        address verifier,
        uint256 totalVerifications,
        uint256 successfulVerifications,
        uint256 failedVerifications,
        uint256 averageProcessingTime
    ) external onlyRole(VERIFIER_MANAGER_ROLE) validVerifier(verifier) {
        VerifierStats storage stats = verifierStats[verifier];
        
        stats.totalVerifications = totalVerifications;
        stats.successfulVerifications = successfulVerifications;
        stats.failedVerifications = failedVerifications;
        stats.lastVerificationTime = block.timestamp;
        stats.averageProcessingTime = averageProcessingTime;
        
        emit VerifierStatsUpdated(verifier, totalVerifications);
    }
    
    // =============================================================================
    // QUERY FUNCTIONS
    // =============================================================================
    
    /**
     * @dev Get active verifiers by type
     */
    function getActiveVerifiersByType(string calldata verifierType) external view returns (address[] memory) {
        address[] memory typeVerifiers = verifiersByType[verifierType];
        address[] memory activeTypeVerifiers = new address[](typeVerifiers.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < typeVerifiers.length; i++) {
            if (verifierEntries[typeVerifiers[i]].active && !blacklistedVerifiers[typeVerifiers[i]]) {
                activeTypeVerifiers[count] = typeVerifiers[i];
                count++;
            }
        }
        
        // Resize array
        assembly {
            mstore(activeTypeVerifiers, count)
        }
        
        return activeTypeVerifiers;
    }
    
    /**
     * @dev Get active verifiers by region
     */
    function getActiveVerifiersByRegion(IRegionalRegistry.Region region) external view returns (address[] memory) {
        address[] memory regionVerifiers = verifiersByRegion[region];
        address[] memory activeRegionVerifiers = new address[](regionVerifiers.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < regionVerifiers.length; i++) {
            if (verifierEntries[regionVerifiers[i]].active && !blacklistedVerifiers[regionVerifiers[i]]) {
                activeRegionVerifiers[count] = regionVerifiers[i];
                count++;
            }
        }
        
        // Resize array
        assembly {
            mstore(activeRegionVerifiers, count)
        }
        
        return activeRegionVerifiers;
    }
    
    /**
     * @dev Get trusted verifiers
     */
    function getTrustedVerifiers() external view returns (address[] memory) {
        address[] memory activeTrustedVerifiers = new address[](trustedVerifiers.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < trustedVerifiers.length; i++) {
            if (verifierEntries[trustedVerifiers[i]].active && !blacklistedVerifiers[trustedVerifiers[i]]) {
                activeTrustedVerifiers[count] = trustedVerifiers[i];
                count++;
            }
        }
        
        // Resize array
        assembly {
            mstore(activeTrustedVerifiers, count)
        }
        
        return activeTrustedVerifiers;
    }
    
    /**
     * @dev Check if verifier supports region
     */
    function supportsRegion(address verifier, IRegionalRegistry.Region region) external view returns (bool) {
        return verifierRegionSupport[verifier][region];
    }
    
    /**
     * @dev Get verifier info
     */
    function getVerifierInfo(address verifier) external view returns (UnifiedVerifierEntry memory) {
        return verifierEntries[verifier];
    }
    
    /**
     * @dev Get verifier statistics
     */
    function getVerifierStats(address verifier) external view returns (VerifierStats memory) {
        return verifierStats[verifier];
    }
    
    // =============================================================================
    // UTILITY FUNCTIONS
    // =============================================================================
    
    /**
     * @dev Remove verifier from trusted list
     */
    function _removeFromTrustedList(address verifier) internal {
        for (uint256 i = 0; i < trustedVerifiers.length; i++) {
            if (trustedVerifiers[i] == verifier) {
                trustedVerifiers[i] = trustedVerifiers[trustedVerifiers.length - 1];
                trustedVerifiers.pop();
                break;
            }
        }
    }
    
    /**
     * @dev Remove verifier from region list
     */
    function _removeFromRegionList(address verifier, IRegionalRegistry.Region region) internal {
        address[] storage regionList = verifiersByRegion[region];
        for (uint256 i = 0; i < regionList.length; i++) {
            if (regionList[i] == verifier) {
                regionList[i] = regionList[regionList.length - 1];
                regionList.pop();
                break;
            }
        }
    }
    
    /**
     * @dev Upgrade verifier (deploy new version and deactivate old)
     */
    function upgradeVerifier(
        address oldVerifier,
        string calldata verifierType,
        bytes calldata constructorData,
        string calldata metadata
    ) external onlyRole(DEFAULT_ADMIN_ROLE) validVerifier(oldVerifier) returns (address newVerifier) {
        UnifiedVerifierEntry storage oldEntry = verifierEntries[oldVerifier];
        
        // Deploy new verifier
        newVerifier = this.deployVerifier(verifierType, constructorData, oldEntry.supportedRegions, metadata);
        
        // Deactivate old verifier
        oldEntry.active = false;
        activeVerifiers--;
        
        emit VerifierDeactivated(oldVerifier);
        
        return newVerifier;
    }
    
    /**
     * @dev Set authorized deployer status
     */
    function setAuthorizedDeployer(address deployer, bool authorized) external onlyRole(DEFAULT_ADMIN_ROLE) {
        authorizedDeployers[deployer] = authorized;
    }
    
    /**
     * @dev Emergency pause
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @dev Unpause
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @dev Get all supported verifier types
     */
    function getSupportedTypes() external view returns (string[] memory) {
        return supportedTypes;
    }
    
    /**
     * @dev Get total counts
     */
    function getCounts() external view returns (uint256 total, uint256 active, uint256 trusted) {
        return (totalVerifiers, activeVerifiers, trustedVerifierCount);
    }
}