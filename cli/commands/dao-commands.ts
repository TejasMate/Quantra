import chalk from 'chalk';
import { TypeSafeContractManager } from '../utils/type-safe-contract-manager.js';
import inquirer from 'inquirer';
import { ethers } from 'ethers';
import { EnhancedConfigManager } from '../utils/enhanced-config-manager.js';
import { InputValidator } from '../validators/input-validator.js';
import { 
  GlobalOptions, 
  ValidationResult 
} from '../types/index.js';

interface DAOCommandOptions {
  title?: string;
  description?: string;
  action?: string;
  target?: string;
  value?: string;
  calldata?: string;
  privateKey?: string;
  noInteractive?: boolean;
  proposalId?: string;
  vote?: string;
  reason?: string;
  status?: string;
  format?: string;
  votes?: boolean;
  to?: string;
}

interface ProposalCreationData {
  type: string;
  description: string;
  target?: string | undefined;
  data?: string | undefined;
  merchantId?: string;
  merchantAddress?: string;
  upiId?: string;
  chainId?: string;
  enabled?: boolean;
  tokenAddress?: string;
  newFeePercentage?: string;
  targetContract?: string;
}

interface VoteData {
  proposalId: string;
  support: boolean | number;
  reason?: string | undefined;
}

interface DelegateData {
  delegatee: string;
}

export class DAOCommands {
  private contractManager: TypeSafeContractManager;
  private configManager: any; // Use any for now to avoid type issues
  private initialized: boolean = false;

  constructor() {
    this.configManager = new EnhancedConfigManager();
    this.contractManager = new TypeSafeContractManager();
  }

