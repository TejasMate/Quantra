// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IMerchantOperations.sol";

/**
 * @title SimpleMerchantOperations
 * @dev A simple implementation of IMerchantOperations for escrow contract compatibility
 */
contract SimpleMerchantOperations is Ownable, IMerchantOperations {
    
    // Merchant structure
    struct Merchant {
        bool isActive;
        address owner;
        string businessName;
        string upiId;
        uint256 registrationTime;
        mapping(string => address) escrowContracts; // chain => escrow address
    }
    
    // Mapping from merchant ID to merchant data
    mapping(uint256 => Merchant) public merchants;
    
    // Mapping from owner address to merchant ID
    mapping(address => uint256) public ownerToMerchantId;
    
    // Counter for merchant IDs
    uint256 public nextMerchantId = 1;
    
    // Array to keep track of all merchant IDs
    uint256[] public merchantList;
    
    // Events
    event MerchantRegistered(uint256 indexed merchantId, address indexed owner, string businessName, string upiId);
    event MerchantStatusUpdated(uint256 indexed merchantId, bool isActive);
    event EscrowLinked(uint256 indexed merchantId, address indexed escrowAddress, string chain);
    
    constructor(address _owner) Ownable(_owner) {
        // Transfer ownership to the specified address
        if (_owner != msg.sender) {
            _transferOwnership(_owner);
        }
    }
    
    /**
     * @dev Register a new merchant
     * @param owner Address of the merchant owner
     * @param businessName Name of the business
     * @param upiId UPI ID for payments
     * @return merchantId The assigned merchant ID
     */
    function registerMerchant(
        address owner,
        string memory businessName,
        string memory upiId
    ) external onlyOwner returns (uint256) {
        require(owner != address(0), "Invalid owner address");
        require(bytes(businessName).length > 0, "Business name required");
        require(bytes(upiId).length > 0, "UPI ID required");
        require(ownerToMerchantId[owner] == 0, "Owner already has a merchant ID");
        
        uint256 merchantId = nextMerchantId++;
        
        merchants[merchantId].isActive = true;
        merchants[merchantId].owner = owner;
        merchants[merchantId].businessName = businessName;
        merchants[merchantId].upiId = upiId;
        merchants[merchantId].registrationTime = block.timestamp;
        
        ownerToMerchantId[owner] = merchantId;
        merchantList.push(merchantId);
        
        emit MerchantRegistered(merchantId, owner, businessName, upiId);
        
        return merchantId;
    }
    
    // IMerchantOperations interface implementation
    
    /**
     * @dev Check if a merchant is registered
     * @param merchantId The merchant ID to check
     * @return bool True if merchant is registered
     */
    function isMerchantRegistered(uint256 merchantId) external view override returns (bool) {
        return merchants[merchantId].isActive;
    }
    
    /**
     * @dev Get merchant ID by owner address
     * @param owner The owner address
     * @return uint256 The merchant ID (0 if not found)
     */
    function getMerchantIdByOwner(address owner) external view override returns (uint256) {
        return ownerToMerchantId[owner];
    }
    
    /**
     * @dev Link escrow contract to merchant
     * @param merchantId The merchant ID
     * @param escrowAddress The escrow contract address
     * @param chain The blockchain identifier
     */
    function linkEscrow(uint256 merchantId, address escrowAddress, string calldata chain) external override {
        require(merchants[merchantId].isActive, "Merchant not registered");
        require(escrowAddress != address(0), "Invalid escrow address");
        
        merchants[merchantId].escrowContracts[chain] = escrowAddress;
        
        emit EscrowLinked(merchantId, escrowAddress, chain);
    }
    
    /**
     * @dev Check if caller is authorized to perform merchant operations
     * @param caller The address to check
     * @param merchantId The merchant ID
     * @return bool True if authorized
     */
    function isAuthorizedForMerchant(address caller, uint256 merchantId) external view override returns (bool) {
        return merchants[merchantId].owner == caller || owner() == caller;
    }
    
    // Additional view functions for convenience
    
    /**
     * @dev Get merchant details by ID
     * @param merchantId The merchant ID
     * @return isActive Whether merchant is active
     * @return owner Owner address
     * @return businessName Name of the business
     * @return upiId UPI ID for payments
     * @return registrationTime When merchant was registered
     */
    function getMerchantDetails(uint256 merchantId) external view returns (
        bool isActive,
        address owner,
        string memory businessName,
        string memory upiId,
        uint256 registrationTime
    ) {
        Merchant storage m = merchants[merchantId];
        return (m.isActive, m.owner, m.businessName, m.upiId, m.registrationTime);
    }
    
    /**
     * @dev Get merchant profile (compatible with IMerchantRegistry interface)
     * @param merchantId The merchant ID
     * @return merchantId The merchant ID
     * @return owner Owner address
     * @return businessName Name of the business
     * @return upiId UPI ID for payments
     * @return isActive Whether merchant is active
     * @return registrationTime When merchant was registered
     * @return kycHash Empty string (not implemented)
     * @return reputation 0 (not implemented)
     * @return totalTransactions 0 (not implemented)
     * @return successfulTransactions 0 (not implemented)
     * @return disputes 0 (not implemented)
     * @return isApproved true (auto-approved)
     * @return chainCount 1 (single chain)
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
    ) {
        Merchant storage m = merchants[merchantId];
        return (
            merchantId,
            m.owner,
            m.businessName,
            m.upiId,
            m.isActive,
            m.registrationTime,
            "", // empty kycHash
            0, // reputation
            0, // totalTransactions
            0, // successfulTransactions
            0, // disputes
            m.isActive, // isApproved (same as isActive)
            1 // chainCount
        );
    }
    
    /**
     * @dev Update merchant status
     * @param merchantId The merchant ID
     * @param isActive New status
     */
    function updateMerchantStatus(uint256 merchantId, bool isActive) external onlyOwner {
        require(merchants[merchantId].registrationTime > 0, "Merchant not found");
        merchants[merchantId].isActive = isActive;
        emit MerchantStatusUpdated(merchantId, isActive);
    }
    
    /**
     * @dev Get total number of merchants
     * @return Total count of merchants
     */
    function getMerchantCount() external view returns (uint256) {
        return merchantList.length;
    }
    
    /**
     * @dev Get merchant ID by index
     * @param index Index in the merchant list
     * @return Merchant ID
     */
    function getMerchantIdByIndex(uint256 index) external view returns (uint256) {
        require(index < merchantList.length, "Index out of bounds");
        return merchantList[index];
    }
    
    /**
     * @dev Get escrow contract address for a merchant on a specific chain
     * @param merchantId The merchant ID
     * @param chain The blockchain identifier
     * @return The escrow contract address
     */
    function getEscrowContract(uint256 merchantId, string calldata chain) external view returns (address) {
        return merchants[merchantId].escrowContracts[chain];
    }

    /**
     * @dev Update merchant reputation (called by escrow contracts)
     * @param merchantId The merchant ID
     * @param reputationChange The reputation change (positive or negative)
     */
    function updateReputation(uint256 merchantId, int256 reputationChange) external override {
        require(owner() == msg.sender, "Only owner can update reputation");
        // Simple implementation - in production you'd want more sophisticated logic
        emit ReputationUpdated(merchantId, 100); // Default reputation
    }

    /**
     * @dev Validate merchant can create escrow on specific chain
     * @param merchantId The merchant ID
     * @param chain The blockchain identifier
     * @param tokenSymbol The token symbol to be used
     * @return isValid True if merchant can create escrow
     * @return reason Reason if validation fails
     */
    function validateEscrowCreation(uint256 merchantId, string calldata chain, string calldata tokenSymbol) 
        external view override returns (bool isValid, string memory reason) {
        
        if (!merchants[merchantId].isActive) {
            return (false, "Merchant not active");
        }
        
        return (true, "Validation successful");
    }

    // Events for interface compatibility
    event ReputationUpdated(uint256 indexed merchantId, uint256 newReputation);
}