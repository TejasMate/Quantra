/**
 * Aptos Adapter - Cross-Chain Escrow Deployment
 * 
 * This adapter handles ONLY escrow contract deployment on Aptos blockchain.
 * Merchant registration, KYC, and governance logic remains exclusively on Polygon.
 * 
 * The adapter listens for cross-chain deployment triggers from Polygon's EscrowFactory
 * and deploys corresponding escrow contracts on Aptos using Move language.
 */

import { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const ROOT_CONFIG_FILE = path.join(process.cwd(), 'config.json');

class AptosAdapter {
    constructor() {
        this.client = null;
        this.faucetClient = null;
        this.tokenClient = null;
        this.coinClient = null;
        this.account = null;
        this.config = null;
    }

    async initialize() {
        try {
            // Load configuration
            await this.loadConfig();
            
            // Initialize Aptos client with new SDK
            const network = this.config.network === 'mainnet' ? Network.MAINNET : Network.DEVNET;
            const aptosConfig = new AptosConfig({ network });
            this.client = new Aptos(aptosConfig);
            
            // Initialize account
            await this.initializeAccount();
            
            console.log(chalk.green('✅ Aptos adapter initialized'));
            console.log(chalk.blue('🔗 Network:'), this.config.network || 'devnet');
            console.log(chalk.blue('🔐 Account:'), this.account.accountAddress.toString());
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to initialize Aptos adapter:'), error.message);
            throw error;
        }
    }

    async loadConfig() {
        try {
            if (fs.existsSync(ROOT_CONFIG_FILE)) {
                const rootConfig = JSON.parse(fs.readFileSync(ROOT_CONFIG_FILE, 'utf8'));
                this.config = rootConfig.networks.aptos.devnet || {
                    network: 'devnet',
                    nodeUrl: 'https://fullnode.devnet.aptoslabs.com/v1',
                    faucetUrl: 'https://faucet.devnet.aptoslabs.com',
                    moduleAddress: null,
                    escrowContracts: [],
                    deployedModules: []
                };
            } else {
                // Create default config if no root config exists
                this.config = {
                    network: 'devnet',
                    nodeUrl: 'https://fullnode.devnet.aptoslabs.com/v1',
                    faucetUrl: 'https://faucet.devnet.aptoslabs.com',
                    moduleAddress: null,
                    escrowContracts: [],
                    deployedModules: []
                };
            }
        } catch (error) {
            console.error(chalk.red('❌ Failed to load Aptos config:'), error.message);
            throw error;
        }
    }

    async initializeAccount() {
        try {
            // Try to load account from environment or file
            if (process.env.APTOS_PRIVATE_KEY) {
                // Load from environment variable
                const privateKeyHex = process.env.APTOS_PRIVATE_KEY;
                const privateKey = new Ed25519PrivateKey(privateKeyHex);
                this.account = Account.fromPrivateKey({ privateKey });
            } else {
                // Generate new account for development
                console.log(chalk.yellow('⚠️  No private key found, generating new account'));
                this.account = Account.generate();
                
                console.log(chalk.blue('💡 Save this private key to environment:'));
                console.log(chalk.gray(`APTOS_PRIVATE_KEY=${this.account.privateKey.toString()}`));
            }
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to initialize account:'), error.message);
            throw error;
        }
    }

    async checkBalance() {
        try {
            if (!this.account) {
                throw new Error('Account not initialized');
            }
            
            const balance = await this.client.getAccountAPTAmount({
                accountAddress: this.account.accountAddress
            });
            console.log(chalk.blue('💰 APT Balance:'), balance / 100000000, 'APT');
            
            if (balance / 100000000 < 0.1 && this.config.network === 'devnet') {
                console.log(chalk.yellow('⚠️  Low balance! Requesting funds from faucet...'));
                await this.requestFaucetFunds();
            }
            
            return balance;
        } catch (error) {
            console.error(chalk.red('❌ Failed to check balance:'), error.message);
            return 0;
        }
    }

    async requestFaucetFunds() {
        try {
            if (this.config.network !== 'devnet') {
                console.log(chalk.yellow('⚠️  Faucet not available for this network'));
                return;
            }
            
            console.log(chalk.blue('🚰 Requesting funds from faucet...'));
            await this.client.fundAccount({
                accountAddress: this.account.accountAddress,
                amount: 100000000 // 1 APT
            });
            
            console.log(chalk.green('✅ Faucet funds received'));
            
            // Wait a bit for the transaction to be processed
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            console.warn(chalk.yellow('⚠️  Faucet request failed:'), error.message);
        }
    }

    async deployEscrowContract(escrowRequest) {
        try {
            console.log(chalk.blue('🚀 Deploying Aptos escrow contract...'));
            
            // Check balance
            await this.checkBalance();
            
            // Prepare escrow initialization parameters
            const buyer = escrowRequest.buyer;
            const merchant = escrowRequest.merchant;
            const amount = escrowRequest.amount.toString();
            const tokenType = escrowRequest.token === '0x0000000000000000000000000000000000000000' 
                ? '0x1::aptos_coin::AptosCoin' 
                : escrowRequest.tokenAddress || '0x1::aptos_coin::AptosCoin';
            
            // Create escrow initialization transaction
            const payload = {
                type: 'entry_function_payload',
                function: `${this.config.moduleAddress || this.account.address().hex()}::escrow::initialize_escrow`,
                type_arguments: [tokenType],
                arguments: [
                    buyer,
                    merchant,
                    amount,
                    (Date.now() + (24 * 60 * 60 * 1000)).toString() // 24 hours timeout
                ]
            };
            
            // Submit transaction
            const txnRequest = await this.client.generateTransaction(this.account.address(), payload);
            const signedTxn = await this.client.signTransaction(this.account, txnRequest);
            const transactionRes = await this.client.submitTransaction(signedTxn);
            
            console.log(chalk.yellow('⏳ Waiting for transaction confirmation...'));
            await this.client.waitForTransaction(transactionRes.hash);
            
            // Get escrow resource address
            const escrowAddress = await this.getEscrowAddress(transactionRes.hash);
            
            const escrowInfo = {
                escrowAddress,
                buyer: escrowRequest.buyer,
                merchant: escrowRequest.merchant,
                amount: escrowRequest.amount.toString(),
                token: escrowRequest.token,
                tokenType,
                transactionHash: transactionRes.hash,
                createdAt: Date.now(),
                status: 'deployed',
                network: this.config.network
            };
            
            // Save escrow info
            await this.saveEscrowInfo(escrowInfo);
            
            console.log(chalk.green('\n🎉 Aptos escrow deployed successfully!'));
            console.log(chalk.blue('📋 Deployment Details:'));
            console.log(`   Escrow Address: ${chalk.yellow(escrowAddress)}`);
            console.log(`   Transaction: ${chalk.gray(transactionRes.hash)}`);
            console.log(`   Network: ${chalk.blue(this.config.network)}`);
            
            return escrowInfo;
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to deploy Aptos escrow:'), error.message);
            throw error;
        }
    }

    async getEscrowAddress(transactionHash) {
        try {
            const transaction = await this.client.getTransactionByHash(transactionHash);
            
            // Extract escrow address from transaction events or changes
            if (transaction.changes) {
                for (const change of transaction.changes) {
                    if (change.type === 'write_resource' && change.data.type.includes('escrow')) {
                        return change.address;
                    }
                }
            }
            
            // Fallback: use a deterministic address based on account and transaction
            return `${this.account.address().hex()}::escrow_${transactionHash.slice(0, 8)}`;
            
        } catch (error) {
            console.warn(chalk.yellow('⚠️  Could not determine escrow address:'), error.message);
            return `${this.account.address().hex()}::escrow_${Date.now()}`;
        }
    }

    async getEscrowStatus(escrowAddress) {
        try {
            // Try to get escrow resource
            const resources = await this.client.getAccountResources(escrowAddress);
            const escrowResource = resources.find(r => r.type.includes('escrow'));
            
            if (!escrowResource) {
                return { status: 'not_found' };
            }
            
            const data = escrowResource.data;
            
            return {
                status: data.is_completed ? 'completed' : 'active',
                buyer: data.buyer,
                merchant: data.merchant,
                amount: data.amount,
                createdAt: data.created_at,
                timeout: data.timeout
            };
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to get escrow status:'), error.message);
            return { status: 'error', error: error.message };
        }
    }

    async depositToEscrow(escrowAddress, amount, tokenType = '0x1::aptos_coin::AptosCoin') {
        try {
            console.log(chalk.blue('💰 Depositing to Aptos escrow...'));
            
            const payload = {
                type: 'entry_function_payload',
                function: `${this.config.moduleAddress || this.account.address().hex()}::escrow::deposit`,
                type_arguments: [tokenType],
                arguments: [escrowAddress, amount.toString()]
            };
            
            const txnRequest = await this.client.generateTransaction(this.account.address(), payload);
            const signedTxn = await this.client.signTransaction(this.account, txnRequest);
            const transactionRes = await this.client.submitTransaction(signedTxn);
            
            await this.client.waitForTransaction(transactionRes.hash);
            
            console.log(chalk.green('✅ Deposit completed'));
            console.log(chalk.gray(`Transaction: ${transactionRes.hash}`));
            
            return { transactionHash: transactionRes.hash, status: 'completed' };
            
        } catch (error) {
            console.error(chalk.red('❌ Deposit failed:'), error.message);
            throw error;
        }
    }

    async withdrawFromEscrow(escrowAddress, tokenType = '0x1::aptos_coin::AptosCoin') {
        try {
            console.log(chalk.blue('💸 Withdrawing from Aptos escrow...'));
            
            const payload = {
                type: 'entry_function_payload',
                function: `${this.config.moduleAddress || this.account.address().hex()}::escrow::withdraw`,
                type_arguments: [tokenType],
                arguments: [escrowAddress]
            };
            
            const txnRequest = await this.client.generateTransaction(this.account.address(), payload);
            const signedTxn = await this.client.signTransaction(this.account, txnRequest);
            const transactionRes = await this.client.submitTransaction(signedTxn);
            
            await this.client.waitForTransaction(transactionRes.hash);
            
            console.log(chalk.green('✅ Withdrawal completed'));
            console.log(chalk.gray(`Transaction: ${transactionRes.hash}`));
            
            return { transactionHash: transactionRes.hash, status: 'completed' };
            
        } catch (error) {
            console.error(chalk.red('❌ Withdrawal failed:'), error.message);
            throw error;
        }
    }

    async emergencyWithdraw(escrowAddress, tokenType = '0x1::aptos_coin::AptosCoin') {
        try {
            console.log(chalk.blue('🚨 Emergency withdrawal from Aptos escrow...'));
            
            const payload = {
                type: 'entry_function_payload',
                function: `${this.config.moduleAddress || this.account.address().hex()}::escrow::emergency_withdraw`,
                type_arguments: [tokenType],
                arguments: [escrowAddress]
            };
            
            const txnRequest = await this.client.generateTransaction(this.account.address(), payload);
            const signedTxn = await this.client.signTransaction(this.account, txnRequest);
            const transactionRes = await this.client.submitTransaction(signedTxn);
            
            await this.client.waitForTransaction(transactionRes.hash);
            
            console.log(chalk.green('✅ Emergency withdrawal completed'));
            console.log(chalk.gray(`Transaction: ${transactionRes.hash}`));
            
            return { transactionHash: transactionRes.hash, status: 'completed' };
            
        } catch (error) {
            console.error(chalk.red('❌ Emergency withdrawal failed:'), error.message);
            throw error;
        }
    }

    async saveEscrowInfo(escrowInfo) {
        try {
            this.config.escrowContracts.push(escrowInfo);
            fs.writeFileSync(APTOS_CONFIG_FILE, JSON.stringify(this.config, null, 2));
            console.log(chalk.green('✅ Escrow info saved to Aptos config'));
        } catch (error) {
            console.warn(chalk.yellow('⚠️  Failed to save escrow info:'), error.message);
        }
    }

    async listEscrows() {
        try {
            console.log(chalk.blue('\n🔒 Aptos Escrows'));
            console.log(chalk.gray('================='));
            
            if (this.config.escrowContracts.length === 0) {
                console.log(chalk.yellow('No escrows found'));
                return [];
            }
            
            for (const escrow of this.config.escrowContracts) {
                console.log(`\n📋 Escrow: ${escrow.escrowAddress}`);
                console.log(`   Buyer: ${escrow.buyer}`);
                console.log(`   Merchant: ${escrow.merchant}`);
                console.log(`   Amount: ${escrow.amount}`);
                console.log(`   Token: ${escrow.tokenType}`);
                console.log(`   Status: ${chalk.blue(escrow.status)}`);
                console.log(`   Created: ${new Date(escrow.createdAt).toLocaleString()}`);
                
                // Get current status
                const currentStatus = await this.getEscrowStatus(escrow.escrowAddress);
                console.log(`   On-chain Status: ${chalk.yellow(currentStatus.status)}`);
            }
            
            return this.config.escrowContracts;
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to list escrows:'), error.message);
            return [];
        }
    }

    async handleEscrowRequest(polygonEvent) {
        try {
            console.log(chalk.blue('📨 Processing Aptos escrow request...'));
            
            const escrowRequest = {
                requestId: polygonEvent.requestId,
                buyer: polygonEvent.buyer,
                merchant: polygonEvent.merchant,
                token: polygonEvent.token,
                amount: polygonEvent.amount,
                metadataHash: polygonEvent.metadataHash
            };
            
            // Deploy escrow
            const deployedEscrow = await this.deployEscrowContract(escrowRequest);
            
            console.log(chalk.green('✅ Aptos escrow request processed'));
            return deployedEscrow;
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to handle escrow request:'), error.message);
            throw error;
        }
    }

    async getNetworkInfo() {
        try {
            const ledgerInfo = await this.client.getLedgerInfo();
            
            return {
                network: this.config.network,
                nodeUrl: this.config.nodeUrl,
                chainId: ledgerInfo.chain_id,
                ledgerVersion: ledgerInfo.ledger_version,
                ledgerTimestamp: ledgerInfo.ledger_timestamp,
                account: this.account.address().hex()
            };
        } catch (error) {
            console.error(chalk.red('❌ Failed to get network info:'), error.message);
            return null;
        }
    }

    async publishModule(moduleCode) {
        try {
            console.log(chalk.blue('📦 Publishing Aptos module...'));
            
            const payload = {
                type: 'module_bundle_payload',
                modules: [
                    { bytecode: moduleCode }
                ]
            };
            
            const txnRequest = await this.client.generateTransaction(this.account.address(), payload);
            const signedTxn = await this.client.signTransaction(this.account, txnRequest);
            const transactionRes = await this.client.submitTransaction(signedTxn);
            
            await this.client.waitForTransaction(transactionRes.hash);
            
            console.log(chalk.green('✅ Module published successfully'));
            console.log(chalk.gray(`Transaction: ${transactionRes.hash}`));
            
            // Update config with module address
            this.config.moduleAddress = this.account.address().hex();
            fs.writeFileSync(APTOS_CONFIG_FILE, JSON.stringify(this.config, null, 2));
            
            return { transactionHash: transactionRes.hash, moduleAddress: this.account.address().hex() };
            
        } catch (error) {
            console.error(chalk.red('❌ Failed to publish module:'), error.message);
            throw error;
        }
    }
}

export default AptosAdapter;

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const adapter = new AptosAdapter();
    
    async function main() {
        try {
            await adapter.initialize();
            
            const command = process.argv[2];
            
            switch (command) {
                case 'balance':
                    await adapter.checkBalance();
                    break;
                case 'faucet':
                    await adapter.requestFaucetFunds();
                    break;
                case 'list':
                    await adapter.listEscrows();
                    break;
                case 'info':
                    const info = await adapter.getNetworkInfo();
                    console.log(JSON.stringify(info, null, 2));
                    break;
                default:
                    console.log('Usage: node aptos-adapter.js [balance|faucet|list|info]');
            }
        } catch (error) {
            console.error(chalk.red('❌ Error:'), error.message);
            process.exit(1);
        }
    }
    
    main();
}