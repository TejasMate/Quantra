# QuantraPay Smart Contracts Documentation

Welcome to the comprehensive documentation for QuantraPay's smart contract ecosystem. This documentation provides detailed information about our multi-chain payment infrastructure, contract architecture, deployment procedures, and usage guidelines.

## 📚 Table of Contents

### Getting Started
- [Architecture Overview](./architecture.md) - High-level system design and component relationships
- [Deployment Guide](./deployment.md) - Step-by-step deployment instructions
- [Testing Guide](./testing.md) - How to run and write tests

### Contract Documentation
- [API Reference](./api-reference.md) - Complete API documentation for all contracts
- [Security Guidelines](./SECURITY.md) - Security best practices and audit information
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

### Network Support
- [UPI Focus Configuration](./UPI_FOCUS_CONFIG.md) - UPI-focused deployment configuration
- [Future Plans](./futureplans.md) - Roadmap and upcoming features

## 🏗️ System Overview

QuantraPay is a comprehensive multi-chain payment infrastructure that enables:

- **Multi-Chain Support**: Native integration with Polygon, Avalanche, and Aptos
- **Payment Verification**: Support for UPI, PIX, and SEPA payment systems
- **Merchant Management**: KYC, regional registration, and governance
- **Escrow Services**: Secure cross-chain escrow with collateral management
- **DAO Governance**: Decentralized decision-making and treasury management

## 🚀 Key Features

### Core Infrastructure
- **MerchantKYCRegistry**: NFT-based merchant identity verification with KYC tokens
- **MerchantRegionalRegistry**: Regional merchant operations and compliance management
- **MerchantCoreRegistry**: Central merchant management and coordination
- **CollateralVault**: Secures escrow operations with collateral management
- **UnifiedVerifierManager**: Coordinates payment verification across chains

### Escrow System
- **EscrowDeploymentFactory**: Creates and manages escrow contracts
- **EscrowConfigurationManager**: Manages escrow configuration and parameters

### Payment Verifiers
- **UPIVerifier**: Indian UPI payment verification (primary focus)
- **PIXVerifier**: Brazilian PIX payment verification (available)
- **SEPAVerifier**: European SEPA payment verification (available)

### Governance & Treasury
- **GovToken**: ERC-20 governance token with voting capabilities and vesting
- **MerchantGovernance**: DAO governance for protocol decisions
- **MerchantTreasury**: Treasury management and fund allocation

### Security & Oracles
- **ChainlinkPriceFeed**: Price feed integration for collateral valuation
- **CircuitBreaker**: Emergency stop functionality
- **SecurityUtils**: Security utilities and access control

## 📋 Prerequisites

Before working with QuantraPay contracts, ensure you have:

- Node.js v16+ installed
- Hardhat development environment
- Access to supported networks (testnet/mainnet)
- Required API keys for external services

## 🔧 Configuration

The system uses a unified configuration approach:

### Main Configuration
- **`config.json`**: Network configurations and contract addresses
- **`.env`**: Environment variables and private keys
- **`hardhat.config.cjs`**: Hardhat network and deployment settings

### Deployment Scripts
- **`deploy-localhost.cjs`**: Complete localhost deployment
- **`deploy-all-localhost.js`**: Alternative deployment script
- **CLI tools**: `cli/quantrapay-cli.js` for system management

### Key Configuration Files
- Network configurations for localhost, Polygon, Avalanche, and Aptos
- Contract addresses and deployment information
- Security settings and access control parameters
- Event processing and monitoring configurations

## 📞 Support

For technical support and questions:

- **Documentation Issues**: Create an issue in the repository
- **Security Concerns**: Contact our security team
- **Integration Help**: Refer to the API documentation and examples

## 📄 License

This project is licensed under the MIT License. See the LICENSE file for details.

---

*Last updated: January 2025*
*Version: 1.0.0*