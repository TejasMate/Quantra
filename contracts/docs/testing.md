# Testing Guide

## Overview

This guide provides comprehensive testing strategies, methodologies, and best practices for the QuantraPay smart contract system. Proper testing is crucial for ensuring contract security, functionality, and reliability.

## Table of Contents

- [Testing Framework](#testing-framework)
- [Test Structure](#test-structure)
- [Unit Testing](#unit-testing)
- [Integration Testing](#integration-testing)
- [Security Testing](#security-testing)
- [Gas Optimization Testing](#gas-optimization-testing)
- [Test Automation](#test-automation)
- [Coverage Requirements](#coverage-requirements)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Testing Framework

### Primary Tools

- **Hardhat**: Main testing framework
- **Mocha**: Test runner
- **Chai**: Assertion library
- **Waffle**: Ethereum testing utilities
- **Ethers.js**: Ethereum library
- **Solidity Coverage**: Code coverage analysis

### Setup

```bash
# Install dependencies
npm install --save-dev @nomiclabs/hardhat-waffle
npm install --save-dev @nomiclabs/hardhat-ethers
npm install --save-dev chai
npm install --save-dev ethereum-waffle
npm install --save-dev solidity-coverage
```

### Configuration

```javascript
// hardhat.config.js
require("@nomiclabs/hardhat-waffle");
require("solidity-coverage");

module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      gas: 12000000,
      blockGasLimit: 12000000,
      allowUnlimitedContractSize: true
    }
  },
  mocha: {
    timeout: 60000
  }
};
```

## Test Structure

### Directory Organization

```
test/
├── unit/
│   ├── core/
│   │   ├── PaymentProcessor.test.js
│   │   ├── EscrowFactory.test.js
│   │   └── MerchantRegistry.test.js
│   ├── governance/
│   │   ├── GovernanceToken.test.js
│   │   └── TimelockController.test.js
│   └── utils/
│       ├── SecurityUtils.test.js
│       └── PriceOracle.test.js
├── integration/
│   ├── payment-flow.test.js
│   ├── escrow-lifecycle.test.js
│   └── governance-process.test.js
├── security/
│   ├── reentrancy.test.js
│   ├── access-control.test.js
│   └── oracle-manipulation.test.js
├── gas/
│   ├── gas-optimization.test.js
│   └── gas-benchmarks.test.js
├── fixtures/
│   ├── deployment.js
│   └── test-data.js
└── helpers/
    ├── time.js
    ├── events.js
    └── assertions.js
```

### Test File Template

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("ContractName", function () {
  // Fixture for contract deployment
  async function deployContractFixture() {
    const [owner, user1, user2] = await ethers.getSigners();
    
    const ContractFactory = await ethers.getContractFactory("ContractName");
    const contract = await ContractFactory.deploy();
    await contract.deployed();
    
    return { contract, owner, user1, user2 };
  }
  
  describe("Deployment", function () {
    it("Should deploy with correct initial state", async function () {
      const { contract, owner } = await loadFixture(deployContractFixture);
      expect(await contract.owner()).to.equal(owner.address);
    });
  });
  
  describe("Functionality", function () {
    // Test cases here
  });
  
  describe("Access Control", function () {
    // Access control tests
  });
  
  describe("Edge Cases", function () {
    // Edge case tests
  });
});
```

## Unit Testing

### Core Contract Testing

#### PaymentProcessor Tests

```javascript
describe("PaymentProcessor", function () {
  let paymentProcessor, token, owner, merchant, customer;
  
  beforeEach(async function () {
    [owner, merchant, customer] = await ethers.getSigners();
    
    // Deploy mock token
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("Test Token", "TEST", 18);
    
    // Deploy PaymentProcessor
    const PaymentProcessor = await ethers.getContractFactory("PaymentProcessor");
    paymentProcessor = await PaymentProcessor.deploy();
    
    // Setup initial state
    await token.mint(customer.address, ethers.utils.parseEther("1000"));
    await token.connect(customer).approve(
      paymentProcessor.address, 
      ethers.utils.parseEther("1000")
    );
  });
  
  describe("Payment Processing", function () {
    it("Should process payment successfully", async function () {
      const amount = ethers.utils.parseEther("100");
      
      await expect(
        paymentProcessor.connect(customer).processPayment(
          merchant.address,
          token.address,
          amount,
          "payment-ref-123"
        )
      ).to.emit(paymentProcessor, "PaymentProcessed")
       .withArgs(customer.address, merchant.address, token.address, amount, "payment-ref-123");
      
      expect(await token.balanceOf(merchant.address)).to.equal(amount);
    });
    
    it("Should fail with insufficient balance", async function () {
      const amount = ethers.utils.parseEther("2000");
      
      await expect(
        paymentProcessor.connect(customer).processPayment(
          merchant.address,
          token.address,
          amount,
          "payment-ref-123"
        )
      ).to.be.revertedWith("Insufficient balance");
    });
    
    it("Should fail with zero amount", async function () {
      await expect(
        paymentProcessor.connect(customer).processPayment(
          merchant.address,
          token.address,
          0,
          "payment-ref-123"
        )
      ).to.be.revertedWith("Amount must be greater than zero");
    });
  });
  
  describe("Fee Calculation", function () {
    it("Should calculate fees correctly", async function () {
      const amount = ethers.utils.parseEther("100");
      const expectedFee = amount.mul(25).div(10000); // 0.25%
      
      const calculatedFee = await paymentProcessor.calculateFee(amount);
      expect(calculatedFee).to.equal(expectedFee);
    });
  });
});
```

#### EscrowFactory Tests

```javascript
describe("EscrowFactory", function () {
  let escrowFactory, token, buyer, seller, arbiter;
  
  beforeEach(async function () {
    [owner, buyer, seller, arbiter] = await ethers.getSigners();
    
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("Test Token", "TEST", 18);
    
    const EscrowFactory = await ethers.getContractFactory("EscrowFactory");
    escrowFactory = await EscrowFactory.deploy();
  });
  
  describe("Escrow Creation", function () {
    it("Should create escrow successfully", async function () {
      const amount = ethers.utils.parseEther("100");
      const deadline = Math.floor(Date.now() / 1000) + 86400; // 24 hours
      
      await expect(
        escrowFactory.connect(buyer).createEscrow(
          seller.address,
          arbiter.address,
          token.address,
          amount,
          deadline,
          "Test escrow"
        )
      ).to.emit(escrowFactory, "EscrowCreated");
      
      const escrowCount = await escrowFactory.getEscrowCount();
      expect(escrowCount).to.equal(1);
    });
    
    it("Should fail with invalid deadline", async function () {
      const amount = ethers.utils.parseEther("100");
      const pastDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      
      await expect(
        escrowFactory.connect(buyer).createEscrow(
          seller.address,
          arbiter.address,
          token.address,
          amount,
          pastDeadline,
          "Test escrow"
        )
      ).to.be.revertedWith("Deadline must be in the future");
    });
  });
});
```

### Utility Testing

#### SecurityUtils Tests

```javascript
describe("SecurityUtils", function () {
  let securityUtils;
  
  beforeEach(async function () {
    const SecurityUtils = await ethers.getContractFactory("SecurityUtilsTest");
    securityUtils = await SecurityUtils.deploy();
  });
  
  describe("Address Validation", function () {
    it("Should validate correct addresses", async function () {
      const validAddress = "0x1234567890123456789012345678901234567890";
      expect(await securityUtils.isValidAddress(validAddress)).to.be.true;
    });
    
    it("Should reject zero address", async function () {
      expect(await securityUtils.isValidAddress(ethers.constants.AddressZero)).to.be.false;
    });
  });
  
  describe("Rate Limiting", function () {
    it("Should enforce rate limits", async function () {
      const [user] = await ethers.getSigners();
      const amount = ethers.utils.parseEther("100");
      
      // First call should succeed
      await securityUtils.connect(user).testRateLimit(amount);
      
      // Second call within limit should fail
      await expect(
        securityUtils.connect(user).testRateLimit(amount)
      ).to.be.revertedWith("Rate limit exceeded");
    });
  });
});
```

## Integration Testing

### End-to-End Payment Flow

```javascript
describe("Payment Flow Integration", function () {
  let paymentProcessor, escrowFactory, merchantRegistry, token;
  let owner, merchant, customer, arbiter;
  
  beforeEach(async function () {
    [owner, merchant, customer, arbiter] = await ethers.getSigners();
    
    // Deploy all contracts
    const deployments = await deployFullSystem();
    paymentProcessor = deployments.paymentProcessor;
    escrowFactory = deployments.escrowFactory;
    merchantRegistry = deployments.merchantRegistry;
    token = deployments.token;
    
    // Setup initial state
    await token.mint(customer.address, ethers.utils.parseEther("1000"));
    await merchantRegistry.registerMerchant(merchant.address, "Test Merchant");
  });
  
  it("Should complete full payment flow", async function () {
    const amount = ethers.utils.parseEther("100");
    
    // 1. Customer approves payment
    await token.connect(customer).approve(paymentProcessor.address, amount);
    
    // 2. Process payment
    await paymentProcessor.connect(customer).processPayment(
      merchant.address,
      token.address,
      amount,
      "order-123"
    );
    
    // 3. Verify balances
    const merchantBalance = await token.balanceOf(merchant.address);
    const expectedAmount = amount.sub(await paymentProcessor.calculateFee(amount));
    expect(merchantBalance).to.equal(expectedAmount);
    
    // 4. Verify payment record
    const payment = await paymentProcessor.getPayment("order-123");
    expect(payment.amount).to.equal(amount);
    expect(payment.status).to.equal(1); // Completed
  });
  
  it("Should handle escrow payment flow", async function () {
    const amount = ethers.utils.parseEther("100");
    const deadline = Math.floor(Date.now() / 1000) + 86400;
    
    // 1. Create escrow
    await token.connect(customer).approve(escrowFactory.address, amount);
    await escrowFactory.connect(customer).createEscrow(
      merchant.address,
      arbiter.address,
      token.address,
      amount,
      deadline,
      "Escrow payment"
    );
    
    // 2. Get escrow address
    const escrowAddress = await escrowFactory.getEscrow(0);
    const escrow = await ethers.getContractAt("Escrow", escrowAddress);
    
    // 3. Seller delivers and releases funds
    await escrow.connect(merchant).confirmDelivery();
    await escrow.connect(customer).releaseFunds();
    
    // 4. Verify final balances
    const merchantBalance = await token.balanceOf(merchant.address);
    expect(merchantBalance).to.equal(amount);
  });
});
```

### Cross-Chain Integration

```javascript
describe("Cross-Chain Integration", function () {
  let polygonAdapter, avalancheAdapter, aptosAdapter;
  
  beforeEach(async function () {
    // Deploy adapters
    const PolygonAdapter = await ethers.getContractFactory("PolygonAdapter");
    polygonAdapter = await PolygonAdapter.deploy();
    
    const AvalancheAdapter = await ethers.getContractFactory("AvalancheAdapter");
    avalancheAdapter = await AvalancheAdapter.deploy();
    
    const AptosAdapter = await ethers.getContractFactory("AptosAdapter");
    aptosAdapter = await AptosAdapter.deploy();
  });
  
  it("Should handle cross-chain payment routing", async function () {
    const amount = ethers.utils.parseEther("100");
    const destinationChain = "polygon";
    
    // Test payment routing logic
    const route = await polygonAdapter.calculateOptimalRoute(
      amount,
      destinationChain
    );
    
    expect(route.estimatedGas).to.be.gt(0);
    expect(route.estimatedTime).to.be.gt(0);
  });
});
```

## Security Testing

### Reentrancy Testing

```javascript
describe("Reentrancy Protection", function () {
  let vulnerableContract, attackContract;
  
  beforeEach(async function () {
    const VulnerableContract = await ethers.getContractFactory("TestReentrancy");
    vulnerableContract = await VulnerableContract.deploy();
    
    const AttackContract = await ethers.getContractFactory("ReentrancyAttacker");
    attackContract = await AttackContract.deploy(vulnerableContract.address);
  });
  
  it("Should prevent reentrancy attacks", async function () {
    // Fund the vulnerable contract
    await vulnerableContract.deposit({ value: ethers.utils.parseEther("1") });
    
    // Attempt reentrancy attack
    await expect(
      attackContract.attack({ value: ethers.utils.parseEther("0.1") })
    ).to.be.revertedWith("ReentrancyGuard: reentrant call");
  });
});
```

### Access Control Testing

```javascript
describe("Access Control", function () {
  let contract, owner, user, admin;
  
  beforeEach(async function () {
    [owner, user, admin] = await ethers.getSigners();
    
    const AccessControlledContract = await ethers.getContractFactory("AccessControlledContract");
    contract = await AccessControlledContract.deploy();
    
    // Grant admin role
    const ADMIN_ROLE = await contract.ADMIN_ROLE();
    await contract.grantRole(ADMIN_ROLE, admin.address);
  });
  
  it("Should enforce role-based access control", async function () {
    // Admin should be able to call admin function
    await expect(contract.connect(admin).adminFunction()).to.not.be.reverted;
    
    // Regular user should not be able to call admin function
    await expect(
      contract.connect(user).adminFunction()
    ).to.be.revertedWith("AccessControl: account is missing role");
  });
  
  it("Should allow role management", async function () {
    const USER_ROLE = await contract.USER_ROLE();
    
    // Grant role
    await contract.connect(admin).grantRole(USER_ROLE, user.address);
    expect(await contract.hasRole(USER_ROLE, user.address)).to.be.true;
    
    // Revoke role
    await contract.connect(admin).revokeRole(USER_ROLE, user.address);
    expect(await contract.hasRole(USER_ROLE, user.address)).to.be.false;
  });
});
```

### Oracle Manipulation Testing

```javascript
describe("Oracle Security", function () {
  let priceOracle, mockFeed1, mockFeed2;
  
  beforeEach(async function () {
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    mockFeed1 = await MockPriceFeed.deploy(ethers.utils.parseEther("2000")); // $2000
    mockFeed2 = await MockPriceFeed.deploy(ethers.utils.parseEther("2010")); // $2010
    
    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    priceOracle = await PriceOracle.deploy();
    
    // Add price feeds
    await priceOracle.addPriceFeed(mockFeed1.address, 5000); // 50% weight
    await priceOracle.addPriceFeed(mockFeed2.address, 5000); // 50% weight
  });
  
  it("Should detect price manipulation", async function () {
    // Simulate price manipulation
    await mockFeed1.setPrice(ethers.utils.parseEther("1000")); // 50% drop
    
    // Oracle should detect manipulation and use circuit breaker
    await expect(
      priceOracle.getPrice()
    ).to.be.revertedWith("Price deviation too high");
  });
  
  it("Should handle feed failures gracefully", async function () {
    // Simulate feed failure
    await mockFeed1.setFailure(true);
    
    // Should still return price from remaining feeds
    const price = await priceOracle.getPrice();
    expect(price).to.equal(ethers.utils.parseEther("2010"));
  });
});
```

## Gas Optimization Testing

### Gas Benchmarking

```javascript
describe("Gas Optimization", function () {
  let contract;
  
  beforeEach(async function () {
    const OptimizedContract = await ethers.getContractFactory("OptimizedContract");
    contract = await OptimizedContract.deploy();
  });
  
  it("Should meet gas efficiency targets", async function () {
    const tx = await contract.efficientFunction();
    const receipt = await tx.wait();
    
    // Assert gas usage is within acceptable limits
    expect(receipt.gasUsed).to.be.lt(100000); // Less than 100k gas
  });
  
  it("Should optimize batch operations", async function () {
    const batchSize = 10;
    const data = Array(batchSize).fill().map((_, i) => i);
    
    const tx = await contract.batchOperation(data);
    const receipt = await tx.wait();
    
    // Gas per operation should be efficient
    const gasPerOperation = receipt.gasUsed.div(batchSize);
    expect(gasPerOperation).to.be.lt(50000); // Less than 50k gas per operation
  });
});
```

### Gas Comparison Tests

```javascript
describe("Gas Comparison", function () {
  let optimizedContract, unoptimizedContract;
  
  beforeEach(async function () {
    const OptimizedContract = await ethers.getContractFactory("OptimizedContract");
    optimizedContract = await OptimizedContract.deploy();
    
    const UnoptimizedContract = await ethers.getContractFactory("UnoptimizedContract");
    unoptimizedContract = await UnoptimizedContract.deploy();
  });
  
  it("Should use less gas than unoptimized version", async function () {
    const optimizedTx = await optimizedContract.testFunction();
    const optimizedReceipt = await optimizedTx.wait();
    
    const unoptimizedTx = await unoptimizedContract.testFunction();
    const unoptimizedReceipt = await unoptimizedTx.wait();
    
    expect(optimizedReceipt.gasUsed).to.be.lt(unoptimizedReceipt.gasUsed);
    
    const gasImprovement = unoptimizedReceipt.gasUsed.sub(optimizedReceipt.gasUsed);
    const improvementPercent = gasImprovement.mul(100).div(unoptimizedReceipt.gasUsed);
    
    console.log(`Gas improvement: ${improvementPercent}%`);
    expect(improvementPercent).to.be.gte(10); // At least 10% improvement
  });
});
```

## Test Automation

### Continuous Integration

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Compile contracts
      run: npx hardhat compile
    
    - name: Run tests
      run: npm test
    
    - name: Generate coverage report
      run: npm run coverage
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
```

### Test Scripts

```json
{
  "scripts": {
    "test": "hardhat test",
    "test:unit": "hardhat test test/unit/**/*.test.js",
    "test:integration": "hardhat test test/integration/**/*.test.js",
    "test:security": "hardhat test test/security/**/*.test.js",
    "test:gas": "hardhat test test/gas/**/*.test.js",
    "coverage": "hardhat coverage",
    "test:watch": "hardhat test --watch",
    "test:parallel": "hardhat test --parallel"
  }
}
```

## Coverage Requirements

### Minimum Coverage Targets

- **Overall Coverage**: 95%
- **Function Coverage**: 100%
- **Branch Coverage**: 90%
- **Line Coverage**: 95%

### Coverage Configuration

```javascript
// .solcover.js
module.exports = {
  skipFiles: [
    'test/',
    'mock/',
    'interfaces/'
  ],
  mocha: {
    timeout: 60000
  },
  providerOptions: {
    mnemonic: "test test test test test test test test test test test junk"
  }
};
```

### Coverage Reporting

```bash
# Generate coverage report
npm run coverage

# View coverage report
open coverage/index.html

# Coverage with specific threshold
npx hardhat coverage --temp artifacts --testfiles "test/**/*.test.js"
```

## Best Practices

### Test Organization

1. **Descriptive Test Names**
   ```javascript
   it("Should revert when non-owner tries to pause contract", async function () {
     // Test implementation
   });
   ```

2. **Arrange-Act-Assert Pattern**
   ```javascript
   it("Should transfer tokens correctly", async function () {
     // Arrange
     const amount = ethers.utils.parseEther("100");
     await token.mint(sender.address, amount);
     
     // Act
     await token.connect(sender).transfer(receiver.address, amount);
     
     // Assert
     expect(await token.balanceOf(receiver.address)).to.equal(amount);
   });
   ```

3. **Test Isolation**
   ```javascript
   beforeEach(async function () {
     // Reset state for each test
     await loadFixture(deployContractFixture);
   });
   ```

### Error Testing

```javascript
// Test specific error messages
await expect(
  contract.restrictedFunction()
).to.be.revertedWith("Ownable: caller is not the owner");

// Test custom errors (Solidity 0.8.4+)
await expect(
  contract.customErrorFunction()
).to.be.revertedWithCustomError(contract, "CustomError")
 .withArgs(expectedArg1, expectedArg2);
```

### Event Testing

```javascript
// Test event emission
await expect(
  contract.functionThatEmitsEvent()
).to.emit(contract, "EventName")
 .withArgs(expectedArg1, expectedArg2);

// Test multiple events
const tx = await contract.functionThatEmitsMultipleEvents();
const receipt = await tx.wait();

expect(receipt.events).to.have.lengthOf(2);
expect(receipt.events[0].event).to.equal("FirstEvent");
expect(receipt.events[1].event).to.equal("SecondEvent");
```

### Time-Based Testing

```javascript
const { time } = require("@nomicfoundation/hardhat-network-helpers");

it("Should handle time-locked functions", async function () {
  // Set specific timestamp
  await time.setNextBlockTimestamp(1234567890);
  
  // Increase time
  await time.increase(3600); // 1 hour
  
  // Test time-dependent functionality
  await contract.timeLockedFunction();
});
```

## Troubleshooting

### Common Issues

1. **Gas Limit Exceeded**
   ```javascript
   // Increase gas limit in hardhat.config.js
   networks: {
     hardhat: {
       gas: 12000000,
       blockGasLimit: 12000000
     }
   }
   ```

2. **Timeout Issues**
   ```javascript
   // Increase timeout in test
   it("Long running test", async function () {
     this.timeout(60000); // 60 seconds
     // Test implementation
   });
   ```

3. **Memory Issues**
   ```bash
   # Increase Node.js memory limit
   export NODE_OPTIONS="--max-old-space-size=4096"
   npm test
   ```

### Debugging Tests

```javascript
// Add console logs
console.log("Debug value:", await contract.getValue());

// Use hardhat console
const { console } = require("hardhat");

// Debug with hardhat network
npx hardhat node --verbose
```

### Performance Optimization

```javascript
// Use fixtures for expensive setup
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Parallel test execution
npx hardhat test --parallel

// Skip slow tests in development
it.skip("Slow test", async function () {
  // Test implementation
});
```

---

**Note**: This testing guide should be regularly updated to reflect new testing patterns, tools, and best practices. All developers should follow these guidelines to ensure comprehensive test coverage and maintain code quality.