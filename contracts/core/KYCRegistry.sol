// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IKYCCertificateNFT {
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
    ) external returns (uint256);
    
    function revokeCertificate(uint256 _tokenId, string memory _reason) external;
    function hasValidCertificate(address _merchant, uint8 _requiredLevel) external view returns (bool);
}

/**
 * @title KYCRegistry
 * @dev Registry for KYC providers and merchant verifications with DAO governance
 */
contract KYCRegistry is 
    Initializable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    UUPSUpgradeable 
{
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");
    bytes32 public constant KYC_DOER_ROLE = keccak256("KYC_DOER_ROLE");
    bytes32 public constant MERCHANT_ROLE = keccak256("MERCHANT_ROLE");

    struct KYCDoer {
        address doerAddress;
        string licenseNumber;
        string jurisdiction;
        string[] specializations;
        uint8 complianceLevel;
        uint8 maxKYCLevel;
        bool isApproved;
        bool isActive;
        uint256 approvedAt;
        uint256 totalVerifications;
        uint256 successfulVerifications;
        string metadataURI;
    }

    struct KYCVerification {
        string kycId;
        address merchantAddress;
        address kycDoerAddress;
        uint8 kycLevel;
        uint8 complianceScore;
        bool isApproved;
        uint256 verifiedAt;
        uint256 expiresAt;
        string documentHash;
        string metadataURI;
        bool isActive;
        uint256 certificateTokenId; // NFT token ID
        string businessName;
        string businessType;
        string jurisdiction;
    }

    struct DAOProposal {
        uint256 proposalId;
        address targetAddress;
        ProposalType proposalType;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 proposedAt;
        uint256 votingEndsAt;
        bool executed;
        mapping(address => bool) hasVoted;
        mapping(address => bool) vote; // true = for, false = against
    }

    enum ProposalType {
        APPROVE_KYC_DOER,
        REVOKE_KYC_DOER,
        UPDATE_COMPLIANCE_PARAMS,
        EMERGENCY_PAUSE
    }

    // State variables
    mapping(address => KYCDoer) public kycDoers;
    mapping(string => KYCVerification) public kycVerifications;
    mapping(address => string[]) public merchantVerifications;
    mapping(uint256 => DAOProposal) public daoProposals;
    
    address[] public approvedKYCDoers;
    address[] public daoMembers;
    string[] public allKYCIds;
    uint256 public proposalCounter;
    
    // KYC Certificate NFT contract
    IKYCCertificateNFT public kycCertificateNFT;
    
    // Governance parameters
    uint256 public votingPeriod;
    uint256 public proposalThreshold;
    uint256 public quorumPercentage;
    uint8 public maxKYCLevel;
    uint256 public verificationValidityPeriod;

    // Events
    event KYCDoerProposed(address indexed doerAddress, uint256 indexed proposalId);
    event KYCDoerApproved(address indexed doerAddress, uint256 approvedAt);
    event KYCDoerRevoked(address indexed doerAddress, uint256 revokedAt);
    event KYCVerificationSubmitted(string indexed kycId, address indexed merchant, address indexed kycDoer);
    event KYCVerificationApproved(string indexed kycId, address indexed merchant, uint8 kycLevel);
    event KYCVerificationRevoked(string indexed kycId, address indexed merchant, string reason);
    event ProposalCreated(uint256 indexed proposalId, ProposalType proposalType, address target);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support);
    event ProposalExecuted(uint256 indexed proposalId, bool success);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _daoAddress,
        uint256 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _quorumPercentage,
        address _kycCertificateNFT
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DAO_ROLE, _daoAddress);
        
        // Add initial DAO member
        daoMembers.push(_daoAddress);
        
        votingPeriod = _votingPeriod;
        proposalThreshold = _proposalThreshold;
        quorumPercentage = _quorumPercentage;
        maxKYCLevel = 3;
        verificationValidityPeriod = 365 days * 2; // 2 years default
        
        kycCertificateNFT = IKYCCertificateNFT(_kycCertificateNFT);
    }

    /**
     * @dev Submit proposal to approve a KYC Doer
     */
    function proposeKYCDoer(
        address _doerAddress,
        string memory _licenseNumber,
        string memory _jurisdiction,
        string[] memory _specializations,
        uint8 _complianceLevel,
        uint8 _maxKYCLevel,
        string memory _metadataURI,
        string memory _description
    ) external onlyRole(DAO_ROLE) returns (uint256) {
        require(_doerAddress != address(0), "Invalid doer address");
        require(_maxKYCLevel <= maxKYCLevel, "Exceeds max KYC level");
        require(!kycDoers[_doerAddress].isApproved, "Already approved");

        uint256 proposalId = proposalCounter++;
        DAOProposal storage proposal = daoProposals[proposalId];
        
        proposal.proposalId = proposalId;
        proposal.targetAddress = _doerAddress;
        proposal.proposalType = ProposalType.APPROVE_KYC_DOER;
        proposal.description = _description;
        proposal.proposedAt = block.timestamp;
        proposal.votingEndsAt = block.timestamp + votingPeriod;

        // Store KYC Doer data temporarily
        kycDoers[_doerAddress] = KYCDoer({
            doerAddress: _doerAddress,
            licenseNumber: _licenseNumber,
            jurisdiction: _jurisdiction,
            specializations: _specializations,
            complianceLevel: _complianceLevel,
            maxKYCLevel: _maxKYCLevel,
            isApproved: false,
            isActive: false,
            approvedAt: 0,
            totalVerifications: 0,
            successfulVerifications: 0,
            metadataURI: _metadataURI
        });

        emit KYCDoerProposed(_doerAddress, proposalId);
        emit ProposalCreated(proposalId, ProposalType.APPROVE_KYC_DOER, _doerAddress);

        return proposalId;
    }

    /**
     * @dev Vote on a DAO proposal
     */
    function vote(uint256 _proposalId, bool _support) external onlyRole(DAO_ROLE) {
        DAOProposal storage proposal = daoProposals[_proposalId];
        
        require(!proposal.executed, "Proposal already executed");
        require(block.timestamp <= proposal.votingEndsAt, "Voting period ended");
        require(!proposal.hasVoted[msg.sender], "Already voted");

        proposal.hasVoted[msg.sender] = true;
        proposal.vote[msg.sender] = _support;

        if (_support) {
            proposal.votesFor++;
        } else {
            proposal.votesAgainst++;
        }

        emit VoteCast(_proposalId, msg.sender, _support);
    }

    /**
     * @dev Execute a proposal after voting period
     */
    function executeProposal(uint256 _proposalId) external {
        DAOProposal storage proposal = daoProposals[_proposalId];
        
        require(!proposal.executed, "Proposal already executed");
        require(block.timestamp > proposal.votingEndsAt, "Voting period not ended");

        uint256 totalVotes = proposal.votesFor + proposal.votesAgainst;
        uint256 requiredQuorum = (daoMembers.length * quorumPercentage) / 100;
        
        require(totalVotes >= requiredQuorum, "Quorum not reached");

        proposal.executed = true;
        bool success = proposal.votesFor > proposal.votesAgainst;

        if (success && proposal.proposalType == ProposalType.APPROVE_KYC_DOER) {
            _approveKYCDoer(proposal.targetAddress);
        } else if (success && proposal.proposalType == ProposalType.REVOKE_KYC_DOER) {
            _revokeKYCDoer(proposal.targetAddress);
        }

        emit ProposalExecuted(_proposalId, success);
    }

    /**
     * @dev Internal function to approve KYC Doer
     */
    function _approveKYCDoer(address _doerAddress) internal {
        KYCDoer storage doer = kycDoers[_doerAddress];
        doer.isApproved = true;
        doer.isActive = true;
        doer.approvedAt = block.timestamp;

        approvedKYCDoers.push(_doerAddress);
        _grantRole(KYC_DOER_ROLE, _doerAddress);

        emit KYCDoerApproved(_doerAddress, block.timestamp);
    }

    /**
     * @dev Internal function to revoke KYC Doer
     */
    function _revokeKYCDoer(address _doerAddress) internal {
        KYCDoer storage doer = kycDoers[_doerAddress];
        doer.isApproved = false;
        doer.isActive = false;

        _revokeRole(KYC_DOER_ROLE, _doerAddress);

        // Remove from approved list
        for (uint i = 0; i < approvedKYCDoers.length; i++) {
            if (approvedKYCDoers[i] == _doerAddress) {
                approvedKYCDoers[i] = approvedKYCDoers[approvedKYCDoers.length - 1];
                approvedKYCDoers.pop();
                break;
            }
        }

        emit KYCDoerRevoked(_doerAddress, block.timestamp);
    }

    /**
     * @dev Submit KYC verification result
     */
    function submitKYCVerification(
        string memory _kycId,
        address _merchantAddress,
        uint8 _kycLevel,
        uint8 _complianceScore,
        string memory _documentHash,
        string memory _metadataURI,
        uint256 _expiresAt,
        string memory _businessName,
        string memory _businessType,
        string memory _jurisdiction
    ) external onlyRole(KYC_DOER_ROLE) whenNotPaused {
        require(bytes(_kycId).length > 0, "Invalid KYC ID");
        require(_merchantAddress != address(0), "Invalid merchant address");
        require(_kycLevel > 0 && _kycLevel <= maxKYCLevel, "Invalid KYC level");
        require(_complianceScore <= 100, "Invalid compliance score");
        require(_expiresAt > block.timestamp, "Invalid expiration time");
        require(kycDoers[msg.sender].isActive, "KYC Doer not active");
        require(bytes(kycVerifications[_kycId].kycId).length == 0, "KYC ID already exists");

        bool isApproved = _complianceScore >= 75; // Threshold for approval
        uint256 certificateTokenId = 0;

        // If approved, mint NFT certificate
        if (isApproved && address(kycCertificateNFT) != address(0)) {
            try kycCertificateNFT.issueCertificate(
                _merchantAddress,
                _kycId,
                _kycLevel,
                _complianceScore,
                _expiresAt,
                _businessName,
                _businessType,
                _jurisdiction,
                _metadataURI
            ) returns (uint256 tokenId) {
                certificateTokenId = tokenId;
            } catch {
                // NFT minting failed, but still record the verification
                // In production, you might want to handle this differently
            }
        }

        // Create verification record
        kycVerifications[_kycId] = KYCVerification({
            kycId: _kycId,
            merchantAddress: _merchantAddress,
            kycDoerAddress: msg.sender,
            kycLevel: _kycLevel,
            complianceScore: _complianceScore,
            isApproved: isApproved,
            verifiedAt: block.timestamp,
            expiresAt: _expiresAt,
            documentHash: _documentHash,
            metadataURI: _metadataURI,
            isActive: true,
            certificateTokenId: certificateTokenId,
            businessName: _businessName,
            businessType: _businessType,
            jurisdiction: _jurisdiction
        });

        // Update merchant verification list
        merchantVerifications[_merchantAddress].push(_kycId);
        allKYCIds.push(_kycId);

        // Update KYC Doer statistics
        KYCDoer storage doer = kycDoers[msg.sender];
        doer.totalVerifications++;
        if (isApproved) {
            doer.successfulVerifications++;
        }

        // Grant merchant role if approved
        if (isApproved) {
            _grantRole(MERCHANT_ROLE, _merchantAddress);
            emit KYCVerificationApproved(_kycId, _merchantAddress, _kycLevel);
        }

        emit KYCVerificationSubmitted(_kycId, _merchantAddress, msg.sender);
    }

    /**
     * @dev Revoke KYC verification
     */
    function revokeKYCVerification(
        string memory _kycId,
        string memory _reason
    ) external onlyRole(KYC_DOER_ROLE) {
        KYCVerification storage verification = kycVerifications[_kycId];
        require(bytes(verification.kycId).length > 0, "KYC verification not found");
        require(verification.kycDoerAddress == msg.sender, "Not authorized");
        require(verification.isActive, "Already revoked");

        verification.isActive = false;
        verification.isApproved = false;

        // Revoke merchant role
        _revokeRole(MERCHANT_ROLE, verification.merchantAddress);

        emit KYCVerificationRevoked(_kycId, verification.merchantAddress, _reason);
    }

    /**
     * @dev Check if merchant has valid KYC
     */
    function hasValidKYC(address _merchantAddress, uint8 _requiredLevel) external view returns (bool) {
        string[] memory verifications = merchantVerifications[_merchantAddress];
        
        for (uint i = 0; i < verifications.length; i++) {
            KYCVerification memory verification = kycVerifications[verifications[i]];
            
            if (verification.isActive && 
                verification.isApproved &&
                verification.kycLevel >= _requiredLevel &&
                verification.expiresAt > block.timestamp) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * @dev Get merchant's KYC level
     */
    function getMerchantKYCLevel(address _merchantAddress) external view returns (uint8) {
        string[] memory verifications = merchantVerifications[_merchantAddress];
        uint8 maxLevel = 0;
        
        for (uint i = 0; i < verifications.length; i++) {
            KYCVerification memory verification = kycVerifications[verifications[i]];
            
            if (verification.isActive && 
                verification.isApproved &&
                verification.expiresAt > block.timestamp &&
                verification.kycLevel > maxLevel) {
                maxLevel = verification.kycLevel;
            }
        }
        
        return maxLevel;
    }

    /**
     * @dev Get KYC Doer statistics
     */
    function getKYCDoerStats(address _doerAddress) external view returns (
        uint256 totalVerifications,
        uint256 successfulVerifications,
        uint256 successRate,
        bool isActive
    ) {
        KYCDoer memory doer = kycDoers[_doerAddress];
        uint256 rate = doer.totalVerifications > 0 ? 
            (doer.successfulVerifications * 100) / doer.totalVerifications : 0;
        
        return (
            doer.totalVerifications,
            doer.successfulVerifications,
            rate,
            doer.isActive
        );
    }

    /**
     * @dev Get all approved KYC Doers
     */
    function getApprovedKYCDoers() external view returns (address[] memory) {
        return approvedKYCDoers;
    }

    /**
     * @dev Get merchant verifications
     */
    function getMerchantVerifications(address _merchantAddress) external view returns (string[] memory) {
        return merchantVerifications[_merchantAddress];
    }

    /**
     * @dev Add DAO member (Admin only)
     */
    function addDAOMember(address _member) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_member != address(0), "Invalid member address");
        require(!hasRole(DAO_ROLE, _member), "Already a DAO member");
        
        _grantRole(DAO_ROLE, _member);
        daoMembers.push(_member);
    }

    /**
     * @dev Remove DAO member (Admin only)
     */
    function removeDAOMember(address _member) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(hasRole(DAO_ROLE, _member), "Not a DAO member");
        
        _revokeRole(DAO_ROLE, _member);
        
        // Remove from members array
        for (uint i = 0; i < daoMembers.length; i++) {
            if (daoMembers[i] == _member) {
                daoMembers[i] = daoMembers[daoMembers.length - 1];
                daoMembers.pop();
                break;
            }
        }
    }

    /**
     * @dev Get DAO members count
     */
    function getDAOMembersCount() external view returns (uint256) {
        return daoMembers.length;
    }

    /**
     * @dev Get all DAO members
     */
    function getDAOMembers() external view returns (address[] memory) {
        return daoMembers;
    }

    /**
     * @dev Update governance parameters (DAO only)
     */
    function updateGovernanceParams(
        uint256 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _quorumPercentage
    ) external onlyRole(DAO_ROLE) {
        votingPeriod = _votingPeriod;
        proposalThreshold = _proposalThreshold;
        quorumPercentage = _quorumPercentage;
    }

    /**
     * @dev Emergency pause (DAO only)
     */
    function pause() external onlyRole(DAO_ROLE) {
        _pause();
    }

    /**
     * @dev Unpause (DAO only)
     */
    function unpause() external onlyRole(DAO_ROLE) {
        _unpause();
    }

    /**
     * @dev Authorize upgrade (Admin only)
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /**
     * @dev Check if address is approved KYC Doer
     */
    function isApprovedKYCDoer(address _doerAddress) external view returns (bool) {
        return kycDoers[_doerAddress].isApproved && kycDoers[_doerAddress].isActive;
    }

    /**
     * @dev Get proposal details
     */
    function getProposal(uint256 _proposalId) external view returns (
        address targetAddress,
        ProposalType proposalType,
        string memory description,
        uint256 votesFor,
        uint256 votesAgainst,
        uint256 proposedAt,
        uint256 votingEndsAt,
        bool executed
    ) {
        DAOProposal storage proposal = daoProposals[_proposalId];
        return (
            proposal.targetAddress,
            proposal.proposalType,
            proposal.description,
            proposal.votesFor,
            proposal.votesAgainst,
            proposal.proposedAt,
            proposal.votingEndsAt,
            proposal.executed
        );
    }

    /**
     * @dev Set KYC Certificate NFT contract address
     * @param _kycCertificateNFT Address of the NFT certificate contract
     */
    function setKYCCertificateNFT(address _kycCertificateNFT) external onlyRole(DAO_ROLE) {
        require(_kycCertificateNFT != address(0), "Invalid NFT contract address");
        kycCertificateNFT = IKYCCertificateNFT(_kycCertificateNFT);
    }

    /**
     * @dev Get KYC Certificate NFT contract address
     */
    function getKYCCertificateNFT() external view returns (address) {
        return address(kycCertificateNFT);
    }
}