import { z } from 'zod';
import { EscrowStatus, ProposalStatus, OperationStatus } from '../types/index.js';

// Network and Configuration Schemas
export const ChainConfigSchema = z.object({
  name: z.string().min(1),
  chainId: z.number().positive(),
  rpcUrl: z.string().url(),
  nativeCurrency: z.object({
    name: z.string().min(1),
    symbol: z.string().min(1),
    decimals: z.number().min(0).max(18)
  }),
  blockExplorer: z.string().url().optional()
});

export const NetworkConfigSchema = z.object({
  contracts: z.record(z.string().regex(/^0x[a-fA-F0-9]{40}$/)),
  chainId: z.number().positive(),
  rpcUrl: z.string().url().optional(),
  deployer: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  gasPrice: z.string().optional(),
  gasLimit: z.number().positive().optional()
});

export const ConfigSchema = z.object({
  networks: z.record(NetworkConfigSchema),
  timestamp: z.string().optional(),
  version: z.string().optional()
});

// Merchant Schemas
export const MerchantDataSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  businessType: z.enum(['individual', 'corporation', 'partnership', 'other']),
  kycLevel: z.number().min(1).max(3),
  region: z.string().min(2).max(10),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/)
});

export const EscrowDataSchema = z.object({
  escrowId: z.string().min(1),
  merchantId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chainId: z.number().positive(),
  status: z.nativeEnum(EscrowStatus),
  disputeDeadline: z.number().optional(),
  createdAt: z.number().positive()
});

// DAO Schemas
export const ProposalDataSchema = z.object({
  proposalId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  targets: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)),
  values: z.array(z.string().regex(/^\d+$/)),
  calldatas: z.array(z.string().regex(/^0x[a-fA-F0-9]*$/)),
  startBlock: z.number().positive(),
  endBlock: z.number().positive(),
  forVotes: z.string().regex(/^\d+$/),
  againstVotes: z.string().regex(/^\d+$/),
  abstainVotes: z.string().regex(/^\d+$/),
  status: z.nativeEnum(ProposalStatus)
});

// Command Option Schemas
export const CommandOptionsSchema = z.object({
  network: z.string().optional(),
  privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  verbose: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  force: z.boolean().optional()
});

export const GlobalOptionsSchema = z.object({
  network: z.string().min(1),
  privateKey: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  verbose: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false)
});

// Cross-Chain Operation Schemas
export const CrossChainOperationSchema = z.object({
  id: z.string().min(1),
  sourceChain: z.string().min(1),
  targetChain: z.string().min(1),
  operation: z.string().min(1),
  params: z.record(z.any()),
  signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/).optional(),
  timestamp: z.number().positive(),
  status: z.nativeEnum(OperationStatus)
});

// Command-Specific Schemas
export const MerchantRegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  businessType: z.enum(['individual', 'corporation', 'partnership', 'other']),
  kycLevel: z.number().min(1).max(3).default(1),
  region: z.string().min(2).max(10)
});

export const CreateEscrowSchema = z.object({
  merchantId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  targetChain: z.string().min(1),
  disputePeriod: z.number().min(0).max(30).default(7) // days
});

export const CreateProposalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  targets: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).min(1),
  values: z.array(z.string().regex(/^\d+$/)).min(1),
  calldatas: z.array(z.string().regex(/^0x[a-fA-F0-9]*$/)).min(1)
});

export const VoteSchema = z.object({
  proposalId: z.string().min(1),
  support: z.enum(['for', 'against', 'abstain']),
  reason: z.string().max(500).optional()
});

// Session Schemas
export const SessionPreferencesSchema = z.object({
  defaultNetwork: z.string().min(1),
  verboseOutput: z.boolean().default(false),
  autoConfirm: z.boolean().default(false),
  theme: z.enum(['light', 'dark']).default('light')
});

export const CLISessionSchema = z.object({
  id: z.string().min(1),
  network: z.string().min(1),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  startTime: z.number().positive(),
  lastActivity: z.number().positive(),
  preferences: SessionPreferencesSchema
});

// Utility function to validate data with proper error handling
export function validateSchema<T>(schema: any, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error: any) {
    if (error && error.errors) {
      const errors = error.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`);
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

// Safe parsing with detailed error information
export function safeParseSchema<T>(schema: any, data: unknown): {
  success: boolean;
  data?: T;
  errors?: Array<{ field: string; message: string; code: string }>;
} {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map((err: any) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));
  
  return { success: false, errors };
}