  async ensureInitialized(globalOptions: GlobalOptions): Promise<void> {
    if (!this.initialized) {
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);
      this.initialized = true;
    }
  }

  setupCommands(daoCmd: any): void {
    daoCmd
      .command('propose')
      .description('Create a new governance proposal')
      .option('-t, --title <title>', 'Proposal title')
      .option('-d, --description <description>', 'Proposal description')
      .option('-a, --action <action>', 'Proposal action (upgrade, parameter, treasury)')
      .option('--target <address>', 'Target contract address')
      .option('--value <amount>', 'ETH value to send')
      .option('--calldata <data>', 'Call data for proposal')
      .option('--private-key <key>', 'Private key for transaction')
      .option('--no-interactive', 'Skip interactive prompts')
      .action(async (options: DAOCommandOptions) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.createProposal(options, globalOptions);
      });

    daoCmd
      .command('vote')
      .description('Vote on a governance proposal')
      .option('-p, --proposal-id <id>', 'Proposal ID')
      .option('-v, --vote <vote>', 'Vote (for, against, abstain)')
      .option('-r, --reason <reason>', 'Vote reason')
      .option('--private-key <key>', 'Private key for transaction')
      .action(async (options: DAOCommandOptions) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.vote(options, globalOptions);
      });

    daoCmd
      .command('execute')
      .description('Execute a successful proposal')
      .option('-p, --proposal-id <id>', 'Proposal ID')
      .option('--private-key <key>', 'Private key for transaction')
      .action(async (options: DAOCommandOptions) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.executeProposal(options, globalOptions);
      });

    daoCmd
      .command('list')
      .description('List governance proposals')
      .option('-s, --status <status>', 'Filter by status (pending, active, succeeded, defeated, executed)')
      .option('--format <format>', 'Output format (table, json)', 'table')
      .action(async (options: DAOCommandOptions) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.listProposals(options, globalOptions);
      });

    daoCmd
      .command('info')
      .description('Get proposal information')
      .option('-p, --proposal-id <id>', 'Proposal ID')
      .option('--votes', 'Include vote details')
      .action(async (options: DAOCommandOptions) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.getProposalInfo(options, globalOptions);
      });

    daoCmd
      .command('delegate')
      .description('Delegate voting power')
      .option('-t, --to <address>', 'Delegate to address')
      .option('--private-key <key>', 'Private key for transaction')
      .action(async (options: DAOCommandOptions) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.delegateVotes(options, globalOptions);
      });

    // DAO Governance Commands
    daoCmd
      .command('set-stake')
      .description('Set custom stake amount for a region')
      .option('-r, --region <id>', 'Region ID')
      .option('-s, --stake <amount>', 'Stake amount in ETH')
      .option('-e, --enabled <enabled>', 'Enable/disable override', 'true')
      .option('--private-key <key>', 'Private key for transaction')
      .action(async (options: any) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.setStakeOverride(options, globalOptions);
      });

    daoCmd
      .command('set-kyc-bypass')
      .description('Set KYC bypass policy (global, region, or address)')
      .option('-g, --global <enabled>', 'Set global KYC bypass')
      .option('-r, --region <id>', 'Region ID for region-specific bypass')
      .option('-a, --address <address>', 'Address for address-specific bypass')
      .option('-e, --enabled <enabled>', 'Enable/disable bypass', 'true')
      .option('--private-key <key>', 'Private key for transaction')
      .action(async (options: any) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.setKycBypass(options, globalOptions);
      });

    daoCmd
      .command('add-region')
      .description('Add a new custom region')
      .option('-i, --id <id>', 'Region ID')
      .option('-n, --name <name>', 'Region name')
      .option('-s, --stake <amount>', 'Stake amount in ETH')
      .option('-m, --max-merchants <count>', 'Maximum merchants', '10000')
      .option('-a, --active <active>', 'Region active status', 'true')
      .option('--private-key <key>', 'Private key for transaction')
      .action(async (options: any) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.addCustomRegion(options, globalOptions);
      });

    daoCmd
      .command('remove-region')
      .description('Remove a custom region')
      .option('-i, --id <id>', 'Region ID')
      .option('--private-key <key>', 'Private key for transaction')
      .action(async (options: any) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.removeCustomRegion(options, globalOptions);
      });

    daoCmd
      .command('update-region')
      .description('Update custom region configuration')
      .option('-i, --id <id>', 'Region ID')
      .option('-n, --name <name>', 'New region name')
      .option('-a, --active <active>', 'Region active status')
      .option('-m, --max-merchants <count>', 'Maximum merchants')
      .option('--private-key <key>', 'Private key for transaction')
      .action(async (options: any) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.updateCustomRegion(options, globalOptions);
      });

    daoCmd
      .command('list-regions')
      .description('List all regions (default and custom)')
      .option('--format <format>', 'Output format (table, json)', 'table')
      .action(async (options: any) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.listRegions(options, globalOptions);
      });

    daoCmd
      .command('region-info')
      .description('Get detailed information about a region')
      .option('-r, --region <id>', 'Region ID')
      .action(async (options: any) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.getRegionInfo(options, globalOptions);
      });

    daoCmd
      .command('merchant-info')
      .description('Get merchant governance information')
      .option('-a, --address <address>', 'Merchant address')
      .option('-r, --region <id>', 'Region ID')
      .action(async (options: any) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.getMerchantInfo(options, globalOptions);
      });

    daoCmd
      .command('governance-status')
      .description('Get overall DAO governance status')
      .option('--format <format>', 'Output format (table, json)', 'table')
      .action(async (options: any) => {
        const globalOptions = daoCmd.parent.opts() as GlobalOptions;
        await this.ensureInitialized(globalOptions);
        await this.getGovernanceStatus(options, globalOptions);
      });
  }

  async createProposal(options: DAOCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🗳️  Create DAO Proposal'));
    console.log(chalk.gray('Creating new governance proposal\n'));

    try {
      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);

      // Get signer
      const signer = this.contractManager.getSigner();
      if (!signer) {
        throw new Error('No signer available');
      }

      // Get proposal details
      const proposalData = await this.getProposalData(options);

      // Create proposal based on type
      console.log(chalk.yellow('📝 Creating proposal...'));
      const merchantDAO = await this.contractManager.loadContract('MerchantGovernance');
      
      // For now, create a simple proposal using the standard Governor interface
      const targets = [proposalData.target || await merchantDAO.getAddress()];
      const values = [0]; // No ETH being sent
      const calldatas = [proposalData.data || '0x']; // Empty calldata for now
      
      let tx;
      // Use proposeWithMetadata if available, otherwise use standard propose
      try {
        // Try to determine category based on proposal type
        let category = 0; // Default to TREASURY
        switch (proposalData.type) {
          case 'merchant-approval':
          case 'merchant-revocation':
            category = 4; // MERCHANT_REGISTRY
            break;
          case 'emergency-pause':
            category = 3; // EMERGENCY
            break;
          case 'fee-update':
          case 'chain-config':
          case 'token-support':
            category = 2; // PARAMETER_CHANGE
            break;
          default:
            category = 0; // TREASURY
        }
        
        tx = await this.contractManager.executeContractMethod(
          'MerchantGovernance',
          'proposeWithMetadata',
          [targets, values, calldatas, proposalData.description, category]
        );
      } catch (error) {
        // Fallback to standard propose if proposeWithMetadata doesn't exist
        tx = await this.contractManager.executeContractMethod(
          'MerchantGovernance',
          'propose',
          [targets, values, calldatas, proposalData.description]
        );
      }

      console.log(chalk.gray(`Transaction hash: ${tx.hash}`));

      // Wait for transaction receipt
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error('Transaction failed - no receipt received');
      }

      // Get proposal ID from events
      let proposalId: string | undefined;
      console.log(chalk.gray(`Debug: Found ${receipt.logs?.length || 0} logs in transaction`));
      
      if (receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const decodedEvent = (merchantDAO as any).interface.parseLog(log);
            if (decodedEvent && decodedEvent.name) {
              console.log(chalk.gray(`Debug: Found event: ${decodedEvent.name}`));
              if (decodedEvent.name === 'ProposalCreated') {
                proposalId = decodedEvent.args.proposalId.toString();
              }
            }
          } catch (error) {
            // Skip logs that can't be parsed by this contract
            continue;
          }
        }
      }

      console.log(chalk.green('\n✅ Proposal created successfully!'));
      console.log(chalk.white(`   Proposal ID: ${proposalId || 'N/A'}`));
      console.log(chalk.white(`   Type: ${proposalData.type}`));
      console.log(chalk.white(`   Description: ${proposalData.description}`));
      console.log(chalk.white(`   Proposer: ${await signer.getAddress()}`));
      console.log(chalk.gray(`   Gas used: ${receipt.gasUsed?.toString() || 'N/A'}`));

      console.log(chalk.blue('\n💡 Next steps:'));
      console.log('   1. Vote on proposal: quantra-cli dao vote --proposal-id ' + (proposalId || 'ID'));
      console.log('   2. Check status: quantra-cli dao info --proposal-id ' + (proposalId || 'ID'));

    } catch (error) {
      console.error(chalk.red('❌ Creating proposal failed:'), (error as Error).message);
      throw error;
    }
  }

  async vote(options: DAOCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🗳️  Vote on Proposal'));
    console.log(chalk.gray('Casting vote on DAO proposal\n'));

    try {
      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);

      // Get signer
      const signer = this.contractManager.getSigner();
      if (!signer) {
        throw new Error('No signer available');
      }

      // Get vote details
      const voteData = await this.getVoteData(options);

      // Check voting power
      const govToken = await this.contractManager.loadContract('GovToken');
      const votingPower = await (govToken as any).getVotes(await signer.getAddress());
      
      if (votingPower.toString() === '0') {
        throw new Error('You have no voting power. Delegate tokens to yourself first.');
      }

      console.log(chalk.blue(`Your voting power: ${ethers.formatEther(votingPower)} tokens`));

      // Cast vote
      console.log(chalk.yellow('🗳️  Casting vote...'));
      const tx = await this.contractManager.executeContractMethod(
        'MerchantGovernance',
        'castVote',
        [voteData.proposalId, voteData.support]
      );

      const receipt = await tx.wait();

      console.log(chalk.green('\n✅ Vote cast successfully!'));
      console.log(chalk.white(`   Proposal ID: ${voteData.proposalId}`));
      console.log(chalk.white(`   Vote: ${typeof voteData.support === 'boolean' ? (voteData.support ? 'For' : 'Against') : this.getSupportName(voteData.support as number)}`));
      console.log(chalk.white(`   Voting Power: ${ethers.formatEther(votingPower)} tokens`));
      console.log(chalk.white(`   Voter: ${await signer.getAddress()}`));
      console.log(chalk.gray(`   Gas used: ${receipt?.gasUsed?.toString() || 'N/A'}`));

    } catch (error) {
      console.error(chalk.red('❌ Voting failed:'), (error as Error).message);
      throw error;
    }
  }

  async executeProposal(options: DAOCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n⚡ Execute Proposal'));
    console.log(chalk.gray('Executing approved DAO proposal\n'));

    try {
      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);

      // Get signer
      const signer = this.contractManager.getSigner();
      if (!signer) {
        throw new Error('No signer available');
      }

      const proposalId = options.proposalId || await this.getProposalId();

      // Check proposal state
      const merchantDAO = await this.contractManager.loadContract('MerchantGovernance');
      const proposalState = await (merchantDAO as any).state(proposalId);
      
      if (proposalState !== 4) { // 4 = Succeeded
        const stateName = this.getProposalStateName(proposalState);
        throw new Error(`Proposal cannot be executed. Current state: ${stateName}`);
      }

      // Execute proposal
      console.log(chalk.yellow('⚡ Executing proposal...'));
      const tx = await this.contractManager.executeContractMethod(
        'MerchantGovernance',
        'execute',
        [proposalId]
      );

      const receipt = await tx.wait();

      console.log(chalk.green('\n✅ Proposal executed successfully!'));
      console.log(chalk.white(`   Proposal ID: ${proposalId}`));
      console.log(chalk.white(`   Executor: ${await signer.getAddress()}`));
      console.log(chalk.gray(`   Gas used: ${receipt?.gasUsed?.toString() || 'N/A'}`));

    } catch (error) {
      console.error(chalk.red('❌ Executing proposal failed:'), (error as Error).message);
      throw error;
    }
  }

  async listProposals(options: DAOCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n📋 DAO Proposals'));
    console.log(chalk.gray('Fetching governance proposals\n'));

    try {
      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);

      const merchantDAO = await this.contractManager.loadContract('MerchantGovernance');
      
      // Get proposals by checking state method for sequential IDs
      const proposals: any[] = [];
      const maxProposals = 20;

      for (let i = 1; i <= maxProposals; i++) {
        try {
          const state = await (merchantDAO as any).state(i);
          
          // Apply status filter
          if (options.status && state.toString() !== options.status) {
            continue;
          }

          const snapshot = await (merchantDAO as any).proposalSnapshot(i);
          const deadline = await (merchantDAO as any).proposalDeadline(i);
          
          proposals.push({
            id: i,
            state: this.getProposalStateName(state),
            snapshot: snapshot.toString(),
            deadline: deadline.toString()
          });
        } catch (error) {
          // If we get a revert, proposal doesn't exist
          if ((error as Error).message.includes('revert') || (error as any).data === '0x') {
            break;
          }
          continue;
        }
      }

      if (proposals.length === 0) {
        console.log(chalk.yellow('📭 No proposals found'));
        return;
      }

      // Display results
      if (options.format === 'json') {
        console.log(JSON.stringify(proposals, null, 2));
      } else {
        console.log(chalk.white('\n📋 Found proposals:'));
        proposals.forEach(proposal => {
          console.log(chalk.cyan(`   ID: ${proposal.id}`));
          console.log(chalk.white(`   State: ${proposal.state}`));
          console.log(chalk.gray(`   Snapshot: ${proposal.snapshot}`));
          console.log(chalk.gray(`   Deadline: ${proposal.deadline}`));
          console.log('');
        });
      }

    } catch (error) {
      console.error(chalk.red('❌ Listing proposals failed:'), (error as Error).message);
      throw error;
    }
  }

  async getProposalInfo(options: DAOCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🔍 Proposal Details'));
    console.log(chalk.gray('Fetching proposal information\n'));

    try {
      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);

      const proposalId = options.proposalId || await this.getProposalId();
      const merchantDAO = await this.contractManager.loadContract('MerchantGovernance');

      // Get proposal info
      const state = await (merchantDAO as any).state(proposalId);
      const snapshot = await (merchantDAO as any).proposalSnapshot(proposalId);
      const deadline = await (merchantDAO as any).proposalDeadline(proposalId);

      console.log(chalk.green('✅ Proposal found:'));
      console.log(chalk.white(`   Proposal ID: ${proposalId}`));
      console.log(chalk.white(`   State: ${this.getProposalStateName(state)}`));
      console.log(chalk.white(`   Snapshot Block: ${snapshot.toString()}`));
      console.log(chalk.white(`   Deadline Block: ${deadline.toString()}`));

      // Show voting status if proposal is active
      if (state === 1) { // Active
        const provider = this.contractManager.getProvider();
        if (!provider) {
          throw new Error('No provider available');
        }
        const currentBlock = await provider.getBlockNumber();
        const blocksRemaining = Number(deadline) - currentBlock;
        
        console.log(chalk.blue('\n🗳️  Voting Status:'));
        console.log(chalk.white(`   Current Block: ${currentBlock}`));
        console.log(chalk.white(`   Blocks Remaining: ${blocksRemaining}`));
        
        if (blocksRemaining > 0) {
          console.log(chalk.green('   ✅ Voting is active'));
        } else {
          console.log(chalk.yellow('   ⏰ Voting period ended'));
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ Getting proposal failed:'), (error as Error).message);
      throw error;
    }
  }

  async delegateVotes(options: DAOCommandOptions, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🤝 Delegate Voting Power'));
    console.log(chalk.gray('Delegating governance tokens\n'));

    try {
      // Initialize contract manager
      await this.contractManager.initialize(globalOptions.network, globalOptions.privateKey);

      // Get signer
      const signer = this.contractManager.getSigner();
      if (!signer) {
        throw new Error('No signer available');
      }
      const signerAddress = await signer.getAddress();

      const delegateData = await this.getDelegateData(options, signerAddress);
      
      // Check token balance
      const govToken = await this.contractManager.loadContract('GovToken');
      const balance = await (govToken as any).balanceOf(signerAddress);
      
      if (balance.toString() === '0') {
        throw new Error('You have no governance tokens to delegate');
      }

      console.log(chalk.blue(`Your token balance: ${ethers.formatEther(balance)} tokens`));

      // Delegate tokens
      console.log(chalk.yellow('🤝 Delegating voting power...'));
      const tx = await this.contractManager.executeContractMethod(
        'GovToken',
        'delegate',
        [delegateData.delegatee]
      );

      const receipt = await tx.wait();

      // Get updated voting power
      const newVotingPower = await (govToken as any).getVotes(delegateData.delegatee);

      console.log(chalk.green('\n✅ Delegation successful!'));
      console.log(chalk.white(`   Delegator: ${signerAddress}`));
      console.log(chalk.white(`   Delegatee: ${delegateData.delegatee}`));
      console.log(chalk.white(`   Tokens Delegated: ${ethers.formatEther(balance)} tokens`));
      console.log(chalk.white(`   New Voting Power: ${ethers.formatEther(newVotingPower)} tokens`));
      console.log(chalk.gray(`   Gas used: ${receipt?.gasUsed?.toString() || 'N/A'}`));

    } catch (error) {
      console.error(chalk.red('❌ Delegation failed:'), (error as Error).message);
      throw error;
    }
  }

  // Helper methods for interactive data collection
  private async getProposalData(options: DAOCommandOptions): Promise<ProposalCreationData> {
    const questions = [];

    if (!options.action) {
      questions.push({
        type: 'list',
        name: 'type',
        message: 'Select proposal type:',
        choices: [
          { name: 'Merchant Approval', value: 'merchant-approval' },
          { name: 'Merchant Revocation', value: 'merchant-revocation' },
          { name: 'Chain Configuration', value: 'chain-config' },
          { name: 'Token Support', value: 'token-support' },
          { name: 'Fee Update', value: 'fee-update' },
          { name: 'Emergency Pause', value: 'emergency-pause' }
        ]
      });
    }

    if (!options.description) {
      questions.push({
        type: 'input',
        name: 'description',
        message: 'Enter proposal description:',
        validate: (input: string) => input ? true : 'Description is required'
      });
    }

    const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

    return {
      type: options.action || answers.type,
      description: options.description || answers.description,
      target: options.target,
      data: options.calldata
    };
  }

  private async getVoteData(options: DAOCommandOptions): Promise<VoteData> {
    const questions = [];

    if (!options.proposalId) {
      questions.push({
        type: 'input',
        name: 'proposalId',
        message: 'Enter proposal ID:',
        validate: (input: string) => {
          const num = parseInt(input);
          return num > 0 ? true : 'Proposal ID must be a positive number';
        }
      });
    }

    if (options.vote === undefined) {
      questions.push({
        type: 'list',
        name: 'support',
        message: 'How do you want to vote?',
        choices: [
          { name: 'For (Yes)', value: 1 },
          { name: 'Against (No)', value: 0 },
          { name: 'Abstain', value: 2 }
        ]
      });
    }

    const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

    let support = options.vote !== undefined ? this.parseVoteOption(options.vote) : answers.support;

    return {
      proposalId: options.proposalId || answers.proposalId,
      support: support,
      reason: options.reason
    };
  }

  private async getDelegateData(options: DAOCommandOptions, signerAddress: string): Promise<DelegateData> {
    const questions = [];

    if (!options.to) {
      questions.push({
        type: 'input',
        name: 'delegatee',
        message: 'Enter delegatee address (or press Enter to delegate to yourself):',
        default: signerAddress,
        validate: (input: string) => {
          return ethers.isAddress(input) ? true : 'Invalid address format';
        }
      });
    }

    const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

    return {
      delegatee: options.to || answers.delegatee || signerAddress
    };
  }

  private async getProposalId(): Promise<string> {
    const { proposalId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'proposalId',
        message: 'Enter proposal ID:',
        validate: (input: string) => {
          const num = parseInt(input);
          return num > 0 ? true : 'Proposal ID must be a positive number';
        }
      }
    ]);
    return proposalId;
  }

  private parseVoteOption(vote: string): number {
    switch (vote.toLowerCase()) {
      case 'against':
      case 'no':
      case '0':
        return 0;
      case 'for':
      case 'yes':
      case '1':
        return 1;
      case 'abstain':
      case '2':
        return 2;
      default:
        throw new Error(`Invalid vote option: ${vote}. Use 'for', 'against', or 'abstain'`);
    }
  }

  private getSupportName(support: number): string {
    switch (support) {
      case 0: return 'Against';
      case 1: return 'For';
      case 2: return 'Abstain';
      default: return 'Unknown';
    }
  }

  private getProposalStateName(state: number | bigint): string {
    const stateNum = typeof state === 'bigint' ? Number(state) : state;
    const stateNames: { [key: number]: string } = {
      0: 'Pending',
      1: 'Active',
      2: 'Canceled',
      3: 'Defeated',
      4: 'Succeeded',
      5: 'Queued',
      6: 'Expired',
      7: 'Executed'
    };
    return stateNames[stateNum] || 'Unknown';
  }

  // DAO Governance Methods
  async setStakeOverride(options: any, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n💰 Set Stake Override'));
    console.log(chalk.gray('Setting custom stake amount for region\n'));

    try {
      // Get missing parameters
      if (!options.region) {
        const regionAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'region',
          message: 'Enter region ID:',
          validate: (input) => {
            const num = parseInt(input);
            return !isNaN(num) && num >= 0 ? true : 'Please enter a valid region ID';
          }
        }]);
        options.region = regionAnswer.region;
      }

      if (!options.stake) {
        const stakeAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'stake',
          message: 'Enter stake amount (in ETH):',
          validate: (input) => {
            const num = parseFloat(input);
            return !isNaN(num) && num >= 0 ? true : 'Please enter a valid stake amount';
          }
        }]);
        options.stake = stakeAnswer.stake;
      }

      const regionId = parseInt(options.region);
      const stakeAmount = ethers.parseEther(options.stake);
      const enabled = options.enabled === 'true' || options.enabled === true;

      console.log(chalk.yellow('📝 Setting stake override...'));
      
      const governanceController = await this.contractManager.loadContract('MerchantGovernance');
      const tx = await this.contractManager.executeContractMethod(
        'MerchantGovernance',
        'setDAOStakeOverride',
        [regionId, stakeAmount, enabled]
      );

      console.log(chalk.green('✅ Stake override set successfully!'));
      console.log(chalk.gray(`Transaction hash: ${tx.hash}`));
      console.log(chalk.gray(`Region: ${regionId}, Stake: ${options.stake} ETH, Enabled: ${enabled}`));

    } catch (error: any) {
      console.error(chalk.red('❌ Error setting stake override:'), error.message);
      throw error;
    }
  }

  async setKycBypass(options: any, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🛡️ Set KYC Bypass'));
    console.log(chalk.gray('Setting KYC bypass policy\n'));

    try {
      const enabled = options.enabled === 'true' || options.enabled === true;

      if (options.global !== undefined) {
        console.log(chalk.yellow('📝 Setting global KYC bypass...'));
        
        const tx = await this.contractManager.executeContractMethod(
          'MerchantGovernance',
          'setGlobalKycBypass',
          [enabled]
        );

        console.log(chalk.green('✅ Global KYC bypass set successfully!'));
        console.log(chalk.gray(`Transaction hash: ${tx.hash}`));
        console.log(chalk.gray(`Global KYC bypass: ${enabled}`));

      } else if (options.region) {
        const regionId = parseInt(options.region);
        console.log(chalk.yellow('📝 Setting region KYC bypass...'));
        
        const tx = await this.contractManager.executeContractMethod(
          'MerchantGovernance',
          'setRegionKycBypass',
          [regionId, enabled]
        );

        console.log(chalk.green('✅ Region KYC bypass set successfully!'));
        console.log(chalk.gray(`Transaction hash: ${tx.hash}`));
        console.log(chalk.gray(`Region: ${regionId}, KYC bypass: ${enabled}`));

      } else if (options.address) {
        console.log(chalk.yellow('📝 Setting address KYC bypass...'));
        
        const tx = await this.contractManager.executeContractMethod(
          'MerchantGovernance',
          'setAddressKycBypass',
          [options.address, enabled]
        );

        console.log(chalk.green('✅ Address KYC bypass set successfully!'));
        console.log(chalk.gray(`Transaction hash: ${tx.hash}`));
        console.log(chalk.gray(`Address: ${options.address}, KYC bypass: ${enabled}`));

      } else {
        // Interactive prompt to choose type
        const typeAnswer = await inquirer.prompt([{
          type: 'list',
          name: 'type',
          message: 'Select KYC bypass type:',
          choices: [
            { name: 'Global (affects all regions)', value: 'global' },
            { name: 'Region-specific', value: 'region' },
            { name: 'Address-specific', value: 'address' }
          ]
        }]);

        if (typeAnswer.type === 'global') {
          const tx = await this.contractManager.executeContractMethod(
            'MerchantGovernance',
            'setGlobalKycBypass',
            [enabled]
          );
          console.log(chalk.green('✅ Global KYC bypass set successfully!'));
        } else if (typeAnswer.type === 'region') {
          const regionAnswer = await inquirer.prompt([{
            type: 'input',
            name: 'region',
            message: 'Enter region ID:',
            validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a valid region ID'
          }]);
          
          const tx = await this.contractManager.executeContractMethod(
            'MerchantGovernance',
            'setRegionKycBypass',
            [parseInt(regionAnswer.region), enabled]
          );
          console.log(chalk.green('✅ Region KYC bypass set successfully!'));
        } else {
          const addressAnswer = await inquirer.prompt([{
            type: 'input',
            name: 'address',
            message: 'Enter address:',
            validate: (input) => ethers.isAddress(input) ? true : 'Please enter a valid address'
          }]);
          
          const tx = await this.contractManager.executeContractMethod(
            'MerchantGovernance',
            'setAddressKycBypass',
            [addressAnswer.address, enabled]
          );
          console.log(chalk.green('✅ Address KYC bypass set successfully!'));
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Error setting KYC bypass:'), error.message);
      throw error;
    }
  }

  async addCustomRegion(options: any, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🌍 Add Custom Region'));
    console.log(chalk.gray('Adding new custom region\n'));

    try {
      // Get missing parameters
      if (!options.id) {
        const idAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'id',
          message: 'Enter region ID (must be >= 100):',
          validate: (input) => {
            const num = parseInt(input);
            return !isNaN(num) && num >= 100 ? true : 'Please enter a valid region ID (>= 100)';
          }
        }]);
        options.id = idAnswer.id;
      }

      if (!options.name) {
        const nameAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'name',
          message: 'Enter region name:',
          validate: (input) => input.trim().length > 0 ? true : 'Please enter a region name'
        }]);
        options.name = nameAnswer.name;
      }

      if (!options.stake) {
        const stakeAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'stake',
          message: 'Enter stake amount (in ETH):',
          validate: (input) => {
            const num = parseFloat(input);
            return !isNaN(num) && num >= 0 ? true : 'Please enter a valid stake amount';
          }
        }]);
        options.stake = stakeAnswer.stake;
      }

      const regionId = parseInt(options.id);
      const stakeAmount = ethers.parseEther(options.stake.toString());
      const maxMerchants = parseInt(options.maxMerchants);
      const active = options.active === 'true' || options.active === true;

      console.log(chalk.yellow('📋 Debug: Parameter values:'));
      console.log(chalk.gray(`  regionId: ${regionId} (${typeof regionId})`));
      console.log(chalk.gray(`  name: "${options.name}" (${typeof options.name})`));
      console.log(chalk.gray(`  stakeAmount: ${stakeAmount.toString()} (${typeof stakeAmount})`));
      console.log(chalk.gray(`  maxMerchants: ${maxMerchants} (${typeof maxMerchants})`));
      console.log(chalk.gray(`  active: ${active} (${typeof active})`));

      console.log(chalk.yellow('📝 Adding custom region...'));
      
      const tx = await this.contractManager.executeContractMethod(
        'MerchantGovernance',
        'addCustomRegion',
        [regionId, options.name, stakeAmount, maxMerchants, active]
      );

      console.log(chalk.green('✅ Custom region added successfully!'));
      console.log(chalk.gray(`Transaction hash: ${tx.hash}`));
      console.log(chalk.gray(`Region ID: ${regionId}, Name: ${options.name}, Stake: ${options.stake} ETH`));

    } catch (error: any) {
      console.error(chalk.red('❌ Error adding custom region:'), error.message);
      throw error;
    }
  }

  async removeCustomRegion(options: any, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🗑️ Remove Custom Region'));
    console.log(chalk.gray('Removing custom region\n'));

    try {
      if (!options.id) {
        const idAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'id',
          message: 'Enter region ID to remove:',
          validate: (input) => {
            const num = parseInt(input);
            return !isNaN(num) && num >= 100 ? true : 'Please enter a valid custom region ID (>= 100)';
          }
        }]);
        options.id = idAnswer.id;
      }

      const regionId = parseInt(options.id);

      console.log(chalk.yellow('📝 Removing custom region...'));
      
      const tx = await this.contractManager.executeContractMethod(
        'MerchantGovernance',
        'removeCustomRegion',
        [regionId]
      );

      console.log(chalk.green('✅ Custom region removed successfully!'));
      console.log(chalk.gray(`Transaction hash: ${tx.hash}`));
      console.log(chalk.gray(`Removed region ID: ${regionId}`));

    } catch (error: any) {
      console.error(chalk.red('❌ Error removing custom region:'), error.message);
      throw error;
    }
  }

  async updateCustomRegion(options: any, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🔄 Update Custom Region'));
    console.log(chalk.gray('Updating custom region configuration\n'));

    try {
      if (!options.id) {
        const idAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'id',
          message: 'Enter region ID to update:',
          validate: (input) => {
            const num = parseInt(input);
            return !isNaN(num) && num >= 100 ? true : 'Please enter a valid custom region ID (>= 100)';
          }
        }]);
        options.id = idAnswer.id;
      }

      const regionId = parseInt(options.id);

      // Get current region info first
      console.log(chalk.yellow('📋 Getting current region info...'));
      const governanceController = await this.contractManager.loadContract('MerchantGovernance');
      if (!governanceController) {
        throw new Error('MerchantGovernance contract not found');
      }
      const currentInfo = await (governanceController as any).getCustomRegionInfo(regionId);

      // Use current values as defaults if not provided
      const name = options.name || currentInfo.name;
      const active = options.active !== undefined ? (options.active === 'true' || options.active === true) : currentInfo.active;
      const maxMerchants = options.maxMerchants ? parseInt(options.maxMerchants) : Number(currentInfo.maxMerchants);

      console.log(chalk.yellow('📝 Updating custom region...'));
      
      const tx = await this.contractManager.executeContractMethod(
        'MerchantGovernance',
        'updateCustomRegionConfig',
        [regionId, name, active, maxMerchants]
      );

      console.log(chalk.green('✅ Custom region updated successfully!'));
      console.log(chalk.gray(`Transaction hash: ${tx.hash}`));
      console.log(chalk.gray(`Region ID: ${regionId}, Name: ${name}, Active: ${active}, Max Merchants: ${maxMerchants}`));

    } catch (error: any) {
      console.error(chalk.red('❌ Error updating custom region:'), error.message);
      throw error;
    }
  }

  async listRegions(options: any, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n📋 List Regions'));
    console.log(chalk.gray('Listing all regions (default and custom)\n'));

    try {
      // Get default regions (hardcoded as they're constants)
      const defaultRegions = [
        { id: 1, name: 'North America', type: 'default' },
        { id: 2, name: 'Europe', type: 'default' },
        { id: 3, name: 'Asia Pacific', type: 'default' },
        { id: 4, name: 'Latin America', type: 'default' },
        { id: 5, name: 'Middle East & Africa', type: 'default' }
      ];

      // Get custom regions
      const governanceController = await this.contractManager.loadContract('MerchantGovernance');
      if (!governanceController) {
        throw new Error('MerchantGovernance contract not found');
      }
      const customRegionIds = await (governanceController as any).getManagedCustomRegions();

      const customRegions = [];
      for (const regionId of customRegionIds) {
        try {
          const regionInfo = await (governanceController as any).getCustomRegionInfo(regionId);
          customRegions.push({
            id: Number(regionId),
            name: regionInfo.name,
            type: 'custom',
            active: regionInfo.active,
            stake: ethers.formatEther(regionInfo.stakeAmount),
            maxMerchants: Number(regionInfo.maxMerchants),
            currentMerchants: Number(regionInfo.currentMerchants)
          });
        } catch (error) {
          console.warn(chalk.yellow(`⚠️ Could not fetch info for region ${regionId}`));
        }
      }

      if (options.format === 'json') {
        console.log(JSON.stringify({ defaultRegions, customRegions }, null, 2));
      } else {
        console.log(chalk.green('📍 Default Regions:'));
        console.table(defaultRegions);

        if (customRegions.length > 0) {
          console.log(chalk.green('\n🌍 Custom Regions:'));
          console.table(customRegions);
        } else {
          console.log(chalk.gray('\n🌍 No custom regions found'));
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Error listing regions:'), error.message);
      throw error;
    }
  }

  async getRegionInfo(options: any, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n📍 Region Information'));
    console.log(chalk.gray('Getting detailed region information\n'));

    try {
      if (!options.region) {
        const regionAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'region',
          message: 'Enter region ID:',
          validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a valid region ID'
        }]);
        options.region = regionAnswer.region;
      }

      const regionId = parseInt(options.region);

      if (regionId >= 100) {
        // Custom region
        const governanceController = await this.contractManager.loadContract('MerchantGovernance');
        if (!governanceController) {
          throw new Error('MerchantGovernance contract not found');
        }
        const regionInfo = await (governanceController as any).getCustomRegionInfo(regionId);

        console.log(chalk.green('🌍 Custom Region Information:'));
        console.log(`ID: ${regionId}`);
        console.log(`Name: ${regionInfo.name}`);
        console.log(`Active: ${regionInfo.active}`);
        console.log(`Stake Amount: ${ethers.formatEther(regionInfo.stakeAmount)} ETH`);
        console.log(`Max Merchants: ${regionInfo.maxMerchants}`);
        console.log(`Current Merchants: ${regionInfo.currentMerchants}`);
      } else {
        // Default region
        const regionNames = ['', 'North America', 'Europe', 'Asia Pacific', 'Latin America', 'Middle East & Africa'];
        
        console.log(chalk.green('📍 Default Region Information:'));
        console.log(`ID: ${regionId}`);
        console.log(`Name: ${regionNames[regionId] || 'Unknown'}`);
        console.log(`Type: Default Region`);
        console.log(`Configurable: No (hardcoded region)`);
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Error getting region info:'), error.message);
      throw error;
    }
  }

  async getMerchantInfo(options: any, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🏪 Merchant Governance Information'));
    console.log(chalk.gray('Getting merchant governance information\n'));

    try {
      if (!options.address) {
        const addressAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'address',
          message: 'Enter merchant address:',
          validate: (input) => ethers.isAddress(input) ? true : 'Please enter a valid address'
        }]);
        options.address = addressAnswer.address;
      }

      if (!options.region) {
        const regionAnswer = await inquirer.prompt([{
          type: 'input',
          name: 'region',
          message: 'Enter region ID:',
          validate: (input) => !isNaN(parseInt(input)) ? true : 'Please enter a valid region ID'
        }]);
        options.region = regionAnswer.region;
      }

      const regionId = parseInt(options.region);

      const governanceController = await this.contractManager.loadContract('MerchantGovernance');
      if (!governanceController) {
        throw new Error('MerchantGovernance contract not found');
      }
      const merchantInfo = await (governanceController as any).getMerchantGovernanceInfo(options.address, regionId);

      console.log(chalk.green('🏪 Merchant Governance Information:'));
      console.log(`Address: ${options.address}`);
      console.log(`Region: ${regionId}`);
      console.log(`Required Stake: ${ethers.formatEther(merchantInfo.requiredStake)} ETH`);
      console.log(`KYC Required: ${merchantInfo.kycRequired}`);
      console.log(`Can Register: ${merchantInfo.canRegister}`);

    } catch (error: any) {
      console.error(chalk.red('❌ Error getting merchant info:'), error.message);
      throw error;
    }
  }

  async getGovernanceStatus(options: any, globalOptions: GlobalOptions): Promise<void> {
    console.log(chalk.blue.bold('\n🎯 DAO Governance Status'));
    console.log(chalk.gray('Getting overall governance status\n'));

    try {
      // Get various governance status info
      const governanceController = await this.contractManager.loadContract('MerchantGovernance');
      if (!governanceController) {
        throw new Error('MerchantGovernance contract not found');
      }
      const globalKycBypass = await (governanceController as any).globalKycBypass();

      const customRegionIds = await (governanceController as any).getManagedCustomRegions();

      const daoGovernance = await (governanceController as any).daoGovernance();

      if (options.format === 'json') {
        const status = {
          globalKycBypass,
          customRegionsCount: customRegionIds.length,
          customRegionIds: customRegionIds.map((id: any) => Number(id)),
          daoGovernance
        };
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log(chalk.green('🎯 Governance Status:'));
        console.log(`DAO Governance Address: ${daoGovernance}`);
        console.log(`Global KYC Bypass: ${globalKycBypass}`);
        console.log(`Custom Regions: ${customRegionIds.length}`);
        
        if (customRegionIds.length > 0) {
          console.log(`Custom Region IDs: ${customRegionIds.map((id: any) => Number(id)).join(', ')}`);
        }
      }

    } catch (error: any) {
      console.error(chalk.red('❌ Error getting governance status:'), error.message);
      throw error;
    }
  }
}

export default DAOCommands;
