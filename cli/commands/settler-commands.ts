import { Command } from 'commander';
import chalk from 'chalk';
import { ethers } from 'ethers';
import { SettlerService } from '../services/settler-service.js';

// Lazy initialization to ensure environment variables are loaded first
let settlerService: SettlerService | null = null;

function getSettlerService(): SettlerService {
  if (!settlerService) {
    settlerService = new SettlerService();
  }
  return settlerService;
}

export class SettlerCommands {
  static setup(program: Command): void {
    const settler = program
      .command('settler')
      .description('Settler operations for crypto-to-fiat settlement after dispute period');

    // Queue Settlement Command
    settler
      .command('queue')
      .description('Queue a settlement request after payment completion')
      .requiredOption('--escrow-id <id>', 'Escrow ID')
      .requiredOption('--escrow-address <address>', 'Escrow contract address')
      .requiredOption('--merchant-id <id>', 'Merchant ID')
      .requiredOption('--payer-address <address>', 'Payer wallet address')
      .requiredOption('--amount <amount>', 'Amount to settle')
      .requiredOption('--token <token>', 'Token symbol (USDC, ETH, etc.)')
      .requiredOption('--chain <network>', 'Network (arbitrum, avalanche, aptos)')
      .requiredOption('--payment-method <method>', 'Payment method type (upi, pix, sepa)')
      .option('--upi-id <id>', 'UPI ID for UPI payments')
      .option('--pix-key <key>', 'PIX key for PIX payments')
      .option('--iban <iban>', 'IBAN for SEPA payments')
      .option('--account-holder <name>', 'Account holder name for SEPA')
      .action(async (options) => {
        try {
          console.log(chalk.blue('\n🏦 Queueing Settlement Request'));
          console.log(chalk.gray('═'.repeat(50)));

          // Validate network
          const supportedNetworks = ['arbitrum', 'avalanche', 'aptos'];
          if (!supportedNetworks.includes(options.chain)) {
            throw new Error(`Unsupported network. Use: ${supportedNetworks.join(', ')}`);
          }

          // Validate payment method
          const supportedMethods = ['upi', 'pix', 'sepa'];
          if (!supportedMethods.includes(options.paymentMethod)) {
            throw new Error(`Unsupported payment method. Use: ${supportedMethods.join(', ')}`);
          }

          // Build merchant payment method
          const merchantPaymentMethod: any = { type: options.paymentMethod };

          switch (options.paymentMethod) {
            case 'upi':
              if (!options.upiId) throw new Error('UPI ID required for UPI payments');
              merchantPaymentMethod.upiId = options.upiId;
              break;
            case 'pix':
              if (!options.pixKey) throw new Error('PIX key required for PIX payments');
              merchantPaymentMethod.pixKey = options.pixKey;
              break;
            case 'sepa':
              if (!options.iban) throw new Error('IBAN required for SEPA payments');
              if (!options.accountHolder) throw new Error('Account holder name required for SEPA payments');
              merchantPaymentMethod.iban = options.iban;
              merchantPaymentMethod.accountHolder = options.accountHolder;
              break;
          }

          const result = await getSettlerService().queueSettlement(
            options.escrowId,
            options.escrowAddress,
            options.merchantId,
            options.payerAddress,
            options.amount,
            options.token,
            options.chain,
            merchantPaymentMethod
          );

          if (result.success) {
            console.log(chalk.green('\n✅ Settlement queued successfully!'));
            console.log(chalk.gray(`Settlement ID: ${result.settlementId}`));
          } else {
            console.error(chalk.red('\n❌ Failed to queue settlement:'), result.error);
            process.exit(1);
          }

        } catch (error: any) {
          console.error(chalk.red('\n❌ Command failed:'), error.message);
          process.exit(1);
        }
      });

    // Execute Settlement Command
    settler
      .command('execute')
      .description('Execute a settlement after dispute period')
      .requiredOption('--settlement-id <id>', 'Settlement ID to execute')
      .action(async (options) => {
        try {
          console.log(chalk.blue('\n💱 Executing Settlement'));
          console.log(chalk.gray('═'.repeat(50)));

          const result = await getSettlerService().executeSettlement(options.settlementId);

          if (result.success) {
            console.log(chalk.green('\n🎉 Settlement executed successfully!'));
            if (result.txHash) {
              console.log(chalk.gray(`Crypto TX Hash: ${result.txHash}`));
            }
            if (result.fiatTxId) {
              console.log(chalk.gray(`Fiat TX ID: ${result.fiatTxId}`));
            }
          } else {
            console.error(chalk.red('\n❌ Settlement execution failed:'), result.error);
            process.exit(1);
          }

        } catch (error: any) {
          console.error(chalk.red('\n❌ Command failed:'), error.message);
          process.exit(1);
        }
      });

    // Process Ready Settlements Command
    settler
      .command('process')
      .description('Process all settlements ready for execution')
      .action(async () => {
        try {
          console.log(chalk.blue('\n🔄 Processing Ready Settlements'));
          console.log(chalk.gray('═'.repeat(50)));

          await getSettlerService().processReadySettlements();

        } catch (error: any) {
          console.error(chalk.red('\n❌ Command failed:'), error.message);
          process.exit(1);
        }
      });

    // List Settlements Command
    settler
      .command('list')
      .description('List settlements with optional filtering')
      .option('--status <status>', 'Filter by status (pending, ready, settling, completed, disputed, failed)')
      .option('--merchant-id <id>', 'Filter by merchant ID')
      .option('--network <network>', 'Filter by network')
      .option('--limit <number>', 'Limit number of results', '10')
      .action(async (options) => {
        try {
          console.log(chalk.blue('\n📋 Settlement List'));
          console.log(chalk.gray('═'.repeat(50)));

          const filter = {
            status: options.status,
            merchantId: options.merchantId,
            network: options.network,
            limit: parseInt(options.limit)
          };

          const settlements = await getSettlerService().listSettlements(filter);

          if (settlements.length === 0) {
            console.log(chalk.yellow('📭 No settlements found matching criteria'));
            return;
          }

          settlements.forEach((settlement, index) => {
            const statusColor = this.getStatusColor(settlement.status);
            const timeToSettle = settlement.status === 'pending' 
              ? Math.max(0, Math.ceil((settlement.disputePeriodEnd - Date.now()) / (60 * 60 * 1000)))
              : 0;

            console.log(chalk.white(`\n${index + 1}. Settlement ${settlement.settlementId}`));
            console.log(`   Status: ${statusColor(settlement.status.toUpperCase())}`);
            console.log(`   Escrow: ${settlement.escrowAddress}`);
            console.log(`   Merchant: ${settlement.merchantId}`);
            console.log(`   Amount: ${settlement.amount} ${settlement.token} → ${settlement.fiatAmount} ${this.getFiatCurrency(settlement.merchantPaymentMethod.type)}`);
            console.log(`   Network: ${settlement.network}`);
            console.log(`   Payment: ${settlement.merchantPaymentMethod.type.toUpperCase()}`);
            
            if (settlement.status === 'pending' && timeToSettle > 0) {
              console.log(`   Dispute Period: ${timeToSettle} hours remaining`);
            }
            
            if (settlement.status === 'completed' && settlement.settledAt) {
              console.log(`   Settled: ${new Date(settlement.settledAt).toLocaleString()}`);
            }
            
            console.log(`   Created: ${new Date(settlement.createdAt).toLocaleString()}`);
          });

          console.log(chalk.gray(`\nShowing ${settlements.length} settlement(s)`));

        } catch (error: any) {
          console.error(chalk.red('\n❌ Command failed:'), error.message);
          process.exit(1);
        }
      });

    // Settlement Statistics Command
    settler
      .command('stats')
      .description('Show settlement statistics and overview')
      .action(async () => {
        try {
          console.log(chalk.blue('\n📊 Settlement Statistics'));
          console.log(chalk.gray('═'.repeat(50)));

          const stats = await getSettlerService().getSettlementStats();

          console.log(chalk.white('\n📈 Settlement Overview:'));
          console.log(`   Total Settlements: ${chalk.cyan(stats.total)}`);
          console.log(`   Pending: ${chalk.yellow(stats.pending)}`);
          console.log(`   Ready: ${chalk.blue(stats.ready)}`);
          console.log(`   Processing: ${chalk.magenta(stats.settling)}`);
          console.log(`   Completed: ${chalk.green(stats.completed)}`);
          console.log(`   Disputed: ${chalk.red(stats.disputed)}`);
          console.log(`   Failed: ${chalk.red(stats.failed)}`);

          console.log(chalk.white('\n💰 Volume Statistics:'));
          console.log(`   Total Volume: ${chalk.cyan(stats.totalVolume.toFixed(4))} tokens`);
          console.log(`   Total Fees Earned: ${chalk.green(stats.totalFees.toFixed(4))} tokens`);

          if (stats.total > 0) {
            const successRate = ((stats.completed / stats.total) * 100).toFixed(1);
            console.log(`   Success Rate: ${chalk.green(successRate + '%')}`);
          }

        } catch (error: any) {
          console.error(chalk.red('\n❌ Command failed:'), error.message);
          process.exit(1);
        }
      });

    // On-Chain Verification Command
    settler
      .command('verify')
      .description('Verify settlement on blockchain and check UTR records')
      .requiredOption('--settlement-id <id>', 'Settlement ID to verify')
      .requiredOption('--network <network>', 'Network to check (arbitrum, avalanche, aptos)')
      .action(async (options) => {
        try {
          console.log(chalk.blue('\n🔍 Verifying Settlement On-Chain'));
          console.log(chalk.gray('═'.repeat(50)));

          const result = await getSettlerService().getOnChainSettlement(options.settlementId, options.network);

          if (!result.success) {
            console.error(chalk.red('\n❌ Verification failed:'), result.error);
            process.exit(1);
          }

          const settlement = result.settlement!;
          
          console.log(chalk.white('\n📋 On-Chain Settlement Details:'));
          console.log(`   Settlement ID: ${chalk.cyan(settlement.settlementId)}`);
          console.log(`   Escrow ID: ${chalk.gray(settlement.escrowId)}`);
          console.log(`   Escrow Address: ${chalk.gray(settlement.escrowAddress)}`);
          console.log(`   Payer: ${chalk.yellow(settlement.payer)}`);
          console.log(`   Merchant: ${chalk.yellow(settlement.merchantId)}`);
          console.log(`   Settler: ${chalk.green(settlement.settler)}`);

          console.log(chalk.white('\n💰 Financial Details:'));
          const cryptoAmount = ethers.formatEther(settlement.cryptoAmount);
          const fiatAmount = (parseInt(settlement.fiatAmount) / 1e6).toFixed(2);
          console.log(`   Crypto Amount: ${chalk.cyan(cryptoAmount)} ${settlement.tokenSymbol}`);
          console.log(`   Fiat Amount: ${chalk.cyan(fiatAmount)} ${settlement.fiatCurrency}`);

          const paymentMethods = ['UPI', 'PIX', 'SEPA'];
          console.log(`   Payment Method: ${chalk.magenta(paymentMethods[settlement.paymentMethod])}`);

          console.log(chalk.white('\n⏰ Timeline:'));
          const disputeEnd = new Date(parseInt(settlement.disputePeriodEnd) * 1000);
          console.log(`   Dispute Period Ends: ${chalk.yellow(disputeEnd.toLocaleString())}`);

          const statuses = ['Pending', 'Ready', 'Withdrawn', 'Completed', 'Disputed', 'Failed', 'Cancelled'];
          const statusColors = [chalk.yellow, chalk.blue, chalk.magenta, chalk.green, chalk.red, chalk.red, chalk.gray];
          console.log(`   Status: ${statusColors[settlement.status](statuses[settlement.status])}`);

          console.log(chalk.white('\n🔗 Transaction Records:'));
          if (settlement.cryptoTxHash) {
            console.log(`   Crypto Withdrawal: ${chalk.green('✅ Recorded')}`);
            console.log(`     TX Hash: ${chalk.gray(settlement.cryptoTxHash)}`);
          } else {
            console.log(`   Crypto Withdrawal: ${chalk.yellow('⏳ Pending')}`);
          }

          if (settlement.fiatTxRef) {
            console.log(`   Fiat Transfer: ${chalk.green('✅ Completed')}`);
            console.log(`     UTR/Reference: ${chalk.green(settlement.fiatTxRef)}`);
          } else {
            console.log(`   Fiat Transfer: ${chalk.yellow('⏳ Pending')}`);
          }

          if (settlement.proofHash) {
            console.log(`   Settlement Proof: ${chalk.green('✅ Recorded')}`);
            console.log(`     Proof Hash: ${chalk.gray(settlement.proofHash)}`);
          } else {
            console.log(`   Settlement Proof: ${chalk.yellow('⏳ Not available')}`);
          }

          // Verification summary
          console.log(chalk.white('\n🛡️ Verification Summary:'));
          const isComplete = settlement.status === 3; // Completed
          const hasWithdrawal = settlement.cryptoTxHash.length > 0;
          const hasFiatTx = settlement.fiatTxRef.length > 0;
          const hasProof = settlement.proofHash.length > 0;

          console.log(`   Settlement Complete: ${isComplete ? chalk.green('✅ YES') : chalk.yellow('⏳ NO')}`);
          console.log(`   Crypto Withdrawal Proof: ${hasWithdrawal ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
          console.log(`   Fiat Transfer UTR: ${hasFiatTx ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
          console.log(`   Settlement Proof: ${hasProof ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);

          if (isComplete && hasWithdrawal && hasFiatTx && hasProof) {
            console.log(chalk.green('\n🎉 Settlement fully verified and completed!'));
          } else if (settlement.status === 4) { // Disputed
            console.log(chalk.red('\n⚠️ Settlement is disputed and under review!'));
          } else {
            console.log(chalk.yellow('\n⏳ Settlement verification incomplete - still in progress'));
          }

        } catch (error: any) {
          console.error(chalk.red('\n❌ Command failed:'), error.message);
          process.exit(1);
        }
      });

    // Settler Status Command
    settler
      .command('status')
      .description('Show settler service status and configuration')
      .action(async () => {
        try {
          console.log(chalk.blue('\n⚙️ Settler Service Status'));
          console.log(chalk.gray('═'.repeat(50)));

          const enabled = process.env.SETTLER_ENABLED === 'true';
          const autoSettlement = process.env.AUTO_SETTLEMENT_ENABLED === 'true';
          const disputeHours = process.env.DISPUTE_PERIOD_HOURS || '72';
          const settlementFee = process.env.SETTLEMENT_FEE_PERCENTAGE || '0.5';
          const settlerAddress = process.env.SETTLER_ADDRESS || 'Not configured';

          console.log(chalk.white('\n🔧 Configuration:'));
          console.log(`   Service Enabled: ${enabled ? chalk.green('✅ YES') : chalk.red('❌ NO')}`);
          console.log(`   Auto Settlement: ${autoSettlement ? chalk.green('✅ ENABLED') : chalk.yellow('⚠️ DISABLED')}`);
          console.log(`   Dispute Period: ${chalk.cyan(disputeHours + ' hours')}`);
          console.log(`   Settlement Fee: ${chalk.cyan(settlementFee + '%')}`);
          console.log(`   Settler Address: ${chalk.gray(settlerAddress)}`);

          console.log(chalk.white('\n🌐 Supported Networks:'));
          const networks = ['arbitrum', 'avalanche', 'aptos'];
          networks.forEach(network => {
            console.log(`   ${network.charAt(0).toUpperCase() + network.slice(1)}: ${chalk.green('✅ Supported')}`);
          });

          console.log(chalk.white('\n💳 Supported Payment Methods:'));
          const methods = [
            { name: 'UPI', currency: 'INR', region: 'India' },
            { name: 'PIX', currency: 'BRL', region: 'Brazil' },
            { name: 'SEPA', currency: 'EUR', region: 'Europe' }
          ];
          methods.forEach(method => {
            console.log(`   ${method.name}: ${chalk.green('✅ Active')} (${method.currency} - ${method.region})`);
          });

          if (!enabled) {
            console.log(chalk.yellow('\n⚠️ Settler service is disabled. Set SETTLER_ENABLED=true to activate.'));
          }

        } catch (error: any) {
          console.error(chalk.red('\n❌ Command failed:'), error.message);
          process.exit(1);
        }
      });
  }

  private static getStatusColor(status: string): (text: string) => string {
    const colors: Record<string, (text: string) => string> = {
      'pending': chalk.yellow,
      'ready': chalk.blue,
      'settling': chalk.magenta,
      'completed': chalk.green,
      'disputed': chalk.red,
      'failed': chalk.red
    };
    return colors[status] || chalk.gray;
  }

  private static getFiatCurrency(paymentType: string): string {
    const currencies: Record<string, string> = {
      'upi': 'INR',
      'pix': 'BRL',
      'sepa': 'EUR'
    };
    return currencies[paymentType] || 'USD';
  }
}