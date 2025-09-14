# Deployment Guide

This guide provides comprehensive instructions for deploying QuantraPay smart contracts across supported blockchain networks.

## 📋 Prerequisites

### System Requirements
- Node.js v16.0.0 or higher
- npm or yarn package manager
- Git for version control
- At least 4GB RAM for compilation
- Stable internet connection

### Development Environment
```bash
# Install dependencies
npm install

# Verify Hardhat installation
npx hardhat --version

# Check network connectivity
npx hardhat node --help
```

### Required Accounts and Keys

#### Wallet Setup
- **Deployer Account**: Main account for contract deployment
- **Treasury Account**: For governance token distribution
- **Emergency Account**: For emergency operations
- **Oracle Account**: For price feed updates

#### API Keys Required
```bash
# Copy environment template
cp .env.example .env

# Required API keys:
INFURA_PROJECT_ID=your_infura_project_id
ALCHEMY_API_KEY=your_alchemy_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
SNOWTRACE_API_KEY=your_snowtrace_api_key
APTOS_NODE_URL=your_aptos_node_url

# Private keys (use test accounts for development)
DEPLOYER_PRIVATE_KEY=your_deployer_private_key
TREASURY_PRIVATE_KEY=your_treasury_private_key
```

## 🔧 Configuration Setup

### Network Configuration

The system uses a unified configuration file at `config.json`. Ensure it contains:

```json
{
  "networks": {
    "localhost": {
      "url": "http://127.0.0.1:8545",
      "chainId": 31337,
      "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "contracts": {}
    },
    "polygon": {
      "mumbai": {
        "url": "https://polygon-mumbai.infura.io/v3/YOUR_KEY",
        "chainId": 80001,
        "deployer": "YOUR_DEPLOYER_ADDRESS",
        "contracts": {}
      },
      "mainnet": {
        "url": "https://polygon-mainnet.infura.io/v3/YOUR_KEY",
        "chainId": 137,
        "deployer": "YOUR_DEPLOYER_ADDRESS",
        "contracts": {}
      }
    },
    "avalanche": {
      "fuji": {
        "url": "https://api.avax-test.network/ext/bc/C/rpc",
        "chainId": 43113,
        "deployer": "YOUR_DEPLOYER_ADDRESS",
        "contracts": {}
      },
      "mainnet": {
        "url": "https://api.avax.network/ext/bc/C/rpc",
        "chainId": 43114,
        "deployer": "YOUR_DEPLOYER_ADDRESS",
        "contracts": {}
      }
    },
    "aptos": {
      "devnet": {
        "nodeUrl": "https://fullnode.devnet.aptoslabs.com/v1",
        "chainId": 2,
        "deployer": "YOUR_APTOS_ADDRESS",
        "contracts": {}
      }
    }
  }
}
```

## 🚀 Deployment Process

### Step 1: Local Development Deployment

#### Start Local Network
```bash
# Terminal 1: Start Hardhat node
npx hardhat node

# Terminal 2: Deploy contracts
npm run deploy:localhost
```

#### Using the Deployment Script
```bash
# Run the comprehensive deployment
node scripts/final-deploy.cjs
```

This script performs the following steps:
1. **Foundational Contracts**: Base registries and core infrastructure
2. **Core Infrastructure**: KYC, Regional, and Core registries
3. **Governance Setup**: Token, treasury, and governance contracts
4. **UPI Registry & Verifiers**: Payment verification system
5. **Escrow System**: Cross-chain escrow infrastructure
6. **Additional Verifiers**: PIX and SEPA verifiers
7. **System Initialization**: Configure relationships and permissions

### Step 2: Testnet Deployment

#### Polygon Mumbai Testnet
```bash
# Deploy to Polygon Mumbai
npx hardhat run scripts/final-deploy.cjs --network mumbai

# Verify contracts
npx hardhat verify --network mumbai CONTRACT_ADDRESS
```

#### Avalanche Fuji Testnet
```bash
# Deploy to Avalanche Fuji
npx hardhat run scripts/final-deploy.cjs --network fuji

# Verify contracts
npx hardhat verify --network fuji CONTRACT_ADDRESS
```

#### Aptos Devnet
```bash
# Deploy to Aptos Devnet
node contracts/adapters/aptos-adapter.js deploy

# Verify deployment
node contracts/adapters/aptos-adapter.js verify
```

### Step 3: Mainnet Deployment

⚠️ **CRITICAL**: Mainnet deployment requires extra precautions

#### Pre-Deployment Checklist
- [ ] All contracts audited and approved
- [ ] Testnet deployment successful and tested
- [ ] Multi-signature wallets configured
- [ ] Emergency procedures documented
- [ ] Monitoring systems ready
- [ ] Sufficient gas funds available

#### Polygon Mainnet
```bash
# Deploy to Polygon Mainnet
npx hardhat run scripts/final-deploy.cjs --network polygon

# Verify all contracts
npm run verify:polygon
```

#### Avalanche Mainnet
```bash
# Deploy to Avalanche Mainnet
npx hardhat run scripts/final-deploy.cjs --network avalanche

# Verify all contracts
npm run verify:avalanche
```

## 🔄 Post-Deployment Steps

### Step 1: System Initialization

```bash
# Initialize the system with default parameters
node scripts/initialize-system.cjs
```

This script:
- Sets up default regions (India, Brazil, Europe)
- Configures payment verifiers
- Establishes governance parameters
- Initializes treasury settings

### Step 2: Verification and Testing

```bash
# Verify deployment status
node scripts/verify-deployment.cjs

# Run system tests
npm run test:integration

# Check contract interactions
node scripts/test-registration.cjs
```

### Step 3: Monitoring Setup

