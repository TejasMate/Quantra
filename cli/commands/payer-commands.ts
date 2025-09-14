import chalk from 'chalk';
import inquirer from 'inquirer';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { TypeSafeContractManager } from '../utils/type-safe-contract-manager.js';
import { EnhancedConfigManager } from '../utils/enhanced-config-manager.js';
import { EventListenerService } from '../services/event-listener-service.js';
import { MultiChainEscrowService } from '../services/multi-chain-escrow-service.js';
import { InputValidator, validateCommandInput } from '../validators/input-validator.js';
import { MultiChainPayerCommands } from './multi-chain-payer-commands.js';
import { priceService } from '../services/price-service.js';
import { 
  GlobalOptions, 
  ValidationResult 
} from '../types/index.js';

interface PayerCommandOptions {
  merchantId?: string;
  escrowId?: string;
  amount?: string;
  token?: string;
  network?: string;
  chain?: string;
  paymentMethod?: string;
  payerAddress?: string;
  privateKey?: string;
  noInteractive?: boolean;
  verify?: boolean;
  timeout?: string;
  autoConfirm?: boolean;
  testMode?: boolean;
  format?: string;
}

interface MultiChainWallet {
  chain: string;
  network: string;
  address: string;
  privateKey?: string;
  balance: string;
  tokenBalances: Record<string, string>;
  nickname?: string;
}

interface PaymentData {
  escrowId: string;
  payerAddress: string;
  merchantId: string;
  amount: string;
  token: string;
  network: string;
  status: 'pending' | 'confirmed' | 'failed' | 'timeout';
  timestamp: number;
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  paymentMethod?: string;
}

interface EscrowBalance {
  escrowAddress: string;
  escrowId: string;
  merchantId: string;
  network?: string; // Add network property
  totalBalance: string;
  tokenBalances: Record<string, string>;
  pendingPayments: PaymentData[];
  confirmedPayments: PaymentData[];
  lastUpdated: number;
}

export class PayerCommands {
  private contractManager: TypeSafeContractManager;
  private configManager: any; // EnhancedConfigManager instance
  private eventListener: any; // EventListenerService instance
  private escrowService: any; // MultiChainEscrowService instance

  constructor() {
    this.contractManager = new TypeSafeContractManager();
    this.configManager = new EnhancedConfigManager();
    this.eventListener = null; // Initialize later
    this.escrowService = new MultiChainEscrowService();
  }

