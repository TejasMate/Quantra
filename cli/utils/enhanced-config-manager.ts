import path from 'path';
import fs from 'fs';
import os from 'os';

interface NetworkConfig {
    name: string;
    chainId: number;
    url: string;
    contracts?: Record<string, string>;
}

interface FeatureConfig {
    [key: string]: boolean;
}

interface CLIConfiguration {
    networks?: Record<string, NetworkConfig>;
    features?: FeatureConfig;
    monitoring?: Record<string, any>;
    [key: string]: any;
}

interface ConfigOptions {
    validateOnLoad?: boolean;
    autoSave?: boolean;
    configDir?: string;
}

interface SystemStatus {
    initialized: boolean;
    environment: string;
    configuration: {
        valid: boolean;
        networksCount: number;
    };
    networks: Record<string, NetworkConfig>;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

/**
 * TypeScript Enhanced Config Manager
 * Provides type-safe configuration management for the CLI
 */
export class TypeSafeEnhancedConfigManager {
    private config: CLIConfiguration;
    private options: ConfigOptions;
    private configPath: string;
    private currentEnvironment: string;
    private initialized: boolean;

    constructor(options: ConfigOptions = {}) {
        this.config = { networks: {}, features: {} };
        this.options = {
            validateOnLoad: true,
            autoSave: false,
            configDir: path.join(os.homedir(), '.quantra-cli'),
            ...options
        };
        this.configPath = path.join(this.options.configDir!, 'config.json');
        this.currentEnvironment = 'development';
        this.initialized = false;
    }

    /**
     * Initialize the configuration manager
     * @param environment - Environment to initialize for
     */
    async initialize(environment: string = 'development'): Promise<void> {
        if (this.initialized) return;

        try {
            this.currentEnvironment = environment;
            await this.loadConfiguration();
            
            if (this.options.validateOnLoad) {
                const validation = this.validateConfiguration();
                if (!validation.isValid) {
                    console.warn('⚠ Configuration validation warnings:', validation.errors);
                }
            }

            this.initialized = true;
            console.log(`✓ Enhanced Config Manager initialized for ${environment}`);
        } catch (error) {
            console.error('❌ Failed to initialize config manager:', (error as Error).message);
            throw error;
        }
    }

