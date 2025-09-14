// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title BaseRegistry
 * @dev Base contract for all registry contracts
 * @notice Provides common functionality and reduces code duplication
 */
abstract contract BaseRegistry is 
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // Common state variables
    mapping(address => bool) public authorizedCallers;
    mapping(string => bytes32) public registryConfig;
    
    uint256 public totalEntries;
    string public registryVersion;
    
    // Events
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);
    event RegistryConfigUpdated(string parameter, bytes32 value);
    event RegistryUpgraded(address indexed newImplementation);
    
    // Modifiers
    modifier onlyAuthorized() {
        require(
            authorizedCallers[msg.sender] || msg.sender == owner(),
            "BaseRegistry: Not authorized"
        );
        _;
    }
    
    modifier validAddress(address addr) {
        require(addr != address(0), "BaseRegistry: Invalid address");
        _;
    }
    
    modifier nonEmptyString(string calldata str) {
        require(bytes(str).length > 0, "BaseRegistry: Empty string");
        _;
    }
    
    /**
     * @dev Initialize the base registry
     * @param _registryVersion Version identifier for this registry
     */
    function __BaseRegistry_init(string memory _registryVersion) internal onlyInitializing {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        registryVersion = _registryVersion;
        totalEntries = 0;
    }
    
    /**
     * @dev Authorize or deauthorize a caller
     * @param caller Address to authorize/deauthorize
     * @param authorized Whether to authorize or deauthorize
     */
    function setAuthorizedCaller(address caller, bool authorized) 
        external 
        onlyOwner 
        validAddress(caller) 
    {
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }
    
    /**
     * @dev Update registry configuration
     * @param parameter Configuration parameter name
     * @param value Configuration value
     */
    function updateRegistryConfig(
        string calldata parameter,
        bytes32 value
    ) external onlyOwner nonEmptyString(parameter) {
        registryConfig[parameter] = value;
        emit RegistryConfigUpdated(parameter, value);
    }
    
    /**
     * @dev Get registry configuration value
     * @param parameter Configuration parameter name
     * @return Configuration value
     */
    function getRegistryConfig(string calldata parameter) 
        external 
        view 
        returns (bytes32) 
    {
        return registryConfig[parameter];
    }
    
    /**
     * @dev Check if an address is authorized
     * @param caller Address to check
     * @return Whether the address is authorized
     */
    function isAuthorized(address caller) external view returns (bool) {
        return authorizedCallers[caller] || caller == owner();
    }
    
    /**
     * @dev Get registry information
     * @return version Registry version
     * @return entries Total number of entries
     * @return paused Whether the registry is paused
     */
    function getRegistryInfo() 
        external 
        view 
        returns (
            string memory version,
            uint256 entries,
            bool paused
        ) 
    {
        return (registryVersion, totalEntries, super.paused());
    }
    
    /**
     * @dev Pause the registry
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause the registry
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Increment total entries counter
     */
    function _incrementEntries() internal {
        totalEntries++;
    }
    
    /**
     * @dev Decrement total entries counter
     */
    function _decrementEntries() internal {
        if (totalEntries > 0) {
            totalEntries--;
        }
    }
    
    /**
     * @dev Validate that a string is not empty and within length limits
     * @param str String to validate
     * @param maxLength Maximum allowed length
     */
    function _validateString(string calldata str, uint256 maxLength) internal pure {
        require(bytes(str).length > 0, "BaseRegistry: Empty string");
        require(bytes(str).length <= maxLength, "BaseRegistry: String too long");
    }
    
    /**
     * @dev Validate that an array is not empty and within size limits
     * @param arrayLength Length of the array
     * @param maxLength Maximum allowed length
     */
    function _validateArrayLength(uint256 arrayLength, uint256 maxLength) internal pure {
        require(arrayLength > 0, "BaseRegistry: Empty array");
        require(arrayLength <= maxLength, "BaseRegistry: Array too long");
    }
    
    /**
     * @dev Validate that two arrays have the same length
     * @param length1 Length of first array
     * @param length2 Length of second array
     */
    function _validateArrayLengthMatch(uint256 length1, uint256 length2) internal pure {
        require(length1 == length2, "BaseRegistry: Array length mismatch");
    }
    
    /**
     * @dev Convert bytes32 to string
     * @param data Bytes32 data to convert
     * @return String representation
     */
    function _bytes32ToString(bytes32 data) internal pure returns (string memory) {
        bytes memory bytesArray = new bytes(32);
        for (uint256 i = 0; i < 32; i++) {
            bytesArray[i] = data[i];
        }
        return string(bytesArray);
    }
    
    /**
     * @dev Convert string to bytes32
     * @param str String to convert
     * @return Bytes32 representation
     */
    function _stringToBytes32(string memory str) internal pure returns (bytes32) {
        bytes memory bytesArray = bytes(str);
        require(bytesArray.length <= 32, "BaseRegistry: String too long for bytes32");
        
        bytes32 result;
        assembly {
            result := mload(add(bytesArray, 32))
        }
        return result;
    }
    
    /**
     * @dev Check if two strings are equal
     * @param a First string
     * @param b Second string
     * @return Whether strings are equal
     */
    function _stringsEqual(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
    
    /**
     * @dev Generate a unique ID based on address and string
     * @param addr Address component
     * @param str String component
     * @return Unique bytes32 ID
     */
    function _generateId(address addr, string memory str) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(addr, str));
    }
    
    /**
     * @dev Generate a unique ID based on multiple parameters
     * @param params Array of parameters to hash
     * @return Unique bytes32 ID
     */
    function _generateComplexId(bytes[] memory params) internal pure returns (bytes32) {
        return keccak256(abi.encode(params));
    }
    
    /**
     * @dev Authorize upgrade (required by UUPSUpgradeable)
     * @param newImplementation Address of new implementation
     */
    function _authorizeUpgrade(address newImplementation) 
        internal 
        override 
        onlyOwner 
        validAddress(newImplementation)
    {
        emit RegistryUpgraded(newImplementation);
    }
    
    /**
     * @dev Get implementation version
     * @return Implementation version string
     */
    function getImplementationVersion() external view virtual returns (string memory) {
        return registryVersion;
    }
    
    /**
     * @dev Emergency function to recover stuck tokens
     * @param token Token contract address (address(0) for ETH)
     * @param to Recipient address
     * @param amount Amount to recover
     */
    function emergencyRecover(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner validAddress(to) {
        require(amount > 0, "BaseRegistry: Invalid amount");
        
        if (token == address(0)) {
            // Recover ETH
            require(address(this).balance >= amount, "BaseRegistry: Insufficient ETH balance");
            payable(to).transfer(amount);
        } else {
            // Recover ERC20 tokens
            IERC20(token).transfer(to, amount);
        }
    }
    
    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[45] private __gap;
}