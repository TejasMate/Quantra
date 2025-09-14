// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleMerchantRegistry
 * @dev A simple merchant registry for testing purposes
 */
contract SimpleMerchantRegistry is Ownable {
    
    // Merchant structure
    struct Merchant {
        bool isActive;
        string businessName;
        string upiId;
        uint256 registrationTime;
    }
    
    // Mapping from merchant address to merchant data
    mapping(address => Merchant) public merchants;
    
    // Array to keep track of all merchant addresses
    address[] public merchantList;
    
    // Events
    event MerchantRegistered(address indexed merchant, string businessName, string upiId);
    event MerchantStatusUpdated(address indexed merchant, bool isActive);
    
    constructor(address _owner) Ownable(_owner) {
        // Transfer ownership to the specified address
        if (_owner != msg.sender) {
            _transferOwnership(_owner);
        }
    }
    
    /**
     * @dev Register a new merchant
     * @param merchant Address of the merchant
     * @param businessName Name of the business
     * @param upiId UPI ID for payments
     */
    function registerMerchant(
        address merchant,
        string memory businessName,
        string memory upiId
    ) external onlyOwner {
        require(merchant != address(0), "Invalid merchant address");
        require(bytes(businessName).length > 0, "Business name required");
        require(bytes(upiId).length > 0, "UPI ID required");
        require(!merchants[merchant].isActive, "Merchant already registered");
        
        merchants[merchant] = Merchant({
            isActive: true,
            businessName: businessName,
            upiId: upiId,
            registrationTime: block.timestamp
        });
        
        merchantList.push(merchant);
        
        emit MerchantRegistered(merchant, businessName, upiId);
    }
    
    /**
     * @dev Check if a merchant is registered and active
     * @param merchant Address to check
     * @return true if merchant is registered and active
     */
    function isMerchantRegistered(address merchant) external view returns (bool) {
        return merchants[merchant].isActive;
    }
    
    /**
     * @dev Get merchant details
     * @param merchant Address of the merchant
     * @return isActive Whether merchant is active
     * @return businessName Name of the business
     * @return upiId UPI ID for payments
     * @return registrationTime When merchant was registered
     */
    function getMerchantDetails(address merchant) external view returns (
        bool isActive,
        string memory businessName,
        string memory upiId,
        uint256 registrationTime
    ) {
        Merchant memory m = merchants[merchant];
        return (m.isActive, m.businessName, m.upiId, m.registrationTime);
    }
    
    /**
     * @dev Update merchant status
     * @param merchant Address of the merchant
     * @param isActive New status
     */
    function updateMerchantStatus(address merchant, bool isActive) external onlyOwner {
        require(merchants[merchant].registrationTime > 0, "Merchant not found");
        merchants[merchant].isActive = isActive;
        emit MerchantStatusUpdated(merchant, isActive);
    }
    
    /**
     * @dev Get total number of merchants
     * @return Total count of merchants
     */
    function getMerchantCount() external view returns (uint256) {
        return merchantList.length;
    }
    
    /**
     * @dev Get merchant address by index
     * @param index Index in the merchant list
     * @return Merchant address
     */
    function getMerchantByIndex(uint256 index) external view returns (address) {
        require(index < merchantList.length, "Index out of bounds");
        return merchantList[index];
    }
}