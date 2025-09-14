import chalk from 'chalk';
import { Command } from 'commander';
import { ethers } from 'ethers';
import { TypeSafeContractManager } from '../utils/type-safe-contract-manager.js';
import { EnhancedConfigManager } from '../utils/enhanced-config-manager.js';
import { ContractInstance } from '../types/index.js';
import { FormattingUtils } from '../utils/formatting-utils.js';
import { NetworkUtils } from '../utils/network-utils.js';
import { ValidationUtils } from '../utils/validation-utils.js';

interface SystemCommandOptions {
    verbose?: boolean;
    contracts?: boolean;
    network?: boolean;
    config?: boolean;
    all?: boolean;
}

interface GlobalOptions {
    network: string;
    privateKey?: string;
    verbose?: boolean;
}

export class SystemCommands {
    private configManager: import('../utils/enhanced-config-manager.js').TypeSafeEnhancedConfigManager;
    private contractManager: TypeSafeContractManager;

    constructor() {
        this.configManager = new EnhancedConfigManager();
        this.contractManager = new TypeSafeContractManager();
    }

    async setupCommands(program: Command): Promise<void> {
        const systemCommand = program
            .command('system')
            .description('System management and diagnostics');

        systemCommand
            .command('status')
            .description('Show system status and health check')
            .option('-v, --verbose', 'Show detailed information')
            .option('-c, --contracts', 'Show contract status')
            .option('-n, --network', 'Show network status')
            .option('--config', 'Show configuration status')
            .option('-a, --all', 'Show all status information')
            .action(async (options: SystemCommandOptions, command: Command) => {
                const globalOptions = command.parent?.opts() as GlobalOptions;
                await this.showStatus(options, globalOptions);
            });

        systemCommand
            .command('health')
            .description('Run comprehensive health check')
            .option('-v, --verbose', 'Show detailed health information')
            .action(async (options: { verbose?: boolean }, command: Command) => {
                const globalOptions = command.parent?.opts() as GlobalOptions;
                await this.runHealthCheck(options, globalOptions);
            });

        systemCommand
            .command('version')
            .description('Show version information')
            .action(() => {
                this.showVersion();
            });

        systemCommand
            .command('info')
            .description('Show system information')
            .action(async (options: any, command: Command) => {
                const globalOptions = command.parent?.opts() as GlobalOptions;
                await this.showSystemInfo(globalOptions);
            });

        systemCommand
            .command('reset')
            .description('Reset system configuration')
            .option('--confirm', 'Confirm the reset operation')
            .action(async (options: { confirm?: boolean }) => {
                await this.resetSystem(options);
            });
    }

    async showStatus(options: SystemCommandOptions, globalOptions: GlobalOptions): Promise<void> {
        console.log(chalk.blue.bold('\n📊 QuantraPay System Status'));
        console.log(chalk.gray(`Network: ${globalOptions.network}\n`));

        try {
            await this.configManager.initialize();
            console.log(chalk.green('✓ Configuration loaded successfully'));
        } catch (error) {
            console.log(chalk.red('✗ Configuration failed to load'));
            console.log(chalk.gray(`Error: ${(error as Error).message}`));
        }

        try {
            // Show network status if requested or if --all is specified
            if (options.network || options.all) {
                await this.showNetworkStatus(globalOptions);
            }

            // Show contract status if requested or if --all is specified
            if (options.contracts || options.all) {
                await this.showContractStatus();
            }

            // Show configuration status if requested or if --all is specified
            if (options.config || options.all) {
                await this.showConfigStatus();
            }

        } catch (error) {
            console.error(chalk.red(`Error during status check: ${(error as Error).message}`));
        }
    }

    private async showContractStatus(): Promise<void> {
        console.log(chalk.yellow.bold('📋 Contract Status:'));
        
        try {
            // Check actual deployed contracts
            const contracts = [
                'MerchantCoreRegistry',
                'MerchantRegionalRegistry',
                'MerchantKYCRegistry',
                'EnhancedMerchantOperations',
                'EscrowDeploymentFactory',
                'CollateralVault',
                'EscrowConfigurationManager'
            ];

            for (const contractName of contracts) {
                try {
                    const address = this.configManager.getContractAddress(contractName, 'arbitrumSepolia');
                    if (address) {
                        console.log(`  ${contractName}: ${chalk.green('✅ Deployed')} at ${chalk.cyan(address)}`);
                    } else {
                        console.log(`  ${contractName}: ${chalk.red('❌ Not deployed')}`);
                    }
                } catch (error) {
                    console.log(`  ${contractName}: ${chalk.red('❌ Error checking')}`);
                }
            }
        } catch (error) {
            console.log(chalk.red(`  Error checking contracts: ${(error as Error).message}`));
        }
    }

    private async showNetworkStatus(globalOptions: GlobalOptions): Promise<void> {
        console.log(chalk.yellow.bold('🌐 Network Status:'));
        
        try {
            const provider = NetworkUtils.createProvider(globalOptions.network);
            const network = await provider.getNetwork();
            const blockNumber = await provider.getBlockNumber();
            
            console.log(`  Network: ${chalk.green(network.name || 'Unknown')}`);
            console.log(`  Chain ID: ${chalk.green(network.chainId.toString())}`);
            console.log(`  Latest Block: ${chalk.green(blockNumber.toString())}`);
            
            // Test connection
            const balance = await provider.getBalance('0x0000000000000000000000000000000000000000');
            console.log(`  Connection: ${chalk.green('✓ Active')}`);
            
        } catch (error) {
            console.log(`  Connection: ${chalk.red('✗ Failed')}`);
            console.log(`  Error: ${chalk.gray((error as Error).message)}`);
        }
    }

