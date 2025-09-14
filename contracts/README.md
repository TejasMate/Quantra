# QuantraPay Smart Contracts Documentation

This directory contains all smart contracts for the QuantraPay cross-chain merchant escrow platform, organized into logical modules for governance, merchant operations, payment verification, security, and cross-chain escrow management.

## 🚀 Platform Overview

QuantraPay is a sophisticated cross-chain merchant escrow platform that enables secure P2P transactions with:
- **Cross-chain escrow contracts** for multiple blockchains (Avalanche, Polygon, Solana, Aptos)
- **Regional payment verification** for UPI (India), PIX (Brazil), SEPA (Europe)
- **Governance token with vesting** and delegation capabilities
- **Collateral management** with liquidation mechanisms
- **Modular architecture** with upgradeable contracts

## 📁 Directory Structure

```
contracts/
├── core/                  # Core governance and merchant contracts
├── escrows/              # Blockchain-specific escrow contracts
│   ├── avax/            # Avalanche escrow implementation
│   ├── polygon/         # Polygon escrow implementation  
│   ├── solana/          # Solana escrow implementation
│   └── aptos/           # Aptos escrow implementation
├── verifiers/           # Regional payment method verifiers
├── interfaces/          # Contract interfaces for modularity
├── security/            # Security infrastructure and auditing
├── oracles/             # Price feed and oracle integration
├── base/                # Base contracts and utilities
└── adapters/            # Cross-chain adapter contracts
```

## 🏛️ Core Contracts (`core/`)

### GovToken.sol
**Enhanced governance token with vesting schedules and delegation tracking**

#### Key Features:
- **Maximum Supply**: 1,000,000,000 tokens
- **Vesting Schedules**: Create time-locked token allocations
- **Delegation Tracking**: Enhanced voting power delegation with history
- **Minting Controls**: Role-based token minting with caps

#### Key Functions:
- `mint(address to, uint256 amount)` - Mint tokens (authorized minters only)
- `createVestingSchedule(address beneficiary, uint256 totalAmount, uint256 startTime, uint256 duration, uint256 cliffDuration)` - Create vesting schedule
- `releaseVestedTokens(address beneficiary)` - Release vested tokens
- `delegate(address delegatee)` - Delegate voting power with tracking
- `getDelegationStats(address account)` - Get delegation statistics

### MerchantGovernance.sol
**Unified governance contract with timelock control and custom operation delays**

#### Governance Parameters:
- **Proposal Threshold**: 1,000 - 100,000 tokens
- **Voting Delay**: 1 - 7 days
- **Voting Period**: 3 - 14 days  
- **Quorum**: 4% - 20%

#### Operation Categories:
- `TREASURY_OPERATION` - Treasury management
- `PROTOCOL_UPGRADE` - Contract upgrades
- `PARAMETER_CHANGE` - Parameter updates
- `EMERGENCY_OPERATION` - Emergency actions
- `MERCHANT_REGISTRY_CHANGE` - Registry modifications

#### Key Functions:
- `propose()` - Create governance proposals
- `castVote()` - Vote on proposals
- `execute()` - Execute approved proposals
- `setCustomDelay()` - Set operation-specific delays

### MerchantCoreRegistry.sol
**ERC721-based merchant registry with KYC and upgradeable architecture**

#### Features:
- **ERC721 Implementation**: Each merchant gets a unique NFT ID
- **Upgradeable Pattern**: UUPS upgradeable with access control
- **KYC Integration**: Built-in KYC verification system
- **Regional Support**: Multi-region merchant onboarding

#### Key Functions:
- `registerMerchant()` - Register new merchant with KYC
- `verifyMerchant()` - Complete merchant verification
- `updateMerchantInfo()` - Update merchant details
- `linkPaymentMethod()` - Link verified payment methods

### CollateralVault.sol
**Collateral management with liquidation mechanisms and instant withdrawal**

#### Features:
- **Multi-token Support**: ETH and ERC20 token collateral
- **Liquidation Thresholds**: Configurable per-token thresholds (default 75%)
- **Instant Withdrawal**: For merchants with sufficient collateral
- **Price Feed Integration**: Chainlink oracle integration

#### Key Functions:
- `depositCollateral()` - Deposit collateral with lock periods
- `withdrawCollateral()` - Withdraw unlocked collateral
- `liquidatePosition()` - Liquidate under-collateralized positions
- `enableInstantWithdrawal()` - Enable instant withdrawal for qualified merchants

## 🔗 Cross-Chain Escrow System (`escrows/`)

