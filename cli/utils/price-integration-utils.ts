import chalk from 'chalk';
import { priceService } from '../services/price-service.js';

/**
 * Integration utilities for price service across the QuantraPay platform
 * Provides consistent price display and conversion functionality
 */

export interface PriceDisplayOptions {
  showMultipleCurrencies?: boolean;
  targetFiats?: string[];
  showUsdEquivalent?: boolean;
  compact?: boolean;
  precision?: number;
}

export interface AmountWithPrice {
  amount: number;
  currency: string;
  usdEquivalent?: number;
  fiatConversions?: { [currency: string]: number };
}

export class PriceIntegrationUtils {
  /**
   * Default fiat currencies to show in conversions
   */
  private static readonly DEFAULT_FIAT_CURRENCIES = ['USD', 'EUR', 'INR', 'GBP'];

  /**
   * Enhanced amount display with price conversions
   */
  static async displayAmountWithPrices(
    amount: number, 
    currency: string, 
    options: PriceDisplayOptions = {}
  ): Promise<void> {
    const {
      showMultipleCurrencies = true,
      targetFiats = this.DEFAULT_FIAT_CURRENCIES,
      showUsdEquivalent = true,
      compact = false,
      precision = 2
    } = options;

    console.log(chalk.blue(`\n💰 Amount: ${priceService.formatCurrency(amount, currency)}`));

    // Show crypto price if it's a cryptocurrency
    if (this.isCryptoCurrency(currency)) {
      try {
        const cryptoPrice = await priceService.getCryptoPrice(currency);
        console.log(chalk.gray(`💎 Current ${currency.toUpperCase()} Price: ${priceService.formatCurrency(cryptoPrice, 'USD')}`));
      } catch (error) {
        // Ignore price fetch errors
      }
    }

    // Show conversions
    if (showMultipleCurrencies && this.isCryptoCurrency(currency)) {
      await this.displayCryptoConversions(amount, currency, targetFiats, compact);
    } else if (showUsdEquivalent && currency.toUpperCase() !== 'USD') {
      await this.displaySingleConversion(amount, currency, 'USD');
    }
  }

  /**
   * Display crypto conversions to multiple fiat currencies
   */
  private static async displayCryptoConversions(
    amount: number, 
    cryptoSymbol: string, 
    fiatCurrencies: string[], 
    compact: boolean = false
  ): Promise<void> {
    if (compact) {
      console.log(chalk.cyan('💱 Conversions: '), { end: '' });
      const conversions = [];
      
      for (const fiat of fiatCurrencies.slice(0, 3)) { // Show only first 3 in compact mode
        try {
          const conversion = await priceService.convertCryptoToFiat(amount, cryptoSymbol, fiat);
          conversions.push(`${priceService.formatCurrency(conversion.amount, fiat, 0)}`);
        } catch (error) {
          // Skip failed conversions
        }
      }
      
      console.log(chalk.cyan(conversions.join(' | ')));
      return;
    }

    // Full display
    console.log(chalk.yellow('\n┌─────────────────────────────────────────┐'));
    console.log(chalk.yellow('│            Currency Conversions        │'));
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
  }

  /**
   * Display single currency conversion
   */
  private static async displaySingleConversion(
    amount: number, 
    fromCurrency: string, 
    toCurrency: string
  ): Promise<void> {
    try {
      if (this.isCryptoCurrency(fromCurrency)) {
        const conversion = await priceService.convertCryptoToFiat(amount, fromCurrency, toCurrency);
        console.log(chalk.cyan(`💵 ${toCurrency} Equivalent: ~${priceService.formatCurrency(conversion.amount, toCurrency)}`));
      } else {
        const conversion = await priceService.convertFiatToCrypto(amount, fromCurrency, toCurrency);
        console.log(chalk.cyan(`💵 ${toCurrency} Equivalent: ~${priceService.formatCurrency(conversion.amount, toCurrency)}`));
      }
    } catch (error) {
      console.log(chalk.gray(`💵 ${toCurrency} Equivalent: Not available`));
    }
  }

  /**
   * Get amount with price information
   */
  static async getAmountWithPrice(amount: number, currency: string): Promise<AmountWithPrice> {
    const result: AmountWithPrice = {
      amount,
      currency: currency.toUpperCase()
    };

    if (this.isCryptoCurrency(currency)) {
      try {
        // Get USD equivalent
        const usdConversion = await priceService.convertCryptoToFiat(amount, currency, 'USD');
        result.usdEquivalent = usdConversion.amount;

        // Get multiple fiat conversions
        result.fiatConversions = {};
        for (const fiat of this.DEFAULT_FIAT_CURRENCIES) {
          try {
            const conversion = await priceService.convertCryptoToFiat(amount, currency, fiat);
            result.fiatConversions[fiat] = conversion.amount;
          } catch (error) {
            // Skip failed conversions
          }
        }
      } catch (error) {
        // Price data not available
      }
    }

    return result;
  }

