import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { priceService } from '../services/price-service.js';
import { priceIntegration } from '../utils/price-integration-utils.js';

export class PriceCommands {
  setupCommands(program: Command): void {
    const priceCommand = program
      .command('price')
      .description('Cryptocurrency and fiat currency price utilities');

    // Get crypto prices
    priceCommand
      .command('crypto')
      .description('Get cryptocurrency prices in USD')
      .option('-s, --symbols <symbols>', 'Comma-separated crypto symbols (ETH,BTC,USDC)', 'ETH,BTC,USDC')
      .option('-f, --format <format>', 'Output format (table, json)', 'table')
      .action(async (options) => {
        await this.getCryptoPrices(options);
      });

    // Convert crypto to fiat
    priceCommand
      .command('convert')
      .description('Convert between crypto and fiat currencies')
      .option('-a, --amount <amount>', 'Amount to convert')
      .option('-f, --from <currency>', 'From currency (ETH, BTC, USD, INR, etc.)')
      .option('-t, --to <currency>', 'To currency (ETH, BTC, USD, INR, etc.)')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options) => {
        await this.convertCurrency(options);
      });

    // Show multiple fiat conversions for crypto
    priceCommand
      .command('fiat')
      .description('Show crypto amount in multiple fiat currencies')
      .option('-a, --amount <amount>', 'Crypto amount')
      .option('-c, --crypto <symbol>', 'Crypto symbol (ETH, BTC, etc.)')
      .option('-f, --fiats <currencies>', 'Comma-separated fiat currencies', 'USD,EUR,INR,GBP')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options) => {
        await this.showFiatConversions(options);
      });

    // Live price monitoring
    priceCommand
      .command('watch')
      .description('Watch crypto prices with live updates')
      .option('-s, --symbols <symbols>', 'Comma-separated crypto symbols', 'ETH,BTC,USDC')
      .option('-i, --interval <seconds>', 'Update interval in seconds', '30')
      .option('-f, --fiat <currency>', 'Show prices in fiat currency', 'USD')
      .action(async (options) => {
        await this.watchPrices(options);
      });

    // Get exchange rates
    priceCommand
      .command('rates')
      .description('Get fiat currency exchange rates')
      .option('-b, --base <currency>', 'Base currency (default: USD)', 'USD')
      .option('-c, --currencies <currencies>', 'Target currencies', 'EUR,GBP,INR,JPY')
      .action(async (options) => {
        await this.getExchangeRates(options);
      });

    // Clear price cache
    priceCommand
      .command('clear-cache')
      .description('Clear price cache')
      .action(async () => {
        priceService.clearCache();
        console.log(chalk.green('✓ Price cache cleared'));
      });

    // Test price conversion functionality (from test-price-command.ts)
    priceCommand
      .command('test')
      .description('Test price conversion functionality')
      .option('-a, --amount <amount>', 'Amount to convert', '1')
      .option('-c, --crypto <symbol>', 'Crypto symbol', 'ETH')
      .option('-f, --fiat <currency>', 'Fiat currency', 'INR')
      .action(async (options) => {
        await this.testPriceConversion(options);
      });

    // Test fiat to crypto conversion (from test-fiat-to-crypto-command.ts)
    priceCommand
      .command('test-fiat-to-crypto')
      .description('Test fiat to crypto conversion')
      .option('-a, --amount <amount>', 'Fiat amount', '100000')
      .option('-f, --fiat <currency>', 'Fiat currency', 'INR')
      .option('-c, --crypto <symbol>', 'Crypto symbol', 'ETH')
      .action(async (options) => {
        await this.testFiatToCrypto(options);
      });

    // Demo integration scenarios (from demo-integration-command.ts)
    priceCommand
      .command('demo')
      .description('Demonstrate price service integration across QuantraPay platform')
      .option('--scenario <type>', 'Demo scenario: merchant, payer, escrow, dashboard, or all', 'all')
      .action(async (options) => {
        await this.demoIntegration(options);
      });
  }

  async getCryptoPrices(options: any): Promise<void> {
    try {
      console.log(chalk.blue('📊 Fetching Cryptocurrency Prices\n'));

      const symbols = options.symbols.split(',').map((s: string) => s.trim().toUpperCase());
      const prices = new Map();

      // Get prices for each symbol
      for (const symbol of symbols) {
        try {
          const price = await priceService.getCryptoPrice(symbol);
          prices.set(symbol, { priceUsd: price });
        } catch (error: any) {
          console.error(chalk.red(`❌ Failed to get price for ${symbol}:`), error?.message || error);
        }
      }

      if (options.format === 'json') {
        const pricesObj = Object.fromEntries(prices);
        console.log(JSON.stringify(pricesObj, null, 2));
        return;
      }

      // Table format
      console.log(chalk.yellow('┌─────────────────────────────────────────────────────────────┐'));
      console.log(chalk.yellow('│                    Cryptocurrency Prices                   │'));
      console.log(chalk.yellow('├─────────────────────────────────────────────────────────────┤'));

      for (const [symbol, price] of prices.entries()) {
        const priceFormatted = priceService.formatCurrency(price.priceUsd, 'USD');
        const timestamp = new Date().toLocaleTimeString();

        console.log(chalk.cyan(`│ ${symbol.padEnd(6)} │ ${priceFormatted.padEnd(20)} │ ${timestamp.padEnd(15)} │`));
      }

      console.log(chalk.yellow('└─────────────────────────────────────────────────────────────┘'));

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to fetch crypto prices:'), error?.message || error);
    }
  }

  async convertCurrency(options: any): Promise<void> {
    try {
      let { amount, from, to } = options;

      // Interactive prompts if needed
      if (!options.noInteractive) {
        if (!amount) {
          const { inputAmount } = await inquirer.prompt([{
            type: 'input',
            name: 'inputAmount',
            message: 'Enter amount to convert:',
            validate: (input) => !isNaN(parseFloat(input)) || 'Please enter a valid number'
          }]);
          amount = parseFloat(inputAmount);
        }

        if (!from) {
          const supportedCryptos = priceService.getSupportedCryptoCurrencies();
          const supportedFiats = priceService.getSupportedFiatCurrencies();
          const allCurrencies = [...supportedCryptos, ...supportedFiats];

          const { fromCurrency } = await inquirer.prompt([{
            type: 'list',
            name: 'fromCurrency',
            message: 'From currency:',
            choices: allCurrencies.map(c => ({ name: c, value: c }))
          }]);
          from = fromCurrency;
        }

        if (!to) {
          const supportedCryptos = priceService.getSupportedCryptoCurrencies();
          const supportedFiats = priceService.getSupportedFiatCurrencies();
          const allCurrencies = [...supportedCryptos, ...supportedFiats];

          const { toCurrency } = await inquirer.prompt([{
            type: 'list',
            name: 'toCurrency',
            message: 'To currency:',
            choices: allCurrencies.map(c => ({ name: c, value: c }))
          }]);
          to = toCurrency;
        }
      }

      if (!amount || !from || !to) {
        console.error(chalk.red('❌ Please provide amount, from currency, and to currency'));
        return;
      }

      console.log(chalk.blue('💱 Converting Currency\n'));

      const conversionDisplay = await priceService.displayConversion(amount, from, to);
      console.log(conversionDisplay);

    } catch (error: any) {
      console.error(chalk.red('❌ Currency conversion failed:'), error?.message || error);
    }
  }

  async showFiatConversions(options: any): Promise<void> {
    try {
      let { amount, crypto, fiats } = options;

      if (!options.noInteractive) {
        if (!amount) {
          const { inputAmount } = await inquirer.prompt([{
            type: 'input',
            name: 'inputAmount',
            message: 'Enter crypto amount:',
            validate: (input) => !isNaN(parseFloat(input)) || 'Please enter a valid number'
          }]);
          amount = parseFloat(inputAmount);
        }

        if (!crypto) {
          const supportedCryptos = priceService.getSupportedCryptoCurrencies();
          const { cryptoCurrency } = await inquirer.prompt([{
            type: 'list',
            name: 'cryptoCurrency',
            message: 'Select cryptocurrency:',
            choices: supportedCryptos.map(c => ({ name: c, value: c }))
          }]);
          crypto = cryptoCurrency;
        }
      }

      if (!amount || !crypto) {
        console.error(chalk.red('❌ Please provide amount and crypto symbol'));
        return;
      }

      console.log(chalk.blue(`💰 ${amount} ${crypto.toUpperCase()} in Multiple Fiat Currencies\n`));

      const fiatCurrencies = fiats.split(',').map((f: string) => f.trim().toUpperCase());
      const conversions = await priceService.getMultipleFiatConversions(amount, crypto, fiatCurrencies);

      for (const [currency, conversion] of Object.entries(conversions)) {
        if (conversion) {
          const formatted = priceService.formatCurrency((conversion as any).amount, currency);
          console.log(chalk.cyan(`  ${currency}: ${formatted}`));
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to show fiat conversions:'), error?.message || error);
    }
  }

  async watchPrices(options: any): Promise<void> {
    const symbols = options.symbols.split(',').map((s: string) => s.trim().toUpperCase());
    const interval = parseInt(options.interval) * 1000;
    const fiatCurrency = options.fiat.toUpperCase();

    console.log(chalk.blue(`👀 Watching prices for ${symbols.join(', ')} (updates every ${options.interval}s)\n`));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    const updatePrices = async () => {
      try {
        console.clear();
        console.log(chalk.blue(`👀 Live Crypto Prices (${new Date().toLocaleTimeString()})\n`));

        for (const symbol of symbols) {
          try {
            const price = await priceService.getCryptoPrice(symbol);
            const priceFormatted = priceService.formatCurrency(price, fiatCurrency);
            console.log(chalk.cyan(`${symbol}: ${priceFormatted}`));
          } catch (error: any) {
            console.log(chalk.red(`${symbol}: Error - ${error?.message || error}`));
          }
        }

        console.log(chalk.gray(`\nNext update in ${options.interval} seconds...`));

      } catch (error: any) {
        console.error(chalk.red('❌ Error updating prices:'), error?.message || error);
      }
    };

    // Initial update
    await updatePrices();

    // Set up interval
    const intervalId = setInterval(updatePrices, interval);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      console.log(chalk.yellow('\n👋 Price watching stopped'));
      process.exit(0);
    });
  }

  async getExchangeRates(options: any): Promise<void> {
    try {
      console.log(chalk.blue(`💱 Exchange Rates (Base: ${options.base})\n`));

      const currencies = options.currencies.split(',').map((c: string) => c.trim().toUpperCase());

      for (const currency of currencies) {
        try {
          const rate = await priceService.getFiatRate(options.base, currency);
          console.log(chalk.cyan(`1 ${options.base} = ${rate.toFixed(4)} ${currency}`));
        } catch (error: any) {
          console.log(chalk.red(`${currency}: Error - ${error?.message || error}`));
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to fetch exchange rates:'), error?.message || error);
    }
  }

  // Test functionality from test-price-command.ts
  async testPriceConversion(options: any): Promise<void> {
    console.log(chalk.blue('🧪 Testing Price Conversion Service\n'));

    try {
      const amount = parseFloat(options.amount);
      const cryptoSymbol = options.crypto.toUpperCase();
      const fiatCurrency = options.fiat.toUpperCase();

      console.log(chalk.yellow(`Converting ${amount} ${cryptoSymbol} to ${fiatCurrency}...\n`));

      // Show crypto price
      const cryptoPrice = await priceService.getCryptoPrice(cryptoSymbol);
      console.log(chalk.cyan(`💎 Current ${cryptoSymbol} Price: ${priceService.formatCurrency(cryptoPrice, 'USD', 2)}`));

      // Show conversion
      const conversion = await priceService.convertCryptoToFiat(amount, cryptoSymbol, fiatCurrency);
      console.log(chalk.green(`🔄 ${amount} ${cryptoSymbol} = ${priceService.formatCurrency(conversion.amount, fiatCurrency, 2)}`));

      // Show multiple conversions
      console.log(chalk.blue('\n💰 Multiple Currency Conversions:'));
      const currencies = ['USD', 'EUR', 'INR', 'GBP', 'JPY'];
      
      for (const currency of currencies) {
        try {
          const conv = await priceService.convertCryptoToFiat(amount, cryptoSymbol, currency);
          const formatted = priceService.formatCurrency(conv.amount, currency, 2);
          console.log(chalk.cyan(`  ${currency}: ${formatted}`));
        } catch (error) {
          console.log(chalk.red(`  ${currency}: Error`));
        }
      }

      console.log(chalk.green('\n✅ Price conversion test completed!'));

    } catch (error: any) {
      console.error(chalk.red('❌ Test failed:'), error?.message || error);
    }
  }

  // Test fiat to crypto from test-fiat-to-crypto-command.ts
  async testFiatToCrypto(options: any): Promise<void> {
    console.log(chalk.blue('🧪 Testing Fiat to Crypto Conversion\n'));

    try {
      const amount = parseFloat(options.amount);
      const fiatCurrency = options.fiat.toUpperCase();
      const cryptoSymbol = options.crypto.toUpperCase();

      console.log(chalk.yellow(`Converting ${amount} ${fiatCurrency} to ${cryptoSymbol}...\n`));

      // Show fiat to crypto conversion
      const conversion = await priceService.convertFiatToCrypto(amount, fiatCurrency, cryptoSymbol);
      console.log(chalk.green(`🔄 ${priceService.formatCurrency(amount, fiatCurrency, 2)} = ${priceService.formatCurrency(conversion.amount, cryptoSymbol, 6)}`));

      // Show current crypto price
      const cryptoPrice = await priceService.getCryptoPrice(cryptoSymbol);
      console.log(chalk.cyan(`💎 Current ${cryptoSymbol} Price: ${priceService.formatCurrency(cryptoPrice, 'USD', 2)}`));

      // Show USD equivalent
      console.log(chalk.gray(`💵 USD Equivalent: ${priceService.formatCurrency(conversion.usdAmount, 'USD', 2)}`));

      // Show how much crypto you can buy with different fiat amounts
      console.log(chalk.blue('\n🛒 Purchasing Power Examples:'));
      const amounts = [10000, 50000, 100000, 500000]; // INR amounts
      
      for (const amt of amounts) {
        try {
          const conv = await priceService.convertFiatToCrypto(amt, fiatCurrency, cryptoSymbol);
          const fiatFormatted = priceService.formatCurrency(amt, fiatCurrency, 0);
          const cryptoFormatted = priceService.formatCurrency(conv.amount, cryptoSymbol, 4);
          console.log(chalk.cyan(`  ${fiatFormatted} → ${cryptoFormatted}`));
        } catch (error) {
          console.log(chalk.red(`  ${amt} ${fiatCurrency}: Error`));
        }
      }

      console.log(chalk.green('\n✅ Fiat to crypto conversion test completed!'));

    } catch (error: any) {
      console.error(chalk.red('❌ Test failed:'), error?.message || error);
    }
  }

  // Demo integration from demo-integration-command.ts
  async demoIntegration(options: any): Promise<void> {
    console.log(chalk.blue.bold('🎬 QuantraPay Price Integration Demo\n'));

    const scenario = options.scenario.toLowerCase();

    if (scenario === 'all' || scenario === 'merchant') {
      await this.demonstrateMerchantScenario();
    }

    if (scenario === 'all' || scenario === 'payer') {
      await this.demonstratePayerScenario();
    }

    if (scenario === 'all' || scenario === 'escrow') {
      await this.demonstrateEscrowScenario();
    }

    if (scenario === 'all' || scenario === 'dashboard') {
      await this.demonstrateDashboardScenario();
    }

    console.log(chalk.green.bold('\\n✅ Integration demo completed!'));
  }

  async demonstrateMerchantScenario(): Promise<void> {
    console.log(chalk.cyan.bold('👨‍💼 MERCHANT SCENARIO'));
    console.log(chalk.gray('Merchant receives crypto payments and wants to see fiat values'));
    console.log(chalk.blue('─'.repeat(60)));

    // Simulate merchant receiving payments
    const payments = [
      { merchantId: 'MERCHANT_001', amount: 2.5, token: 'ETH', date: '2025-09-13' },
      { merchantId: 'MERCHANT_001', amount: 1000, token: 'USDC', date: '2025-09-13' },
      { merchantId: 'MERCHANT_001', amount: 0.05, token: 'BTC', date: '2025-09-12' }
    ];

    await priceIntegration.displayMerchantPaymentSummary(payments);
  }

  async demonstratePayerScenario(): Promise<void> {
    console.log(chalk.magenta.bold('\\n💳 PAYER SCENARIO'));
    console.log(chalk.gray('Payer wants to see how much crypto they need for fiat amounts'));
    console.log(chalk.blue('─'.repeat(60)));

    // Simulate payer checking conversion rates
    console.log(chalk.yellow('🔍 Checking conversion rates...\\n'));

    try {
      const scenarios = [
        { fiat: 100000, currency: 'INR', crypto: 'ETH' },
        { fiat: 500, currency: 'USD', crypto: 'BTC' },
        { fiat: 10000, currency: 'INR', crypto: 'USDC' }
      ];

      for (const scenario of scenarios) {
        const conversion = await priceService.convertFiatToCrypto(scenario.fiat, scenario.currency, scenario.crypto);
        const fiatFormatted = priceService.formatCurrency(scenario.fiat, scenario.currency, 0);
        const cryptoFormatted = priceService.formatCurrency(conversion.amount, scenario.crypto, 6);
        
        console.log(chalk.cyan(`💰 ${fiatFormatted} = ${chalk.green(cryptoFormatted)}`));
        console.log(chalk.gray(`   Current ${scenario.crypto} price: ${priceService.formatCurrency(conversion.cryptoPrice, 'USD', 2)}\\n`));
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Payer scenario failed:'), error?.message || error);
    }
  }

  async demonstrateEscrowScenario(): Promise<void> {
    console.log(chalk.green.bold('\\n🔒 ESCROW SCENARIO'));
    console.log(chalk.gray('Escrow service shows portfolio values in multiple currencies'));
    console.log(chalk.blue('─'.repeat(60)));

    // Simulate escrow portfolio
    const escrows = [
      { escrowId: 'ESC_001', amount: 5.2, token: 'ETH', network: 'arbitrumSepolia', status: 'active' },
      { escrowId: 'ESC_002', amount: 2500, token: 'USDC', network: 'avalanche', status: 'pending' },
      { escrowId: 'ESC_003', amount: 0.08, token: 'BTC', network: 'arbitrumSepolia', status: 'completed' },
      { escrowId: 'ESC_004', amount: 100, token: 'AVAX', network: 'avalanche', status: 'active' }
    ];

    console.log(chalk.blue('📊 Escrow Portfolio with Live Values:\\n'));

    let totalUsdValue = 0;
    for (const escrow of escrows) {
      const summary = await priceIntegration.formatEscrowSummary(escrow);
      console.log(chalk.cyan(summary));
      
      // Calculate total value
      if (['ETH', 'BTC', 'USDC', 'USDT', 'AVAX'].includes(escrow.token)) {
        try {
          const usdConversion = await priceService.convertCryptoToFiat(escrow.amount, escrow.token, 'USD');
          totalUsdValue += usdConversion.amount;
        } catch (error) {
          // Skip if price not available
        }
      }
    }

    if (totalUsdValue > 0) {
      console.log(chalk.yellow(`\\n💰 Total Portfolio Value: ${priceService.formatCurrency(totalUsdValue, 'USD')}`));
      
      try {
        const inrRate = await priceService.getFiatRate('USD', 'INR');
        const inrEquivalent = totalUsdValue * inrRate;
        console.log(chalk.cyan(`   Equivalent: ${priceService.formatCurrency(inrEquivalent, 'INR')}`));
      } catch (error) {
        // Skip if conversion fails
      }
    }
  }

  async demonstrateDashboardScenario(): Promise<void> {
    console.log(chalk.blue.bold('\\n📊 DASHBOARD SCENARIO'));
    console.log(chalk.gray('Live price tickers and market overview'));
    console.log(chalk.blue('─'.repeat(60)));

    try {
      console.log(chalk.yellow('📈 Live Market Prices:\\n'));

      const cryptos = ['ETH', 'BTC', 'USDC', 'AVAX', 'ARB'];
      for (const crypto of cryptos) {
        try {
          const price = await priceService.getCryptoPrice(crypto);
          const priceFormatted = priceService.formatCurrency(price, 'USD', 2);
          console.log(chalk.cyan(`${crypto.padEnd(6)} ${priceFormatted}`));
        } catch (error) {
          console.log(chalk.red(`${crypto.padEnd(6)} Error`));
        }
      }

      console.log(chalk.yellow('\\n💱 Exchange Rates (USD base):\\n'));
      const fiats = ['EUR', 'GBP', 'INR', 'JPY'];
      for (const fiat of fiats) {
        try {
          const rate = await priceService.getFiatRate('USD', fiat);
          console.log(chalk.cyan(`1 USD = ${rate.toFixed(4)} ${fiat}`));
        } catch (error) {
          console.log(chalk.red(`${fiat}: Error`));
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Dashboard scenario failed:'), error?.message || error);
    }
  }
}

export const priceCommands = new PriceCommands();