import axios from 'axios';
import chalk from 'chalk';

/**
 * Comprehensive Price Service
 * Fetches crypto prices from Pyth Network and fiat exchange rates
 * Provides conversion utilities between crypto and fiat currencies
 * Includes fallback mechanism using mock prices when Pyth Network is unavailable
 */

export interface CryptoPrice {
  symbol: string;
  priceUsd: number;
  confidence: number;
  timestamp: number;
  expo: number;
}

export interface FiatExchangeRates {
  base: string;
  rates: { [currency: string]: number };
  timestamp: number;
}

export interface ConversionResult {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  usdAmount?: number;
  timestamp: number;
}

// Mock crypto prices for fallback when Pyth Network is unavailable
const MOCK_CRYPTO_PRICES: { [key: string]: number } = {
  'ETH': 3800.50,
  'BTC': 94500.00,
  'USDC': 1.00,
  'USDT': 0.999,
  'AVAX': 42.30,
  'ARB': 0.85,
  'APT': 12.50,
};

export class PriceService {
  private pythEndpoint = 'https://hermes.pyth.network/api/latest_price_feeds';
  private exchangeRateEndpoint = 'https://api.exchangerate-api.com/v4/latest/USD';
  
  // Pyth Network price feed IDs for major cryptocurrencies
  private readonly pythPriceIds: { [key: string]: string } = {
    'ETH': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH/USD
    'BTC': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC/USD
    'USDC': '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a', // USDC/USD
    'USDT': '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b', // USDT/USD
    'AVAX': '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7', // AVAX/USD
    'ARB': '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5', // ARB/USD
    'APT': '0x03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5', // APT/USD
  };

  // Major fiat currencies we support
  private readonly supportedFiatCurrencies = [
    'USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD', 'CHF', 'CNY', 'BRL'
  ];

  private cryptoCache: Map<string, CryptoPrice> = new Map();
  private fiatCache: FiatExchangeRates | null = null;
  private readonly cacheTimeout = 60000; // 1 minute cache

  /**
   * Fetch crypto prices from Pyth Network
   */
  async fetchCryptoPrices(symbols: string[] = []): Promise<Map<string, CryptoPrice>> {
    try {
      const symbolsToFetch = symbols.length > 0 ? symbols : Object.keys(this.pythPriceIds);
      const priceIds = symbolsToFetch
        .filter(symbol => this.pythPriceIds[symbol])
        .map(symbol => this.pythPriceIds[symbol]);

      if (priceIds.length === 0) {
        throw new Error('No valid crypto symbols provided');
      }

      const response = await axios.get(this.pythEndpoint, {
        params: {
          ids: priceIds,
          parsed: true
        },
        timeout: 10000
      });

      const prices = new Map<string, CryptoPrice>();

      for (const feed of response.data) {
        const symbol = this.getSymbolFromPriceId(feed.id);
        if (symbol && feed.price) {
          const price: CryptoPrice = {
            symbol,
            priceUsd: parseFloat(feed.price.price) * Math.pow(10, feed.price.expo),
            confidence: parseFloat(feed.price.conf) * Math.pow(10, feed.price.expo),
            timestamp: feed.price.publish_time * 1000,
            expo: feed.price.expo
          };
          
          prices.set(symbol, price);
          this.cryptoCache.set(symbol, price);
        }
      }

      console.log(chalk.green(`✓ Fetched ${prices.size} crypto prices from Pyth Network`));
      return prices;

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to fetch crypto prices:'), error?.message || error);
      
      // Return cached data if available
      if (this.cryptoCache.size > 0) {
        console.log(chalk.yellow('⚠ Using cached crypto prices'));
        return new Map(this.cryptoCache);
      }
      
      throw error;
    }
  }

  /**
   * Fetch fiat exchange rates (USD base)
   */
  async fetchFiatExchangeRates(): Promise<FiatExchangeRates> {
    try {
      const response = await axios.get(this.exchangeRateEndpoint, {
        timeout: 10000
      });

      const rates: FiatExchangeRates = {
        base: 'USD',
        rates: response.data.rates,
        timestamp: Date.now()
      };

      this.fiatCache = rates;
      console.log(chalk.green(`✓ Fetched fiat exchange rates for ${Object.keys(rates.rates).length} currencies`));
      
      return rates;

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to fetch fiat exchange rates:'), error?.message || error);
      
      // Return cached data if available
      if (this.fiatCache) {
        console.log(chalk.yellow('⚠ Using cached fiat exchange rates'));
        return this.fiatCache;
      }
      
      throw error;
    }
  }

