// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IRegionalRegistry.sol";

/**
 * @title IMerchantRegistry
 * @dev Core interface for merchant identity and KYC management
 * @notice Focuses on merchant registration, KYC, and basic profile management
 */
interface IMerchantRegistry {
    // Structs
    struct PaymentMethod {
        string methodType;
        string identifier;
        mapping(string => string) metadata;
        bool active;
        uint256 addedTimestamp;
    }

    struct MerchantProfile {
        uint256 merchantId;
        address owner;
        uint256 kycNftId;
        bool registered;
        bool approved;
        bool revoked;
        uint256 registrationTime;
        uint256 lastActivityTime;
        IRegionalRegistry.Region region;
        uint256 stakeAmount;
        uint256 reputationScore;
        string[] activeChains;
        uint256 paymentMethodCount;
        mapping(uint256 => PaymentMethod) paymentMethods;
    }
    
    struct KYCData {
        string documentHash;
        uint256 verificationTime;
        bool isVerified;
        string merchantName;
        string businessType;
        address verifier;
    }
    
    struct MerchantMetrics {
        uint256 totalTransactions;
        uint256 totalVolume;
        uint256 successfulTransactions;
        uint256 reputationScore;
        uint256 disputeCount;
        uint256 averageResponseTime;
        uint256 averageTransactionValue;
        uint256 lastTransactionTimestamp;
        uint256 lastUpdated;
    }
    
    // Events
    event MerchantRegistered(uint256 indexed merchantId, address indexed owner, uint256 kycNftId, IRegionalRegistry.Region region);
    event MerchantApproved(uint256 indexed merchantId, address indexed dao);
    event MerchantRevoked(uint256 indexed merchantId, address indexed dao, string reason);
    event KYCIssued(uint256 indexed merchantId, uint256 indexed tokenId, string documentHash);
    event KYCVerified(uint256 indexed tokenId, address indexed verifier);
    event ReputationUpdated(uint256 indexed merchantId, int256 delta, uint256 newScore);
    event EscrowLinked(uint256 indexed merchantId, address escrowAddress, string chain);
    event FactoryAuthorized(address indexed factory, bool authorized);
    event VerifierAuthorized(address indexed verifier, bool authorized);
    
    // Core merchant management
    function registerMerchant(
        address owner,
        string calldata kycDocumentHash,
        string calldata merchantName,
        string calldata businessType,
        IRegionalRegistry.Region region,
        uint256 stakeAmount
    ) external payable returns (uint256 merchantId);
    
    function approveMerchant(uint256 merchantId) external;
    function revokeMerchant(uint256 merchantId, string calldata reason) external;
    
    // KYC management
    function issueKYC(
        uint256 merchantId,
        string calldata documentHash,
        string calldata merchantName,
        string calldata businessType
    ) external returns (uint256 kycTokenId);
    
    function verifyKYC(uint256 kycTokenId) external;
    function updateMerchantKYC(uint256 merchantId, string calldata newKycHash) external;
    
    // Escrow and chain management
    function linkEscrow(uint256 merchantId, address escrowAddress, string calldata chain) external;
    function activateChain(uint256 merchantId, string calldata chain) external;
    function deactivateChain(uint256 merchantId, string calldata chain) external;
    
    // Reputation and metrics
    function updateReputation(uint256 merchantId, int256 delta) external;
    function updateMerchantMetrics(
        uint256 merchantId,
        uint256 transactions,
        uint256 volume,
        uint256 successfulTransactions,
        uint256 disputes,
        uint256 responseTime
    ) external;
    
    // Authorization management
    function authorizeFactory(address factory, bool authorized) external;
    function authorizeVerifier(address verifier, bool authorized) external;
    
    // View functions
    function isMerchantRegistered(address merchant) external view returns (bool);
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
    );
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
    );
    function getKYCData(uint256 kycTokenId) external view returns (KYCData memory);
    function getMerchantMetrics(uint256 merchantId) external view returns (MerchantMetrics memory);
    
    function isFactoryAuthorized(address factory) external view returns (bool);
    function isVerifierAuthorized(address verifier) external view returns (bool);
    function getMerchantEscrow(uint256 merchantId, string calldata chain) external view returns (address);
    function isChainActive(uint256 merchantId, string calldata chain) external view returns (bool);
    
    function getTotalMerchants() external view returns (uint256);
    function getRegisteredMerchantIds() external view returns (uint256[] memory);
    function ownerToMerchantId(address owner) external view returns (uint256);
    function getMerchantAddress(uint256 merchantId) external view returns (address);
}