#!/usr/bin/env node

import { config } from 'dotenv';
import { Command } from 'commander';
import path from 'path';
import { MerchantCommands } from './commands/merchant-commands.js';
import { DAOCommands } from './commands/dao-commands.js';
import { SystemCommands } from './commands/system-commands.js';
import { PayerCommands } from './commands/payer-commands.js';
import { GaslessCommands } from './commands/gasless-commands.js';
import { SettlerCommands } from './commands/settler-commands.js';
import { kycCommands } from './commands/kyc-commands.js';
import { priceCommands } from './commands/price-commands.js';
import { displayFullHelp, MultiChainHelpDisplay } from './utils/multi-chain-help.js';

// Load environment variables from .env file in current directory
config({ path: 'c:\\Users\\tejas\\Downloads\\Demo01\\cli\\.env' });

// Get configuration from environment variables
const network = process.env.NETWORK || 'localhost';
const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';

const program = new Command();

// CLI metadata
program
    .name('quantra-cli')
    .description('TypeScript CLI for QuantraPay Platform')
    .version('1.0.0');

// Global options (simplified - network and RPC are auto-loaded from .env)
program
    .option('-v, --verbose', 'Enable verbose logging')
    .option('-n, --network <network>', `Specify network (default: ${network})`, network)
    .option('-r, --rpc-url <url>', `RPC URL (default: ${rpcUrl})`, rpcUrl)
    .option('-q, --quiet', 'Suppress non-essential output')
    .option('--private-key <key>', 'Private key for transactions')
    .option('--config <path>', 'Path to configuration file');

// Initialize command instances
const merchantCommands = new MerchantCommands();
const daoCommands = new DAOCommands();
const systemCommands = new SystemCommands();
const payerCommands = new PayerCommands();
const gaslessCommands = new GaslessCommands();

// Merchant commands
const merchantCommand = program
    .command('merchant')
    .description('Merchant management commands');

merchantCommand
    .command('register')
    .description('Register a new merchant')
    .option('--name <name>', 'Business name')
    .option('--region <region>', 'Business region')
    .option('--kyc-level <level>', 'KYC level')
    .option('--address <address>', 'Merchant address')
    .option('--email <email>', 'Business email')
    .option('--phone <phone>', 'Business phone')
    .option('--private-key <key>', 'Private key for transactions')
    .option('--no-interactive', 'Skip interactive prompts')
    .action(async (options) => {
        await merchantCommands.register(options, program.opts());
    });

merchantCommand
    .command('add-payment')
    .description('Add payment method to merchant')
    .option('--merchant-id <id>', 'Merchant ID')
    .option('--type <type>', 'Payment type (UPI, PIX, SEPA)')
    .option('--region <region>', 'Payment region')
    .option('--upi-id <id>', 'UPI ID for UPI payments')
    .option('--pix-key <key>', 'PIX key')
    .option('--key-type <type>', 'PIX key type')
    .option('--iban <iban>', 'IBAN for SEPA')
    .option('--bic <bic>', 'BIC for SEPA')
    .option('--account-holder <name>', 'Account holder name')
    .option('--private-key <key>', 'Private key for transactions')
    .option('--no-interactive', 'Skip interactive prompts')
    .action(async (options) => {
        await merchantCommands.addPaymentMethod(options, program.opts());
    });

merchantCommand
    .command('list')
    .description('List merchants')
    .option('--region <region>', 'Filter by region')
    .option('--active-only', 'Show only active merchants')
    .option('--format <format>', 'Output format (table, json)', 'table')
    .action(async (options) => {
        await merchantCommands.listMerchants(options, program.opts());
    });

merchantCommand
    .command('info')
    .description('Get merchant information')
    .option('--merchant-id <id>', 'Merchant ID')
    .option('--address <address>', 'Merchant address')
    .option('--payment-methods', 'Show payment methods')
    .option('--escrows', 'Show escrow information')
    .action(async (options) => {
        await merchantCommands.getMerchantInfo(options, program.opts());
    });

