// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../base/BaseVerifier.sol";
import "../interfaces/IPaymentVerifier.sol";
import "../interfaces/IRegionalRegistry.sol";
import "../interfaces/IMerchantRegistry.sol";

/**
 * @title SEPAVerifier
 * @dev Verifies SEPA (Single Euro Payments Area) payment method identifiers for European merchants
 * SEPA supports IBAN (International Bank Account Number) format for 36 European countries
 */
contract SEPAVerifier is BaseVerifier {
    // Constants
    string public constant VERIFIER_TYPE = "SEPA";
    IRegionalRegistry.Region public constant SUPPORTED_REGION = IRegionalRegistry.Region.EUROPE;
    
    struct SEPADetails {
        string iban;             // International Bank Account Number
        string bic;              // Bank Identifier Code (SWIFT)
        string accountHolder;    // Account holder name
        string countryCode;      // ISO 3166-1 alpha-2 country code
        string bankName;         // Bank name
        bool isVerified;         // Verification status
        uint256 verifiedAt;      // Timestamp of verification
        address verifier;        // Address of verifier
    }
    
    // State variables
    mapping(address => SEPADetails) public merchantSEPADetails; // merchant address => SEPADetails
    mapping(string => bool) public supportedCountries; // countryCode => supported
    mapping(string => uint256) public countryIBANLength; // countryCode => IBAN length
    mapping(string => address) public ibanToMerchant; // IBAN => merchant address
    
    uint256 public verificationFee = 0.002 ether; // Fee for verification (higher due to complexity)
    
    // Events
    event SEPAVerificationRequested(uint256 indexed requestId, address indexed merchant, string iban, string countryCode);
    event SEPAVerified(address indexed merchant, string iban, string countryCode, address verifier);
    event SEPARevoked(address indexed merchant, string iban, address revoker);
    event CountrySupported(string countryCode, bool supported, uint256 ibanLength);
    event VerificationFeeUpdated(uint256 oldFee, uint256 newFee);
    
    constructor(
        address _merchantRegistry,
        address _regionalRegistry
    ) BaseVerifier(VERIFIER_TYPE, _createSupportedRegionsArray(), msg.sender) {
        merchantRegistry = IMerchantRegistry(_merchantRegistry);
        regionalRegistry = IRegionalRegistry(_regionalRegistry);
        _initializeSupportedCountries();
    }
    
    function _createSupportedRegionsArray() private pure returns (string[] memory) {
        string[] memory regions = new string[](1);
        regions[0] = "EUROPE";
        return regions;
    }
    
    function _initializeSupportedCountries() private {
        // Add major SEPA countries with their IBAN lengths
        _addSEPACountry("DE", 22); // Germany
        _addSEPACountry("FR", 27); // France
        _addSEPACountry("IT", 27); // Italy
        _addSEPACountry("ES", 24); // Spain
        _addSEPACountry("NL", 18); // Netherlands
        _addSEPACountry("BE", 16); // Belgium
        _addSEPACountry("AT", 20); // Austria
        _addSEPACountry("PT", 25); // Portugal
        _addSEPACountry("IE", 22); // Ireland
        _addSEPACountry("FI", 18); // Finland
        _addSEPACountry("LU", 20); // Luxembourg
        _addSEPACountry("GR", 27); // Greece
        _addSEPACountry("CY", 28); // Cyprus
        _addSEPACountry("MT", 31); // Malta
        _addSEPACountry("SK", 24); // Slovakia
        _addSEPACountry("SI", 19); // Slovenia
        _addSEPACountry("EE", 20); // Estonia
        _addSEPACountry("LV", 21); // Latvia
        _addSEPACountry("LT", 20); // Lithuania
        _addSEPACountry("PL", 28); // Poland
        _addSEPACountry("CZ", 24); // Czech Republic
        _addSEPACountry("HU", 28); // Hungary
        _addSEPACountry("RO", 24); // Romania
        _addSEPACountry("BG", 22); // Bulgaria
        _addSEPACountry("HR", 21); // Croatia
        _addSEPACountry("DK", 18); // Denmark
        _addSEPACountry("SE", 24); // Sweden
        _addSEPACountry("NO", 15); // Norway
        _addSEPACountry("IS", 26); // Iceland
        _addSEPACountry("LI", 21); // Liechtenstein
        _addSEPACountry("CH", 21); // Switzerland
        _addSEPACountry("MC", 27); // Monaco
        _addSEPACountry("SM", 27); // San Marino
        _addSEPACountry("VA", 22); // Vatican City
        _addSEPACountry("AD", 24); // Andorra
        _addSEPACountry("GB", 22); // United Kingdom (still in SEPA for some purposes)
    }
    
    modifier validIBAN(string memory _iban, string memory _countryCode) {
        require(bytes(_iban).length > 0, "SEPAVerifier: IBAN cannot be empty");
        require(supportedCountries[_countryCode], "SEPAVerifier: Country not supported");
        require(_isValidIBANFormat(_iban, _countryCode), "SEPAVerifier: Invalid IBAN format");
        _;
    }
    
    modifier onlySupportedRegion() {
        require(_isRegionSupported(SUPPORTED_REGION), "SEPAVerifier: Region not supported");
        _;
    }
    
    // IPaymentVerifier implementation
    function verifyPaymentMethod(
        address merchant,
        bytes calldata data
    ) external onlyAuthorizedProcessor whenNotPaused returns (bool) {
        (string memory iban, string memory bic, string memory accountHolder, string memory countryCode, string memory bankName) = 
            abi.decode(data, (string, string, string, string, string));
        
        require(bytes(iban).length > 0, "SEPAVerifier: IBAN cannot be empty");
        require(supportedCountries[countryCode], "SEPAVerifier: Country not supported");
        require(_isValidIBANFormat(iban, countryCode), "SEPAVerifier: Invalid IBAN format");
        require(bytes(bic).length >= 8 && bytes(bic).length <= 11, "SEPAVerifier: Invalid BIC length");
        require(bytes(accountHolder).length > 0, "SEPAVerifier: Account holder name required");
        require(bytes(bankName).length > 0, "SEPAVerifier: Bank name required");
        require(!merchantSEPADetails[merchant].isVerified, "SEPAVerifier: SEPA already verified for this merchant");
        require(ibanToMerchant[iban] == address(0), "SEPAVerifier: IBAN already registered");
        
        // Store SEPA details
        merchantSEPADetails[merchant] = SEPADetails({
            iban: iban,
            bic: bic,
            accountHolder: accountHolder,
            countryCode: countryCode,
            bankName: bankName,
            isVerified: true,
            verifiedAt: block.timestamp,
            verifier: msg.sender
        });
        
        // Create mapping
        ibanToMerchant[iban] = merchant;
        
        emit SEPAVerified(merchant, iban, countryCode, msg.sender);
        
        return true;
    }
    
    function revokePaymentMethod(
        address merchant
    ) external onlyAuthorizedProcessor returns (bool) {
        require(merchant != address(0), "SEPAVerifier: Invalid merchant address");
        require(merchantSEPADetails[merchant].isVerified, "SEPAVerifier: SEPA not verified");
        
        SEPADetails storage details = merchantSEPADetails[merchant];
        
        // Remove mapping
        delete ibanToMerchant[details.iban];
        
        emit SEPARevoked(merchant, details.iban, msg.sender);
        
        // Clear merchant details
        delete merchantSEPADetails[merchant];
        
        return true;
    }
    
    function isPaymentMethodVerified(
        address merchant
    ) external view returns (bool) {
        return merchantSEPADetails[merchant].isVerified;
    }
    
    function getPaymentMethodData(
        address merchant
    ) external view returns (bytes memory) {
        SEPADetails memory details = merchantSEPADetails[merchant];
        return abi.encode(details.iban, details.bic, details.accountHolder, details.countryCode, details.bankName, details.verifiedAt);
    }
    
    // getVerifierType() and getSupportedRegions() are inherited from BaseVerifier
    
    /**
     * @dev Request SEPA verification for a merchant (Legacy function)
     * @param _merchantId The merchant ID
     * @param _iban The IBAN to verify
     * @param _bic The BIC code
     * @param _accountHolder The account holder name
     * @param _countryCode The country code
     * @param _bankName The bank name
     */
    function requestSEPAVerification(
        uint256 _merchantId,
        string memory _iban,
        string memory _bic,
        string memory _accountHolder,
        string memory _countryCode,
        string memory _bankName
    ) external payable whenNotPaused validIBAN(_iban, _countryCode) nonReentrant returns (uint256) {
        require(msg.value >= verificationFee, "Insufficient verification fee");
        require(bytes(_bic).length >= 8 && bytes(_bic).length <= 11, "Invalid BIC length");
        require(bytes(_accountHolder).length > 0, "Account holder name required");
        require(bytes(_bankName).length > 0, "Bank name required");
        
        // Create verification request using base contract
        bytes memory data = abi.encode(_iban, _bic, _accountHolder, _countryCode, _bankName);
        bytes32 metadataHash = keccak256(data);
        uint256 requestId = this.requestVerification(msg.sender, _iban, metadataHash);
        
        emit SEPAVerificationRequested(requestId, msg.sender, _iban, _countryCode);
        return requestId;
    }
    
    /**
     * @dev Verify SEPA details for a merchant (Legacy function)
     */
    function verifySEPA(uint256 _requestId) external onlyAuthorizedProcessor whenNotPaused {
        VerificationRequest memory request = this.getVerificationRequest(_requestId);
        require(request.processed && request.approved, "SEPAVerifier: Request not approved");
        this.activatePaymentMethod(request.merchant, request.identifier);
    }
    
    /**
     * @dev Revoke SEPA verification (Legacy function)
     */
    function revokeSEPAVerification(address merchant) external onlyAuthorizedProcessor {
        this.deactivatePaymentMethod(merchant, merchantSEPADetails[merchant].iban);
    }
    
    /**
     * @dev Check if merchant has verified SEPA
     */
    function isSEPAVerified(address merchant) external view returns (bool) {
        return merchantSEPADetails[merchant].isVerified;
    }
    
    /**
     * @dev Get SEPA details for a merchant
     */
    function getSEPADetails(address merchant) external view returns (SEPADetails memory) {
        return merchantSEPADetails[merchant];
    }
    
    /**
     * @dev Get merchant address by IBAN
     */
    function getMerchantByIBAN(string memory iban) external view returns (address) {
        return ibanToMerchant[iban];
    }
    
    /**
     * @dev Validate IBAN checksum using mod-97 algorithm
     */
    function validateIBANChecksum(string memory _iban) external pure returns (bool) {
        return _validateIBANChecksum(_iban);
    }
    
    // Admin functions
    function authorizeVerifier(address _verifier, bool _authorized) external onlyOwner {
        // This functionality is handled by the base contract's access control
    }
    
    function setSupportedCountry(string memory _countryCode, bool _supported, uint256 _ibanLength) external onlyOwner {
        supportedCountries[_countryCode] = _supported;
        if (_supported) {
            countryIBANLength[_countryCode] = _ibanLength;
        } else {
            delete countryIBANLength[_countryCode];
        }
        emit CountrySupported(_countryCode, _supported, _ibanLength);
    }
    
    function updateVerificationFee(uint256 _newFee) external onlyOwner {
        uint256 oldFee = verificationFee;
        verificationFee = _newFee;
        emit VerificationFeeUpdated(oldFee, _newFee);
    }
    
    function updateRegionalRegistry(address _regionalRegistry) external onlyOwner {
        require(_regionalRegistry != address(0), "Invalid registry address");
        regionalRegistry = IRegionalRegistry(_regionalRegistry);
    }
    
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        payable(owner()).transfer(balance);
    }
    
    // pause() is inherited from BaseVerifier
    
    // unpause() is inherited from BaseVerifier
    
    // Internal functions
    function _addSEPACountry(string memory _countryCode, uint256 _ibanLength) internal {
        supportedCountries[_countryCode] = true;
        countryIBANLength[_countryCode] = _ibanLength;
    }
    
    function _isRegionSupported(IRegionalRegistry.Region region) internal view returns (bool) {
        return regionalRegistry.isRegionSupported(region);
    }
    
    function _isValidIBANFormat(string memory _iban, string memory _countryCode) internal view returns (bool) {
        bytes memory ibanBytes = bytes(_iban);
        uint256 expectedLength = countryIBANLength[_countryCode];
        
        // Check length
        if (ibanBytes.length != expectedLength) return false;
        
        // Check country code at start
        bytes memory countryBytes = bytes(_countryCode);
        if (ibanBytes[0] != countryBytes[0] || ibanBytes[1] != countryBytes[1]) return false;
        
        // Check that characters 2-3 are digits (check digits)
        if (ibanBytes[2] < 0x30 || ibanBytes[2] > 0x39 || 
            ibanBytes[3] < 0x30 || ibanBytes[3] > 0x39) return false;
        
        // Check remaining characters are alphanumeric
        for (uint256 i = 4; i < ibanBytes.length; i++) {
            bytes1 char = ibanBytes[i];
            if (!((char >= 0x30 && char <= 0x39) || // 0-9
                  (char >= 0x41 && char <= 0x5A))) { // A-Z
                return false;
            }
        }
        
        // Validate checksum
        return _validateIBANChecksum(_iban);
    }
    
    function _validateIBANChecksum(string memory _iban) internal pure returns (bool) {
        bytes memory ibanBytes = bytes(_iban);
        if (ibanBytes.length < 4) return false;
        
        // Move first 4 characters to end
        bytes memory rearranged = new bytes(ibanBytes.length);
        for (uint256 i = 0; i < ibanBytes.length - 4; i++) {
            rearranged[i] = ibanBytes[i + 4];
        }
        for (uint256 i = 0; i < 4; i++) {
            rearranged[ibanBytes.length - 4 + i] = ibanBytes[i];
        }
        
        // Convert letters to numbers (A=10, B=11, ..., Z=35)
        uint256 numericValue = 0;
        for (uint256 i = 0; i < rearranged.length; i++) {
            bytes1 char = rearranged[i];
            if (char >= 0x30 && char <= 0x39) { // 0-9
                numericValue = (numericValue * 10 + uint8(char) - 48) % 97;
            } else if (char >= 0x41 && char <= 0x5A) { // A-Z
                uint256 letterValue = uint8(char) - 55; // A=10, B=11, etc.
                numericValue = (numericValue * 100 + letterValue) % 97;
            } else {
                return false; // Invalid character
            }
        }
        
        return numericValue == 1;
    }
}