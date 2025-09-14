# QuantraPay CLI - TypeScript Edition

A comprehensive command-line interface for the QuantraPay Cross-Chain Merchant Escrow Platform, built with TypeScript for enhanced type safety and developer experience.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- **Root `.env` file configured** (in the parent directory)

### Installation & Setup

1. **Configure environment:** Make sure the root `.env` file (in the parent directory) contains:
   ```properties
   NETWORK=localhost
   RPC_URL=http://localhost:8545
   PRIVATE_KEY=your-private-key-here
   DAO_PRIVATE_KEY=your-dao-private-key-here
   ```

2. **Navigate to CLI directory:**
   ```bash
   cd cli
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Build the CLI:**
   ```bash  
   npm run build
   ```

5. **Test the CLI (no parameters needed!):**
   ```bash
   # Network and RPC URL are automatically loaded from root .env
   node dist/index.js dao list-regions
   node dist/index.js merchant list
   ```

## 📋 Available Commands

### 🔧 System Management
```bash
# Initialize CLI configuration
node dist/index.js system init

# Check system status
node dist/index.js system status
```

### 🏪 Merchant Operations
```bash
# Register a new merchant (uses private key from .env)
node dist/index.js merchant register --name "My Business" --region 1 --email "business@example.com"

# Override private key if needed
node dist/index.js merchant register --name "My Business" --region 1 --email "business@example.com" --private-key "your-specific-key"

# Add payment method to merchant  
node dist/index.js merchant add-payment --merchant-id 1 --method "UPI" --identifier "merchant@upi"

# List registered merchants (network auto-loaded from .env)
node dist/index.js merchant list

# Get merchant information
node dist/index.js merchant info --merchant-id 1

# Get merchant info with payment methods and escrows
node dist/index.js merchant info --merchant-id 1 --payment-methods --escrows
```

### 🏛️ DAO Governance

#### Region Management
```bash
# List all regions (network auto-loaded from .env)
node dist/index.js dao list-regions

# Add a new custom region (private key auto-loaded from .env)
node dist/index.js dao add-region --id 200 --name "North America" --stake 100 --max-merchants 1000

# Update an existing custom region
node dist/index.js dao update-region --id 200 --name "North America Updated" --max-merchants 2000

# Remove a custom region
node dist/index.js dao remove-region --id 200
```

#### Stake Management
```bash
# Set custom stake amount for a region (private key auto-loaded)
node dist/index.js dao set-stake --region 1 --stake 50 --enabled true

# Disable stake override for a region
node dist/index.js dao set-stake --region 1 --enabled false
```

#### KYC Bypass Management
```bash
# Set global KYC bypass (private key auto-loaded)
node dist/index.js dao set-kyc-bypass --global true --enabled true

# Set KYC bypass for specific region
node dist/index.js dao set-kyc-bypass --region 1 --enabled true

# Set KYC bypass for specific address
node dist/index.js dao set-kyc-bypass --address "0x..." --enabled true
```

#### Governance Proposals
```bash
# Create a new proposal (private key auto-loaded)
node dist/index.js dao propose --title "Upgrade Contract" --description "Upgrade to v2" --action "upgrade"

# Vote on a proposal
node dist/index.js dao vote --proposal-id 1 --vote "for" --reason "Good proposal"

# Execute a proposal
node dist/index.js dao execute --proposal-id 1

# List all proposals (network auto-loaded)
node dist/index.js dao list

# Get proposal information
node dist/index.js dao info --proposal-id 1

# Delegate voting power
node dist/index.js dao delegate --to "0x..."
```

## 🏗️ Development

### Development Mode
```bash
# Run with TypeScript directly (requires tsx)
npm run dev

# Watch mode for development
npm run build:watch
```

### Type Checking
```bash
npm run typecheck
```

### Build Commands
```bash
# Clean build
npm run clean

# Full build
npm run build
```

## 🎯 TypeScript Features

### ✨ Type Safety Benefits
- **Compile-time validation** - Catch errors before runtime
- **IntelliSense support** - Full auto-completion in IDEs
- **Refactoring safety** - Confident code modifications
- **Self-documenting** - Types serve as documentation

### 🛠️ Enhanced Utilities

#### Type-Safe Configuration Manager
```typescript
import { EnhancedConfigManager } from './utils/enhanced-config-manager.js';

const configManager = new EnhancedConfigManager();
const config = await configManager.loadConfiguration();
```

#### Contract Manager with Type Safety
```typescript
import { TypeSafeContractManager } from './utils/type-safe-contract-manager.js';

const contractManager = new TypeSafeContractManager(network, signer);
const merchant = await contractManager.getMerchant(merchantId);
```

#### Validation with Type Guards
```typescript
import { ValidationUtils } from './utils/validation-utils.js';

const result = ValidationUtils.validateMerchantData(data);
if (result.isValid) {
    // TypeScript knows data is valid here
    await registerMerchant(data);
}
```

## 📁 Project Structure

```
cli/
├── 📁 commands/        # Command implementations
│   ├── merchant-commands.ts  # Merchant operations
│   ├── dao-commands.ts       # DAO governance
│   └── system-commands.ts    # System management
├── 📁 types/           # TypeScript type definitions
│   ├── index.ts        # Main type exports
│   ├── contracts.ts    # Smart contract interfaces
│   └── ethers.ts       # Ethers.js type extensions
├── 📁 utils/           # Enhanced utilities
│   ├── enhanced-config-manager.ts    # Type-safe config
│   ├── type-safe-contract-manager.ts # Contract interactions
│   ├── validation-utils.ts           # Input validation
│   ├── format-utils.ts              # Display formatting
│   ├── network-utils.ts             # Network operations
│   ├── display-utils.ts             # CLI output formatting
│   └── prompt-utils.ts              # User input handling
├── 📁 validators/      # Input validation
│   ├── input-validator.ts           # Main validator
│   └── schemas.ts                   # Validation schemas
├── 📄 index.ts         # Main CLI entry point
├── 📄 tsconfig.json    # TypeScript configuration
├── 📄 package.json     # Dependencies and scripts
├── 📄 build.sh         # Unix build script
└── 📄 build.bat        # Windows build script
```

## 🔧 Configuration

The CLI supports environment-specific configuration:

### Environment Variables
```bash
# Network API keys
export ALCHEMY_API_KEY="your_alchemy_key"
export INFURA_API_KEY="your_infura_key"