    private async showConfigStatus(): Promise<void> {
        console.log(chalk.yellow.bold('⚙️  Configuration Status:'));
        
        try {
            const config = this.configManager.getConfig();
            console.log(`  Initialized: ${chalk.green('✓ Yes')}`);
            console.log(`  Networks: ${chalk.green(Object.keys(config.networks || {}).length.toString())}`);
            console.log(`  Features: ${chalk.green(Object.keys(config.features || {}).length.toString())}`);
            
        } catch (error) {
            console.log(`  Status: ${chalk.red('✗ Error')}`);
            console.log(`  Error: ${chalk.gray((error as Error).message)}`);
        }
    }

    async runHealthCheck(options: { verbose?: boolean }, globalOptions: GlobalOptions): Promise<void> {
        console.log(chalk.blue.bold('\n🏥 System Health Check'));
        console.log(chalk.gray('Running comprehensive system diagnostics...\n'));

        const checks = [
            { name: 'Configuration', fn: () => this.checkConfiguration() },
            { name: 'Network Connectivity', fn: () => this.checkNetworkConnectivity(globalOptions) },
            { name: 'Contract Deployments', fn: () => this.checkContractDeployments() },
            { name: 'Dependencies', fn: () => this.checkDependencies() }
        ];

        for (const check of checks) {
            process.stdout.write(`  ${check.name}... `);
            
            try {
                const result = await check.fn();
                if (result) {
                    console.log(chalk.green('✓ Pass'));
                    if (options.verbose && typeof result === 'string') {
                        console.log(chalk.gray(`    ${result}`));
                    }
                } else {
                    console.log(chalk.yellow('⚠ Warning'));
                }
            } catch (error) {
                console.log(chalk.red('✗ Fail'));
                if (options.verbose) {
                    console.log(chalk.gray(`    ${(error as Error).message}`));
                }
            }
        }

        console.log(chalk.blue('\n📋 Health check completed'));
    }

    private async checkConfiguration(): Promise<boolean> {
        try {
            await this.configManager.initialize();
            const config = this.configManager.getConfig();
            return config && Object.keys(config).length > 0;
        } catch (error) {
            throw new Error(`Configuration check failed: ${(error as Error).message}`);
        }
    }

    private async checkNetworkConnectivity(globalOptions: GlobalOptions): Promise<boolean> {
        try {
            const provider = NetworkUtils.createProvider(globalOptions.network);
            await provider.getBlockNumber();
            return true;
        } catch (error) {
            throw new Error(`Network connectivity failed: ${(error as Error).message}`);
        }
    }

    private async checkContractDeployments(): Promise<boolean> {
        try {
            // This would check if contracts are deployed
            // For now, return false as contracts are not deployed yet
            return false;
        } catch (error) {
            throw new Error(`Contract deployment check failed: ${(error as Error).message}`);
        }
    }

    private async checkDependencies(): Promise<boolean> {
        try {
            // Check if required dependencies are available
            const ethersVersion = require('ethers/package.json').version;
            const chalkVersion = require('chalk/package.json').version;
            return true;
        } catch (error) {
            throw new Error(`Dependency check failed: ${(error as Error).message}`);
        }
    }

    showVersion(): void {
        console.log(chalk.blue.bold('\n📦 QuantraPay CLI Version Information'));
        console.log(`  CLI Version: ${chalk.green('1.0.0')}`);
        console.log(`  Node.js: ${chalk.green(process.version)}`);
        console.log(`  Platform: ${chalk.green(process.platform)}`);
        console.log(`  Architecture: ${chalk.green(process.arch)}`);
        
        try {
            const ethersVersion = require('ethers/package.json').version;
            console.log(`  Ethers.js: ${chalk.green(ethersVersion)}`);
        } catch (error) {
            console.log(`  Ethers.js: ${chalk.gray('Unknown')}`);
        }
    }

    async showSystemInfo(globalOptions: GlobalOptions): Promise<void> {
        console.log(chalk.blue.bold('\n💻 System Information'));
        
        try {
            await this.configManager.initialize();
            const config = this.configManager.getConfig();
            
            console.log(chalk.yellow.bold('\nConfiguration:'));
            console.log(`  Config Path: ${chalk.gray('~/.quantra-cli')}`);
            console.log(`  Networks: ${chalk.green(Object.keys(config.networks || {}).length.toString())}`);
            console.log(`  Current Network: ${chalk.green(globalOptions.network)}`);
            
            console.log(chalk.yellow.bold('\nRuntime:'));
            console.log(`  Node Version: ${chalk.green(process.version)}`);
            console.log(`  Memory Usage: ${chalk.green(Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB')}`);
            console.log(`  Uptime: ${chalk.green(Math.round(process.uptime()) + ' seconds')}`);
            
        } catch (error) {
            console.error(chalk.red(`Error getting system info: ${(error as Error).message}`));
        }
    }

    async resetSystem(options: { confirm?: boolean }): Promise<void> {
        if (!options.confirm) {
            console.log(chalk.yellow('⚠️  This will reset all system configuration!'));
            console.log(chalk.gray('Use --confirm flag to proceed with reset'));
            return;
        }

        console.log(chalk.red.bold('🔄 Resetting System Configuration...'));
        
        try {
            // Reset configuration
            this.configManager.resetConfiguration();
            console.log(chalk.green('✓ Configuration reset'));
            
            console.log(chalk.blue('System reset completed successfully'));
            console.log(chalk.gray('Run "quantrapay-cli init" to reconfigure the system'));
            
        } catch (error) {
            console.error(chalk.red(`Reset failed: ${(error as Error).message}`));
        }
    }
}

export default SystemCommands;