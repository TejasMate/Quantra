import { ethers } from 'ethers';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

interface SettlementRequest {
  settlementId: string;
  escrowId: string;
  escrowAddress: string;
  merchantId: string;
  payerAddress: string;
  amount: string;
  token: string;
  network: string;
  merchantPaymentMethod: {
    type: 'upi' | 'pix' | 'sepa';
    upiId?: string;
    pixKey?: string;
    iban?: string;
    accountHolder?: string;
  };
  disputePeriodEnd: number;
  status: 'pending' | 'ready' | 'settling' | 'completed' | 'disputed' | 'failed';
  createdAt: number;
  settledAt?: number;
  settlementFee: string;
  fiatAmount: string;
  exchangeRate: string;
  onChainRegistered: boolean;
  onChainTxHash?: string;
}

interface SettlerConfig {
  enabled: boolean;
  privateKey: string;
  address: string;
  disputePeriodHours: number;
  settlementFeePercentage: number;
  autoSettlementEnabled: boolean;
  supportedNetworks: string[];
  fiatProviders: Record<string, any>;
  settlementRegistryAddresses: Record<string, string>;
}

interface OnChainSettlement {
  settlementId: string;
  escrowId: string;
  escrowAddress: string;
  payer: string;
  merchantId: string;
  settler: string;
  cryptoAmount: string;
  tokenAddress: string;
  tokenSymbol: string;
  paymentMethod: number;
  fiatAmount: string;
  fiatCurrency: string;
  status: number;
  disputePeriodEnd: string;
  cryptoTxHash: string;
  fiatTxRef: string;
  proofHash: string;
}

export class SettlerService {
  private config: SettlerConfig;
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private settlerWallet: Map<string, ethers.Wallet> = new Map();
  private settlementQueue: Map<string, SettlementRequest> = new Map();
  private activeSettlements: Map<string, SettlementRequest> = new Map();

  constructor() {
    this.config = this.loadSettlerConfig();
    this.initializeProviders();
    this.initializeSettlerWallets();
    this.startSettlementMonitor();
  }

  private loadSettlerConfig(): SettlerConfig {
    return {
      enabled: process.env.SETTLER_ENABLED === 'true',
      privateKey: process.env.SETTLER_PRIVATE_KEY || '',
      address: process.env.SETTLER_ADDRESS || '',
      disputePeriodHours: parseInt(process.env.DISPUTE_PERIOD_HOURS || '72'),
      settlementFeePercentage: parseFloat(process.env.SETTLEMENT_FEE_PERCENTAGE || '0.5'),
      autoSettlementEnabled: process.env.AUTO_SETTLEMENT_ENABLED === 'true',
      supportedNetworks: ['arbitrumSepolia', 'arbitrum', 'avalanche', 'aptos'], // Testnet networks
      fiatProviders: {
        upi: { name: 'UPI Gateway', enabled: true },
        pix: { name: 'PIX Gateway', enabled: true },
        sepa: { name: 'SEPA Gateway', enabled: true }
      },
      settlementRegistryAddresses: this.loadSettlementRegistryAddresses()
    };
  }

  private loadSettlementRegistryAddresses(): Record<string, string> {
    try {
      // Load deployed contract addresses for each network
      const deployments: Record<string, string> = {};
      
      const networksToLoad = ['arbitrumSepolia', 'arbitrum', 'avalanche', 'localhost'];
      
      for (const network of networksToLoad) {
        try {
          const deploymentPath = path.join(process.cwd(), '..', 'deployments', `settlement-registry-${network}.json`);
          
          if (fs.existsSync(deploymentPath)) {
            const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
            deployments[network] = deploymentData.contractAddress;
          }
        } catch (error) {
          // Silently continue if file doesn't exist
        }
      }
      
      // Add network aliases for easier CLI usage - prioritize testnet
      if (deployments['arbitrumSepolia']) {
        deployments['arbitrum'] = deployments['arbitrumSepolia']; // Always map arbitrum to testnet
      }
      
      return deployments;
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Could not load settlement registry addresses'));
      return {};
    }
  }

