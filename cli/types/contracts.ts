// Contract-related type definitions

export interface TypeSafeContractOptions {
    network?: string;
    autoDetectNetwork?: boolean;
    cacheContracts?: boolean;
    validateABI?: boolean;
    retryCount?: number;
    timeout?: number;
}

export interface ContractInterface {
    address: string;
    abi: any[];
    network: string;
    deployed: boolean;
}

export interface ContractInstance {
    address: string;
    abi: any[];
    contract: any;
    network: string;
}

// Contract deployment data
export interface ContractDeploymentData {
    contractName: string;
    address: string;
    transactionHash: string;
    blockNumber: number;
    network: string;
    deployedAt: number;
}

// Contract method call data
export interface ContractMethodCall {
    contractAddress: string;
    methodName: string;
    parameters: any[];
    gasLimit?: number;
    gasPrice?: string;
}

// Contract event data
export interface ContractEvent {
    address: string;
    topics: string[];
    data: string;
    blockNumber: number;
    transactionHash: string;
    logIndex: number;
}

export default TypeSafeContractOptions;