import chalk from 'chalk';

export class MultiChainHelpDisplay {
  
  public static displayPayerHelp(): void {
    console.log(chalk.blue('\n🏦 QUANTRA PAY - Multi-Chain Payer Commands'));
    console.log(chalk.gray('═'.repeat(60)));
    
    console.log(chalk.yellow('\n💰 SINGLE-CHAIN PAYMENT COMMANDS:'));
    console.log('  pay              Make a single payment to merchant escrow');
    console.log('  verify           Verify payment reached escrow account');
    console.log('  balance          Check escrow account balances');
    console.log('  history          View payment transaction history');
    console.log('  test-flow        Test complete payment flow');
    console.log('  monitor          Monitor escrow accounts real-time');
    
    console.log(chalk.green('\n🌐 MULTI-CHAIN PAYMENT COMMANDS:'));
    console.log('  add-wallet       Add wallet from any blockchain');
    console.log('  list-wallets     List all registered wallets');
    console.log('  plan-payment     Plan multi-chain fragmented payment');
    console.log('  execute-payment  Execute planned fragmented payment');
    console.log('  bridge-funds     Bridge funds between chains');
    console.log('  optimize-payment Optimize payment strategy');
    console.log('  track-payment    Track multi-chain payment progress');
    console.log('  estimate-gas     Estimate gas costs for payment');
    
    console.log(chalk.magenta('\n🎯 SUPPORTED PAYMENT METHODS:'));
    console.log('  • UPI (Indian Unified Payments Interface)');
    console.log('  • PIX (Brazilian Instant Payment System)');
    console.log('  • SEPA (European Single Euro Payments Area)');
    console.log('  • Crypto (Direct blockchain payments)');
    
    console.log(chalk.cyan('\n⛓️  SUPPORTED BLOCKCHAINS:'));
    console.log('  • Arbitrum (ARB) - mainnet, sepolia testnet');
    console.log('  • Avalanche (AVAX) - mainnet, fuji testnet');
    console.log('  • Aptos (APT) - mainnet, testnet');
    console.log('  [Focus networks for QuantraPay platform]');
    
    console.log(chalk.white('\n💡 USAGE EXAMPLES:'));
    console.log(chalk.gray('  # Add wallets from focus networks'));
    console.log('  payer add-wallet --chain arbitrum --address 0x123...');
    console.log('  payer add-wallet --chain avalanche --address 0x456...');
    console.log('  payer add-wallet --chain aptos --address 0x789...');
    console.log();
    console.log(chalk.gray('  # Plan fragmented payment using multiple wallets'));
    console.log('  payer plan-payment --merchant-id merchant_1 \\');
    console.log('                     --upi-id user@paytm \\');
    console.log('                     --amount 1000 --token USDC');
    console.log();
    console.log(chalk.gray('  # Execute the planned payment'));
    console.log('  payer execute-payment --payment-id mp_1234567890_abc \\');
    console.log('                        --parallel --auto-confirm');
    console.log();
    console.log(chalk.gray('  # Single payment (traditional)'));
    console.log('  payer pay --merchant-id merchant_1 --amount 500 --token USDC');
    
    console.log(chalk.blue('\n🚀 MULTI-CHAIN PAYMENT FLOW:'));
    console.log('  1️⃣  Register wallets: payer add-wallet');
    console.log('  2️⃣  Check balances: payer list-wallets --refresh');
    console.log('  3️⃣  Plan payment: payer plan-payment');
    console.log('  4️⃣  Review & optimize: payer optimize-payment');
    console.log('  5️⃣  Execute payment: payer execute-payment');
    console.log('  6️⃣  Track progress: payer track-payment');
    
    console.log(chalk.red('\n⚠️  IMPORTANT NOTES:'));
    console.log('  • Keep private keys secure - use hardware wallets when possible');
    console.log('  • Test with small amounts first on testnets');
    console.log('  • Gas fees apply on each chain separately');
    console.log('  • Cross-chain bridging may take 10-30 minutes');
    console.log('  • Always verify merchant details before payment');
    
    console.log(chalk.gray('\n═'.repeat(60)));
    console.log(chalk.blue('For detailed command help: payer <command> --help'));
    console.log(chalk.blue('For CLI support: https://github.com/quantrapay/docs\n'));
  }

