// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IMerchantOperations
 * @dev Enhanced interface for merchant operations needed by factory contracts
 * @notice Provides delegation pattern for decoupling factory from registry implementation
 */
interface IMerchantOperations {
    // ========== CORE ESCROW COMPATIBILITY ==========
    
    /**
     * @dev Check if a merchant is registered and approved
     * @param merchantId The merchant ID to check
     * @return bool True if merchant is registered and approved
     */
    function isMerchantRegistered(uint256 merchantId) external view returns (bool);
    
    /**
     * @dev Get merchant ID by owner address
     * @param owner The owner address
     * @return uint256 The merchant ID (0 if not found)
     */
    function getMerchantIdByOwner(address owner) external view returns (uint256);
    
    /**
     * @dev Link escrow contract to merchant
     * @param merchantId The merchant ID
     * @param escrowAddress The escrow contract address
     * @param chain The blockchain identifier
     */
    function linkEscrow(uint256 merchantId, address escrowAddress, string calldata chain) external;
    
    /**
     * @dev Check if caller is authorized to perform merchant operations
     * @param caller The address to check
     * @param merchantId The merchant ID
     * @return bool True if authorized
     */
    function isAuthorizedForMerchant(address caller, uint256 merchantId) external view returns (bool);

    // ========== ENHANCED MERCHANT PROFILE ==========
    
    /**
     * @dev Get comprehensive merchant profile (compatible with existing escrow contracts)
     * @param merchantId The merchant ID
     * @return merchantId The merchant ID
     * @return owner Owner address
     * @return businessName Name of the business
     * @return upiId UPI ID for payments
     * @return isActive Whether merchant is active
     * @return registrationTime When merchant was registered
     * @return kycHash KYC document hash
     * @return reputation Merchant reputation score
     * @return totalTransactions Total transaction count
     * @return successfulTransactions Successful transaction count
     * @return disputes Dispute count
     * @return isApproved Whether merchant is approved
     * @return chainCount Number of supported chains
     */
    function getMerchantProfile(uint256 merchantId) external view returns (
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
    );

    // ========== REGIONAL & CHAIN SUPPORT ==========
    
    /**
     * @dev Check if merchant supports a specific chain
     * @param merchantId The merchant ID
     * @param chain The blockchain identifier
     * @return bool True if chain is supported
     */
    function isMerchantChainSupported(uint256 merchantId, string calldata chain) external view returns (bool);
    
    /**
     * @dev Get merchant's supported chains
     * @param merchantId The merchant ID
     * @return chains Array of supported chain identifiers
     */
    function getMerchantSupportedChains(uint256 merchantId) external view returns (string[] memory chains);
    
    /**
     * @dev Get merchant's regional configuration
     * @param merchantId The merchant ID
     * @return region The merchant's region
     * @return stakeAmount The merchant's stake amount
     * @return isKYCVerified Whether KYC is verified
     */
    function getMerchantRegionalInfo(uint256 merchantId) external view returns (
        uint256 region,
        uint256 stakeAmount,
        bool isKYCVerified
    );

    // ========== ESCROW MANAGEMENT ==========
    
    /**
     * @dev Get escrow contract address for merchant on specific chain
     * @param merchantId The merchant ID
     * @param chain The blockchain identifier
     * @return escrowAddress The escrow contract address
     */
    function getEscrowContract(uint256 merchantId, string calldata chain) external view returns (address);
    
    /**
     * @dev Get all escrow contracts for merchant
     * @param merchantId The merchant ID
     * @param chains Array of chain identifiers to query
     * @return escrowAddresses Array of escrow addresses corresponding to chains
     */
    function getMerchantEscrows(uint256 merchantId, string[] calldata chains) 
        external view returns (address[] memory escrowAddresses);

    // ========== PAYMENT METHODS ==========
    
    /**
     * @dev Get merchant payment methods
     * @param merchantId The merchant ID
     * @return methodTypes Array of payment method types
     * @return identifiers Array of payment method identifiers
     * @return activeStatus Array of active status for each method
     */
    function getMerchantPaymentMethods(uint256 merchantId) external view returns (
        string[] memory methodTypes,
        string[] memory identifiers,
        bool[] memory activeStatus
    );

    // ========== REPUTATION & ACTIVITY ==========
    
    /**
     * @dev Update merchant reputation (called by escrow contracts)
     * @param merchantId The merchant ID
     * @param reputationChange The reputation change (positive or negative)
     */
    function updateReputation(uint256 merchantId, int256 reputationChange) external;
    
    /**
     * @dev Record transaction activity
     * @param merchantId The merchant ID
     * @param successful Whether the transaction was successful
     * @param amount Transaction amount (for statistics)
     */
    function recordTransactionActivity(uint256 merchantId, bool successful, uint256 amount) external;

    // ========== AUTHORIZATION & VALIDATION ==========
    
    /**
     * @dev Validate merchant can create escrow on specific chain
     * @param merchantId The merchant ID
     * @param chain The blockchain identifier
     * @param tokenSymbol The token symbol to be used
     * @return isValid True if merchant can create escrow
     * @return reason Reason if validation fails
     */
    function validateEscrowCreation(uint256 merchantId, string calldata chain, string calldata tokenSymbol) 
        external view returns (bool isValid, string memory reason);
    
    /**
     * @dev Check if merchant has sufficient stake for escrow creation
     * @param merchantId The merchant ID
     * @param requiredAmount The required stake amount
     * @return hasSufficientStake True if merchant has sufficient stake
     */
    function hasSufficientStake(uint256 merchantId, uint256 requiredAmount) external view returns (bool);

    // ========== EVENTS ==========
    
    event MerchantRegistered(
        uint256 indexed merchantId, 
        address indexed owner, 
        string businessName, 
        string upiId,
        uint256 region
    );
    
    event EscrowLinked(
        uint256 indexed merchantId, 
        address indexed escrowAddress, 
        string chain
    );
    
    event MerchantStatusUpdated(
        uint256 indexed merchantId, 
        bool isActive
    );
    
    event ReputationUpdated(
        uint256 indexed merchantId, 
        uint256 newReputation
    );
    
    event PaymentMethodAdded(
        uint256 indexed merchantId, 
        uint256 indexed methodId, 
        string methodType
    );
    
    event KYCVerified(
        uint256 indexed merchantId, 
        bool approved, 
        address verifier
    );
}