// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title KYCCertificateNFT
 * @dev NFT contract for issuing KYC verification certificates to merchants
 */
contract KYCCertificateNFT is 
    Initializable,
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    ERC721URIStorageUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant KYC_ISSUER_ROLE = keccak256("KYC_ISSUER_ROLE");
    bytes32 public constant CERTIFICATE_MANAGER_ROLE = keccak256("CERTIFICATE_MANAGER_ROLE");
    bytes32 public constant KYC_REGISTRY_ROLE = keccak256("KYC_REGISTRY_ROLE");

    uint256 private _tokenIdCounter;
    
    // Default KYC validation period (in seconds) - 1 year
    uint256 public kycValidationPeriod;

    struct KYCCertificate {
        string kycId;
        address merchant;
        address issuer;
        uint8 kycLevel;
        uint8 complianceScore;
        uint256 issuedAt;
        uint256 expiresAt;
        bool isValid;
        string businessName;
        string businessType;
        string jurisdiction;
        string metadataURI;
    }

    // Mapping from token ID to KYC certificate details
    mapping(uint256 => KYCCertificate) public certificates;
    
    // Mapping from merchant address to their certificate token IDs
    mapping(address => uint256[]) public merchantCertificates;
    
    // Mapping from KYC ID to token ID
    mapping(string => uint256) public kycIdToTokenId;
    
    // Mapping from merchant to their current valid certificate token ID
    mapping(address => uint256) public merchantCurrentCertificate;

    // Events
    event CertificateIssued(
        uint256 indexed tokenId,
        string indexed kycId,
        address indexed merchant,
        uint8 kycLevel,
        uint256 expiresAt
    );
    
    event CertificateRevoked(
        uint256 indexed tokenId,
        string indexed kycId,
        address indexed merchant,
        string reason
    );
    
    event CertificateExpired(
        uint256 indexed tokenId,
        string indexed kycId,
        address indexed merchant
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory _name,
        string memory _symbol,
        address _kycRegistry
    ) public initializer {
        __ERC721_init(_name, _symbol);
        __ERC721Enumerable_init();
        __ERC721URIStorage_init();
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        // Set default KYC validation period to 1 year
        kycValidationPeriod = 365 days;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(KYC_ISSUER_ROLE, _kycRegistry);
        _grantRole(KYC_REGISTRY_ROLE, _kycRegistry);
        _grantRole(CERTIFICATE_MANAGER_ROLE, msg.sender);
    }

    /**
     * @dev Issue a KYC certificate NFT to a merchant with default validation period
     */
    function issueCertificate(
        address _merchant,
        string memory _kycId,
        uint8 _kycLevel,
        uint8 _complianceScore,
        string memory _businessName,
        string memory _businessType,
        string memory _jurisdiction,
        string memory _metadataURI
    ) external onlyRole(KYC_REGISTRY_ROLE) whenNotPaused returns (uint256) {
        uint256 expiresAt = block.timestamp + kycValidationPeriod;
        return _issueCertificate(
            _merchant,
            _kycId,
            _kycLevel,
            _complianceScore,
            expiresAt,
            _businessName,
            _businessType,
            _jurisdiction,
            _metadataURI
        );
    }

    /**
     * @dev Issue a KYC certificate NFT to a merchant with custom expiration
     */
    function issueCertificate(
        address _merchant,
        string memory _kycId,
        uint8 _kycLevel,
        uint8 _complianceScore,
        uint256 _expiresAt,
        string memory _businessName,
        string memory _businessType,
        string memory _jurisdiction,
        string memory _metadataURI
    ) external onlyRole(KYC_ISSUER_ROLE) whenNotPaused returns (uint256) {
        return _issueCertificate(
            _merchant,
            _kycId,
            _kycLevel,
            _complianceScore,
            _expiresAt,
            _businessName,
            _businessType,
            _jurisdiction,
            _metadataURI
        );
    }

    /**
     * @dev Internal function to issue certificate
     */
    function _issueCertificate(
        address _merchant,
        string memory _kycId,
        uint8 _kycLevel,
        uint8 _complianceScore,
        uint256 _expiresAt,
        string memory _businessName,
        string memory _businessType,
        string memory _jurisdiction,
        string memory _metadataURI
    ) internal returns (uint256) {
        require(_merchant != address(0), "Invalid merchant address");
        require(bytes(_kycId).length > 0, "Invalid KYC ID");
        require(_kycLevel > 0 && _kycLevel <= 3, "Invalid KYC level");
        require(_complianceScore > 0 && _complianceScore <= 100, "Invalid compliance score");
        require(_expiresAt > block.timestamp, "Invalid expiration time");
        require(kycIdToTokenId[_kycId] == 0, "KYC ID already exists");

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        // Create certificate
        certificates[tokenId] = KYCCertificate({
            kycId: _kycId,
            merchant: _merchant,
            issuer: msg.sender,
            kycLevel: _kycLevel,
            complianceScore: _complianceScore,
            issuedAt: block.timestamp,
            expiresAt: _expiresAt,
            isValid: true,
            businessName: _businessName,
            businessType: _businessType,
            jurisdiction: _jurisdiction,
            metadataURI: _metadataURI
        });

        // Update mappings
        kycIdToTokenId[_kycId] = tokenId;
        merchantCertificates[_merchant].push(tokenId);
        
        // Revoke previous certificate if exists
        if (merchantCurrentCertificate[_merchant] != 0) {
            _revokePreviousCertificate(_merchant);
        }
        
        merchantCurrentCertificate[_merchant] = tokenId;

        // Mint NFT to merchant
        _safeMint(_merchant, tokenId);
        _setTokenURI(tokenId, _metadataURI);

        emit CertificateIssued(tokenId, _kycId, _merchant, _kycLevel, _expiresAt);

        return tokenId;
    }

    /**
     * @dev Revoke a KYC certificate
     */
    function revokeCertificate(
        uint256 _tokenId,
        string memory _reason
    ) external onlyRole(CERTIFICATE_MANAGER_ROLE) {
        require(_ownerOf(_tokenId) != address(0), "Certificate does not exist");
        require(certificates[_tokenId].isValid, "Certificate already revoked");

        KYCCertificate storage cert = certificates[_tokenId];
        cert.isValid = false;

        // Clear current certificate if this is the current one
        if (merchantCurrentCertificate[cert.merchant] == _tokenId) {
            merchantCurrentCertificate[cert.merchant] = 0;
        }

        emit CertificateRevoked(_tokenId, cert.kycId, cert.merchant, _reason);
    }

    /**
     * @dev Check if a merchant has a valid KYC certificate
     */
    function hasValidCertificate(address _merchant, uint8 _requiredLevel) 
        external 
        view 
        returns (bool) 
    {
        uint256 currentTokenId = merchantCurrentCertificate[_merchant];
        if (currentTokenId == 0) {
            return false;
        }

        KYCCertificate memory cert = certificates[currentTokenId];
        return cert.isValid && 
               cert.expiresAt > block.timestamp && 
               cert.kycLevel >= _requiredLevel;
    }

    /**
     * @dev Get merchant's current KYC level
     */
    function getMerchantKYCLevel(address _merchant) external view returns (uint8) {
        uint256 currentTokenId = merchantCurrentCertificate[_merchant];
        if (currentTokenId == 0) {
            return 0;
        }

        KYCCertificate memory cert = certificates[currentTokenId];
        if (!cert.isValid || cert.expiresAt <= block.timestamp) {
            return 0;
        }

        return cert.kycLevel;
    }

    /**
     * @dev Get certificate details by token ID
     */
    function getCertificate(uint256 _tokenId) 
        external 
        view 
        returns (KYCCertificate memory) 
    {
        require(_ownerOf(_tokenId) != address(0), "Certificate does not exist");
        return certificates[_tokenId];
    }

    /**
     * @dev Get certificate by KYC ID
     */
    function getCertificateByKYCId(string memory _kycId) 
        external 
        view 
        returns (KYCCertificate memory) 
    {
        uint256 tokenId = kycIdToTokenId[_kycId];
        require(tokenId != 0, "Certificate not found");
        return certificates[tokenId];
    }

    /**
     * @dev Get all certificate token IDs for a merchant
     */
    function getMerchantCertificates(address _merchant) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return merchantCertificates[_merchant];
    }

    /**
     * @dev Get merchant's current valid certificate
     */
    function getCurrentCertificate(address _merchant) 
        external 
        view 
        returns (KYCCertificate memory) 
    {
        uint256 currentTokenId = merchantCurrentCertificate[_merchant];
        require(currentTokenId != 0, "No current certificate");
        return certificates[currentTokenId];
    }

    /**
     * @dev Check and mark expired certificates
     */
    function checkExpiredCertificates(uint256[] memory _tokenIds) 
        external 
        onlyRole(CERTIFICATE_MANAGER_ROLE) 
    {
        for (uint i = 0; i < _tokenIds.length; i++) {
            uint256 tokenId = _tokenIds[i];
            if (_ownerOf(tokenId) != address(0)) {
                KYCCertificate storage cert = certificates[tokenId];
                if (cert.isValid && cert.expiresAt <= block.timestamp) {
                    cert.isValid = false;
                    
                    // Clear current certificate if this is the current one
                    if (merchantCurrentCertificate[cert.merchant] == tokenId) {
                        merchantCurrentCertificate[cert.merchant] = 0;
                    }
                    
                    emit CertificateExpired(tokenId, cert.kycId, cert.merchant);
                }
            }
        }
    }

    /**
     * @dev Generate metadata for a certificate
     */
    function generateMetadata(uint256 _tokenId) 
        external 
        view 
        returns (string memory) 
    {
        require(_ownerOf(_tokenId) != address(0), "Certificate does not exist");
        
        KYCCertificate memory cert = certificates[_tokenId];
        
        // This would typically return JSON metadata
        // For simplicity, returning a basic string representation
        return string(abi.encodePacked(
            "KYC Certificate - Level ", 
            _uint2str(cert.kycLevel),
            " - ", 
            cert.businessName,
            " - Valid until: ",
            _uint2str(cert.expiresAt)
        ));
    }

    /**
     * @dev Check if a certificate is currently valid
     */
    function isCertificateValid(uint256 _tokenId) 
        external 
        view 
        returns (bool) 
    {
        require(_ownerOf(_tokenId) != address(0), "Certificate does not exist");
        
        KYCCertificate memory cert = certificates[_tokenId];
        return cert.isValid && cert.expiresAt > block.timestamp;
    }

    /**
     * @dev Internal function to revoke previous certificate
     */
    function _revokePreviousCertificate(address _merchant) internal {
        uint256 previousTokenId = merchantCurrentCertificate[_merchant];
        if (previousTokenId != 0 && _ownerOf(previousTokenId) != address(0)) {
            KYCCertificate storage prevCert = certificates[previousTokenId];
            if (prevCert.isValid) {
                prevCert.isValid = false;
                emit CertificateRevoked(
                    previousTokenId, 
                    prevCert.kycId, 
                    _merchant, 
                    "Superseded by new certificate"
                );
            }
        }
    }

    /**
     * @dev Prevent transfers (soulbound NFT)
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override(ERC721Upgradeable, ERC721EnumerableUpgradeable) returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0)) but prevent transfers
        require(from == address(0), "KYC Certificates are non-transferable");
        
        return super._update(to, tokenId, auth);
    }

    /**
     * @dev Utility function to convert uint to string
     */
    function _uint2str(uint256 _i) internal pure returns (string memory str) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        j = _i;
        while (j != 0) {
            bstr[--k] = bytes1(uint8(48 + j % 10));
            j /= 10;
        }
        str = string(bstr);
    }

    /**
     * @dev Grant KYC issuer role to an address
     */
    function grantKYCIssuerRole(address _issuer) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _grantRole(KYC_ISSUER_ROLE, _issuer);
    }

    /**
     * @dev Revoke KYC issuer role from an address
     */
    function revokeKYCIssuerRole(address _issuer) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _revokeRole(KYC_ISSUER_ROLE, _issuer);
    }

    /**
     * @dev Pause the contract
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause the contract
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @dev Set KYC validation period
     */
    function setKYCValidationPeriod(uint256 _period) external onlyRole(DEFAULT_ADMIN_ROLE) {
        kycValidationPeriod = _period;
    }

    /**
     * @dev Override required for upgradeable contracts
     */
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {}

    /**
     * @dev Override for URI storage
     */
    function tokenURI(uint256 tokenId) 
        public 
        view 
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable) 
        returns (string memory) 
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @dev See {IERC165-supportsInterface}
     */
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable, ERC721URIStorageUpgradeable, AccessControlUpgradeable) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Required override for _increaseBalance
     */
    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
    {
        super._increaseBalance(account, value);
    }
}