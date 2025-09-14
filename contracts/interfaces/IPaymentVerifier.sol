// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPaymentVerifier
 * @dev Standard interface for all payment method verifiers (UPI, PIX, SEPA, etc.)
 * @notice Provides a unified contract for verifying and managing payment methods
 */
interface IPaymentVerifier {
    // Structs
    struct PaymentMethod {
        string methodType;          // "UPI", "PIX", "SEPA", etc.
        string identifier;          // Payment ID (UPI ID, PIX key, IBAN, etc.)
        string geoRegion;           // Geographic region code
        bytes32 metadataHash;       // Additional verification data
        bool verified;
        address merchant;
        uint256 addedAt;
        uint256 verifiedAt;
        bool active;
    }
    
    struct VerificationRequest {
        uint256 requestId;
        address merchant;
        string identifier;
        bytes32 metadataHash;
        uint256 timestamp;
        bool processed;
        bool approved;
        string rejectionReason;
    }
    
    // Events
    event PaymentMethodRequested(uint256 indexed requestId, address indexed merchant, string identifier);
    event PaymentMethodVerified(uint256 indexed requestId, address indexed merchant, string identifier, bool approved);
    event PaymentMethodActivated(address indexed merchant, string identifier);
    event PaymentMethodDeactivated(address indexed merchant, string identifier);
    event VerifierConfigUpdated(string parameter, bytes32 value);
    
    // Core verification functions
    function requestVerification(
        address merchant,
        string calldata identifier,
        bytes32 metadataHash
    ) external returns (uint256 requestId);
    
    function processVerification(
        uint256 requestId,
        bool approved,
        string calldata rejectionReason
    ) external;
    
    function activatePaymentMethod(address merchant, string calldata identifier) external;
    function deactivatePaymentMethod(address merchant, string calldata identifier) external;
    
    // Batch operations
    function batchProcessVerifications(
        uint256[] calldata requestIds,
        bool[] calldata approvals,
        string[] calldata rejectionReasons
    ) external;
    
    // View functions
    function getPaymentMethod(address merchant, string calldata identifier) 
        external view returns (PaymentMethod memory);
    
    function getVerificationRequest(uint256 requestId) 
        external view returns (VerificationRequest memory);
    
    function getMerchantPaymentMethods(address merchant) 
        external view returns (PaymentMethod[] memory);
    
    function isPaymentMethodVerified(address merchant, string calldata identifier) 
        external view returns (bool);
    
    function isPaymentMethodActive(address merchant, string calldata identifier) 
        external view returns (bool);
    
    function getVerifierType() external pure returns (string memory);
    function getSupportedRegions() external view returns (string[] memory);
    
    // Admin functions
    function setMerchantRegistry(address registry) external;
    function updateVerifierConfig(string calldata parameter, bytes32 value) external;
    function pause() external;
    function unpause() external;
}