### Blockchain-Specific Implementations
Each supported blockchain has its own optimized escrow contract:

#### Avalanche (`escrows/avax/Escrow.sol`)
- **Gas Optimization**: Optimized for Avalanche's low fees
- **Subnet Support**: Compatible with Avalanche subnets
- **Native AVAX**: Support for native AVAX deposits

#### Polygon (`escrows/polygon/`)
- **Layer 2 Optimization**: Optimized for Polygon's scaling
- **MATIC Integration**: Native MATIC token support

#### Solana (`escrows/solana/`)
- **Rust Implementation**: Native Solana program
- **SPL Token Support**: Support for SPL tokens

#### Aptos (`escrows/aptos/`)  
- **Move Language**: Native Move smart contract
- **Aptos Coin Support**: Native APT token integration

### Common Escrow Features
- **Timeout Management**: Configurable escrow timeouts
- **Dispute Resolution**: Built-in dispute mechanisms
- **Fee Management**: Configurable fee structures
- **Multi-confirmation**: Merchant and customer confirmation required

## 🔐 Payment Verification System (`verifiers/`)

### Regional Payment Method Verifiers

#### UPIVerifier.sol - India
**Unified Payments Interface verification for Indian merchants**
- **UPI ID Validation**: Verify UPI IDs and VPAs
- **Bank Integration**: Support for major Indian banks
- **Real-time Verification**: Instant UPI verification

#### PIXVerifier.sol - Brazil  
**PIX payment system verification for Brazilian merchants**
- **PIX Key Validation**: Support for all PIX key types
- **Brazilian Bank Integration**: Integration with Brazilian banking system

#### SEPAVerifier.sol - Europe
**SEPA payment verification for European merchants**
- **IBAN Validation**: IBAN format and checksum validation
- **European Bank Support**: Support for SEPA-enabled banks
- **SWIFT Integration**: Integration with SWIFT network

### Base Verification Infrastructure (`base/BaseVerifier.sol`)
- **Common Verification Logic**: Shared verification patterns
- **Access Control**: Role-based verification permissions
- **Event Logging**: Comprehensive verification event logs

## 🔒 Security Infrastructure (`security/`)

### Security Contracts
- **CircuitBreaker.sol**: Emergency pause mechanisms
- **OracleSecurity.sol**: Oracle price manipulation protection  
- **SecurityAudit.sol**: Automated security checks
- **SecurityUtils.sol**: Common security utilities

## 🔮 Oracle Integration (`oracles/`)

### ChainlinkPriceFeed.sol
**Chainlink oracle integration for price feeds**
- **Multi-asset Support**: ETH, BTC, and major altcoins
- **Price Validation**: Heartbeat and deviation checks
- **Fallback Mechanisms**: Backup price sources

## 🔌 Interface Design (`interfaces/`)

### Clean Interface Segregation
- **IMerchantOperations.sol**: Merchant operation interface
- **IMerchantRegistry.sol**: Registry interface
- **IPaymentVerifier.sol**: Payment verification interface
- **IPriceFeed.sol**: Price feed interface
- **IRegionalRegistry.sol**: Regional registry interface

## 🏭 Factory and Deployment (`core/`)

### EscrowDeploymentFactory.sol
**Factory for deploying cross-chain escrow contracts**
- **Multi-chain Deployment**: Deploy to multiple blockchains
- **Configuration Management**: Centralized escrow configuration
- **Proxy Pattern**: Upgradeable escrow deployments

### EscrowConfigurationManager.sol
**Centralized configuration management for escrow parameters**
- **Parameter Management**: Timeouts, fees, thresholds
- **Multi-chain Sync**: Synchronize configs across chains
- **Governance Integration**: DAO-controlled parameter updates

## 🛠️ Development and Testing

### Contract Compilation
```bash
npx hardhat compile
```

### Contract Testing
```bash
npx hardhat test
```

### Deployment
```bash
# Local deployment
npx hardhat run scripts/deploy-localhost.cjs --network localhost

# Testnet deployment
npx hardhat run scripts/unified-deploy.cjs --network avalanche-fuji

# Mainnet deployment
npx hardhat run scripts/deploy-avalanche-escrow.cjs --network avalanche-mainnet
```

## 🔧 Configuration

### Network Configuration
Networks are configured in `config/chains.json`:
- **Local**: Hardhat local network
- **Testnets**: Avalanche Fuji, Polygon Mumbai
- **Mainnets**: Avalanche, Polygon, Ethereum

