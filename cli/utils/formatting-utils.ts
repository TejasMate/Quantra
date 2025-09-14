import chalk from 'chalk';
import Table from 'cli-table3';
import { ethers } from 'ethers';
import { ValidationError, MerchantData, PaymentMethodData, EscrowData, ProposalData, ContractInfo, NetworkInfo, TransactionInfo } from '../types/index.js';

interface ColorScheme {
    success: (text: string) => string;
    error: (text: string) => string;
    warning: (text: string) => string;
    info: (text: string) => string;
    highlight: (text: string) => string;
    dim: (text: string) => string;
    bold: (text: string) => string;
    underline: (text: string) => string;
}

interface TableOptions {
    colWidths?: number[];
    wordWrap?: boolean;
    [key: string]: any;
}

interface ProgressIndicator {
    update: (step: number, status?: 'in-progress' | 'completed' | 'failed') => void;
}

/**
 * Consolidated formatting and display utilities
 * Combines functionality from DisplayUtils and FormatUtils
 */
export class FormattingUtils {
    // Color schemes
    static colors: ColorScheme = {
        success: chalk.green,
        error: chalk.red,
        warning: chalk.yellow,
        info: chalk.blue,
        highlight: chalk.cyan,
        dim: chalk.gray,
        bold: chalk.bold,
        underline: chalk.underline
    };

    // ==================== ADDRESS & HASH FORMATTING ====================

    static formatAddress(address: string | null | undefined, length: number = 8): string {
        if (!address) return 'N/A';
        if (length === 8) {
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        }
        const halfLength = Math.floor(length / 2);
        return `${address.slice(0, halfLength)}...${address.slice(-halfLength)}`;
    }

    static formatTransactionHash(hash: string | null | undefined): string {
        if (!hash) return 'N/A';
        return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
    }

    static formatTxHash(hash: string | null | undefined, length: number = 12): string {
        if (!hash) return 'N/A';
        const halfLength = Math.floor(length / 2);
        return `${hash.slice(0, halfLength)}...${hash.slice(-halfLength)}`;
    }

    // ==================== AMOUNT & VALUE FORMATTING ====================

    static formatAmount(amount: string | number | bigint, decimals: number = 18, symbol: string = 'ETH'): string {
        if (!amount) return '0';
        try {
            let formattedValue: number;
            
            if (typeof amount === 'bigint') {
                formattedValue = parseFloat(ethers.formatUnits(amount, decimals));
            } else if (typeof amount === 'string') {
                // Check if it's already a formatted number or needs wei conversion
                if (amount.includes('.') || parseInt(amount) < 1000000) {
                    formattedValue = parseFloat(amount);
                } else {
                    formattedValue = parseFloat(ethers.formatUnits(amount, decimals));
                }
            } else {
                formattedValue = amount;
            }

            // Format with appropriate precision
            const precision = formattedValue < 1 ? 6 : 4;
            return `${formattedValue.toFixed(precision)} ${symbol}`;
        } catch (error) {
            return `${amount} ${symbol}`;
        }
    }

    static formatGasUsed(gasUsed: string | number | bigint | null | undefined): string {
        if (!gasUsed) return 'N/A';
        try {
            const gas = typeof gasUsed === 'string' ? parseInt(gasUsed) : Number(gasUsed);
            return gas.toLocaleString();
        } catch (error) {
            return gasUsed.toString();
        }
    }

    static formatPercentage(value: number, decimals: number = 2): string {
        return `${(value * 100).toFixed(decimals)}%`;
    }

