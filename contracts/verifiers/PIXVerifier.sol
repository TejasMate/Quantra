// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../base/BaseVerifier.sol";
import "../interfaces/IPaymentVerifier.sol";
import "../interfaces/IRegionalRegistry.sol";
import "../interfaces/IMerchantRegistry.sol";

/**
 * @title PIXVerifier
 * @dev Verifies PIX payment method identifiers for Brazilian merchants
 * PIX is Brazil's instant payment system that supports various key types:
 * - CPF (Individual taxpayer ID)
 * - CNPJ (Corporate taxpayer ID) 
 * - Email
 * - Phone number
 * - Random key (UUID)
 */
contract PIXVerifier is BaseVerifier {
    // Constants
    string public constant VERIFIER_TYPE = "PIX";
    IRegionalRegistry.Region public constant SUPPORTED_REGION = IRegionalRegistry.Region.LATIN_AMERICA;
    
    // PIX key types
    enum PIXKeyType {
        CPF,        // Individual taxpayer ID (11 digits)
        CNPJ,       // Corporate taxpayer ID (14 digits)
        EMAIL,      // Email address
        PHONE,      // Phone number (+55 format)
        RANDOM      // Random UUID key
    }
    
    struct PIXDetails {
        string pixKey;           // The PIX key (CPF, CNPJ, email, phone, or random)
        PIXKeyType keyType;      // Type of PIX key
        string bankCode;         // Brazilian bank code (3 digits)
        string accountHolder;    // Account holder name
        bool isVerified;         // Verification status
        uint256 verifiedAt;      // Timestamp of verification
        address verifier;        // Address of verifier
    }
    
    // VerificationRequest struct is inherited from IPaymentVerifier interface
    
    // State variables
    mapping(address => PIXDetails) public merchantPIXDetails;
    mapping(string => address) public pixKeyToMerchant;
    mapping(string => bool) public supportedBanks; // bankCode => supported
    
    uint256 public verificationFee = 0.001 ether; // Fee for verification
    
    // Events
    event PIXVerificationRequested(uint256 indexed requestId, address indexed merchant, string pixKey, PIXKeyType keyType);
    event PIXVerified(address indexed merchant, string pixKey, PIXKeyType keyType);
    event PIXRevoked(address indexed merchant, string pixKey);
    event SupportedBankUpdated(string bankCode, bool supported);
    event VerificationFeeUpdated(uint256 newFee);
    
    constructor(
        address _merchantRegistry,
        address _regionalRegistry
    ) BaseVerifier(VERIFIER_TYPE, _createSupportedRegionsArray(), msg.sender) {
        merchantRegistry = IMerchantRegistry(_merchantRegistry);
        regionalRegistry = IRegionalRegistry(_regionalRegistry);
        _initializeSupportedBanks();
    }
    
    function _createSupportedRegionsArray() private pure returns (string[] memory) {
        string[] memory regions = new string[](1);
        regions[0] = "LATIN_AMERICA";
        return regions;
    }
    
    function _initializeSupportedBanks() private {
        // Initialize supported banks
        supportedBanks["001"] = true; // Banco do Brasil
        supportedBanks["033"] = true; // Santander
        supportedBanks["104"] = true; // Caixa Econômica Federal
        supportedBanks["237"] = true; // Bradesco
        supportedBanks["341"] = true; // Itaú
        supportedBanks["356"] = true; // Banco Real (now Santander)
        supportedBanks["399"] = true; // HSBC (now Bradesco)
        supportedBanks["422"] = true; // Banco Safra
        supportedBanks["745"] = true; // Banco Citibank
        supportedBanks["756"] = true; // Banco Cooperativo do Brasil (Bancoob)
    }
    
    // Modifiers
    modifier validPIXKey(string memory _pixKey, PIXKeyType _keyType) {
        require(bytes(_pixKey).length > 0, "PIXVerifier: PIX key cannot be empty");
        
        if (_keyType == PIXKeyType.CPF) {
            require(_isValidCPF(_pixKey), "PIXVerifier: Invalid CPF format");
        } else if (_keyType == PIXKeyType.CNPJ) {
            require(_isValidCNPJ(_pixKey), "PIXVerifier: Invalid CNPJ format");
        } else if (_keyType == PIXKeyType.EMAIL) {
            require(_isValidEmail(_pixKey), "PIXVerifier: Invalid email format");
        } else if (_keyType == PIXKeyType.PHONE) {
            require(_isValidBrazilianPhone(_pixKey), "PIXVerifier: Invalid Brazilian phone format");
        } else if (_keyType == PIXKeyType.RANDOM) {
            require(_isValidUUID(_pixKey), "PIXVerifier: Invalid UUID format for random key");
        }
        _;
    }
    
    modifier onlySupportedRegion() {
        require(_isRegionSupported(msg.sender), "PIXVerifier: Region not supported");
        _;
    }
    
    // IPaymentVerifier interface implementation
    function verifyPaymentMethod(
        address merchant,
        string memory paymentData,
        bytes memory additionalData
    ) external onlyOwner onlySupportedRegion {
        (string memory pixKey, PIXKeyType keyType, string memory bankCode) = abi.decode(additionalData, (string, PIXKeyType, string));
        
        require(supportedBanks[bankCode], "PIXVerifier: Bank not supported");
        require(pixKeyToMerchant[pixKey] == address(0), "PIXVerifier: PIX key already registered");
        
        PIXDetails memory details = PIXDetails({
            pixKey: pixKey,
            keyType: keyType,
            bankCode: bankCode,
            accountHolder: "",
            isVerified: true,
            verifiedAt: block.timestamp,
            verifier: msg.sender
        });
        
        merchantPIXDetails[merchant] = details;
        pixKeyToMerchant[pixKey] = merchant;
        
        emit PIXVerified(merchant, pixKey, keyType);
    }
    
    function revokePaymentMethod(
        address merchant,
        string memory paymentData
    ) external onlyOwner {
        PIXDetails storage details = merchantPIXDetails[merchant];
        require(details.isVerified, "PIXVerifier: PIX not verified");
        
        string memory pixKey = details.pixKey;
        delete pixKeyToMerchant[pixKey];
        delete merchantPIXDetails[merchant];
        
        emit PIXRevoked(merchant, pixKey);
    }
    
    function isPaymentMethodVerified(
        address merchant,
        string memory paymentData
    ) external view override returns (bool) {
        return merchantPIXDetails[merchant].isVerified;
    }
    
    function getPaymentMethodData(
        address merchant
    ) external view returns (string memory) {
        PIXDetails memory details = merchantPIXDetails[merchant];
        return details.pixKey;
    }
    
    // getVerifierType() and getSupportedRegions() are inherited from BaseVerifier
    
    
    
    /**
     * @dev Request PIX verification for a merchant (Legacy function)
     * @param _merchantId The merchant ID (converted to address)
     * @param _pixKey The PIX key to verify
     * @param _keyType The type of PIX key
     * @param _bankCode The bank code
     * @param _accountHolder The account holder name
     */
    function requestPIXVerification(
        uint256 _merchantId,
        string memory _pixKey,
        PIXKeyType _keyType,
        string memory _bankCode,
        string memory _accountHolder
    ) external payable whenNotPaused validPIXKey(_pixKey, _keyType) nonReentrant returns (uint256) {
        require(msg.value >= verificationFee, "PIXVerifier: Insufficient verification fee");
        require(supportedBanks[_bankCode], "PIXVerifier: Bank not supported");
        require(bytes(_accountHolder).length > 0, "PIXVerifier: Account holder name required");
        
        address merchant = merchantRegistry.getMerchantAddress(_merchantId);
        require(merchant != address(0), "PIXVerifier: Invalid merchant ID");
        require(!merchantPIXDetails[merchant].isVerified, "PIXVerifier: PIX already verified for this merchant");
        
        bytes32 metadataHash = keccak256(abi.encode(_keyType, _bankCode, _accountHolder));
        uint256 requestId = this.requestVerification(merchant, _pixKey, metadataHash);
        
        emit PIXVerificationRequested(requestId, merchant, _pixKey, _keyType);
        return requestId;
    }
    
    /**
     * @dev Verify PIX for a merchant (Legacy function)
     * @param _requestId The verification request ID
     */
    function verifyPIX(uint256 _requestId) external onlyOwner whenNotPaused {
        VerificationRequest memory request = this.getVerificationRequest(_requestId);
        require(request.processed && request.approved, "PIXVerifier: Request not approved");
        this.activatePaymentMethod(request.merchant, request.identifier);
    }
    
    /**
     * @dev Revoke PIX verification (Legacy function)
     */
    function revokePIXVerification(address merchant) external onlyOwner {
        string memory pixKey = merchantPIXDetails[merchant].pixKey;
        this.deactivatePaymentMethod(merchant, pixKey);
    }
    
    /**
     * @dev Check if PIX is verified for a merchant
     * @param merchant The merchant address
     * @return bool True if PIX is verified
     */
    function isPIXVerified(address merchant) external view returns (bool) {
        return merchantPIXDetails[merchant].isVerified;
    }
    
    /**
     * @dev Get PIX details for a merchant
     * @param merchant The merchant address
     * @return PIXDetails The PIX details
     */
    function getPIXDetails(address merchant) external view returns (PIXDetails memory) {
        return merchantPIXDetails[merchant];
    }
    
    /**
     * @dev Get merchant address by PIX key
     * @param _pixKey The PIX key
     * @return address The merchant address
     */
    function getMerchantByPIXKey(string memory _pixKey) external view returns (address) {
        return pixKeyToMerchant[_pixKey];
    }
    
    // Admin functions
    function setSupportedBank(string memory _bankCode, bool _supported) external onlyOwner {
        supportedBanks[_bankCode] = _supported;
        emit SupportedBankUpdated(_bankCode, _supported);
    }
    
    function updateVerificationFee(uint256 _newFee) external onlyOwner {
        verificationFee = _newFee;
        emit VerificationFeeUpdated(_newFee);
    }
    
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "PIXVerifier: No fees to withdraw");
        payable(msg.sender).transfer(balance);
    }
    
    // Helper functions
    function _isRegionSupported(address merchant) internal view returns (bool) {
        IRegionalRegistry.Region merchantRegion = regionalRegistry.getMerchantRegion(merchant);
        return merchantRegion == SUPPORTED_REGION;
    }
    
    // Internal validation functions
    function _isValidCPF(string memory _cpf) internal pure returns (bool) {
        bytes memory cpfBytes = bytes(_cpf);
        return cpfBytes.length == 11 && _isNumeric(_cpf);
    }
    
    function _isValidCNPJ(string memory _cnpj) internal pure returns (bool) {
        bytes memory cnpjBytes = bytes(_cnpj);
        return cnpjBytes.length == 14 && _isNumeric(_cnpj);
    }
    
    function _isValidEmail(string memory _email) internal pure returns (bool) {
        bytes memory emailBytes = bytes(_email);
        if (emailBytes.length < 5) return false; // Minimum: a@b.c
        
        bool hasAt = false;
        bool hasDot = false;
        uint256 atPosition = 0;
        
        for (uint256 i = 0; i < emailBytes.length; i++) {
            if (emailBytes[i] == 0x40) { // '@' character
                if (hasAt) return false; // Multiple @ symbols
                hasAt = true;
                atPosition = i;
            } else if (emailBytes[i] == 0x2E && hasAt && i > atPosition + 1) { // '.' after @
                hasDot = true;
            }
        }
        
        return hasAt && hasDot && atPosition > 0 && atPosition < emailBytes.length - 3;
    }
    
    function _isValidBrazilianPhone(string memory _phone) internal pure returns (bool) {
        bytes memory phoneBytes = bytes(_phone);
        // Brazilian phone: +5511999999999 (13-14 digits with +55 prefix)
        if (phoneBytes.length < 13 || phoneBytes.length > 14) return false;
        
        // Check +55 prefix
        if (phoneBytes[0] != 0x2B || phoneBytes[1] != 0x35 || phoneBytes[2] != 0x35) return false;
        
        // Check remaining digits are numeric
        for (uint256 i = 3; i < phoneBytes.length; i++) {
            if (phoneBytes[i] < 0x30 || phoneBytes[i] > 0x39) return false;
        }
        
        return true;
    }
    
    function _isValidUUID(string memory _uuid) internal pure returns (bool) {
        bytes memory uuidBytes = bytes(_uuid);
        // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 characters)
        if (uuidBytes.length != 36) return false;
        
        // Check hyphens at positions 8, 13, 18, 23
        if (uuidBytes[8] != 0x2D || uuidBytes[13] != 0x2D || 
            uuidBytes[18] != 0x2D || uuidBytes[23] != 0x2D) return false;
        
        // Check hex characters
        for (uint256 i = 0; i < uuidBytes.length; i++) {
            if (i == 8 || i == 13 || i == 18 || i == 23) continue; // Skip hyphens
            
            bytes1 char = uuidBytes[i];
            if (!((char >= 0x30 && char <= 0x39) || // 0-9
                  (char >= 0x41 && char <= 0x46) || // A-F
                  (char >= 0x61 && char <= 0x66))) { // a-f
                return false;
            }
        }
        
        return true;
    }
    
    function _isNumeric(string memory _str) internal pure returns (bool) {
        bytes memory strBytes = bytes(_str);
        for (uint256 i = 0; i < strBytes.length; i++) {
            if (strBytes[i] < 0x30 || strBytes[i] > 0x39) return false;
        }
        return true;
    }
}