  /**
   * Get crypto price in USD (with fallback to mock prices)
   */
  async getCryptoPrice(symbol: string): Promise<number> {
    // Check cache first
    const cached = this.cryptoCache.get(symbol.toUpperCase());
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.priceUsd;
    }

    try {
      // Try Pyth Network first
      const prices = await this.fetchCryptoPrices([symbol.toUpperCase()]);
      const price = prices.get(symbol.toUpperCase());
      
      if (price) {
        return price.priceUsd;
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠ Pyth Network unavailable for ${symbol}, using fallback price`));
    }

    // Fallback to mock prices
    const mockPrice = MOCK_CRYPTO_PRICES[symbol.toUpperCase()];
    if (!mockPrice) {
      throw new Error(`Price not found for ${symbol} in both Pyth Network and fallback prices`);
    }

    const fallbackPrice: CryptoPrice = {
      symbol: symbol.toUpperCase(),
      priceUsd: mockPrice,
      confidence: 0,
      timestamp: Date.now(),
      expo: 0
    };

    this.cryptoCache.set(symbol.toUpperCase(), fallbackPrice);
    return mockPrice;
  }

  /**
   * Get fiat exchange rate
   */
  async getFiatRate(fromCurrency: string, toCurrency: string): Promise<number> {
    const rates = await this.fetchFiatExchangeRates();
    
    fromCurrency = fromCurrency.toUpperCase();
    toCurrency = toCurrency.toUpperCase();

    if (fromCurrency === 'USD') {
      return rates.rates[toCurrency] || 1;
    }
    
    if (toCurrency === 'USD') {
      return 1 / (rates.rates[fromCurrency] || 1);
    }

    // Convert through USD
    const fromUsdRate = rates.rates[fromCurrency] || 1;
    const toUsdRate = rates.rates[toCurrency] || 1;
    
    return toUsdRate / fromUsdRate;
  }

  /**
   * Convert crypto amount to fiat currency (simplified for compatibility)
   */
  async convertCryptoToFiat(amount: number, cryptoSymbol: string, fiatCurrency: string): Promise<{
    amount: number;
    cryptoPrice: number;
    fiatRate: number;
    usdAmount: number;
  }> {
    const cryptoPrice = await this.getCryptoPrice(cryptoSymbol);
    const usdAmount = amount * cryptoPrice;
    
    let finalAmount = usdAmount;
    let fiatRate = 1;

    if (fiatCurrency.toUpperCase() !== 'USD') {
      fiatRate = await this.getFiatRate('USD', fiatCurrency);
      finalAmount = usdAmount * fiatRate;
    }

    return {
      amount: finalAmount,
      cryptoPrice,
      fiatRate,
      usdAmount
    };
  }

  /**
   * Convert fiat amount to crypto (simplified for compatibility)
   */
  async convertFiatToCrypto(amount: number, fiatCurrency: string, cryptoSymbol: string): Promise<{
    amount: number;
    cryptoPrice: number;
    fiatRate: number;
    usdAmount: number;
  }> {
    const cryptoPrice = await this.getCryptoPrice(cryptoSymbol);
    
    let usdAmount = amount;
    let fiatRate = 1;

    if (fiatCurrency.toUpperCase() !== 'USD') {
      fiatRate = await this.getFiatRate(fiatCurrency, 'USD');
      usdAmount = amount * fiatRate;
    }

    const cryptoAmount = usdAmount / cryptoPrice;

    return {
      amount: cryptoAmount,
      cryptoPrice,
      fiatRate,
      usdAmount
    };
  }

  /**
   * Get conversion between any two currencies (crypto or fiat)
   */
  async convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<ConversionResult> {
    const isCryptoFrom = this.isCryptoCurrency(fromCurrency);
    const isCryptoTo = this.isCryptoCurrency(toCurrency);

    if (isCryptoFrom && !isCryptoTo) {
      const result = await this.convertCryptoToFiat(amount, fromCurrency, toCurrency);
      return {
        amount: result.amount,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate: result.cryptoPrice * result.fiatRate,
        usdAmount: result.usdAmount,
        timestamp: Date.now()
      };
    } else if (!isCryptoFrom && isCryptoTo) {
      const result = await this.convertFiatToCrypto(amount, fromCurrency, toCurrency);
      return {
        amount: result.amount,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate: 1 / result.cryptoPrice,
        usdAmount: result.usdAmount,
        timestamp: Date.now()
      };
    } else if (isCryptoFrom && isCryptoTo) {
      // Crypto to crypto (via USD)
      const cryptoToUsd = await this.convertCryptoToFiat(amount, fromCurrency, 'USD');
      const usdToCrypto = await this.convertFiatToCrypto(cryptoToUsd.amount, 'USD', toCurrency);
      return {
        amount: usdToCrypto.amount,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate: cryptoToUsd.cryptoPrice / usdToCrypto.cryptoPrice,
        usdAmount: cryptoToUsd.usdAmount,
        timestamp: Date.now()
      };
    } else {
      // Fiat to fiat
      const rate = await this.getFiatRate(fromCurrency, toCurrency);
      return {
        amount: amount * rate,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        rate,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Format currency amount for display
   */
  formatCurrency(amount: number, currency: string, decimals?: number): string {
    const isCrypto = this.isCryptoCurrency(currency);
    const defaultDecimals = isCrypto ? 6 : 2;
    const precision = decimals ?? defaultDecimals;

    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    });

    return `${formatted} ${currency.toUpperCase()}`;
  }

  /**
   * Display conversion with formatting
   */
  async displayConversion(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<string> {
    try {
      const conversion = await this.convertCurrency(amount, fromCurrency, toCurrency);
      
      const fromFormatted = this.formatCurrency(amount, fromCurrency);
      const toFormatted = this.formatCurrency(conversion.amount, toCurrency);
      
      let result = `${fromFormatted} = ${chalk.green(toFormatted)}`;
      
      if (conversion.usdAmount && !['USD'].includes(fromCurrency.toUpperCase()) && !['USD'].includes(toCurrency.toUpperCase())) {
        result += chalk.gray(` (via ${this.formatCurrency(conversion.usdAmount, 'USD')})`);
      }
      
      return result;

    } catch (error: any) {
      return chalk.red(`❌ Conversion failed: ${error?.message || error}`);
    }
  }

  /**
   * Get multiple conversion rates for a crypto amount
   */
  async getMultipleFiatConversions(
    amount: number,
    cryptoSymbol: string,
    fiatCurrencies: string[] = ['USD', 'EUR', 'INR', 'GBP']
  ): Promise<{ [currency: string]: any }> {
    const results: { [currency: string]: any } = {};

    await Promise.all(
      fiatCurrencies.map(async (fiatCurrency) => {
        try {
          results[fiatCurrency] = await this.convertCryptoToFiat(amount, cryptoSymbol, fiatCurrency);
        } catch (error: any) {
          console.error(`Failed to convert ${cryptoSymbol} to ${fiatCurrency}:`, error?.message || error);
        }
      })
    );

    return results;
  }

  /**
   * Check if currency is a supported cryptocurrency
   */
  private isCryptoCurrency(currency: string): boolean {
    return Object.keys(this.pythPriceIds).includes(currency.toUpperCase()) || 
           Object.keys(MOCK_CRYPTO_PRICES).includes(currency.toUpperCase());
  }

  /**
   * Get symbol from Pyth price feed ID
   */
  private getSymbolFromPriceId(priceId: string): string | null {
    for (const [symbol, id] of Object.entries(this.pythPriceIds)) {
      if (id === priceId) {
        return symbol;
      }
    }
    return null;
  }

  /**
   * Get supported currencies
   */
  getSupportedCryptoCurrencies(): string[] {
    return Object.keys(this.pythPriceIds);
  }

  getSupportedFiatCurrencies(): string[] {
    return this.supportedFiatCurrencies;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cryptoCache.clear();
    this.fiatCache = null;
    console.log(chalk.yellow('🗑️ Price cache cleared'));
  }
}

// Export singleton instance
export const priceService = new PriceService();
// Compatibility export
export const simplePriceService = priceService;