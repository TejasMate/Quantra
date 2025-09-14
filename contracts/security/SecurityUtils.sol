// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title SecurityUtils
 * @dev Library containing common security utilities and patterns
 */
library SecurityUtils {
    using Address for address;
    using SafeERC20 for IERC20;
    
    // Custom errors for better gas efficiency
    error InvalidAddress();
    error InvalidAmount();
    error TransferFailed();
    error InsufficientBalance();
    error ExceedsLimit();
    error Unauthorized();
    error ContractPaused();
    error DeadlineExpired();
    error InvalidSignature();
    
    // Events
    event SecurityCheck(string checkType, bool passed, address user);
    event SuspiciousActivity(address user, string activity, uint256 timestamp);
    
    /**
     * @dev Validates an address is not zero and is a valid contract if expected
     */
    function validateAddress(address addr, bool shouldBeContract) internal view {
        if (addr == address(0)) revert InvalidAddress();
        if (shouldBeContract && addr.code.length == 0) revert InvalidAddress();
    }
    
    /**
     * @dev Validates an amount is within acceptable bounds
     */
    function validateAmount(uint256 amount, uint256 minAmount, uint256 maxAmount) internal pure {
        if (amount == 0 || amount < minAmount) revert InvalidAmount();
        if (maxAmount > 0 && amount > maxAmount) revert ExceedsLimit();
    }
    
    /**
     * @dev Safe transfer with additional checks
     */
    function safeTransferWithChecks(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) internal {
        validateAddress(to, false);
        if (amount == 0) revert InvalidAmount();
        
        uint256 balanceBefore = token.balanceOf(to);
        
        if (from == address(this)) {
            token.safeTransfer(to, amount);
        } else {
            token.safeTransferFrom(from, to, amount);
        }
        
        uint256 balanceAfter = token.balanceOf(to);
        if (balanceAfter - balanceBefore != amount) revert TransferFailed();
    }
    
    /**
     * @dev Check if transaction is within rate limits
     */
    function checkRateLimit(
        mapping(address => uint256) storage lastTransaction,
        mapping(address => uint256) storage transactionCount,
        address user,
        uint256 cooldownPeriod,
        uint256 maxTransactionsPerPeriod
    ) internal returns (bool) {
        uint256 currentTime = block.timestamp;
        uint256 lastTxTime = lastTransaction[user];
        
        // Reset counter if cooldown period has passed
        if (currentTime - lastTxTime >= cooldownPeriod) {
            transactionCount[user] = 0;
        }
        
        // Check if user has exceeded transaction limit
        if (transactionCount[user] >= maxTransactionsPerPeriod) {
            emit SuspiciousActivity(user, "Rate limit exceeded", currentTime);
            return false;
        }
        
        // Update counters
        lastTransaction[user] = currentTime;
        transactionCount[user]++;
        
        return true;
    }
    
    /**
     * @dev Validate deadline hasn't expired
     */
    function validateDeadline(uint256 deadline) internal view {
        if (block.timestamp > deadline) revert DeadlineExpired();
    }
    
    /**
     * @dev Check for suspicious transaction patterns
     */
    function detectSuspiciousActivity(
        address user,
        uint256 amount,
        uint256 userBalance,
        uint256 averageAmount,
        uint256 suspiciousThreshold
    ) internal returns (bool suspicious) {
        // Check for unusually large transactions
        if (amount > averageAmount * suspiciousThreshold / 100) {
            emit SuspiciousActivity(user, "Large transaction detected", block.timestamp);
            suspicious = true;
        }
        
        // Check for transactions that drain most of user's balance
        if (amount > userBalance * 90 / 100) {
            emit SuspiciousActivity(user, "Balance drain detected", block.timestamp);
            suspicious = true;
        }
        
        return suspicious;
    }
    
    /**
     * @dev Validate contract state before critical operations
     */
    function validateContractState(
        bool isPaused,
        bool isEmergency,
        address caller,
        mapping(address => bool) storage authorizedUsers
    ) internal view {
        if (isPaused) revert ContractPaused();
        if (isEmergency && !authorizedUsers[caller]) revert Unauthorized();
    }
    
    /**
     * @dev Calculate percentage with precision
     */
    function calculatePercentage(
        uint256 amount,
        uint256 percentage,
        uint256 precision
    ) internal pure returns (uint256) {
        return (amount * percentage) / (100 * precision);
    }
    
    /**
     * @dev Safe math operations with overflow checks
     */
    function safeAdd(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");
        return c;
    }
    
    function safeSub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "SafeMath: subtraction overflow");
        return a - b;
    }
    
    function safeMul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0) return 0;
        uint256 c = a * b;
        require(c / a == b, "SafeMath: multiplication overflow");
        return c;
    }
    
    function safeDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b > 0, "SafeMath: division by zero");
        return a / b;
    }
    
    /**
     * @dev Generate pseudo-random number (not cryptographically secure)
     */
    function pseudoRandom(uint256 seed) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            seed,
            msg.sender
        )));
    }
    
    /**
     * @dev Validate signature (basic implementation)
     */
    function validateSignature(
        bytes32 hash,
        bytes memory signature,
        address expectedSigner
    ) internal pure returns (bool) {
        if (signature.length != 65) return false;
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        if (v < 27) v += 27;
        
        address recoveredSigner = ecrecover(hash, v, r, s);
        return recoveredSigner == expectedSigner;
    }
    
    /**
     * @dev Create message hash for signing
     */
    function createMessageHash(
        address user,
        uint256 amount,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encode(user, amount, nonce, deadline))
        ));
    }
    
    /**
     * @dev Check if address is a contract
     */
    function isContract(address account) internal view returns (bool) {
        return account.code.length > 0;
    }
    
    /**
     * @dev Validate array lengths match
     */
    function validateArrayLengths(uint256 length1, uint256 length2) internal pure {
        require(length1 == length2, "Array length mismatch");
    }
    
    /**
     * @dev Check if value is within bounds
     */
    function isWithinBounds(
        uint256 value,
        uint256 lowerBound,
        uint256 upperBound
    ) internal pure returns (bool) {
        return value >= lowerBound && value <= upperBound;
    }
    
    /**
     * @dev Emit security check event
     */
    function emitSecurityCheck(
        string memory checkType,
        bool passed,
        address user
    ) internal {
        emit SecurityCheck(checkType, passed, user);
    }
}

