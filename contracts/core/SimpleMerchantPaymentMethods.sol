// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SimpleMerchantPaymentMethods
 * @dev Simple non-upgradeable version for testing payment method CRUD operations
 */
contract SimpleMerchantPaymentMethods is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");
    
    struct PaymentMethod {
        string methodType;
        string identifier;
        bool active;
        uint256 addedTimestamp;
    }
    
    // merchantId => methodId => PaymentMethod
    mapping(uint256 => mapping(uint256 => PaymentMethod)) public paymentMethods;
    // merchantId => method count
    mapping(uint256 => uint256) public merchantMethodCount;
    // merchantId => methodId => metadata key => metadata value
    mapping(uint256 => mapping(uint256 => mapping(string => string))) public methodMetadata;
    
    // Events
    event PaymentMethodAdded(uint256 indexed merchantId, uint256 indexed methodId, string methodType, string identifier);
    event PaymentMethodUpdated(uint256 indexed merchantId, uint256 indexed methodId, string newIdentifier);
    event PaymentMethodRemoved(uint256 indexed merchantId, uint256 indexed methodId);
    event PaymentMethodStatusChanged(uint256 indexed merchantId, uint256 indexed methodId, bool active);
    
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(REGISTRY_ROLE, admin);
    }
    
    /**
     * @dev Add a new payment method for a merchant
     */
    function addPaymentMethod(
        uint256 merchantId,
        string memory methodType,
        string memory identifier,
        string[] memory metadataKeys,
        string[] memory metadataValues
    ) external onlyRole(REGISTRY_ROLE) returns (uint256) {
        require(bytes(methodType).length > 0, "Method type cannot be empty");
        require(bytes(identifier).length > 0, "Identifier cannot be empty");
        require(metadataKeys.length == metadataValues.length, "Metadata arrays length mismatch");
        
        uint256 methodId = merchantMethodCount[merchantId];
        
        paymentMethods[merchantId][methodId] = PaymentMethod({
            methodType: methodType,
            identifier: identifier,
            active: true,
            addedTimestamp: block.timestamp
        });
        
        // Set metadata
        for (uint256 i = 0; i < metadataKeys.length; i++) {
            methodMetadata[merchantId][methodId][metadataKeys[i]] = metadataValues[i];
        }
        
        merchantMethodCount[merchantId]++;
        
        emit PaymentMethodAdded(merchantId, methodId, methodType, identifier);
        return methodId;
    }
    
    /**
     * @dev Update an existing payment method
     */
    function updatePaymentMethod(
        uint256 merchantId,
        uint256 methodId,
        string memory newIdentifier,
        string[] memory metadataKeys,
        string[] memory metadataValues
    ) external onlyRole(REGISTRY_ROLE) {
        require(methodId < merchantMethodCount[merchantId], "Method does not exist");
        require(bytes(newIdentifier).length > 0, "Identifier cannot be empty");
        require(metadataKeys.length == metadataValues.length, "Metadata arrays length mismatch");
        
        paymentMethods[merchantId][methodId].identifier = newIdentifier;
        
        // Update metadata
        for (uint256 i = 0; i < metadataKeys.length; i++) {
            methodMetadata[merchantId][methodId][metadataKeys[i]] = metadataValues[i];
        }
        
        emit PaymentMethodUpdated(merchantId, methodId, newIdentifier);
    }
    
    /**
     * @dev Remove a payment method (mark as inactive)
     */
    function removePaymentMethod(uint256 merchantId, uint256 methodId) external onlyRole(REGISTRY_ROLE) {
        require(methodId < merchantMethodCount[merchantId], "Method does not exist");
        
        paymentMethods[merchantId][methodId].active = false;
        
        emit PaymentMethodRemoved(merchantId, methodId);
    }
    
    /**
     * @dev Toggle payment method status
     */
    function togglePaymentMethodStatus(uint256 merchantId, uint256 methodId) external onlyRole(REGISTRY_ROLE) {
        require(methodId < merchantMethodCount[merchantId], "Method does not exist");
        
        bool newStatus = !paymentMethods[merchantId][methodId].active;
        paymentMethods[merchantId][methodId].active = newStatus;
        
        emit PaymentMethodStatusChanged(merchantId, methodId, newStatus);
    }
    
    /**
     * @dev Get all payment methods for a merchant
     */
    function getPaymentMethods(uint256 merchantId) external view returns (PaymentMethod[] memory) {
        uint256 count = merchantMethodCount[merchantId];
        PaymentMethod[] memory methods = new PaymentMethod[](count);
        
        for (uint256 i = 0; i < count; i++) {
            methods[i] = paymentMethods[merchantId][i];
        }
        
        return methods;
    }
    
    /**
     * @dev Get only active payment methods for a merchant
     */
    function getActivePaymentMethods(uint256 merchantId) external view returns (PaymentMethod[] memory) {
        uint256 count = merchantMethodCount[merchantId];
        uint256 activeCount = 0;
        
        // Count active methods
        for (uint256 i = 0; i < count; i++) {
            if (paymentMethods[merchantId][i].active) {
                activeCount++;
            }
        }
        
        PaymentMethod[] memory activeMethods = new PaymentMethod[](activeCount);
        uint256 index = 0;
        
        // Populate active methods
        for (uint256 i = 0; i < count; i++) {
            if (paymentMethods[merchantId][i].active) {
                activeMethods[index] = paymentMethods[merchantId][i];
                index++;
            }
        }
        
        return activeMethods;
    }
    
    /**
     * @dev Get payment method metadata
     */
    function getMethodMetadata(uint256 merchantId, uint256 methodId, string memory key) 
        external view returns (string memory) {
        return methodMetadata[merchantId][methodId][key];
    }
    
    /**
     * @dev Get payment method count for a merchant
     */
    function getMethodCount(uint256 merchantId) external view returns (uint256) {
        return merchantMethodCount[merchantId];
    }
}