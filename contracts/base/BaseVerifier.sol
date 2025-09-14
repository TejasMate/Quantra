// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IPaymentVerifier.sol";
import "../interfaces/IMerchantOperations.sol";
import "../interfaces/IRegionalRegistry.sol";
import "../interfaces/IMerchantRegistry.sol";

/**
 * @title BaseVerifier
 * @dev Base contract for all payment method verifiers
 * @notice Provides common functionality and reduces code duplication
 */
abstract contract BaseVerifier is IPaymentVerifier, Ownable, ReentrancyGuard, Pausable {
    // State variables
    IMerchantRegistry public merchantRegistry;
    IRegionalRegistry public regionalRegistry;
    
    mapping(address => mapping(string => PaymentMethod)) public paymentMethods;
    mapping(address => string[]) public merchantIdentifiers;
    mapping(uint256 => VerificationRequest) public verificationRequests;
    mapping(address => uint256[]) public merchantRequests;
    
    uint256 public nextRequestId = 1;
    string public verifierType;
    string[] public supportedRegions;
    
    // Configuration
    mapping(string => bytes32) public verifierConfig;
    mapping(address => bool) public authorizedProcessors;
    
    // Modifiers
    modifier onlyMerchantRegistry() {
        require(msg.sender == address(merchantRegistry), "BaseVerifier: Only merchant registry");
        _;
    }
    
    modifier onlyAuthorizedProcessor() {
        require(authorizedProcessors[msg.sender] || msg.sender == owner(), "BaseVerifier: Not authorized processor");
        _;
    }
    
    modifier validMerchant(address merchant) {
        require(merchantRegistry.isMerchantRegistered(merchant), "BaseVerifier: Merchant not registered");
        _;
    }
    
    modifier validIdentifier(string calldata identifier) {
        require(bytes(identifier).length > 0, "BaseVerifier: Empty identifier");
        _;
    }
    
    /**
     * @dev Constructor
     * @param _verifierType The type of verifier (UPI, PIX, SEPA, etc.)
     * @param _supportedRegions Array of supported region codes
     * @param _initialOwner The initial owner of the contract
     */
    constructor(
        string memory _verifierType,
        string[] memory _supportedRegions,
        address _initialOwner
    ) Ownable(_initialOwner) {
        verifierType = _verifierType;
        supportedRegions = _supportedRegions;
    }
    
    /**
     * @dev Initialize the verifier with registry contracts
     */
    function initialize(
        address _merchantRegistry,
        address _regionalRegistry
    ) external onlyOwner {
        require(_merchantRegistry != address(0), "BaseVerifier: Invalid merchant registry");
        require(_regionalRegistry != address(0), "BaseVerifier: Invalid regional registry");
        
        merchantRegistry = IMerchantRegistry(_merchantRegistry);
        regionalRegistry = IRegionalRegistry(_regionalRegistry);
    }
    
    // Implementation of IPaymentVerifier interface
    function requestVerification(
        address merchant,
        string calldata identifier,
        bytes32 metadataHash
    ) external override nonReentrant whenNotPaused validMerchant(merchant) validIdentifier(identifier) returns (uint256 requestId) {
        // Check if payment method already exists
        require(!paymentMethods[merchant][identifier].verified, "BaseVerifier: Already verified");
        
        // Validate region support
        _validateRegionSupport(merchant);
        
        requestId = nextRequestId++;
        
        verificationRequests[requestId] = VerificationRequest({
            requestId: requestId,
            merchant: merchant,
            identifier: identifier,
            metadataHash: metadataHash,
            timestamp: block.timestamp,
            processed: false,
            approved: false,
            rejectionReason: ""
        });
        
        merchantRequests[merchant].push(requestId);
        
        emit PaymentMethodRequested(requestId, merchant, identifier);
        
        return requestId;
    }
    
    function processVerification(
        uint256 requestId,
        bool approved,
        string calldata rejectionReason
    ) external override onlyAuthorizedProcessor whenNotPaused {
        _processVerification(requestId, approved, rejectionReason);
    }
    
    function _processVerification(
        uint256 requestId,
        bool approved,
        string memory rejectionReason
    ) internal {
        VerificationRequest storage request = verificationRequests[requestId];
        require(!request.processed, "BaseVerifier: Already processed");
        require(request.requestId != 0, "BaseVerifier: Invalid request");
        
        request.processed = true;
        request.approved = approved;
        request.rejectionReason = rejectionReason;
        
        if (approved) {
            _createPaymentMethod(request.merchant, request.identifier, request.metadataHash);
        }
        
        emit PaymentMethodVerified(requestId, request.merchant, request.identifier, approved);
    }
    
    function activatePaymentMethod(
        address merchant,
        string calldata identifier
    ) external override onlyAuthorizedProcessor whenNotPaused {
        PaymentMethod storage method = paymentMethods[merchant][identifier];
        require(method.verified, "BaseVerifier: Not verified");
        require(!method.active, "BaseVerifier: Already active");
        
        method.active = true;
        emit PaymentMethodActivated(merchant, identifier);
    }
    
    function deactivatePaymentMethod(
        address merchant,
        string calldata identifier
    ) external override onlyAuthorizedProcessor whenNotPaused {
        PaymentMethod storage method = paymentMethods[merchant][identifier];
        require(method.verified, "BaseVerifier: Not verified");
        require(method.active, "BaseVerifier: Already inactive");
        
        method.active = false;
        emit PaymentMethodDeactivated(merchant, identifier);
    }
    
    function batchProcessVerifications(
        uint256[] calldata requestIds,
        bool[] calldata approvals,
        string[] calldata rejectionReasons
    ) external override onlyAuthorizedProcessor whenNotPaused {
        require(
            requestIds.length == approvals.length && 
            approvals.length == rejectionReasons.length,
            "BaseVerifier: Array length mismatch"
        );
        
        for (uint256 i = 0; i < requestIds.length; i++) {
            _processVerification(requestIds[i], approvals[i], rejectionReasons[i]);
        }
    }
    
    // View functions
    function getPaymentMethod(
        address merchant,
        string calldata identifier
    ) external view override returns (PaymentMethod memory) {
        return paymentMethods[merchant][identifier];
    }
    
    function getVerificationRequest(
        uint256 requestId
    ) external view override returns (VerificationRequest memory) {
        return verificationRequests[requestId];
    }
    
    function getMerchantPaymentMethods(
        address merchant
    ) external view override returns (PaymentMethod[] memory) {
        string[] memory identifiers = merchantIdentifiers[merchant];
        PaymentMethod[] memory methods = new PaymentMethod[](identifiers.length);
        
        for (uint256 i = 0; i < identifiers.length; i++) {
            methods[i] = paymentMethods[merchant][identifiers[i]];
        }
        
        return methods;
    }
    
    function isPaymentMethodVerified(
        address merchant,
        string calldata identifier
    ) external view virtual override returns (bool) {
        return paymentMethods[merchant][identifier].verified;
    }
    
    function isPaymentMethodActive(
        address merchant,
        string calldata identifier
    ) external view override returns (bool) {
        return paymentMethods[merchant][identifier].active;
    }
    
    function getVerifierType() external pure override returns (string memory) {
        return "BaseVerifier";
    }
    
    function getSupportedRegions() external view override returns (string[] memory) {
        return supportedRegions;
    }
    
    // Admin functions
    function setMerchantRegistry(address registry) external override onlyOwner {
        require(registry != address(0), "BaseVerifier: Invalid registry");
        merchantRegistry = IMerchantRegistry(registry);
    }
    
    function updateVerifierConfig(
        string calldata parameter,
        bytes32 value
    ) external override onlyOwner {
        verifierConfig[parameter] = value;
        emit VerifierConfigUpdated(parameter, value);
    }
    
    function authorizeProcessor(address processor, bool authorized) external onlyOwner {
        authorizedProcessors[processor] = authorized;
    }
    
    function pause() external override onlyOwner {
        _pause();
    }
    
    function unpause() external override onlyOwner {
        _unpause();
    }
    
    // Internal functions
    function _createPaymentMethod(
        address merchant,
        string memory identifier,
        bytes32 metadataHash
    ) internal {
        PaymentMethod storage method = paymentMethods[merchant][identifier];
        
        if (method.merchant == address(0)) {
            // New payment method
            merchantIdentifiers[merchant].push(identifier);
        }
        
        method.methodType = verifierType;
        method.identifier = identifier;
        method.geoRegion = _getMerchantRegion(merchant);
        method.metadataHash = metadataHash;
        method.verified = true;
        method.merchant = merchant;
        method.addedAt = block.timestamp;
        method.verifiedAt = block.timestamp;
        method.active = false; // Requires separate activation
    }
    
    function _validateRegionSupport(address merchant) internal view {
        string memory merchantRegion = _getMerchantRegion(merchant);
        bool supported = false;
        
        for (uint256 i = 0; i < supportedRegions.length; i++) {
            if (keccak256(bytes(supportedRegions[i])) == keccak256(bytes(merchantRegion))) {
                supported = true;
                break;
            }
        }
        
        require(supported, "BaseVerifier: Region not supported");
    }
    
    function _getMerchantRegion(address merchant) internal view returns (string memory) {
        // Get merchant profile and convert region enum to string
        (
            ,,,,,,,, // Skip first 8 fields
            IRegionalRegistry.Region region,
            ,,, // Skip last 3 fields
        ) = merchantRegistry.getMerchantByOwner(merchant);
        return _regionToString(region);
    }
    
    function _regionToString(IRegionalRegistry.Region region) internal pure returns (string memory) {
        if (region == IRegionalRegistry.Region.GLOBAL) return "GLOBAL";
        if (region == IRegionalRegistry.Region.NORTH_AMERICA) return "NORTH_AMERICA";
        if (region == IRegionalRegistry.Region.EUROPE) return "EUROPE";
        if (region == IRegionalRegistry.Region.ASIA_PACIFIC) return "ASIA_PACIFIC";
        if (region == IRegionalRegistry.Region.LATIN_AMERICA) return "LATIN_AMERICA";
        if (region == IRegionalRegistry.Region.MIDDLE_EAST_AFRICA) return "MIDDLE_EAST_AFRICA";
        return "CUSTOM";
    }
    
    // Virtual functions for specific verifier implementations
    function _validateSpecificRequirements(
        address /* merchant */,
        string calldata /* identifier */,
        bytes32 /* metadataHash */
    ) internal virtual returns (bool) {
        // Override in specific verifier contracts
        return true;
    }
}