import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const ROOT_CONFIG_FILE = path.join(process.cwd(), 'config.json');

/**
 * AvalancheAdapter - Handles escrow deployment on Avalanche C-Chain
 * This adapter ONLY handles escrow contract deployment, not merchant registration
 * Merchant logic remains on Polygon via EscrowFactory triggers
 */

class AvalancheAdapter {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this.config = null;
    }

    async initialize() {
        try {
            // Load configuration
            await this.loadConfig();
            
            // Initialize EVM provider for C-Chain
            this.provider = new ethers.JsonRpcProvider(
                this.config.rpcUrl || 'https://api.avax-test.network/ext/bc/C/rpc'
            );
            
            // Initialize wallet
            await this.initializeWallet();
            
            console.log(chalk.green('✅ Avalanche adapter initialized'));
            console.log(chalk.blue('🔗 Network:'), this.config.network || 'fuji');
            console.log(chalk.blue('🔐 Wallet:'), this.wallet.address);
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to initialize Avalanche adapter:'), error.message);
            throw error;
        }
    }

    async loadConfig() {
        try {
            if (fs.existsSync(ROOT_CONFIG_FILE)) {
                const rootConfig = JSON.parse(fs.readFileSync(ROOT_CONFIG_FILE, 'utf8'));
                this.config = rootConfig.networks.avalanche.fuji || {
                    network: 'fuji',
                    networkID: 5,
                    chainID: 'C',
                    host: 'api.avax-test.network',
                    port: 443,
                    protocol: 'https',
                    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
                    contracts: {
                        merchantRegistry: null,
                        upiRegistry: null,
                        escrowFactory: null
                    },
                    deployedContracts: []
                };
            } else {
                // Create default config if no root config exists
                this.config = {
                    network: 'fuji',
                    networkID: 5,
                    chainID: 'C',
                    host: 'api.avax-test.network',
                    port: 443,
                    protocol: 'https',
                    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
                    contracts: {
                        merchantRegistry: null,
                        upiRegistry: null,
                        escrowFactory: null
                    },
                    deployedContracts: []
                };
            }
        } catch (error) {
            console.error(chalk.red('❌ Failed to load Avalanche config:'), error.message);
            throw error;
        }
    }

    async initializeWallet() {
        try {
            let privateKey;
            
            // Check for AVAX_PRIVATE_KEY first, then fallback to AVALANCHE_PRIVATE_KEY
            if (process.env.AVAX_PRIVATE_KEY) {
                privateKey = process.env.AVAX_PRIVATE_KEY;
                if (!privateKey.startsWith('0x')) {
                    privateKey = '0x' + privateKey;
                }
            } else if (process.env.AVALANCHE_PRIVATE_KEY) {
                privateKey = process.env.AVALANCHE_PRIVATE_KEY;
                if (!privateKey.startsWith('0x')) {
                    privateKey = '0x' + privateKey;
                }
            } else {
                // Generate new wallet for development
                console.log(chalk.yellow('⚠️  No private key found, generating new wallet'));
                const wallet = ethers.Wallet.createRandom();
                privateKey = wallet.privateKey;
                
                console.log(chalk.blue('💡 Save this private key to environment:'));
                console.log(chalk.gray(`AVAX_PRIVATE_KEY=${privateKey.slice(2)}`));
            }
            
            this.wallet = new ethers.Wallet(privateKey, this.provider);
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to initialize wallet:'), error.message);
            throw error;
        }
    }

    async checkBalance() {
        try {
            const balance = await this.provider.getBalance(this.wallet.address);
            const avaxBalance = ethers.formatEther(balance);
            
            console.log(chalk.blue('💰 Wallet Balance:'), `${avaxBalance} AVAX`);
            
            if (parseFloat(avaxBalance) < 0.1) {
                console.log(chalk.yellow('⚠️  Low balance! You may need AVAX for transactions'));
                if (this.config.network === 'fuji') {
                    console.log(chalk.blue('💡 Get testnet AVAX: https://faucet.avax.network'));
                }
            }
            
            return parseFloat(avaxBalance);
        } catch (error) {
            console.error(chalk.red('❌ Failed to check balance:'), error.message);
            return 0;
        }
    }

    async deployContract(contractData) {
        try {
            console.log(chalk.blue('🚀 Deploying contract to Avalanche C-Chain...'));
            
            const { abi, bytecode, constructorArgs = [] } = contractData;
            
            // Get current gas price and optimize for minimal cost
            const feeData = await this.provider.getFeeData();
            console.log(chalk.blue('⛽ Current gas price:'), ethers.formatUnits(feeData.gasPrice, 'gwei'), 'gwei');
            
            // Create contract factory
            const contractFactory = new ethers.ContractFactory(abi, bytecode, this.wallet);
            
            // Estimate gas for deployment
            const deployTx = await contractFactory.getDeployTransaction(...constructorArgs);
            const gasEstimate = await this.provider.estimateGas(deployTx);
            
            // Add 10% buffer to gas estimate for safety
            const gasLimit = gasEstimate + (gasEstimate * 10n / 100n);
            
            console.log(chalk.blue('⛽ Estimated gas:'), gasEstimate.toString());
            console.log(chalk.blue('⛽ Gas limit (with buffer):'), gasLimit.toString());
            
            // Deploy contract with optimized gas settings
            const contract = await contractFactory.deploy(...constructorArgs, {
                gasLimit: gasLimit,
                gasPrice: feeData.gasPrice // Use current network gas price
            });
            
            console.log(chalk.yellow('⏳ Waiting for deployment confirmation...'));
            await contract.waitForDeployment();
            
            const contractAddress = await contract.getAddress();
            const deploymentTx = contract.deploymentTransaction();
            
            console.log(chalk.green('✅ Contract deployed successfully'));
            console.log(chalk.blue('📍 Contract Address:'), contractAddress);
            console.log(chalk.blue('⛽ Gas used:'), deploymentTx?.gasLimit?.toString() || 'N/A');
            console.log(chalk.blue('💰 Deployment cost:'), ethers.formatEther((deploymentTx?.gasLimit || 0n) * (feeData.gasPrice || 0n)), 'AVAX');
            
            // Save deployment info
            await this.saveDeployment({
                address: contractAddress,
                abi: abi,
                deploymentTx: deploymentTx?.hash,
                gasUsed: deploymentTx?.gasLimit?.toString(),
                gasCost: ethers.formatEther((deploymentTx?.gasLimit || 0n) * (feeData.gasPrice || 0n)),
                timestamp: new Date().toISOString()
            });
            
            return {
                address: contractAddress,
                contract: contract,
                deploymentTx: deploymentTx?.hash
            };
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to deploy contract:'), error.message);
            throw error;
        }
    }

    async getContract(address, abi) {
        try {
            return new ethers.Contract(address, abi, this.wallet);
        } catch (error) {
            console.error(chalk.red('❌ Failed to get contract:'), error.message);
            throw error;
        }
    }

    async sendTransaction(to, value, data = '0x') {
        try {
            const tx = {
                to: to,
                value: ethers.parseEther(value.toString()),
                data: data
            };
            
            const transaction = await this.wallet.sendTransaction(tx);
            await transaction.wait();
            
            console.log(chalk.green('✅ Transaction sent successfully'));
            console.log(chalk.blue('📍 Transaction Hash:'), transaction.hash);
            
            return transaction;
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to send transaction:'), error.message);
            throw error;
        }
    }

    async saveDeployment(deploymentInfo) {
        try {
            this.config.deployedContracts.push(deploymentInfo);
            fs.writeFileSync(AVALANCHE_CONFIG_FILE, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error(chalk.red('❌ Failed to save deployment:'), error.message);
        }
    }

    async getTransactionStatus(txHash) {
        try {
            const receipt = await this.provider.getTransactionReceipt(txHash);
            return {
                status: receipt ? (receipt.status === 1 ? 'success' : 'failed') : 'pending',
                blockNumber: receipt?.blockNumber,
                gasUsed: receipt?.gasUsed?.toString()
            };
        } catch (error) {
            console.error(chalk.red('❌ Failed to get transaction status:'), error.message);
            return { status: 'unknown' };
        }
    }

    async estimateGas(to, data, value = '0') {
        try {
            const gasEstimate = await this.provider.estimateGas({
                to: to,
                data: data,
                value: ethers.parseEther(value.toString())
            });
            
            return gasEstimate.toString();
        } catch (error) {
            console.error(chalk.red('❌ Failed to estimate gas:'), error.message);
            return '21000'; // Default gas limit
        }
    }

    /**
     * Deploy escrow contract triggered by Polygon EscrowFactory
     * @param {Object} deploymentRequest - Request from EscrowFactory
     * @param {string} deploymentRequest.requestId - The request ID from Polygon
     * @param {string} deploymentRequest.merchant - Merchant address
     * @param {string[]} deploymentRequest.tokens - Supported tokens
     * @param {string} deploymentRequest.polygonFactoryAddress - EscrowFactory address on Polygon
     */
    async deployEscrowFromPolygonTrigger(deploymentRequest) {
        try {
            console.log(chalk.blue('🚀 Deploying Avalanche escrow from Polygon trigger...'));
            console.log(chalk.gray('📋 Request ID:'), deploymentRequest.requestId);
            console.log(chalk.gray('👤 Merchant:'), deploymentRequest.merchant);
            console.log(chalk.gray('🪙 Tokens:'), deploymentRequest.tokens.join(', '));
            
            // Load Escrow contract
            const contractPath = path.join(process.cwd(), 'contracts', 'escrows', 'avax', 'Escrow.sol');
            if (!fs.existsSync(contractPath)) {
                throw new Error('Escrow contract not found in contracts/escrows/avax/');
            }
            
            // Deploy the escrow contract
            const deploymentResult = await this.deployContract(
                'Escrow',
                [deploymentRequest.merchant, deploymentRequest.tokens]
            );
            
            // Prepare response for Polygon EscrowFactory
            const deploymentResponse = {
                requestId: deploymentRequest.requestId,
                chain: 'avalanche',
                escrowAddress: deploymentResult.address,
                txHash: deploymentResult.transactionHash,
                blockNumber: deploymentResult.blockNumber,
                gasUsed: deploymentResult.gasUsed,
                deploymentCost: deploymentResult.deploymentCost
            };
            
            console.log(chalk.green('✅ Avalanche escrow deployed successfully!'));
            console.log(chalk.blue('📍 Contract Address:'), deploymentResult.address);
            console.log(chalk.blue('🔗 Transaction Hash:'), deploymentResult.transactionHash);
            
            return deploymentResponse;
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to deploy escrow from Polygon trigger:'), error.message);
            throw error;
        }
    }
    
    /**
     * Listen for CrossChainDeploymentTriggered events from Polygon EscrowFactory
     * @param {string} polygonFactoryAddress - EscrowFactory contract address on Polygon
     * @param {string} polygonRpcUrl - Polygon RPC URL
     */
    async listenForPolygonTriggers(polygonFactoryAddress, polygonRpcUrl) {
        try {
            console.log(chalk.blue('👂 Listening for Polygon EscrowFactory triggers...'));
            
            const polygonProvider = new ethers.JsonRpcProvider(polygonRpcUrl);
            
            // EscrowFactory ABI for the event we need
            const factoryABI = [
                "event CrossChainDeploymentTriggered(uint256 indexed requestId, address indexed merchant, string chain, string[] tokens, address adapter)"
            ];
            
            const factoryContract = new ethers.Contract(polygonFactoryAddress, factoryABI, polygonProvider);
            
            // Listen for events where chain === 'avalanche'
            factoryContract.on('CrossChainDeploymentTriggered', async (requestId, merchant, chain, tokens, adapter, event) => {
                if (chain.toLowerCase() === 'avalanche') {
                    console.log(chalk.yellow('🔔 Received Avalanche deployment trigger from Polygon'));
                    
                    const deploymentRequest = {
                        requestId: requestId.toString(),
                        merchant: merchant,
                        tokens: tokens,
                        polygonFactoryAddress: polygonFactoryAddress
                    };
                    
                    try {
                        const result = await this.deployEscrowFromPolygonTrigger(deploymentRequest);
                        console.log(chalk.green('✅ Cross-chain deployment completed'));
                        
                        // TODO: Call back to Polygon EscrowFactory to record completion
                        // This would require a cross-chain bridge or oracle service
                        
                    } catch (error) {
                        console.error(chalk.red('❌ Cross-chain deployment failed:'), error.message);
                    }
                }
            });
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to listen for Polygon triggers:'), error.message);
            throw error;
        }
    }

    getNetworkInfo() {
        return {
            name: this.config.network,
            chainId: this.config.networkID,
            rpcUrl: this.config.rpcUrl,
            explorerUrl: this.config.network === 'fuji' 
                ? 'https://testnet.snowtrace.io' 
                : 'https://snowtrace.io'
        };
    }
}

export default AvalancheAdapter;