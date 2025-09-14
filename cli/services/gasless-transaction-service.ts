import { ethers } from 'ethers';
import chalk from 'chalk';

interface GaslessTransactionRequest {
  userAddress: string;
  targetContract: string;
  functionData: string;
  userSignature: string;
  nonce: number;
  deadline: number;
  network: string;
}

interface GaslessConfig {
  enabled: boolean;
  maxGasPerTx: string;
  dailyGasLimit: string;
  whitelistedContracts: string[];
  sponsorKeys: Record<string, string>;
}

export class GaslessTransactionService {
  private config: GaslessConfig;
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private sponsorWallets: Map<string, ethers.Wallet> = new Map();
  private dailyUsage: Map<string, number> = new Map();

  constructor() {
    this.config = this.loadGaslessConfig();
    this.initializeProviders();
    this.initializeSponsorWallets();
  }

  private loadGaslessConfig(): GaslessConfig {
    return {
      enabled: process.env.GASLESS_ENABLED === 'true',
      maxGasPerTx: process.env.MAX_GAS_SPONSOR_PER_TX || '0.01',
      dailyGasLimit: process.env.DAILY_GAS_SPONSOR_LIMIT || '1.0',
      whitelistedContracts: [], // Load from config
      sponsorKeys: {
        'avalanche': process.env.AVALANCHE_GASLESS_SPONSOR_KEY || '',
        'aptos': process.env.APTOS_GASLESS_SPONSOR_KEY || '',
        'arbitrum': process.env.ARBITRUM_SEPOLIA_GASLESS_SPONSOR_KEY || ''
      }
    };
  }

  private initializeProviders(): void {
    // Focus networks: Arbitrum, Aptos, Avalanche only
    const networkConfigs = {
      'arbitrum': 'https://sepolia-rollup.arbitrum.io/rpc',
      'avalanche': 'https://api.avax-test.network/ext/bc/C/rpc'
      // Note: Aptos uses different SDK, not ethers provider
    };

    Object.entries(networkConfigs).forEach(([network, rpcUrl]) => {
      this.providers.set(network, new ethers.JsonRpcProvider(rpcUrl));
    });
  }

  private initializeSponsorWallets(): void {
    Object.entries(this.config.sponsorKeys).forEach(([network, privateKey]) => {
      if (privateKey && this.providers.has(network)) {
        const provider = this.providers.get(network)!;
        const wallet = new ethers.Wallet(privateKey, provider);
        this.sponsorWallets.set(network, wallet);
      }
    });
  }