    /**
     * Load configuration from file
     */
    async loadConfiguration(): Promise<CLIConfiguration> {
        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                this.config = JSON.parse(configData);
                console.log('✓ Configuration loaded from file');
            } else {
                console.log('ℹ No existing configuration found, using defaults');
                this.config = { networks: {}, features: {} };
            }
            return this.config;
        } catch (error) {
            console.error('❌ Failed to load configuration:', (error as Error).message);
            this.config = { networks: {}, features: {} };
            return this.config;
        }
    }

    /**
     * Save configuration to file
     */
    async saveConfiguration(): Promise<void> {
        try {
            // Ensure config directory exists
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('✓ Configuration saved to file');
        } catch (error) {
            throw new Error(`Failed to save configuration: ${(error as Error).message}`);
        }
    }

    /**
     * Get complete configuration
     */
    getConfig(): CLIConfiguration {
        if (!this.initialized) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }
        return this.config;
    }

    /**
     * Get network configuration
     * @param networkName - Network name
     */
    getNetworkConfig(networkName: string): NetworkConfig | null {
        if (!this.initialized) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }
        return this.config.networks?.[networkName] || null;
    }

    /**
     * Set network configuration
     * @param networkName - Network name
     * @param networkConfig - Network configuration
     */
    setNetworkConfig(networkName: string, networkConfig: NetworkConfig): void {
        if (!this.config.networks) {
            this.config.networks = {};
        }
        this.config.networks[networkName] = networkConfig;
        
        if (this.options.autoSave) {
            this.saveConfiguration();
        }
    }

    /**
     * Get contract address
     * @param contractName - Contract name
     * @param networkName - Network name
     */
    getContractAddress(contractName: string, networkName: string): string | null {
        // First try to get from CLI config
        const network = this.getNetworkConfig(networkName);
        let address = network?.contracts?.[contractName] || null;
        
        // If not found, try to load from root contracts.json (deployment file)
        if (!address) {
            try {
                const contractsPath = path.join(process.cwd(), '../contracts.json');
                if (fs.existsSync(contractsPath)) {
                    const contractsConfig = JSON.parse(fs.readFileSync(contractsPath, 'utf8'));
                    address = contractsConfig?.networks?.[networkName]?.contracts?.[contractName] || null;
                }
            } catch (error) {
                // Silently fail, will return null
            }
        }
        
        return address;
    }

    /**
     * Set contract address
     * @param contractName - Contract name
     * @param address - Contract address
     * @param networkName - Network name
     */
    setContractAddress(contractName: string, address: string, networkName: string): void {
        if (!this.config.networks) {
            this.config.networks = {};
        }
        
        if (!this.config.networks[networkName]) {
            this.config.networks[networkName] = {
                name: networkName,
                chainId: 1,
                url: '',
                contracts: {}
            };
        }
        
        if (!this.config.networks[networkName].contracts) {
            this.config.networks[networkName].contracts = {};
        }
        
        this.config.networks[networkName].contracts![contractName] = address;
        
        if (this.options.autoSave) {
            this.saveConfiguration();
        }
    }

    /**
     * Get feature configuration
     * @param featureName - Feature name
     */
    isFeatureEnabled(featureName: string): boolean {
        return this.config.features?.[featureName] || false;
    }

    /**
     * Set feature configuration
     * @param featureName - Feature name
     * @param enabled - Whether feature is enabled
     */
    setFeatureEnabled(featureName: string, enabled: boolean): void {
        if (!this.config.features) {
            this.config.features = {};
        }
        this.config.features[featureName] = enabled;
        
        if (this.options.autoSave) {
            this.saveConfiguration();
        }
    }

    /**
     * Validate configuration
     */
    validateConfiguration(): ValidationResult {
        const errors: string[] = [];
        
        if (!this.config) {
            errors.push('Configuration is null or undefined');
        }
        
        if (!this.config.networks || Object.keys(this.config.networks).length === 0) {
            errors.push('No networks configured');
        }
        
        // Validate network configurations
        if (this.config.networks) {
            for (const [networkName, network] of Object.entries(this.config.networks)) {
                if (!network.name) {
                    errors.push(`Network ${networkName} missing name`);
                }
                if (!network.chainId || network.chainId <= 0) {
                    errors.push(`Network ${networkName} missing or invalid chainId`);
                }
                if (!network.url) {
                    errors.push(`Network ${networkName} missing URL`);
                }
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Get system status
     */
    getSystemStatus(): SystemStatus {
        if (!this.initialized) {
            return {
                initialized: false,
                error: 'Configuration not initialized',
                environment: '',
                configuration: { valid: false, networksCount: 0 },
                networks: {}
            } as any;
        }
        
        return {
            initialized: true,
            environment: this.currentEnvironment,
            configuration: {
                valid: this.validateConfiguration().isValid,
                networksCount: Object.keys(this.config.networks || {}).length
            },
            networks: this.config.networks || {}
        };
    }

    /**
     * Update configuration
     * @param newConfig - New configuration to merge
     */
    updateConfig(newConfig: Partial<CLIConfiguration>): void {
        this.config = { ...this.config, ...newConfig };
        
        if (this.options.autoSave) {
            this.saveConfiguration();
        }
    }

    /**
     * Reset configuration to defaults
     */
    resetConfig(): void {
        this.config = { networks: {}, features: {} };
        
        if (this.options.autoSave) {
            this.saveConfiguration();
        }
    }

    /**
     * Reset configuration to defaults (alias)
     */
    resetConfiguration(): void {
        this.resetConfig();
    }

    /**
     * Export configuration
     */
    exportConfiguration(): string {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import configuration
     * @param configJson - Configuration JSON string
     */
    importConfiguration(configJson: string): void {
        try {
            const importedConfig = JSON.parse(configJson);
            this.config = importedConfig;
            
            if (this.options.validateOnLoad) {
                const validation = this.validateConfiguration();
                if (!validation.isValid) {
                    console.warn('⚠ Imported configuration has validation warnings:', validation.errors);
                }
            }
            
            if (this.options.autoSave) {
                this.saveConfiguration();
            }
        } catch (error) {
            throw new Error(`Failed to import configuration: ${(error as Error).message}`);
        }
    }

    /**
     * Update configuration options
     * @param newOptions - New options to merge
     */
    updateOptions(newOptions: Partial<ConfigOptions>): void {
        this.options = { ...this.options, ...newOptions };
    }

    /**
     * Get current environment
     */
    getCurrentEnvironment(): string {
        return this.currentEnvironment;
    }

    /**
     * Check if manager is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

// Export default instance
export const enhancedConfigManager = new TypeSafeEnhancedConfigManager();

// Backward compatibility exports
export const EnhancedConfigManager = TypeSafeEnhancedConfigManager;