import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import hre from 'hardhat';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables from root .env file (two levels up from utils)
config({ path: '../../.env' });

/**
 * Auto-deploy MerchantGovernanceController and update configurations
 * This ensures the contract is always available for CLI operations
 */
export async function ensureGovernanceControllerDeployment(): Promise<{
    address: string;
    admin: string;
    dao: string;
}> {
    console.log('\n🔍 Checking MerchantGovernanceController deployment...');
    
    try {
        // Get network from environment
        const network = process.env.NETWORK || 'localhost';
        
        // Ensure we're using the correct network from environment
        console.log(`Using network: ${network}`);
        
        const signers = await hre.ethers.getSigners();
        const deployer = signers[0];
        const dao = signers[1] || signers[0]; // Use first signer as DAO if only one available
        
        // Check if contract is already deployed and working
        const configPath = path.join(process.cwd(), 'config.json');
        let existingAddress: string | null = null;
        
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            existingAddress = config?.networks?.[network]?.contracts?.MerchantGovernanceController;
        }
        
        // Test if existing contract works
        if (existingAddress) {
            try {
                // Use the same provider that CLI will use from environment
                const provider = new hre.ethers.JsonRpcProvider(process.env.RPC_URL || 'http://localhost:8545');
                const code = await provider.getCode(existingAddress);
                
                if (code !== '0x') {
                    console.log(`✅ MerchantGovernanceController already deployed at: ${existingAddress}`);
                    return {
                        address: existingAddress,
                        admin: deployer.address,
                        dao: dao.address
                    };
                }
            } catch (error) {
                console.log('🔄 Existing contract not accessible, redeploying...');
            }
        }
        
        // Deploy new contract
        console.log('🚀 Deploying MerchantGovernanceController...');
        console.log('Deployer:', deployer.address);
        console.log('DAO Address:', dao.address);
        
        const GovernanceController = await hre.ethers.getContractFactory('MerchantGovernanceController');
        const governanceController = await GovernanceController.deploy();
        await governanceController.waitForDeployment();
        
        const controllerAddress = await governanceController.getAddress();
        console.log('✅ MerchantGovernanceController deployed to:', controllerAddress);
        
        // Initialize the contract
        console.log('🔧 Initializing contract...');
        await governanceController.initialize(
            deployer.address,     // admin
            dao.address,         // DAO
            hre.ethers.ZeroAddress   // regional registry (can be updated later)
        );
        console.log('✅ Contract initialized');
        
        // Update config.json
        await updateConfigJson(controllerAddress);
        
        // Update contracts.json with new governance contract
        await updateContractsJson(controllerAddress);
        
        // Test basic functionality
        console.log('🧪 Testing basic functions...');
        const daoController = governanceController.connect(dao);
        
        try {
            // Test a simple read operation
            const globalKyc = await daoController.globalKycBypass();
            console.log('✅ Contract is functional (globalKycBypass:', globalKyc, ')');
        } catch (error) {
            console.warn('⚠️ Contract deployed but test failed:', (error as Error).message);
        }
        
        console.log('🎉 MerchantGovernanceController setup complete!');
        
        return {
            address: controllerAddress,
            admin: deployer.address,
            dao: dao.address
        };
        
    } catch (error) {
        console.error('❌ Failed to setup MerchantGovernanceController:', (error as Error).message);
        throw error;
    }
}

/**
 * Update config.json with the new contract address
 */
async function updateConfigJson(contractAddress: string): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.json');
    const network = process.env.NETWORK || 'localhost';
    
    let config: any = {
        networks: {
            [network]: { contracts: {} }
        }
    };
    
    // Load existing config if it exists
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    
    // Ensure structure exists
    if (!config.networks) config.networks = {};
    if (!config.networks[network]) config.networks[network] = { contracts: {} };
    if (!config.networks[network].contracts) config.networks[network].contracts = {};
    
    // Add contract to current network
    config.networks[network].contracts.MerchantGovernanceController = contractAddress;
    
    // Update timestamp
    config.timestamp = new Date().toISOString();
    
    // Write back to file
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('✅ Updated config.json');
}

/**
 * Update contracts.json with the new contract address
 */
async function updateContractsJson(contractAddress: string): Promise<void> {
    const contractsPath = path.join(process.cwd(), 'contracts.json');
    const network = process.env.NETWORK || 'localhost';
    
    // Get chainId for the network (default to 31337 for localhost)
    const chainId = network === 'localhost' ? 31337 : 1; // Add more networks as needed
    
    let contractsData: any = {
        networks: {
            [envConfig.network]: {
                contracts: {},
                chainId: chainId
            }
        },
        timestamp: new Date().toISOString()
    };
    
    // Load existing contracts if file exists
    if (fs.existsSync(contractsPath)) {
        contractsData = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
    }
    
    // Ensure network structure exists
    if (!contractsData.networks) contractsData.networks = {};
    if (!contractsData.networks[network]) contractsData.networks[network] = { contracts: {}, chainId: chainId };
    if (!contractsData.networks[network].contracts) contractsData.networks[network].contracts = {};
    
    // Add MerchantGovernanceController to contracts
    contractsData.networks[network].contracts.MerchantGovernanceController = contractAddress;
    contractsData.timestamp = new Date().toISOString();
    
    fs.writeFileSync(contractsPath, JSON.stringify(contractsData, null, 2));
    console.log('✅ Updated contracts.json');
}

// Auto-run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    ensureGovernanceControllerDeployment()
        .then(() => {
            console.log('✅ Setup completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Setup failed:', error);
            process.exit(1);
        });
}
