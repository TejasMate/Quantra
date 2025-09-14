declare module '../../multi-chain-escrow-system.cjs' {
  export class MultiChainEscrowSystem {
    constructor();
    createMultiChainEscrowsForUPIs(upiIds: string[], merchantId: string): Promise<any>;
  }
}