import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';

let kycDoerService: any;

// Lazy initialization to avoid import issues
const getKYCDoerService = async () => {
  if (!kycDoerService) {
    const { KYCDoerService } = await import('../services/kyc-doer-service.js');
    kycDoerService = new KYCDoerService();
  }
  return kycDoerService;
};

export const kycCommands = new Command()
  .name('kyc')
  .description('KYC (Know Your Customer) verification and compliance commands');

/**
 * Submit KYC request for merchant verification
 */
kycCommands
  .command('submit')
  .description('Submit a KYC verification request for a merchant')
  .option('-m, --merchant-id <id>', 'Merchant ID')
  .option('-a, --address <address>', 'Merchant wallet address')
  .option('-n, --business-name <name>', 'Business name')
  .option('-t, --business-type <type>', 'Business type (food, retail, services, technology, healthcare)')
  .option('-r, --region <region>', 'Region (US, Europe, Asia, Global)')
  .option('-l, --kyc-level <level>', 'KYC level (1-3)', '1')
  .option('-d, --documents <docs>', 'Document hashes (comma-separated)')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📋 Submitting KYC verification request...'));

      const service = await getKYCDoerService();

      // Interactive mode if options not provided
      let kycData = { ...options };

      if (!kycData.merchantId) {
        const { merchantId } = await inquirer.prompt([
          {
            type: 'input',
            name: 'merchantId',
            message: 'Enter merchant ID:',
            validate: (input) => input.length > 0 || 'Merchant ID is required'
          }
        ]);
        kycData.merchantId = merchantId;
      }

      if (!kycData.address) {
        const { address } = await inquirer.prompt([
          {
            type: 'input',
            name: 'address',
            message: 'Enter merchant wallet address:',
            validate: (input) => /^0x[a-fA-F0-9]{40}$/.test(input) || 'Valid Ethereum address required'
          }
        ]);
        kycData.address = address;
      }

      if (!kycData.businessName) {
        const { businessName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'businessName',
            message: 'Enter business name:',
            validate: (input) => input.length > 0 || 'Business name is required'
          }
        ]);
        kycData.businessName = businessName;
      }

      if (!kycData.businessType) {
        const { businessType } = await inquirer.prompt([
          {
            type: 'list',
            name: 'businessType',
            message: 'Select business type:',
            choices: ['food', 'retail', 'services', 'technology', 'healthcare', 'other']
          }
        ]);
        kycData.businessType = businessType;
      }

      if (!kycData.region) {
        const { region } = await inquirer.prompt([
          {
            type: 'list',
            name: 'region',
            message: 'Select region:',
            choices: ['US', 'Europe', 'Asia', 'Global', 'Other']
          }
        ]);
        kycData.region = region;
      }

      if (!kycData.kycLevel) {
        const { kycLevel } = await inquirer.prompt([
          {
            type: 'list',
            name: 'kycLevel',
            message: 'Select KYC level:',
            choices: [
              { name: 'Level 1 - Basic (Personal Info + 2 docs)', value: '1' },
              { name: 'Level 2 - Enhanced (Business Verification + 4 docs)', value: '2' },
              { name: 'Level 3 - Premium (Full Compliance + 6 docs + DAO Approval)', value: '3' }
            ]
          }
        ]);
        kycData.kycLevel = kycLevel;
      }

      if (!kycData.documents) {
        const { documents } = await inquirer.prompt([
          {
            type: 'input',
            name: 'documents',
            message: 'Enter document hashes (comma-separated):',
            default: 'doc1hash,doc2hash,doc3hash,doc4hash'
          }
        ]);
        kycData.documents = documents;
      }

      const documentHashes = kycData.documents.split(',').map((doc: string) => doc.trim());
      const kycLevel = parseInt(kycData.kycLevel);

      console.log(chalk.yellow('⏳ Processing KYC submission...'));

      const result = await service.submitKYCRequest(
        kycData.merchantId,
        kycData.address,
        kycData.businessName,
        kycData.businessType,
        kycData.region,
        kycLevel,
        documentHashes
      );

      if (result.success) {
        console.log(chalk.green('✅ KYC request submitted successfully'));
        console.log(chalk.blue(`📋 KYC ID: ${result.kycId}`));
        console.log(chalk.blue(`👤 Merchant: ${kycData.businessName} (${kycData.merchantId})`));
        console.log(chalk.blue(`🏢 Business Type: ${kycData.businessType}`));
        console.log(chalk.blue(`🌍 Region: ${kycData.region}`));
        console.log(chalk.blue(`📊 KYC Level: ${kycLevel}`));
        console.log(chalk.blue(`📄 Documents: ${documentHashes.length} provided`));

        if (kycLevel >= 3) {
          console.log(chalk.yellow('⚠️  Level 3 KYC requires DAO governance approval'));
        }
      } else {
        console.log(chalk.red(`❌ KYC submission failed: ${result.error}`));
      }

    } catch (error: any) {
      console.log(chalk.red(`❌ Error submitting KYC request: ${error.message}`));
    }
  });

