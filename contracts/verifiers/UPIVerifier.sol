// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../base/BaseVerifier.sol";
import "../interfaces/IPaymentVerifier.sol";
import "../interfaces/IRegionalRegistry.sol";
import "../interfaces/IMerchantRegistry.sol";

/**
 * @title UPIVerifier
 * @dev Verifies UPI payment method identifiers for Indian merchants
 * @notice This contract validates UPI IDs and VPAs (Virtual Payment Addresses)
 */
contract UPIVerifier is BaseVerifier {
    struct UPIDetails {
        string upiId;           // UPI ID (e.g., user@paytm)
        string vpa;             // Virtual Payment Address
        string bankName;        // Associated bank name
        bool isVerified;        // Verification status
        uint256 verifiedAt;     // Timestamp of verification
        address verifier;       // Address that verified this UPI
    }

    struct UPIVerificationRequest {
        address merchant;
        string upiId;
        string vpa;
        string bankName;
        uint256 requestTime;
        bool processed;
        bool approved;
    }

    // State variables
    mapping(address => UPIDetails) public merchantUPIDetails;
    mapping(string => address) public upiIdToMerchant; // UPI ID => merchant address
    mapping(string => address) public vpaToMerchant;   // VPA => merchant address
    mapping(string => bool) public supportedBanks;
    
    uint256 public constant MAX_UPI_LENGTH = 50;
    uint256 public constant MAX_VPA_LENGTH = 50;
    uint256 public constant MAX_BANK_NAME_LENGTH = 100;
    
    // UPI-specific constants
    string public constant VERIFIER_TYPE = "UPI";
    IRegionalRegistry.Region public constant SUPPORTED_REGION = IRegionalRegistry.Region.ASIA_PACIFIC;
    
    // Events
    event UPIVerificationRequested(
        uint256 indexed requestId,
        address indexed merchant,
        string upiId,
        string vpa,
        uint256 timestamp
    );
    
    event UPIVerified(
        address indexed merchant,
        string upiId,
        string vpa,
        string bankName,
        address indexed verifier,
        uint256 timestamp
    );
    
    event UPIRevoked(
        address indexed merchant,
        string upiId,
        address indexed revoker,
        uint256 timestamp
    );
    
    event VerifierAuthorized(address indexed verifier, bool authorized);
    event BankSupported(string bankName, bool supported);
    event RegionalRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    
    constructor(
        address _merchantRegistry,
        address _regionalRegistry
    ) BaseVerifier(VERIFIER_TYPE, _createSupportedRegionsArray(), msg.sender) {
        merchantRegistry = IMerchantRegistry(_merchantRegistry);
        regionalRegistry = IRegionalRegistry(_regionalRegistry);
        _initializeSupportedBanks();
    }

    /**
     * @dev Creates array of supported regions for this verifier
     */
    function _createSupportedRegionsArray() private pure returns (string[] memory) {
        string[] memory regions = new string[](1);
        regions[0] = "ASIA_PACIFIC";
        return regions;
    }
    
    /**
     * @dev Initialize supported banks for UPI verification
     */
    function _initializeSupportedBanks() private {
        supportedBanks["State Bank of India"] = true;
        supportedBanks["HDFC Bank"] = true;
        supportedBanks["ICICI Bank"] = true;
        supportedBanks["Axis Bank"] = true;
        supportedBanks["Kotak Mahindra Bank"] = true;
        supportedBanks["Punjab National Bank"] = true;
        supportedBanks["Bank of Baroda"] = true;
        supportedBanks["Canara Bank"] = true;
        supportedBanks["Union Bank of India"] = true;
        supportedBanks["Indian Bank"] = true;
        supportedBanks["Paytm Payments Bank"] = true;
        supportedBanks["PhonePe"] = true;
        supportedBanks["Google Pay"] = true;
        supportedBanks["Amazon Pay"] = true;
    }

    modifier validUPIFormat(string memory _upiId) {
        require(bytes(_upiId).length > 0 && bytes(_upiId).length <= MAX_UPI_LENGTH, "UPIVerifier: Invalid UPI ID length");
        require(_containsAtSymbol(_upiId), "UPIVerifier: UPI ID must contain @ symbol");
        _;
    }

    modifier validVPAFormat(string memory _vpa) {
        require(bytes(_vpa).length > 0 && bytes(_vpa).length <= MAX_VPA_LENGTH, "UPIVerifier: Invalid VPA length");
        _;
    }
    
    modifier onlySupportedRegion() {
        require(_isRegionSupported(SUPPORTED_REGION), "UPIVerifier: Region not supported");
        _;
    }

    // IPaymentVerifier implementation
    function verifyPaymentMethod(
        address merchant,
        bytes calldata data
    ) external onlyAuthorizedProcessor whenNotPaused returns (bool) {
        (string memory upiId, string memory vpa, string memory bankName) = abi.decode(data, (string, string, string));
        
        require(bytes(upiId).length > 0 && bytes(upiId).length <= MAX_UPI_LENGTH, "UPIVerifier: Invalid UPI ID length");
        require(_containsAtSymbol(upiId), "UPIVerifier: UPI ID must contain @ symbol");
        require(bytes(vpa).length > 0 && bytes(vpa).length <= MAX_VPA_LENGTH, "UPIVerifier: Invalid VPA length");
        require(bytes(bankName).length > 0 && bytes(bankName).length <= MAX_BANK_NAME_LENGTH, "UPIVerifier: Invalid bank name");
        require(supportedBanks[bankName], "UPIVerifier: Bank not supported");
        require(!merchantUPIDetails[merchant].isVerified, "UPIVerifier: UPI already verified for this merchant");
        require(upiIdToMerchant[upiId] == address(0), "UPIVerifier: UPI ID already registered");
        require(vpaToMerchant[vpa] == address(0), "UPIVerifier: VPA already registered");
        
        // Store UPI details
        merchantUPIDetails[merchant] = UPIDetails({
            upiId: upiId,
            vpa: vpa,
            bankName: bankName,
            isVerified: true,
            verifiedAt: block.timestamp,
            verifier: msg.sender
        });
        
        // Create mappings
        upiIdToMerchant[upiId] = merchant;
        vpaToMerchant[vpa] = merchant;
        
        emit UPIVerified(merchant, upiId, vpa, bankName, msg.sender, block.timestamp);
        
        return true;
    }
    
    function revokePaymentMethod(
        address merchant
    ) external onlyAuthorizedProcessor returns (bool) {
        require(merchant != address(0), "UPIVerifier: Invalid merchant address");
        require(merchantUPIDetails[merchant].isVerified, "UPIVerifier: Merchant UPI not verified");
        
        UPIDetails storage details = merchantUPIDetails[merchant];
        
        // Remove mappings
        delete upiIdToMerchant[details.upiId];
        delete vpaToMerchant[details.vpa];
        
        emit UPIRevoked(merchant, details.upiId, msg.sender, block.timestamp);
        
        // Clear merchant details
        delete merchantUPIDetails[merchant];
        
        return true;
    }
    
    function isPaymentMethodVerified(
        address merchant
    ) external view returns (bool) {
        return merchantUPIDetails[merchant].isVerified;
    }
    
    function getPaymentMethodData(
        address merchant
    ) external view returns (bytes memory) {
        UPIDetails memory details = merchantUPIDetails[merchant];
        return abi.encode(details.upiId, details.vpa, details.bankName, details.verifiedAt);
    }
    
    // getVerifierType() and getSupportedRegions() are inherited from BaseVerifier
    
    /**
     * @notice Request UPI verification for a merchant (legacy function)
     * @param _upiId The UPI ID to verify
     * @param _vpa The Virtual Payment Address
     * @param _bankName The associated bank name
     */
    function requestUPIVerification(
        string memory _upiId,
        string memory _vpa,
        string memory _bankName
    ) external validUPIFormat(_upiId) validVPAFormat(_vpa) whenNotPaused onlySupportedRegion returns (uint256) {
        bytes memory data = abi.encode(_upiId, _vpa, _bankName);
        
        bytes32 metadataHash = keccak256(data);
        uint256 requestId = this.requestVerification(msg.sender, _upiId, metadataHash);
        
        emit UPIVerificationRequested(requestId, msg.sender, _upiId, _vpa, block.timestamp);
        
        return requestId;
    }

    /**
     * @notice Verify a UPI verification request (legacy function)
     * @param _requestId The verification request ID
     * @param _approved Whether to approve or reject the request
     */
    function verifyUPIRequest(
        uint256 _requestId,
        bool _approved
    ) external onlyAuthorizedProcessor whenNotPaused {
        this.processVerification(_requestId, _approved, "");
        
        if (_approved) {
            // The verification is handled by the base contract
        }
    }

    /**
     * @notice Revoke UPI verification for a merchant (legacy function)
     * @param _merchant The merchant address
     */
    function revokeUPIVerification(address _merchant) external onlyAuthorizedProcessor {
        this.deactivatePaymentMethod(_merchant, merchantUPIDetails[_merchant].upiId);
    }

    /**
     * @notice Check if a UPI ID is verified
     * @param _upiId The UPI ID to check
     * @return isVerified Whether the UPI ID is verified
     * @return merchant The merchant address associated with the UPI ID
     */
    function isUPIVerified(string memory _upiId) external view returns (bool isVerified, address merchant) {
        merchant = upiIdToMerchant[_upiId];
        isVerified = merchant != address(0) && merchantUPIDetails[merchant].isVerified;
    }

    /**
     * @notice Check if a VPA is verified
     * @param _vpa The VPA to check
     * @return isVerified Whether the VPA is verified
     * @return merchant The merchant address associated with the VPA
     */
    function isVPAVerified(string memory _vpa) external view returns (bool isVerified, address merchant) {
        merchant = vpaToMerchant[_vpa];
        isVerified = merchant != address(0) && merchantUPIDetails[merchant].isVerified;
    }

    /**
     * @notice Get UPI details for a merchant
     * @param _merchant The merchant address
     * @return details The UPI details
     */
    function getMerchantUPIDetails(address _merchant) external view returns (UPIDetails memory details) {
        return merchantUPIDetails[_merchant];
    }

    // getVerificationRequest is inherited from BaseVerifier

    /**
     * @notice Get pending verification requests
     * @return requestIds Array of pending request IDs
     */
    function getPendingRequests() external pure returns (uint256[] memory requestIds) {
        // This function needs to be reimplemented using the base contract's storage
        requestIds = new uint256[](0);
    }

    // Admin functions
    
    /**
     * @notice Authorize/deauthorize a verifier
     * @param _verifier The verifier address
     * @param _authorized Whether to authorize or deauthorize
     */
    function authorizeVerifier(address _verifier, bool _authorized) external onlyOwner {
        require(_verifier != address(0), "Invalid verifier address");
        // This functionality is handled by the base contract's access control
        emit VerifierAuthorized(_verifier, _authorized);
    }

    /**
     * @notice Add/remove supported bank
     * @param _bankName The bank name
     * @param _supported Whether the bank is supported
     */
    function setSupportedBank(string memory _bankName, bool _supported) external onlyOwner {
        require(bytes(_bankName).length > 0, "Bank name required");
        supportedBanks[_bankName] = _supported;
        emit BankSupported(_bankName, _supported);
    }

    /**
     * @notice Update regional registry address
     * @param _newRegistry The new regional registry address
     */
    function updateRegionalRegistry(address _newRegistry) external onlyOwner {
        require(_newRegistry != address(0), "Invalid registry address");
        address oldRegistry = address(regionalRegistry);
        regionalRegistry = IRegionalRegistry(_newRegistry);
        emit RegionalRegistryUpdated(oldRegistry, _newRegistry);
    }

    // pause() and unpause() functions are inherited from BaseVerifier

    // Internal functions
    
    /**
     * @notice Check if UPI ID contains @ symbol
     * @param str The string to check
     * @return hasAt Whether the string contains @ symbol
     */
    function _containsAtSymbol(string memory str) internal pure returns (bool hasAt) {
        bytes memory strBytes = bytes(str);
        for (uint256 i = 0; i < strBytes.length; i++) {
            if (strBytes[i] == '@') {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Check if current region supports UPI (India)
     * @param region The region to check
     * @return supported Whether the region supports UPI
     */
    function _isRegionSupported(IRegionalRegistry.Region region) internal view returns (bool supported) {
        return regionalRegistry.isRegionSupported(region);
    }

    /**
     * @dev Check if the current region is Asia Pacific
     * @return isAsiaPacific Whether the current region is Asia Pacific
     */
    function _isAsiaPacificRegion() internal pure returns (bool isAsiaPacific) {
        return SUPPORTED_REGION == IRegionalRegistry.Region.ASIA_PACIFIC;
    }

    // View functions
    
    /**
     * @notice Check if a bank is supported
     * @param _bankName The bank name
     * @return supported Whether the bank is supported
     */
    function isBankSupported(string memory _bankName) external view returns (bool supported) {
        return supportedBanks[_bankName];
    }

    /**
     * @notice Check if an address is an authorized verifier
     * @param _verifier The verifier address
     * @return authorized Whether the address is authorized
     */
    function isAuthorizedVerifier(address _verifier) external view returns (bool authorized) {
        return _verifier == owner(); // Simplified access control
    }

    /**
     * @notice Get the total number of verification requests
     * @return count The total request count
     */
    function getRequestCount() external pure returns (uint256 count) {
        return 0; // This needs to be reimplemented using base contract storage
    }
}