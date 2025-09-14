const { ethers, network } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * Comprehensive DAO Testing Script
 * Tests all DAO administrative functions after granting proper permissions
 */
class DAOTester {
    constructor() {
        this.config = null;
        this.signer = null;
        this.contracts = {};
        this.testResults = [];
    }

    async initialize() {
        console.log("🧪 Initializing DAO Comprehensive Tester...");
        
        // Load config
        const contractsPath = path.join(__dirname, '..', 'contracts.json');
        if (!fs.existsSync(contractsPath)) {
            throw new Error('Contracts file not found');
        }
        
        this.config = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
        
        // Get signer
        const [deployer] = await ethers.getSigners();
        this.signer = deployer;
        
        console.log(`✓ Network: ${network.name}`);
        console.log(`✓ Signer: ${this.signer.address}`);
        console.log(`✓ Balance: ${ethers.formatEther(await this.signer.provider.getBalance(this.signer.address))} ETH`);
    }

    async loadContracts() {
        console.log("\n📋 Loading contracts...");
        
        const networkConfig = this.config.networks[network.name];
        if (!networkConfig) {
            throw new Error(`Network ${network.name} not found in config`);
        }

        // Load MerchantGovernance contract
        const governanceAddress = networkConfig.contracts.MerchantGovernance;
        if (!governanceAddress) {
            throw new Error('MerchantGovernance contract address not found');
        }

        const MerchantGovernance = await ethers.getContractFactory("MerchantGovernance");
        this.contracts.merchantGovernance = MerchantGovernance.attach(governanceAddress);
        
        console.log(`✓ MerchantGovernance loaded at: ${governanceAddress}`);
    }

    async ensureDAOPermissions() {
        console.log("\n🔐 Ensuring DAO permissions...");
        
        const daoRole = await this.contracts.merchantGovernance.DAO_ROLE();
        const hasDaoRole = await this.contracts.merchantGovernance.hasRole(daoRole, this.signer.address);
        
        if (!hasDaoRole) {
            console.log("⚠️ Current signer doesn't have DAO_ROLE. Attempting to grant...");
            
            const adminRole = await this.contracts.merchantGovernance.DEFAULT_ADMIN_ROLE();
            const hasAdminRole = await this.contracts.merchantGovernance.hasRole(adminRole, this.signer.address);
            
            if (!hasAdminRole) {
                throw new Error('Cannot grant DAO_ROLE: signer lacks ADMIN_ROLE');
            }
            
            const tx = await this.contracts.merchantGovernance.grantRole(daoRole, this.signer.address);
            await tx.wait();
            console.log("✅ DAO_ROLE granted successfully!");
        } else {
            console.log("✅ Signer already has DAO_ROLE");
        }
    }

    async testStakeManagement() {
        console.log("\n💰 Testing Stake Management...");
        
        try {
            // Test setting stake override
            console.log("  📝 Testing setDAOStakeOverride...");
            const regionId = 1; // North America
            const newStake = ethers.parseEther("3.5");
            
            const tx1 = await this.contracts.merchantGovernance.setDAOStakeOverride(regionId, newStake, true);
            await tx1.wait();
            
            // Verify the override
            const overrideEnabled = await this.contracts.merchantGovernance.daoStakeOverrideEnabled(regionId);
            const overrideAmount = await this.contracts.merchantGovernance.daoStakeOverrides(regionId);
            
            console.log(`    ✅ Stake override set: ${ethers.formatEther(overrideAmount)} ETH, enabled: ${overrideEnabled}`);
            
            // Test getting effective stake
            const effectiveStake = await this.contracts.merchantGovernance.getEffectiveStakeAmount(regionId);
            console.log(`    ✅ Effective stake amount: ${ethers.formatEther(effectiveStake)} ETH`);
            
            this.testResults.push({ test: 'Stake Management', status: 'PASS', details: 'setDAOStakeOverride and getEffectiveStakeAmount work' });
            
        } catch (error) {
            console.error(`    ❌ Stake management test failed: ${error.message}`);
            this.testResults.push({ test: 'Stake Management', status: 'FAIL', details: error.message });
        }
    }

    async testKYCBypass() {
        console.log("\n🛡️ Testing KYC Bypass...");
        
        try {
            // Test global KYC bypass
            console.log("  📝 Testing global KYC bypass...");
            const tx1 = await this.contracts.merchantGovernance.setGlobalKycBypass(true);
            await tx1.wait();
            
            const globalBypass = await this.contracts.merchantGovernance.shouldBypassKyc(this.signer.address, 0);
            console.log(`    ✅ Global KYC bypass enabled: ${globalBypass}`);
            
            // Test region-specific KYC bypass
            console.log("  📝 Testing region-specific KYC bypass...");
            const regionId = 1;
            const tx2 = await this.contracts.merchantGovernance.setRegionKycBypass(regionId, true);
            await tx2.wait();
            
            const regionBypass = await this.contracts.merchantGovernance.shouldBypassKyc(this.signer.address, regionId);
            console.log(`    ✅ Region KYC bypass enabled: ${regionBypass}`);
            
            // Test address-specific KYC bypass
            console.log("  📝 Testing address-specific KYC bypass...");
            const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Second hardhat account
            const tx3 = await this.contracts.merchantGovernance.setAddressKycBypass(testAddress, true);
            await tx3.wait();
            
            const addressBypass = await this.contracts.merchantGovernance.shouldBypassKyc(testAddress, regionId);
            console.log(`    ✅ Address KYC bypass enabled: ${addressBypass}`);
            
            // Reset to false for cleanup
            await this.contracts.merchantGovernance.setGlobalKycBypass(false);
            await this.contracts.merchantGovernance.setRegionKycBypass(regionId, false);
            await this.contracts.merchantGovernance.setAddressKycBypass(testAddress, false);
            
            this.testResults.push({ test: 'KYC Bypass', status: 'PASS', details: 'Global, region, and address KYC bypass work' });
            
        } catch (error) {
            console.error(`    ❌ KYC bypass test failed: ${error.message}`);
            this.testResults.push({ test: 'KYC Bypass', status: 'FAIL', details: error.message });
        }
    }