### Contract Addresses
Deployed contract addresses are stored in `config/deployed-contracts.json`

## 📋 Usage Examples

### Register a Merchant
```javascript
const merchantRegistry = await ethers.getContractAt("MerchantCoreRegistry", registryAddress);
await merchantRegistry.registerMerchant(
    "Business Name",
    "business@example.com", 
    kycHash
);
```

### Create an Escrow
```javascript
const escrowFactory = await ethers.getContractAt("EscrowDeploymentFactory", factoryAddress);
await escrowFactory.createEscrow(
    merchantId,
    customerAddress,
    amount,
    tokenAddress,
    "avalanche"
);
```

### Verify Payment Method
```javascript
const upiVerifier = await ethers.getContractAt("UPIVerifier", verifierAddress);
await upiVerifier.verifyUPI(
    merchantAddress,
    "user@paytm",
    "user.paytm@paytm"
);
```

## 🚀 Architecture Benefits

### Modular Design
- **Separation of Concerns**: Each contract has a specific responsibility
- **Upgradeable Patterns**: UUPS upgradeable contracts for core components
- **Interface Segregation**: Clean interfaces enable easy integration

### Cross-Chain Support
- **Chain-Specific Optimization**: Tailored implementations per blockchain
- **Unified Interface**: Common interface across all chains
- **Cross-Chain Communication**: Adapters for cross-chain operations

### Security First
- **Multiple Security Layers**: Circuit breakers, oracle security, audit tools
- **Access Control**: Role-based permissions with timelock governance
- **Economic Security**: Collateral requirements and liquidation mechanisms

### Scalability
- **Factory Patterns**: Efficient contract deployment
- **Proxy Upgrades**: Seamless contract upgrades without migration
- **Regional Optimization**: Payment verifiers tailored for local markets

---

*For detailed implementation examples and integration guides, see the individual contract files and the `/docs` directory.*

### MockPriceFeed.sol
**Mock price feed for testing**

### MockUPIRegistry.sol
**Mock UPI registry for testing**

#### Key Functions:
- `setDAO(address _dao)` - Set DAO address
- `approveUPIMethod(string upiId)` - Approve UPI method
- `revokeUPIMethod(string upiId)` - Revoke UPI method
- `authorizeMerchantByDAO(address merchant)` - Authorize merchant

## 🚀 Aptos Contracts (`aptos/`)

### escrow.move
**Move language escrow contract for Aptos blockchain**

## 🔧 Usage Examples

### Deploy Governance System
```javascript
// Deploy governance token
const govToken = await GovToken.deploy("Merchant Gov Token", "MGT", owner);

// Deploy timelock
const timelock = await MerchantTimelock.deploy(minDelay, proposers, executors);

// Deploy DAO
const dao = await MerchantDAO.deploy(
  govToken.address,
  timelock.address,
  votingDelay,
  votingPeriod,
  proposalThreshold,
  quorumPercentage
);
```

### Create Governance Proposal
```javascript
// Propose to add new merchant
const targets = [merchantRegistry.address];
const values = [0];
const calldatas = [merchantRegistry.interface.encodeFunctionData("verifyMerchant", [merchantAddress])];
const description = "Verify new merchant: 0x123...";

await dao.propose(targets, values, calldatas, description);
```

### Register Merchant
```javascript
// Register new merchant
await merchantRegistry.registerMerchant(
  "Merchant Name",
  "merchant@example.com",
  businessHash
);

// Verify merchant (admin only)
await merchantRegistry.verifyMerchant(merchantAddress);
```

## 🔒 Security Considerations

1. **Access Control**: All contracts implement proper role-based access control
2. **Reentrancy Protection**: Critical functions are protected against reentrancy attacks
3. **Oracle Security**: Price feeds are validated and have deviation limits
4. **Emergency Controls**: Pause functionality for emergency situations
5. **Upgrade Safety**: Proxy contracts use safe upgrade patterns
6. **Rate Limiting**: Protection against spam and abuse

## 📊 Gas Optimization

- Contracts are optimized for gas efficiency
- Use of packed structs where possible
- Efficient storage patterns
- Minimal external calls

## 🧪 Testing

All contracts include comprehensive test suites in the `test/` directory:
- Unit tests for individual functions
- Integration tests for contract interactions
- Mock contracts for isolated testing
- Gas usage analysis

## 📝 License

All contracts are licensed under MIT License.

---

*This documentation is auto-generated and reflects the current state of the smart contracts. For the most up-to-date information, please refer to the individual contract files and their inline documentation.*