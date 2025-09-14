import chalk from 'chalk';
import inquirer from 'inquirer';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { priceService } from './price-service.js';
import { priceIntegration } from '../utils/price-integration-utils.js';

// Multi-chain escrow integration
interface MultiChainEscrowOptions {
  upiId: string;
  merchantId: string;
  networks?: string[];
  amount?: string;
  autoFund?: boolean;
}

interface EscrowResult {
  escrowId: string;
  contractAddress: string;
  network: string;
  token: string;
  owner: string;
  txHash: string;
  blockNumber?: number;
  blockHeight?: string;
  gasUsed: string;
  gasFeeOctas?: string;
  gasFeeAPT?: number;
  explorerUrl?: string;
  status: string;
  timestamp: string;
}

interface MultiChainEscrowResult {
  merchantId: string;
  merchantAddress: string;
  upiId: string;
  escrows: {
    avalanche?: EscrowResult;
    aptos?: EscrowResult;
  };
  status: string;
  timestamp: string;
}

export class MultiChainEscrowService {
  private configPath: string;
  private registryPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), 'multi-chain-escrow-registry.json');
    this.registryPath = path.join(process.cwd(), 'cli', 'merchants.json');
  }

  async createMultiChainEscrow(options: MultiChainEscrowOptions): Promise<MultiChainEscrowResult> {
    console.log(chalk.blue('🚀 Creating Multi-Chain Escrow...'));
    console.log(chalk.gray(`📱 UPI ID: ${options.upiId}`));
    console.log(chalk.gray(`👤 Merchant ID: ${options.merchantId}`));
    
    const networks = options.networks || ['avalanche', 'aptos'];
    const result: MultiChainEscrowResult = {
      merchantId: options.merchantId,
      merchantAddress: '',
      upiId: options.upiId,
      escrows: {},
      status: 'processing',
      timestamp: new Date().toISOString()
    };

    try {
      // Import and use the multi-chain escrow system
      // @ts-ignore
      const { MultiChainEscrowSystem } = await import('../../../multi-chain-escrow-system.cjs');
      const escrowSystem = new MultiChainEscrowSystem();
      
      console.log(chalk.yellow('⏳ Deploying cross-chain escrows...'));
      
      const deploymentResult = await escrowSystem.createMultiChainEscrowsForUPIs([options.upiId], options.merchantId);
      
      if (deploymentResult && deploymentResult.upiEscrows[options.upiId]) {
        const upiData = deploymentResult.upiEscrows[options.upiId];
        result.merchantAddress = deploymentResult.merchantAddress;
        
        // Extract Avalanche escrow data
        if (upiData.escrows.avalanche) {
          result.escrows.avalanche = {
            escrowId: upiData.escrows.avalanche.escrowId,
            contractAddress: upiData.escrows.avalanche.contractAddress,
            network: upiData.escrows.avalanche.network,
            token: upiData.escrows.avalanche.token,
            owner: upiData.escrows.avalanche.owner,
            txHash: upiData.escrows.avalanche.txHash,
            blockNumber: upiData.escrows.avalanche.blockNumber,
            gasUsed: upiData.escrows.avalanche.gasUsed,
            status: upiData.escrows.avalanche.status,
            timestamp: upiData.escrows.avalanche.timestamp
          };
        }
        
        // Extract Aptos escrow data
        if (upiData.escrows.aptos) {
          result.escrows.aptos = {
            escrowId: upiData.escrows.aptos.escrowId,
            contractAddress: upiData.escrows.aptos.contractAddress,
            network: upiData.escrows.aptos.network,
            token: upiData.escrows.aptos.token,
            owner: upiData.escrows.aptos.owner,
            txHash: upiData.escrows.aptos.txHash,
            blockHeight: upiData.escrows.aptos.blockHeight,
            gasUsed: upiData.escrows.aptos.gasUsed,
            gasFeeOctas: upiData.escrows.aptos.gasFeeOctas,
            gasFeeAPT: upiData.escrows.aptos.gasFeeAPT,
            explorerUrl: upiData.escrows.aptos.explorerUrl,
            status: upiData.escrows.aptos.status,
            timestamp: upiData.escrows.aptos.timestamp
          };
        }
        
        result.status = 'completed';
        
        // Update local merchant registry
        await this.updateMerchantRegistry(result);
        
        console.log(chalk.green('✅ Multi-chain escrow created successfully!'));
        this.displayEscrowResult(result);
        
      } else {
        throw new Error('Failed to create multi-chain escrows');
      }
      
    } catch (error: any) {
      console.error(chalk.red('❌ Multi-chain escrow creation failed:'), error.message);
      result.status = 'failed';
      throw error;
    }

    return result;
  }

  private async updateMerchantRegistry(result: MultiChainEscrowResult): Promise<void> {
    try {
      let merchants: any = { merchants: [] };
      
      if (fs.existsSync(this.registryPath)) {
        merchants = JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
      }
      
      // Find or create merchant
      let merchant = merchants.merchants.find((m: any) => m.merchantId === result.merchantId);
      if (!merchant) {
        merchant = {
          merchantId: result.merchantId,
          escrowAddresses: {
            avalanche: [],
            aptos: [],
            ethereum: [],
            polygon: [],
            localhost: []
          },
          upiEscrows: [],
          lastUpdated: new Date().toISOString()
        };
        merchants.merchants.push(merchant);
      }
      
      // Add escrow addresses to arrays
      if (result.escrows.avalanche && merchant) {
        if (!merchant.escrowAddresses.avalanche.includes(result.escrows.avalanche.contractAddress)) {
          merchant.escrowAddresses.avalanche.push(result.escrows.avalanche.contractAddress);
        }
      }
      
      if (result.escrows.aptos && merchant) {
        if (!merchant.escrowAddresses.aptos.includes(result.escrows.aptos.contractAddress)) {
          merchant.escrowAddresses.aptos.push(result.escrows.aptos.contractAddress);
        }
      }
      
      // Add UPI escrow mapping
      if (merchant && !merchant.upiEscrows) {
        merchant.upiEscrows = [];
      }
      
      if (merchant) {
        merchant.upiEscrows.push({
          upiId: result.upiId,
          escrows: result.escrows,
          timestamp: result.timestamp
        });
        
        merchant.lastUpdated = new Date().toISOString();
      }
      
      fs.writeFileSync(this.registryPath, JSON.stringify(merchants, null, 2));
      console.log(chalk.gray('💾 Updated merchant registry'));
      
    } catch (error: any) {
      console.error(chalk.yellow('⚠️ Failed to update merchant registry:'), error.message);
    }
  }

  private displayEscrowResult(result: MultiChainEscrowResult): void {
    console.log(chalk.blue('\n📋 MULTI-CHAIN ESCROW SUMMARY'));
    console.log(chalk.blue('=' .repeat(50)));
    console.log(chalk.white(`👤 Merchant: ${result.merchantId}`));
    console.log(chalk.white(`💳 UPI ID: ${result.upiId}`));
    console.log(chalk.white(`📅 Created: ${result.timestamp}`));
    
    if (result.escrows.avalanche) {
      console.log(chalk.magenta('\n🔷 AVALANCHE ESCROW:'));
      console.log(chalk.gray(`   Address: ${result.escrows.avalanche.contractAddress}`));
      console.log(chalk.gray(`   TX Hash: ${result.escrows.avalanche.txHash}`));
      console.log(chalk.gray(`   Block: ${result.escrows.avalanche.blockNumber}`));
      console.log(chalk.gray(`   Gas: ${result.escrows.avalanche.gasUsed}`));
    }
    
    if (result.escrows.aptos) {
      console.log(chalk.cyan('\n🅰️ APTOS ESCROW:'));
      console.log(chalk.gray(`   Address: ${result.escrows.aptos.contractAddress}`));
      console.log(chalk.gray(`   TX Hash: ${result.escrows.aptos.txHash}`));
      console.log(chalk.gray(`   Block: ${result.escrows.aptos.blockHeight}`));
      console.log(chalk.gray(`   Gas: ${result.escrows.aptos.gasUsed} octas (${result.escrows.aptos.gasFeeAPT} APT)`));
      console.log(chalk.gray(`   Explorer: ${result.escrows.aptos.explorerUrl}`));
    }
    
    console.log(chalk.green('\n✅ Multi-chain escrow ready for payments!'));
  }

  async listMerchantEscrows(merchantId: string): Promise<void> {
    try {
      if (!fs.existsSync(this.registryPath)) {
        console.log(chalk.yellow('⚠️ No merchant registry found'));
        return;
      }
      
      const merchants = JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
      const merchant = merchants.merchants.find((m: any) => m.merchantId === merchantId);
      
      if (!merchant) {
        console.log(chalk.red(`❌ Merchant ${merchantId} not found`));
        return;
      }
      
      console.log(chalk.blue(`📋 ESCROWS FOR MERCHANT ${merchantId}`));
      console.log(chalk.blue('=' .repeat(50)));
      
      console.log(chalk.white('\n🔷 AVALANCHE ESCROWS:'));
      merchant.escrowAddresses.avalanche.forEach((addr: string, index: number) => {
        console.log(chalk.gray(`   ${index + 1}. ${addr}`));
      });
      
      console.log(chalk.white('\n🅰️ APTOS ESCROWS:'));
      merchant.escrowAddresses.aptos.forEach((addr: string, index: number) => {
        console.log(chalk.gray(`   ${index + 1}. ${addr}`));
      });
      
      if (merchant.upiEscrows && merchant.upiEscrows.length > 0) {
        console.log(chalk.white('\n💳 UPI ESCROW MAPPINGS:'));
        merchant.upiEscrows.forEach((upi: any, index: number) => {
          console.log(chalk.yellow(`   ${index + 1}. ${upi.upiId}:`));
          if (upi.escrows.avalanche) {
            console.log(chalk.gray(`      🔷 Avalanche: ${upi.escrows.avalanche.contractAddress}`));
          }
          if (upi.escrows.aptos) {
            console.log(chalk.gray(`      🅰️ Aptos: ${upi.escrows.aptos.contractAddress}`));
          }
          console.log(chalk.gray(`      📅 Created: ${upi.timestamp}`));
        });
      }
      
      console.log(chalk.gray(`\n📅 Last Updated: ${merchant.lastUpdated}`));
      
    } catch (error: any) {
      console.error(chalk.red('❌ Failed to list merchant escrows:'), error.message);
    }
  }

  async testMultiChainIntegration(): Promise<void> {
    console.log(chalk.blue('🧪 TESTING MULTI-CHAIN ESCROW INTEGRATION'));
    console.log(chalk.blue('=' .repeat(50)));
    
    try {
      // Test with a sample UPI ID
      const testOptions: MultiChainEscrowOptions = {
        upiId: 'test@cli-integration',
        merchantId: 'CLI_TEST_001',
        networks: ['avalanche', 'aptos']
      };
      
      console.log(chalk.yellow('⏳ Creating test escrow...'));
      const result = await this.createMultiChainEscrow(testOptions);
      
      console.log(chalk.green('✅ Test completed successfully!'));
      
      // List the created escrows
      console.log(chalk.blue('\n📋 Verifying escrow creation...'));
      await this.listMerchantEscrows(testOptions.merchantId);
      
    } catch (error: any) {
      console.error(chalk.red('❌ Test failed:'), error.message);
      throw error;
    }
  }
}

export default MultiChainEscrowService;