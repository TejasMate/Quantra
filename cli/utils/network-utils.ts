import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

interface NetworkCurrency {
    name: string;
    symbol: string;
    decimals: number;
}

interface NetworkConfig {
    name: string;
    chainId: number;
    rpcUrl: string;
    explorerUrl: string | null;
    nativeCurrency: NetworkCurrency;
}

interface NetworkInfo {
    name: string;
    chainId: number;
    blockNumber: number;
    gasPrice: string | null;
    maxFeePerGas: string | null;
    maxPriorityFeePerGas: string | null;
}

interface ConnectivityResult {
    connected: boolean;
    error: string | null;
}

interface GasRecommendation {
    gasPrice: bigint | null;
    maxFeePerGas: bigint | null;
    maxPriorityFeePerGas: bigint | null;
    estimatedTime: string;
}

interface GasRecommendations {
    baseFee: bigint | null;
    recommendations: {
        slow: GasRecommendation;
        standard: GasRecommendation;
        fast: GasRecommendation;
    };
}

interface TokenInfo {
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: bigint;
}

export class NetworkUtils {
    // Predefined network configurations
    static networks: Record<string, NetworkConfig> = {
        mainnet: {
            name: 'Ethereum Mainnet',
            chainId: 1,
            rpcUrl: 'https://eth-mainnet.alchemyapi.io/v2/YOUR_API_KEY',
            explorerUrl: 'https://etherscan.io',
            nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18
            }
        },
        goerli: {
            name: 'Goerli Testnet',
            chainId: 5,
            rpcUrl: 'https://eth-goerli.alchemyapi.io/v2/YOUR_API_KEY',
            explorerUrl: 'https://goerli.etherscan.io',
            nativeCurrency: {
                name: 'Goerli Ether',
                symbol: 'ETH',
                decimals: 18
            }
        },
        sepolia: {
            name: 'Sepolia Testnet',
            chainId: 11155111,
            rpcUrl: 'https://eth-sepolia.alchemyapi.io/v2/YOUR_API_KEY',
            explorerUrl: 'https://sepolia.etherscan.io',
            nativeCurrency: {
                name: 'Sepolia Ether',
                symbol: 'ETH',
                decimals: 18
            }
        },
        polygon: {
            name: 'Polygon Mainnet',
            chainId: 137,
            rpcUrl: 'https://polygon-rpc.com',
            explorerUrl: 'https://polygonscan.com',
            nativeCurrency: {
                name: 'MATIC',
                symbol: 'MATIC',
                decimals: 18
            }
        },
        mumbai: {
            name: 'Polygon Mumbai',
            chainId: 80001,
            rpcUrl: 'https://rpc-mumbai.maticvigil.com',
            explorerUrl: 'https://mumbai.polygonscan.com',
            nativeCurrency: {
                name: 'MATIC',
                symbol: 'MATIC',
                decimals: 18
            }
        },
        bsc: {
            name: 'Binance Smart Chain',
            chainId: 56,
            rpcUrl: 'https://bsc-dataseed1.binance.org',
            explorerUrl: 'https://bscscan.com',
            nativeCurrency: {
                name: 'BNB',
                symbol: 'BNB',
                decimals: 18
            }
        },
        bscTestnet: {
            name: 'BSC Testnet',
            chainId: 97,
            rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
            explorerUrl: 'https://testnet.bscscan.com',
            nativeCurrency: {
                name: 'tBNB',
                symbol: 'tBNB',
                decimals: 18
            }
        },
        avalanche: {
            name: 'Avalanche C-Chain',
            chainId: 43114,
            rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
            explorerUrl: 'https://snowtrace.io',
            nativeCurrency: {
                name: 'AVAX',
                symbol: 'AVAX',
                decimals: 18
            }
        },
        fuji: {
            name: 'Avalanche Fuji',
            chainId: 43113,
            rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
            explorerUrl: 'https://testnet.snowtrace.io',
            nativeCurrency: {
                name: 'AVAX',
                symbol: 'AVAX',
                decimals: 18
            }
        },
        arbitrum: {
            name: 'Arbitrum One',
            chainId: 42161,
            rpcUrl: 'https://arb1.arbitrum.io/rpc',
            explorerUrl: 'https://arbiscan.io',
            nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18
            }
        },
        arbitrumGoerli: {
            name: 'Arbitrum Goerli',
            chainId: 421613,
            rpcUrl: 'https://goerli-rollup.arbitrum.io/rpc',
            explorerUrl: 'https://goerli.arbiscan.io',
            nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18
            }
        },
        optimism: {
            name: 'Optimism',
            chainId: 10,
            rpcUrl: 'https://mainnet.optimism.io',
            explorerUrl: 'https://optimistic.etherscan.io',
            nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18
            }
        },
        optimismGoerli: {
            name: 'Optimism Goerli',
            chainId: 420,
            rpcUrl: 'https://goerli.optimism.io',
            explorerUrl: 'https://goerli-optimism.etherscan.io',
            nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18
            }
        },
        localhost: {
            name: 'Localhost',
            chainId: 31337,
            rpcUrl: 'http://127.0.0.1:8545',
            explorerUrl: null,
            nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18
            }
        },
        hardhat: {
            name: 'Hardhat Network',
            chainId: 31337,
            rpcUrl: 'http://127.0.0.1:8545',
            explorerUrl: null,
            nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18
            }
        }
    };

    // Get network configuration
    static getNetwork(networkName: string): NetworkConfig | null {
        return this.networks[networkName] || null;
    }

    // Get all available networks
    static getAvailableNetworks(): string[] {
        return Object.keys(this.networks);
    }

    // Check if network is supported
    static isNetworkSupported(networkName: string): boolean {
        return networkName in this.networks;
    }

    // Create provider for network
    static createProvider(networkName: string, customRpcUrl?: string): ethers.JsonRpcProvider {
        const network = this.getNetwork(networkName);
        if (!network) {
            throw new Error(`Unsupported network: ${networkName}`);
        }

        const rpcUrl = customRpcUrl || network.rpcUrl;
        
        // Replace placeholder API keys with environment variables
        const finalRpcUrl = rpcUrl
            .replace('YOUR_API_KEY', process.env.ALCHEMY_API_KEY || '')
            .replace('YOUR_INFURA_KEY', process.env.INFURA_API_KEY || '');

        return new ethers.JsonRpcProvider(finalRpcUrl, {
            chainId: network.chainId,
            name: network.name
        });
    }

    // Create signer with provider
    static createSigner(networkName: string, privateKey: string, customRpcUrl?: string): ethers.Wallet {
        const provider = this.createProvider(networkName, customRpcUrl);
        return new ethers.Wallet(privateKey, provider);
    }

    // Get network info from provider
    static async getNetworkInfo(provider: ethers.JsonRpcProvider): Promise<NetworkInfo> {
        try {
            const network = await provider.getNetwork();
            const blockNumber = await provider.getBlockNumber();
            const feeData = await provider.getFeeData();
            
            return {
                name: network.name,
                chainId: Number(network.chainId),
                blockNumber,
                gasPrice: feeData.gasPrice ? ethers.formatUnits(feeData.gasPrice, 'gwei') : null,
                maxFeePerGas: feeData.maxFeePerGas ? ethers.formatUnits(feeData.maxFeePerGas, 'gwei') : null,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') : null
            };
        } catch (error) {
            throw new Error(`Failed to get network info: ${(error as Error).message}`);
        }
    }

    // Check network connectivity
    static async checkConnectivity(networkName: string, customRpcUrl?: string): Promise<ConnectivityResult> {
        try {
            const provider = this.createProvider(networkName, customRpcUrl);
            await provider.getBlockNumber();
            return { connected: true, error: null };
        } catch (error) {
            return { connected: false, error: (error as Error).message };
        }
    }

    // Get gas price recommendations
    static async getGasRecommendations(provider: ethers.JsonRpcProvider): Promise<GasRecommendations> {
        try {
            const feeData = await provider.getFeeData();
            const block = await provider.getBlock('latest');
            
            const recommendations = {
                slow: {
                    gasPrice: feeData.gasPrice,
                    maxFeePerGas: feeData.maxFeePerGas,
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * 90n / 100n : null,
                    estimatedTime: '5-10 minutes'
                },
                standard: {
                    gasPrice: feeData.gasPrice,
                    maxFeePerGas: feeData.maxFeePerGas,
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
                    estimatedTime: '2-5 minutes'
                },
                fast: {
                    gasPrice: feeData.gasPrice ? feeData.gasPrice * 110n / 100n : null,
                    maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 110n / 100n : null,
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? feeData.maxPriorityFeePerGas * 110n / 100n : null,
                    estimatedTime: '30 seconds - 2 minutes'
                }
            };
            
            return {
                baseFee: block?.baseFeePerGas || null,
                recommendations
            };
        } catch (error) {
            throw new Error(`Failed to get gas recommendations: ${(error as Error).message}`);
        }
    }

    // Estimate gas for transaction
    static async estimateGas(provider: ethers.JsonRpcProvider, transaction: ethers.TransactionRequest): Promise<bigint> {
        try {
            return await provider.estimateGas(transaction);
        } catch (error) {
            throw new Error(`Gas estimation failed: ${(error as Error).message}`);
        }
    }

    // Wait for transaction confirmation
    static async waitForTransaction(
        provider: ethers.JsonRpcProvider, 
        txHash: string, 
        confirmations: number = 1, 
        timeout: number = 300000
    ): Promise<ethers.TransactionReceipt> {
        try {
            const receipt = await provider.waitForTransaction(txHash, confirmations, timeout);
            if (!receipt) {
                throw new Error('Transaction not found or timed out');
            }
            return receipt;
        } catch (error) {
            throw new Error(`Transaction wait failed: ${(error as Error).message}`);
        }
    }

    // Get transaction receipt
    static async getTransactionReceipt(provider: ethers.JsonRpcProvider, txHash: string): Promise<ethers.TransactionReceipt | null> {
        try {
            return await provider.getTransactionReceipt(txHash);
        } catch (error) {
            throw new Error(`Failed to get transaction receipt: ${(error as Error).message}`);
        }
    }

    // Get account balance
    static async getBalance(provider: ethers.JsonRpcProvider, address: string): Promise<bigint> {
        try {
            return await provider.getBalance(address);
        } catch (error) {
            throw new Error(`Failed to get balance: ${(error as Error).message}`);
        }
    }

    // Get ERC20 token balance
    static async getTokenBalance(provider: ethers.JsonRpcProvider, tokenAddress: string, accountAddress: string): Promise<bigint> {
        try {
            const tokenContract = new ethers.Contract(
                tokenAddress,
                ['function balanceOf(address) view returns (uint256)'],
                provider
            );
            return await tokenContract.balanceOf(accountAddress);
        } catch (error) {
            throw new Error(`Failed to get token balance: ${(error as Error).message}`);
        }
    }

    // Get ERC20 token info
    static async getTokenInfo(provider: ethers.JsonRpcProvider, tokenAddress: string): Promise<TokenInfo> {
        try {
            const tokenContract = new ethers.Contract(
                tokenAddress,
                [
                    'function name() view returns (string)',
                    'function symbol() view returns (string)',
                    'function decimals() view returns (uint8)',
                    'function totalSupply() view returns (uint256)'
                ],
                provider
            );

            const [name, symbol, decimals, totalSupply] = await Promise.all([
                tokenContract.name(),
                tokenContract.symbol(),
                tokenContract.decimals(),
                tokenContract.totalSupply()
            ]);

            return { name, symbol, decimals, totalSupply };
        } catch (error) {
            throw new Error(`Failed to get token info: ${(error as Error).message}`);
        }
    }

    // Check if address is a contract
    static async isContract(provider: ethers.JsonRpcProvider, address: string): Promise<boolean> {
        try {
            const code = await provider.getCode(address);
            return code !== '0x';
        } catch (error) {
            return false;
        }
    }

    // Get nonce for address
    static async getNonce(provider: ethers.JsonRpcProvider, address: string): Promise<number> {
        try {
            return await provider.getTransactionCount(address);
        } catch (error) {
            throw new Error(`Failed to get nonce: ${(error as Error).message}`);
        }
    }

    // Load network configuration from file
    static loadNetworkConfig(configPath: string): Record<string, NetworkConfig> | null {
        try {
            if (!fs.existsSync(configPath)) {
                return null;
            }
            
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return config.networks || {};
        } catch (error) {
            throw new Error(`Failed to load network config: ${(error as Error).message}`);
        }
    }

    // Save network configuration to file
    static saveNetworkConfig(configPath: string, networks: Record<string, NetworkConfig>): void {
        try {
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            const config = { networks };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        } catch (error) {
            throw new Error(`Failed to save network config: ${(error as Error).message}`);
        }
    }

    // Add custom network
    static addCustomNetwork(name: string, config: Partial<NetworkConfig> & { chainId: number; rpcUrl: string }): void {
        this.networks[name] = {
            name: config.name || name,
            chainId: config.chainId,
            rpcUrl: config.rpcUrl,
            explorerUrl: config.explorerUrl || null,
            nativeCurrency: config.nativeCurrency || {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18
            }
        };
    }

    // Remove custom network
    static removeCustomNetwork(name: string): void {
        delete this.networks[name];
    }

    // Get explorer URL for transaction
    static getExplorerUrl(networkName: string, txHash: string): string | null {
        const network = this.getNetwork(networkName);
        if (!network || !network.explorerUrl) {
            return null;
        }
        return `${network.explorerUrl}/tx/${txHash}`;
    }

    // Get explorer URL for address
    static getExplorerAddressUrl(networkName: string, address: string): string | null {
        const network = this.getNetwork(networkName);
        if (!network || !network.explorerUrl) {
            return null;
        }
        return `${network.explorerUrl}/address/${address}`;
    }

    // Get explorer URL for block
    static getExplorerBlockUrl(networkName: string, blockNumber: number): string | null {
        const network = this.getNetwork(networkName);
        if (!network || !network.explorerUrl) {
            return null;
        }
        return `${network.explorerUrl}/block/${blockNumber}`;
    }

    // Validate network configuration
    static validateNetworkConfig(config: Partial<NetworkConfig>): boolean {
        const required: (keyof NetworkConfig)[] = ['name', 'chainId', 'rpcUrl'];
        const missing = required.filter(field => !config[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
        
        if (typeof config.chainId !== 'number' || config.chainId <= 0) {
            throw new Error('Chain ID must be a positive number');
        }
        
        try {
            new URL(config.rpcUrl!);
        } catch (error) {
            throw new Error('Invalid RPC URL format');
        }
        
        if (config.explorerUrl) {
            try {
                new URL(config.explorerUrl);
            } catch (error) {
                throw new Error('Invalid explorer URL format');
            }
        }
        
        return true;
    }

    // Get network by chain ID
    static getNetworkByChainId(chainId: number): NetworkConfig | null {
        return Object.values(this.networks).find(network => network.chainId === chainId) || null;
    }

    // Check if network is testnet
    static isTestnet(networkName: string): boolean {
        const testnetNames = [
            'goerli', 'sepolia', 'mumbai', 'bscTestnet', 'fuji', 
            'arbitrumGoerli', 'optimismGoerli', 'localhost', 'hardhat'
        ];
        return testnetNames.includes(networkName);
    }

    // Get recommended networks for different purposes
    static getRecommendedNetworks(): Record<string, string[]> {
        return {
            development: ['localhost', 'hardhat', 'goerli', 'sepolia'],
            testing: ['goerli', 'sepolia', 'mumbai', 'fuji'],
            production: ['mainnet', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'optimism'],
            lowCost: ['polygon', 'bsc', 'avalanche'],
            highSecurity: ['mainnet', 'arbitrum', 'optimism']
        };
    }
}

export default NetworkUtils;