```bash
# Start event monitoring
node contracts/adapters/event-listener.js

# Configure alerts
node scripts/setup-monitoring.cjs
```

## 📊 Deployment Verification

### Contract Verification Checklist

#### Core Contracts
- [ ] MerchantKYCRegistry deployed and initialized
- [ ] MerchantRegionalRegistry deployed and configured
- [ ] MerchantCoreRegistry deployed and linked
- [ ] CollateralVault deployed with proper permissions
- [ ] UnifiedVerifierManager deployed and configured

#### Governance Contracts
- [ ] GovToken deployed with correct supply
- [ ] MerchantGovernance deployed with proper parameters
- [ ] MerchantTreasury deployed and funded
- [ ] TimelockController configured with delays

#### Verifier Contracts
- [ ] UPIVerifier deployed and registered
- [ ] PIXVerifier deployed and registered
- [ ] SEPAVerifier deployed and registered
- [ ] All verifiers linked to UnifiedVerifierManager

#### Escrow System
- [ ] EscrowDeploymentFactory deployed
- [ ] EscrowConfigurationManager configured
- [ ] Cross-chain adapters deployed
- [ ] Collateral requirements set

### Functional Testing

```bash
# Test merchant registration
node scripts/test-merchant-registration.cjs

# Test payment verification
node scripts/test-payment-verification.cjs

# Test escrow creation
node scripts/test-escrow-creation.cjs

# Test governance voting
node scripts/test-governance.cjs
```

## 🔧 Configuration Management

### Environment-Specific Configurations

#### Development
```json
{
  "environment": "development",
  "debug": true,
  "gasPrice": "auto",
  "confirmations": 1,
  "timeout": 60000
}
```

#### Staging
```json
{
  "environment": "staging",
  "debug": false,
  "gasPrice": "fast",
  "confirmations": 3,
  "timeout": 120000
}
```

#### Production
```json
{
  "environment": "production",
  "debug": false,
  "gasPrice": "standard",
  "confirmations": 5,
  "timeout": 300000
}
```

### Parameter Configuration

#### Governance Parameters
```javascript
const governanceConfig = {
  votingDelay: 1, // 1 block
  votingPeriod: 45818, // ~1 week
  proposalThreshold: ethers.utils.parseEther("1000"), // 1000 tokens
  quorum: 4, // 4% of total supply
  timelockDelay: 172800 // 2 days
};
```

#### Escrow Parameters
```javascript
const escrowConfig = {
  collateralRatio: 150, // 150% collateralization
  liquidationThreshold: 120, // 120% liquidation threshold
  feePercentage: 50, // 0.5% fee
  timeoutPeriod: 86400 // 24 hours
};
```

## 🚨 Emergency Procedures

### Emergency Pause
```bash
# Pause all system operations
node scripts/emergency-pause.cjs

# Pause specific contracts
node scripts/pause-contract.cjs --contract MerchantKYCRegistry
```

### Emergency Upgrade
```bash
# Prepare upgrade
node scripts/prepare-upgrade.cjs --contract CONTRACT_NAME

# Execute upgrade (requires governance approval)
node scripts/execute-upgrade.cjs --contract CONTRACT_NAME
```

### Recovery Procedures
```bash
# Recover from failed deployment
node scripts/recovery-deploy.cjs

# Restore from backup
node scripts/restore-config.cjs --backup BACKUP_FILE
```

## 📈 Gas Optimization

### Deployment Gas Costs (Estimated)

| Contract | Polygon | Avalanche | Estimated USD |
|----------|---------|-----------|---------------|
| MerchantKYCRegistry | ~2.5M gas | ~2.5M gas | $5-15 |
| MerchantRegionalRegistry | ~2.2M gas | ~2.2M gas | $4-12 |
| CollateralVault | ~3.1M gas | ~3.1M gas | $6-18 |
| GovToken | ~1.8M gas | ~1.8M gas | $3-10 |
| MerchantGovernance | ~4.2M gas | ~4.2M gas | $8-25 |
| **Total Estimated** | ~15M gas | ~15M gas | $30-90 |

### Gas Optimization Tips

1. **Batch Deployments**: Deploy multiple contracts in single transaction
2. **Constructor Optimization**: Minimize constructor complexity
3. **Library Usage**: Use libraries for common functions
4. **Gas Price Strategy**: Monitor network conditions

```bash
# Check current gas prices
node scripts/check-gas-prices.cjs

# Deploy with optimized gas
node scripts/deploy-optimized.cjs --gas-price 30
```

## 🔍 Troubleshooting

### Common Issues

#### Deployment Failures
```bash
# Check network connectivity
node scripts/check-network.cjs

# Verify account balances
node scripts/check-balances.cjs

# Debug deployment
node scripts/debug-deployment.cjs
```

#### Configuration Issues
```bash
# Validate configuration
node scripts/validate-config.cjs

# Reset configuration
node scripts/reset-config.cjs

# Backup current state
node scripts/backup-state.cjs
```

#### Contract Interaction Issues
```bash
# Test contract calls
node scripts/test-contracts.cjs

# Check permissions
node scripts/check-permissions.cjs

# Verify initialization
node scripts/verify-initialization.cjs
```

## 📚 Additional Resources

### Documentation Links
- [Hardhat Documentation](https://hardhat.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Polygon Documentation](https://docs.polygon.technology/)
- [Avalanche Documentation](https://docs.avax.network/)
- [Aptos Documentation](https://aptos.dev/)

### Support Channels
- GitHub Issues for bug reports
- Discord for community support
- Email for security concerns

---

*Always test thoroughly on testnets before mainnet deployment. Keep private keys secure and use hardware wallets for production deployments.*