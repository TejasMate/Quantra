// Ethers.js type extensions for Fragment handling

// Safe Fragment interface that doesn't conflict with ethers
export interface SafeFragment {
    type: string;
    name?: string;
    stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
    inputs?: { name: string; type: string; internalType?: string }[];
    outputs?: { name: string; type: string; internalType?: string }[];
}

export interface ParsedEvent {
    name: string;
    args: any;
    signature: string;
    topic: string;
    fragment: SafeFragment;
}

// Helper type for contract analysis
export interface ContractAnalysis {
    readOnlyFunctions: SafeFragment[];
    writeFunctions: SafeFragment[];
    events: SafeFragment[];
    errors: SafeFragment[];
}

export default SafeFragment;