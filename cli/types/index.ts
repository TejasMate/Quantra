import { ethers } from 'ethers';
import { Command } from 'commander';

// Base interfaces
export interface GlobalOptions {
    verbose?: boolean;
    network?: string;
    quiet?: boolean;
    privateKey?: string;
    config?: string;
}

export interface ValidationError {
    field: string;
    message: string;
    code: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
}

// Network configuration
export interface NetworkConfig {
    name: string;
    chainId: number;
    url: string;
    contracts: Record<string, string>;
}

// Merchant related types
export interface MerchantRegistrationData {
    businessName: string;
    region: string;
    kycLevel: number;
    businessType?: string;
    owner?: string;
}

export interface MerchantData extends MerchantRegistrationData {
    merchantId: string;
    address: string;
    active: boolean;
    registrationDate?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface PaymentMethodData {
    type: 'UPI' | 'PIX' | 'SEPA';
    identifier: string;
    keyType?: string;
    region?: string;
    active?: boolean;
    id?: string;
    timestamp?: number;
}

// Command options interfaces
export interface MerchantCommandOptions {
    name?: string;
    region?: string;
    kycLevel?: number;
    businessType?: string;
    type?: string;
    upiId?: string;
    pixKey?: string;
    keyType?: string;
    iban?: string;
    merchantId?: string;
    filters?: string;
    force?: boolean;
}

export interface DAOCommandOptions {
    type?: string;
    description?: string;
    merchantAddress?: string;
    chainId?: number;
    enabled?: boolean;
    tokenAddress?: string;
    supported?: boolean;
    newFeePercentage?: number;
    proposalId?: string;
    support?: number;
    amount?: string;
    filters?: string;
}

export interface SystemCommandOptions {
    init?: boolean;
    contracts?: boolean;
    network?: string;
    reset?: boolean;
    backup?: boolean;
    restore?: string;
    verbose?: boolean;
}

export interface EscrowCommandOptions {
    merchantId?: string;
    tokenAddress?: string;
    amount?: string;
    deliveryDeadline?: number;
    escrowId?: string;
    filters?: string;
}

// DAO related types
export interface ProposalData {
    id: string;
    proposalType: string;
    description: string;
    proposer: string;
    status: string;
    forVotes?: string;
    againstVotes?: string;
    deadline?: number;
    executionTime?: number;
    data?: any;
}

export interface VoteData {
    proposalId: string;
    support: number;
    voter: string;
    votes: string;
    timestamp?: number;
}

// Escrow related types
export interface EscrowData {
    id: string;
    merchant: string;
    buyer: string;
    amount: string;
    decimals: number;
    symbol: string;
    status: string;
    createdAt?: number;
    deliveryDeadline?: number;
    tokenAddress?: string;
}

// System status types
export interface ContractInfo {
    name: string;
    address: string;
    deployed: boolean;
    codeSize?: number;
    error?: string;
}

export interface NetworkInfo {
    name: string;
    chainId: number;
    blockNumber: number;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    connected: boolean;
    error?: string;
}

export interface SystemStatus {
    network: NetworkInfo;
    contracts: ContractInfo[];
    configuration: {
        valid: boolean;
        errors: string[];
    };
    deployment: {
        valid: boolean;
        timestamp?: string;
        deployer?: string;
    };
}

// Configuration types
export interface CLIConfig {
    version: string;
    defaultNetwork: string;
    networks: Record<string, NetworkConfig>;
    preferences: {
        verbose: boolean;
        confirmTransactions: boolean;
        gasLimit: number | null;
        gasPrice: string | null;
    };
    security: {
        encryptPrivateKeys: boolean;
        sessionTimeout: number;
    };
    features?: Record<string, boolean>;
}

// Validation schemas for input validation
export interface MerchantValidationSchema {
    businessName: {
        required: boolean;
        minLength: number;
        maxLength: number;
        pattern?: RegExp;
    };
    region: {
        required: boolean;
        allowedValues: string[];
    };
    kycLevel: {
        required: boolean;
        min: number;
        max: number;
    };
}

export interface PaymentMethodValidationSchema {
    type: {
        required: boolean;
        allowedValues: string[];
    };
    identifier: {
        required: boolean;
        validators: Record<string, (value: string) => boolean>;
    };
}

// Transaction types
export interface TransactionInfo {
    hash: string;
    from: string;
    to: string;
    value: string;
    gasUsed: string;
    gasPrice: string;
    status: number;
    timestamp: string;
    confirmations?: number;
}

export interface TransactionRequest {
    to: string;
    value?: string;
    data?: string;
    gasLimit?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    nonce?: number;
}

// Event types
export interface ContractEvent {
    name: string;
    signature: string;
    args: any[];
    blockNumber: number;
    transactionHash: string;
    logIndex: number;
}

// CLI command setup types
export interface CommandSetup {
    setupCommands(program: Command): void;
}

// Enhanced error types
export interface CLIError extends Error {
    code?: string;
    details?: any;
    suggestions?: string[];
}

// Format and display types
export interface DisplayOptions {
    format?: 'table' | 'json' | 'yaml';
    verbose?: boolean;
    colors?: boolean;
    pagination?: {
        page: number;
        limit: number;
    };
}

export interface TableColumn {
    header: string;
    field: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
    formatter?: (value: any) => string;
}

// Interactive prompt types
export interface PromptOptions {
    message: string;
    type: 'input' | 'password' | 'confirm' | 'list' | 'checkbox' | 'number';
    choices?: string[] | { name: string; value: any }[];
    default?: any;
    validate?: (input: any) => boolean | string;
    filter?: (input: any) => any;
    when?: (answers: any) => boolean;
}

// Gas estimation types
export interface GasEstimate {
    gasLimit: bigint;
    gasPrice: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    estimatedCost: bigint;
    estimatedTime: string;
}

export interface GasRecommendations {
    slow: GasEstimate;
    standard: GasEstimate;
    fast: GasEstimate;
    baseFee?: bigint;
}

// Backup and restore types
export interface BackupData {
    version: string;
    timestamp: string;
    network: string;
    config: CLIConfig;
    merchants: MerchantData[];
    deployments: Record<string, any>;
    transactions: TransactionInfo[];
}

// Security types
export interface SecurityConfig {
    encryptPrivateKeys: boolean;
    sessionTimeout: number;
    requireConfirmation: boolean;
    maxGasPrice: string;
    trustedContracts: string[];
}

// Monitoring types
export interface HealthCheck {
    name: string;
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    details?: any;
}

export interface MonitoringData {
    timestamp: string;
    network: string;
    checks: HealthCheck[];
    performance: {
        rpcLatency: number;
        blockTime: number;
        pendingTransactions: number;
    };
}

// Environment configuration
export interface EnvironmentConfig {
    name: string;
    description: string;
    networks: string[];
    features: Record<string, boolean>;
    defaults: {
        network: string;
        gasPrice: string;
        confirmations: number;
    };
}

// Plugin system types (for future extensibility)
export interface Plugin {
    name: string;
    version: string;
    description: string;
    commands?: Record<string, Function>;
    hooks?: Record<string, Function>;
    config?: any;
}

// Type guards
export function isValidAddress(address: string): address is string {
    return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isMerchantData(obj: any): obj is MerchantData {
    return obj && 
           typeof obj.merchantId === 'string' &&
           typeof obj.address === 'string' &&
           typeof obj.businessName === 'string' &&
           typeof obj.region === 'string';
}

export function isPaymentMethodData(obj: any): obj is PaymentMethodData {
    return obj &&
           typeof obj.type === 'string' &&
           ['UPI', 'PIX', 'SEPA'].includes(obj.type) &&
           typeof obj.identifier === 'string';
}

export function isValidNetworkConfig(obj: any): obj is NetworkConfig {
    return obj &&
           typeof obj.name === 'string' &&
           typeof obj.chainId === 'number' &&
           typeof obj.url === 'string' &&
           typeof obj.contracts === 'object';
}

// Utility types
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type StringKeys<T> = Extract<keyof T, string>;
export type NonEmptyArray<T> = [T, ...T[]];

// Command execution context
export interface ExecutionContext {
    command: string;
    options: GlobalOptions;
    network: string;
    signer?: ethers.Wallet;
    provider?: ethers.Provider;
    timestamp: number;
}

// Result types for CLI operations
export interface OperationResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    warnings?: string[];
    metadata?: {
        executionTime: number;
        gasUsed?: string;
        transactionHash?: string;
        blockNumber?: number;
    };
}

// Core type definitions
export * from './contracts.js';
export * from './ethers.js';

// Additional enum exports for backward compatibility
export enum ProposalStatus {
    Pending = 0,
    Active = 1,
    Canceled = 2,
    Defeated = 3,
    Succeeded = 4,
    Queued = 5,
    Expired = 6,
    Executed = 7
}

export enum EscrowStatus {
    Created = 0,
    Funded = 1,
    InProgress = 2,
    Disputed = 3,
    Completed = 4,
    Cancelled = 5,
    Refunded = 6
}

export enum OperationStatus {
    Pending = 'pending',
    InProgress = 'in-progress',
    Completed = 'completed',
    Failed = 'failed',
    Cancelled = 'cancelled'
}

export interface ContractInstance {
    address: string;
    abi: any[];
    contract: any;
    network: string;
}