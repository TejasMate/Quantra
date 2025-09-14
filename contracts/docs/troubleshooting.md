# Troubleshooting Guide

## Overview

This guide provides solutions to common issues, debugging techniques, and troubleshooting procedures for the QuantraPay smart contract system. Use this guide to quickly resolve deployment, runtime, and integration issues.

## Table of Contents

- [Common Issues](#common-issues)
- [Deployment Problems](#deployment-problems)
- [Runtime Errors](#runtime-errors)
- [Integration Issues](#integration-issues)
- [Performance Problems](#performance-problems)
- [Security Concerns](#security-concerns)
- [Network-Specific Issues](#network-specific-issues)
- [Debugging Tools](#debugging-tools)
- [Error Codes Reference](#error-codes-reference)
- [Support Resources](#support-resources)

## Common Issues

### Contract Compilation Errors

#### Issue: Solidity Version Mismatch
```
Error: Source file requires different compiler version
```

**Solution:**
```javascript
// hardhat.config.js
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};
```

#### Issue: Missing Dependencies
```
Error: Cannot resolve dependency
```

**Solution:**
```bash
# Install missing OpenZeppelin contracts
npm install @openzeppelin/contracts@4.9.0

# Install missing Hardhat plugins
npm install --save-dev @nomiclabs/hardhat-ethers
npm install --save-dev @nomiclabs/hardhat-waffle
```

#### Issue: Import Path Errors
```
Error: Source "@openzeppelin/contracts/token/ERC20/ERC20.sol" not found
```

**Solution:**
```solidity
// Use correct import paths
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
```

### Gas-Related Issues

#### Issue: Out of Gas Errors
```
Error: Transaction ran out of gas
```

**Solutions:**
1. **Increase Gas Limit:**
   ```javascript
   const tx = await contract.functionName({
     gasLimit: 500000 // Increase gas limit
   });
   ```

2. **Optimize Contract Code:**
   ```solidity
   // Use packed structs
   struct PackedData {
       uint128 value1;
       uint128 value2;
   }
   
   // Use events instead of storage for logs
   event DataLogged(uint256 indexed id, bytes32 data);
   ```

3. **Batch Operations:**
   ```solidity
   function batchTransfer(address[] calldata recipients, uint256[] calldata amounts) external {
       require(recipients.length == amounts.length, "Array length mismatch");
       for (uint256 i = 0; i < recipients.length; i++) {
           _transfer(msg.sender, recipients[i], amounts[i]);
       }
   }
   ```

#### Issue: Gas Price Too Low
```
Error: Transaction underpriced
```

**Solution:**
```javascript
// Check current gas price
const gasPrice = await ethers.provider.getGasPrice();
const adjustedGasPrice = gasPrice.mul(110).div(100); // 10% higher

const tx = await contract.functionName({
  gasPrice: adjustedGasPrice
});
```

## Deployment Problems

### Network Configuration Issues

#### Issue: Wrong Network Configuration
```
Error: Network not found or misconfigured
```

**Solution:**
```javascript
// hardhat.config.js
networks: {
  polygon: {
    url: "https://polygon-rpc.com",
    accounts: [process.env.PRIVATE_KEY],
    chainId: 137,
    gasPrice: 30000000000 // 30 gwei
  },
  avalanche: {
    url: "https://api.avax.network/ext/bc/C/rpc",
    accounts: [process.env.PRIVATE_KEY],
    chainId: 43114,
    gasPrice: 25000000000 // 25 gwei
  }
}
```

#### Issue: Insufficient Funds for Deployment
```
Error: Insufficient funds for gas * price + value
```

**Solutions:**
1. **Check Account Balance:**
   ```bash
   npx hardhat run scripts/check-balance.js --network polygon
   ```

2. **Fund Account:**
   ```javascript
   // check-balance.js
   const balance = await ethers.provider.getBalance(deployer.address);
   console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");
   ```

### Contract Size Issues

#### Issue: Contract Size Exceeds Limit
```
Error: Contract code size exceeds 24576 bytes
```

**Solutions:**
1. **Enable Optimizer:**
   ```javascript
   // hardhat.config.js
   solidity: {
     version: "0.8.19",
     settings: {
       optimizer: {
         enabled: true,
         runs: 200
       }
     }
   }
   ```

2. **Split Large Contracts:**
   ```solidity
   // Split functionality into libraries
   library PaymentUtils {
       function calculateFee(uint256 amount) internal pure returns (uint256) {
           return amount * 25 / 10000; // 0.25%
       }
   }
   
   contract PaymentProcessor {
       using PaymentUtils for uint256;
       
       function processPayment(uint256 amount) external {
           uint256 fee = amount.calculateFee();
           // Process payment logic
       }
   }
   ```

3. **Use Proxy Pattern:**
   ```solidity
   // Deploy implementation and proxy separately
   contract PaymentProcessorV1 {
       // Implementation logic
   }
   
   // Deploy with proxy
   const implementation = await PaymentProcessorV1.deploy();
   const proxy = await upgrades.deployProxy(PaymentProcessorV1, []);
   ```

## Runtime Errors

### Access Control Errors

#### Issue: Unauthorized Access
```
Error: Ownable: caller is not the owner
```

**Solutions:**
1. **Check Caller Address:**
   ```javascript
   const owner = await contract.owner();
   const caller = await signer.getAddress();
   console.log("Owner:", owner);
   console.log("Caller:", caller);
   ```

2. **Grant Proper Roles:**
   ```javascript
   const ADMIN_ROLE = await contract.ADMIN_ROLE();
   await contract.grantRole(ADMIN_ROLE, adminAddress);
   ```

#### Issue: Role-Based Access Denied
```
Error: AccessControl: account is missing role
```

**Solution:**
```javascript
// Check if account has required role
const hasRole = await contract.hasRole(REQUIRED_ROLE, accountAddress);
if (!hasRole) {
  await contract.grantRole(REQUIRED_ROLE, accountAddress);
}
```

### Transaction Failures

#### Issue: Revert Without Reason
```
Error: Transaction reverted without a reason string
```

**Debugging Steps:**
1. **Use Hardhat Network:**
   ```bash
   npx hardhat node --verbose
   ```

2. **Add Debug Logs:**
   ```solidity
   import "hardhat/console.sol";
   
   function debugFunction(uint256 value) external {
       console.log("Input value:", value);
       require(value > 0, "Value must be positive");
       console.log("Validation passed");
   }
   ```

3. **Use Try-Catch:**
   ```javascript
   try {
     const tx = await contract.functionName();
     await tx.wait();
   } catch (error) {
     console.log("Transaction failed:", error.message);
     if (error.data) {
       console.log("Error data:", error.data);
     }
   }
   ```

### State Inconsistency

#### Issue: Unexpected Contract State
```
Error: Contract state does not match expected values
```

**Debugging:**
```javascript
// Check contract state
const currentState = await contract.getCurrentState();
console.log("Current state:", currentState);

// Check event logs
const filter = contract.filters.StateChanged();
const events = await contract.queryFilter(filter, -100); // Last 100 blocks
console.log("Recent state changes:", events);
```

## Integration Issues

### Frontend Integration Problems

#### Issue: MetaMask Connection Failures
```
Error: User rejected the request
```

**Solutions:**
1. **Handle User Rejection:**
   ```javascript
   try {
     await window.ethereum.request({ method: 'eth_requestAccounts' });
   } catch (error) {
     if (error.code === 4001) {
       console.log('User rejected connection');
       // Show user-friendly message
     }
   }
   ```

2. **Check Network:**
   ```javascript
   const chainId = await window.ethereum.request({ method: 'eth_chainId' });
   if (chainId !== '0x89') { // Polygon mainnet
     await window.ethereum.request({
       method: 'wallet_switchEthereumChain',
       params: [{ chainId: '0x89' }]
     });
   }
   ```

#### Issue: Contract ABI Mismatch
```
Error: Contract function doesn't exist
```

**Solution:**
```javascript
// Ensure ABI matches deployed contract
const contractABI = require('./artifacts/contracts/PaymentProcessor.sol/PaymentProcessor.json').abi;
const contract = new ethers.Contract(contractAddress, contractABI, signer);

// Verify contract code
const deployedCode = await ethers.provider.getCode(contractAddress);
if (deployedCode === '0x') {
  throw new Error('Contract not deployed at this address');
}
```

### API Integration Issues

#### Issue: Oracle Data Stale
```
Error: Price data too old
```

**Solution:**
```solidity
function getLatestPrice() external view returns (uint256, uint256) {
    (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
    require(block.timestamp - updatedAt <= 3600, "Price data stale"); // 1 hour
    require(price > 0, "Invalid price");
    return (uint256(price), updatedAt);
}
```

#### Issue: Cross-Chain Message Delays
```
Error: Cross-chain transaction not confirmed
```

**Monitoring:**
```javascript
// Monitor cross-chain transaction
async function monitorCrossChainTx(txHash, destinationChain) {
  const maxWaitTime = 30 * 60 * 1000; // 30 minutes
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    const status = await checkCrossChainStatus(txHash, destinationChain);
    if (status === 'confirmed') {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
  }
  
  throw new Error('Cross-chain transaction timeout');
}
```

## Performance Problems

### Slow Transaction Processing

#### Issue: High Gas Costs
```
Warning: Transaction gas cost exceeds threshold
```

**Optimizations:**
1. **Use Events for Data Storage:**
   ```solidity
   // Instead of storing in state
   mapping(uint256 => string) public data;
   
   // Use events
   event DataStored(uint256 indexed id, string data);
   
   function storeData(uint256 id, string calldata data) external {
       emit DataStored(id, data);
   }
   ```

2. **Batch Operations:**
   ```solidity
   function batchMint(address[] calldata recipients, uint256[] calldata amounts) external {
       for (uint256 i = 0; i < recipients.length; i++) {
           _mint(recipients[i], amounts[i]);
       }
   }
   ```

3. **Use Assembly for Gas Optimization:**
   ```solidity
   function efficientTransfer(address to, uint256 amount) external {
       assembly {
           let success := call(gas(), to, amount, 0, 0, 0, 0)
           if iszero(success) { revert(0, 0) }
       }
   }
   ```

### Memory Issues

#### Issue: Stack Too Deep
```
Error: Stack too deep, try removing local variables
```

**Solutions:**
1. **Use Structs:**
   ```solidity
   struct PaymentData {
       address sender;
       address recipient;
       uint256 amount;
       uint256 fee;
   }
   
   function processPayment(PaymentData memory data) external {
       // Use struct instead of multiple parameters
   }
   ```

2. **Split Functions:**
   ```solidity
   function complexFunction(uint256 param1, uint256 param2) external {
       uint256 result1 = _calculateStep1(param1);
       uint256 result2 = _calculateStep2(param2);
       _finalizeProcess(result1, result2);
   }
   
   function _calculateStep1(uint256 param) private pure returns (uint256) {
       // Step 1 logic
   }
   ```

## Security Concerns

### Reentrancy Attacks

#### Issue: Potential Reentrancy Vulnerability
```
Warning: External call before state change
```

**Solution:**
```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SecureContract is ReentrancyGuard {
    mapping(address => uint256) public balances;
    
    function withdraw(uint256 amount) external nonReentrant {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        // Update state before external call
        balances[msg.sender] -= amount;
        
        // External call
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }
}
```

### Oracle Manipulation

#### Issue: Price Oracle Attack
```
Warning: Single oracle dependency detected
```

**Solution:**
```solidity
contract SecurePriceOracle {
    AggregatorV3Interface[] public priceFeeds;
    uint256 public constant DEVIATION_THRESHOLD = 500; // 5%
    
    function getSecurePrice() external view returns (uint256) {
        uint256[] memory prices = new uint256[](priceFeeds.length);
        
        // Get prices from multiple oracles
        for (uint256 i = 0; i < priceFeeds.length; i++) {
            (, int256 price, , uint256 updatedAt, ) = priceFeeds[i].latestRoundData();
            require(block.timestamp - updatedAt <= 3600, "Stale price");
            prices[i] = uint256(price);
        }
        
        // Check for price deviation
        uint256 avgPrice = _calculateAverage(prices);
        for (uint256 i = 0; i < prices.length; i++) {
            uint256 deviation = _calculateDeviation(prices[i], avgPrice);
            require(deviation <= DEVIATION_THRESHOLD, "Price deviation too high");
        }
        
        return avgPrice;
    }
}
```

## Network-Specific Issues

### Polygon Network

#### Issue: High Gas Prices on Polygon
```
Error: Gas price too high
```

**Solution:**
```javascript
// Use gas station API for optimal gas price
const response = await fetch('https://gasstation-mainnet.matic.network/v2');
const gasData = await response.json();

const gasPrice = ethers.utils.parseUnits(gasData.standard.maxFee.toString(), 'gwei');

const tx = await contract.functionName({
  maxFeePerGas: gasPrice,
  maxPriorityFeePerGas: ethers.utils.parseUnits('30', 'gwei')
});
```

### Avalanche Network

#### Issue: C-Chain Congestion
```
Error: Transaction timeout on Avalanche
```

**Solution:**
```javascript
// Increase gas price for faster confirmation
const tx = await contract.functionName({
  gasPrice: ethers.utils.parseUnits('50', 'gwei'), // Higher gas price
  gasLimit: 500000
});

// Wait with timeout
const receipt = await Promise.race([
  tx.wait(),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Transaction timeout')), 60000)
  )
]);
```

### Aptos Network

#### Issue: Move Module Compilation
```
Error: Move compilation failed
```

**Solution:**
```bash
# Check Move.toml configuration
[package]
name = "QuantraPay"
version = "1.0.0"

[addresses]
QuantraPay = "_"

[dependencies]
AptosFramework = { git = "https://github.com/aptos-labs/aptos-core.git", subdir = "aptos-move/framework/aptos-framework", rev = "main" }

# Compile with verbose output
aptos move compile --verbose
```

## Debugging Tools

### Hardhat Console

```javascript
// Add to contract for debugging
import "hardhat/console.sol";

function debugFunction(uint256 value) external {
    console.log("Debug value:", value);
    console.log("Sender:", msg.sender);
    console.log("Block timestamp:", block.timestamp);
}
```

### Tenderly Integration

```javascript
// hardhat.config.js
require("@tenderly/hardhat-tenderly");

module.exports = {
  tenderly: {
    project: "your-project",
    username: "your-username"
  }
};

// Debug transaction
npx hardhat tenderly:verify --network mainnet ContractName=0x...
```

### Event Monitoring

```javascript
// Monitor contract events
const filter = contract.filters.PaymentProcessed();
contract.on(filter, (sender, recipient, amount, event) => {
  console.log('Payment processed:', {
    sender,
    recipient,
    amount: ethers.utils.formatEther(amount),
    txHash: event.transactionHash
  });
});
```

### Transaction Tracing

```javascript
// Trace transaction execution
const tx = await contract.functionName();
const trace = await ethers.provider.send('debug_traceTransaction', [
  tx.hash,
  { tracer: 'callTracer' }
]);
console.log('Transaction trace:', trace);
```

## Error Codes Reference

### Custom Error Codes

| Code | Error | Description | Solution |
|------|-------|-------------|---------|
| QP001 | InsufficientBalance | Account balance too low | Fund account or reduce amount |
| QP002 | InvalidRecipient | Recipient address invalid | Verify recipient address |
| QP003 | PaymentExpired | Payment deadline exceeded | Create new payment |
| QP004 | UnauthorizedAccess | Caller lacks permission | Grant required role |
| QP005 | ContractPaused | Contract is paused | Wait for unpause or contact admin |
| QP006 | InvalidAmount | Amount is zero or negative | Use positive amount |
| QP007 | DuplicatePayment | Payment ID already exists | Use unique payment ID |
| QP008 | OracleFailure | Price oracle unavailable | Wait for oracle recovery |
| QP009 | CrossChainError | Cross-chain operation failed | Retry or use different bridge |
| QP010 | GasLimitExceeded | Transaction gas too high | Optimize or increase limit |

### Standard Solidity Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `require` failed | Condition not met | Check require conditions |
| `assert` failed | Internal error | Review contract logic |
| Division by zero | Math operation error | Add zero checks |
| Array out of bounds | Invalid array access | Validate array indices |
| Insufficient gas | Gas limit too low | Increase gas limit |

## Support Resources

### Documentation Links

- [Hardhat Documentation](https://hardhat.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Ethers.js Documentation](https://docs.ethers.io)
- [Solidity Documentation](https://docs.soliditylang.org)

### Community Support

- **Discord**: [QuantraPay Community](https://discord.gg/quantrapay)
- **Telegram**: [@QuantraPaySupport](https://t.me/quantrapaysupport)
- **GitHub Issues**: [Report Issues](https://github.com/quantrapay/contracts/issues)
- **Stack Overflow**: Tag questions with `quantrapay`

### Emergency Contacts

- **Security Issues**: security@quantrapay.com
- **Technical Support**: support@quantrapay.com
- **Emergency Hotline**: +1-800-QUANTRA

### Monitoring Tools

- **Contract Status**: [status.quantrapay.com](https://status.quantrapay.com)
- **Network Health**: [health.quantrapay.com](https://health.quantrapay.com)
- **Gas Tracker**: [gas.quantrapay.com](https://gas.quantrapay.com)

---

**Note**: This troubleshooting guide is regularly updated based on community feedback and new issues discovered. If you encounter an issue not covered here, please report it through our support channels.