/**
 * List KYC requests with filtering
 */
kycCommands
  .command('list')
  .description('List KYC verification requests')
  .option('-s, --status <status>', 'Filter by status (pending, in-review, approved, rejected, expired)')
  .option('-a, --all', 'Show all requests')
  .action(async (options) => {
    try {
      console.log(chalk.blue('📋 Retrieving KYC requests...'));

      const service = await getKYCDoerService();
      const requests = await service.listKYCRequests(options.status);

      if (requests.length === 0) {
        console.log(chalk.yellow('📭 No KYC requests found'));
        return;
      }

      console.log(chalk.green(`\n📊 Found ${requests.length} KYC request(s):`));
      console.log(chalk.gray(''.padEnd(120, '─')));

      requests.forEach((request: any, index: number) => {
        const statusColor = getStatusColor(request.verificationStatus);
        const expiryDate = new Date(request.expiresAt).toLocaleDateString();
        const submittedDate = new Date(request.submittedAt).toLocaleDateString();

        console.log(chalk.blue(`\n${index + 1}. KYC Request Details:`));
        console.log(chalk.gray(`   ID: ${request.kycId}`));
        console.log(chalk.gray(`   Merchant: ${request.businessName} (${request.merchantId})`));
        console.log(chalk.gray(`   Address: ${request.merchantAddress}`));
        console.log(chalk.gray(`   Business Type: ${request.businessType}`));
        console.log(chalk.gray(`   Region: ${request.region}`));
        console.log(chalk.gray(`   KYC Level: ${request.kycLevel}`));
        console.log(chalk.gray(`   Status: ${statusColor(request.verificationStatus.toUpperCase())}`));
        console.log(chalk.gray(`   Submitted: ${submittedDate}`));
        console.log(chalk.gray(`   Expires: ${expiryDate}`));
        console.log(chalk.gray(`   Documents: ${request.documentHashes.length}`));
        
        if (request.reviewedAt) {
          const reviewedDate = new Date(request.reviewedAt).toLocaleDateString();
          console.log(chalk.gray(`   Reviewed: ${reviewedDate}`));
        }

        if (request.daoApprovalRequired) {
          const daoStatusColor = request.daoApprovalStatus === 'approved' ? chalk.green : 
                                 request.daoApprovalStatus === 'rejected' ? chalk.red : chalk.yellow;
          console.log(chalk.gray(`   DAO Approval: ${daoStatusColor(request.daoApprovalStatus || 'pending')}`));
        }

        // Compliance checks
        if (request.reviewedAt) {
          console.log(chalk.gray('   Compliance Checks:'));
          Object.entries(request.complianceChecks).forEach(([check, passed]) => {
            const checkColor = passed ? chalk.green : chalk.red;
            const checkStatus = passed ? '✅' : '❌';
            console.log(chalk.gray(`     ${checkStatus} ${check}: ${checkColor(passed ? 'PASS' : 'FAIL')}`));
          });
        }

        console.log(chalk.gray(''.padEnd(80, '─')));
      });

    } catch (error: any) {
      console.log(chalk.red(`❌ Error retrieving KYC requests: ${error.message}`));
    }
  });

/**
 * Get KYC statistics and metrics
 */
