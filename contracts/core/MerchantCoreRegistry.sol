// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IRegionalRegistry.sol";

/**
 * @title MerchantCoreRegistry
 * @dev Simplified merchant registry for localhost deployment
 */
contract MerchantCoreRegistry is 
    Initializable, 
    PausableUpgradeable, 
    AccessControlUpgradeable
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MERCHANT_ROLE = keccak256("MERCHANT_ROLE");

    struct SimpleMerchant {
        address owner;
        bool isActive;
        string businessName;
        uint256 registrationTime;
        uint256 reputation;
    }

    // Core storage
    mapping(uint256 => SimpleMerchant) public merchants;
    mapping(address => uint256) public ownerToMerchantId;
    uint256 private nextMerchantId;

    event MerchantRegistered(uint256 indexed merchantId, address indexed owner, string businessName);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) public initializer {
        __Pausable_init();
        __AccessControl_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        
        nextMerchantId = 1;
    }

    function registerMerchant(
        address owner,
        string calldata,  // kycDocumentHash
        string calldata merchantName,
        string calldata,  // businessType
        IRegionalRegistry.Region, // region
        uint256   // stakeAmount
    ) external payable returns (uint256) {
        require(bytes(merchantName).length > 0, "Merchant name required");
        require(ownerToMerchantId[owner] == 0, "Already registered");
        
        uint256 merchantId = nextMerchantId++;
        
        merchants[merchantId] = SimpleMerchant({
            owner: owner,
            isActive: true,
            businessName: merchantName,
            registrationTime: block.timestamp,
            reputation: 100
        });
        
        ownerToMerchantId[owner] = merchantId;
        _grantRole(MERCHANT_ROLE, owner);
        
        emit MerchantRegistered(merchantId, owner, merchantName);
        return merchantId;
    }

    function getMerchantProfile(uint256 merchantId) external view returns (
        uint256 merchantId_,
        address owner,
        uint256 kycNftId,
        bool registered,
        bool approved,
        bool revoked,
        uint256 registrationTime,
        uint256 lastActivityTime,
        IRegionalRegistry.Region region,
        uint256 stakeAmount,
        uint256 reputationScore,
        string[] memory activeChains,
        uint256 paymentMethodCount
    ) {
        SimpleMerchant memory merchant = merchants[merchantId];
        string[] memory chains = new string[](0);
        
        return (
            merchantId,
            merchant.owner,
            0, // kycNftId
            merchant.owner != address(0), // registered
            merchant.isActive, // approved
            false, // revoked
            merchant.registrationTime,
            merchant.registrationTime, // lastActivityTime
            IRegionalRegistry.Region.GLOBAL, // region
            0, // stakeAmount
            merchant.reputation,
            chains, // activeChains
            0 // paymentMethodCount
        );
    }

    function getTotalMerchants() external view returns (uint256) {
        return nextMerchantId - 1;
    }

    function isMerchantRegistered(address merchant) external view returns (bool) {
        return ownerToMerchantId[merchant] != 0;
    }
    
    function isMerchantRegistered(uint256 merchantId) external view returns (bool) {
        return merchantId > 0 && merchantId < nextMerchantId && merchants[merchantId].isActive;
    }

    function getMerchantAddress(uint256 merchantId) external view returns (address) {
        return merchants[merchantId].owner;
    }

    // Minimal implementations for other required functions
    function approveMerchant(uint256) external pure { revert("Simplified"); }
    function revokeMerchant(uint256, string calldata) external pure { revert("Simplified"); }
    function issueKYC(uint256, string calldata, string calldata, string calldata) external pure returns (uint256) { revert("Simplified"); }
    function verifyKYC(uint256) external pure { revert("Simplified"); }
    function updateMerchantKYC(uint256, string calldata) external pure { revert("Simplified"); }
    
    function linkEscrow(uint256 merchantId, address escrowAddress, string calldata chain) external {
        // Basic implementation - just emit an event for linking
        // In a full implementation, you would store the escrow mappings
        emit EscrowLinked(merchantId, escrowAddress, chain);
    }
    
    event EscrowLinked(uint256 indexed merchantId, address indexed escrowAddress, string chain);
    
    function getMerchantIdByOwner(address owner) external view returns (uint256) {
        return ownerToMerchantId[owner];
    }
    
    function activateChain(uint256, string calldata) external pure { revert("Simplified"); }
    function deactivateChain(uint256, string calldata) external pure { revert("Simplified"); }
    function updateReputation(uint256, int256) external pure { revert("Simplified"); }
    function updateMerchantMetrics(uint256, uint256, uint256, uint256, uint256, uint256) external pure { revert("Simplified"); }
    function authorizeFactory(address, bool) external pure { revert("Simplified"); }
    function authorizeVerifier(address, bool) external pure { revert("Simplified"); }
    
    function getMerchantByOwner(address owner) external view returns (
        uint256 merchantId,
        address owner_,
        uint256 kycNftId,
        bool registered,
        bool approved,
        bool revoked,
        uint256 registrationTime,
        uint256 lastActivityTime,
        IRegionalRegistry.Region region,
        uint256 stakeAmount,
        uint256 reputationScore,
        string[] memory activeChains,
        uint256 paymentMethodCount
    ) {
        uint256 id = ownerToMerchantId[owner];
        return this.getMerchantProfile(id);
    }
    
    function getKYCData(uint256) external pure returns (
        string memory documentHash,
        uint256 verificationTime,
        bool isVerified,
        string memory merchantName,
        string memory businessType,
        address verifier
    ) {
        return ("", 0, false, "", "", address(0));
    }
    
    function getMerchantMetrics(uint256) external pure returns (
        uint256 totalTransactions,
        uint256 totalVolume,
        uint256 successfulTransactions,
        uint256 reputationScore,
        uint256 disputeCount,
        uint256 averageResponseTime,
        uint256 averageTransactionValue,
        uint256 lastTransactionTimestamp,
        uint256 lastUpdated
    ) {
        return (0, 0, 0, 100, 0, 0, 0, 0, 0);
    }
    
    function isFactoryAuthorized(address) external pure returns (bool) { return false; }
    function isVerifierAuthorized(address) external pure returns (bool) { return false; }
    function getMerchantEscrow(uint256, string calldata) external pure returns (address) { return address(0); }
    function isChainActive(uint256, string calldata) external pure returns (bool) { return false; }
    function getRegisteredMerchantIds() external pure returns (uint256[] memory) {
        uint256[] memory ids = new uint256[](0);
        return ids;
    }
}