  private initializeProviders(): void {
    const networkConfigs = {
      'arbitrumSepolia': { 
        rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
        chainId: 421614
      },
      'arbitrum': { 
        rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc', // Alias for arbitrumSepolia
        chainId: 421614
      },
      'avalanche': { 
        rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
        chainId: 43113
      }
    };

    Object.entries(networkConfigs).forEach(([network, config]) => {
      // Create provider with explicit network config to avoid ENS issues
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
        chainId: config.chainId,
        name: network
      });
      this.providers.set(network, provider);
    });
  }

  private initializeSettlerWallets(): void {
    if (!this.config.privateKey) {
      console.warn(chalk.yellow('⚠️ Settler private key not configured'));
      return;
    }

    this.providers.forEach((provider, network) => {
      const wallet = new ethers.Wallet(this.config.privateKey, provider);
      this.settlerWallet.set(network, wallet);
    });
  }

  /**
   * Queue a settlement request after payment completion
   */
  async queueSettlement(
    escrowId: string,
    escrowAddress: string,
    merchantId: string,
    payerAddress: string,
    amount: string,
    token: string,
    network: string,
    merchantPaymentMethod: any
  ): Promise<{ success: boolean; settlementId?: string; error?: string }> {
    console.log(chalk.blue('\n📋 Queuing Settlement Request'));
    
    try {
      if (!this.config.enabled) {
        return { success: false, error: 'Settler service disabled' };
      }

      const settlementId = `settle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const disputePeriodEnd = Date.now() + (this.config.disputePeriodHours * 60 * 60 * 1000);
      
      // Calculate settlement fee and fiat amount
      const cryptoAmount = parseFloat(amount);
      const settlementFee = (cryptoAmount * this.config.settlementFeePercentage / 100).toString();
      const exchangeRate = await this.getExchangeRate(token, merchantPaymentMethod.type);
      const fiatAmount = ((cryptoAmount - parseFloat(settlementFee)) * parseFloat(exchangeRate)).toFixed(2);

      const settlementRequest: SettlementRequest = {
        settlementId,
        escrowId,
        escrowAddress,
        merchantId,
        payerAddress,
        amount,
        token,
        network,
        merchantPaymentMethod,
        disputePeriodEnd,
        status: 'pending',
        createdAt: Date.now(),
        settlementFee,
        fiatAmount,
        exchangeRate,
        onChainRegistered: false
      };

      this.settlementQueue.set(settlementId, settlementRequest);

      // Try to register on-chain
      try {
        const onChainResult = await this.registerOnChain(settlementRequest);
        if (onChainResult.success) {
          settlementRequest.onChainRegistered = true;
          settlementRequest.onChainTxHash = onChainResult.txHash;
          console.log(chalk.green('✅ Settlement registered on-chain!'));
          console.log(chalk.gray(`   TX Hash: ${onChainResult.txHash}`));
        } else {
          console.log(chalk.yellow('⚠️ On-chain registration failed, settlement queued locally only'));
          console.log(chalk.gray(`   Reason: ${onChainResult.error}`));
        }
      } catch (error: any) {
        console.log(chalk.yellow('⚠️ On-chain registration failed, settlement queued locally only'));
        console.log(chalk.gray(`   Error: ${error.message}`));
      }

      console.log(chalk.green('✅ Settlement request queued successfully!'));
      console.log(`📋 Settlement Details:`);
      console.log(`  Settlement ID: ${settlementId}`);
      console.log(`  Escrow: ${escrowAddress}`);
      console.log(`  Merchant: ${merchantId}`);
      console.log(`  Amount: ${amount} ${token}`);
      console.log(`  Settlement Fee: ${settlementFee} ${token}`);
      console.log(`  Fiat Amount: ${fiatAmount} ${this.getFiatCurrency(merchantPaymentMethod.type)}`);
      console.log(`  Dispute Period: ${this.config.disputePeriodHours} hours`);
      console.log(`  Ready At: ${new Date(disputePeriodEnd).toLocaleString()}`);
      console.log(`  On-Chain: ${settlementRequest.onChainRegistered ? '✅ Registered' : '⚠️ Local only'}`);

      return { success: true, settlementId };

    } catch (error: any) {
      console.error(chalk.red('❌ Failed to queue settlement:'), error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute settlement after dispute period
   */
  async executeSettlement(settlementId: string): Promise<{ success: boolean; txHash?: string; fiatTxId?: string; error?: string }> {
    console.log(chalk.blue(`\n💱 Executing Settlement: ${settlementId}`));
    
    try {
      const settlement = this.settlementQueue.get(settlementId) || this.activeSettlements.get(settlementId);
      if (!settlement) {
        return { success: false, error: 'Settlement not found' };
      }

      // Check if dispute period has ended
      if (Date.now() < settlement.disputePeriodEnd) {
        const remainingHours = Math.ceil((settlement.disputePeriodEnd - Date.now()) / (60 * 60 * 1000));
        return { success: false, error: `Dispute period not ended. ${remainingHours} hours remaining.` };
      }

      // Move to active settlements
      settlement.status = 'settling';
      this.activeSettlements.set(settlementId, settlement);
      this.settlementQueue.delete(settlementId);

      console.log(chalk.yellow('🔄 Settlement Process Started'));
      console.log(`  Merchant: ${settlement.merchantId}`);
      console.log(`  Payment Method: ${settlement.merchantPaymentMethod.type.toUpperCase()}`);
      console.log(`  Crypto Amount: ${settlement.amount} ${settlement.token}`);
      console.log(`  Fiat Amount: ${settlement.fiatAmount} ${this.getFiatCurrency(settlement.merchantPaymentMethod.type)}`);

      // Step 1: Withdraw crypto from escrow
      const cryptoWithdrawal = await this.withdrawFromEscrow(settlement);
      if (!cryptoWithdrawal.success) {
        settlement.status = 'failed';
        return { success: false, error: cryptoWithdrawal.error };
      }

      console.log(chalk.green(`✅ Crypto withdrawn from escrow: ${cryptoWithdrawal.txHash}`));

      // Record withdrawal on-chain
      if (settlement.onChainRegistered && cryptoWithdrawal.txHash) {
        try {
          const onChainWithdrawal = await this.recordWithdrawalOnChain(settlement, cryptoWithdrawal.txHash);
          if (onChainWithdrawal.success) {
            console.log(chalk.green(`✅ Withdrawal recorded on-chain: ${onChainWithdrawal.txHash}`));
          } else {
            console.log(chalk.yellow(`⚠️ Failed to record withdrawal on-chain: ${onChainWithdrawal.error}`));
          }
        } catch (error: any) {
          console.log(chalk.yellow(`⚠️ On-chain withdrawal recording failed: ${error.message}`));
        }
      }

      // Step 2: Convert crypto to fiat (simulated)
      const fiatConversion = await this.convertCryptoToFiat(settlement);
      if (!fiatConversion.success) {
        settlement.status = 'failed';
        return { success: false, error: fiatConversion.error };
      }

      console.log(chalk.green(`✅ Crypto converted to fiat`));

      // Step 3: Send fiat to merchant
      const fiatTransfer = await this.sendFiatToMerchant(settlement);
      if (!fiatTransfer.success) {
        settlement.status = 'failed';
        return { success: false, error: fiatTransfer.error };
      }

      console.log(chalk.green(`✅ Fiat sent to merchant: ${fiatTransfer.txId}`));

      // Record completion on-chain
      if (settlement.onChainRegistered && fiatTransfer.txId) {
        try {
          const onChainCompletion = await this.recordCompletionOnChain(settlement, fiatTransfer.txId);
          if (onChainCompletion.success) {
            console.log(chalk.green(`✅ Settlement completion recorded on-chain: ${onChainCompletion.txHash}`));
          } else {
            console.log(chalk.yellow(`⚠️ Failed to record completion on-chain: ${onChainCompletion.error}`));
          }
        } catch (error: any) {
          console.log(chalk.yellow(`⚠️ On-chain completion recording failed: ${error.message}`));
        }
      }

      // Mark settlement as completed
      settlement.status = 'completed';
      settlement.settledAt = Date.now();

      console.log(chalk.green('🎉 Settlement completed successfully!'));
      console.log(`📊 Settlement Summary:`);
      console.log(`  Crypto TX: ${cryptoWithdrawal.txHash}`);
      console.log(`  Fiat TX: ${fiatTransfer.txId}`);
      console.log(`  Settlement Fee Earned: ${settlement.settlementFee} ${settlement.token}`);

      return { 
        success: true, 
        txHash: cryptoWithdrawal.txHash, 
        fiatTxId: fiatTransfer.txId 
      };

    } catch (error: any) {
      console.error(chalk.red('❌ Settlement execution failed:'), error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process all ready settlements automatically
   */
  async processReadySettlements(): Promise<void> {
    console.log(chalk.blue('\n🔄 Processing Ready Settlements'));
    
    const readySettlements = Array.from(this.settlementQueue.values())
      .filter(s => s.status === 'pending' && Date.now() >= s.disputePeriodEnd);

    if (readySettlements.length === 0) {
      console.log(chalk.gray('📭 No settlements ready for processing'));
      return;
    }

    console.log(chalk.yellow(`📋 Processing ${readySettlements.length} ready settlement(s):`));

    for (const settlement of readySettlements) {
      try {
        settlement.status = 'ready';
        console.log(chalk.yellow(`🔄 Processing: ${settlement.settlementId}`));
        
        if (this.config.autoSettlementEnabled) {
          const result = await this.executeSettlement(settlement.settlementId);
          if (result.success) {
            console.log(chalk.green(`✅ Auto-settled: ${settlement.settlementId}`));
          } else {
            console.log(chalk.red(`❌ Auto-settlement failed: ${result.error}`));
          }
        } else {
          console.log(chalk.yellow(`⏳ Ready for manual settlement: ${settlement.settlementId}`));
        }
      } catch (error: any) {
        console.error(chalk.red(`❌ Error processing ${settlement.settlementId}:`), error.message);
      }
    }
  }

  /**
   * List all settlements with filtering
   */
  async listSettlements(filter?: {
    status?: string;
    merchantId?: string;
    network?: string;
    limit?: number;
  }): Promise<SettlementRequest[]> {
    const allSettlements = [
      ...Array.from(this.settlementQueue.values()),
      ...Array.from(this.activeSettlements.values())
    ];

    let filtered = allSettlements;

    if (filter?.status) {
      filtered = filtered.filter(s => s.status === filter.status);
    }
    if (filter?.merchantId) {
      filtered = filtered.filter(s => s.merchantId === filter.merchantId);
    }
    if (filter?.network) {
      filtered = filtered.filter(s => s.network === filter.network);
    }

    // Sort by creation date (newest first)
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    if (filter?.limit) {
      filtered = filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  /**
   * Get settlement statistics
   */
  async getSettlementStats(): Promise<{
    total: number;
    pending: number;
    ready: number;
    settling: number;
    completed: number;
    disputed: number;
    failed: number;
    totalVolume: number;
    totalFees: number;
  }> {
    const allSettlements = [
      ...Array.from(this.settlementQueue.values()),
      ...Array.from(this.activeSettlements.values())
    ];

    const stats = {
      total: allSettlements.length,
      pending: allSettlements.filter(s => s.status === 'pending').length,
      ready: allSettlements.filter(s => s.status === 'ready').length,
      settling: allSettlements.filter(s => s.status === 'settling').length,
      completed: allSettlements.filter(s => s.status === 'completed').length,
      disputed: allSettlements.filter(s => s.status === 'disputed').length,
      failed: allSettlements.filter(s => s.status === 'failed').length,
      totalVolume: allSettlements.reduce((sum, s) => sum + parseFloat(s.amount), 0),
      totalFees: allSettlements.reduce((sum, s) => sum + parseFloat(s.settlementFee), 0)
    };

    return stats;
  }

  // Private helper methods

  private async withdrawFromEscrow(settlement: SettlementRequest): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const wallet = this.settlerWallet.get(settlement.network);
      if (!wallet) {
        return { success: false, error: `No settler wallet for network: ${settlement.network}` };
      }

      // Mock escrow withdrawal - replace with actual contract call
      const escrowContract = new ethers.Contract(
        settlement.escrowAddress,
        [
          'function settlerWithdraw(string escrowId, uint256 amount, address settler) external returns (bool)'
        ],
        wallet
      );

      console.log(chalk.yellow(`🔓 Withdrawing ${settlement.amount} ${settlement.token} from escrow...`));
      
      // Simulate withdrawal transaction
      const tx = await wallet.sendTransaction({
        to: settlement.escrowAddress,
        value: ethers.parseEther('0'), // No ETH transfer, just function call
        gasLimit: 200000
      });

      await tx.wait();
      return { success: true, txHash: tx.hash };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async convertCryptoToFiat(settlement: SettlementRequest): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(chalk.yellow(`💱 Converting ${settlement.amount} ${settlement.token} to fiat...`));
      
      // Simulate crypto-to-fiat conversion
      // In reality, this would interact with exchanges/liquidity providers
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async sendFiatToMerchant(settlement: SettlementRequest): Promise<{ success: boolean; txId?: string; error?: string }> {
    try {
      const { type } = settlement.merchantPaymentMethod;
      
      console.log(chalk.yellow(`💳 Sending ${settlement.fiatAmount} via ${type.toUpperCase()}...`));

      let fiatTxId: string;

      switch (type) {
        case 'upi':
          fiatTxId = await this.sendUpiPayment(settlement);
          break;
        case 'pix':
          fiatTxId = await this.sendPixPayment(settlement);
          break;
        case 'sepa':
          fiatTxId = await this.sendSepaPayment(settlement);
          break;
        default:
          return { success: false, error: `Unsupported payment method: ${type}` };
      }

      return { success: true, txId: fiatTxId };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async sendUpiPayment(settlement: SettlementRequest): Promise<string> {
    // Simulate UPI payment
    const { upiId } = settlement.merchantPaymentMethod;
    console.log(chalk.yellow(`📱 UPI Payment to: ${upiId}`));
    console.log(chalk.yellow(`💰 Amount: ₹${settlement.fiatAmount}`));
    
    // Mock UPI transaction ID
    await new Promise(resolve => setTimeout(resolve, 1500));
    return `UPI${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
  }

  private async sendPixPayment(settlement: SettlementRequest): Promise<string> {
    // Simulate PIX payment
    const { pixKey } = settlement.merchantPaymentMethod;
    console.log(chalk.yellow(`🇧🇷 PIX Payment to: ${pixKey}`));
    console.log(chalk.yellow(`💰 Amount: R$${settlement.fiatAmount}`));
    
    // Mock PIX transaction ID
    await new Promise(resolve => setTimeout(resolve, 1000));
    return `PIX${Date.now()}${Math.random().toString(36).substr(2, 8)}`;
  }

  private async sendSepaPayment(settlement: SettlementRequest): Promise<string> {
    // Simulate SEPA payment
    const { iban, accountHolder } = settlement.merchantPaymentMethod;
    console.log(chalk.yellow(`🏦 SEPA Payment to: ${accountHolder}`));
    console.log(chalk.yellow(`💳 IBAN: ${iban}`));
    console.log(chalk.yellow(`💰 Amount: €${settlement.fiatAmount}`));
    
    // Mock SEPA transaction ID
    await new Promise(resolve => setTimeout(resolve, 3000));
    return `SEPA${Date.now()}${Math.random().toString(36).substr(2, 10)}`;
  }

  private async getExchangeRate(token: string, fiatType: string): Promise<string> {
    // Mock exchange rate - in reality, fetch from price APIs
    const rates: Record<string, Record<string, number>> = {
      'USDC': { 'upi': 83.0, 'pix': 5.5, 'sepa': 0.92 },
      'USDT': { 'upi': 83.0, 'pix': 5.5, 'sepa': 0.92 },
      'ETH': { 'upi': 166000, 'pix': 11000, 'sepa': 1840 },
      'AVAX': { 'upi': 2490, 'pix': 165, 'sepa': 27.5 },
      'APT': { 'upi': 747, 'pix': 49.5, 'sepa': 8.25 }
    };

    return (rates[token]?.[fiatType] || 1).toString();
  }

  private getFiatCurrency(paymentType: string): string {
    const currencies: Record<string, string> = {
      'upi': 'INR',
      'pix': 'BRL',
      'sepa': 'EUR'
    };
    return currencies[paymentType] || 'USD';
  }

  private startSettlementMonitor(): void {
    if (!this.config.enabled) return;

    // Check for ready settlements every 5 minutes
    setInterval(async () => {
      try {
        await this.processReadySettlements();
      } catch (error) {
        console.error(chalk.red('❌ Settlement monitor error:'), error);
      }
    }, 5 * 60 * 1000);

    console.log(chalk.green('🔄 Settlement monitor started'));
  }

  // On-chain integration methods

  /**
   * Register settlement on blockchain
   */
  private async registerOnChain(settlement: SettlementRequest): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const registryAddress = this.config.settlementRegistryAddresses[settlement.network];
      if (!registryAddress) {
        return { success: false, error: `No settlement registry deployed for ${settlement.network}` };
      }

      const wallet = this.settlerWallet.get(settlement.network);
      if (!wallet) {
        return { success: false, error: `No wallet configured for ${settlement.network}` };
      }

      console.log(chalk.blue(`🔍 Using settler wallet: ${wallet.address}`));
      console.log(chalk.blue(`📄 Contract address: ${registryAddress}`));

      // Create interface for encoding function call
      const contractInterface = new ethers.Interface([
        'function registerSettlement(string settlementId, string escrowId, address escrowAddress, address payer, string merchantId, uint256 cryptoAmount, string tokenSymbol, uint8 paymentMethod, uint256 fiatAmount, string fiatCurrency, uint256 exchangeRate, uint256 disputePeriod) external'
      ]);

      // Convert payment method to enum value
      const paymentMethodMap: Record<string, number> = { 'upi': 0, 'pix': 1, 'sepa': 2 };
      const paymentMethodEnum = paymentMethodMap[settlement.merchantPaymentMethod.type];

      // Prepare parameters
      const cryptoAmountWei = ethers.parseEther(settlement.amount);
      const fiatAmountScaled = Math.round(parseFloat(settlement.fiatAmount) * 1e6); // Scale by 1e6
      const exchangeRateScaled = Math.round(parseFloat(settlement.exchangeRate) * 1e6); // Scale by 1e6
      const disputePeriodSeconds = this.config.disputePeriodHours * 3600;

      console.log(chalk.yellow('📝 Registering settlement on blockchain...'));
      
      // Encode function call data
      const functionData = contractInterface.encodeFunctionData('registerSettlement', [
        settlement.settlementId,
        settlement.escrowId,
        settlement.escrowAddress,
        settlement.payerAddress,
        settlement.merchantId,
        cryptoAmountWei,
        settlement.token,
        paymentMethodEnum,
        fiatAmountScaled,
        this.getFiatCurrency(settlement.merchantPaymentMethod.type),
        exchangeRateScaled,
        disputePeriodSeconds
      ]);

      // Create transaction object manually
      const txRequest = {
        to: registryAddress,
        data: functionData,
        gasLimit: 300000, // Reduced gas limit
        gasPrice: ethers.parseUnits('1', 'gwei') // Much lower gas price for testnet
      };

      console.log(chalk.blue(`📦 Transaction data prepared, sending...`));
      
      // Send transaction directly
      const tx = await wallet.sendTransaction(txRequest);
      console.log(chalk.green(`📡 Transaction sent: ${tx.hash}`));

      const receipt = await tx.wait();
      if (receipt) {
        console.log(chalk.green(`✅ Transaction confirmed in block: ${receipt.blockNumber}`));
        return { success: true, txHash: tx.hash };
      } else {
        return { success: false, error: 'Transaction receipt not available' };
      }

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Record crypto withdrawal on blockchain
   */
  private async recordWithdrawalOnChain(settlement: SettlementRequest, cryptoTxHash: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const registryAddress = this.config.settlementRegistryAddresses[settlement.network];
      if (!registryAddress || !settlement.onChainRegistered) {
        return { success: false, error: 'Settlement not registered on-chain' };
      }

      const wallet = this.settlerWallet.get(settlement.network);
      if (!wallet) {
        return { success: false, error: `No wallet configured for ${settlement.network}` };
      }

      const settlementRegistryABI = [
        'function recordWithdrawal(string settlementId, string cryptoTxHash) external'
      ];

      const contract = new ethers.Contract(registryAddress, settlementRegistryABI, wallet);

      console.log(chalk.yellow('📝 Recording withdrawal on blockchain...'));
      
      const tx = await contract.recordWithdrawal(settlement.settlementId, cryptoTxHash);
      const receipt = await tx.wait();
      
      return { success: true, txHash: receipt.transactionHash };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Record settlement completion on blockchain
   */
  private async recordCompletionOnChain(settlement: SettlementRequest, fiatTxRef: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    try {
      const registryAddress = this.config.settlementRegistryAddresses[settlement.network];
      if (!registryAddress || !settlement.onChainRegistered) {
        return { success: false, error: 'Settlement not registered on-chain' };
      }

      const wallet = this.settlerWallet.get(settlement.network);
      if (!wallet) {
        return { success: false, error: `No wallet configured for ${settlement.network}` };
      }

      const settlementRegistryABI = [
        'function recordCompletion(string settlementId, string fiatTxRef, string proofHash) external'
      ];

      const contract = new ethers.Contract(registryAddress, settlementRegistryABI, wallet);

      // Generate proof hash (simplified - in production include settlement documents)
      const proofData = `${settlement.settlementId}:${fiatTxRef}:${Date.now()}`;
      const proofHash = ethers.keccak256(ethers.toUtf8Bytes(proofData));

      console.log(chalk.yellow('📝 Recording completion on blockchain...'));
      
      const tx = await contract.recordCompletion(settlement.settlementId, fiatTxRef, proofHash);
      const receipt = await tx.wait();
      
      return { success: true, txHash: receipt.transactionHash };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get settlement from blockchain
   */
  async getOnChainSettlement(settlementId: string, network: string): Promise<{ success: boolean; settlement?: OnChainSettlement; error?: string }> {
    try {
      const registryAddress = this.config.settlementRegistryAddresses[network];
      if (!registryAddress) {
        return { success: false, error: `No settlement registry deployed for ${network}` };
      }

      const provider = this.providers.get(network);
      if (!provider) {
        return { success: false, error: `No provider configured for ${network}` };
      }

      const settlementRegistryABI = [
        'function getSettlement(string settlementId) external view returns (tuple(string settlementId, string escrowId, address escrowAddress, address payer, string merchantId, address settler, uint256 cryptoAmount, address tokenAddress, string tokenSymbol, uint8 paymentMethod, string paymentDetails, uint256 fiatAmount, string fiatCurrency, uint256 settlementFee, uint256 exchangeRate, uint256 disputePeriodEnd, uint8 status, uint256 createdAt, uint256 withdrawnAt, uint256 completedAt, string cryptoTxHash, string fiatTxRef, string proofHash, uint256 chainId))'
      ];

      const contract = new ethers.Contract(registryAddress, settlementRegistryABI, provider);
      const result = await contract.getSettlement(settlementId);

      const settlement: OnChainSettlement = {
        settlementId: result.settlementId,
        escrowId: result.escrowId,
        escrowAddress: result.escrowAddress,
        payer: result.payer,
        merchantId: result.merchantId,
        settler: result.settler,
        cryptoAmount: result.cryptoAmount.toString(),
        tokenAddress: result.tokenAddress,
        tokenSymbol: result.tokenSymbol,
        paymentMethod: result.paymentMethod,
        fiatAmount: result.fiatAmount.toString(),
        fiatCurrency: result.fiatCurrency,
        status: result.status,
        disputePeriodEnd: result.disputePeriodEnd.toString(),
        cryptoTxHash: result.cryptoTxHash,
        fiatTxRef: result.fiatTxRef,
        proofHash: result.proofHash
      };

      return { success: true, settlement };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}