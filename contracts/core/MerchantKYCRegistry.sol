// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IMerchantOperations.sol";

/**
 * @title MerchantKYCRegistry
 * @dev Handles KYC verification and NFT minting for merchants
 * Split from MerchantRegistry to focus on identity verification
 */
contract MerchantKYCRegistry is 
    ERC721Upgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    // KYC Data Structure
    struct KYCData {
        string documentHash; // IPFS hash of KYC documents
        uint256 verificationTime;
        bool isVerified;
        string merchantName;
        string businessType;
        address verifier;
        uint256 merchantId;
    }
    
    // State variables
    mapping(uint256 => KYCData) public kycData;
    mapping(address => uint256) public merchantToKYCTokenId;
    mapping(address => bool) public authorizedVerifiers;
    
    uint256 private _kycTokenIdCounter;
    address public dao;
    address public merchantCoreRegistry;
    
    // Events
    event KYCVerified(uint256 indexed merchantId, uint256 indexed kycTokenId, bool approved, address verifier);
    event VerifierAuthorized(address indexed verifier, bool authorized);
    event KYCDocumentUpdated(uint256 indexed kycTokenId, string newDocumentHash);
    event DAOUpdated(address indexed oldDAO, address indexed newDAO);
    event MerchantCoreRegistryUpdated(address indexed newRegistry);
    
    // Modifiers
    modifier onlyAuthorizedVerifier() {
        require(authorizedVerifiers[msg.sender], "MerchantKYCRegistry: Not authorized verifier");
        _;
    }
    
    modifier onlyDAO() {
        require(msg.sender == dao, "MerchantKYCRegistry: Only DAO can call this function");
        _;
    }
    
    modifier onlyMerchantCoreRegistry() {
        require(msg.sender == merchantCoreRegistry, "MerchantKYCRegistry: Only core registry can call");
        _;
    }
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    function initialize(
        address _owner,
        address _dao,
        address _merchantCoreRegistry
    ) external initializer {
        __ERC721_init("Merchant KYC NFT", "MKYC");
        __Ownable_init(msg.sender);
        __Pausable_init();
        __ReentrancyGuard_init();
        
        dao = _dao;
        merchantCoreRegistry = _merchantCoreRegistry;
        _kycTokenIdCounter = 1;
        
        // Owner is automatically an authorized verifier
        authorizedVerifiers[_owner] = true;
        
        // Transfer ownership to the specified owner
        _transferOwnership(_owner);
    }
    
    /**
     * @dev Mint KYC NFT for a merchant (called by MerchantCoreRegistry)
     */
    function mintKYCNFT(
        address merchantOwner,
        uint256 merchantId,
        string memory merchantName,
        string memory businessType,
        bytes32 kycHash
    ) external onlyMerchantCoreRegistry returns (uint256) {
        require(merchantOwner != address(0), "MerchantKYCRegistry: Invalid merchant owner");
        require(bytes(merchantName).length > 0, "MerchantKYCRegistry: Merchant name required");
        require(kycHash != bytes32(0), "MerchantKYCRegistry: KYC hash required");
        
        uint256 kycTokenId = _kycTokenIdCounter++;
        
        // Mint KYC NFT
        _mint(merchantOwner, kycTokenId);
        
        // Store KYC data
        kycData[kycTokenId] = KYCData({
            documentHash: bytes32ToString(kycHash),
            verificationTime: 0, // Not verified yet
            isVerified: false,
            merchantName: merchantName,
            businessType: businessType,
            verifier: address(0),
            merchantId: merchantId
        });
        
        merchantToKYCTokenId[merchantOwner] = kycTokenId;
        
        return kycTokenId;
    }
    
    /**
     * @dev Verify KYC for a merchant
     */
    function verifyKYC(
        uint256 kycTokenId,
        bool approved,
        string memory businessType
    ) external onlyAuthorizedVerifier whenNotPaused {
        require(_ownerOf(kycTokenId) != address(0), "MerchantKYCRegistry: KYC token does not exist");
        require(!kycData[kycTokenId].isVerified, "MerchantKYCRegistry: KYC already verified");
        
        kycData[kycTokenId].isVerified = approved;
        kycData[kycTokenId].verificationTime = block.timestamp;
        kycData[kycTokenId].verifier = msg.sender;
        
        if (bytes(businessType).length > 0) {
            kycData[kycTokenId].businessType = businessType;
        }
        
        emit KYCVerified(kycData[kycTokenId].merchantId, kycTokenId, approved, msg.sender);
    }
    
    /**
     * @dev Update KYC document hash
     */
    function updateKYCDocument(
        uint256 kycTokenId,
        string memory newDocumentHash
    ) external whenNotPaused {
        require(_ownerOf(kycTokenId) != address(0), "MerchantKYCRegistry: KYC token does not exist");
        require(ownerOf(kycTokenId) == msg.sender, "MerchantKYCRegistry: Not token owner");
        require(bytes(newDocumentHash).length > 0, "MerchantKYCRegistry: Document hash required");
        
        kycData[kycTokenId].documentHash = newDocumentHash;
        // Reset verification status when document is updated
        kycData[kycTokenId].isVerified = false;
        kycData[kycTokenId].verificationTime = 0;
        kycData[kycTokenId].verifier = address(0);
        
        emit KYCDocumentUpdated(kycTokenId, newDocumentHash);
    }
    
    /**
     * @dev Get KYC data for a token
     */
    function getKYCData(uint256 kycTokenId) external view returns (KYCData memory) {
        require(_ownerOf(kycTokenId) != address(0), "MerchantKYCRegistry: KYC token does not exist");
        return kycData[kycTokenId];
    }
    
    /**
     * @dev Get KYC token ID by merchant owner
     */
    function getKYCTokenByOwner(address merchantOwner) external view returns (uint256) {
        return merchantToKYCTokenId[merchantOwner];
    }
    
    /**
     * @dev Check if merchant KYC is verified
     */
    function isKYCVerified(uint256 kycTokenId) external view returns (bool) {
        if (_ownerOf(kycTokenId) == address(0)) {
            return false;
        }
        return kycData[kycTokenId].isVerified;
    }
    
    /**
     * @dev Check if merchant KYC is verified by owner address
     */
    function isKYCVerifiedByOwner(address merchantOwner) external view returns (bool) {
        uint256 kycTokenId = merchantToKYCTokenId[merchantOwner];
        if (kycTokenId == 0 || _ownerOf(kycTokenId) == address(0)) {
            return false;
        }
        return kycData[kycTokenId].isVerified;
    }
    
    /**
     * @dev Get merchant ID from KYC token
     */
    function getMerchantIdFromKYC(uint256 kycTokenId) external view returns (uint256) {
        require(_ownerOf(kycTokenId) != address(0), "MerchantKYCRegistry: KYC token does not exist");
        return kycData[kycTokenId].merchantId;
    }
    
    /**
     * @dev Authorize verifier
     */
    function authorizeVerifier(address verifier, bool authorized) external onlyOwner {
        authorizedVerifiers[verifier] = authorized;
        emit VerifierAuthorized(verifier, authorized);
    }
    
    /**
     * @dev Update DAO address
     */
    function updateDAO(address newDAO) external onlyOwner {
        require(newDAO != address(0), "MerchantKYCRegistry: Invalid DAO address");
        address oldDAO = dao;
        dao = newDAO;
        emit DAOUpdated(oldDAO, newDAO);
    }
    
    /**
     * @dev Update merchant core registry address
     */
    function updateMerchantCoreRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "MerchantKYCRegistry: Invalid registry address");
        merchantCoreRegistry = newRegistry;
        emit MerchantCoreRegistryUpdated(newRegistry);
    }
    
    /**
     * @dev Helper function to convert bytes32 to string
     */
    function bytes32ToString(bytes32 _bytes32) internal pure returns (string memory) {
        uint8 i = 0;
        while(i < 32 && _bytes32[i] != 0) {
            i++;
        }
        bytes memory bytesArray = new bytes(i);
        for (i = 0; i < 32 && _bytes32[i] != 0; i++) {
            bytesArray[i] = _bytes32[i];
        }
        return string(bytesArray);
    }
    
    /**
     * @dev Pause contract (only owner)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract (only owner)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Get total number of KYC tokens minted
     */
    function getTotalKYCTokens() external view returns (uint256) {
        return _kycTokenIdCounter - 1;
    }
    
    /**
     * @dev Override _update to add pause functionality
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override whenNotPaused returns (address) {
        return super._update(to, tokenId, auth);
    }
}