    async testRegionManagement() {
        console.log("\n🌍 Testing Region Management...");
        
        try {
            // Test adding custom region
            console.log("  📝 Testing addCustomRegion...");
            const customRegionId = 100;
            const regionName = "Test Region";
            const stakeAmount = ethers.parseEther("2.0");
            const maxMerchants = 1000;
            
            const tx1 = await this.contracts.merchantGovernance.addCustomRegion(
                customRegionId, 
                regionName, 
                stakeAmount, 
                maxMerchants, 
                true
            );
            await tx1.wait();
            
            // Verify the region
            const regionInfo = await this.contracts.merchantGovernance.getCustomRegionInfo(customRegionId);
            console.log(`    ✅ Custom region added: ${regionInfo.name}, stake: ${ethers.formatEther(regionInfo.stakeAmount)} ETH`);
            
            // Test updating region
            console.log("  📝 Testing updateCustomRegionConfig...");
            const newName = "Updated Test Region";
            const tx2 = await this.contracts.merchantGovernance.updateCustomRegionConfig(
                customRegionId,
                newName,
                true,
                2000
            );
            await tx2.wait();
            
            const updatedInfo = await this.contracts.merchantGovernance.getCustomRegionInfo(customRegionId);
            console.log(`    ✅ Region updated: ${updatedInfo.name}, maxMerchants: ${updatedInfo.maxMerchants}`);
            
            // Test removing region
            console.log("  📝 Testing removeCustomRegion...");
            const tx3 = await this.contracts.merchantGovernance.removeCustomRegion(customRegionId);
            await tx3.wait();
            
            const isAvailable = await this.contracts.merchantGovernance.isCustomRegionAvailable(customRegionId);
            console.log(`    ✅ Region removed, available: ${isAvailable}`);
            
            this.testResults.push({ test: 'Region Management', status: 'PASS', details: 'Add, update, and remove custom regions work' });
            
        } catch (error) {
            console.error(`    ❌ Region management test failed: ${error.message}`);
            this.testResults.push({ test: 'Region Management', status: 'FAIL', details: error.message });
        }
    }

    async testGovernanceInfo() {
        console.log("\n📊 Testing Governance Information...");
        
        try {
            // Test merchant governance info
            console.log("  📝 Testing getMerchantGovernanceInfo...");
            const merchantInfo = await this.contracts.merchantGovernance.getMerchantGovernanceInfo(this.signer.address, 1);
            console.log(`    ✅ Merchant info - Required stake: ${ethers.formatEther(merchantInfo[0])} ETH, KYC required: ${merchantInfo[1]}, Can register: ${merchantInfo[2]}`);
            
            // Test DAO overrides summary
            console.log("  📝 Testing getDAOOverridesSummary...");
            const overrides = await this.contracts.merchantGovernance.getDAOOverridesSummary();
            console.log(`    ✅ DAO overrides - Global KYC: ${overrides[0]}, Custom regions: ${overrides[1]}`);
            
            this.testResults.push({ test: 'Governance Info', status: 'PASS', details: 'Governance information queries work' });
            
        } catch (error) {
            console.error(`    ❌ Governance info test failed: ${error.message}`);
            this.testResults.push({ test: 'Governance Info', status: 'FAIL', details: error.message });
        }
    }

    async generateReport() {
        console.log("\n📋 TEST REPORT");
        console.log("=" .repeat(50));
        
        let passCount = 0;
        let failCount = 0;
        
        this.testResults.forEach((result, index) => {
            const statusIcon = result.status === 'PASS' ? '✅' : '❌';
            console.log(`${index + 1}. ${statusIcon} ${result.test}: ${result.status}`);
            if (result.status === 'FAIL') {
                console.log(`   Details: ${result.details}`);
                failCount++;
            } else {
                passCount++;
            }
        });
        
        console.log("\n" + "=" .repeat(50));
        console.log(`📊 Results: ${passCount} passed, ${failCount} failed`);
        
        if (failCount === 0) {
            console.log("🎉 All DAO governance functions are working correctly!");
        } else {
            console.log("⚠️ Some DAO functions need attention.");
        }
    }
}

async function main() {
    console.log("🚀 Starting Comprehensive DAO Testing...\n");
    
    const tester = new DAOTester();
    
    try {
        await tester.initialize();
        await tester.loadContracts();
        await tester.ensureDAOPermissions();
        
        // Run all tests
        await tester.testStakeManagement();
        await tester.testKYCBypass();
        await tester.testRegionManagement();
        await tester.testGovernanceInfo();
        
        // Generate report
        await tester.generateReport();
        
        console.log("\n🎯 DAO Testing completed! You can now use all DAO commands in the CLI.");
        
    } catch (error) {
        console.error(`\n❌ DAO Testing failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { DAOTester };
