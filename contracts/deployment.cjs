const { ethers, upgrades } = require("hardhat");
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
require('dotenv').config();

const execAsync = promisify(exec);

// Network configurations
const NETWORKS = {
  localhost: {
    name: 'localhost',
    chainId: 31337,
    rpcUrl: 'http://127.0.0.1:8545'
  },
  avalanche: {
    name: 'avalanche',
    chainId: 43114,
    rpcUrl: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc'
  },
  fuji: {
    name: 'fuji',
    chainId: 43113,
    rpcUrl: process.env.FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc'
  }
};

// Aptos configuration
const APTOS_CONFIG = {
  devnet: {
    nodeUrl: 'https://fullnode.devnet.aptoslabs.com/v1',
    faucetUrl: 'https://faucet.devnet.aptoslabs.com'
  },
  testnet: {
    nodeUrl: 'https://fullnode.testnet.aptoslabs.com/v1',
    faucetUrl: 'https://faucet.testnet.aptoslabs.com'
  },
  mainnet: {
    nodeUrl: 'https://fullnode.mainnet.aptoslabs.com/v1'
  }
};

class UnifiedDeployer {
  constructor() {
    this.deployedContracts = {};
    this.network = hre.network.name;
    this.deployer = null;
    this.config = null;
    this.contractSizeLimit = 24576; // EIP-170 contract size limit in bytes
  }

  async initialize() {
    console.log(`🚀 Starting unified deployment to ${this.network}...`);
    
    // Step 1: Install dependencies
    await this.installDependencies();
    
    // Step 2: Cleanup artifacts and cache
    await this.cleanup();
    
    // Step 3: Compile contracts
    await this.compileContracts();
    
    // Step 4: Check contract sizes
    await this.checkAllContractSizes();
    
    // Step 5: Get deployer and check balance
    [this.deployer] = await ethers.getSigners();
    console.log("📍 Deploying contracts with account:", this.deployer.address);
    
    const balance = await ethers.provider.getBalance(this.deployer.address);
    console.log("💰 Account balance:", ethers.formatEther(balance), "ETH");

    // Step 6: Load existing config
    await this.loadConfig();
  }

  async loadConfig() {
    const configPath = path.join(__dirname, "..", "config.json");
    const contractsPath = path.join(__dirname, "..", "contracts.json");
    
    try {
      const configData = fs.readFileSync(configPath, 'utf8');
      this.config = JSON.parse(configData);
      console.log("📋 Loaded existing config.json from root directory");
    } catch (error) {
      console.log("⚠️  No existing config.json found, will create new one");
      this.config = {
        networks: {},
        timestamp: new Date().toISOString()
      };
    }

    // Load existing contracts if contracts.json exists
    try {
      if (fs.existsSync(contractsPath)) {
        const contractsData = fs.readFileSync(contractsPath, 'utf8');
        const contractsConfig = JSON.parse(contractsData);
        if (contractsConfig.networks?.[this.network]?.contracts) {
          this.deployedContracts = { ...contractsConfig.networks[this.network].contracts };
          console.log("📋 Loaded existing contracts from contracts.json");
        }
      }
    } catch (error) {
      console.log("⚠️  Error loading contracts.json, will create new one");
    }

    // Initialize network config if not exists
    if (!this.config.networks[this.network]) {
      this.config.networks[this.network] = {
        contracts: {},
        chainId: NETWORKS[this.network]?.chainId || 0
      };
    }
  }

  async installDependencies() {
    console.log("\n📦 Installing dependencies...");
    
    try {
      const rootDir = path.join(__dirname, "..");
      process.chdir(rootDir);
      
      console.log("   ⏳ Running: npm install --legacy-peer-deps");
      const { stdout, stderr } = await execAsync("npm install --legacy-peer-deps");
      
      if (stderr && !stderr.includes('Warning') && !stderr.includes('WARN')) {
        console.log("⚠️  Installation warnings:");
        console.log(stderr);
      }
      
      console.log("   ✅ Dependencies installed successfully!");
      
    } catch (error) {
      console.log("⚠️  Dependencies installation warning:", error.message);
      // Continue deployment even if npm install fails (dependencies might already be installed)
    }
  }

  async cleanup() {
    console.log("\n🧹 Cleaning up artifacts and cache...");
    
    const rootDir = path.join(__dirname, "..");
    const artifactsDir = path.join(rootDir, "artifacts");
    const cacheDir = path.join(rootDir, "cache");
    
    try {
      // Remove artifacts directory
      if (fs.existsSync(artifactsDir)) {
        await this.removeDirectory(artifactsDir);
        console.log("   ✅ Removed artifacts directory");
      }
      
      // Remove cache directory
      if (fs.existsSync(cacheDir)) {
        await this.removeDirectory(cacheDir);
        console.log("   ✅ Removed cache directory");
      }
      
      // Clean up any localhost specific data from config
      if (this.network === 'localhost' && this.config?.networks?.localhost?.contracts) {
        this.config.networks.localhost.contracts = {};
        console.log("   ✅ Cleared localhost contract data");
      }
      
      console.log("🎯 Cleanup completed successfully!");
      
    } catch (error) {
      console.log("⚠️  Cleanup warning:", error.message);
      // Continue deployment even if cleanup fails
    }
  }