merchantCommand
    .command('create-multi-escrow')
    .description('Create multi-chain escrow for UPI payment method')
    .option('--merchant-id <id>', 'Merchant ID')
    .option('--upi-id <id>', 'UPI ID for escrow creation')
    .option('--networks <networks>', 'Networks to deploy (avalanche,aptos)', 'avalanche,aptos')
    .option('--amount <amount>', 'Initial funding amount')
    .option('--auto-fund', 'Automatically fund the escrow')
    .action(async (options) => {
        await merchantCommands.createMultiChainEscrow(options, program.opts());
    });

merchantCommand
    .command('list-escrows')
    .description('List all escrows for a merchant')
    .option('--merchant-id <id>', 'Merchant ID')
    .action(async (options) => {
        await merchantCommands.listMerchantEscrows(options, program.opts());
    });

merchantCommand
    .command('test-multi-chain')
    .description('Test multi-chain escrow integration')
    .action(async (options) => {
        await merchantCommands.testMultiChainIntegration(options, program.opts());
    });

merchantCommand
    .command('start-event-listener')
    .description('Start event listener service for cross-chain deployments')
    .action(async (options) => {
        await merchantCommands.startEventListener(program.opts());
    });

// DAO commands
const daoCommand = program
    .command('dao')
    .description('DAO governance commands');

// Setup all DAO commands using the setupCommands method
daoCommands.setupCommands(daoCommand);

// Payer commands
const payerCommand = program
    .command('payer')
    .description('Payer money flow testing commands');

// Setup all payer commands using the setupCommands method  
payerCommands.setupCommands(payerCommand);

// Add multi-chain help commands
payerCommand
    .command('help-multichain')
    .description('Show comprehensive multi-chain payment help')
    .action(() => {
        displayFullHelp();
    });

payerCommand
    .command('help-scenarios')
    .description('Show multi-chain payment use case examples')
    .action(() => {
        MultiChainHelpDisplay.displayMultiChainScenarios();
    });

payerCommand
    .command('help-chains')
    .description('Show supported blockchain networks information')
    .action(() => {
        MultiChainHelpDisplay.displayChainInfo();
    });

// Gasless transaction commands
gaslessCommands.setupCommands(program);

// Settler commands
SettlerCommands.setup(program);

// KYC commands  
program.addCommand(kycCommands);

// Price commands
priceCommands.setupCommands(program);

// System commands
const systemCommand = program
    .command('system')
    .description('System management commands');

systemCommand
    .command('init')
    .description('Initialize CLI configuration')
    .option('--force', 'Force re-initialization')
    .action(async (options) => {
        await systemCommands.showSystemInfo(program.opts());
    });

systemCommand
    .command('status')
    .description('Show system status')
    .option('--contracts', 'Show contract information')
    .option('--merchants', 'Show merchant statistics')
    .option('--dao', 'Show DAO information')
    .action(async (options) => {
        await systemCommands.showStatus(options, program.opts());
    });

systemCommand
    .command('authorize-adapter')
    .description('Authorize/deauthorize adapter')
    .option('--adapter <address>', 'Adapter address')
    .option('--deauthorize', 'Deauthorize instead of authorize')
    .option('--private-key <key>', 'Private key for transactions')
    .action(async (options) => {
        console.log('Authorize adapter functionality not yet implemented');
    });

systemCommand
    .command('list-adapters')
    .description('List authorized adapters')
    .action(async (options) => {
        console.log('List adapters functionality not yet implemented');
    });

// Help examples
program.on('--help', () => {
    console.log('');
    console.log('Examples:');
    console.log('  $ quantra-cli system init');
    console.log('  $ quantra-cli merchant register');
    console.log('  $ quantra-cli merchant add-payment');
    console.log('  $ quantra-cli dao propose');
    console.log('  $ quantra-cli dao vote --proposal-id 1 --vote for');
});

program.parse();