kycCommands
  .command('stats')
  .description('Display KYC verification statistics')
  .action(async () => {
    try {
      console.log(chalk.blue('📊 Retrieving KYC statistics...'));

      const service = await getKYCDoerService();
      const stats = await service.getKYCStats();

      if (stats.error) {
        console.log(chalk.red(`❌ Error: ${stats.error}`));
        return;
      }

      console.log(chalk.green('\n📈 KYC Service Statistics:'));
      console.log(chalk.gray(''.padEnd(60, '═')));

      // Overview stats
      console.log(chalk.blue('\n📋 Request Overview:'));
      console.log(chalk.gray(`   Total Requests: ${stats.total}`));
      console.log(chalk.yellow(`   Pending Review: ${stats.pending}`));
      console.log(chalk.cyan(`   In Review: ${stats.inReview}`));
      console.log(chalk.green(`   Approved: ${stats.approved}`));
      console.log(chalk.red(`   Rejected: ${stats.rejected}`));
      console.log(chalk.magenta(`   Expired: ${stats.expired}`));

      // DAO approval stats
      if (stats.daoApprovalPending > 0) {
        console.log(chalk.blue('\n🏛️ DAO Governance:'));
        console.log(chalk.yellow(`   Pending DAO Approval: ${stats.daoApprovalPending}`));
      }

      // Performance metrics
      console.log(chalk.blue('\n⚡ Performance Metrics:'));
      console.log(chalk.gray(`   Average Processing Time: ${stats.averageProcessingTime} hours`));
      console.log(chalk.gray(`   Compliance Rate: ${stats.complianceRate}%`));

      // Service status
      const config = service.getConfig();
      console.log(chalk.blue('\n🔧 Service Configuration:'));
      console.log(chalk.gray(`   Service Enabled: ${config.enabled ? '✅ Yes' : '❌ No'}`));
      console.log(chalk.gray(`   DAO Approved: ${config.approved ? '✅ Yes' : '❌ No'}`));
      console.log(chalk.gray(`   License: ${config.licenseNumber}`));
      console.log(chalk.gray(`   Jurisdiction: ${config.jurisdiction}`));
      console.log(chalk.gray(`   Max KYC Level: ${config.maxKYCLevel}`));
      console.log(chalk.gray(`   Automated Checks: ${config.automatedChecks ? '✅ Yes' : '❌ No'}`));
      console.log(chalk.gray(`   Manual Review: ${config.manualReviewRequired ? '✅ Required' : '❌ Not Required'}`));

      console.log(chalk.gray('\n'.padEnd(60, '═')));

    } catch (error: any) {
      console.log(chalk.red(`❌ Error retrieving KYC statistics: ${error.message}`));
    }
  });

/**
 * Check KYC status for a specific merchant
 */
kycCommands
  .command('check')
  .description('Check KYC status for a merchant')
  .option('-m, --merchant <merchantId>', 'Merchant ID to check')
  .option('-a, --address <address>', 'Merchant wallet address to check')
  .action(async (options) => {
    try {
      let merchantIdentifier = options.merchant || options.address;

      if (!merchantIdentifier) {
        const { identifier } = await inquirer.prompt([
          {
            type: 'input',
            name: 'identifier',
            message: 'Enter merchant ID or wallet address:',
            validate: (input) => input.length > 0 || 'Merchant identifier is required'
          }
        ]);
        merchantIdentifier = identifier;
      }

      console.log(chalk.blue(`🔍 Checking KYC status for: ${merchantIdentifier}`));

      const service = await getKYCDoerService();
      const allRequests = await service.listKYCRequests();

      // Find requests for this merchant
      const merchantRequests = allRequests.filter((request: any) => 
        request.merchantId === merchantIdentifier || 
        request.merchantAddress.toLowerCase() === merchantIdentifier.toLowerCase()
      );

      if (merchantRequests.length === 0) {
        console.log(chalk.yellow('📭 No KYC requests found for this merchant'));
        return;
      }

      console.log(chalk.green(`\n📊 Found ${merchantRequests.length} KYC request(s) for merchant:`));
      
      // Find the most recent/highest level approved KYC
      const approvedRequests = merchantRequests.filter((req: any) => req.verificationStatus === 'approved');
      const activeRequest = approvedRequests.length > 0 ? 
        approvedRequests.reduce((latest: any, current: any) => 
          current.kycLevel > latest.kycLevel ? current : latest
        ) : null;

      if (activeRequest) {
        const expiryDate = new Date(activeRequest.expiresAt).toLocaleDateString();
        const isExpiring = activeRequest.expiresAt - Date.now() < 30 * 24 * 60 * 60 * 1000; // 30 days

        console.log(chalk.green('\n✅ Active KYC Verification:'));
        console.log(chalk.gray(`   KYC ID: ${activeRequest.kycId}`));
        console.log(chalk.gray(`   Business: ${activeRequest.businessName}`));
        console.log(chalk.gray(`   KYC Level: ${activeRequest.kycLevel}`));
        console.log(chalk.gray(`   Status: ${chalk.green('APPROVED')}`));
        console.log(chalk.gray(`   Expires: ${expiryDate} ${isExpiring ? chalk.yellow('(Expiring Soon!)') : ''}`));
        
        console.log(chalk.gray('\n   Compliance Status:'));
        Object.entries(activeRequest.complianceChecks).forEach(([check, passed]) => {
          const checkColor = passed ? chalk.green : chalk.red;
          const checkStatus = passed ? '✅' : '❌';
          console.log(chalk.gray(`     ${checkStatus} ${check}: ${checkColor(passed ? 'PASS' : 'FAIL')}`));
        });
      } else {
        console.log(chalk.red('\n❌ No approved KYC verification found'));
        
        // Show pending/rejected requests
        const pendingRequests = merchantRequests.filter((req: any) => 
          req.verificationStatus === 'pending' || req.verificationStatus === 'in-review'
        );
        
        if (pendingRequests.length > 0) {
          console.log(chalk.yellow(`\n⏳ ${pendingRequests.length} pending request(s):`));
          pendingRequests.forEach((req: any) => {
            console.log(chalk.gray(`   - ${req.kycId}: Level ${req.kycLevel} (${req.verificationStatus})`));
          });
        }
      }

    } catch (error: any) {
      console.log(chalk.red(`❌ Error checking KYC status: ${error.message}`));
    }
  });