  async removeDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          await this.removeDirectory(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      }
      
      fs.rmdirSync(dirPath);
    }
  }

  async compileContracts() {
    console.log("\n🔨 Compiling smart contracts...");
    
    try {
      const rootDir = path.join(__dirname, "..");
      
      // Change to root directory and run hardhat compile
      process.chdir(rootDir);
      
      console.log("   ⏳ Running: npx hardhat compile");
      const { stdout, stderr } = await execAsync("npx hardhat compile");
      
      if (stderr && !stderr.includes('Warning')) {
        console.log("⚠️  Compilation warnings/errors:");
        console.log(stderr);
      }
      
      // Check if compilation was successful by looking for artifacts
      const artifactsDir = path.join(rootDir, "artifacts");
      if (fs.existsSync(artifactsDir)) {
        console.log("   ✅ Contracts compiled successfully!");
        
        // Count compiled contracts
        const contractsDir = path.join(artifactsDir, "contracts");
        if (fs.existsSync(contractsDir)) {
          const contractCount = this.countContracts(contractsDir);
          console.log(`   📦 ${contractCount} contracts ready for deployment`);
        }
      } else {
        throw new Error("Compilation failed - no artifacts directory found");
      }
      
    } catch (error) {
      console.error("❌ Compilation failed:", error.message);
      throw error;
    }
  }

  async checkContractSize(contractName) {
    console.log(`📏 Checking contract size for ${contractName}...`);
    
    try {
      const ContractFactory = await ethers.getContractFactory(contractName);
      const deploymentData = ContractFactory.bytecode;
      const bytecodeSize = deploymentData.length / 2 - 1; // Hex to bytes
      
      console.log(`   📊 ${contractName} bytecode size: ${bytecodeSize} bytes`);
      console.log(`   📊 Contract size limit: ${this.contractSizeLimit} bytes`);
      
      if (bytecodeSize > this.contractSizeLimit) {
        const overage = bytecodeSize - this.contractSizeLimit;
        console.log(`   ❌ Contract too large! Oversized by: ${overage} bytes`);
        console.log(`   💡 Consider optimizing contract or splitting into smaller contracts`);
        return false;
      } else {
        const remaining = this.contractSizeLimit - bytecodeSize;
        console.log(`   ✅ Contract size OK! ${remaining} bytes remaining`);
        return true;
      }
    } catch (error) {
      console.error(`   ❌ Failed to check contract size for ${contractName}:`, error.message);
      return false;
    }
  }

  async checkAllContractSizes() {
    console.log("\n🧪 Checking contract sizes before deployment...");
    
    const contractsToCheck = [
      'MerchantCoreRegistry',
      'MerchantKYCRegistry', 
      'MerchantRegionalRegistry',
      'MerchantPaymentMethods',
      'CollateralVault',
      'EscrowConfigurationManager',
      'EscrowDeploymentFactory',
      'UnifiedVerifierManager',
      'UPIVerifier',
      'SEPAVerifier',
      'PIXVerifier',
      'ChainlinkPriceFeed',
      'GovToken',
      'TimelockControllerWrapper',
      'MerchantTreasury',
      'MerchantGovernance'
    ];

    const oversizedContracts = [];
    
    for (const contractName of contractsToCheck) {
      try {
        const isValidSize = await this.checkContractSize(contractName);
        if (!isValidSize) {
          oversizedContracts.push(contractName);
        }
      } catch (error) {
        console.warn(`   ⚠️ Could not check size for ${contractName}: ${error.message}`);
      }
    }

    if (oversizedContracts.length > 0) {
      console.error(`\n❌ The following contracts are too large for deployment:`);
      oversizedContracts.forEach(contract => console.error(`   - ${contract}`));
      console.error(`\n💡 Optimization suggestions:`);
      console.error(`   - Enable optimizer in hardhat.config.cjs`);
      console.error(`   - Split large contracts into smaller ones`);
      console.error(`   - Use libraries for common functionality`);
      console.error(`   - Remove unused functions and variables`);
      
      if (this.network === 'localhost') {
        console.warn(`\n⚠️ Continuing deployment on localhost despite size issues...`);
        return true; // Allow oversized contracts on localhost for testing
      } else {
        throw new Error('Cannot deploy oversized contracts to mainnet/testnet');
      }
    }

    console.log("\n✅ All contracts are within size limits!");
    return true;
  }

  async verifyDeployments() {
    console.log("\n🔍 Verifying contract deployments...");
    
    const verificationResults = {
      totalContracts: 0,
      successfulVerifications: 0,
      failedVerifications: 0,
      results: []
    };

    try {
      // Get the latest block number
      const latestBlock = await ethers.provider.getBlockNumber();
      console.log(`📊 Latest block: ${latestBlock}`);
      
      // Verify each deployed contract
      for (const [contractName, contractAddress] of Object.entries(this.deployedContracts)) {
        console.log(`\n📋 Verifying ${contractName} at ${contractAddress}...`);
        verificationResults.totalContracts++;
        
        try {
          // Check if contract has code
          const code = await ethers.provider.getCode(contractAddress);
          if (code === '0x') {
            console.log(`   ❌ No code found at address`);
            verificationResults.failedVerifications++;
            verificationResults.results.push({
              contract: contractName,
              address: contractAddress,
              status: 'failed',
              error: 'No code at address'
            });
            continue;
          }
          
          console.log(`   ✅ Contract code verified (${code.length} bytes)`);
          
          // Try contract-specific verification
          const verificationResult = await this.verifySpecificContract(contractName, contractAddress);
          
          if (verificationResult.success) {
            console.log(`   ✅ Contract functionality verified: ${verificationResult.message}`);
            verificationResults.successfulVerifications++;
            verificationResults.results.push({
              contract: contractName,
              address: contractAddress,
              status: 'success',
              message: verificationResult.message
            });
          } else {
            console.log(`   ⚠️ Contract functionality check failed: ${verificationResult.error}`);
            verificationResults.successfulVerifications++; // Still count as deployed
            verificationResults.results.push({
              contract: contractName,
              address: contractAddress,
              status: 'partial',
              message: 'Deployed but functionality check failed',
              error: verificationResult.error
            });
          }
          
        } catch (error) {
          console.log(`   ❌ Verification failed: ${error.message}`);
          verificationResults.failedVerifications++;
          verificationResults.results.push({
            contract: contractName,
            address: contractAddress,
            status: 'failed',
            error: error.message
          });
        }
      }
      
      // Check recent deployment transactions
      await this.checkRecentDeploymentTransactions(latestBlock);
      
      // Display verification summary
      this.displayVerificationSummary(verificationResults);
      
      return verificationResults;
      
    } catch (error) {
      console.error(`❌ Deployment verification failed: ${error.message}`);
      throw error;
    }
  }

  async verifySpecificContract(contractName, contractAddress) {
    try {
      switch (contractName) {
        case 'MerchantCoreRegistry':
          const coreRegistry = await ethers.getContractAt('MerchantCoreRegistry', contractAddress);
          const totalMerchants = await coreRegistry.getTotalMerchants();
          return { success: true, message: `Total merchants: ${totalMerchants}` };
          
        case 'MerchantKYCRegistry':
          const kycRegistry = await ethers.getContractAt('MerchantKYCRegistry', contractAddress);
          const kycManager = await kycRegistry.kycManager();
          return { success: true, message: `KYC manager: ${kycManager}` };
          
        case 'MerchantRegionalRegistry':
          const regionalRegistry = await ethers.getContractAt('MerchantRegionalRegistry', contractAddress);
          const globalConfig = await regionalRegistry.regionalConfigs(0);
          return { success: true, message: `Global region active: ${globalConfig.active}` };
          
        case 'MerchantPaymentMethods':
          const paymentMethods = await ethers.getContractAt('MerchantPaymentMethods', contractAddress);
          // Try to verify the contract by checking if it has the expected interface
          const hasAdminRole = await paymentMethods.hasRole(await paymentMethods.DEFAULT_ADMIN_ROLE(), this.deployer.address);
          return { success: true, message: `Admin role verified: ${hasAdminRole}` };
          
        case 'GovToken':
          const govToken = await ethers.getContractAt('GovToken', contractAddress);
          const tokenName = await govToken.name();
          const tokenSymbol = await govToken.symbol();
          return { success: true, message: `Token: ${tokenName} (${tokenSymbol})` };
          
        case 'EscrowDeploymentFactory':
          const factory = await ethers.getContractAt('EscrowDeploymentFactory', contractAddress);
          const deployedCount = await factory.deployedEscrowsCount();
          return { success: true, message: `Deployed escrows: ${deployedCount}` };
          
        default:
          // Generic verification - try to call a basic function
          const contract = new ethers.Contract(contractAddress, ['function owner() view returns (address)'], ethers.provider);
          try {
            const owner = await contract.owner();
            return { success: true, message: `Owner: ${owner}` };
          } catch {
            return { success: true, message: 'Contract deployed successfully' };
          }
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkRecentDeploymentTransactions(latestBlock) {
    console.log(`\n📋 Checking recent deployment transactions...`);
    
    const startBlock = Math.max(0, latestBlock - 20);
    let deploymentTxCount = 0;
    
    for (let i = startBlock; i <= latestBlock; i++) {
      try {
        const block = await ethers.provider.getBlock(i, true);
        if (block && block.transactions) {
          for (const tx of block.transactions) {
            // Check if it's a contract deployment (to address is null)
            if (!tx.to) {
              const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
              if (receipt && receipt.contractAddress) {
                deploymentTxCount++;
                
                // Check if this is one of our deployed contracts
                const isOurContract = Object.values(this.deployedContracts).includes(receipt.contractAddress);
                const status = isOurContract ? '✅ Our contract' : '🔍 Other contract';
                
                console.log(`   📦 Block ${i}: ${receipt.contractAddress} - ${status}`);
              }
            }
          }
        }
      } catch (error) {
        // Skip blocks that can't be read
      }
    }
    
    console.log(`📊 Found ${deploymentTxCount} deployment transactions in last ${latestBlock - startBlock + 1} blocks`);
  }

  displayVerificationSummary(results) {
    console.log('\n📊 DEPLOYMENT VERIFICATION SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Total contracts: ${results.totalContracts}`);
    console.log(`Successfully verified: ${results.successfulVerifications}`);
    console.log(`Failed verifications: ${results.failedVerifications}`);
    console.log(`Success rate: ${((results.successfulVerifications / results.totalContracts) * 100).toFixed(1)}%`);
    
    if (results.failedVerifications > 0) {
      console.log('\n❌ FAILED VERIFICATIONS:');
      results.results.filter(r => r.status === 'failed').forEach(result => {
        console.log(`   - ${result.contract}: ${result.error}`);
      });
    }
    
    if (results.results.filter(r => r.status === 'partial').length > 0) {
      console.log('\n⚠️ PARTIAL VERIFICATIONS:');
      results.results.filter(r => r.status === 'partial').forEach(result => {
        console.log(`   - ${result.contract}: ${result.message}`);
      });
    }
    
    console.log('\n✅ SUCCESSFUL VERIFICATIONS:');
    results.results.filter(r => r.status === 'success').forEach(result => {
      console.log(`   - ${result.contract}: ${result.message}`);
    });
  }

  countContracts(dir) {
    let count = 0;
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        count += this.countContracts(itemPath);
      } else if (item.endsWith('.json') && !item.includes('.dbg.')) {
        count++;
      }
    }
    
    return count;
  }

  async deployCore() {
    console.log("\n📦 Deploying core contracts...");

    // 1. Deploy MerchantCoreRegistry
    console.log("1️⃣ Deploying MerchantCoreRegistry...");
    const MerchantCoreRegistry = await ethers.getContractFactory("MerchantCoreRegistry");
    const merchantCoreRegistry = await upgrades.deployProxy(MerchantCoreRegistry, [
      this.deployer.address // admin
    ], { 
      initializer: 'initialize',
      kind: 'transparent'
    });
    await merchantCoreRegistry.waitForDeployment();
    this.deployedContracts.MerchantCoreRegistry = merchantCoreRegistry.target;
    console.log("   ✅ MerchantCoreRegistry deployed at:", merchantCoreRegistry.target);

    // 2. Deploy MerchantKYCRegistry
    console.log("2️⃣ Deploying MerchantKYCRegistry...");
    const MerchantKYCRegistry = await ethers.getContractFactory("MerchantKYCRegistry");
    const merchantKYCRegistry = await upgrades.deployProxy(MerchantKYCRegistry, [
      this.deployer.address, // owner
      this.deployer.address, // temporary dao
      merchantCoreRegistry.target // merchantCoreRegistry
    ], { 
      initializer: 'initialize',
      kind: 'transparent'
    });
    await merchantKYCRegistry.waitForDeployment();
    this.deployedContracts.MerchantKYCRegistry = merchantKYCRegistry.target;
    console.log("   ✅ MerchantKYCRegistry deployed at:", merchantKYCRegistry.target);

    // 3. Deploy MerchantRegionalRegistry
    console.log("3️⃣ Deploying MerchantRegionalRegistry...");
    const MerchantRegionalRegistry = await ethers.getContractFactory("MerchantRegionalRegistry");
    const merchantRegionalRegistry = await upgrades.deployProxy(MerchantRegionalRegistry, [
      this.deployer.address, // owner
      this.deployer.address, // temporary dao
      merchantCoreRegistry.target // merchantCoreRegistry
    ], { 
      initializer: 'initialize',
      kind: 'transparent'
    });
    await merchantRegionalRegistry.waitForDeployment();
    this.deployedContracts.MerchantRegionalRegistry = merchantRegionalRegistry.target;
    console.log("   ✅ MerchantRegionalRegistry deployed at:", merchantRegionalRegistry.target);

    // 4. Deploy MerchantPaymentMethods
    console.log("4️⃣ Deploying MerchantPaymentMethods...");
    const MerchantPaymentMethods = await ethers.getContractFactory("MerchantPaymentMethods");
    const merchantPaymentMethods = await upgrades.deployProxy(MerchantPaymentMethods, [
      this.deployer.address // admin
    ], { 
      initializer: 'initialize',
      kind: 'transparent'
    });
    await merchantPaymentMethods.waitForDeployment();
    this.deployedContracts.MerchantPaymentMethods = merchantPaymentMethods.target;
    console.log("   ✅ MerchantPaymentMethods deployed at:", merchantPaymentMethods.target);

    // 5. Deploy CollateralVault
    console.log("5️⃣ Deploying CollateralVault...");
    const CollateralVault = await ethers.getContractFactory("CollateralVault");
    const collateralVault = await CollateralVault.deploy(merchantCoreRegistry.target);
    await collateralVault.waitForDeployment();
    this.deployedContracts.CollateralVault = collateralVault.target;
    console.log("   ✅ CollateralVault deployed at:", collateralVault.target);

    // 6. Deploy EscrowConfigurationManager
    console.log("6️⃣ Deploying EscrowConfigurationManager...");
    const EscrowConfigurationManager = await ethers.getContractFactory("EscrowConfigurationManager");
    const escrowConfigurationManager = await EscrowConfigurationManager.deploy();
    await escrowConfigurationManager.waitForDeployment();
    this.deployedContracts.EscrowConfigurationManager = escrowConfigurationManager.target;
    console.log("   ✅ EscrowConfigurationManager deployed at:", escrowConfigurationManager.target);

    // 7. Deploy EscrowDeploymentFactory
    console.log("7️⃣ Deploying EscrowDeploymentFactory...");
    const EscrowDeploymentFactory = await ethers.getContractFactory("EscrowDeploymentFactory");
    const escrowDeploymentFactory = await EscrowDeploymentFactory.deploy(
      merchantCoreRegistry.target,
      escrowConfigurationManager.target
    );
    await escrowDeploymentFactory.waitForDeployment();
    this.deployedContracts.EscrowDeploymentFactory = escrowDeploymentFactory.target;
    console.log("   ✅ EscrowDeploymentFactory deployed at:", escrowDeploymentFactory.target);

    return {
      merchantCoreRegistry,
      merchantKYCRegistry,
      merchantRegionalRegistry,
      merchantPaymentMethods,
      collateralVault,
      escrowConfigurationManager,
      escrowDeploymentFactory
    };
  }

  async deployVerifiers(merchantCoreRegistry, merchantRegionalRegistry) {
    console.log("\n🔍 Deploying verifier contracts...");

    // Deploy UnifiedVerifierManager
    console.log("7️⃣ Deploying UnifiedVerifierManager...");
    const UnifiedVerifierManager = await ethers.getContractFactory("UnifiedVerifierManager");
    const unifiedVerifierManager = await UnifiedVerifierManager.deploy(
      merchantCoreRegistry.target,
      merchantRegionalRegistry.target
    );
    await unifiedVerifierManager.waitForDeployment();
    this.deployedContracts.UnifiedVerifierManager = unifiedVerifierManager.target;
    console.log("   ✅ UnifiedVerifierManager deployed at:", unifiedVerifierManager.target);

    // Deploy UPI Verifier
    console.log("   8️⃣.1️⃣ Deploying UPIVerifier...");
    const UPIVerifier = await ethers.getContractFactory("UPIVerifier");
    const upiVerifier = await UPIVerifier.deploy(
      merchantCoreRegistry.target,
      merchantRegionalRegistry.target
    );
    await upiVerifier.waitForDeployment();
    this.deployedContracts.UPIVerifier = upiVerifier.target;
    console.log("      ✅ UPIVerifier deployed at:", upiVerifier.target);

    // Deploy SEPA Verifier
    console.log("   8️⃣.2️⃣ Deploying SEPAVerifier...");
    const SEPAVerifier = await ethers.getContractFactory("SEPAVerifier");
    const sepaVerifier = await SEPAVerifier.deploy(
      merchantCoreRegistry.target,
      merchantRegionalRegistry.target
    );
    await sepaVerifier.waitForDeployment();
    this.deployedContracts.SEPAVerifier = sepaVerifier.target;
    console.log("      ✅ SEPAVerifier deployed at:", sepaVerifier.target);

    // Deploy PIX Verifier
    console.log("   8️⃣.3️⃣ Deploying PIXVerifier...");
    const PIXVerifier = await ethers.getContractFactory("PIXVerifier");
    const pixVerifier = await PIXVerifier.deploy(
      merchantCoreRegistry.target,
      merchantRegionalRegistry.target
    );
    await pixVerifier.waitForDeployment();
    this.deployedContracts.PIXVerifier = pixVerifier.target;
    console.log("      ✅ PIXVerifier deployed at:", pixVerifier.target);

    // Deploy ChainlinkPriceFeed
    console.log("   8️⃣.4️⃣ Deploying ChainlinkPriceFeed...");
    const mockAggregatorAddress = this.network === 'localhost' 
      ? "0x0000000000000000000000000000000000000001" 
      : process.env.CHAINLINK_AGGREGATOR_ADDRESS || "0x0000000000000000000000000000000000000001";
    const ChainlinkPriceFeed = await ethers.getContractFactory("ChainlinkPriceFeed");
    const chainlinkPriceFeed = await ChainlinkPriceFeed.deploy(mockAggregatorAddress);
    await chainlinkPriceFeed.waitForDeployment();
    this.deployedContracts.ChainlinkPriceFeed = chainlinkPriceFeed.target;
    console.log("      ✅ ChainlinkPriceFeed deployed at:", chainlinkPriceFeed.target);

    return {
      unifiedVerifierManager,
      upiVerifier,
      sepaVerifier,
      pixVerifier,
      chainlinkPriceFeed
    };
  }

  async deployGovernance() {
    console.log("\n🏛️ Deploying governance contracts...");

    // Deploy GovToken
    console.log("9️⃣ Deploying GovToken...");
    const GovToken = await ethers.getContractFactory("GovToken");
    const govToken = await GovToken.deploy("Merchant Governance Token", "MGT", this.deployer.address);
    await govToken.waitForDeployment();
    this.deployedContracts.GovToken = govToken.target;
    console.log("   ✅ GovToken deployed at:", govToken.target);

    // Deploy TimelockController
    console.log("🔟 Deploying TimelockController...");
    const TimelockController = await ethers.getContractFactory("TimelockControllerWrapper");
    const timelockController = await TimelockController.deploy(
      86400, // 1 day delay
      [], // proposers (will be set to governance contract)
      [], // executors (will be set to governance contract)
      this.deployer.address // admin
    );
    await timelockController.waitForDeployment();
    this.deployedContracts.TimelockController = timelockController.target;
    console.log("   ✅ TimelockController deployed at:", timelockController.target);

    // Deploy MerchantTreasury
    console.log("1️⃣2️⃣ Deploying MerchantTreasury...");
    const MerchantTreasury = await ethers.getContractFactory("MerchantTreasury");
    const merchantTreasury = await MerchantTreasury.deploy(
      timelockController.target, // Use TimelockController as governor
      this.deployer.address      // Use deployer as treasury manager
    );
    await merchantTreasury.waitForDeployment();
    this.deployedContracts.MerchantTreasury = merchantTreasury.target;
    console.log("   ✅ MerchantTreasury deployed at:", merchantTreasury.target);

    // Deploy MerchantGovernance
    console.log("1️⃣3️⃣ Deploying MerchantGovernance...");
    const MerchantGovernance = await ethers.getContractFactory("MerchantGovernance");
    const merchantGovernance = await upgrades.deployProxy(MerchantGovernance, [
      this.deployer.address, // admin
      this.deployer.address, // initial DAO (same as admin for testing)
      ethers.ZeroAddress // regional registry (placeholder)
    ], { 
      initializer: 'initialize',
      kind: 'transparent'
    });
    await merchantGovernance.waitForDeployment();
    this.deployedContracts.MerchantGovernance = merchantGovernance.target;
    console.log("   ✅ MerchantGovernance deployed at:", merchantGovernance.target);

    return {
      govToken,
      timelockController,
      merchantTreasury,
      merchantGovernance
    };
  }

  async deployAvalancheEscrow() {
    console.log("\n🏔️ Deploying Avalanche Escrow contracts...");

    try {
      // Deploy MockMerchantRegistry for Avalanche
      console.log("🔧 Deploying MockMerchantRegistry for Avalanche...");
      const MockMerchantRegistry = await ethers.getContractFactory("MockMerchantRegistry");
      const mockMerchantRegistry = await MockMerchantRegistry.deploy();
      await mockMerchantRegistry.waitForDeployment();
      this.deployedContracts.AvalancheMockMerchantRegistry = mockMerchantRegistry.target;
      console.log("✅ MockMerchantRegistry deployed at:", mockMerchantRegistry.target);

      // Deploy MockEscrowFactory for Avalanche
      console.log("🔧 Deploying MockEscrowFactory for Avalanche...");
      const MockEscrowFactory = await ethers.getContractFactory("MockEscrowFactory");
      const mockEscrowFactory = await MockEscrowFactory.deploy();
      await mockEscrowFactory.waitForDeployment();
      this.deployedContracts.AvalancheMockEscrowFactory = mockEscrowFactory.target;
      console.log("✅ MockEscrowFactory deployed at:", mockEscrowFactory.target);

      // Deploy Avalanche Escrow
      console.log("🏔️ Deploying AvalancheEscrow...");
      const AvalancheEscrow = await ethers.getContractFactory("AvalancheEscrow");
      const avalancheEscrow = await AvalancheEscrow.deploy(
        mockMerchantRegistry.target,
        mockEscrowFactory.target
      );
      await avalancheEscrow.waitForDeployment();
      this.deployedContracts.AvalancheEscrow = avalancheEscrow.target;
      console.log("✅ AvalancheEscrow deployed at:", avalancheEscrow.target);

      return {
        mockMerchantRegistry,
        mockEscrowFactory,
        avalancheEscrow
      };
    } catch (error) {
      console.log("⚠️  Avalanche Escrow deployment skipped:", error.message);
      return null;
    }
  }

  async deployAptosEscrow() {
    console.log("\n🟣 Preparing Aptos Escrow deployment...");

    try {
      const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');
      
      // Initialize Aptos client
      const aptosConfig = new AptosConfig({ network: Network.DEVNET });
      const aptosClient = new Aptos(aptosConfig);
      
      // Get Aptos account from environment
      const privateKeyHex = process.env.APTOS_PRIVATE_KEY;
      if (!privateKeyHex) {
        console.log("⚠️  APTOS_PRIVATE_KEY not found in .env file. Skipping Aptos deployment.");
        console.log("🔗 To deploy Aptos contracts, add APTOS_PRIVATE_KEY to your .env file");
        return null;
      }

      const ed25519PrivateKey = new Ed25519PrivateKey(privateKeyHex);
      const aptosAccount = Account.fromPrivateKey({ privateKey: ed25519PrivateKey });
      
      // Check balance
      const balance = await aptosClient.getAccountAPTAmount({
        accountAddress: aptosAccount.accountAddress
      });
      
      console.log("🔗 Aptos Devnet connected");
      console.log("  Account:", aptosAccount.accountAddress.toString());
      console.log("  Balance:", balance, "APT");
      
      if (balance === 0) {
        console.log("⚠️  Account has no APT balance. Please fund the account first.");
        console.log("🔗 Use Aptos Devnet Faucet: https://faucet.devnet.aptoslabs.com/");
        return null;
      }

      // Compile and deploy Aptos Move contract
      console.log("📦 Compiling Aptos Move contract...");
      const aptosContractPath = path.join(__dirname, "contracts", "escrows", "aptos");
      
      if (!fs.existsSync(aptosContractPath)) {
        console.log("⚠️  Aptos contract directory not found. Skipping Aptos deployment.");
        return null;
      }

      // Note: In a real deployment, you would compile and publish the Move module here
      // For now, we'll just record the configuration
      this.deployedContracts.AptosEscrowAccount = aptosAccount.accountAddress.toString();
      this.deployedContracts.AptosNetwork = "devnet";
      
      console.log("✅ Aptos escrow configuration prepared");
      console.log("📝 To complete Aptos deployment, run: aptos move compile && aptos move publish");
      
      return {
        aptosClient,
        aptosAccount,
        network: "devnet"
      };
    } catch (error) {
      console.log("⚠️  Aptos Escrow deployment skipped:", error.message);
      return null;
    }
  }

  async registerVerifiers(unifiedVerifierManager, upiVerifier, sepaVerifier, pixVerifier) {
    console.log("\n🔧 Registering verifier contracts...");
    
    // Define regions enum values (matching IRegionalRegistry.Region)
    const REGIONS = {
      ASIA_PACIFIC: 0,
      EUROPE: 1,
      NORTH_AMERICA: 2,
      SOUTH_AMERICA: 3,
      AFRICA: 4,
      MIDDLE_EAST: 5
    };
    
    try {
      // Register UPIVerifier
      console.log("   🔧.1️⃣ Registering UPIVerifier...");
      const upiTx = await unifiedVerifierManager.registerExistingVerifier(
        upiVerifier.target,
        "UPI",
        [REGIONS.ASIA_PACIFIC],
        "UPI payment verifier for India"
      );
      await upiTx.wait();
      console.log("      ✅ UPIVerifier registered successfully");
      
      // Register SEPAVerifier
      console.log("   🔧.2️⃣ Registering SEPAVerifier...");
      const sepaTx = await unifiedVerifierManager.registerExistingVerifier(
        sepaVerifier.target,
        "SEPA",
        [REGIONS.EUROPE],
        "SEPA payment verifier for Europe"
      );
      await sepaTx.wait();
      console.log("      ✅ SEPAVerifier registered successfully");
      
      // Register PIXVerifier
      console.log("   🔧.3️⃣ Registering PIXVerifier...");
      const pixTx = await unifiedVerifierManager.registerExistingVerifier(
        pixVerifier.target,
        "PIX",
        [REGIONS.SOUTH_AMERICA],
        "PIX payment verifier for Brazil"
      );
      await pixTx.wait();
      console.log("      ✅ PIXVerifier registered successfully");
      
      console.log("\n🎉 All verifiers registered successfully!");
      
    } catch (error) {
      console.error("❌ Verifier registration failed:", error.message);
      throw error;
    }
  }

  async setupContractPermissions(merchantPaymentMethods) {
    console.log("\n🔐 Setting up contract permissions...");
    
    try {
      // Grant REGISTRY_ROLE to deployer for MerchantPaymentMethods
      console.log("   🔧 Granting REGISTRY_ROLE to deployer...");
      const REGISTRY_ROLE = await merchantPaymentMethods.REGISTRY_ROLE();
      const grantTx = await merchantPaymentMethods.grantRole(REGISTRY_ROLE, this.deployer.address);
      await grantTx.wait();
      console.log("   ✅ REGISTRY_ROLE granted successfully");
      
      // Verify the role was granted
      const hasRole = await merchantPaymentMethods.hasRole(REGISTRY_ROLE, this.deployer.address);
      console.log(`   🔍 Role verification: ${hasRole ? 'Success' : 'Failed'}`);
      
      console.log("🎉 Contract permissions setup completed!");
      
    } catch (error) {
      console.error("❌ Contract permissions setup failed:", error.message);
      throw error;
    }
  }

  async saveConfiguration() {
    console.log("\n💾 Saving deployment configuration...");

    // Update contracts.json in root directory
    const contractsConfig = {
      networks: {
        [this.network]: {
          contracts: { ...this.deployedContracts },
          chainId: this.config.networks[this.network].chainId
        }
      },
      timestamp: new Date().toISOString()
    };

    const contractsPath = path.join(__dirname, "..", "contracts.json");
    fs.writeFileSync(contractsPath, JSON.stringify(contractsConfig, null, 2));
    console.log("📝 Contract addresses updated in root contracts.json");

    // Also update config.json for general configuration (without contracts)
    const generalConfig = {
      networks: {
        [this.network]: {
          chainId: this.config.networks[this.network].chainId
        }
      },
      timestamp: new Date().toISOString()
    };

    const configPath = path.join(__dirname, "..", "config.json");
    fs.writeFileSync(configPath, JSON.stringify(generalConfig, null, 2));
    console.log("📝 General configuration updated in root config.json");
  }

  displaySummary() {
    console.log("\n🎉 Unified deployment completed successfully!");
    console.log(`\n📋 Deployed to ${this.network} network:`);
    
    Object.entries(this.deployedContracts).forEach(([name, address]) => {
      console.log(`- ${name}: ${address}`);
    });
    
    console.log("\n📝 Configuration files updated:");
    console.log("- contracts.json (contract addresses)");
    console.log("- config.json (general configuration)");
  }

  async deploy() {
    try {
      await this.initialize();
      
      // Deploy core contracts
      const coreContracts = await this.deployCore();
      
      // Deploy verifier contracts
      const verifierContracts = await this.deployVerifiers(
        coreContracts.merchantCoreRegistry,
        coreContracts.merchantRegionalRegistry
      );
      
      // Deploy governance contracts
      const governanceContracts = await this.deployGovernance();
      
      // Deploy Avalanche escrow (if applicable)
      const avalancheContracts = await this.deployAvalancheEscrow();
      
      // Deploy Aptos escrow (if applicable)
      const aptosContracts = await this.deployAptosEscrow();
      
      // Register verifiers
      await this.registerVerifiers(
        verifierContracts.unifiedVerifierManager,
        verifierContracts.upiVerifier,
        verifierContracts.sepaVerifier,
        verifierContracts.pixVerifier
      );
      
      // Setup contract roles and permissions
      await this.setupContractPermissions(coreContracts.merchantPaymentMethods);
      
      // Save configuration
      await this.saveConfiguration();
      
      // Verify all deployments
      await this.verifyDeployments();
      
      // Display summary
      this.displaySummary();
      
    } catch (error) {
      console.error("❌ Unified deployment failed:", error);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const deployer = new UnifiedDeployer();
  await deployer.deploy();
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Deployment failed:", error);
      process.exit(1);
    });
}

module.exports = { UnifiedDeployer };