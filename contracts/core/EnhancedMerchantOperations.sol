// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IMerchantOperations.sol";
import "../interfaces/IRegionalRegistry.sol";

/**
 * @title EnhancedMerchantOperations
 * @dev Simplified unified merchant contract with core features from SimpleMerchantOperations + essential enhancements
 * @notice Maintains escrow compatibility while adding key features from core contracts
 */
contract EnhancedMerchantOperations is 
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable,
    ReentrancyGuardUpgradeable,
    IMerchantOperations
{
    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");
    bytes32 public constant KYC_VERIFIER_ROLE = keccak256("KYC_VERIFIER_ROLE");

    // Enhanced Merchant Structure
    struct Merchant {
        // Core data (from SimpleMerchantOperations)
        bool isActive;
        address owner;
        string businessName;
        string upiId;
        uint256 registrationTime;
        
        // Enhanced features
        string kycDocumentHash;
        bool kycVerified;
        IRegionalRegistry.Region region;
        uint256 stakeAmount;
        uint256 reputation;
        uint256 totalTransactions;
        uint256 successfulTransactions;
        uint256 disputes;
        bool isApproved;
        
        // Escrow management
        mapping(string => address) escrowContracts; // chain => escrow address
        string[] activeChains;
        mapping(string => bool) supportedChains;
    }

    // State variables
    mapping(uint256 => Merchant) public merchants;
    mapping(address => uint256) public ownerToMerchantId;
    uint256 public nextMerchantId;
    uint256[] public merchantList;

    // Regional management (simplified)
    mapping(IRegionalRegistry.Region => uint256) public regionalMerchantCounts;
    mapping(IRegionalRegistry.Region => uint256) public minStakeAmounts;
    mapping(IRegionalRegistry.Region => bool) public regionActive;

    // Governance features (simplified)
    bool public globalKycBypass;
    mapping(IRegionalRegistry.Region => bool) public regionKycBypass;

    // Events
    event MerchantRegistered(
        uint256 indexed merchantId, 
        address indexed owner, 
        string businessName, 
        string upiId,
        uint256 region
    );
    event MerchantStatusUpdated(uint256 indexed merchantId, bool isActive);
    event EscrowLinked(uint256 indexed merchantId, address indexed escrowAddress, string chain);
    event KYCVerified(uint256 indexed merchantId, bool approved, address verifier);
    event ReputationUpdated(uint256 indexed merchantId, uint256 newReputation);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address dao) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(DAO_ROLE, dao);
        
        nextMerchantId = 1;
        
        // Initialize default regions
        _initializeDefaultRegions();
    }

    // ========== MERCHANT REGISTRATION & MANAGEMENT ==========

    /**
     * @dev Register a new merchant
     */
    function registerMerchant(
        address owner,
        string memory businessName,
        string memory upiId,
        string memory kycDocumentHash,
        IRegionalRegistry.Region region
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        require(owner != address(0), "Invalid owner address");
        require(bytes(businessName).length > 0, "Business name required");
        require(bytes(upiId).length > 0, "UPI ID required");
        require(ownerToMerchantId[owner] == 0, "Owner already has a merchant ID");
        require(regionActive[region], "Region not active");
        
        uint256 requiredStake = minStakeAmounts[region];
        require(msg.value >= requiredStake, "Insufficient stake amount");
        
        uint256 merchantId = nextMerchantId++;
        
        // Initialize merchant
        Merchant storage merchant = merchants[merchantId];
        merchant.isActive = true;
        merchant.owner = owner;
        merchant.businessName = businessName;
        merchant.upiId = upiId;
        merchant.registrationTime = block.timestamp;
        merchant.kycDocumentHash = kycDocumentHash;
        merchant.region = region;
        merchant.stakeAmount = msg.value;
        merchant.reputation = 100;
        merchant.isApproved = _shouldAutoApprove(owner, region);
        
        ownerToMerchantId[owner] = merchantId;
        merchantList.push(merchantId);
        regionalMerchantCounts[region]++;
        
        // Refund excess payment
        if (msg.value > requiredStake) {
            payable(msg.sender).transfer(msg.value - requiredStake);
        }
        
        emit MerchantRegistered(merchantId, owner, businessName, upiId, uint256(region));
        
        return merchantId;
    }

    // ========== ESCROW OPERATIONS (IMerchantOperations) ==========

    /**
     * @dev Check if a merchant is registered
     */
    function isMerchantRegistered(uint256 merchantId) external view override returns (bool) {
        return merchants[merchantId].isActive && merchants[merchantId].isApproved;
    }

    /**
     * @dev Get merchant ID by owner address
     */
    function getMerchantIdByOwner(address owner) external view override returns (uint256) {
        return ownerToMerchantId[owner];
    }

    /**
     * @dev Link escrow contract to merchant
     */
    function linkEscrow(uint256 merchantId, address escrowAddress, string calldata chain) external override {
        require(merchants[merchantId].isActive, "Merchant not registered");
        require(escrowAddress != address(0), "Invalid escrow address");
        
        merchants[merchantId].escrowContracts[chain] = escrowAddress;
        
        // Add chain to active chains if not already present
        if (!merchants[merchantId].supportedChains[chain]) {
            merchants[merchantId].supportedChains[chain] = true;
            merchants[merchantId].activeChains.push(chain);
        }
        
        emit EscrowLinked(merchantId, escrowAddress, chain);
    }

    /**
     * @dev Check if caller is authorized to perform merchant operations
     */
    function isAuthorizedForMerchant(address caller, uint256 merchantId) external view override returns (bool) {
        return merchants[merchantId].owner == caller || 
               hasRole(ADMIN_ROLE, caller) || 
               hasRole(DAO_ROLE, caller);
    }

    /**
     * @dev Get comprehensive merchant profile
     */
    function getMerchantProfile(uint256 merchantId) external view override returns (
        uint256,
        address owner,
        string memory businessName,
        string memory upiId,
        bool isActive,
        uint256 registrationTime,
        string memory kycHash,
        int256 reputation,
        uint256 totalTransactions,
        uint256 successfulTransactions,
        uint256 disputes,
        bool isApproved,
        uint256 chainCount
    ) {
        Merchant storage merchant = merchants[merchantId];
        return (
            merchantId,
            merchant.owner,
            merchant.businessName,
            merchant.upiId,
            merchant.isActive,
            merchant.registrationTime,
            merchant.kycDocumentHash,
            int256(merchant.reputation),
            merchant.totalTransactions,
            merchant.successfulTransactions,
            merchant.disputes,
            merchant.isApproved,
            merchant.activeChains.length
        );
    }

    /**
     * @dev Get escrow contract address
     */
    function getEscrowContract(uint256 merchantId, string calldata chain) external view override returns (address) {
        return merchants[merchantId].escrowContracts[chain];
    }

    /**
     * @dev Update merchant reputation
     */
    function updateReputation(uint256 merchantId, int256 reputationChange) external override {
        require(hasRole(ADMIN_ROLE, msg.sender) || hasRole(DAO_ROLE, msg.sender), "Not authorized");
        
        Merchant storage merchant = merchants[merchantId];
        require(merchant.registrationTime > 0, "Merchant not found");
        
        if (reputationChange > 0) {
            merchant.reputation += uint256(reputationChange);
            merchant.successfulTransactions++;
        } else if (reputationChange < 0) {
            uint256 decrease = uint256(-reputationChange);
            if (merchant.reputation > decrease) {
                merchant.reputation -= decrease;
            } else {
                merchant.reputation = 0;
            }
            merchant.disputes++;
        }
        
        merchant.totalTransactions++;
        
        emit ReputationUpdated(merchantId, merchant.reputation);
    }

    /**
     * @dev Validate escrow creation
     */
    function validateEscrowCreation(uint256 merchantId, string calldata chain, string calldata tokenSymbol) 
        external view override returns (bool isValid, string memory reason) {
        
        Merchant storage merchant = merchants[merchantId];
        
        if (merchant.registrationTime == 0) {
            return (false, "Merchant not found");
        }
        
        if (!merchant.isActive) {
            return (false, "Merchant not active");
        }
        
        if (!merchant.isApproved) {
            return (false, "Merchant not approved");
        }
        
        if (!globalKycBypass && !regionKycBypass[merchant.region] && !merchant.kycVerified) {
            return (false, "KYC verification required");
        }
        
        if (merchant.reputation < 50) {
            return (false, "Insufficient reputation score");
        }
        
        return (true, "Validation successful");
    }

    // ========== KYC MANAGEMENT ==========

    /**
     * @dev Verify merchant KYC
     */
    function verifyKYC(uint256 merchantId, bool approved) external onlyRole(KYC_VERIFIER_ROLE) {
        require(merchants[merchantId].registrationTime > 0, "Merchant not found");
        
        merchants[merchantId].kycVerified = approved;
        
        if (approved) {
            merchants[merchantId].isApproved = true;
        }
        
        emit KYCVerified(merchantId, approved, msg.sender);
    }

    // ========== VIEW FUNCTIONS ==========

    /**
     * @dev Get total number of merchants
     */
    function getMerchantCount() external view returns (uint256) {
        return merchantList.length;
    }

    /**
     * @dev Get merchant ID by index
     */
    function getMerchantIdByIndex(uint256 index) external view returns (uint256) {
        require(index < merchantList.length, "Index out of bounds");
        return merchantList[index];
    }

    /**
     * @dev Get merchant's supported chains
     */
    function getMerchantSupportedChains(uint256 merchantId) external view returns (string[] memory) {
        return merchants[merchantId].activeChains;
    }

    // ========== ADMIN FUNCTIONS ==========

    /**
     * @dev Update merchant status
     */
    function updateMerchantStatus(uint256 merchantId, bool isActive) external onlyRole(ADMIN_ROLE) {
        require(merchants[merchantId].registrationTime > 0, "Merchant not found");
        merchants[merchantId].isActive = isActive;
        emit MerchantStatusUpdated(merchantId, isActive);
    }

    /**
     * @dev Configure region
     */
    function configureRegion(
        IRegionalRegistry.Region region,
        uint256 minStake,
        bool active
    ) external onlyRole(ADMIN_ROLE) {
        regionActive[region] = active;
        minStakeAmounts[region] = minStake;
    }

    /**
     * @dev Set KYC bypass
     */
    function setKYCBypass(bool global, IRegionalRegistry.Region region, bool regionBypass) external onlyRole(DAO_ROLE) {
        globalKycBypass = global;
        regionKycBypass[region] = regionBypass;
    }

    /**
     * @dev Emergency pause
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ========== INTERNAL FUNCTIONS ==========

    function _initializeDefaultRegions() internal {
        // Initialize GLOBAL region
        regionActive[IRegionalRegistry.Region.GLOBAL] = true;
        minStakeAmounts[IRegionalRegistry.Region.GLOBAL] = 0;
        
        // Initialize other regions
        regionActive[IRegionalRegistry.Region.NORTH_AMERICA] = true;
        minStakeAmounts[IRegionalRegistry.Region.NORTH_AMERICA] = 0;
        
        regionActive[IRegionalRegistry.Region.ASIA_PACIFIC] = true;
        minStakeAmounts[IRegionalRegistry.Region.ASIA_PACIFIC] = 0;
    }

    function _shouldAutoApprove(address owner, IRegionalRegistry.Region region) internal view returns (bool) {
        return globalKycBypass || regionKycBypass[region];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(ADMIN_ROLE) {}

    // ========== RECEIVE FUNCTION ==========

    receive() external payable {
        // Accept ETH for stakes
    }
}