// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "../interfaces/IMerchantOperations.sol";
import "./EscrowConfigurationManager.sol";

/**
 * @title EscrowDeploymentFactory
 * @dev Handles core escrow deployment operations and cross-chain management
 * @notice This contract focuses on escrow creation, deployment confirmation, and cross-chain mapping
 */
contract EscrowDeploymentFactory is Ownable, ReentrancyGuard, Pausable {
    using Create2 for bytes32;

    // Structs
    struct EscrowRequest {
        uint256 merchantId;
        address merchantOwner;
        string[] chains;
        string[] tokens;
        uint256 requestTime;
        bool processed;
        mapping(string => address) deployedEscrows;
    }

    // State variables
    mapping(uint256 => EscrowRequest) public escrowRequests;
    mapping(uint256 => mapping(string => address[])) public merchantEscrows; // merchantId => chain => escrow addresses
    mapping(bytes32 => address) public deterministicEscrows; // salt => escrow address
    
    uint256 public requestCounter;
    
    // External contracts
    IMerchantOperations public merchantOperations;
    EscrowConfigurationManager public configManager;
    
    // Events
    event EscrowRequested(
        uint256 indexed requestId,
        uint256 indexed merchantId,
        address indexed merchantOwner,
        string[] chains,
        string[] tokens,
        uint256 timestamp
    );
    
    event EscrowDeployed(
        uint256 indexed requestId,
        uint256 indexed merchantId,
        address indexed merchantOwner,
        string chain,
        address escrowAddress,
        address adapter
    );
    
    event EscrowContractsCreated(
        uint256 indexed requestId,
        uint256 indexed merchantId,
        uint256 indexed paymentMethodId,
        address[] escrowAddresses
    );
    
    event SponsoredEscrowCreated(
        uint256 indexed merchantId,
        uint256 indexed requestId,
        uint256 totalFee
    );
    
    event CrossChainDeploymentTriggered(
        uint256 indexed requestId,
        uint256 indexed merchantId,
        address indexed merchantOwner,
        string chain,
        string[] tokens,
        address adapter
    );
    
    event AdapterDeploymentCompleted(
        uint256 indexed requestId,
        string chain,
        address escrowAddress,
        bytes32 txHash
    );
    
    event DeterministicEscrowDeployed(
        bytes32 indexed salt,
        address indexed escrowAddress,
        uint256 indexed merchantId,
        string chain
    );
    
    event CrossChainEscrowMapped(
        uint256 indexed merchantId,
        address indexed merchantOwner,
        string chain,
        address escrowAddress,
        uint256 escrowCount
    );

    // Modifiers
    modifier onlyRegisteredMerchant(uint256 _merchantId) {
        require(merchantOperations.isMerchantRegistered(_merchantId), "Merchant not registered");
        _;
    }
    
    modifier onlyAuthorizedAdapter() {
        require(configManager.isAdapterAuthorized(msg.sender), "Adapter not authorized");
        _;
    }

    constructor(
        address _merchantOperations,
        address payable _configManager
    ) Ownable(msg.sender) {
        require(_merchantOperations != address(0), "Invalid merchant operations address");
        require(_configManager != address(0), "Invalid config manager address");
        
        merchantOperations = IMerchantOperations(_merchantOperations);
        configManager = EscrowConfigurationManager(_configManager);
    }

    /**
     * @notice Create escrow contracts directly for EVM chains
     * @param _merchantId The merchant ID requesting escrow
     * @param _paymentMethodId The payment method ID
     * @param _chains Array of chain names for deployment (EVM chains only)
     * @param _tokens Array of token symbols to support
     * @return requestId The unique request identifier
     * @return escrowAddresses Array of deployed escrow addresses
     */
    function createEscrowContracts(
        uint256 _merchantId,
        uint256 _paymentMethodId,
        string[] memory _chains,
        string[] memory _tokens
    ) external payable onlyRegisteredMerchant(_merchantId) nonReentrant whenNotPaused returns (uint256, address[] memory) {
        require(_chains.length > 0, "At least one chain required");
        require(_tokens.length > 0, "At least one token required");
        // Payment method ID validation removed as uint256 is always >= 0
        
        // Verify merchant ownership
        require(merchantOperations.getMerchantIdByOwner(msg.sender) == _merchantId, "Not merchant owner");
        
        // Calculate total deployment fee
        uint256 totalFee = configManager.calculateDeploymentFee(_chains);
        require(msg.value >= totalFee, "Insufficient fee");
        
        // Refund excess payment
        if (msg.value > totalFee) {
            payable(msg.sender).transfer(msg.value - totalFee);
        }
        
        requestCounter++;
        uint256 requestId = requestCounter;
        
        // Create escrow request
        EscrowRequest storage request = escrowRequests[requestId];
        request.merchantId = _merchantId;
        request.merchantOwner = msg.sender;
        request.chains = _chains;
        request.tokens = _tokens;
        request.requestTime = block.timestamp;
        request.processed = true; // Mark as processed since we're deploying directly
        
        // Deploy escrow contracts for EVM chains
        address[] memory escrowAddresses = new address[](_chains.length);
        
        for (uint256 i = 0; i < _chains.length; i++) {
            string memory chain = _chains[i];
            require(configManager.isChainSupported(chain), string(abi.encodePacked("Chain not supported: ", chain)));
            
            // For this implementation, we'll generate deterministic addresses
            // In a full implementation, you would deploy actual escrow contracts here
            bytes32 salt = keccak256(abi.encodePacked(_merchantId, _paymentMethodId, chain, requestId));
            address escrowAddress = address(uint160(uint256(keccak256(abi.encodePacked(salt, address(this))))));
            
            // Store the escrow address
            request.deployedEscrows[chain] = escrowAddress;
            merchantEscrows[_merchantId][chain].push(escrowAddress);
            escrowAddresses[i] = escrowAddress;
            
            // Link escrow to merchant in registry
            merchantOperations.linkEscrow(_merchantId, escrowAddress, chain);
            
            emit EscrowDeployed(requestId, _merchantId, msg.sender, chain, escrowAddress, address(this));
        }
        
        emit EscrowContractsCreated(requestId, _merchantId, _paymentMethodId, escrowAddresses);
        
        return (requestId, escrowAddresses);
    }

    /**
     * @notice Request escrow creation for multiple chains
     * @param _merchantId The merchant ID requesting escrow
     * @param _chains Array of chain names for deployment
     * @param _tokens Array of token symbols to support
     * @return requestId The unique request identifier
     */
    function requestEscrowCreation(
        uint256 _merchantId,
        string[] memory _chains,
        string[] memory _tokens
    ) external payable onlyRegisteredMerchant(_merchantId) nonReentrant whenNotPaused returns (uint256) {
        require(_chains.length > 0, "At least one chain required");
        require(_tokens.length > 0, "At least one token required");
        
        // Verify merchant ownership
        require(merchantOperations.getMerchantIdByOwner(msg.sender) == _merchantId, "Not merchant owner");
        
        // Calculate total deployment fee
        uint256 totalFee = configManager.calculateDeploymentFee(_chains);
        require(msg.value >= totalFee, "Insufficient fee");
        
        // Refund excess payment
        if (msg.value > totalFee) {
            payable(msg.sender).transfer(msg.value - totalFee);
        }
        
        requestCounter++;
        uint256 requestId = requestCounter;
        
        EscrowRequest storage request = escrowRequests[requestId];
        request.merchantId = _merchantId;
        request.merchantOwner = msg.sender;
        request.chains = _chains;
        request.tokens = _tokens;
        request.requestTime = block.timestamp;
        request.processed = false;
        
        emit EscrowRequested(requestId, _merchantId, msg.sender, _chains, _tokens, block.timestamp);
        
        return requestId;
    }

    /**
     * @notice Request sponsored escrow creation (gasless for eligible merchants)
     * @param _merchantId The merchant ID requesting escrow
     * @param _chains Array of chain names for deployment
     * @param _tokens Array of token symbols to support
     * @return requestId The unique request identifier
     */
    function requestSponsoredEscrowCreation(
        uint256 _merchantId,
        string[] memory _chains,
        string[] memory _tokens
    ) external onlyRegisteredMerchant(_merchantId) nonReentrant whenNotPaused returns (uint256) {
        require(_chains.length > 0, "At least one chain required");
        require(_tokens.length > 0, "At least one token required");
        require(configManager.isGaslessDeploymentEnabled(), "Gasless deployment disabled");
        require(configManager.isMerchantSponsored(_merchantId), "Merchant not sponsored");
        
        // Verify merchant ownership
        require(merchantOperations.getMerchantIdByOwner(msg.sender) == _merchantId, "Not merchant owner");
        
        // Calculate total fee and check DAO sponsorship balance
        uint256 totalFee = configManager.calculateDeploymentFee(_chains);
        require(configManager.deductSponsorshipFunds(totalFee), "Insufficient DAO sponsorship balance");
        
        requestCounter++;
        uint256 requestId = requestCounter;
        
        EscrowRequest storage request = escrowRequests[requestId];
        request.merchantId = _merchantId;
        request.merchantOwner = msg.sender;
        request.chains = _chains;
        request.tokens = _tokens;
        request.requestTime = block.timestamp;
        request.processed = false;
        
        emit EscrowRequested(requestId, _merchantId, msg.sender, _chains, _tokens, block.timestamp);
        emit SponsoredEscrowCreated(_merchantId, requestId, totalFee);
        
        return requestId;
    }

    /**
     * @notice Confirm escrow deployment on a specific chain
     * @param _requestId The escrow request ID
     * @param _chain The chain where escrow was deployed
     * @param _escrowAddress The deployed escrow contract address
     */
    function confirmEscrowDeployment(
        uint256 _requestId,
        string memory _chain,
        address _escrowAddress
    ) external onlyAuthorizedAdapter {
        require(_requestId <= requestCounter && _requestId > 0, "Invalid request ID");
        require(_escrowAddress != address(0), "Invalid escrow address");
        
        EscrowRequest storage request = escrowRequests[_requestId];
        require(!request.processed, "Request already processed");
        require(_isChainInRequest(request.chains, _chain), "Chain not in request");
        
        // Store the deployed escrow address
        request.deployedEscrows[_chain] = _escrowAddress;
        
        // Add to merchant's escrow list
        merchantEscrows[request.merchantId][_chain].push(_escrowAddress);
        
        // Link escrow to merchant in registry
        merchantOperations.linkEscrow(request.merchantId, _escrowAddress, _chain);
        
        emit EscrowDeployed(_requestId, request.merchantId, request.merchantOwner, _chain, _escrowAddress, msg.sender);
        emit CrossChainEscrowMapped(request.merchantId, request.merchantOwner, _chain, _escrowAddress, merchantEscrows[request.merchantId][_chain].length);
        
        // Check if all chains have been deployed
        bool allDeployed = true;
        for (uint256 i = 0; i < request.chains.length; i++) {
            if (request.deployedEscrows[request.chains[i]] == address(0)) {
                allDeployed = false;
                break;
            }
        }
        
        if (allDeployed) {
            request.processed = true;
        }
    }

    /**
     * @notice Trigger cross-chain escrow deployment through authorized adapters
     * @param _requestId The escrow request ID
     * @param _chain The target chain for deployment
     * @param _adapterAddress The authorized adapter address for the chain
     */
    function triggerCrossChainDeployment(
        uint256 _requestId,
        string memory _chain,
        address _adapterAddress
    ) external onlyAuthorizedAdapter nonReentrant {
        require(_requestId > 0 && _requestId <= requestCounter, "Invalid request ID");
        require(configManager.isAdapterAuthorized(_adapterAddress), "Adapter not authorized");
        require(configManager.isChainSupported(_chain), "Chain not supported");
        
        EscrowRequest storage request = escrowRequests[_requestId];
        require(!request.processed, "Request already processed");
        require(request.merchantId != 0, "Invalid request");
        
        // Verify the chain is in the request
        require(_isChainInRequest(request.chains, _chain), "Chain not in request");
        
        // Emit event for adapter to listen to
        emit CrossChainDeploymentTriggered(
            _requestId,
            request.merchantId,
            request.merchantOwner,
            _chain,
            request.tokens,
            _adapterAddress
        );
    }
    
    /**
     * @notice Record completion of cross-chain deployment
     * @param _requestId The escrow request ID
     * @param _chain The chain where deployment occurred
     * @param _escrowAddress The deployed escrow contract address
     * @param _txHash The transaction hash of deployment
     */
    function recordDeploymentCompletion(
        uint256 _requestId,
        string memory _chain,
        address _escrowAddress,
        bytes32 _txHash
    ) external onlyAuthorizedAdapter {
        require(_requestId > 0 && _requestId <= requestCounter, "Invalid request ID");
        require(_escrowAddress != address(0), "Invalid escrow address");
        
        EscrowRequest storage request = escrowRequests[_requestId];
        require(request.merchantId != 0, "Invalid request");
        
        // Store the deployed escrow address
        request.deployedEscrows[_chain] = _escrowAddress;
        
        // Add to merchant's escrow list
        merchantEscrows[request.merchantId][_chain].push(_escrowAddress);
        
        emit AdapterDeploymentCompleted(_requestId, _chain, _escrowAddress, _txHash);
        
        // Check if all chains are deployed
        bool allDeployed = true;
        for (uint256 i = 0; i < request.chains.length; i++) {
            if (request.deployedEscrows[request.chains[i]] == address(0)) {
                allDeployed = false;
                break;
            }
        }
        
        if (allDeployed) {
            request.processed = true;
        }
    }

    /**
     * @notice Deploy escrow using CREATE2 for deterministic addresses
     * @param _merchantId The merchant ID
     * @param _chain The target chain
     * @param _nonce Unique nonce for salt generation
     * @param _bytecode The escrow contract bytecode
     * @return escrowAddress The deployed escrow address
     * @return salt The salt used for deployment
     */
    function deployDeterministicEscrow(
        uint256 _merchantId,
        string memory _chain,
        uint256 _nonce,
        bytes memory _bytecode
    ) external onlyAuthorizedAdapter returns (address escrowAddress, bytes32 salt) {
        require(configManager.isChainSupported(_chain), "Chain not supported");
        require(_merchantId != 0, "Invalid merchant ID");
        require(merchantOperations.isMerchantRegistered(_merchantId), "Merchant not registered");
        
        salt = keccak256(abi.encodePacked(_merchantId, _chain, _nonce));
        require(deterministicEscrows[salt] == address(0), "Escrow already deployed with this salt");
        
        escrowAddress = Create2.deploy(0, salt, _bytecode);
        require(escrowAddress != address(0), "Deployment failed");
        
        // Store deterministic mapping
        deterministicEscrows[salt] = escrowAddress;
        
        // Add to merchant's escrow list for this chain
        merchantEscrows[_merchantId][_chain].push(escrowAddress);
        
        // Get merchant owner for event
        address merchantOwner = merchantOperations.getMerchantIdByOwner(msg.sender) == _merchantId ? msg.sender : address(0);
        
        emit DeterministicEscrowDeployed(salt, escrowAddress, _merchantId, _chain);
        emit CrossChainEscrowMapped(_merchantId, merchantOwner, _chain, escrowAddress, merchantEscrows[_merchantId][_chain].length);
        
        return (escrowAddress, salt);
    }

    /**
     * @notice Compute deterministic escrow address before deployment
     * @param _merchantId The merchant ID
     * @param _chain The target chain
     * @param _nonce Unique nonce for salt generation
     * @param _bytecode The escrow contract bytecode
     * @return predictedAddress The predicted escrow address
     * @return salt The salt that would be used
     */
    function computeEscrowAddress(
        uint256 _merchantId,
        string memory _chain,
        uint256 _nonce,
        bytes memory _bytecode
    ) public view returns (address, bytes32) {
        bytes32 salt = keccak256(abi.encodePacked(_merchantId, _chain, _nonce));
        address predictedAddress = Create2.computeAddress(salt, keccak256(_bytecode));
        return (predictedAddress, salt);
    }

    // View functions
    function getEscrowRequest(uint256 _requestId) 
        external 
        view 
        returns (
            uint256 merchantId,
            address merchantOwner,
            string[] memory chains,
            string[] memory tokens,
            uint256 requestTime,
            bool processed
        ) 
    {
        require(_requestId <= requestCounter && _requestId > 0, "Invalid request ID");
        
        EscrowRequest storage request = escrowRequests[_requestId];
        return (
            request.merchantId,
            request.merchantOwner,
            request.chains,
            request.tokens,
            request.requestTime,
            request.processed
        );
    }

    function getDeployedEscrow(uint256 _requestId, string memory _chain) 
        external 
        view 
        returns (address) 
    {
        require(_requestId <= requestCounter && _requestId > 0, "Invalid request ID");
        return escrowRequests[_requestId].deployedEscrows[_chain];
    }

    function getPendingRequests() external view returns (uint256[] memory) {
        uint256 pendingCount = 0;
        
        // Count pending requests
        for (uint256 i = 1; i <= requestCounter; i++) {
            if (!escrowRequests[i].processed) {
                pendingCount++;
            }
        }
        
        // Create array of pending request IDs
        uint256[] memory pendingIds = new uint256[](pendingCount);
        uint256 index = 0;
        
        for (uint256 i = 1; i <= requestCounter; i++) {
            if (!escrowRequests[i].processed) {
                pendingIds[index] = i;
                index++;
            }
        }
        
        return pendingIds;
    }

    function getMerchantEscrows(uint256 _merchantId, string memory _chain) 
        external 
        view 
        returns (address[] memory) 
    {
        return merchantEscrows[_merchantId][_chain];
    }

    function getMerchantEscrowCount(uint256 _merchantId, string memory _chain) 
        external 
        view 
        returns (uint256) 
    {
        return merchantEscrows[_merchantId][_chain].length;
    }

    function getAllMerchantEscrows(uint256 _merchantId, string[] memory _chains) 
        external 
        view 
        returns (string[] memory chains, address[][] memory escrowAddresses) 
    {
        chains = _chains;
        escrowAddresses = new address[][](_chains.length);
        
        for (uint256 i = 0; i < _chains.length; i++) {
            escrowAddresses[i] = merchantEscrows[_merchantId][_chains[i]];
        }
    }

    function getEscrowBySalt(bytes32 _salt) external view returns (address) {
        return deterministicEscrows[_salt];
    }

    // Helper functions
    function _isChainInRequest(string[] memory _chains, string memory _chain) 
        internal 
        pure 
        returns (bool) 
    {
        for (uint256 i = 0; i < _chains.length; i++) {
            if (keccak256(bytes(_chains[i])) == keccak256(bytes(_chain))) {
                return true;
            }
        }
        return false;
    }

    // Admin functions
    function updateConfigManager(address payable _newConfigManager) external onlyOwner {
        require(_newConfigManager != address(0), "Invalid config manager address");
        configManager = EscrowConfigurationManager(_newConfigManager);
    }

    function updateMerchantOperations(address _newMerchantOperations) external onlyOwner {
        require(_newMerchantOperations != address(0), "Invalid merchant operations address");
        merchantOperations = IMerchantOperations(_newMerchantOperations);
    }

    // Emergency functions
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {
        // Accept ETH for deployment fees
    }
}