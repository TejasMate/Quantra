# API Reference

Complete API documentation for QuantraPay smart contracts, including all public functions, events, and data structures.

## 📋 Table of Contents

- [Core Contracts](#core-contracts)
- [Registry System](#registry-system)
- [Payment Verifiers](#payment-verifiers)
- [Escrow System](#escrow-system)
- [Governance Contracts](#governance-contracts)
- [Utility Contracts](#utility-contracts)
- [Events Reference](#events-reference)
- [Error Codes](#error-codes)

## 🏗️ Core Contracts

### MerchantKYCRegistry

NFT-based merchant identity verification and KYC compliance system.

#### Functions

##### `verifyMerchant(address merchant, uint8 kycLevel, string memory businessDetails)`

Verifies a merchant and mints a KYC NFT token.

**Parameters:**
- `merchant` (address): The merchant's wallet address
- `kycLevel` (uint8): KYC compliance level (1-5)
- `businessDetails` (string): JSON string containing business information

**Returns:**
- `uint256`: The minted KYC token ID

**Access Control:** Only authorized verifiers

**Events Emitted:** `KYCVerified(merchant, tokenId, kycLevel)`

**Example:**
```solidity
uint256 tokenId = merchantKYC.verifyMerchant(
    0x742d35Cc6634C0532925a3b8D0C9e3e7c4FD5d3e,
    3,
    '{"name":"Coffee Shop","location":"Mumbai"}'
);
```

##### `updateKYCLevel(uint256 tokenId, uint8 newLevel)`

Updates the KYC level for an existing KYC token.

**Parameters:**
- `tokenId` (uint256): The KYC token ID
- `newLevel` (uint8): New KYC compliance level

**Access Control:** Only authorized verifiers

**Events Emitted:** `KYCLevelUpdated(tokenId, newLevel)`

##### `getMerchantKYC(address merchant)`

Retrieves KYC information for a merchant.

**Parameters:**
- `merchant` (address): The merchant's wallet address

**Returns:**
- `KYCData`: Struct containing kycLevel, businessDetails, isVerified, verificationTimestamp, and verifier

##### `getKYCTokenId(address merchant)`

Gets the KYC token ID for a merchant.

**Parameters:**
- `merchant` (address): The merchant's wallet address

**Returns:**
- `uint256`: The KYC token ID (0 if not verified)

##### `suspendMerchant(uint256 tokenId)`

Suspends a merchant's KYC token.

**Parameters:**
- `tokenId` (uint256): The KYC token ID

**Access Control:** Only authorized verifiers or owner

**Events Emitted:** `MerchantSuspended(tokenId)`

### MerchantRegionalRegistry

Manages regional merchant operations and compliance with enhanced features.

#### Functions

##### `registerRegionalMerchant(address merchant, string memory region, bytes memory complianceData)`

Registers a merchant for regional operations.

**Parameters:**
- `merchant` (address): The merchant's wallet address
- `region` (string): Regional identifier (e.g., "IN", "BR", "EU")
- `complianceData` (bytes): Region-specific compliance information

**Returns:**
- `bool`: Success status

**Access Control:** Only authorized regional managers

**Events Emitted:** `RegionalMerchantRegistered(merchant, region)`

##### `getRegionalStatus(address merchant, string memory region)`

Checks merchant's regional operation status.

**Parameters:**
- `merchant` (address): The merchant's wallet address
- `region` (string): Regional identifier

**Returns:**
- `bool`: Registration status
- `bytes`: Compliance data
- `uint256`: Registration timestamp

##### `updateRegionalCompliance(address merchant, string memory region, bytes memory newComplianceData)`

Updates regional compliance data for a merchant.

**Parameters:**
- `merchant` (address): The merchant's wallet address
- `region` (string): Regional identifier
- `newComplianceData` (bytes): Updated compliance information

**Access Control:** Only authorized regional managers

##### `suspendRegionalOperations(address merchant, string memory region)`

Suspends merchant operations in a specific region.

**Parameters:**
- `merchant` (address): The merchant's wallet address
- `region` (string): Regional identifier

**Access Control:** Only authorized regional managers or owner

### CollateralVault

Manages collateral for escrow operations.

#### Functions

##### `depositCollateral(address token, uint256 amount)`
Deposits collateral tokens.

**Parameters:**
- `token` (address): Token contract address
- `amount` (uint256): Amount to deposit

**Returns:**
- `uint256`: Collateral ID

##### `withdrawCollateral(uint256 collateralId, uint256 amount)`
Withdraws collateral tokens.

**Parameters:**
- `collateralId` (uint256): Collateral position ID
- `amount` (uint256): Amount to withdraw

##### `getCollateralBalance(address user, address token)`
Returns user's collateral balance.

**Returns:**
- `uint256`: Available collateral amount

##### `liquidateCollateral(uint256 collateralId, uint256 amount)`
Liquidates collateral for escrow settlement.

**Access Control:** Escrow contracts only

## 🗂️ Registry System

### MerchantCoreRegistry

Central merchant management and coordination.

#### Functions

##### `createMerchantProfile(address merchant, string name, string businessType)`
Creates comprehensive merchant profile.

**Parameters:**
- `merchant` (address): Merchant wallet address
- `name` (string): Business name
- `businessType` (string): Type of business

##### `getMerchantProfile(address merchant)`
Retrieves complete merchant profile.

**Returns:**
- `name` (string): Business name
- `businessType` (string): Business type
- `kycLevel` (uint8): KYC verification level
- `regionalRegistrations` (string[]): Registered regions
- `isActive` (bool): Account status
- `creationTime` (uint256): Profile creation time

##### `linkRegistries(address kycRegistry, address regionalRegistry)`
Links external registry contracts.

**Access Control:** Owner only

## 💳 Payment Verifiers

### UnifiedVerifierManager

Central manager for coordinating payment verification across different payment methods and chains.

#### Functions

##### `verifyPayment(string memory paymentMethod, bytes memory verificationData)`

Routes payment verification to the appropriate verifier contract.

**Parameters:**
- `paymentMethod` (string): Payment method identifier ("UPI", "PIX", "SEPA")
- `verificationData` (bytes): Encoded verification parameters

**Returns:**
- `bool`: Verification result
- `bytes32`: Transaction hash

**Events Emitted:** `PaymentVerified(paymentMethod, transactionHash, merchant, amount)`

##### `registerVerifier(string memory paymentMethod, address verifierContract)`

Registers a new payment verifier contract.

**Parameters:**
- `paymentMethod` (string): Payment method identifier
- `verifierContract` (address): Verifier contract address

**Access Control:** Only owner

##### `getVerifier(string paymentType, string region)`
Returns verifier address for payment type and region.

**Returns:**
- `address`: Verifier contract address

### UPIVerifier

Verifies Indian UPI (Unified Payments Interface) transactions (primary focus).

#### Functions

##### `verifyUPIPayment(string memory upiId, uint256 amount, address merchant, string memory transactionRef, bytes memory proof)`

Verifies a UPI payment transaction with enhanced parameters.

**Parameters:**
- `upiId` (string): UPI ID of the payer
- `amount` (uint256): Payment amount in paisa (smallest unit)
- `merchant` (address): Merchant's wallet address
- `transactionRef` (string): UPI transaction reference
- `proof` (bytes): Payment verification proof from UPI network

**Returns:**
- `bool`: Verification result
- `bytes32`: Transaction hash

**Events Emitted:** `UPIPaymentVerified(upiId, merchant, amount, transactionRef)`

##### `setUPIOracle(address oracleAddress)`

Sets the UPI oracle for payment verification.

**Parameters:**
- `oracleAddress` (address): Oracle contract address

**Access Control:** Only owner

##### `getVerificationStatus(bytes32 verificationHash)`
Checks verification status.

**Returns:**
- `status` (uint8): Verification status (0=Pending, 1=Verified, 2=Failed)
- `timestamp` (uint256): Verification time
- `amount` (uint256): Verified amount

### PIXVerifier

Verifies Brazilian PIX instant payments.

#### Functions

##### `verifyPIXPayment(string memory pixKey, uint256 amount, address merchant, string memory endToEndId, bytes memory proof)`

Verifies a PIX payment transaction.

**Parameters:**
- `pixKey` (string): PIX key identifier
- `amount` (uint256): Payment amount in centavos
- `merchant` (address): Merchant's wallet address
- `endToEndId` (string): PIX end-to-end identifier
- `proof` (bytes): Bank verification proof

**Returns:**
- `bool`: Verification result
- `bytes32`: Transaction hash

### SEPAVerifier

Verifies European SEPA (Single Euro Payments Area) transactions.

#### Functions

##### `verifySEPAPayment(string memory iban, uint256 amount, address merchant, string memory reference, bytes memory proof)`

Verifies a SEPA payment transaction.

**Parameters:**
- `iban` (string): International Bank Account Number
- `amount` (uint256): Payment amount in euro cents
- `merchant` (address): Merchant's wallet address
- `reference` (string): Payment reference
- `proof` (bytes): Bank verification proof

**Returns:**
- `bool`: Verification result
- `bytes32`: Transaction hash

## 🔒 Escrow System

### EscrowDeploymentFactory

Factory contract for creating and managing escrow contracts across different chains.

#### Functions

##### `createEscrow(address merchant, address customer, uint256 amount, string memory paymentMethod, bytes memory escrowParams)`

Creates a new escrow contract instance.

**Parameters:**
- `merchant` (address): Merchant's wallet address
- `customer` (address): Customer's wallet address  
- `amount` (uint256): Escrow amount
- `paymentMethod` (string): Payment method identifier (e.g., "UPI", "PIX")
- `escrowParams` (bytes): Additional escrow configuration parameters

**Returns:**
- `address`: Address of the created escrow contract

**Events Emitted:** `EscrowCreated(escrowAddress, merchant, customer, amount)`

##### `getEscrowsForMerchant(address merchant)`

Retrieves all escrow contracts for a specific merchant.

**Parameters:**
- `merchant` (address): Merchant's wallet address

**Returns:**
- `address[]`: Array of escrow contract addresses

##### `getEscrowConfiguration(address escrowContract)`

Gets configuration details for an escrow contract.

**Parameters:**
- `escrowContract` (address): Escrow contract address

**Returns:**
- `EscrowConfig`: Configuration struct with timeout, fees, and other parameters

### EscrowConfigurationManager

Manages global escrow configuration and parameters.

#### Functions

##### `setEscrowTimeout(uint256 timeoutSeconds)`

Sets the default escrow timeout period.

**Parameters:**
- `timeoutSeconds` (uint256): Timeout in seconds

**Access Control:** Only owner

##### `setEscrowFee(uint256 feePercentage)`

Sets the escrow service fee percentage.

**Parameters:**
- `feePercentage` (uint256): Fee percentage (basis points)

**Access Control:** Only owner

##### `authorizeEscrowDeployer(address deployer)`

Authorizes an address to deploy escrow contracts.

**Parameters:**
- `deployer` (address): Address to authorize

**Access Control:** Only owner

##### `getEscrowFee()`
Returns current escrow fee percentage.

**Returns:**
- `uint256`: Fee percentage in basis points

## 🏛️ Governance Contracts

### GovToken

ERC-20 governance token with voting capabilities.

#### Functions

##### `delegate(address delegatee)`
Delegates voting power to another address.

**Parameters:**
- `delegatee` (address): Address to delegate votes to

##### `getCurrentVotes(address account)`
Returns current voting power of account.

**Returns:**
- `uint256`: Current vote count

##### `getPriorVotes(address account, uint256 blockNumber)`
Returns historical voting power at specific block.

**Parameters:**
- `account` (address): Account to check
- `blockNumber` (uint256): Block number for historical lookup

**Returns:**
- `uint256`: Vote count at specified block

### MerchantGovernance

DAO governance contract for protocol decisions.

#### Functions

##### `propose(address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, string description)`
Creates new governance proposal.

**Parameters:**
- `targets` (address[]): Target contract addresses
- `values` (uint256[]): ETH values to send
- `signatures` (string[]): Function signatures to call
- `calldatas` (bytes[]): Encoded function call data
- `description` (string): Proposal description

**Returns:**
- `uint256`: Proposal ID

##### `castVote(uint256 proposalId, uint8 support)`
Casts vote on proposal.

**Parameters:**
- `proposalId` (uint256): ID of proposal to vote on
- `support` (uint8): Vote type (0=Against, 1=For, 2=Abstain)

##### `execute(uint256 proposalId)`
Executes successful proposal.

**Parameters:**
- `proposalId` (uint256): ID of proposal to execute

##### `getProposal(uint256 proposalId)`
Retrieves proposal details.

**Returns:**
- `proposer` (address): Proposal creator
- `eta` (uint256): Execution time
- `startBlock` (uint256): Voting start block
- `endBlock` (uint256): Voting end block
- `forVotes` (uint256): Votes in favor
- `againstVotes` (uint256): Votes against
- `abstainVotes` (uint256): Abstain votes
- `canceled` (bool): Cancellation status
- `executed` (bool): Execution status

### MerchantTreasury

Treasury management and fund allocation.

#### Functions

##### `allocateFunds(address recipient, uint256 amount, address token)`
Allocates treasury funds.

**Parameters:**
- `recipient` (address): Fund recipient
- `amount` (uint256): Amount to allocate
- `token` (address): Token to allocate

**Access Control:** Governance only

##### `getTreasuryBalance(address token)`
Returns treasury balance for token.

**Returns:**
- `uint256`: Token balance

## 📡 Events Reference

### Core Events

#### MerchantRegistered
```solidity
event MerchantRegistered(
    address indexed merchant,
    uint8 kycLevel,
    uint256 timestamp
);
```

#### RegionalRegistration
```solidity
event RegionalRegistration(
    address indexed merchant,
    string indexed region,
    uint256 timestamp
);
```

#### PaymentVerified
```solidity
event PaymentVerified(
    bytes32 indexed verificationHash,
    address indexed verifier,
    uint256 amount,
    string paymentType
);
```

#### EscrowCreated
```solidity
event EscrowCreated(
    address indexed escrowContract,
    address indexed buyer,
    address indexed seller,
    uint256 amount,
    address token
);
```

#### ProposalCreated
```solidity
event ProposalCreated(
    uint256 indexed proposalId,
    address indexed proposer,
    string description
);
```

#### VoteCast
```solidity
event VoteCast(
    address indexed voter,
    uint256 indexed proposalId,
    uint8 support,
    uint256 weight
);
```

## ❌ Error Codes

### Common Errors

| Code | Name | Description |
|------|------|-------------|
| `KYC001` | `InsufficientKYCLevel` | Merchant KYC level too low for operation |
| `KYC002` | `MerchantNotRegistered` | Merchant not found in registry |
| `KYC003` | `MerchantSuspended` | Merchant account is suspended |
| `REG001` | `RegionNotSupported` | Region not supported by system |
| `REG002` | `RegionalComplianceRequired` | Regional compliance documentation required |
| `VER001` | `PaymentVerificationFailed` | Payment could not be verified |
| `VER002` | `VerifierNotRegistered` | Payment verifier not registered |
| `VER003` | `InvalidPaymentData` | Payment data format invalid |
| `ESC001` | `InsufficientCollateral` | Not enough collateral for escrow |
| `ESC002` | `EscrowExpired` | Escrow has exceeded timeout |
| `ESC003` | `EscrowAlreadySettled` | Escrow already completed |
| `GOV001` | `InsufficientVotingPower` | Not enough tokens to create proposal |
| `GOV002` | `ProposalNotActive` | Proposal not in voting period |
| `GOV003` | `QuorumNotReached` | Insufficient votes for proposal |

### Error Handling Examples

```solidity
// Handling KYC errors
try kycRegistry.registerMerchant(merchant, level, hash) {
    // Success
} catch Error(string memory reason) {
    if (keccak256(bytes(reason)) == keccak256("KYC001")) {
        // Handle insufficient KYC level
    }
}

// Handling verification errors
try verifier.verifyPayment(data) returns (bool success, bytes32 hash) {
    if (!success) {
        // Handle verification failure
    }
} catch {
    // Handle contract call failure
}
```

## 🔧 Integration Examples

### JavaScript/Web3.js Integration

```javascript
const Web3 = require('web3');
const web3 = new Web3('https://polygon-rpc.com');

// Contract ABI and address
const kycRegistryABI = [...]; // Contract ABI
const kycRegistryAddress = '0x...';

const kycRegistry = new web3.eth.Contract(kycRegistryABI, kycRegistryAddress);

// Register merchant
async function registerMerchant(merchantAddress, kycLevel, documentHash) {
    try {
        const result = await kycRegistry.methods
            .registerMerchant(merchantAddress, kycLevel, documentHash)
            .send({ from: operatorAddress });
        
        console.log('Merchant registered:', result.transactionHash);
        return result;
    } catch (error) {
        console.error('Registration failed:', error.message);
        throw error;
    }
}

// Listen for events
kycRegistry.events.MerchantRegistered({
    fromBlock: 'latest'
}, (error, event) => {
    if (error) {
        console.error('Event error:', error);
        return;
    }
    
    console.log('New merchant registered:', {
        merchant: event.returnValues.merchant,
        kycLevel: event.returnValues.kycLevel,
        timestamp: event.returnValues.timestamp
    });
});
```

### Python/Web3.py Integration

```python
from web3 import Web3
import json

# Connect to network
w3 = Web3(Web3.HTTPProvider('https://polygon-rpc.com'))

# Load contract
with open('KYCRegistry.json', 'r') as f:
    contract_data = json.load(f)

kyc_registry = w3.eth.contract(
    address='0x...',
    abi=contract_data['abi']
)

# Register merchant
def register_merchant(merchant_address, kyc_level, document_hash):
    try:
        tx_hash = kyc_registry.functions.registerMerchant(
            merchant_address,
            kyc_level,
            document_hash
        ).transact({'from': operator_address})
        
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"Merchant registered: {receipt.transactionHash.hex()}")
        return receipt
    except Exception as e:
        print(f"Registration failed: {str(e)}")
        raise

# Event filtering
event_filter = kyc_registry.events.MerchantRegistered.createFilter(
    fromBlock='latest'
)

for event in event_filter.get_new_entries():
    print(f"New merchant: {event['args']['merchant']}")
```

---

*This API reference covers all public interfaces. For internal functions and implementation details, refer to the contract source code.*