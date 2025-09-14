// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IPaymentVerifier.sol";
import "./IRegionalRegistry.sol";

/**
 * @title IVerifierFactory
 * @dev Interface for managing and deploying payment verifier contracts
 * @notice Provides dynamic verifier management and registration capabilities
 */
interface IVerifierFactory {
    // Structs
    struct VerifierInfo {
        address verifierAddress;
        string verifierType;        // "UPI", "PIX", "SEPA", etc.
        IRegionalRegistry.Region[] supportedRegions;
        bool active;
        address deployer;
        uint256 deployedAt;
        uint256 version;
        string metadata;            // IPFS hash or JSON metadata
    }
    
    struct VerifierTemplate {
        string verifierType;
        bytes bytecode;
        string[] constructorParams;
        IRegionalRegistry.Region[] defaultRegions;
        bool approved;
        address submitter;
        uint256 submittedAt;
    }
    
    // Events
    event VerifierDeployed(address indexed verifier, string verifierType, address indexed deployer);
    event VerifierRegistered(address indexed verifier, string verifierType, IRegionalRegistry.Region[] regions);
    event VerifierActivated(address indexed verifier);
    event VerifierDeactivated(address indexed verifier);
    event VerifierTemplateAdded(string verifierType, address indexed submitter);
    event VerifierTemplateApproved(string verifierType, bool approved);
    event VerifierUpgraded(address indexed oldVerifier, address indexed newVerifier, string verifierType);
    
    // Core factory functions
    function deployVerifier(
        string calldata verifierType,
        bytes calldata constructorData,
        IRegionalRegistry.Region[] calldata supportedRegions,
        string calldata metadata
    ) external returns (address verifier);
    
    function registerExistingVerifier(
        address verifier,
        string calldata verifierType,
        IRegionalRegistry.Region[] calldata supportedRegions,
        string calldata metadata
    ) external;
    
    function activateVerifier(address verifier) external;
    function deactivateVerifier(address verifier) external;
    
    // Template management
    function addVerifierTemplate(
        string calldata verifierType,
        bytes calldata bytecode,
        string[] calldata constructorParams,
        IRegionalRegistry.Region[] calldata defaultRegions
    ) external;
    
    function approveVerifierTemplate(string calldata verifierType, bool approved) external;
    
    // Verifier management
    function upgradeVerifier(
        address oldVerifier,
        string calldata verifierType,
        bytes calldata constructorData,
        string calldata metadata
    ) external returns (address newVerifier);
    
    function setVerifierRegions(
        address verifier,
        IRegionalRegistry.Region[] calldata regions
    ) external;
    
    function updateVerifierMetadata(address verifier, string calldata metadata) external;
    
    // View functions
    function getVerifierInfo(address verifier) external view returns (VerifierInfo memory);
    function getVerifiersByType(string calldata verifierType) external view returns (address[] memory);
    function getVerifiersByRegion(IRegionalRegistry.Region region) external view returns (address[] memory);
    function getActiveVerifiers() external view returns (address[] memory);
    
    function isVerifierRegistered(address verifier) external view returns (bool);
    function isVerifierActive(address verifier) external view returns (bool);
    function isVerifierTypeSupported(string calldata verifierType) external view returns (bool);
    
    function getVerifierTemplate(string calldata verifierType) external view returns (VerifierTemplate memory);
    function getSupportedVerifierTypes() external view returns (string[] memory);
    
    function canDeployVerifier(address deployer, string calldata verifierType) external view returns (bool);
    function getVerifierCount() external view returns (uint256);
    function getVerifierCountByType(string calldata verifierType) external view returns (uint256);
    
    // Admin functions
    function setMerchantRegistry(address registry) external;
    function setRegionalRegistry(address registry) external;
    function authorizeDeployer(address deployer, bool authorized) external;
    function pause() external;
    function unpause() external;
}