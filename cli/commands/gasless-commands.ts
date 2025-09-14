import chalk from 'chalk';
import inquirer from 'inquirer';
import { Command } from 'commander';
import { GaslessTransactionService } from '../services/gasless-transaction-service.js';

export class GaslessCommands {
  private gaslessService: GaslessTransactionService;

  constructor() {
    this.gaslessService = new GaslessTransactionService();
  }

  public setupCommands(program: Command): void {
    
    // Gasless transaction commands
    const gaslessCommand = program
      .command('gasless')
      .description('Gasless transaction management commands');

    // Deploy contract gaslessly
    gaslessCommand
      .command('deploy')
      .description('Deploy contract with sponsored gas')
      .option('-d, --deployer <address>', 'Deployer address')
      .option('-b, --bytecode <bytecode>', 'Contract bytecode')
      .option('-a, --args <args>', 'Constructor arguments (JSON)')
      .option('-n, --network <network>', 'Target network')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options: any) => {
        await this.executeGaslessDeployment(options);
      });

    // Merchant gasless operations
    gaslessCommand
      .command('merchant-op')
      .description('Execute merchant operation with sponsored gas')
      .option('-m, --merchant <address>', 'Merchant address')
      .option('-c, --contract <address>', 'Contract address')
      .option('-f, --function <name>', 'Function name')
      .option('-a, --args <args>', 'Function arguments (JSON)')
      .option('-n, --network <network>', 'Target network')
      .action(async (options: any) => {
        await this.executeGaslessMerchantOp(options);
      });

    // Payer gasless payment
    gaslessCommand
      .command('pay')
      .description('Make payment with sponsored gas')
      .option('-p, --payer <address>', 'Payer address')
      .option('-m, --merchant-id <id>', 'Merchant ID')
      .option('-a, --amount <amount>', 'Payment amount')
      .option('-t, --token <symbol>', 'Token symbol')
      .option('-e, --escrow <address>', 'Escrow contract address')
      .option('-n, --network <network>', 'Target network')
      .action(async (options: any) => {
        await this.executeGaslessPayment(options);
      });

    // Multi-chain gasless payment
    gaslessCommand
      .command('multi-pay')
      .description('Execute multi-chain payment with sponsored gas')
      .option('-p, --payer <address>', 'Payer address')
      .option('-f, --fragments <file>', 'Payment fragments JSON file')
      .option('--parallel', 'Execute fragments in parallel')
      .action(async (options: any) => {
        await this.executeMultiChainGasless(options);
      });

    // Status and monitoring
    gaslessCommand
      .command('status')
      .description('Check gasless transaction status and limits')
      .option('-u, --user <address>', 'User address')
      .option('-n, --network <network>', 'Target network')
      .option('-a, --all-networks', 'Check all networks')
      .action(async (options: any) => {
        await this.checkGaslessStatus(options);
      });

    // Fund sponsor wallets
    gaslessCommand
      .command('fund-sponsors')
      .description('Fund sponsor wallets across networks')
      .option('-t, --target <amount>', 'Target balance in ETH')
      .option('-n, --network <network>', 'Specific network (optional)')
      .action(async (options: any) => {
        await this.fundSponsorWallets(options);
      });
  }

  private async executeGaslessDeployment(options: any): Promise<void> {
    console.log(chalk.blue('\n🚀 Gasless Contract Deployment'));
    console.log('Deploy contracts without users paying gas fees\n');

    try {
      let deploymentData = {
        deployer: options.deployer,
        bytecode: options.bytecode,
        args: options.args ? JSON.parse(options.args) : [],
        network: options.network || 'arbitrum'
      };

      if (!options.noInteractive) {
        const questions: any[] = [];

        if (!deploymentData.deployer) {
          questions.push({
            type: 'input',
            name: 'deployer',
            message: 'Enter deployer address:',
            validate: (input: string) => input.length > 0 || 'Deployer address is required'
          });
        }

        if (!deploymentData.network) {
          questions.push({
            type: 'list',
            name: 'network',
            message: 'Select network:',
            choices: ['arbitrum', 'avalanche', 'aptos']
          });
        }

        if (questions.length > 0) {
          const answers = await inquirer.prompt(questions);
          Object.assign(deploymentData, answers);
        }
      }

      console.log(chalk.yellow('📋 Deployment Details:'));
      console.log(`  Deployer: ${deploymentData.deployer}`);
      console.log(`  Network: ${deploymentData.network}`);
      console.log(`  Gas Sponsored: ✅ Yes`);
      console.log();

      const result = await this.gaslessService.executeGaslessDeployment(
        deploymentData.deployer,
        deploymentData.bytecode,
        deploymentData.args,
        deploymentData.network
      );

      if (result.success) {
        console.log(chalk.green('✅ Gasless deployment successful!'));
        console.log(chalk.green(`🔗 Transaction Hash: ${result.txHash}`));
      } else {
        console.log(chalk.red('❌ Gasless deployment failed'));
        console.log(chalk.red(`Error: ${result.error}`));
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Deployment error:'), error.message);
    }
  }

  private async executeGaslessMerchantOp(options: any): Promise<void> {
    console.log(chalk.blue('\n🏪 Gasless Merchant Operation'));
    console.log('Execute merchant operations without gas fees\n');

    try {
      const result = await this.gaslessService.executeGaslessMerchantOperation(
        options.merchant,
        options.contract,
        options.function,
        options.args ? JSON.parse(options.args) : [],
        options.network || 'arbitrum'
      );

      if (result.success) {
        console.log(chalk.green('✅ Gasless merchant operation successful!'));
        console.log(chalk.green(`🔗 Transaction Hash: ${result.txHash}`));
      } else {
        console.log(chalk.red('❌ Gasless merchant operation failed'));
        console.log(chalk.red(`Error: ${result.error}`));
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Merchant operation error:'), error.message);
    }
  }

  private async executeGaslessPayment(options: any): Promise<void> {
    console.log(chalk.blue('\n💳 Gasless Payment'));
    console.log('Make payments without paying gas fees\n');

    try {
      let paymentData = {
        payer: options.payer,
        merchantId: options.merchantId,
        amount: options.amount,
        token: options.token || 'USDC',
        escrow: options.escrow,
        network: options.network || 'arbitrum'
      };

      if (!options.noInteractive) {
        const questions: any[] = [];

        if (!paymentData.payer) {
          questions.push({
            type: 'input',
            name: 'payer',
            message: 'Enter payer address:'
          });
        }

        if (!paymentData.merchantId) {
          questions.push({
            type: 'input',
            name: 'merchantId',
            message: 'Enter merchant ID:'
          });
        }

        if (!paymentData.amount) {
          questions.push({
            type: 'input',
            name: 'amount',
            message: 'Enter payment amount:'
          });
        }

        if (!paymentData.escrow) {
          questions.push({
            type: 'input',
            name: 'escrow',
            message: 'Enter escrow contract address:'
          });
        }

        if (questions.length > 0) {
          const answers = await inquirer.prompt(questions);
          Object.assign(paymentData, answers);
        }
      }

      console.log(chalk.yellow('💰 Payment Details:'));
      console.log(`  Payer: ${paymentData.payer}`);
      console.log(`  Merchant: ${paymentData.merchantId}`);
      console.log(`  Amount: ${paymentData.amount} ${paymentData.token}`);
      console.log(`  Network: ${paymentData.network}`);
      console.log(`  Gas Sponsored: ✅ Yes`);
      console.log();

      const result = await this.gaslessService.executeGaslessPayerOperation(
        paymentData.payer,
        {
          merchantId: paymentData.merchantId,
          amount: paymentData.amount,
          token: paymentData.token,
          escrowAddress: paymentData.escrow
        },
        paymentData.network
      );

      if (result.success) {
        console.log(chalk.green('✅ Gasless payment successful!'));
        console.log(chalk.green(`🔗 Transaction Hash: ${result.txHash}`));
      } else {
        console.log(chalk.red('❌ Gasless payment failed'));
        console.log(chalk.red(`Error: ${result.error}`));
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Payment error:'), error.message);
    }
  }

  private async executeMultiChainGasless(options: any): Promise<void> {
    console.log(chalk.blue('\n🌐 Multi-Chain Gasless Payment'));
    console.log('Execute fragmented payments across chains without gas fees\n');

    try {
      // Load payment fragments from file or prompt
      let fragments = [];
      
      if (options.fragments) {
        const fs = await import('fs/promises');
        const fragmentsData = await fs.readFile(options.fragments, 'utf-8');
        fragments = JSON.parse(fragmentsData);
      } else {
        // Interactive fragment creation
        fragments = await this.createInteractiveFragments();
      }

      console.log(chalk.yellow(`🔍 Processing ${fragments.length} payment fragments:`));
      fragments.forEach((fragment: any, index: number) => {
        console.log(`  ${index + 1}. ${fragment.amount} ${fragment.token} on ${fragment.network}`);
      });
      console.log();

      const result = await this.gaslessService.executeMultiChainGaslessPayment(
        options.payer,
        fragments
      );

      console.log(chalk.blue('\n📊 Multi-Chain Payment Results:'));
      result.results.forEach((res: any, index: number) => {
        const status = res.success ? chalk.green('✅') : chalk.red('❌');
        console.log(`  ${status} ${fragments[index].network}: ${res.txHash || res.error}`);
      });

      if (result.success) {
        console.log(chalk.green('\n🎉 Multi-chain gasless payment completed!'));
      } else {
        console.log(chalk.red('\n💥 Multi-chain gasless payment failed'));
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Multi-chain payment error:'), error.message);
    }
  }

  private async checkGaslessStatus(options: any): Promise<void> {
    console.log(chalk.blue('\n📊 Gasless Transaction Status'));
    console.log('Check gasless limits and sponsor wallet balances\n');

    try {
      const networks = options.allNetworks ? 
        ['arbitrum', 'avalanche', 'aptos'] : 
        [options.network || 'arbitrum'];

      for (const network of networks) {
        console.log(chalk.yellow(`🌐 ${network.toUpperCase()} Network:`));
        
        const status = await this.gaslessService.getGaslessStatus(
          options.user || '0x0000000000000000000000000000000000000000',
          network
        );

        console.log(`  Status: ${status.enabled ? chalk.green('✅ Enabled') : chalk.red('❌ Disabled')}`);
        console.log(`  Sponsor Balance: ${status.sponsorBalance} ETH`);
        console.log(`  Daily Remaining: ${status.dailyRemaining.toFixed(4)} ETH`);
        console.log(`  Max Gas Per TX: ${status.limits.maxGasPerTx} ETH`);
        console.log(`  Current Usage: ${status.limits.currentUsage.toFixed(4)} ETH`);
        console.log();
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Status check error:'), error.message);
    }
  }

  private async fundSponsorWallets(options: any): Promise<void> {
    console.log(chalk.blue('\n💰 Fund Sponsor Wallets'));
    console.log('Ensure sponsor wallets have sufficient balance for gas sponsoring\n');

    try {
      await this.gaslessService.fundSponsorWallets(options.target || '1.0');
      console.log(chalk.green('✅ Sponsor wallet funding completed!'));

    } catch (error: any) {
      console.error(chalk.red('❌ Funding error:'), error.message);
    }
  }

  private async createInteractiveFragments(): Promise<any[]> {
    const fragments = [];
    let addMore = true;

    while (addMore) {
      const fragmentData = await inquirer.prompt([
        {
          type: 'list',
          name: 'network',
          message: 'Select network for this fragment:',
          choices: ['arbitrum', 'avalanche', 'aptos']
        },
        {
          type: 'input',
          name: 'amount',
          message: 'Enter amount for this fragment:'
        },
        {
          type: 'input',
          name: 'token',
          message: 'Enter token symbol:',
          default: 'USDC'
        },
        {
          type: 'input',
          name: 'escrowAddress',
          message: 'Enter escrow contract address:'
        },
        {
          type: 'input',
          name: 'merchantId',
          message: 'Enter merchant ID:'
        }
      ]);

      fragments.push(fragmentData);

      const { continueAdding } = await inquirer.prompt([{
        type: 'confirm',
        name: 'continueAdding',
        message: 'Add another fragment?',
        default: false
      }]);

      addMore = continueAdding;
    }

    return fragments;
  }
}