# Development settings
export NODE_ENV="development"
export LOG_LEVEL="debug"
```

### Configuration File
The CLI stores configuration in `~/.quantra-cli/config.json`:

```json
{
  "network": "sepolia",
  "privateKey": "0x...",
  "contracts": {
    "merchantRegistry": "0x...",
    "escrowFactory": "0x...",
    "escrowManager": "0x...",
    "daoGovernance": "0x...",
    "govToken": "0x..."
  }
}
```

## 🌐 Supported Networks

### Mainnets
- Ethereum Mainnet
- Polygon
- Binance Smart Chain
- Avalanche C-Chain
- Arbitrum One
- Optimism

### Testnets
- Sepolia
- Goerli (deprecated)
- Polygon Mumbai
- BSC Testnet
- Avalanche Fuji
- Arbitrum Goerli
- Optimism Goerli

### Development
- Localhost (Hardhat/Ganache)
- Custom RPC endpoints

## 🔐 Security Features

### Private Key Management
- Secure storage using OS keychain
- Environment variable support
- Interactive prompts (never logged)

### Input Validation
- Ethereum address validation
- UPI ID format checking
- PIX key validation (Brazil)
- IBAN validation (Europe)
- Business data sanitization

### Network Security
- RPC endpoint validation
- SSL/TLS verification
- Gas price protection

## 🛠️ Troubleshooting

### Common Issues

#### Build Errors
```bash
# Clear cache and rebuild
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### Type Errors
```bash
# Check TypeScript configuration
npm run typecheck

# Update type definitions
npm update @types/node @types/inquirer
```

#### Network Issues
```bash
# Test network connectivity
node dist/index.js network status -n localhost
```

### Debug Mode
```bash
# Enable debug logging
export DEBUG=quantra-cli:*
node dist/index.js <command>
```

## 📚 Examples

### Complete Merchant Registration Flow
```bash
# Initialize CLI (first time setup)
node dist/index.js system init

# Check system status (network auto-detected from .env)
node dist/index.js system status

# Register merchant (private key auto-loaded from .env)
node dist/index.js merchant register --name "My Business" --region 1 --email "business@example.com"

# Add UPI payment method
node dist/index.js merchant add-payment --merchant-id 1 --method "UPI" --identifier "merchant@upi"

# List all merchants
node dist/index.js merchant list

# Get merchant details
node dist/index.js merchant info --merchant-id 1 --payment-methods
```

### DAO Governance Workflow
```bash
# List available regions (network auto-loaded)
node dist/index.js dao list-regions

# Add a custom region for your business area (private key auto-loaded)
node dist/index.js dao add-region --id 150 --name "Southeast Asia" --stake 75 --max-merchants 500

# Set custom stake amount for Europe region
node dist/index.js dao set-stake --region 2 --stake 120

# Enable global KYC bypass for testing
node dist/index.js dao set-kyc-bypass --global true --enabled true

# Create a governance proposal
node dist/index.js dao propose --title "Increase Stake Requirements" --description "Increase minimum stake to 200 ETH" --action "parameter"

# Vote on the proposal
node dist/index.js dao vote --proposal-id 1 --vote "for" --reason "Better security"

# List all proposals to check status
node dist/index.js dao list
```

### Testing with Hardhat Localhost
```bash
# Make sure Hardhat node is running on localhost:8545
# The CLI automatically loads network and RPC URL from root .env file

# Simple commands (no network parameters needed!)
node dist/index.js dao list-regions
node dist/index.js merchant list

# Commands with transactions (private key auto-loaded from .env)
node dist/index.js dao add-region --id 101 --name "Test Region" --stake 10 --max-merchants 100

# Override private key if needed
node dist/index.js dao add-region --id 102 --name "Another Region" --stake 20 --max-merchants 200 --private-key "your-specific-key"
```

### 🌍 Environment Configuration

The CLI automatically loads configuration from the root `.env` file:

- **NETWORK**: Target blockchain network (localhost, sepolia, etc.)
- **RPC_URL**: RPC endpoint URL  
- **PRIVATE_KEY**: Default private key for transactions
- **DAO_PRIVATE_KEY**: Private key for DAO operations
- **MERCHANT_PRIVATE_KEYS**: Array of merchant private keys
- **MERCHANT_ADDRESSES**: Array of merchant addresses

**Benefits:**
- ✅ No need to specify `--network` for every command
- ✅ No need to specify `--private-key` for transactions  
- ✅ Consistent configuration across all CLI commands
- ✅ Easy switching between networks by updating .env

## 🤝 Contributing

1. Follow TypeScript best practices
2. Add type definitions for new features
3. Update documentation
4. Test on multiple platforms

## 📝 License

MIT License - see LICENSE file for details.

---

**Built with TypeScript for the QuantraPay Cross-Chain Merchant Escrow Platform** 🎯