  /**
   * Format escrow summary with price information
   */
  static async formatEscrowSummary(escrow: {
    escrowId: string;
    amount: number;
    token: string;
    network: string;
    status: string;
  }): Promise<string> {
    let summary = `Escrow ${escrow.escrowId}: ${escrow.amount} ${escrow.token} on ${escrow.network} (${escrow.status})`;

    if (this.isCryptoCurrency(escrow.token)) {
      try {
        const usdValue = await priceService.convertCryptoToFiat(escrow.amount, escrow.token, 'USD');
        const inrValue = await priceService.convertCryptoToFiat(escrow.amount, escrow.token, 'INR');
        
        summary += `\n  💵 Value: ~${priceService.formatCurrency(usdValue.amount, 'USD')} | ~${priceService.formatCurrency(inrValue.amount, 'INR')}`;
      } catch (error) {
        // Price not available
      }
    }

    return summary;
  }

  /**
   * Display merchant payment summary with conversions
   */
  static async displayMerchantPaymentSummary(payments: Array<{
    merchantId: string;
    amount: number;
    token: string;
    date: string;
  }>): Promise<void> {
    console.log(chalk.blue('\n📊 Merchant Payment Summary\n'));

    let totalUsdValue = 0;
    let totalInrValue = 0;

    for (const payment of payments) {
      console.log(chalk.cyan(`${payment.merchantId}: ${payment.amount} ${payment.token} (${payment.date})`));

      if (this.isCryptoCurrency(payment.token)) {
        try {
          const usdConversion = await priceService.convertCryptoToFiat(payment.amount, payment.token, 'USD');
          const inrConversion = await priceService.convertCryptoToFiat(payment.amount, payment.token, 'INR');
          
          totalUsdValue += usdConversion.amount;
          totalInrValue += inrConversion.amount;

          console.log(chalk.gray(`  💵 ~${priceService.formatCurrency(usdConversion.amount, 'USD')} | ~${priceService.formatCurrency(inrConversion.amount, 'INR')}`));
        } catch (error) {
          console.log(chalk.gray('  💵 Price data not available'));
        }
      }
    }

    if (totalUsdValue > 0) {
      console.log(chalk.yellow(`\n📈 Total Value: ~${priceService.formatCurrency(totalUsdValue, 'USD')} | ~${priceService.formatCurrency(totalInrValue, 'INR')}`));
    }
  }

  /**
   * Enhanced transaction display with price context
   */
  static async displayTransactionWithPrice(tx: {
    hash: string;
    amount: number;
    token: string;
    network: string;
    timestamp: number;
    status: string;
  }): Promise<void> {
    console.log(chalk.blue(`\n🔗 Transaction: ${tx.hash}`));
    console.log(chalk.cyan(`   Amount: ${tx.amount} ${tx.token}`));
    console.log(chalk.gray(`   Network: ${tx.network}`));
    console.log(chalk.gray(`   Status: ${tx.status}`));
    console.log(chalk.gray(`   Time: ${new Date(tx.timestamp * 1000).toLocaleString()}`));

    // Show price context
    if (this.isCryptoCurrency(tx.token)) {
      try {
        const usdValue = await priceService.convertCryptoToFiat(tx.amount, tx.token, 'USD');
        const inrValue = await priceService.convertCryptoToFiat(tx.amount, tx.token, 'INR');
        
        console.log(chalk.cyan(`   💵 Value: ~${priceService.formatCurrency(usdValue.amount, 'USD')} | ~${priceService.formatCurrency(inrValue.amount, 'INR')}`));
      } catch (error) {
        // Price not available
      }
    }
  }

  /**
   * Quick price ticker for dashboards
   */
  static async displayPriceTicker(symbols: string[] = ['ETH', 'BTC', 'USDC']): Promise<void> {
    console.log(chalk.blue('📊 Quick Price Ticker:'));
    
    const prices = [];
    for (const symbol of symbols) {
      try {
        const price = await priceService.getCryptoPrice(symbol);
        prices.push(`${symbol}: ${priceService.formatCurrency(price, 'USD', 0)}`);
      } catch (error) {
        prices.push(`${symbol}: N/A`);
      }
    }

    console.log(chalk.cyan(`   ${prices.join(' | ')}`));
  }

  /**
   * Check if currency is cryptocurrency
   */
  private static isCryptoCurrency(currency: string): boolean {
    return ['ETH', 'BTC', 'USDC', 'USDT', 'AVAX', 'ARB', 'APT'].includes(currency.toUpperCase());
  }

  /**
   * Format amount for display with appropriate precision
   */
  static formatAmount(amount: number, currency: string): string {
    return priceService.formatCurrency(amount, currency);
  }

  /**
   * Get supported currencies
   */
  static getSupportedCryptoCurrencies(): string[] {
    return ['ETH', 'BTC', 'USDC', 'USDT', 'AVAX', 'ARB', 'APT'];
  }

  static getSupportedFiatCurrencies(): string[] {
    return ['USD', 'EUR', 'INR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'BRL'];
  }
}

// Export as singleton for consistent usage
export const priceIntegration = PriceIntegrationUtils;