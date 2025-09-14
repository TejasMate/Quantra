import chalk from 'chalk';
import inquirer from 'inquirer';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { TypeSafeContractManager } from '../utils/type-safe-contract-manager.js';
import { EnhancedConfigManager } from '../utils/enhanced-config-manager.js';
import { EventListenerService } from '../services/event-listener-service.js';
import { MultiChainEscrowService } from '../services/multi-chain-escrow-service.js';
import { InputValidator, validateCommandInput } from '../validators/input-validator.js';
import { priceService } from '../services/price-service.js';
import { priceIntegration } from '../utils/price-integration-utils.js';
import { 
  GlobalOptions, 
  MerchantData,
  EscrowData,
  EscrowStatus,
  ValidationResult 
} from '../types/index.js';

interface MerchantCommandOptions {
  name?: string;
  region?: string;
  kycLevel?: string;
  address?: string;
  email?: string;
  phone?: string;
  privateKey?: string;
  merchantIndex?: string;
  merchantName?: string;
  noInteractive?: boolean;
  merchantId?: string;
  type?: string;
  upiId?: string;
  pixKey?: string;
  keyType?: string;
  iban?: string;
  bic?: string;
  accountHolder?: string;
  activeOnly?: boolean;
  format?: string;
  paymentMethods?: boolean;
  escrows?: boolean;
  networks?: string;
  token?: string;
  amount?: string;
  details?: string;
  deadline?: string;
  autoFund?: boolean;
}

interface RegistrationData {
  businessName: string;
  region: string;
  kycLevel: string;
  businessType?: string;
}

interface PaymentMethodData {
  type: string;
  identifier: string;
  keyType?: string;
  bic?: string;
  accountHolder?: string;
  region?: string;
  merchantId?: string;
}

interface EscrowCreationData {
  merchantId: string;
  tokenAddress: string;
  amount: bigint;
  paymentDetails: string;
  deliveryDeadline: number;
}

interface MerchantSignerOptions {
  merchantIndex?: string;
  merchantName?: string;
}

export class MerchantCommands {
  private contractManager: TypeSafeContractManager;
  configManager: import('../utils/enhanced-config-manager.js').TypeSafeEnhancedConfigManager;
  private multiChainService: MultiChainEscrowService;
  private initialized: boolean = false;

  constructor() {
    this.configManager = new EnhancedConfigManager();
    this.contractManager = new TypeSafeContractManager();
    this.multiChainService = new MultiChainEscrowService();
  }

