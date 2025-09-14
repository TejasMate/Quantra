import { ValidationUtils } from './validation-utils.js';
import { FormattingUtils } from './formatting-utils.js';
import { TypeSafeEnhancedConfigManager } from './enhanced-config-manager.js';
import { config } from 'dotenv';
import { GlobalOptions, ValidationResult, ValidationError, ContractInfo } from '../types/index.js';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file (two levels up from utils)
config({ path: '../../.env' });

interface TypeSafeContractOptions {
    validateOnLoad?: boolean;
    strictTypeChecking?: boolean;
    enableEventListeners?: boolean;
}

export class TypeSafeContractManager {
    private options: TypeSafeContractOptions;
    private contractValidations: Map<string, ValidationResult>;
    private eventListeners: Map<string, ethers.Listener[]>;
    private provider: ethers.Provider | null = null;
    private signer: ethers.Signer | null = null;
    private contracts: Map<string, ethers.Contract> = new Map();
    private network: string = '';
    private configManager: TypeSafeEnhancedConfigManager | null = null;
    private networkName: string | null = null;
    private networkConfig: any = null;
    private deploymentInfo: any = null;
    private nonceCache: Map<string, number> = new Map();
    private currentNetwork: string = '';
    
    // Contract name constants
    private readonly contractNames = {
        MERCHANT_CORE_REGISTRY: 'MerchantCoreRegistry',
        MERCHANT_REGIONAL_REGISTRY: 'MerchantRegionalRegistry',
        MERCHANT_KYC_REGISTRY: 'MerchantKYCRegistry',
        MERCHANT_PAYMENT_METHODS: 'MerchantPaymentMethods',
        ESCROW_DEPLOYMENT_FACTORY: 'EscrowDeploymentFactory',
        ESCROW_CONFIGURATION_MANAGER: 'EscrowConfigurationManager',
        UNIFIED_VERIFIER_MANAGER: 'UnifiedVerifierManager',
        UPI_VERIFIER: 'UPIVerifier',
        SEPA_VERIFIER: 'SEPAVerifier',
        PIX_VERIFIER: 'PIXVerifier',
        MERCHANT_GOVERNANCE: 'MerchantGovernance',
        MERCHANT_GOVERNANCE_CONTROLLER: 'MerchantGovernanceController',
        MERCHANT_TREASURY: 'MerchantTreasury',
        GOV_TOKEN: 'GovToken',
        COLLATERAL_VAULT: 'CollateralVault',
        CHAINLINK_PRICE_FEED: 'ChainlinkPriceFeed'
    };