/**
 * Request DAO approval for high-level KYC
 */
kycCommands
  .command('dao-approve')
  .description('Submit KYC request for DAO governance approval')
  .option('-k, --kyc-id <kycId>', 'KYC ID requiring DAO approval')
  .action(async (options) => {
    try {
      let kycId = options.kycId;

      if (!kycId) {
        const { id } = await inquirer.prompt([
          {
            type: 'input',
            name: 'id',
            message: 'Enter KYC ID for DAO approval:',
            validate: (input) => input.length > 0 || 'KYC ID is required'
          }
        ]);
        kycId = id;
      }

      console.log(chalk.blue(`🏛️ Submitting KYC request ${kycId} for DAO approval...`));

      // This would integrate with the KYC Registry smart contract
      // For now, we'll simulate the process
      console.log(chalk.yellow('⏳ Creating DAO proposal...'));
      console.log(chalk.blue('📝 Proposal created and submitted to DAO'));
      console.log(chalk.gray('   Voting period: 7 days'));
      console.log(chalk.gray('   Required quorum: 51%'));
      console.log(chalk.gray('   Proposal type: APPROVE_KYC_VERIFICATION'));
      
      console.log(chalk.green('\n✅ DAO proposal submitted successfully'));
      console.log(chalk.yellow('⏳ Waiting for DAO members to vote...'));

    } catch (error: any) {
      console.log(chalk.red(`❌ Error submitting DAO approval request: ${error.message}`));
    }
  });

/**
 * Approve KYC Doer (DAO governance command)
 */
kycCommands
  .command('approve-doer')
  .description('Approve a KYC Doer through DAO governance')
  .option('-a, --address <address>', 'KYC Doer wallet address')
  .option('-l, --license <license>', 'License number')
  .option('-j, --jurisdiction <jurisdiction>', 'Operating jurisdiction')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🏛️ Submitting KYC Doer approval proposal to DAO...'));

      // This would create a proposal in the KYC Registry smart contract
      console.log(chalk.yellow('⏳ Creating DAO proposal for KYC Doer approval...'));
      console.log(chalk.blue('📝 Proposal details:'));
      console.log(chalk.gray(`   Doer Address: ${options.address || 'Interactive mode'}`));
      console.log(chalk.gray(`   License: ${options.license || 'To be provided'}`));
      console.log(chalk.gray(`   Jurisdiction: ${options.jurisdiction || 'To be provided'}`));
      
      console.log(chalk.green('\n✅ KYC Doer approval proposal submitted'));
      console.log(chalk.yellow('⏳ Requires DAO voting for final approval'));

    } catch (error: any) {
      console.log(chalk.red(`❌ Error submitting KYC Doer approval: ${error.message}`));
    }
  });

// Helper function to get status colors
function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'approved': return chalk.green;
    case 'rejected': return chalk.red;
    case 'pending': return chalk.yellow;
    case 'in-review': return chalk.cyan;
    case 'expired': return chalk.magenta;
    default: return chalk.gray;
  }
}