  public static displayMultiChainScenarios(): void {
    console.log(chalk.blue('\n💰 MULTI-CHAIN PAYMENT SCENARIOS'));
    console.log(chalk.gray('═'.repeat(50)));
    
    console.log(chalk.yellow('\n📊 Scenario 1: Fragmented Crypto Holdings'));
    console.log('Problem: You have USDC split across focus networks');
    console.log('• Arbitrum: 300 USDC');
    console.log('• Avalanche: 400 USDC'); 
    console.log('• Aptos: 300 APT');
    console.log('• Need to pay: 1000 USDC to merchant');
    console.log();
    console.log(chalk.green('Solution:'));
    console.log('payer plan-payment --merchant-id merchant_1 --amount 1000 --token USDC');
    console.log('→ Automatically uses all three wallets for combined payment');
    
    console.log(chalk.yellow('\n🌍 Scenario 2: Traditional Payment Integration'));
    console.log('Problem: Merchant accepts UPI but you only have crypto');
    console.log('• Merchant UPI: merchant@upi');
    console.log('• Your funds: ARB on Arbitrum, AVAX on Avalanche, APT on Aptos');
    console.log();
    console.log(chalk.green('Solution:'));
    console.log('payer plan-payment --upi-id merchant@upi --amount 1000 --token USDC');
    console.log('→ Converts crypto to USDC and routes to merchant UPI escrow');
    
    console.log(chalk.yellow('\n💳 Scenario 3: Mixed Payment Methods'));
    console.log('Problem: Large payment requiring multiple funding sources');
    console.log('• Merchant IBAN: DE89370400440532013000');
    console.log('• Your funds: Distributed across Arbitrum, Avalanche, Aptos');
    console.log('• Need: €5000 payment');
    console.log();
    console.log(chalk.green('Solution:'));
    console.log('payer plan-payment --iban DE89370400440532013000 --amount 5000 --token USDC');
    console.log('→ Aggregates funds from all chains, optimizes gas costs');
    
    console.log(chalk.yellow('\n⚡ Scenario 4: Gas Optimization'));
    console.log('Problem: Want to minimize transaction costs');
    console.log('• Multiple wallets with varying gas costs');
    console.log('• Need to pay 2000 USDC efficiently');
    console.log();
    console.log(chalk.green('Solution:'));
    console.log('payer optimize-payment --amount 2000 --token USDC --minimize-gas');
    console.log('→ Analyzes gas costs and selects optimal wallet combination');
    
    console.log(chalk.blue('\n🎯 Benefits of Multi-Chain Payments:'));
    console.log('✅ Use fragmented crypto holdings efficiently');
    console.log('✅ Access best liquidity across chains');
    console.log('✅ Minimize gas costs through optimization');
    console.log('✅ Support traditional payment methods');
    console.log('✅ Real-time tracking across all chains');
    console.log('✅ Automatic retry on failed transactions');
    
    console.log(chalk.gray('\n═'.repeat(50)));
  }