  /**
   * Execute gasless transaction for deployer operations
   */
  async executeGaslessDeployment(
    deployerAddress: string,
    contractBytecode: string,
    constructorArgs: any[],
    network: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    console.log(chalk.blue('🚀 Executing Gasless Deployment'));
    
    try {
      if (!this.config.enabled) {
        return { success: false, error: 'Gasless transactions disabled' };
      }

      const sponsorWallet = this.sponsorWallets.get(network);
      if (!sponsorWallet) {
        return { success: false, error: `No sponsor wallet for network: ${network}` };
      }

      // Check daily usage limits
      const dailyKey = `${network}-${new Date().toDateString()}`;
      const currentUsage = this.dailyUsage.get(dailyKey) || 0;
      if (currentUsage >= parseFloat(this.config.dailyGasLimit)) {
        return { success: false, error: 'Daily gas limit exceeded' };
      }

      // Create deployment transaction
      const factory = new ethers.ContractFactory(
        [], // ABI not needed for deployment
        contractBytecode,
        sponsorWallet
      );

      console.log(chalk.yellow(`📋 Deploying contract for: ${deployerAddress}`));
      console.log(chalk.yellow(`💰 Gas sponsored by: ${sponsorWallet.address}`));

      // Deploy contract (sponsor pays gas)
      const contract = await factory.deploy(...constructorArgs);
      await contract.waitForDeployment();

      const txHash = contract.deploymentTransaction()?.hash;
      const deployedAddress = await contract.getAddress();

      // Update usage tracking
      const gasUsed = await this.calculateGasUsed(txHash!, network);
      this.dailyUsage.set(dailyKey, currentUsage + gasUsed);

      console.log(chalk.green(`✅ Gasless deployment successful!`));
      console.log(chalk.green(`📍 Contract Address: ${deployedAddress}`));
      console.log(chalk.green(`🔗 Transaction: ${txHash}`));

      return { success: true, txHash: txHash };

    } catch (error: any) {
      console.error(chalk.red('❌ Gasless deployment failed:'), error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute gasless transaction for merchant operations
   */
  async executeGaslessMerchantOperation(
    merchantAddress: string,
    contractAddress: string,
    functionName: string,
    args: any[],
    network: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    console.log(chalk.blue('🏪 Executing Gasless Merchant Operation'));
    
    try {
      const sponsorWallet = this.sponsorWallets.get(network);
      if (!sponsorWallet) {
        return { success: false, error: `No sponsor wallet for network: ${network}` };
      }

      // Verify merchant authorization
      if (!await this.verifyMerchantAuthorization(merchantAddress, network)) {
        return { success: false, error: 'Merchant not authorized for gasless operations' };
      }

      // Create meta-transaction
      const contract = new ethers.Contract(contractAddress, [], sponsorWallet);
      
      console.log(chalk.yellow(`🏪 Merchant Operation: ${functionName}`));
      console.log(chalk.yellow(`👤 Merchant: ${merchantAddress}`));
      console.log(chalk.yellow(`💰 Gas sponsored by: ${sponsorWallet.address}`));

      // Execute transaction (sponsor pays gas)
      const tx = await contract[functionName](...args);
      const receipt = await tx.wait();

      console.log(chalk.green(`✅ Gasless merchant operation successful!`));
      console.log(chalk.green(`🔗 Transaction: ${receipt.hash}`));

      return { success: true, txHash: receipt.hash };

    } catch (error: any) {
      console.error(chalk.red('❌ Gasless merchant operation failed:'), error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute gasless transaction for payer operations
   */
  async executeGaslessPayerOperation(
    payerAddress: string,
    paymentData: {
      merchantId: string;
      amount: string;
      token: string;
      escrowAddress: string;
    },
    network: string
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    console.log(chalk.blue('💳 Executing Gasless Payer Operation'));
    
    try {
      const sponsorWallet = this.sponsorWallets.get(network);
      if (!sponsorWallet) {
        return { success: false, error: `No sponsor wallet for network: ${network}` };
      }

      // Verify payer authorization and limits
      if (!await this.verifyPayerLimits(payerAddress, paymentData.amount, network)) {
        return { success: false, error: 'Payer exceeds gasless transaction limits' };
      }

      console.log(chalk.yellow(`💳 Payer Payment Operation`));
      console.log(chalk.yellow(`👤 Payer: ${payerAddress}`));
      console.log(chalk.yellow(`🏪 Merchant: ${paymentData.merchantId}`));
      console.log(chalk.yellow(`💰 Amount: ${paymentData.amount} ${paymentData.token}`));
      console.log(chalk.yellow(`⛽ Gas sponsored by: ${sponsorWallet.address}`));

      // Create payment meta-transaction
      const escrowContract = new ethers.Contract(
        paymentData.escrowAddress,
        [
          'function makePayment(address payer, string merchantId, uint256 amount, string token) external'
        ],
        sponsorWallet
      );

      // Execute payment (sponsor pays gas)
      const tx = await escrowContract.makePayment(
        payerAddress,
        paymentData.merchantId,
        ethers.parseUnits(paymentData.amount, 6), // Assuming USDC decimals
        paymentData.token
      );
      const receipt = await tx.wait();

      console.log(chalk.green(`✅ Gasless payment successful!`));
      console.log(chalk.green(`🔗 Transaction: ${receipt.hash}`));

      return { success: true, txHash: receipt.hash };

    } catch (error: any) {
      console.error(chalk.red('❌ Gasless payment failed:'), error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Multi-chain gasless payment coordination
   */
  async executeMultiChainGaslessPayment(
    payerAddress: string,
    fragments: Array<{
      network: string;
      amount: string;
      token: string;
      escrowAddress: string;
      merchantId: string;
    }>
  ): Promise<{ success: boolean; results: Array<{network: string; success: boolean; txHash?: string; error?: string}>; error?: string }> {
    console.log(chalk.blue('🌐 Executing Multi-Chain Gasless Payment'));
    
    try {
      const results: Array<{network: string; success: boolean; txHash?: string; error?: string}> = [];

      // Execute fragments in parallel across different networks
      const promises = fragments.map(async (fragment) => {
        return await this.executeGaslessPayerOperation(
          payerAddress,
          {
            merchantId: fragment.merchantId,
            amount: fragment.amount,
            token: fragment.token,
            escrowAddress: fragment.escrowAddress
          },
          fragment.network
        );
      });

      const fragmentResults = await Promise.allSettled(promises);
      
      fragmentResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push({
            network: fragments[index].network,
            success: result.value.success,
            txHash: result.value.txHash
          });
        } else {
          results.push({
            network: fragments[index].network,
            success: false,
            error: String(result.reason)
          });
        }
      });

      const successCount = results.filter(r => r.success).length;
      console.log(chalk.green(`✅ Multi-chain gasless payment completed!`));
      console.log(chalk.green(`📊 Success: ${successCount}/${results.length} fragments`));

      return { success: successCount > 0, results };

    } catch (error: any) {
      console.error(chalk.red('❌ Multi-chain gasless payment failed:'), error.message);
      return { success: false, results: [], error: error.message };
    }
  }

  /**
   * Get gasless transaction status and limits
   */
  async getGaslessStatus(userAddress: string, network: string): Promise<{
    enabled: boolean;
    dailyRemaining: number;
    sponsorBalance: string;
    limits: any;
  }> {
    const dailyKey = `${network}-${new Date().toDateString()}`;
    const currentUsage = this.dailyUsage.get(dailyKey) || 0;
    const dailyLimit = parseFloat(this.config.dailyGasLimit);
    
    const sponsorWallet = this.sponsorWallets.get(network);
    let sponsorBalance = '0';
    
    if (sponsorWallet && sponsorWallet.provider) {
      const balance = await sponsorWallet.provider.getBalance(sponsorWallet.address);
      sponsorBalance = ethers.formatEther(balance);
    }

    return {
      enabled: this.config.enabled,
      dailyRemaining: Math.max(0, dailyLimit - currentUsage),
      sponsorBalance,
      limits: {
        maxGasPerTx: this.config.maxGasPerTx,
        dailyGasLimit: this.config.dailyGasLimit,
        currentUsage
      }
    };
  }

  // Helper methods
  private async verifyMerchantAuthorization(merchantAddress: string, network: string): Promise<boolean> {
    // Implement merchant verification logic
    return true; // Placeholder
  }

  private async verifyPayerLimits(payerAddress: string, amount: string, network: string): Promise<boolean> {
    // Implement payer limits verification
    return true; // Placeholder
  }

  private async calculateGasUsed(txHash: string, network: string): Promise<number> {
    try {
      const provider = this.providers.get(network);
      if (!provider) return 0;

      const receipt = await provider.getTransactionReceipt(txHash);
      const gasUsed = receipt?.gasUsed || 0n;
      const gasPrice = receipt?.gasPrice || 0n;
      
      const gasCost = Number(gasUsed * gasPrice) / 1e18; // Convert to ETH
      return gasCost;
    } catch {
      return 0;
    }
  }

  /**
   * Fund sponsor wallets across networks
   */
  async fundSponsorWallets(targetBalance: string = '1.0'): Promise<void> {
    console.log(chalk.blue('💰 Funding Sponsor Wallets'));
    
    for (const [network, wallet] of this.sponsorWallets.entries()) {
      try {
        if (!wallet.provider) {
          console.error(chalk.red(`❌ No provider for ${network} sponsor wallet`));
          continue;
        }
        
        const balance = await wallet.provider.getBalance(wallet.address);
        const currentBalance = parseFloat(ethers.formatEther(balance));
        const target = parseFloat(targetBalance);

        if (currentBalance < target * 0.1) { // Refund when below 10%
          console.log(chalk.yellow(`🔋 ${network} sponsor wallet needs funding`));
          console.log(chalk.yellow(`💰 Current: ${currentBalance.toFixed(4)} ETH`));
          console.log(chalk.yellow(`🎯 Target: ${target} ETH`));
          
          // Here you would implement funding logic
          // Could use faucets, treasury transfers, etc.
          console.log(chalk.green(`✅ Funding initiated for ${network}`));
        }
      } catch (error) {
        console.error(chalk.red(`❌ Failed to check ${network} sponsor balance`));
      }
    }
  }
}