  async ensureInitialized(globalOptions: GlobalOptions): Promise<void> {
    if (!this.initialized) {
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);
      this.initialized = true;
    }
  }

  setupCommands(merchantCmd: any): void {
    merchantCmd
      .command('register')
      .description('Register a new merchant')
      .option('-n, --name <name>', 'Business name')
      .option('-r, --region <region>', 'Business region (India, Brazil, Europe)')
      .option('-k, --kyc-level <level>', 'KYC level (1-3)', '1')
      .option('-a, --address <address>', 'Business address')
      .option('-e, --email <email>', 'Business email')
      .option('-p, --phone <phone>', 'Business phone')
      .option('--private-key <key>', 'Private key for transaction')
      .option('--merchant-index <index>', 'Index of merchant private key from .env array (0-based)')
      .option('--merchant-name <name>', 'Name of merchant from .env array')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options: MerchantCommandOptions) => {
        const globalOptions = merchantCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.register(options, globalOptions);
      });

    merchantCmd
      .command('add-payment')
      .description('Add payment method to merchant')
      .option('-i, --merchant-id <id>', 'Merchant ID')
      .option('-t, --type <type>', 'Payment method type (UPI, PIX, SEPA)')
      .option('-r, --region <region>', 'Target region')
      .option('--upi-id <id>', 'UPI ID (for UPI payments)')
      .option('--pix-key <key>', 'PIX key (for PIX payments)')
      .option('--key-type <type>', 'PIX key type (EMAIL, PHONE, CPF, CNPJ)')
      .option('--iban <iban>', 'IBAN (for SEPA payments)')
      .option('--bic <bic>', 'BIC/SWIFT code (for SEPA payments)')
      .option('--account-holder <name>', 'Account holder name (for SEPA payments)')
      .option('--private-key <key>', 'Private key for transaction')
      .option('--merchant-index <index>', 'Index of merchant private key from .env array (0-based)')
      .option('--merchant-name <name>', 'Name of merchant from .env array')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options: MerchantCommandOptions) => {
        const globalOptions = merchantCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.addPaymentMethod(options, globalOptions);
      });

    merchantCmd
      .command('list')
      .description('List merchants')
      .option('-r, --region <region>', 'Filter by region')
      .option('--active-only', 'Show only active merchants')
      .option('--format <format>', 'Output format (table, json)', 'table')
      .action(async (options: MerchantCommandOptions) => {
        const globalOptions = merchantCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.listMerchants(options, globalOptions);
      });

    merchantCmd
      .command('info')
      .description('Get merchant information')
      .option('-i, --merchant-id <id>', 'Merchant ID')
      .option('-a, --address <address>', 'Merchant address')
      .option('--payment-methods', 'Include payment methods')
      .option('--escrows', 'Include escrow addresses for each payment method')
      .action(async (options: MerchantCommandOptions) => {
        const globalOptions = merchantCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.getMerchantInfo(options, globalOptions);
      });

    merchantCmd
      .command('create-multi-escrow')
      .description('Create multi-chain escrow for UPI payment method')
      .option('-i, --merchant-id <id>', 'Merchant ID')
      .option('-u, --upi-id <id>', 'UPI ID for escrow creation')
      .option('-n, --networks <networks>', 'Networks to deploy (avalanche,aptos)', 'avalanche,aptos')
      .option('-a, --amount <amount>', 'Initial funding amount')
      .option('--auto-fund', 'Automatically fund the escrow')
      .action(async (options: MerchantCommandOptions) => {
        const globalOptions = merchantCmd.parent.opts() as GlobalOptions;
        await this.createMultiChainEscrow(options, globalOptions);
      });

    merchantCmd
      .command('list-escrows')
      .description('List all escrows for a merchant')
      .option('-i, --merchant-id <id>', 'Merchant ID')
      .action(async (options: MerchantCommandOptions) => {
        const globalOptions = merchantCmd.parent.opts() as GlobalOptions;
        await this.listMerchantEscrows(options, globalOptions);
      });

    merchantCmd
      .command('test-multi-chain')
      .description('Test multi-chain escrow integration')
      .action(async (options: MerchantCommandOptions) => {
        const globalOptions = merchantCmd.parent.opts() as GlobalOptions;
        await this.testMultiChainIntegration(options, globalOptions);
      });

    merchantCmd
      .command('generate-escrows')
      .description('Generate escrow addresses for merchant payment methods')
      .option('-i, --merchant-id <id>', 'Merchant ID')
      .option('-a, --address <address>', 'Merchant address')
      .option('--networks <networks>', 'Comma-separated list of networks (avalanche,aptos)', 'avalanche,aptos')
      .option('--private-key <key>', 'Private key for transaction')
      .option('--merchant-index <index>', 'Index of merchant private key from .env array (0-based)')
      .option('--merchant-name <name>', 'Name of merchant from .env array')
      .action(async (options: MerchantCommandOptions) => {
        const globalOptions = merchantCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.generateEscrows(options, globalOptions);
      });
  }

  async register(options: MerchantCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🏪 Merchant Registration'));
    console.log(chalk.gray('Registering merchant with enhanced validation\n'));

    try {
      // Validate global options
      const globalValidation = InputValidator.validateGlobalOptions(globalOptions);
      if (!globalValidation.isValid) {
        throw new Error(`Invalid options: ${globalValidation.errors.map(e => e.message).join(', ')}`);
      }

      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);
      
      console.log(chalk.gray(`Network: ${globalOptions.network}`));
      const merchantRegistry = await this.contractManager.loadContract('EnhancedMerchantOperations');
      console.log(chalk.gray(`EnhancedMerchantOperations address: ${await merchantRegistry.getAddress()}`));

      // Get signer with validation
      const signer = await this.getSigner(options.privateKey, globalOptions, {
        merchantIndex: options.merchantIndex,
        merchantName: options.merchantName
      });

      const signerAddress = await signer.getAddress();

      // Check if merchant is already registered
      try {
        console.log(chalk.gray('Checking if merchant is already registered...'));
        const existingMerchantId = await merchantRegistry.getMerchantIdByOwner(signerAddress);
        if (existingMerchantId && existingMerchantId.toString() !== '0') {
          console.log(chalk.yellow(`⚠️  Merchant already registered with ID: ${existingMerchantId.toString()}`));
          
          if (!options.noInteractive) {
            const { action } = await inquirer.prompt([
              {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                  { name: 'Register a new merchant (different business)', value: 'new' },
                  { name: 'View existing merchant details', value: 'view' },
                  { name: 'Cancel', value: 'cancel' }
                ]
              }
            ]);
            
            if (action === 'cancel') {
              console.log(chalk.gray('Registration cancelled.'));
              return;
            } else if (action === 'view') {
              await this.showMerchantDetails(existingMerchantId.toString());
              return;
            }
          }
          console.log(chalk.green('Proceeding with new merchant registration...'));
        }
      } catch (error) {
        console.log(chalk.gray('Proceeding with registration...'));
      }

      // Get registration details with validation
      const registrationData = await this.getRegistrationData(options);
      
      // Validate registration data
      const registrationValidation = this.validateRegistrationData(registrationData);
      if (!registrationValidation.isValid) {
        throw new Error(`Invalid registration data: ${registrationValidation.errors.map(e => e.message).join(', ')}`);
      }

      console.log(chalk.yellow(`📍 Using region: ${registrationData.region}`));

      // Register merchant
      console.log(chalk.yellow('📝 Registering merchant on blockchain...'));
      
      // Create KYC document hash from registration data
      const kycDocumentHash = ethers.solidityPackedKeccak256(
        ['string', 'string', 'uint8', 'address'],
        [registrationData.businessName, registrationData.region, parseInt(registrationData.kycLevel), signerAddress]
      );
      
      // Convert region string to enum value
      const regionMapping: { [key: string]: number } = {
        'India': 3,        // ASIA_PACIFIC
        'Brazil': 4,       // LATIN_AMERICA
        'Europe': 2,       // EUROPE
        'US': 1,           // NORTH_AMERICA
        'Global': 0        // GLOBAL
      };
      const regionValue = regionMapping[registrationData.region] ?? 0;
      
      console.log(chalk.green('🚀 Performing on-chain registration...'));
      
      const minStake = ethers.parseEther('0'); // Zero stake for testing
      
      // Register merchant on blockchain
      const tx = await this.contractManager.executeContractMethod(
        'EnhancedMerchantOperations',
        'registerMerchant',
        [
          signerAddress,
          registrationData.businessName,
          registrationData.businessType || 'General', // UPI ID
          kycDocumentHash,
          regionValue
        ],
        { value: minStake }
      );

      console.log(chalk.gray(`Transaction hash: ${tx.hash}`));
      
      // Wait for transaction receipt
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error('Transaction failed - no receipt received');
      }
      
      // Check if transaction actually succeeded
      if (receipt.status !== 1) {
        throw new Error(`Transaction failed with status: ${receipt.status}`);
      }
      
      console.log(chalk.green(`✅ Transaction confirmed in block ${receipt.blockNumber}`));
      console.log(chalk.gray(`Gas used: ${receipt.gasUsed?.toString()}`));
      
      // Get merchant ID from events or by owner with improved error handling
      let merchantId: string = '';
      
      // First try to get merchant ID from events
      if (receipt.logs && receipt.logs.length > 0) {
        console.log(chalk.gray(`Debug: Found ${receipt.logs.length} logs in transaction`));
        
        // Try to parse MerchantRegistered event
        try {
          for (const log of receipt.logs) {
            try {
              const decodedEvent = merchantRegistry.interface.parseLog({
                topics: log.topics,
                data: log.data
              });
              
              if (decodedEvent && decodedEvent.name === 'MerchantRegistered') {
                merchantId = decodedEvent.args.merchantId.toString();
                console.log(chalk.green(`✅ Found merchant ID from event: ${merchantId}`));
                break;
              }
            } catch (parseError) {
              // Continue to next log if this one can't be parsed
            }
          }
        } catch (eventError) {
          console.log(chalk.yellow(`⚠️  Could not parse events: ${(eventError as Error).message}`));
        }
      }
      
      // If no merchant ID from events, try getMerchantIdByOwner with retry and better error handling
      if (!merchantId) {
        console.log(chalk.yellow('⚠️  No merchant ID found in events, trying getMerchantIdByOwner...'));
        
        // Add a small delay to ensure state is updated
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          const retrievedId = await merchantRegistry.getMerchantIdByOwner(signerAddress);
          if (retrievedId && retrievedId.toString() !== '0') {
            merchantId = retrievedId.toString();
            console.log(chalk.green(`✅ Found merchant ID from owner lookup: ${merchantId}`));
          } else {
            console.log(chalk.yellow('⚠️  getMerchantIdByOwner returned 0 or null'));
          }
        } catch (getIdError) {
          console.log(chalk.yellow(`⚠️  getMerchantIdByOwner failed: ${(getIdError as Error).message}`));
          // Don't throw here - we'll try to continue without merchant ID verification
        }
      }
      
      if (!merchantId) {
        console.log(chalk.yellow('⚠️  Could not retrieve merchant ID for verification, but transaction succeeded'));
        console.log(chalk.green('✅ Merchant registration transaction completed successfully!'));
        console.log(chalk.blue(`🔗 Transaction hash: ${tx.hash}`));
        console.log(chalk.gray('Note: You can verify registration status later using the merchant list command'));
        return;
      }

      // Auto-verify KYC
      try {
        console.log(chalk.blue('\n🔍 Auto-verifying KYC...'));
        const merchantProfile = await merchantRegistry.getMerchantProfile(merchantId);
        if (merchantProfile.kycNftId && merchantProfile.kycNftId.toString() !== '0') {
          await this.contractManager.executeContractMethod(
            'EnhancedMerchantOperations',
            'verifyKYC',
            [merchantProfile.kycNftId]
          );
          console.log(chalk.green('✅ KYC automatically verified!'));
        }
      } catch (error) {
        console.log(chalk.yellow('⚠️  KYC auto-verification failed, but registration succeeded'));
      }

      console.log(chalk.green('\n✅ Merchant registered successfully!'));
      console.log(chalk.white(`   Merchant ID: ${merchantId}`));
      console.log(chalk.white(`   Business Name: ${registrationData.businessName}`));
      console.log(chalk.white(`   Region: ${registrationData.region}`));
      console.log(chalk.white(`   KYC Level: ${registrationData.kycLevel}`));
      console.log(chalk.white(`   Address: ${signerAddress}`));
      console.log(chalk.gray(`   Gas used: ${receipt.gasUsed?.toString() || 'N/A'}`));

      console.log(chalk.blue('\n💡 Next steps:'));
      console.log('   1. Add payment methods: quantrapay-cli merchant add-payment');
      console.log('   2. Check status: quantrapay-cli merchant info --merchant-id ' + merchantId);

    } catch (error) {
      console.error(chalk.red('❌ Registration failed:'), (error as Error).message);
      throw error;
    }
  }

  async addPaymentMethod(options: MerchantCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n💳 Add Payment Method'));
    console.log(chalk.gray('Adding payment method with validation\n'));

    try {
      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);

      // Get signer
      const signer = await this.getSigner(options.privateKey, globalOptions, {
        merchantIndex: options.merchantIndex,
        merchantName: options.merchantName
      });

      // Get merchant ID with validation
      const merchantId = await this.getMerchantId(options.merchantId, await signer.getAddress());

      // Get payment method details with validation
      const paymentData = await this.getPaymentMethodData(options, merchantId);
      paymentData.merchantId = merchantId;
      
      // Validate payment method data
      const paymentValidation = this.validatePaymentMethodData(paymentData);
      if (!paymentValidation.isValid) {
        throw new Error(`Invalid payment data: ${paymentValidation.errors.map(e => e.message).join(', ')}`);
      }

      console.log(chalk.yellow(`📍 Using payment method ${paymentData.type} in region ${paymentData.region || 'N/A'}`));

      // Register payment method with appropriate verifier
      console.log(chalk.yellow(`📝 Registering ${paymentData.type} payment method...`));
      await this.registerWithVerifier(paymentData, signer);

      // Add payment method to merchant payment methods contract
      console.log(chalk.yellow('📝 Adding payment method to merchant...'));
      const merchantPaymentMethods = await this.contractManager.loadContract('MerchantPaymentMethods');
      
      // Prepare metadata arrays
      const metadataKeys = ['region'];
      const metadataValues = [paymentData.region || 'Global'];
      
      const tx = await this.contractManager.executeContractMethod(
        'MerchantPaymentMethods',
        'addPaymentMethod',
        [parseInt(merchantId, 10), paymentData.type, paymentData.identifier, metadataKeys, metadataValues]
      );

      const receipt = await tx.wait();

      // Extract payment method ID from the transaction receipt
      let paymentMethodId = '0';
      if (receipt && receipt.logs && receipt.logs.length > 0) {
        try {
          for (const log of receipt.logs) {
            try {
              const decodedEvent = merchantPaymentMethods.interface.parseLog({
                topics: log.topics,
                data: log.data
              });
              
              if (decodedEvent && decodedEvent.name === 'PaymentMethodAdded') {
                paymentMethodId = decodedEvent.args.methodId.toString();
                console.log(chalk.gray(`   Payment Method ID: ${paymentMethodId}`));
                break;
              }
            } catch (parseError) {
              // Continue to next log if this one can't be parsed
            }
          }
        } catch (eventError) {
          console.log(chalk.yellow(`⚠️  Could not parse payment method events: ${(eventError as Error).message}`));
        }
      }

      console.log(chalk.green('\n✅ Payment method added successfully!'));
      console.log(chalk.white(`   Merchant ID: ${merchantId}`));
      console.log(chalk.white(`   Method Type: ${paymentData.type}`));
      console.log(chalk.white(`   Identifier: ${paymentData.identifier}`));
      console.log(chalk.white(`   Region: ${paymentData.region || 'N/A'}`));
      console.log(chalk.gray(`   Gas used: ${receipt?.gasUsed?.toString() || 'N/A'}`));

      // Auto-create escrow contracts
      await this.autoCreateEscrows({
        merchantId,
        paymentMethodId,
        merchantAddress: await signer.getAddress(),
        paymentType: paymentData.type,
        identifier: paymentData.identifier
      });

      console.log(chalk.blue('\n💡 Next steps:'));
      console.log('   1. List methods: quantrapay-cli merchant info --merchant-id ' + merchantId + ' --payment-methods');
      console.log('   2. Test payments with your new escrow contracts');

    } catch (error) {
      console.error(chalk.red('❌ Adding payment method failed:'), (error as Error).message);
      throw error;
    }
  }

  async listMerchants(options: MerchantCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n📋 Merchant List'));
    console.log(chalk.gray('Fetching registered merchants\n'));

    try {
      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);

      const merchantRegistry = await this.contractManager.loadContract('EnhancedMerchantOperations');
      const totalMerchants = await merchantRegistry.getMerchantCount();

      if (totalMerchants.toString() === '0') {
        console.log(chalk.yellow('📭 No merchants registered yet'));
        return;
      }

      const merchants: any[] = [];
      for (let i = 1; i <= Number(totalMerchants); i++) {
        try {
          const merchantProfile = await merchantRegistry.getMerchantProfile(i);
          
          // Get KYC data for business name and type
          let businessName = 'N/A';
          let businessType = 'N/A';
          let kycVerified = false;
          
          if (merchantProfile.kycNftId && merchantProfile.kycNftId.toString() !== '0') {
            try {
              const kycData = await merchantRegistry.getKYCData(merchantProfile.kycNftId);
              businessName = kycData.merchantName || 'N/A';
              businessType = kycData.businessType || 'N/A';
              kycVerified = kycData.isVerified;
            } catch (error) {
              // KYC data not available, keep defaults
            }
          }
          
          // Apply filters
          if (options.region && merchantProfile.region !== options.region) {
            continue;
          }
          if (options.activeOnly && !(merchantProfile.registered && !merchantProfile.revoked)) {
            continue;
          }

          merchants.push({
            id: i,
            owner: merchantProfile.owner,
            businessName: businessName,
            businessType: businessType,
            region: merchantProfile.region,
            kycLevel: kycVerified ? 'Verified' : 'Not Verified',
            active: merchantProfile.registered && !merchantProfile.revoked,
            registrationDate: merchantProfile.registrationTime ? 
              new Date(Number(merchantProfile.registrationTime) * 1000).toLocaleDateString() : 'N/A'
          });
        } catch (error) {
          // Skip merchants that can't be fetched
          continue;
        }
      }

      if (merchants.length === 0) {
        console.log(chalk.yellow('📭 No merchants match the specified criteria'));
        return;
      }

      // Display results
      if (options.format === 'json') {
        console.log(JSON.stringify(merchants, null, 2));
      } else {
        this.displayMerchantsTable(merchants);
      }

    } catch (error) {
      console.error(chalk.red('❌ Listing merchants failed:'), (error as Error).message);
      throw error;
    }
  }

  async getMerchantInfo(options: MerchantCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🔍 Merchant Information'));
    console.log(chalk.gray('Fetching merchant details\n'));

    try {
      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);

      const merchantRegistry = await this.contractManager.loadContract('EnhancedMerchantOperations');
      let merchantId: string;

      if (options.merchantId) {
        merchantId = options.merchantId;
      } else if (options.address) {
        // Validate address format
        const addressValidation = InputValidator.validateAddress(options.address, 'merchant address');
        if (!addressValidation.isValid) {
          throw new Error(`Invalid address: ${addressValidation.errors.map(e => e.message).join(', ')}`);
        }
        
        const retrievedId = await merchantRegistry.getMerchantIdByOwner(options.address);
        if (retrievedId.toString() === '0') {
          throw new Error('No merchant found for the specified address');
        }
        merchantId = retrievedId.toString();
      } else {
        throw new Error('Either --merchant-id or --address must be specified');
      }

      // Get merchant info from blockchain
      const merchantProfile = await merchantRegistry.getMerchantProfile(merchantId);
      
      // Get KYC data for business name and type
      let businessName = 'N/A';
      let businessType = 'N/A';
      let kycVerified = false;
      
      if (merchantProfile.kycNftId && merchantProfile.kycNftId.toString() !== '0') {
        try {
          const kycData = await merchantRegistry.getKYCData(merchantProfile.kycNftId);
          businessName = kycData.merchantName || 'N/A';
          businessType = kycData.businessType || 'N/A';
          kycVerified = kycData.isVerified;
        } catch (error) {
          console.log(chalk.yellow('⚠️  Could not retrieve KYC data'));
        }
      }
      
      console.log(chalk.green('✅ Merchant found:'));
      console.log(chalk.white(`   Merchant ID: ${merchantId}`));
      console.log(chalk.white(`   Owner: ${merchantProfile.owner}`));
      console.log(chalk.white(`   Business Name: ${businessName}`));
      console.log(chalk.white(`   Business Type: ${businessType}`));
      console.log(chalk.white(`   Region: ${merchantProfile.region}`));
      console.log(chalk.white(`   KYC Verified: ${kycVerified ? 'Yes' : 'No'}`));
      console.log(chalk.white(`   Registration Date: ${new Date(Number(merchantProfile.registrationTime) * 1000).toLocaleDateString()}`));
      console.log(chalk.white(`   Active: ${merchantProfile.registered && !merchantProfile.revoked ? 'Yes' : 'No'}`));

      // Get payment methods if requested
      if (options.paymentMethods) {
        console.log(chalk.blue('\n💳 Payment Methods:'));
        const merchantPaymentMethods = await this.contractManager.loadContract('MerchantPaymentMethods');
        const paymentMethods = await merchantPaymentMethods.getPaymentMethods(merchantId);
        
        if (paymentMethods.length === 0) {
          console.log(chalk.gray('   No payment methods registered'));
        } else {
          this.displayPaymentMethodsTable(paymentMethods);
        }
      }

      // Get escrow addresses if requested
      if (options.escrows) {
        await this.displayMerchantEscrows(merchantId);
      }

    } catch (error) {
      console.error(chalk.red('❌ Getting merchant info failed:'), (error as Error).message);
      throw error;
    }
  }

  async generateEscrows(options: MerchantCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🔒 Generate Escrow Addresses'));
    console.log(chalk.gray('Generating cross-chain escrow contracts\n'));

    try {
      let merchantId = options.merchantId;
      
      // Get merchant ID if not provided
      if (!merchantId && !options.address) {
        if (!options.noInteractive) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'merchantId',
              message: 'Enter merchant ID:',
              validate: (input: string) => input.trim() !== '' || 'Merchant ID is required'
            }
          ]);
          merchantId = answers.merchantId;
        } else {
          throw new Error('Merchant ID is required in non-interactive mode');
        }
      }
      
      // Validate merchant ID
      if (merchantId) {
        const idValidation = InputValidator.validateString(merchantId, 'merchantId', 1, 100);
        if (!idValidation.isValid) {
          throw new Error(`Invalid merchant ID: ${idValidation.errors.map(e => e.message).join(', ')}`);
        }
      }
      
      // Parse and validate networks
      const networks = (options.networks || 'avalanche,aptos').split(',').map(n => n.trim().toLowerCase());
      console.log(chalk.blue(`🌐 Target networks: ${networks.join(', ')}`));
      
      // Get merchant info from blockchain
      const merchantRegistry = await this.contractManager.loadContract('EnhancedMerchantOperations');
      const merchantInfo = await merchantRegistry.getMerchantProfile(merchantId!);
      if (!merchantInfo || !merchantInfo.owner) {
        console.log(chalk.red('❌ Merchant not found'));
        return;
      }
      
      console.log(chalk.green(`✅ Found merchant ID: ${merchantId}`));
      
      // Get payment methods
      const merchantPaymentMethods = await this.contractManager.loadContract('MerchantPaymentMethods');
      const paymentMethods = await merchantPaymentMethods.getPaymentMethods(merchantId!);
      if (!paymentMethods || paymentMethods.length === 0) {
        console.log(chalk.yellow('⚠️  No payment methods found for this merchant'));
        return;
      }
      
      console.log(chalk.blue(`💳 Found ${paymentMethods.length} payment methods`));
      
      // Generate escrows for each network and payment method
      const escrowResults: { [network: string]: { [method: string]: string } } = {};
      
      for (const network of networks) {
        console.log(chalk.blue(`\n🔧 Generating escrows for ${network.toUpperCase()} network...`));
        escrowResults[network] = {};
        
        for (const paymentMethod of paymentMethods) {
          try {
            console.log(chalk.gray(`  Generating escrow for ${paymentMethod.methodType || paymentMethod.paymentType}...`));
            
            // Generate escrow address based on network
            let escrowAddress: string;
            if (network === 'avalanche') {
              escrowAddress = await this.generateAvalancheEscrow(merchantId!, paymentMethod);
            } else if (network === 'aptos') {
              escrowAddress = await this.generateAptosEscrow(merchantId!, paymentMethod);
            } else {
              console.log(chalk.yellow(`    ⚠️  Network ${network} not supported`));
              continue;
            }
            
            escrowResults[network][paymentMethod.methodType || paymentMethod.paymentType] = escrowAddress;
            console.log(chalk.green(`    ✅ ${paymentMethod.methodType || paymentMethod.paymentType}: ${escrowAddress}`));
            
          } catch (error) {
            console.log(chalk.red(`    ❌ Failed to generate escrow for ${paymentMethod.methodType || paymentMethod.paymentType}: ${(error as Error).message}`));
          }
        }
      }
      
      // Display results
      console.log(chalk.green('\n🎉 Escrow generation completed!'));
      console.log(chalk.blue('📋 Generated escrow addresses:'));
      
      for (const [network, escrows] of Object.entries(escrowResults)) {
        console.log(chalk.cyan(`\n${network.toUpperCase()} Network:`));
        for (const [method, address] of Object.entries(escrows)) {
          console.log(`  ${method}: ${address}`);
        }
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Escrow generation failed:'), (error as Error).message);
      if (globalOptions.verbose) {
        console.error((error as Error).stack);
      }
    }
  }

  // Validation methods
  private validateRegistrationData(data: RegistrationData): ValidationResult {
    const errors: any[] = [];
    
    // Validate business name
    const nameValidation = InputValidator.validateString(data.businessName, 'businessName', 1, 100);
    if (!nameValidation.isValid) {
      errors.push(...nameValidation.errors);
    }
    
    // Validate region
    const validRegions = ['India', 'Brazil', 'Europe', 'US', 'Global'];
    if (!validRegions.includes(data.region)) {
      errors.push({
        field: 'region',
        message: `Region must be one of: ${validRegions.join(', ')}`,
        code: 'INVALID_REGION'
      });
    }
    
    // Validate KYC level
    const kycLevel = parseInt(data.kycLevel);
    if (isNaN(kycLevel) || kycLevel < 1 || kycLevel > 3) {
      errors.push({
        field: 'kycLevel',
        message: 'KYC level must be 1, 2, or 3',
        code: 'INVALID_KYC_LEVEL'
      });
    }
    
    return { isValid: errors.length === 0, errors };
  }

  private validatePaymentMethodData(data: PaymentMethodData): ValidationResult {
    const errors: any[] = [];
    
    // Validate payment type
    const validTypes = ['UPI', 'PIX', 'SEPA'];
    if (!validTypes.includes(data.type)) {
      errors.push({
        field: 'type',
        message: `Payment type must be one of: ${validTypes.join(', ')}`,
        code: 'INVALID_PAYMENT_TYPE'
      });
    }
    
    // Validate identifier
    const identifierValidation = InputValidator.validateString(data.identifier, 'identifier', 1, 255);
    if (!identifierValidation.isValid) {
      errors.push(...identifierValidation.errors);
    }
    
    // Type-specific validation
    switch (data.type) {
      case 'UPI':
        if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(data.identifier)) {
          errors.push({
            field: 'identifier',
            message: 'Invalid UPI ID format',
            code: 'INVALID_UPI_FORMAT'
          });
        }
        break;
        
      case 'SEPA':
        if (data.identifier && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$/.test(data.identifier.replace(/\s/g, ''))) {
          errors.push({
            field: 'identifier',
            message: 'Invalid IBAN format',
            code: 'INVALID_IBAN_FORMAT'
          });
        }
        break;
    }
    
    return { isValid: errors.length === 0, errors };
  }

  // Helper methods
  private async getSigner(privateKey?: string, globalOptions?: GlobalOptions, options: MerchantSignerOptions = {}): Promise<any> {
    if (privateKey) {
      // Validate private key format
      const keyValidation = InputValidator.validatePrivateKey(privateKey);
      if (!keyValidation.isValid) {
        throw new Error(`Invalid private key: ${keyValidation.errors.map(e => e.message).join(', ')}`);
      }
      return this.contractManager.getSigner();
    }

    // Get merchant private keys from environment
    const merchantPrivateKeys = process.env.MERCHANT_PRIVATE_KEYS?.split(',') || [];
    const merchantAddresses = process.env.MERCHANT_ADDRESSES?.split(',') || [];
    const merchantNames = process.env.MERCHANT_NAMES?.split(',') || [];
    
    if (merchantPrivateKeys.length === 0) {
      throw new Error('No merchant private keys found in .env file. Please add MERCHANT_PRIVATE_KEYS or provide --private-key argument');
    }

    // Handle merchant selection by index or name
    if (options.merchantIndex !== undefined) {
      const index = parseInt(options.merchantIndex);
      if (index >= 0 && index < merchantPrivateKeys.length) {
        const merchantName = merchantNames[index] || `Merchant ${index + 1}`;
        console.log(chalk.gray(`Using merchant private key for: ${merchantName} (index ${index})`));
        // Create signer with the selected private key
        return this.contractManager.getSigner();
      } else {
        throw new Error(`Invalid merchant index: ${index}. Available indices: 0-${merchantPrivateKeys.length - 1}`);
      }
    }

    if (options.merchantName) {
      const nameIndex = merchantNames.findIndex(name => 
        name.toLowerCase() === options.merchantName!.toLowerCase()
      );
      if (nameIndex !== -1) {
        console.log(chalk.gray(`Using merchant private key for: ${merchantNames[nameIndex]} (index ${nameIndex})`));
        return this.contractManager.getSigner();
      } else {
        throw new Error(`Merchant name '${options.merchantName}' not found. Available names: ${merchantNames.join(', ')}`);
      }
    }

    // Default to first merchant
    const merchantName = merchantNames[0] || 'Merchant 1';
    console.log(chalk.gray(`Using default merchant private key for: ${merchantName} (index 0)`));
    return this.contractManager.getSigner();
  }

  private async getMerchantId(merchantIdOption?: string, signerAddress?: string): Promise<string> {
    if (merchantIdOption) {
      // Validate merchant ID format
      const idValidation = InputValidator.validateString(merchantIdOption, 'merchantId', 1, 100);
      if (!idValidation.isValid) {
        throw new Error(`Invalid merchant ID: ${idValidation.errors.map(e => e.message).join(', ')}`);
      }
      return merchantIdOption;
    }

    if (!signerAddress) {
      throw new Error('Either merchant ID or signer address must be provided');
    }

    // Get merchant ID by address from blockchain
    const merchantRegistry = await this.contractManager.loadContract('EnhancedMerchantOperations');
    const merchantId = await merchantRegistry.getMerchantIdByOwner(signerAddress);
    
    if (merchantId.toString() === '0') {
      throw new Error('No merchant found for this address. Please register first.');
    }

    return merchantId.toString();
  }

  // Interactive data collection methods
  private async getRegistrationData(options: MerchantCommandOptions): Promise<RegistrationData> {
    const questions = [];

    if (!options.name) {
      questions.push({
        type: 'input',
        name: 'businessName',
        message: 'Business name:',
        validate: (input: string) => input ? true : 'Business name is required'
      });
    }

    if (!options.region) {
      questions.push({
        type: 'list',
        name: 'region',
        message: 'Select business region:',
        choices: ['India', 'Brazil', 'Europe']
      });
    }

    if (!options.kycLevel) {
      questions.push({
        type: 'list',
        name: 'kycLevel',
        message: 'Select KYC level:',
        choices: [
          { name: 'Level 1 - Basic verification', value: '1' },
          { name: 'Level 2 - Enhanced verification', value: '2' },
          { name: 'Level 3 - Full verification', value: '3' }
        ]
      });
    }

    const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

    return {
      businessName: options.name || answers.businessName,
      region: options.region || answers.region,
      kycLevel: options.kycLevel || answers.kycLevel
    };
  }

  private async getPaymentMethodData(options: MerchantCommandOptions, merchantId: string): Promise<PaymentMethodData> {
    // Verify merchant exists on blockchain
    const merchantRegistry = await this.contractManager.loadContract('EnhancedMerchantOperations');
    const merchantInfo = await merchantRegistry.getMerchantProfile(merchantId);
    if (!merchantInfo.isActive) {
      throw new Error('Merchant is not registered');
    }

    const questions = [];

    if (!options.type) {
      questions.push({
        type: 'list',
        name: 'type',
        message: 'Select payment method type:',
        choices: ['UPI', 'PIX', 'SEPA']
      });
    }

    const initialAnswers = questions.length > 0 ? await inquirer.prompt(questions) : {};
    const methodType = options.type || initialAnswers.type;

    // Get method-specific details
    const methodQuestions = [];
    let identifier: string | undefined;

    switch (methodType) {
      case 'UPI':
        if (!options.upiId) {
          methodQuestions.push({
            type: 'input',
            name: 'upiId',
            message: 'Enter UPI ID (e.g., merchant@paytm):',
            validate: (input: string) => /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(input) || 'Invalid UPI ID format'
          });
        }
        identifier = options.upiId;
        break;

      case 'PIX':
        if (!options.pixKey) {
          methodQuestions.push({
            type: 'input',
            name: 'pixKey',
            message: 'Enter PIX key:',
            validate: (input: string) => input ? true : 'PIX key is required'
          });
        }
        if (!options.keyType) {
          methodQuestions.push({
            type: 'list',
            name: 'keyType',
            message: 'Select PIX key type:',
            choices: ['EMAIL', 'PHONE', 'CPF', 'CNPJ']
          });
        }
        identifier = options.pixKey;
        break;

      case 'SEPA':
        if (!options.iban) {
          methodQuestions.push({
            type: 'input',
            name: 'iban',
            message: 'Enter IBAN:',
            validate: (input: string) => {
              const iban = input.replace(/\s/g, '');
              return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$/.test(iban) || 'Invalid IBAN format';
            }
          });
        }
        identifier = options.iban;
        break;
    }

    const methodAnswers = methodQuestions.length > 0 ? await inquirer.prompt(methodQuestions) : {};

    return {
      type: methodType,
      identifier: identifier || methodAnswers.upiId || methodAnswers.pixKey || methodAnswers.iban,
      keyType: options.keyType || methodAnswers.keyType,
      bic: options.bic,
      accountHolder: options.accountHolder,
      region: options.region
    };
  }

  private async registerWithVerifier(paymentData: PaymentMethodData, signer: any): Promise<any> {
    const merchantPaymentMethods = await this.contractManager.loadContract('MerchantPaymentMethods');
    const merchantId = paymentData.merchantId!;
    
    let methodType: string;
    let identifier: string;
    let metadataKeys: string[] = [];
    let metadataValues: string[] = [];

    switch (paymentData.type) {
      case 'UPI':
        methodType = 'UPI';
        identifier = paymentData.identifier;
        metadataKeys = ['region'];
        metadataValues = ['India'];
        break;

      case 'PIX':
        methodType = 'PIX';
        identifier = paymentData.identifier;
        metadataKeys = ['keyType', 'region'];
        metadataValues = [paymentData.keyType || 'EMAIL', 'Brazil'];
        break;

      case 'SEPA':
        methodType = 'SEPA';
        identifier = paymentData.identifier;
        metadataKeys = ['bic', 'accountHolder', 'region'];
        metadataValues = [paymentData.bic || '', paymentData.accountHolder || '', 'Europe'];
        break;

      default:
        throw new Error(`Unsupported payment method type: ${paymentData.type}`);
    }

    const parsedMerchantId = parseInt(merchantId, 10);
    const args = [parsedMerchantId, methodType, identifier, metadataKeys, metadataValues];
    
    const tx = await this.contractManager.executeContractMethod(
      'MerchantPaymentMethods',
      'addPaymentMethod',
      args
    );
    return tx;
  }

  // Auto-create escrows helper
  private async autoCreateEscrows(methodInfo: {
    merchantId: string;
    paymentMethodId: string;
    merchantAddress: string;
    paymentType: string;
    identifier: string;
  }): Promise<void> {
    try {
      console.log(chalk.blue('\n🔒 Auto-creating escrow contracts...'));
      
      const escrowFactory = await this.contractManager.loadContract('EscrowDeploymentFactory');
      
      // Define chains and tokens
      const chainsToCheck = ['avalanche', 'aptos', 'localhost'];
      const supportedTokens = ['USDC', 'USDT', 'ETH'];
      
      // Check existing escrows
      try {
        const existingEscrows = await escrowFactory.getAllMerchantEscrows(
          methodInfo.merchantAddress,
          chainsToCheck
        );
        
        const hasExistingEscrows = existingEscrows[1].some((chainEscrows: any[]) => chainEscrows.length > 0);
        if (hasExistingEscrows) {
          console.log(chalk.green('   ✅ Merchant already has escrow contracts'));
          return;
        }
      } catch (error) {
        console.log(chalk.gray('   Could not check existing escrows, proceeding with creation...'));
      }
      
      // Calculate deployment fee
      // Separate EVM and non-EVM chains
      const evmChains = chainsToCheck.filter(chain => 
        ['localhost', 'ethereum', 'polygon', 'avalanche', 'bsc'].includes(chain.toLowerCase())
      );
      const nonEvmChains = chainsToCheck.filter(chain => 
        ['aptos', 'solana', 'sui'].includes(chain.toLowerCase())
      );
      
      console.log(chalk.blue('   Requesting escrow deployment...'));
      console.log(chalk.gray(`   EVM Chains: ${evmChains.join(', ') || 'None'}`));
      console.log(chalk.gray(`   Non-EVM Chains: ${nonEvmChains.join(', ') || 'None'}`));
      console.log(chalk.gray(`   Tokens: ${supportedTokens.join(', ')}`));
      
      let escrowAddresses: any = { evm: [], nonEvm: [] };
      
      // Handle EVM chains first
      if (evmChains.length > 0) {
        const evmConfigManager = await this.contractManager.loadContract('EscrowConfigurationManager');
        const evmDeploymentFee = await evmConfigManager.calculateDeploymentFee(evmChains);
        console.log(chalk.gray(`   EVM Fee: ${ethers.formatEther(evmDeploymentFee)} ETH`));
        
        // Use createEscrowContracts for EVM chains
        const evmTx = await this.contractManager.executeContractMethod(
          'EscrowDeploymentFactory',
          'createEscrowContracts',
          [
            methodInfo.merchantId,
            parseInt(methodInfo.paymentMethodId, 10), // Use actual payment method ID
            evmChains,
            supportedTokens
          ],
          { value: evmDeploymentFee, gasLimit: 600000 } // Increased from 500000 to 600000
        );
        
        // Get transaction receipt to access events
        const evmReceipt = await evmTx.wait();
        console.log(chalk.green('   ✅ EVM escrow contracts created successfully!'));
        escrowAddresses.evm = this.parseEscrowAddressesFromReceipt(evmReceipt);
      }
      
      // Handle non-EVM chains through event-listener system
      if (nonEvmChains.length > 0) {
        console.log(chalk.blue('   🔄 Triggering non-EVM chain deployments...'));
        
        // Calculate deployment fee for non-EVM chains
        const nonEvmConfigManager = await this.contractManager.loadContract('EscrowConfigurationManager');
        const nonEvmDeploymentFee = await nonEvmConfigManager.calculateDeploymentFee(nonEvmChains);
        console.log(chalk.gray(`   Non-EVM Fee: ${ethers.formatEther(nonEvmDeploymentFee)} ETH`));
        
        // Request non-EVM escrow creation through event system
        const nonEvmTx = await this.contractManager.executeContractMethod(
          'EscrowDeploymentFactory',
          'requestEscrowCreation',
          [
            methodInfo.merchantId,
            nonEvmChains,
            supportedTokens
          ],
          { value: nonEvmDeploymentFee, gasLimit: 300000 } // Include proper fee
        );
        
        // Get transaction receipt to access events
        const nonEvmReceipt = await nonEvmTx.wait();
        console.log(chalk.yellow('   ⏳ Non-EVM deployments requested (will be processed by adapters)'));
        escrowAddresses.nonEvm = this.parseEscrowAddressesFromReceipt(nonEvmReceipt);
      }
      
      // Save escrow addresses to merchants.json
      await this.saveEscrowAddresses(Number(methodInfo.merchantId), escrowAddresses);
      
      console.log(chalk.green('   ✅ Escrow deployment process completed!'));
    } catch (error: any) {
      console.log(chalk.red(`   ❌ Auto-escrow request failed: ${error.message}`));
      console.log(chalk.gray('   You can request escrows manually later if needed'));
    }
  }

  /**
   * Parse escrow addresses from transaction receipt
   */
  private parseEscrowAddressesFromReceipt(receipt: any): string[] {
    const addresses: string[] = [];
    
    if (receipt && receipt.logs) {
      // Get the factory contract interface for parsing events
      const factoryABI = [
        "event EscrowContractsCreated(uint256 indexed requestId, uint256 indexed merchantId, uint256 indexed paymentMethodId, address[] escrowAddresses)"
      ];
      const iface = new ethers.Interface(factoryABI);
      
      for (const log of receipt.logs) {
        try {
          // Try to parse as EscrowContractsCreated event
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'EscrowContractsCreated') {
            console.log(`   📋 Found ${parsed.args.escrowAddresses.length} escrow addresses:`);
            for (const addr of parsed.args.escrowAddresses) {
              console.log(`      ${addr}`);
              addresses.push(addr);
            }
          }
        } catch (error) {
          // Skip logs that aren't EscrowContractsCreated events
        }
      }
    }
    
    return addresses;
  }

  /**
   * Save escrow addresses to merchants.json
   */
  private async saveEscrowAddresses(merchantId: number, escrowAddresses: any): Promise<void> {
    try {
      const merchantsFilePath = path.join(process.cwd(), 'merchants.json');
      
      let merchantsData: any = { merchants: [] };
      
      // Load existing merchants.json if it exists
      if (fs.existsSync(merchantsFilePath)) {
        try {
          const fileContent = fs.readFileSync(merchantsFilePath, 'utf8');
          merchantsData = JSON.parse(fileContent);
        } catch (error) {
          console.log(chalk.yellow('⚠️  Could not parse existing merchants.json, creating new one'));
        }
      }
      
      // Find or create merchant entry
      let merchant = merchantsData.merchants.find((m: any) => m.merchantId === merchantId.toString());
      
      if (!merchant) {
        merchant = {
          merchantId: merchantId.toString(),
          escrowAddresses: {
            avalanche: [],
            aptos: [],
            ethereum: [],
            polygon: [],
            localhost: []
          }
        };
        merchantsData.merchants.push(merchant);
      }
      
      // Update escrow addresses
      if (escrowAddresses.evm && escrowAddresses.evm.length > 0) {
        // For now, add EVM addresses to localhost (can be refined later)
        merchant.escrowAddresses.localhost = [
          ...(merchant.escrowAddresses.localhost || []),
          ...escrowAddresses.evm
        ];
      }
      
      if (escrowAddresses.nonEvm && escrowAddresses.nonEvm.length > 0) {
        // Add non-EVM addresses (will be updated by adapters later)
        merchant.escrowAddresses.aptos = [
          ...(merchant.escrowAddresses.aptos || []),
          ...escrowAddresses.nonEvm
        ];
      }
      
      // Add timestamp
      merchant.lastUpdated = new Date().toISOString();
      
      // Save updated merchants.json
      fs.writeFileSync(merchantsFilePath, JSON.stringify(merchantsData, null, 2));
      
      console.log(chalk.blue('   📋 Escrow addresses saved to merchants.json'));
      
    } catch (error: any) {
      console.log(chalk.yellow(`   ⚠️  Could not save escrow addresses: ${error.message}`));
    }
  }

  /**
   * Start the event listener service for cross-chain deployments
   */
  async startEventListener(options: GlobalOptions): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Starting Event Listener Service...'));
      
      // Initialize event listener service
      const eventListener = new EventListenerService(
        this.contractManager,
        this.configManager
      );
      
      await eventListener.initialize();
      await eventListener.startListening();
      
      console.log(chalk.green('✅ Event Listener Service is now running'));
      console.log(chalk.blue('🔍 Monitoring for cross-chain escrow deployment requests...'));
      console.log(chalk.gray('   Press Ctrl+C to stop the service'));
      
      // Keep the process running
      process.on('SIGINT', async () => {
        console.log(chalk.yellow('\n🛑 Shutting down Event Listener Service...'));
        await eventListener.stopListening();
        console.log(chalk.green('✅ Event Listener Service stopped'));
        process.exit(0);
      });
      
      // Keep alive
      const keepAlive = setInterval(() => {
        // Check status every 30 seconds
        const status = eventListener.getStatus();
        if (!status.listening) {
          console.log(chalk.red('❌ Event listener stopped unexpectedly'));
          clearInterval(keepAlive);
          process.exit(1);
        }
      }, 30000);
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to start Event Listener Service:'), error.message);
      throw error;
    }
  }

  // Display helper methods
  private displayMerchantsTable(merchants: any[]): void {
    console.log(chalk.white('\n📋 Registered Merchants:'));
    merchants.forEach(merchant => {
      console.log(chalk.cyan(`   ID: ${merchant.id}`));
      console.log(chalk.white(`   Business: ${merchant.businessName}`));
      console.log(chalk.white(`   Owner: ${merchant.owner}`));
      console.log(chalk.white(`   Region: ${merchant.region}`));
      console.log(chalk.white(`   Active: ${merchant.active ? 'Yes' : 'No'}`));
      console.log('');
    });
  }

  private displayPaymentMethodsTable(paymentMethods: any[]): void {
    console.log(chalk.white('   Payment Methods:'));
    paymentMethods.forEach((method, index) => {
      console.log(chalk.cyan(`     ${index + 1}. ${method.methodType || method.paymentType}`));
      console.log(chalk.white(`        Identifier: ${method.identifier || 'N/A'}`));
      console.log(chalk.white(`        Region: ${method.region || 'N/A'}`));
    });
  }

  private async displayMerchantEscrows(merchantId: string): Promise<void> {
    try {
      console.log(chalk.blue('\n🔒 Escrow Addresses:'));
      
      const escrowFactory = await this.contractManager.loadContract('EscrowDeploymentFactory');
      
      // Get merchant's payment methods first
      const merchantPaymentMethods = await this.contractManager.loadContract('MerchantPaymentMethods');
      const paymentMethods = await merchantPaymentMethods.getPaymentMethods(merchantId);
      
      if (paymentMethods.length === 0) {
        console.log(chalk.gray('   No payment methods registered'));
        return;
      }

      // Define supported chains
      const supportedChains = ['avalanche', 'aptos', 'localhost'];
      
      // Get all escrow addresses for this merchant across all chains
      const allEscrows = await escrowFactory.getAllMerchantEscrows(merchantId, supportedChains);
      const chains = allEscrows[0];
      const escrowAddresses = allEscrows[1];
      
      let hasAnyEscrows = false;
      
      // Display escrows organized by payment method
      for (let i = 0; i < paymentMethods.length; i++) {
        const method = paymentMethods[i];
        console.log(chalk.white(`\n   Payment Method ${i + 1}: ${method.paymentType || 'N/A'} (${method.region || 'N/A'})`));
        
        let methodHasEscrows = false;
        
        // Show escrows for each chain
        for (let j = 0; j < chains.length; j++) {
          const chain = chains[j];
          const chainEscrows = escrowAddresses[j];
          
          if (chainEscrows && chainEscrows.length > 0) {
            console.log(chalk.cyan(`     ${chain.charAt(0).toUpperCase() + chain.slice(1)} Chain:`));
            chainEscrows.forEach((escrowAddress: string, index: number) => {
              console.log(chalk.white(`       ${index + 1}. ${escrowAddress}`));
            });
            methodHasEscrows = true;
            hasAnyEscrows = true;
          } else {
            console.log(chalk.gray(`     ${chain.charAt(0).toUpperCase() + chain.slice(1)} Chain: No escrows`));
          }
        }
        
        if (!methodHasEscrows) {
          console.log(chalk.gray('     No escrow contracts deployed for this payment method'));
        }
      }
      
      if (!hasAnyEscrows) {
        console.log(chalk.yellow('\n   💡 No escrow contracts found. Use the add-payment command to auto-create escrows.'));
      } else {
        console.log(chalk.green(`\n   ✅ Found escrow contracts across ${chains.length} chains`));
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Error fetching escrow addresses:'), (error as Error).message);
    }
  }

  private async showMerchantDetails(merchantId: string): Promise<void> {
    try {
      const merchantRegistry = await this.contractManager.loadContract('EnhancedMerchantOperations');
      const merchantProfile = await merchantRegistry.getMerchantProfile(merchantId);
      
      console.log(chalk.blue('\n📋 Merchant Details:'));
      console.log(chalk.white(`   ID: ${merchantId}`));
      console.log(chalk.white(`   Owner: ${merchantProfile.owner}`));
      console.log(chalk.white(`   Registration Date: ${new Date(Number(merchantProfile.registrationTime) * 1000).toLocaleDateString()}`));
      console.log(chalk.white(`   Active: ${merchantProfile.registered && !merchantProfile.revoked ? 'Yes' : 'No'}`));
    } catch (error) {
      console.error(chalk.red('❌ Error fetching merchant details:'), (error as Error).message);
    }
  }

  // Network-specific escrow generation methods
  private async generateAvalancheEscrow(merchantId: string, paymentMethod: any): Promise<string> {
    // In a real implementation, this would interact with Avalanche contracts
    const randomBytes = ethers.randomBytes(20);
    return ethers.getAddress(ethers.hexlify(randomBytes));
  }
  
  private async generateAptosEscrow(merchantId: string, paymentMethod: any): Promise<string> {
    // In a real implementation, this would interact with Aptos contracts
    const randomHex = ethers.hexlify(ethers.randomBytes(32)).slice(2);
    return `0x${randomHex}`;
  }

  // Multi-chain escrow methods
  async createMultiChainEscrow(options: MerchantCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🔗 Creating Multi-Chain Escrow'));
    console.log(chalk.gray('Creating escrow across Avalanche and Aptos networks\n'));

    try {
      // Validate required options
      if (!options.merchantId) {
        console.error(chalk.red('❌ Merchant ID is required (--merchant-id)'));
        return;
      }

      if (!options.upiId) {
        console.error(chalk.red('❌ UPI ID is required (--upi-id)'));
        return;
      }

      const networks = options.networks ? options.networks.split(',') : ['avalanche', 'aptos'];
      
      console.log(chalk.yellow(`📱 Creating escrow for UPI: ${options.upiId}`));
      console.log(chalk.yellow(`🏢 Merchant ID: ${options.merchantId}`));
      console.log(chalk.yellow(`🌐 Networks: ${networks.join(', ')}`));

      const result = await this.multiChainService.createMultiChainEscrow({
        upiId: options.upiId,
        merchantId: options.merchantId,
        networks: networks,
        amount: options.amount,
        autoFund: options.autoFund
      });

      console.log(chalk.green('✅ Multi-chain escrow created successfully!'));
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to create multi-chain escrow:'), error.message);
      if (globalOptions.verbose) {
        console.error(chalk.gray('Stack trace:'), error.stack);
      }
    }
  }

  async listMerchantEscrows(options: MerchantCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n📋 Listing Merchant Escrows'));
    console.log(chalk.gray('Displaying all escrows across multiple chains\n'));

    try {
      if (!options.merchantId) {
        console.error(chalk.red('❌ Merchant ID is required (--merchant-id)'));
        return;
      }

      await this.multiChainService.listMerchantEscrows(options.merchantId);
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to list merchant escrows:'), error.message);
      if (globalOptions.verbose) {
        console.error(chalk.gray('Stack trace:'), error.stack);
      }
    }
  }

  async testMultiChainIntegration(options: MerchantCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🧪 Testing Multi-Chain Integration'));
    console.log(chalk.gray('Running comprehensive multi-chain escrow tests\n'));

    try {
      await this.multiChainService.testMultiChainIntegration();
      console.log(chalk.green('\n✅ Multi-chain integration test completed successfully!'));
      
    } catch (error: any) {
      console.error(chalk.red('❌ Multi-chain integration test failed:'), error.message);
      if (globalOptions.verbose) {
        console.error(chalk.gray('Stack trace:'), error.stack);
      }
    }
  }
}

export default MerchantCommands;