  public static displaySettlerHelp(): void {
    console.log(chalk.blue('\n🏦 QUANTRA PAY - Settler Commands'));
    console.log(chalk.gray('═'.repeat(60)));
    
    console.log(chalk.yellow('\n💱 SETTLEMENT OPERATIONS:'));
    console.log('  queue            Queue settlement request after payment');
    console.log('  execute          Execute settlement after dispute period');
    console.log('  process          Process all ready settlements');
    console.log('  list             List settlements with filtering');
    console.log('  stats            Show settlement statistics');
    console.log('  status           Show settler service status');
    
    console.log(chalk.green('\n🎯 SETTLEMENT FLOW:'));
    console.log('  1. Payment completes → Settler queues settlement');
    console.log('  2. Dispute period (72h) → Automatic countdown');
    console.log('  3. Period ends → Settlement ready for execution');
    console.log('  4. Crypto withdrawn → Converted to fiat');
    console.log('  5. Fiat transferred → Merchant receives payment');
    
    console.log(chalk.magenta('\n💳 SUPPORTED FIAT METHODS:'));
    console.log('  • UPI (India) - Instant rupee transfers');
    console.log('  • PIX (Brazil) - Real-time Brazilian real');
    console.log('  • SEPA (Europe) - Euro bank transfers');
    
    console.log(chalk.cyan('\n⛓️  SETTLEMENT NETWORKS:'));
    console.log('  • Arbitrum - ETH, USDC, USDT, ARB tokens');
    console.log('  • Avalanche - AVAX, USDC, USDT tokens');
    console.log('  • Aptos - APT, USDC tokens');
    
    console.log(chalk.white('\n💡 USAGE EXAMPLES:'));
    console.log(chalk.gray('  # Queue settlement after payment completion'));
    console.log('  settler queue --escrow-id esc123 \\');
    console.log('                --escrow-address 0x456... \\');
    console.log('                --merchant-id merchant_1 \\');
    console.log('                --amount 1000 --token USDC \\');
    console.log('                --payment-method upi \\');
    console.log('                --upi-id merchant@paytm');
    console.log();
    console.log(chalk.gray('  # Execute specific settlement'));
    console.log('  settler execute --settlement-id settle_1234');
    console.log();
    console.log(chalk.gray('  # Process all ready settlements'));
    console.log('  settler process');
    console.log();
    console.log(chalk.gray('  # Check settlement status'));
    console.log('  settler list --status ready');
    console.log('  settler stats');
    
    console.log(chalk.blue('\n⏰ Dispute Period: 72 hours default'));
    console.log(chalk.blue('💰 Settlement Fee: 0.5% default'));
    console.log(chalk.blue('🔄 Auto Settlement: Configurable'));
    
    console.log(chalk.gray('\n═'.repeat(60)));
  }

  public static displayChainInfo(): void {
    console.log(chalk.blue('\n⛓️  SUPPORTED BLOCKCHAIN NETWORKS'));
    console.log(chalk.gray('═'.repeat(55)));
    
    const chains = [
      {
        name: 'Arbitrum',
        symbol: 'ARB',
        networks: ['mainnet', 'sepolia'],
        avgGas: '$0.50-2',
        speed: '10-30 sec',
        status: '🟢'
      },
      {
        name: 'Avalanche',
        symbol: 'AVAX',
        networks: ['mainnet', 'fuji'],
        avgGas: '$0.25-1',
        speed: '1-3 sec',
        status: '🟢'
      },
      {
        name: 'Aptos',
        symbol: 'APT',
        networks: ['mainnet', 'testnet'],
        avgGas: '$0.01-0.05',
        speed: '0.5-2 sec',
        status: '�'
      }
    ];
    
    console.log(chalk.white('Chain'.padEnd(12) + 'Status'.padEnd(8) + 'Networks'.padEnd(20) + 'Avg Gas'.padEnd(12) + 'Speed'));
    console.log(chalk.gray('-'.repeat(55)));
    
    chains.forEach(chain => {
      const line = `${chain.name.padEnd(12)}${chain.status.padEnd(8)}${chain.networks.join(', ').padEnd(20)}${chain.avgGas.padEnd(12)}${chain.speed}`;
      console.log(line);
    });
    
    console.log(chalk.blue('\n🔑 Status Legend:'));
    console.log('🟢 Fully supported    🟡 Beta support    🔴 Coming soon');
    
    console.log(chalk.blue('\n💱 Supported Tokens (Focus Networks):'));
    console.log('• USDC, USDT (Stablecoins on Arbitrum & Avalanche)');
    console.log('• ETH, WETH (Arbitrum)');
    console.log('• AVAX (Avalanche native)');
    console.log('• APT (Aptos native)');
    console.log('• ARB (Arbitrum native)');
    console.log('• Cross-chain wrapped tokens');
    
    console.log(chalk.gray('\n═'.repeat(55)));
  }
}

export function displayFullHelp(): void {
  MultiChainHelpDisplay.displayPayerHelp();
  MultiChainHelpDisplay.displaySettlerHelp();
  MultiChainHelpDisplay.displayMultiChainScenarios();
  MultiChainHelpDisplay.displayChainInfo();
}