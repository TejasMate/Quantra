// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title MerchantPaymentMethods
 * @dev Separate contract to handle payment methods, reducing main contract size
 */
contract MerchantPaymentMethods is AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");
    
    struct PaymentMethod {
        string methodType;
        string identifier;
        bool active;
        uint256 addedTimestamp;
        mapping(string => string) metadata;
    }
    
    struct PaymentMethodView {
        string methodType;
        string identifier;
        bool active;
        uint256 addedTimestamp;
    }
    
    // merchantId => methodId => PaymentMethod
    mapping(uint256 => mapping(uint256 => PaymentMethod)) public paymentMethods;
    // merchantId => payment method count
    mapping(uint256 => uint256) public paymentMethodCounts;
    
    event PaymentMethodAdded(uint256 indexed merchantId, uint256 indexed methodId, string methodType);
    event PaymentMethodRemoved(uint256 indexed merchantId, uint256 methodId, string methodType);
    event PaymentMethodUpdated(uint256 indexed merchantId, uint256 methodId, string methodType);
    event PaymentMethodStatusChanged(uint256 indexed merchantId, uint256 methodId, bool active);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(address admin) external initializer {
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }
    
    function addPaymentMethod(
        uint256 merchantId,
        string memory methodType,
        string memory identifier,
        string[] memory metadataKeys,
        string[] memory metadataValues
    ) external onlyRole(REGISTRY_ROLE) returns (uint256 methodId) {
        require(bytes(methodType).length > 0, "Method type required");
        require(bytes(identifier).length > 0, "Identifier required");
        require(metadataKeys.length == metadataValues.length, "Metadata arrays length mismatch");
        
        methodId = paymentMethodCounts[merchantId]++;
        
        PaymentMethod storage method = paymentMethods[merchantId][methodId];
        method.methodType = methodType;
        method.identifier = identifier;
        method.active = true;
        method.addedTimestamp = block.timestamp;
        
        for (uint256 i = 0; i < metadataKeys.length; i++) {
            method.metadata[metadataKeys[i]] = metadataValues[i];
        }
        
        emit PaymentMethodAdded(merchantId, methodId, methodType);
        return methodId;
    }
    
    function getPaymentMethods(uint256 merchantId) external view returns (PaymentMethodView[] memory) {
        uint256 count = paymentMethodCounts[merchantId];
        PaymentMethodView[] memory methods = new PaymentMethodView[](count);
        
        for (uint256 i = 0; i < count; i++) {
            PaymentMethod storage method = paymentMethods[merchantId][i];
            methods[i] = PaymentMethodView({
                methodType: method.methodType,
                identifier: method.identifier,
                active: method.active,
                addedTimestamp: method.addedTimestamp
            });
        }
        
        return methods;
    }
    
    /**
     * @dev Remove a payment method (soft delete - mark as inactive)
     */
    function removePaymentMethod(uint256 merchantId, uint256 methodId) external onlyRole(REGISTRY_ROLE) {
        require(methodId < paymentMethodCounts[merchantId], "Invalid method ID");
        
        PaymentMethod storage method = paymentMethods[merchantId][methodId];
        require(method.active, "Payment method already inactive");
        
        method.active = false;
        
        emit PaymentMethodRemoved(merchantId, methodId, method.methodType);
    }
    
    /**
     * @dev Update a payment method's details
     */
    function updatePaymentMethod(
        uint256 merchantId,
        uint256 methodId,
        string memory newIdentifier,
        string[] memory metadataKeys,
        string[] memory metadataValues
    ) external onlyRole(REGISTRY_ROLE) {
        require(methodId < paymentMethodCounts[merchantId], "Invalid method ID");
        require(bytes(newIdentifier).length > 0, "Identifier required");
        require(metadataKeys.length == metadataValues.length, "Metadata arrays length mismatch");
        
        PaymentMethod storage method = paymentMethods[merchantId][methodId];
        require(method.active, "Cannot update inactive payment method");
        
        method.identifier = newIdentifier;
        
        // Update metadata
        for (uint256 i = 0; i < metadataKeys.length; i++) {
            method.metadata[metadataKeys[i]] = metadataValues[i];
        }
        
        emit PaymentMethodUpdated(merchantId, methodId, method.methodType);
    }
    
    /**
     * @dev Toggle payment method active status
     */
    function togglePaymentMethodStatus(uint256 merchantId, uint256 methodId) external onlyRole(REGISTRY_ROLE) {
        require(methodId < paymentMethodCounts[merchantId], "Invalid method ID");
        
        PaymentMethod storage method = paymentMethods[merchantId][methodId];
        method.active = !method.active;
        
        emit PaymentMethodStatusChanged(merchantId, methodId, method.active);
    }
    
    /**
     * @dev Get payment method metadata
     */
    function getPaymentMethodMetadata(
        uint256 merchantId, 
        uint256 methodId, 
        string memory key
    ) external view returns (string memory) {
        require(methodId < paymentMethodCounts[merchantId], "Invalid method ID");
        return paymentMethods[merchantId][methodId].metadata[key];
    }
    
    /**
     * @dev Get active payment methods only
     */
    function getActivePaymentMethods(uint256 merchantId) external view returns (PaymentMethodView[] memory) {
        uint256 count = paymentMethodCounts[merchantId];
        uint256 activeCount = 0;
        
        // Count active methods
        for (uint256 i = 0; i < count; i++) {
            if (paymentMethods[merchantId][i].active) {
                activeCount++;
            }
        }
        
        PaymentMethodView[] memory activeMethods = new PaymentMethodView[](activeCount);
        uint256 activeIndex = 0;
        
        // Populate active methods
        for (uint256 i = 0; i < count; i++) {
            PaymentMethod storage method = paymentMethods[merchantId][i];
            if (method.active) {
                activeMethods[activeIndex] = PaymentMethodView({
                    methodType: method.methodType,
                    identifier: method.identifier,
                    active: method.active,
                    addedTimestamp: method.addedTimestamp
                });
                activeIndex++;
            }
        }
        
        return activeMethods;
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(ADMIN_ROLE) {}
}