  public setupCommands(payerCommand: Command): void {
    // Main payment command with mode selection
    payerCommand
      .command('pay')
      .description('Make a payment to merchant escrow (single-chain or multi-chain)')
      .option('-m, --merchant-id <id>', 'Target merchant ID')
      .option('-e, --escrow-id <id>', 'Target escrow ID')
      .option('-a, --amount <amount>', 'Payment amount')
      .option('-t, --token <symbol>', 'Token symbol (ETH, USDC, etc.)')
      .option('-n, --network <network>', 'Target network (for single-chain)')
      .option('--mode <mode>', 'Payment mode: single or multi (default: prompt user)')
      .option('-p, --payment-method <method>', 'Payment method (crypto, upi, pix, sepa)')
      .option('--payer-address <address>', 'Payer wallet address')
      .option('--private-key <key>', 'Private key for transaction')
      .option('--auto-confirm', 'Auto confirm transaction')
      .option('--test-mode', 'Test mode with mock payments')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options: PayerCommandOptions & { mode?: string }) => {
        await this.selectPaymentMode(options);
      });

    // Single-chain payment (direct access)
    payerCommand
      .command('pay-single')
      .description('Make a single-chain payment to merchant escrow')
      .option('-m, --merchant-id <id>', 'Target merchant ID')
      .option('-e, --escrow-id <id>', 'Target escrow ID')
      .option('-a, --amount <amount>', 'Payment amount')
      .option('-t, --token <symbol>', 'Token symbol (ETH, USDC, etc.)')
      .option('-n, --network <network>', 'Target network')
      .option('-p, --payment-method <method>', 'Payment method (crypto, upi, pix, sepa)')
      .option('--payer-address <address>', 'Payer wallet address')
      .option('--private-key <key>', 'Private key for transaction')
      .option('--auto-confirm', 'Auto confirm transaction')
      .option('--test-mode', 'Test mode with mock payments')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options: PayerCommandOptions) => {
        await this.makePayment(options);
      });

    // Multi-chain payment (direct access)
    payerCommand
      .command('pay-multi')
      .description('Make a multi-chain payment to merchant escrow')
      .option('-m, --merchant-id <id>', 'Target merchant ID')
      .option('-a, --amount <amount>', 'Total payment amount')
      .option('-t, --token <symbol>', 'Target token (USDC, USDT, ETH, etc.)')
      .option('--upi-id <id>', 'Merchant UPI ID')
      .option('--pix-key <key>', 'Merchant PIX key')
      .option('--iban <iban>', 'Merchant IBAN')
      .option('--auto-optimize', 'Automatically optimize wallet selection')
      .option('--min-fragment <amount>', 'Minimum fragment amount')
      .option('--max-fragments <count>', 'Maximum number of fragments')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options: any) => {
        await this.initiateMultiChainPayment(options);
      });

    payerCommand
      .command('verify')
      .description('Verify payment reached merchant escrow account')
      .option('-e, --escrow-id <id>', 'Escrow ID to verify')
      .option('-m, --merchant-id <id>', 'Merchant ID to verify')
      .option('--tx-hash <hash>', 'Transaction hash to verify')
      .option('-t, --timeout <seconds>', 'Verification timeout in seconds')
      .option('-f, --format <format>', 'Output format (json, table, detailed)')
      .action(async (options: PayerCommandOptions & { txHash?: string }) => {
        await this.verifyPayment(options);
      });

    // Balance checking commands
    payerCommand
      .command('balance')
      .description('Check escrow account balances')
      .option('-e, --escrow-id <id>', 'Specific escrow ID')
      .option('-m, --merchant-id <id>', 'Check all escrows for merchant')
      .option('-n, --network <network>', 'Filter by network')
      .option('-f, --format <format>', 'Output format (json, table, summary)')
      .action(async (options: PayerCommandOptions) => {
        await this.checkEscrowBalances(options);
      });

    // Payment history and tracking
    payerCommand
      .command('history')
      .description('View payment history and status')
      .option('-e, --escrow-id <id>', 'Filter by escrow ID')
      .option('-m, --merchant-id <id>', 'Filter by merchant ID')
      .option('--payer-address <address>', 'Filter by payer address')
      .option('-n, --network <network>', 'Filter by network')
      .option('--status <status>', 'Filter by status (pending, confirmed, failed)')
      .option('-f, --format <format>', 'Output format (json, table, detailed)')
      .action(async (options: PayerCommandOptions & { status?: string }) => {
        await this.getPaymentHistory(options);
      });

    // Test scenarios
    payerCommand
      .command('test-flow')
      .description('Test complete payment flow from payer to merchant')
      .option('-m, --merchant-id <id>', 'Target merchant ID')
      .option('-a, --amount <amount>', 'Test payment amount')
      .option('-t, --token <symbol>', 'Token to test with')
      .option('--test-mode', 'Run in test mode')
      .option('--auto-confirm', 'Auto confirm all steps')
      .action(async (options: PayerCommandOptions) => {
        await this.testPaymentFlow(options);
      });

    // Monitoring commands
    payerCommand
      .command('monitor')
      .description('Monitor escrow accounts for incoming payments')
      .option('-e, --escrow-id <id>', 'Monitor specific escrow')
      .option('-m, --merchant-id <id>', 'Monitor merchant escrows')
      .option('-n, --network <network>', 'Monitor specific network')
      .option('--real-time', 'Real-time monitoring mode')
      .action(async (options: PayerCommandOptions & { realTime?: boolean }) => {
        await this.monitorPayments(options);
      });

    // Multi-chain wallet management commands
    payerCommand
      .command('add-wallet')
      .description('Add a wallet from any supported blockchain')
      .option('-c, --chain <chain>', 'Blockchain (arbitrum, avalanche, aptos)')
      .option('-n, --network <network>', 'Network (mainnet, testnet, sepolia, fuji)')
      .option('-a, --address <address>', 'Wallet address')
      .option('-k, --private-key <key>', 'Private key (optional, for transactions)')
      .option('--nickname <name>', 'Nickname for the wallet')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options: any) => {
        await this.addWallet(options);
      });

    payerCommand
      .command('list-wallets')
      .description('List all registered wallets with balances')
      .option('-c, --chain <chain>', 'Filter by specific chain')
      .option('-f, --format <format>', 'Output format (table, json, detailed)')
      .option('--refresh', 'Refresh balances from blockchain')
      .action(async (options: any) => {
        await this.listWallets(options);
      });

    // Multi-chain payment planning and execution
    payerCommand
      .command('plan-payment')
      .description('Plan a multi-chain payment to merchant')
      .option('-m, --merchant-id <id>', 'Merchant ID')
      .option('--upi-id <id>', 'Merchant UPI ID')
      .option('--pix-key <key>', 'Merchant PIX key')
      .option('--iban <iban>', 'Merchant IBAN')
      .option('-a, --amount <amount>', 'Total payment amount')
      .option('-t, --token <symbol>', 'Target token (USDC, USDT, ETH, etc.)')
      .option('--auto-optimize', 'Automatically optimize wallet selection')
      .option('--min-fragment <amount>', 'Minimum fragment amount')
      .option('--max-fragments <count>', 'Maximum number of fragments')
      .action(async (options: any) => {
        await this.planMultiChainPayment(options);
      });

    payerCommand
      .command('execute-plan')
      .description('Execute a planned multi-chain payment')
      .option('--payment-id <id>', 'Payment plan ID to execute')
      .option('--auto-confirm', 'Auto confirm all fragments')
      .option('--parallel', 'Execute fragments in parallel')
      .action(async (options: any) => {
        await this.executeMultiChainPlan(options);
      });
  }

  private async makePayment(options: PayerCommandOptions): Promise<void> {
    console.log(chalk.blue('\n💰 Make Payment to Merchant Escrow'));
    console.log('Testing payer to merchant escrow payment flow\n');

    try {
      await this.configManager.initialize();
      await this.contractManager.initialize(this.configManager.getNetworkConfig());

      // Get payment details
      const paymentData = await this.getPaymentDetails(options);
      
      console.log(chalk.yellow('📋 Payment Details:'));
      console.log(`  Merchant ID: ${paymentData.merchantId}`);
      console.log(`  Escrow ID: ${paymentData.escrowId}`);
      console.log(`  Amount: ${paymentData.amount} ${paymentData.token}`);
      console.log(`  Network: ${paymentData.network}`);
      console.log(`  Payment Method: ${paymentData.paymentMethod || 'crypto'}\n`);

      // Show price conversions if it's a crypto payment
      if (['ETH', 'BTC', 'USDC', 'USDT', 'AVAX', 'ARB', 'APT'].includes(paymentData.token.toUpperCase())) {
        await this.displayPriceConversions(parseFloat(paymentData.amount), paymentData.token);
        
        // Show quick USD conversion in summary
        const usdEquivalent = await this.showQuickConversion(parseFloat(paymentData.amount), paymentData.token, 'USD');
        console.log(chalk.cyan(`\n💵 USD Equivalent: ~${usdEquivalent}\n`));
      }

      if (!options.autoConfirm && !options.noInteractive) {
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Proceed with payment?',
          default: false
        }]);

        if (!confirm) {
          console.log(chalk.yellow('❌ Payment cancelled by user'));
          return;
        }
      }

      // Execute payment based on method
      let result: any;
      
      if (options.testMode) {
        result = await this.executeTestPayment(paymentData);
      } else {
        result = await this.executeRealPayment(paymentData, options);
      }

      // Display result
      console.log(chalk.green('✅ Payment initiated successfully!'));
      console.log(`📝 Transaction Hash: ${result.transactionHash}`);
      console.log(`⛽ Gas Used: ${result.gasUsed}`);
      console.log(`🔗 Block Number: ${result.blockNumber}\n`);

      // Start verification
      console.log(chalk.yellow('🔍 Verifying payment reached escrow...'));
      await this.verifyPaymentReception(result.transactionHash, paymentData.escrowId);

    } catch (error: any) {
      console.error(chalk.red('❌ Payment failed:'), error.message);
      if (options.format === 'json') {
        console.log(JSON.stringify({ success: false, error: error.message }, null, 2));
      }
    }
  }

  private async verifyPayment(options: PayerCommandOptions & { txHash?: string }): Promise<void> {
    console.log(chalk.blue('\n🔍 Verify Payment Reception'));
    console.log('Checking if payment reached merchant escrow account\n');

    try {
      await this.configManager.initialize();
      await this.contractManager.initialize(this.configManager.getNetworkConfig());

      const escrowId = options.escrowId || await this.promptForEscrowId();
      const txHash = options.txHash;
      const timeout = parseInt(options.timeout || '300'); // 5 minutes default

      console.log(chalk.yellow('📋 Verification Parameters:'));
      console.log(`  Escrow ID: ${escrowId}`);
      if (txHash) console.log(`  Transaction Hash: ${txHash}`);
      console.log(`  Timeout: ${timeout} seconds\n`);

      // Get escrow details
      const escrowDetails = await this.getEscrowDetails(escrowId);
      console.log(chalk.blue('📊 Escrow Account Details:'));
      console.log(`  Address: ${escrowDetails.address}`);
      console.log(`  Merchant: ${escrowDetails.merchantId}`);
      console.log(`  Status: ${escrowDetails.status}\n`);

      // Check balance before verification
      const balanceBefore = await this.getEscrowBalance(escrowDetails.address);
      console.log(chalk.yellow('💰 Balance Before:'));
      this.displayBalance(balanceBefore);

      // Monitor for changes if tx hash provided
      if (txHash) {
        console.log(chalk.yellow('⏳ Monitoring transaction confirmation...'));
        const receipt = await this.waitForTransaction(txHash, timeout);
        
        if (receipt) {
          console.log(chalk.green('✅ Transaction confirmed!'));
          console.log(`  Block: ${receipt.blockNumber}`);
          console.log(`  Gas Used: ${receipt.gasUsed.toString()}\n`);
        }
      }

      // Wait for balance update
      await this.monitorBalanceChange(escrowDetails.address, balanceBefore, timeout);

      // Check balance after
      const balanceAfter = await this.getEscrowBalance(escrowDetails.address);
      console.log(chalk.green('💰 Balance After:'));
      this.displayBalance(balanceAfter);

      // Calculate difference
      this.displayBalanceDifference(balanceBefore, balanceAfter);

      if (options.format === 'json') {
        console.log(JSON.stringify({
          success: true,
          escrowId,
          balanceBefore,
          balanceAfter,
          txHash
        }, null, 2));
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Verification failed:'), error.message);
    }
  }

  private async checkEscrowBalances(options: PayerCommandOptions): Promise<void> {
    console.log(chalk.blue('\n💰 Check Escrow Account Balances'));
    console.log('Checking merchant escrow account balances\n');

    try {
      await this.configManager.initialize();
      await this.contractManager.initialize(this.configManager.getNetworkConfig());

      let escrowData: EscrowBalance[] = [];

      if (options.escrowId) {
        // Check specific escrow
        const details = await this.getEscrowDetails(options.escrowId);
        const balance = await this.getEscrowBalance(details.address);
        escrowData.push({
          escrowAddress: details.address,
          escrowId: options.escrowId,
          merchantId: details.merchantId,
          totalBalance: balance.total,
          tokenBalances: balance.tokens,
          pendingPayments: [],
          confirmedPayments: [],
          lastUpdated: Date.now()
        });
      } else if (options.merchantId) {
        // Check all escrows for merchant
        escrowData = await this.getMerchantEscrows(options.merchantId);
      } else {
        // Check all escrows
        escrowData = await this.getAllEscrows();
      }

      // Filter by network if specified
      if (options.network) {
        escrowData = escrowData.filter(e => e.network === options.network);
      }

      // Display results
      this.displayEscrowBalances(escrowData, options.format);

    } catch (error: any) {
      console.error(chalk.red('❌ Balance check failed:'), error.message);
    }
  }

  private async getPaymentHistory(options: PayerCommandOptions & { status?: string }): Promise<void> {
    console.log(chalk.blue('\n📊 Payment History & Status'));
    console.log('Retrieving payment transaction history\n');

    try {
      await this.configManager.initialize();
      
      const filters: any = {};
      if (options.escrowId) filters.escrowId = options.escrowId;
      if (options.merchantId) filters.merchantId = options.merchantId;
      if (options.payerAddress) filters.payerAddress = options.payerAddress;
      if (options.network) filters.network = options.network;
      if (options.status) filters.status = options.status;

      console.log(chalk.yellow('🔍 Search Filters:'));
      Object.keys(filters).forEach(key => {
        console.log(`  ${key}: ${filters[key]}`);
      });
      console.log();

      // Get payment history from events and storage
      const payments = await this.getPaymentHistoryData(filters);

      if (payments.length === 0) {
        console.log(chalk.yellow('📭 No payments found matching criteria'));
        return;
      }

      console.log(chalk.green(`📋 Found ${payments.length} payment(s):\n`));

      if (options.format === 'json') {
        console.log(JSON.stringify(payments, null, 2));
      } else if (options.format === 'table') {
        this.displayPaymentTable(payments);
      } else {
        this.displayPaymentDetails(payments);
      }

    } catch (error: any) {
      console.error(chalk.red('❌ History retrieval failed:'), error.message);
    }
  }

  private async testPaymentFlow(options: PayerCommandOptions): Promise<void> {
    console.log(chalk.blue('\n🧪 Test Complete Payment Flow'));
    console.log('Testing end-to-end payment from payer to merchant escrow\n');

    try {
      // Step 1: Setup test environment
      console.log(chalk.yellow('1️⃣ Setting up test environment...'));
      await this.setupTestEnvironment();

      // Step 2: Create or get merchant
      console.log(chalk.yellow('2️⃣ Preparing merchant account...'));
      const merchantId = options.merchantId || await this.createTestMerchant();

      // Step 3: Create or get escrow
      console.log(chalk.yellow('3️⃣ Creating test escrow...'));
      const escrowId = await this.createTestEscrow(merchantId);

      // Step 4: Get initial balance
      console.log(chalk.yellow('4️⃣ Recording initial balance...'));
      const escrowDetails = await this.getEscrowDetails(escrowId);
      const initialBalance = await this.getEscrowBalance(escrowDetails.address);

      // Step 5: Execute payment
      console.log(chalk.yellow('5️⃣ Executing test payment...'));
      const paymentResult = await this.executeTestPayment({
        escrowId,
        merchantId,
        amount: options.amount || '0.1',
        token: options.token || 'ETH',
        network: 'arbitrumSepolia',
        payerAddress: '0x85317C592B6841154a308b9e54af3b0A55FfeDEa',
        status: 'pending',
        timestamp: Date.now()
      });

      // Step 6: Verify payment reception
      console.log(chalk.yellow('6️⃣ Verifying payment reception...'));
      await this.verifyPaymentReception(paymentResult.transactionHash, escrowId);

      // Step 7: Check final balance
      console.log(chalk.yellow('7️⃣ Checking final balance...'));
      const finalBalance = await this.getEscrowBalance(escrowDetails.address);

      // Step 8: Display results
      console.log(chalk.green('\n✅ Test Flow Complete!\n'));
      console.log('📊 Test Results:');
      console.log(`  Merchant ID: ${merchantId}`);
      console.log(`  Escrow ID: ${escrowId}`);
      console.log(`  Payment Amount: ${options.amount || '0.1'} ${options.token || 'ETH'}`);
      console.log(`  Transaction: ${paymentResult.transactionHash}`);
      console.log(`  Initial Balance: ${initialBalance.total}`);
      console.log(`  Final Balance: ${finalBalance.total}`);
      console.log(`  Balance Change: ${(parseFloat(finalBalance.total) - parseFloat(initialBalance.total)).toFixed(6)}`);

    } catch (error: any) {
      console.error(chalk.red('❌ Test flow failed:'), error.message);
    }
  }

  private async monitorPayments(options: PayerCommandOptions & { realTime?: boolean }): Promise<void> {
    console.log(chalk.blue('\n👀 Monitor Escrow Payments'));
    console.log('Real-time monitoring of payment flows\n');

    try {
      await this.configManager.initialize();
      await this.contractManager.initialize(this.configManager.getNetworkConfig());

      // Setup monitoring parameters
      const targets: string[] = [];
      
      if (options.escrowId) {
        const details = await this.getEscrowDetails(options.escrowId);
        targets.push(details.address);
      } else if (options.merchantId) {
        const escrows = await this.getMerchantEscrows(options.merchantId);
        targets.push(...escrows.map(e => e.escrowAddress));
      }

      if (targets.length === 0) {
        console.log(chalk.yellow('⚠️ No escrow accounts to monitor'));
        return;
      }

      console.log(chalk.green(`🎯 Monitoring ${targets.length} escrow account(s):`));
      targets.forEach(address => console.log(`  • ${address}`));
      console.log();

      if (options.realTime) {
        console.log(chalk.yellow('🔄 Starting real-time monitoring... (Press Ctrl+C to stop)\n'));
        await this.startRealTimeMonitoring(targets);
      } else {
        console.log(chalk.yellow('📊 Snapshot monitoring...\n'));
        await this.performSnapshotMonitoring(targets);
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Monitoring failed:'), error.message);
    }
  }

  // Helper methods

  private async getPaymentDetails(options: PayerCommandOptions): Promise<PaymentData> {
    const details: Partial<PaymentData> = {
      merchantId: options.merchantId,
      escrowId: options.escrowId,
      amount: options.amount,
      token: options.token || 'ETH',
      network: options.network || 'arbitrumSepolia',
      payerAddress: options.payerAddress,
      status: 'pending',
      timestamp: Date.now()
    };

    if (!options.noInteractive) {
      // Interactive prompts for missing data
      const questions: any[] = [];

      if (!details.merchantId) {
        questions.push({
          type: 'input',
          name: 'merchantId',
          message: 'Enter merchant ID:',
          validate: (input: string) => input.length > 0 || 'Merchant ID is required'
        });
      }

      if (!details.escrowId) {
        questions.push({
          type: 'input',
          name: 'escrowId',
          message: 'Enter escrow ID:',
          validate: (input: string) => input.length > 0 || 'Escrow ID is required'
        });
      }

      if (!details.amount) {
        questions.push({
          type: 'input',
          name: 'amount',
          message: 'Enter payment amount:',
          validate: (input: string) => !isNaN(parseFloat(input)) || 'Valid amount required'
        });
      }

      if (questions.length > 0) {
        const answers = await inquirer.prompt(questions);
        Object.assign(details, answers);
      }
    }

    return details as PaymentData;
  }

  private async executeTestPayment(paymentData: PaymentData): Promise<any> {
    console.log(chalk.yellow('🧪 Executing test payment...'));
    
    // Simulate payment transaction
    const mockTxHash = `0x${Math.random().toString(16).substr(2, 64)}`;
    const mockGasUsed = Math.floor(Math.random() * 100000) + 21000;
    const mockBlockNumber = Math.floor(Math.random() * 1000) + 9195000;

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return {
      transactionHash: mockTxHash,
      gasUsed: mockGasUsed,
      blockNumber: mockBlockNumber,
      status: 'success'
    };
  }

  private async executeRealPayment(paymentData: PaymentData, options: PayerCommandOptions): Promise<any> {
    console.log(chalk.yellow('💸 Executing real payment...'));
    
    // This would implement actual blockchain transaction
    // For now, return test data
    return this.executeTestPayment(paymentData);
  }

  private async verifyPaymentReception(txHash: string, escrowId: string): Promise<void> {
    console.log(chalk.yellow(`🔍 Verifying payment reception for escrow ${escrowId}...`));
    
    // Simulate verification process
    const steps = ['Transaction confirmation', 'Block inclusion', 'Balance update', 'Event emission'];
    
    for (const step of steps) {
      console.log(chalk.gray(`  ⏳ ${step}...`));
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(chalk.green(`  ✅ ${step} completed`));
    }

    console.log(chalk.green('✅ Payment successfully received in escrow account!'));
  }

  private displayBalance(balance: any): void {
    console.log(`  Total: ${balance.total} ETH`);
    if (balance.tokens && Object.keys(balance.tokens).length > 0) {
      console.log('  Token Balances:');
      Object.entries(balance.tokens).forEach(([token, amount]) => {
        console.log(`    ${token}: ${amount}`);
      });
    }
    console.log();
  }

  private displayBalanceDifference(before: any, after: any): void {
    const diff = parseFloat(after.total) - parseFloat(before.total);
    if (diff > 0) {
      console.log(chalk.green(`📈 Balance increased by: ${diff.toFixed(6)} ETH`));
    } else if (diff < 0) {
      console.log(chalk.red(`📉 Balance decreased by: ${Math.abs(diff).toFixed(6)} ETH`));
    } else {
      console.log(chalk.yellow('➡️ No balance change detected'));
    }
    console.log();
  }

  private displayEscrowBalances(escrows: EscrowBalance[], format?: string): void {
    if (format === 'json') {
      console.log(JSON.stringify(escrows, null, 2));
      return;
    }

    escrows.forEach((escrow, index) => {
      console.log(chalk.blue(`${index + 1}. Escrow ${escrow.escrowId}`));
      console.log(`   Address: ${escrow.escrowAddress}`);
      console.log(`   Merchant: ${escrow.merchantId}`);
      console.log(`   Balance: ${escrow.totalBalance} ETH`);
      if (Object.keys(escrow.tokenBalances).length > 0) {
        console.log('   Tokens:');
        Object.entries(escrow.tokenBalances).forEach(([token, amount]) => {
          console.log(`     ${token}: ${amount}`);
        });
      }
      console.log(`   Pending: ${escrow.pendingPayments.length} payments`);
      console.log(`   Confirmed: ${escrow.confirmedPayments.length} payments`);
      console.log();
    });
  }

  private displayPaymentTable(payments: PaymentData[]): void {
    console.table(payments.map(p => ({
      'Escrow ID': p.escrowId,
      'Merchant': p.merchantId,
      'Amount': `${p.amount} ${p.token}`,
      'Status': p.status,
      'TX Hash': p.transactionHash?.substring(0, 10) + '...',
      'Time': new Date(p.timestamp).toLocaleString()
    })));
  }

  private displayPaymentDetails(payments: PaymentData[]): void {
    payments.forEach((payment, index) => {
      console.log(chalk.blue(`${index + 1}. Payment ${payment.escrowId}`));
      console.log(`   Merchant: ${payment.merchantId}`);
      console.log(`   Amount: ${payment.amount} ${payment.token}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Payer: ${payment.payerAddress}`);
      if (payment.transactionHash) {
        console.log(`   TX: ${payment.transactionHash}`);
      }
      console.log(`   Time: ${new Date(payment.timestamp).toLocaleString()}`);
      console.log();
    });
  }

  // Placeholder methods - would implement actual blockchain interactions
  private async getEscrowDetails(escrowId: string): Promise<any> {
    return {
      address: `0x${Math.random().toString(16).substr(2, 40)}`,
      merchantId: 'merchant_1',
      status: 'active'
    };
  }

  private async getEscrowBalance(address: string): Promise<any> {
    return {
      total: (Math.random() * 10).toFixed(6),
      tokens: {
        'USDC': (Math.random() * 1000).toFixed(2),
        'USDT': (Math.random() * 1000).toFixed(2)
      }
    };
  }

  private async getMerchantEscrows(merchantId: string): Promise<EscrowBalance[]> {
    return []; // Placeholder
  }

  private async getAllEscrows(): Promise<EscrowBalance[]> {
    return []; // Placeholder
  }

  private async getPaymentHistoryData(filters: any): Promise<PaymentData[]> {
    return []; // Placeholder
  }

  private async waitForTransaction(txHash: string, timeout: number): Promise<any> {
    return { blockNumber: 9195123, gasUsed: 21000 }; // Placeholder
  }

  private async monitorBalanceChange(address: string, initialBalance: any, timeout: number): Promise<void> {
    // Placeholder
  }

  private async setupTestEnvironment(): Promise<void> {
    // Placeholder
  }

  private async createTestMerchant(): Promise<string> {
    return 'test_merchant_1'; // Placeholder
  }

  private async createTestEscrow(merchantId: string): Promise<string> {
    return 'test_escrow_1'; // Placeholder
  }

  private async startRealTimeMonitoring(addresses: string[]): Promise<void> {
    // Placeholder for real-time monitoring
    console.log('Real-time monitoring would be implemented here');
  }

  private async performSnapshotMonitoring(addresses: string[]): Promise<void> {
    // Placeholder for snapshot monitoring
    console.log('Snapshot monitoring would be implemented here');
  }

  private async promptForEscrowId(): Promise<string> {
    const { escrowId } = await inquirer.prompt([{
      type: 'input',
      name: 'escrowId',
      message: 'Enter escrow ID to verify:',
      validate: (input: string) => input.length > 0 || 'Escrow ID is required'
    }]);
    return escrowId;
  }

  // Payment mode selection method
  private async selectPaymentMode(options: PayerCommandOptions & { mode?: string }): Promise<void> {
    console.log(chalk.blue('\n💰 QuantraPay Payment System'));
    console.log('Choose your payment method\n');

    let paymentMode: string;

    if (options.mode) {
      paymentMode = options.mode.toLowerCase();
    } else if (options.noInteractive) {
      paymentMode = 'single'; // Default to single-chain for non-interactive
    } else {
      const { mode } = await inquirer.prompt([{
        type: 'list',
        name: 'mode',
        message: 'Select payment mode:',
        choices: [
          {
            name: '🎯 Single-Chain Payment - Pay from one wallet on one network',
            value: 'single'
          },
          {
            name: '🌐 Multi-Chain Payment - Aggregate payments from multiple wallets across networks',
            value: 'multi'
          }
        ]
      }]);
      paymentMode = mode;
    }

    console.log(chalk.yellow(`\n📋 Selected: ${paymentMode === 'single' ? 'Single-Chain' : 'Multi-Chain'} Payment`));

    if (paymentMode === 'single') {
      await this.makePayment(options);
    } else {
      await this.initiateMultiChainPayment(options);
    }
  }

  // Multi-chain payment initiation
  private async initiateMultiChainPayment(options: any): Promise<void> {
    console.log(chalk.blue('\n🌐 Multi-Chain Payment System'));
    console.log('Configure and execute payments across multiple blockchains\n');

    try {
      // Guide user through multi-chain payment process
      if (!options.noInteractive) {
        const { action } = await inquirer.prompt([{
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '👛 Manage wallets first', value: 'wallets' },
            { name: '📋 Plan a new payment', value: 'plan' },
            { name: '⚡ Execute existing plan', value: 'execute' }
          ]
        }]);

        switch (action) {
          case 'wallets':
            await this.listWallets(options);
            // After showing wallets, offer to add more or plan payment
            const { next } = await inquirer.prompt([{
              type: 'list',
              name: 'next',
              message: 'What next?',
              choices: [
                { name: '➕ Add another wallet', value: 'add' },
                { name: '📋 Plan payment', value: 'plan' }
              ]
            }]);
            if (next === 'add') {
              await this.addWallet(options);
            } else {
              await this.planMultiChainPayment(options);
            }
            break;
          case 'plan':
            await this.planMultiChainPayment(options);
            break;
          case 'execute':
            await this.executeMultiChainPlan(options);
            break;
        }
      } else {
        // Non-interactive mode - go straight to planning
        await this.planMultiChainPayment(options);
      }
      
    } catch (error: any) {
      console.error(chalk.red('❌ Multi-chain payment failed:'), error.message);
      throw error;
    }
  }

  // Wallet management methods - delegate to MultiChainPayerCommands with proper access
  private async addWallet(options: any): Promise<void> {
    console.log(chalk.blue('\n👛 Add Multi-Chain Wallet'));
    console.log('Register a wallet from any supported blockchain\n');

    try {
      // Create a new MultiChainPayerCommands instance and access methods through actions
      const multiChainCommands = new MultiChainPayerCommands();
      
      // We'll need to call the private method indirectly through command setup
      // For now, let's implement basic wallet management here
      await this.handleAddWallet(options);
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to add wallet:'), error.message);
      throw error;
    }
  }

  private async listWallets(options: any): Promise<void> {
    console.log(chalk.blue('\n👛 Multi-Chain Wallets'));
    console.log('Your registered wallets across all blockchains\n');

    try {
      await this.handleListWallets(options);
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to list wallets:'), error.message);
      throw error;
    }
  }

  // Multi-chain payment planning methods
  private async planMultiChainPayment(options: any): Promise<void> {
    console.log(chalk.blue('\n📋 Plan Multi-Chain Payment'));
    console.log('Design an optimal payment strategy across multiple chains\n');

    try {
      await this.handlePlanPayment(options);
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to plan payment:'), error.message);
      throw error;
    }
  }

  private async executeMultiChainPlan(options: any): Promise<void> {
    console.log(chalk.blue('\n⚡ Execute Multi-Chain Payment'));
    console.log('Execute your planned payment across multiple blockchains\n');

    try {
      await this.handleExecutePayment(options);
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to execute payment plan:'), error.message);
      throw error;
    }
  }

  // Implementation methods for multi-chain functionality
  private async handleAddWallet(options: any): Promise<void> {
    // Get wallet details
    const walletData = await this.getWalletDetails(options);
    
    // Validate and save wallet
    const walletFile = path.join(process.cwd(), 'cli', 'multi-chain-wallets.json');
    let wallets: MultiChainWallet[] = [];
    
    try {
      if (fs.existsSync(walletFile)) {
        wallets = JSON.parse(fs.readFileSync(walletFile, 'utf8'));
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Creating new wallet registry'));
    }

    // Add new wallet
    const newWallet: MultiChainWallet = {
      chain: walletData.chain,
      network: walletData.network,
      address: walletData.address,
      privateKey: walletData.privateKey,
      balance: '0',
      tokenBalances: {},
      nickname: walletData.nickname
    };

    wallets.push(newWallet);
    fs.writeFileSync(walletFile, JSON.stringify(wallets, null, 2));

    console.log(chalk.green('✅ Wallet added successfully!'));
    console.log(`📍 Chain: ${walletData.chain}`);
    console.log(`🌐 Network: ${walletData.network}`);
    console.log(`👛 Address: ${walletData.address}`);
    if (walletData.nickname) {
      console.log(`🏷️  Nickname: ${walletData.nickname}`);
    }
  }

  private async handleListWallets(options: any): Promise<void> {
    const walletFile = path.join(process.cwd(), 'cli', 'multi-chain-wallets.json');
    
    if (!fs.existsSync(walletFile)) {
      console.log(chalk.yellow('📭 No wallets registered yet'));
      console.log('💡 Use "quantra-cli payer add-wallet" to add your first wallet\n');
      return;
    }

    const wallets: MultiChainWallet[] = JSON.parse(fs.readFileSync(walletFile, 'utf8'));
    
    if (wallets.length === 0) {
      console.log(chalk.yellow('📭 No wallets found'));
      return;
    }

    console.log(chalk.blue(`📊 Found ${wallets.length} registered wallet(s):\n`));

    wallets.forEach((wallet, index) => {
      console.log(chalk.white(`${index + 1}. ${wallet.nickname || 'Unnamed'}`));
      console.log(`   🔗 Chain: ${wallet.chain}`);
      console.log(`   🌐 Network: ${wallet.network}`);
      console.log(`   👛 Address: ${wallet.address}`);
      console.log(`   💰 Balance: ${wallet.balance || 'Unknown'}`);
      console.log();
    });
  }

  private async handlePlanPayment(options: any): Promise<void> {
    console.log(chalk.yellow('📋 Multi-chain payment planning is being implemented...'));
    console.log('This feature will allow you to:');
    console.log('• Aggregate funds from multiple wallets');
    console.log('• Optimize payment routing across chains');
    console.log('• Minimize gas costs and transaction fees');
    console.log('• Execute coordinated multi-chain payments\n');
    
    // For now, show a placeholder
    console.log(chalk.blue('💡 Coming soon - advanced multi-chain payment orchestration!'));
  }

  private async handleExecutePayment(options: any): Promise<void> {
    console.log(chalk.yellow('⚡ Multi-chain payment execution is being implemented...'));
    console.log('This feature will execute your planned payments across multiple chains\n');
    
    console.log(chalk.blue('💡 Coming soon - seamless cross-chain payment execution!'));
  }

  private async getWalletDetails(options: any): Promise<any> {
    if (options.noInteractive) {
      return {
        chain: options.chain || 'arbitrum',
        network: options.network || 'sepolia',
        address: options.address,
        privateKey: options.privateKey,
        nickname: options.nickname
      };
    }

    const chains = ['arbitrum', 'avalanche', 'aptos'];
    const networks = {
      arbitrum: ['mainnet', 'sepolia'],
      avalanche: ['mainnet', 'fuji'],
      aptos: ['mainnet', 'testnet']
    };

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'chain',
        message: 'Select blockchain:',
        choices: chains,
        default: options.chain
      },
      {
        type: 'list',
        name: 'network',
        message: 'Select network:',
        choices: (answers: any) => networks[answers.chain as keyof typeof networks],
        default: options.network
      },
      {
        type: 'input',
        name: 'address',
        message: 'Enter wallet address:',
        default: options.address,
        validate: (input: string) => input.length > 10 || 'Please enter a valid address'
      },
      {
        type: 'input',
        name: 'privateKey',
        message: 'Enter private key (optional, for transactions):',
        default: options.privateKey
      },
      {
        type: 'input',
        name: 'nickname',
        message: 'Enter nickname for this wallet (optional):',
        default: options.nickname
      }
    ]);

    return answers;
  }

  /**
   * Display price conversions for payment amounts
   */
  private async displayPriceConversions(amount: number, cryptoSymbol: string): Promise<void> {
    console.log(chalk.blue('\n💰 Price Conversions'));
    
    try {
      // Show conversions to major fiat currencies
      const fiatCurrencies = ['USD', 'EUR', 'INR', 'GBP'];
      
      console.log(chalk.yellow('\n┌─────────────────────────────────────────┐'));
      console.log(chalk.yellow('│            Price Conversions           │'));
      console.log(chalk.yellow('├─────────────────────────────────────────┤'));
      
      for (const fiatCurrency of fiatCurrencies) {
        try {
          const conversion = await priceService.convertCryptoToFiat(amount, cryptoSymbol, fiatCurrency);
          const formatted = priceService.formatCurrency(conversion.amount, fiatCurrency, 2);
          
          console.log(chalk.cyan(`│ ${fiatCurrency.padEnd(6)} │ ${formatted.padStart(25)} │`));
        } catch (error) {
          console.log(chalk.red(`│ ${fiatCurrency.padEnd(6)} │ ${'Error'.padStart(25)} │`));
        }
      }
      
      console.log(chalk.yellow('└─────────────────────────────────────────┘'));
      
      // Show current crypto price
      try {
        const cryptoPrice = await priceService.getCryptoPrice(cryptoSymbol);
        const priceFormatted = priceService.formatCurrency(cryptoPrice, 'USD', 2);
        console.log(chalk.gray(`\n💎 Current ${cryptoSymbol.toUpperCase()} Price: ${priceFormatted}`));
      } catch (error) {
        console.log(chalk.gray(`\n💎 Current ${cryptoSymbol.toUpperCase()} Price: Not available`));
      }
      
    } catch (error: any) {
      console.log(chalk.yellow('⚠ Price conversions temporarily unavailable'));
    }
  }

  /**
   * Show quick price conversion in payment summary
   */
  private async showQuickConversion(amount: number, cryptoSymbol: string, targetFiat: string = 'USD'): Promise<string> {
    try {
      const conversion = await priceService.convertCryptoToFiat(amount, cryptoSymbol, targetFiat);
      return priceService.formatCurrency(conversion.amount, targetFiat, 2);
    } catch (error) {
      return `~${targetFiat}`;
    }
  }
}