    static formatFileSize(bytes: number): string {
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    // ==================== DATE & TIME FORMATTING ====================

    static formatTimestamp(timestamp: string | number | null | undefined): string {
        if (!timestamp) return 'N/A';
        try {
            const date = new Date(parseInt(timestamp.toString()) * 1000);
            return date.toLocaleString();
        } catch (error) {
            return 'Invalid Date';
        }
    }

    static formatDate(timestamp: string | number | null | undefined): string {
        if (!timestamp) return 'N/A';
        try {
            const date = typeof timestamp === 'string' ? 
                new Date(parseInt(timestamp) * 1000) : 
                new Date(timestamp * 1000);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch (error) {
            return 'Invalid Date';
        }
    }

    static formatDuration(seconds: number | string | null | undefined): string {
        if (!seconds) return 'N/A';
        const sec = typeof seconds === 'string' ? parseInt(seconds) : seconds;
        
        const days = Math.floor(sec / 86400);
        const hours = Math.floor((sec % 86400) / 3600);
        const minutes = Math.floor((sec % 3600) / 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    // ==================== STATUS FORMATTING ====================

    static formatStatus(status: string | null | undefined): string {
        if (!status) return chalk.gray('Unknown');
        
        const statusMap: Record<string, string> = {
            'active': this.colors.success('✓ Active'),
            'inactive': this.colors.error('✗ Inactive'),
            'pending': this.colors.warning('⏳ Pending'),
            'completed': this.colors.success('✓ Completed'),
            'failed': this.colors.error('✗ Failed'),
            'cancelled': this.colors.dim('⊘ Cancelled'),
            'paused': this.colors.warning('⏸ Paused'),
            'running': this.colors.info('▶ Running'),
            'approved': this.colors.success('✓ Approved'),
            'rejected': this.colors.error('✗ Rejected'),
            'draft': this.colors.dim('📝 Draft'),
            'verified': this.colors.success('✓ Verified'),
            'unverified': this.colors.warning('⚠ Unverified')
        };

        return statusMap[status.toLowerCase()] || this.colors.dim(status);
    }

    // ==================== SPECIALIZED FORMATTING ====================

    static formatKYCLevel(level: number | string | null | undefined): string {
        if (level === null || level === undefined) return chalk.gray('Not Set');
        
        const lvl = typeof level === 'string' ? parseInt(level) : level;
        const levels = {
            0: chalk.red('Not Verified'),
            1: chalk.yellow('Basic'),
            2: chalk.blue('Intermediate'), 
            3: chalk.green('Advanced'),
            4: chalk.green.bold('Premium')
        };
        
        return levels[lvl as keyof typeof levels] || chalk.gray(`Level ${lvl}`);
    }

    static formatRegion(region: string | null | undefined): string {
        if (!region) return chalk.gray('Global');
        return chalk.blue(region.toUpperCase());
    }

    static formatPaymentMethod(type: string | null | undefined, details: any): string {
        if (!type) return chalk.gray('Not Specified');
        
        switch (type.toLowerCase()) {
            case 'crypto':
                return chalk.cyan(`💰 ${details?.token || 'Unknown Token'}`);
            case 'bank':
                return chalk.blue(`🏦 ${details?.bankName || 'Bank Transfer'}`);
            case 'upi':
                return chalk.green(`📱 UPI: ${details?.upiId || 'Unknown'}`);
            default:
                return chalk.yellow(`💳 ${type}`);
        }
    }

    static formatPaymentIdentifier(identifier: string, type: string): string {
        const typeMap: Record<string, string> = {
            'upi': '📱 UPI',
            'pix': '💳 PIX', 
            'iban': '🏦 IBAN',
            'swift': '🏦 SWIFT',
            'crypto': '💰 Crypto',
            'bank': '🏦 Bank'
        };

        const icon = typeMap[type.toLowerCase()] || '💳';
        return `${icon}: ${identifier}`;
    }

    // ==================== TABLE CREATION & FORMATTING ====================

    static createTable(headers: string[], options: TableOptions = {}): Table.Table {
        const defaultOptions = {
            head: headers.map(h => this.colors.bold(h)),
            colWidths: options.colWidths,
            wordWrap: options.wordWrap !== false,
            style: {
                head: ['cyan'],
                border: ['grey']
            }
        };

        return new Table({ ...defaultOptions, ...options });
    }

    static printTable(headers: string[], rows: (string | number | null | undefined)[][]): void {
        const table = new Table({
            head: headers.map(h => chalk.bold.cyan(h)),
            style: {
                head: [],
                border: ['gray']
            }
        });

        rows.forEach(row => {
            table.push(row.map(cell => cell?.toString() || 'N/A'));
        });

        console.log(table.toString());
    }

    // ==================== SPECIALIZED TABLE FORMATTERS ====================

    static formatMerchantTable(merchants: MerchantData[]): string {
        const table = this.createTable([
            'ID', 'Name', 'Status', 'KYC Level', 'Region', 'Created'
        ]);

        merchants.forEach(merchant => {
            table.push([
                merchant.merchantId || 'N/A',
                merchant.businessName || 'N/A',
                this.formatStatus(merchant.active ? 'active' : 'inactive'),
                this.formatKYCLevel(merchant.kycLevel),
                this.formatRegion(merchant.region),
                this.formatTimestamp(merchant.createdAt)
            ]);
        });

        return table.toString();
    }

    static displayMerchantsTable(merchants: MerchantData[]): void {
        console.log(this.formatMerchantTable(merchants));
    }

    static formatPaymentMethodTable(paymentMethods: PaymentMethodData[]): string {
        const table = this.createTable([
            'ID', 'Type', 'Identifier', 'Region', 'Status', 'Created'
        ]);

        paymentMethods.forEach(method => {
            table.push([
                method.id || 'N/A',
                method.type || 'N/A',
                method.identifier || 'N/A',
                this.formatRegion(method.region),
                this.formatStatus(method.active ? 'active' : 'inactive'),
                this.formatTimestamp(method.timestamp)
            ]);
        });

        return table.toString();
    }

    static displayPaymentMethodsTable(paymentMethods: PaymentMethodData[]): void {
        console.log(this.formatPaymentMethodTable(paymentMethods));
    }

    static formatEscrowTable(escrows: EscrowData[]): string {
        const table = this.createTable([
            'ID', 'Merchant', 'Amount', 'Status', 'Created', 'Deadline'
        ]);

        escrows.forEach(escrow => {
            table.push([
                this.formatAddress(escrow.id),
                this.formatAddress(escrow.merchant),
                this.formatAmount(escrow.amount || '0', escrow.decimals || 18, escrow.symbol || 'ETH'),
                this.formatStatus(escrow.status),
                this.formatTimestamp(escrow.createdAt),
                this.formatTimestamp(escrow.deliveryDeadline)
            ]);
        });

        return table.toString();
    }

    static formatProposalTable(proposals: ProposalData[]): string {
        const table = this.createTable([
            'ID', 'Type', 'Description', 'Status', 'Proposer', 'Deadline'
        ]);

        proposals.forEach(proposal => {
            table.push([
                proposal.id?.toString() || 'N/A',
                proposal.proposalType || 'N/A',
                (proposal.description || 'N/A').substring(0, 50) + (proposal.description && proposal.description.length > 50 ? '...' : ''),
                this.formatStatus(proposal.status),
                this.formatAddress(proposal.proposer),
                this.formatTimestamp(proposal.deadline)
            ]);
        });

        return table.toString();
    }

    // ==================== KEY-VALUE DISPLAY ====================

    static printKeyValue(data: Record<string, any>, title: string | null = null): void {
        if (title) {
            console.log(chalk.bold.cyan(`\n${title}:`));
        }
        
        Object.entries(data).forEach(([key, value]) => {
            const formattedKey = chalk.cyan(`${key}:`);
            const formattedValue = value?.toString() || 'N/A';
            console.log(`  ${formattedKey} ${formattedValue}`);
        });
    }

    // ==================== MESSAGE PRINTING ====================

    static printSuccess(message: string): void {
        console.log(this.colors.success(`✓ ${message}`));
    }

    static printError(message: string): void {
        console.log(this.colors.error(`✗ ${message}`));
    }

    static printWarning(message: string): void {
        console.log(this.colors.warning(`⚠ ${message}`));
    }

    static printInfo(message: string): void {
        console.log(this.colors.info(`ℹ ${message}`));
    }

    static printSeparator(): void {
        console.log(chalk.gray('─'.repeat(60)));
    }

    static success(message: string): void {
        this.printSuccess(message);
    }

    static error(message: string): void {
        this.printError(message);
    }

    static warning(message: string): void {
        this.printWarning(message);
    }

    static info(message: string): void {
        this.printInfo(message);
    }

    // ==================== PROGRESS INDICATORS ====================

    static createProgressIndicator(steps: string[]): ProgressIndicator {
        let currentStep = 0;
        
        const displayProgress = (step: number, status: 'in-progress' | 'completed' | 'failed' = 'in-progress') => {
            console.clear();
            console.log(this.colors.bold('Progress:'));
            
            steps.forEach((stepName, index) => {
                let icon = '○';
                let color = this.colors.dim;
                
                if (index < step) {
                    icon = '✓';
                    color = this.colors.success;
                } else if (index === step) {
                    if (status === 'completed') {
                        icon = '✓';
                        color = this.colors.success;
                    } else if (status === 'failed') {
                        icon = '✗';
                        color = this.colors.error;
                    } else {
                        icon = '◐';
                        color = this.colors.warning;
                    }
                }
                
                console.log(`  ${color(icon)} ${stepName}`);
            });
        };

        return {
            update: (step: number, status?: 'in-progress' | 'completed' | 'failed') => {
                currentStep = step;
                displayProgress(step, status);
            }
        };
    }

    // ==================== VALIDATION ERROR DISPLAY ====================

    static displayValidationErrors(errors: ValidationError[]): void {
        if (errors.length === 0) return;

        this.printError('Validation Errors:');
        errors.forEach(error => {
            console.log(`  ${this.colors.error('•')} ${error.field}: ${error.message}`);
        });
    }
}

// Export both old class names for backward compatibility
export const DisplayUtils = FormattingUtils;
export const FormatUtils = FormattingUtils;