/**
 * @title ReentrancyGuardUpgradeable
 * @dev Enhanced reentrancy guard for upgradeable contracts
 */
abstract contract ReentrancyGuardUpgradeable {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    
    uint256 private _status;
    
    function __ReentrancyGuard_init() internal {
        _status = _NOT_ENTERED;
    }
    
    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
    
    function _getReentrancyStatus() internal view returns (uint256) {
        return _status;
    }
}

/**
 * @title CircuitBreaker
 * @dev Circuit breaker pattern implementation
 */
contract CircuitBreaker {
    enum State { CLOSED, OPEN, HALF_OPEN }
    
    State public state = State.CLOSED;
    uint256 public failureCount;
    uint256 public lastFailureTime;
    uint256 public timeout = 60; // 1 minute
    uint256 public threshold = 5; // 5 failures
    
    event CircuitBreakerOpened(uint256 timestamp);
    event CircuitBreakerClosed(uint256 timestamp);
    event CircuitBreakerHalfOpened(uint256 timestamp);
    
    modifier circuitBreaker() {
        if (state == State.OPEN) {
            if (block.timestamp - lastFailureTime >= timeout) {
                state = State.HALF_OPEN;
                emit CircuitBreakerHalfOpened(block.timestamp);
            } else {
                revert("Circuit breaker is open");
            }
        }
        
        _;
        
        // If we reach here, the call was successful
        if (state == State.HALF_OPEN) {
            state = State.CLOSED;
            failureCount = 0;
            emit CircuitBreakerClosed(block.timestamp);
        }
    }
    
    function _recordFailure() internal {
        failureCount++;
        lastFailureTime = block.timestamp;
        
        if (failureCount >= threshold) {
            state = State.OPEN;
            emit CircuitBreakerOpened(block.timestamp);
        }
    }
    
    function _recordSuccess() internal {
        if (state == State.HALF_OPEN) {
            state = State.CLOSED;
            failureCount = 0;
            emit CircuitBreakerClosed(block.timestamp);
        }
    }
}