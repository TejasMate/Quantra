// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title EscrowConfigurationManager
 * @dev Manages configuration, chain settings, adapter authorization, and DAO governance for escrow operations
 * @notice This contract handles all administrative and configuration aspects of the escrow system
 */
contract EscrowConfigurationManager is Ownable, Pausable {
    // Structs
    struct ChainConfig {
        bool isSupported;
        string rpcUrl;
        uint256 deploymentFee;
        address feeRecipient;
    }

    // State variables
    mapping(string => ChainConfig) public chainConfigs;
    mapping(address => bool) public authorizedAdapters;
    mapping(string => bool) public supportedTokens;
    mapping(uint256 => bool) public sponsoredMerchants;
    
    address public dao;
    uint256 public defaultDeploymentFee;
    uint256 public daoSponsorshipBalance;
    bool public gaslessDeploymentEnabled;
    
    // Events
    event ChainConfigured(
        string indexed chain,
        bool isSupported,
        string rpcUrl,
        uint256 deploymentFee
    );
    
    event AdapterAuthorized(
        address indexed adapter,
        bool authorized
    );
    
    event DeploymentFeeUpdated(
        uint256 newFee
    );
    
    event DAOUpdated(
        address indexed oldDAO,
        address indexed newDAO
    );
    
    event TokenSupported(
        string indexed token,
        bool supported,
        address indexed updatedBy
    );
    
    event DAOSponsorshipDeposited(
        uint256 amount,
        address indexed depositor,
        uint256 newBalance
    );
    
    event MerchantSponsored(
        uint256 indexed merchantId,
        bool sponsored,
        address indexed updatedBy
    );
    
    event GaslessDeploymentToggled(
        bool enabled,
        address indexed updatedBy
    );

    // Modifiers
    modifier onlyDAO() {
        require(msg.sender == dao, "Only DAO can call this function");
        _;
    }

    constructor() Ownable(msg.sender) {
        defaultDeploymentFee = 0.001 ether;
        gaslessDeploymentEnabled = false;
        
        // Configure default supported chains
        _configureChain("ethereum", true, "https://mainnet.infura.io/v3/", 0.001 ether);
        _configureChain("polygon", true, "https://polygon-rpc.com/", 0.0001 ether);
        _configureChain("bsc", true, "https://bsc-dataseed.binance.org/", 0.0001 ether);
        _configureChain("arbitrum", true, "https://arb1.arbitrum.io/rpc", 0.0005 ether);
        _configureChain("optimism", true, "https://mainnet.optimism.io", 0.0005 ether);
        
        // Configure localhost and testnet chains
        _configureChain("localhost", true, "http://localhost:8545", 0.001 ether);
        _configureChain("avalanche", true, "https://api.avax-test.network/ext/bc/C/rpc", 0.002 ether);
        _configureChain("aptos", true, "https://fullnode.devnet.aptoslabs.com/v1", 0.001 ether);
    }

    // Chain Configuration Functions
    
    /**
     * @notice Configure chain settings (owner only)
     * @param _chain The chain identifier
     * @param _isSupported Whether the chain is supported
     * @param _rpcUrl The RPC URL for the chain
     * @param _deploymentFee The deployment fee for the chain
     */
    function configureChain(
        string memory _chain,
        bool _isSupported,
        string memory _rpcUrl,
        uint256 _deploymentFee
    ) external onlyOwner {
        _configureChain(_chain, _isSupported, _rpcUrl, _deploymentFee);
    }

    /**
     * @notice Configure chain settings by DAO
     * @param _chain The chain identifier
     * @param _rpcUrl The RPC URL for the chain
     * @param _deploymentFee The deployment fee for the chain
     * @param _feeRecipient The fee recipient address
     */
    function configureChainByDAO(
        string memory _chain,
        string memory _rpcUrl,
        uint256 _deploymentFee,
        address _feeRecipient
    ) external onlyDAO {
        require(bytes(_chain).length > 0, "Chain name required");
        require(bytes(_rpcUrl).length > 0, "RPC URL required");
        require(_feeRecipient != address(0), "Fee recipient required");
        
        chainConfigs[_chain] = ChainConfig({
            isSupported: true,
            rpcUrl: _rpcUrl,
            deploymentFee: _deploymentFee,
            feeRecipient: _feeRecipient
        });
        
        emit ChainConfigured(_chain, true, _rpcUrl, _deploymentFee);
    }

    function _configureChain(
        string memory _chain,
        bool _isSupported,
        string memory _rpcUrl,
        uint256 _deploymentFee
    ) internal {
        chainConfigs[_chain] = ChainConfig({
            isSupported: _isSupported,
            rpcUrl: _rpcUrl,
            deploymentFee: _deploymentFee,
            feeRecipient: owner()
        });
        
        emit ChainConfigured(_chain, _isSupported, _rpcUrl, _deploymentFee);
    }

    // Adapter Authorization Functions
    
    /**
     * @notice Authorize or deauthorize an adapter (owner only)
     * @param _adapter The adapter address
     * @param _authorized Whether the adapter is authorized
     */
    function authorizeAdapter(address _adapter, bool _authorized) external onlyOwner {
        authorizedAdapters[_adapter] = _authorized;
        emit AdapterAuthorized(_adapter, _authorized);
    }

    /**
     * @notice Authorize or deauthorize an adapter by DAO
     * @param _adapter The adapter address
     * @param _authorized Whether the adapter is authorized
     */
    function authorizeAdapterByDAO(address _adapter, bool _authorized) external onlyDAO {
        require(_adapter != address(0), "Invalid adapter address");
        authorizedAdapters[_adapter] = _authorized;
        emit AdapterAuthorized(_adapter, _authorized);
    }

    // Fee Management Functions
    
    /**
     * @notice Update default deployment fee (owner only)
     * @param _newFee The new default deployment fee
     */
    function updateDefaultDeploymentFee(uint256 _newFee) external onlyOwner {
        defaultDeploymentFee = _newFee;
        emit DeploymentFeeUpdated(_newFee);
    }

    /**
     * @notice Update deployment fee by DAO
     * @param _newFee The new default deployment fee
     */
    function updateDeploymentFeeByDAO(uint256 _newFee) external onlyDAO {
        defaultDeploymentFee = _newFee;
        emit DeploymentFeeUpdated(_newFee);
    }

    /**
     * @notice Calculate total deployment fee for given chains
     * @param _chains Array of chain identifiers
     * @return totalFee The total deployment fee
     */
    function calculateDeploymentFee(string[] memory _chains) external view returns (uint256) {
        uint256 totalFee = 0;
        for (uint256 i = 0; i < _chains.length; i++) {
            if (chainConfigs[_chains[i]].isSupported) {
                totalFee += chainConfigs[_chains[i]].deploymentFee;
            }
        }
        return totalFee;
    }

    /**
     * @notice Withdraw collected fees (owner only)
     */
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No fees to withdraw");
        
        payable(owner()).transfer(balance);
    }

    // DAO Governance Functions
    
    /**
     * @notice Set the DAO address (owner only, for initial setup)
     * @param _dao The DAO contract address
     */
    function setDAO(address _dao) external onlyOwner {
        require(_dao != address(0), "Invalid DAO address");
        address oldDAO = dao;
        dao = _dao;
        emit DAOUpdated(oldDAO, _dao);
    }
    
    /**
     * @notice Add or remove supported tokens (DAO only)
     * @param _token The token identifier
     * @param _supported Whether the token is supported
     */
    function setSupportedToken(string memory _token, bool _supported) external onlyDAO {
        require(bytes(_token).length > 0, "Token name required");
        supportedTokens[_token] = _supported;
        emit TokenSupported(_token, _supported, msg.sender);
    }
    
    /**
     * @notice Pause contract operations (DAO only)
     */
    function pause() external onlyDAO {
        _pause();
    }
    
    /**
     * @notice Unpause contract operations (DAO only)
     */
    function unpause() external onlyDAO {
        _unpause();
    }

    // Gasless Deployment Management Functions
    
    /**
     * @notice Deposit funds for sponsoring merchant deployments (DAO only)
     */
    function depositSponsorshipFunds() external payable onlyDAO {
        require(msg.value > 0, "Must deposit some ETH");
        daoSponsorshipBalance += msg.value;
        emit DAOSponsorshipDeposited(msg.value, msg.sender, daoSponsorshipBalance);
    }
    
    /**
     * @notice Sponsor or unsponsor a merchant for gasless deployments (DAO only)
     * @param _merchantId The merchant ID
     * @param _sponsored Whether the merchant is sponsored
     */
    function sponsorMerchant(uint256 _merchantId, bool _sponsored) external onlyDAO {
        require(_merchantId != 0, "Invalid merchant ID");
        sponsoredMerchants[_merchantId] = _sponsored;
        emit MerchantSponsored(_merchantId, _sponsored, msg.sender);
    }
    
    /**
     * @notice Enable or disable gasless deployment feature (DAO only)
     * @param _enabled Whether gasless deployment is enabled
     */
    function toggleGaslessDeployment(bool _enabled) external onlyDAO {
        gaslessDeploymentEnabled = _enabled;
        emit GaslessDeploymentToggled(_enabled, msg.sender);
    }
    
    /**
     * @notice Withdraw unused sponsorship funds (DAO only)
     * @param _amount The amount to withdraw
     */
    function withdrawSponsorshipFunds(uint256 _amount) external onlyDAO {
        require(_amount > 0, "Amount must be greater than 0");
        require(_amount <= daoSponsorshipBalance, "Insufficient sponsorship balance");
        
        daoSponsorshipBalance -= _amount;
        payable(dao).transfer(_amount);
    }

    /**
     * @notice Deduct sponsorship funds for deployment (internal use by EscrowDeploymentFactory)
     * @param _amount The amount to deduct
     * @return success Whether the deduction was successful
     */
    function deductSponsorshipFunds(uint256 _amount) external returns (bool) {
        // This should only be called by the EscrowDeploymentFactory
        // In a production environment, you'd want to add proper access control
        if (daoSponsorshipBalance >= _amount) {
            daoSponsorshipBalance -= _amount;
            return true;
        }
        return false;
    }

    // View Functions
    
    /**
     * @notice Check if a chain is supported
     * @param _chain The chain identifier
     * @return Whether the chain is supported
     */
    function isChainSupported(string memory _chain) external view returns (bool) {
        return chainConfigs[_chain].isSupported;
    }

    /**
     * @notice Check if an adapter is authorized
     * @param _adapter The adapter address
     * @return Whether the adapter is authorized
     */
    function isAdapterAuthorized(address _adapter) external view returns (bool) {
        return authorizedAdapters[_adapter];
    }

    /**
     * @notice Check if a token is supported
     * @param _token The token identifier
     * @return Whether the token is supported
     */
    function isTokenSupported(string memory _token) external view returns (bool) {
        return supportedTokens[_token];
    }

    /**
     * @notice Check if a merchant is sponsored
     * @param _merchantId The merchant ID
     * @return Whether the merchant is sponsored
     */
    function isMerchantSponsored(uint256 _merchantId) external view returns (bool) {
        return sponsoredMerchants[_merchantId];
    }

    /**
     * @notice Check if gasless deployment is enabled
     * @return Whether gasless deployment is enabled
     */
    function isGaslessDeploymentEnabled() external view returns (bool) {
        return gaslessDeploymentEnabled;
    }

    /**
     * @notice Get DAO sponsorship balance
     * @return The current sponsorship balance
     */
    function getSponsorshipBalance() external view returns (uint256) {
        return daoSponsorshipBalance;
    }

    /**
     * @notice Get chain configuration
     * @param _chain The chain identifier
     * @return The chain configuration
     */
    function getChainConfig(string memory _chain) external view returns (ChainConfig memory) {
        return chainConfigs[_chain];
    }

    /**
     * @notice Get default deployment fee
     * @return The default deployment fee
     */
    function getDefaultDeploymentFee() external view returns (uint256) {
        return defaultDeploymentFee;
    }

    /**
     * @notice Get DAO address
     * @return The DAO contract address
     */
    function getDAO() external view returns (address) {
        return dao;
    }

    // Emergency Functions
    
    /**
     * @notice Emergency pause (owner only)
     */
    function emergencyPause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Emergency unpause (owner only)
     */
    function emergencyUnpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {
        // Accept ETH for fees and sponsorship
    }
}