    private logger = {
        info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
        error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
        warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args)
    };

    constructor(options: TypeSafeContractOptions = {}) {
        this.options = {
            validateOnLoad: true,
            strictTypeChecking: true,
            enableEventListeners: false,
            ...options
        };
        this.contractValidations = new Map();
        this.eventListeners = new Map();
        this.configManager = new TypeSafeEnhancedConfigManager();
    }

    async initialize(network?: string, privateKey?: string | null): Promise<boolean> {
        try {
            // Initialize config manager first
            this.configManager = new TypeSafeEnhancedConfigManager();
            await this.configManager.initialize();
            
            // Get configuration from environment variables
            const envNetwork = process.env.NETWORK || 'localhost';
            const envRpcUrl = process.env.RPC_URL || 'http://localhost:8545';
            const envPrivateKey = process.env.PRIVATE_KEY;
            
            // Use parameters if provided, otherwise use .env values
            this.network = network || envNetwork;
            this.networkName = this.network;
            this.currentNetwork = this.network;
            
            // Load network configuration
            await this.loadNetworkConfig(this.network);
            
            // Initialize provider using RPC URL from .env or config
            const rpcUrl = envRpcUrl || this.networkConfig?.url || 'http://localhost:8545';
            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            
            // Initialize signer using private key from parameter or .env
            const keyToUse = privateKey || envPrivateKey;
            if (keyToUse && this.provider) {
                this.signer = new ethers.Wallet(keyToUse, this.provider);
                
                // Initialize nonce cache for the signer
                const signerAddress = await this.signer.getAddress();
                await this.resetNonce(signerAddress);
            }
            
            // Load deployment info and initialize contracts
            await this.loadDeploymentInfo(this.network);
            await this.initializeContracts();
            
            if (this.options.validateOnLoad) {
                await this.validateAllContracts();
            }
            
            this.logger.info(`Initialized TypeSafeContractManager for network: ${this.network}`);
            this.logger.info(`RPC URL: ${rpcUrl}`);
            if (this.signer) {
                const signerAddress = await this.signer.getAddress();
                this.logger.info(`Signer address: ${signerAddress}`);
            }
            
            return true;
        } catch (error) {
            FormattingUtils.printError(`TypeSafe contract manager initialization failed: ${(error as Error).message}`);
            throw error;
        }
    }

    async loadNetworkConfig(network: string): Promise<void> {
        try {
            const configPath = path.join(__dirname, '../../../config.json');
            const configData = await fs.promises.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);
            
            this.networkConfig = config.networks[network];
            if (!this.networkConfig) {
                this.logger.warn(`Network config not found for ${network}, using defaults`);
                this.networkConfig = {
                    name: network,
                    url: 'http://127.0.0.1:8545',
                    chainId: 31337,
                    accounts: {
                        mnemonic: 'test test test test test test test test test test test junk'
                    }
                };
            } else {
                this.networkConfig.name = network;
            }
        } catch (error) {
            // Fallback to default localhost config
            this.networkConfig = {
                name: network,
                url: 'http://127.0.0.1:8545',
                chainId: 31337,
                accounts: {
                    mnemonic: 'test test test test test test test test test test test junk'
                }
            };
        }
    }

    async loadDeploymentInfo(network: string): Promise<void> {
        try {
            // Use contracts.json as primary source for contract addresses
            const contractsPath = path.join(__dirname, '../../../contracts.json');
            const contractsData = await fs.promises.readFile(contractsPath, 'utf8');
            const config = JSON.parse(contractsData);
            
            // Extract deployment info from contracts.json structure
            if (config.networks && config.networks[network]) {
                this.deploymentInfo = config.networks[network];
                this.logger.info(`Loaded deployment info for ${network} from contracts.json`);
            } else {
                this.logger.warn(`No deployment info found for network: ${network}`);
                this.deploymentInfo = { contracts: {} };
            }
        } catch (error) {
            this.logger.warn(`Failed to load deployment info: ${(error as Error).message}`);
            this.deploymentInfo = { contracts: {} };
        }
    }

    async initializeContracts(): Promise<void> {
        if (!this.deploymentInfo) {
            this.logger.warn('No deployment info available for contract initialization');
            return;
        }

        // Handle both old format (with contracts object) and new format (direct addresses)
        const contractAddresses = this.deploymentInfo.contracts || this.deploymentInfo;
        
        // Load contract ABIs and initialize contract instances for deployed contracts
        const availableContracts = [
            'MerchantCoreRegistry',
            'MerchantRegionalRegistry',
            'MerchantKYCRegistry',
            'MerchantPaymentMethods',
            'MerchantGovernance',
            'MerchantTreasury',
            'CollateralVault',
            'GovToken',
            'EscrowConfigurationManager',
            'EscrowDeploymentFactory',
            'ChainlinkPriceFeed',
            'SecurityAudit',
            'UnifiedVerifierManager',
            'UPIVerifier',
            'SEPAVerifier',
            'PIXVerifier'
        ];
        
        for (const contractName of availableContracts) {
            try {
                if (contractAddresses[contractName]) {
                    const contractAddress = typeof contractAddresses[contractName] === 'string' 
                        ? contractAddresses[contractName] 
                        : contractAddresses[contractName].address;
                    
                    if (contractAddress && ethers.isAddress(contractAddress)) {
                        await this.loadContract(contractName, contractAddress);
                        this.logger.info(`Loaded contract ${contractName} at ${contractAddress}`);
                    }
                }
            } catch (error) {
                this.logger.warn(`Failed to load contract ${contractName}: ${(error as Error).message}`);
            }
        }
    }

    // Essential methods needed by command classes
    getSigner(): ethers.Signer | null {
        return this.signer;
    }

    getProvider(): ethers.Provider | null {
        return this.provider;
    }

    getContract(contractName: string): ethers.Contract | null {
        let contract = this.contracts.get(contractName);
        
        // Handle fallback mapping for MerchantDAO -> MerchantGovernance
        if (contractName === 'MerchantDAO') {
            contract = this.contracts.get('MerchantGovernance');
        }
        
        if (!contract) {
            this.logger.warn(`Contract ${contractName} not found or not loaded`);
            return null;
        }
        return contract;
    }

    getAllContracts(): Map<string, ethers.Contract> {
        return this.contracts;
    }

    // Helper methods for specific contract types
    async getMerchantCoreRegistry(): Promise<ethers.Contract | null> {
        if (!this.contracts.has(this.contractNames.MERCHANT_CORE_REGISTRY)) {
            await this.loadContract(this.contractNames.MERCHANT_CORE_REGISTRY);
        }
        return this.contracts.get(this.contractNames.MERCHANT_CORE_REGISTRY) || null;
    }
    
    async getMerchantRegionalRegistry(): Promise<ethers.Contract | null> {
        if (!this.contracts.has(this.contractNames.MERCHANT_REGIONAL_REGISTRY)) {
            await this.loadContract(this.contractNames.MERCHANT_REGIONAL_REGISTRY);
        }
        return this.contracts.get(this.contractNames.MERCHANT_REGIONAL_REGISTRY) || null;
    }
    
    async getMerchantKYCRegistry(): Promise<ethers.Contract | null> {
        if (!this.contracts.has(this.contractNames.MERCHANT_KYC_REGISTRY)) {
            await this.loadContract(this.contractNames.MERCHANT_KYC_REGISTRY);
        }
        return this.contracts.get(this.contractNames.MERCHANT_KYC_REGISTRY) || null;
    }
    
    async getMerchantPaymentMethods(): Promise<ethers.Contract | null> {
        if (!this.contracts.has(this.contractNames.MERCHANT_PAYMENT_METHODS)) {
            await this.loadContract(this.contractNames.MERCHANT_PAYMENT_METHODS);
        }
        return this.contracts.get(this.contractNames.MERCHANT_PAYMENT_METHODS) || null;
    }
    
    async getEscrowDeploymentFactory(): Promise<ethers.Contract | null> {
        if (!this.contracts.has(this.contractNames.ESCROW_DEPLOYMENT_FACTORY)) {
            await this.loadContract(this.contractNames.ESCROW_DEPLOYMENT_FACTORY);
        }
        return this.contracts.get(this.contractNames.ESCROW_DEPLOYMENT_FACTORY) || null;
    }
    
    async getUnifiedVerifierManager(): Promise<ethers.Contract | null> {
        if (!this.contracts.has(this.contractNames.UNIFIED_VERIFIER_MANAGER)) {
            await this.loadContract(this.contractNames.UNIFIED_VERIFIER_MANAGER);
        }
        return this.contracts.get(this.contractNames.UNIFIED_VERIFIER_MANAGER) || null;
    }
    
    async getMerchantGovernance(): Promise<ethers.Contract | null> {
        if (!this.contracts.has(this.contractNames.MERCHANT_GOVERNANCE)) {
            await this.loadContract(this.contractNames.MERCHANT_GOVERNANCE);
        }
        return this.contracts.get(this.contractNames.MERCHANT_GOVERNANCE) || null;
    }
    
    async getGovToken(): Promise<ethers.Contract | null> {
        if (!this.contracts.has(this.contractNames.GOV_TOKEN)) {
            await this.loadContract(this.contractNames.GOV_TOKEN);
        }
        return this.contracts.get(this.contractNames.GOV_TOKEN) || null;
    }
    
    async getCollateralVault(): Promise<ethers.Contract | null> {
        if (!this.contracts.has(this.contractNames.COLLATERAL_VAULT)) {
            await this.loadContract(this.contractNames.COLLATERAL_VAULT);
        }
        return this.contracts.get(this.contractNames.COLLATERAL_VAULT) || null;
    }

    getNetworkConfig(): any {
        return this.networkConfig;
    }

    getDeploymentInfo(): any {
        return this.deploymentInfo;
    }

    async getContractAddress(contractName: string): Promise<string> {
        if (!this.deploymentInfo || !this.deploymentInfo.contracts) {
            throw new Error('No deployment info loaded');
        }

        const contractInfo = this.deploymentInfo.contracts[contractName];
        if (!contractInfo) {
            throw new Error(`Contract ${contractName} not found in deployment info`);
        }

        return typeof contractInfo === 'string' ? contractInfo : contractInfo.address;
    }

    async getBlockNumber(): Promise<number> {
        if (!this.provider) throw new Error('Provider not initialized');
        return await this.provider.getBlockNumber();
    }

    async getGasPrice(): Promise<bigint | null> {
        if (!this.provider) throw new Error('Provider not initialized');
        const feeData = await this.provider.getFeeData();
        return feeData.gasPrice;
    }

    async getBalance(address: string, tokenAddress?: string): Promise<bigint> {
        if (!this.provider) throw new Error('Provider not initialized');
        
        if (tokenAddress) {
            // ERC20 token balance
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ['function balanceOf(address) view returns (uint256)'],
                this.provider
            );
            return await tokenContract.balanceOf(address);
        } else {
            // Native ETH balance
            return await this.provider.getBalance(address);
        }
    }

    async isContractDeployed(address: string): Promise<boolean> {
        if (!this.provider) return false;
        try {
            const code = await this.provider.getCode(address);
            return code !== '0x';
        } catch {
            return false;
        }
    }

    async validateNetwork(): Promise<boolean> {
        try {
            if (!this.provider) return false;
            const network = await this.provider.getNetwork();
            return network.chainId === BigInt(this.networkConfig?.chainId || 31337);
        } catch (error) {
            this.logger.error(`Network validation failed: ${(error as Error).message}`);
            return false;
        }
    }

    async getContractEvents(contractName: string, eventName: string, fromBlock: number | string = 0, toBlock: number | string = 'latest'): Promise<ethers.EventLog[]> {
        const contract = this.getContract(contractName);
        if (!contract) throw new Error(`Contract ${contractName} not found`);
        
        const filter = contract.filters[eventName]();
        const events = await contract.queryFilter(filter, fromBlock, toBlock);
        return events as ethers.EventLog[];
    }

    // Utility method to create a signer from private key with nonce management
    async createSigner(privateKey: string): Promise<ethers.Wallet> {
        if (!this.provider) throw new Error('Provider not initialized');
        
        const wallet = new ethers.Wallet(privateKey, this.provider);
        const address = await wallet.getAddress();
        
        // Initialize nonce cache for this address if not exists
        if (!this.nonceCache.has(address)) {
            const currentNonce = await this.provider.getTransactionCount(address, 'pending');
            this.nonceCache.set(address, currentNonce);
        }
        
        return wallet;
    }

    // Get next nonce for an address
    async getNextNonce(address: string): Promise<number> {
        if (!this.provider) throw new Error('Provider not initialized');
        
        if (!this.nonceCache.has(address)) {
            const currentNonce = await this.provider.getTransactionCount(address, 'pending');
            this.nonceCache.set(address, currentNonce);
        }
        
        const cachedNonce = this.nonceCache.get(address)!;
        const providerNonce = await this.provider.getTransactionCount(address, 'pending');
        
        // Use the higher of cached or provider nonce
        const nextNonce = Math.max(cachedNonce, providerNonce);
        this.nonceCache.set(address, nextNonce + 1);
        
        return nextNonce;
    }

    // Reset nonce cache for an address
    async resetNonce(address: string): Promise<void> {
        if (!this.provider) return;
        const currentNonce = await this.provider.getTransactionCount(address, 'pending');
        this.nonceCache.set(address, currentNonce);
    }

    // Clear all nonce cache
    clearNonceCache(): void {
        this.nonceCache.clear();
    }

    // Utility method to get contract with signer
    getContractWithSigner(contractName: string, signer: ethers.Signer): ethers.Contract | null {
        const contract = this.getContract(contractName);
        return contract ? contract.connect(signer) as ethers.Contract : null;
    }

    // Method to refresh deployment info (useful after new deployments)
    async refreshDeploymentInfo(network?: string): Promise<void> {
        const targetNetwork = network || this.currentNetwork;
        await this.loadDeploymentInfo(targetNetwork);
        await this.initializeContracts();
    }

    // Method to check if all required contracts are deployed
    async validateDeployment(): Promise<boolean> {
        const requiredContracts = [
            'MerchantRegionalRegistry',
            'MerchantCoreRegistry', 
            'EscrowDeploymentFactory'
        ];

        const missingContracts: string[] = [];
        
        for (const contractName of requiredContracts) {
            const contract = this.getContract(contractName);
            if (!contract) {
                missingContracts.push(contractName);
            }
        }

        if (missingContracts.length > 0) {
            this.logger.error(`Missing required contracts: ${missingContracts.join(', ')}`);
            return false;
        }

        return true;
    }

    async executeContractMethod(
        contractName: string,
        methodName: string,
        args: any[] = [],
        options: any = {}
    ): Promise<ethers.ContractTransactionResponse> {
        let contract = this.getContract(contractName);
        
        // Auto-load contract if not already loaded
        if (!contract) {
            console.log(`Loading contract ${contractName}...`);
            contract = await this.loadContract(contractName);
        }

        if (!this.signer) {
            throw new Error('No signer available for transaction execution');
        }

        try {
            const signerAddress = await this.signer.getAddress();
            
            // Get proper nonce for this transaction
            const nonce = await this.getNextNonce(signerAddress);
            
            // Add nonce to options if not already present
            const txOptions = {
                ...options,
                nonce: options.nonce !== undefined ? options.nonce : nonce
            };
            
            const contractWithSigner = contract.connect(this.signer);
            
            // Execute transaction with proper nonce
            const tx = await (contractWithSigner as any)[methodName](...args, txOptions);
            
            // Log transaction details for debugging
            this.logger.info(`Transaction sent: ${tx.hash}`);
            this.logger.info(`Used nonce: ${txOptions.nonce}`);
            
            return tx;
        } catch (error) {
            // Reset nonce cache on error to resync with blockchain
            if (this.signer) {
                const signerAddress = await this.signer.getAddress();
                await this.resetNonce(signerAddress);
            }
            throw new Error(`Failed to execute ${methodName} on ${contractName}: ${(error as Error).message}`);
        }
    }

    // Load contract ABI from artifacts
    private async loadContractABI(contractName: string): Promise<any[]> {
        // Try different paths based on contract type (from cli/dist/utils to root)
        const alternativePaths = [
            path.join(__dirname, `../../../artifacts/contracts/core/${contractName}.sol/${contractName}.json`),
            path.join(__dirname, `../../../artifacts/contracts/merchant/${contractName}.sol/${contractName}.json`),
            path.join(__dirname, `../../../artifacts/contracts/verifiers/${contractName}.sol/${contractName}.json`),
            path.join(__dirname, `../../../artifacts/contracts/security/${contractName}.sol/${contractName}.json`),
            path.join(__dirname, `../../../artifacts/contracts/dao/${contractName}.sol/${contractName}.json`),
            path.join(__dirname, `../../../artifacts/contracts/oracles/${contractName}.sol/${contractName}.json`),
            path.join(__dirname, `../../../artifacts/contracts/${contractName}.sol/${contractName}.json`),
            path.join(__dirname, `../../../artifacts/@openzeppelin/contracts/governance/TimelockController.sol/TimelockController.json`)
        ];

        for (const artifactPath of alternativePaths) {
            try {
                if (fs.existsSync(artifactPath)) {
                    const artifactData = JSON.parse(await fs.promises.readFile(artifactPath, 'utf8'));
                    return artifactData.abi || [];
                }
            } catch (error) {
                this.logger.warn(`Failed to load ABI from ${artifactPath}: ${(error as Error).message}`);
            }
        }

        throw new Error(`ABI not found for contract: ${contractName}`);
    }

    // Type-safe contract loading with validation
    async loadContract(contractName: string, address: string | null = null): Promise<ethers.Contract> {
        try {
            // Check if contract is already loaded
            const existingContract = this.contracts.get(contractName);
            if (existingContract) {
                return existingContract;
            }

            // Validate inputs
            const validation = this.validateContractInputs(contractName, address);
            if (!validation.isValid) {
                throw new Error(`Contract validation failed: ${validation.errors[0]?.message || 'Unknown validation error'}`);
            }

            // Get contract address from config if not provided
            if (!address) {
                // Try to get from config manager
                if (this.configManager) {
                    address = this.configManager.getContractAddress(contractName, this.networkName || 'hardhat');
                }
                
                if (!address && this.deploymentInfo?.contracts?.[contractName]) {
                    const contractInfo = this.deploymentInfo.contracts[contractName];
                    address = typeof contractInfo === 'string' ? contractInfo : contractInfo.address;
                }
                
                if (!address) {
                    throw new Error(`No contract address found for ${contractName} on network ${this.networkName}`);
                }
            }

            // Load the actual contract ABI
            const abi = await this.loadContractABI(contractName);
            if (abi.length === 0) {
                throw new Error(`No ABI found for contract: ${contractName}`);
            }

            const contract = new ethers.Contract(
                address,
                abi,
                this.signer || this.provider
            );

            this.contracts.set(contractName, contract);
            
            // Store validation result
            this.contractValidations.set(contractName, validation);
            
            return contract;
        } catch (error) {
            const errorMessage = `Failed to load contract ${contractName}: ${(error as Error).message}`;
            FormattingUtils.printError(errorMessage);
            throw error;
        }
    }

    async loadAllContracts(): Promise<void> {
        if (!this.deploymentInfo?.contracts) {
            this.logger.warn('No deployment info available for loading contracts');
            return;
        }

        const contractAddresses = this.deploymentInfo.contracts;
        
        for (const [contractName, contractInfo] of Object.entries(contractAddresses)) {
            try {
                const address = typeof contractInfo === 'string' ? contractInfo : (contractInfo as any).address;
                if (address && ethers.isAddress(address)) {
                    await this.loadContract(contractName, address);
                }
            } catch (error) {
                this.logger.warn(`Failed to load contract ${contractName}: ${(error as Error).message}`);
            }
        }
    }

    private validateContractInputs(contractName: string, address: string | null): ValidationResult {
        const errors: ValidationError[] = [];

        if (!contractName || contractName.trim().length === 0) {
            errors.push({
                field: 'contractName',
                message: 'Contract name cannot be empty',
                code: 'INVALID_CONTRACT_NAME'
            });
        }

        if (address && !ethers.isAddress(address)) {
            errors.push({
                field: 'address',
                message: 'Invalid contract address format',
                code: 'INVALID_ADDRESS'
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    private async validateAllContracts(): Promise<void> {
        for (const [contractName, contract] of this.contracts) {
            try {
                const address = await contract.getAddress();
                const deployed = await this.isContractDeployed(address);
                
                const validation: ValidationResult = {
                    isValid: deployed,
                    errors: deployed ? [] : [{
                        field: 'deployment',
                        message: `Contract ${contractName} not deployed at ${address}`,
                        code: 'CONTRACT_NOT_DEPLOYED'
                    }]
                };
                
                this.contractValidations.set(contractName, validation);
            } catch (error) {
                this.contractValidations.set(contractName, {
                    isValid: false,
                    errors: [{
                        field: 'validation',
                        message: `Validation failed: ${(error as Error).message}`,
                        code: 'VALIDATION_ERROR'
                    }]
                });
            }
        }
    }

    // Contract analysis and diagnostics
    async analyzeContracts(): Promise<ContractInfo[]> {
        const analysis: ContractInfo[] = [];
        
        try {
            const provider = this.provider;
            if (!provider) {
                throw new Error('Provider not initialized');
            }
            
            for (const [contractName] of this.contracts) {
                analysis.push({
                    name: contractName,
                    address: '0x0000000000000000000000000000000000000000', // placeholder
                    deployed: false
                });
            }
        } catch (error) {
            FormattingUtils.printError(`Contract analysis failed: ${(error as Error).message}`);
        }
        
        return analysis;
    }

    // System health and diagnostic methods
    async getSystemHealth(): Promise<{ healthy: boolean; issues: string[] }> {
        const issues: string[] = [];
        
        if (!this.provider) {
            issues.push('Provider not initialized');
        }
        
        if (!this.signer) {
            issues.push('No signer configured');
        }
        
        const totalContracts = this.contracts.size;
        if (totalContracts === 0) {
            issues.push('No contracts loaded');
        }
        
        // Check contract validations
        let invalidContracts = 0;
        for (const [contractName, validation] of this.contractValidations) {
            if (!validation.isValid) {
                invalidContracts++;
                const errorMessage = validation.errors.length > 0 
                    ? validation.errors[0].message 
                    : 'Unknown validation error';
                issues.push(`Contract ${contractName} validation failed: ${errorMessage}`);
            }
        }
        
        return {
            healthy: issues.length === 0,
            issues
        };
    }

    // Get comprehensive system status
    async getDetailedStatus(): Promise<any> {
        try {
            const health = await this.getSystemHealth();
            const contracts = await this.analyzeContracts();
            
            return {
                network: this.network,
                provider: !!this.provider,
                signer: !!this.signer,
                contracts: {
                    total: contracts.length,
                    loaded: this.contracts.size,
                    validated: Array.from(this.contractValidations.values()).filter(v => v.isValid).length
                },
                health: health.healthy,
                issues: health.issues,
                contractDetails: contracts
            };
        } catch (error) {
            return {
                error: `Status check failed: ${(error as Error).message}`,
                healthy: false
            };
        }
    }
}
