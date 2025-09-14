import inquirer from 'inquirer';
import { ValidationUtils } from './validation-utils.js';
import { NetworkUtils } from './network-utils.js';

interface PromptOptions {
    default?: string;
    validate?: (input: string) => boolean;
    required?: boolean;
    errorMessage?: string;
}

export class PromptUtils {
    // Basic text input with validation
    static async promptText(message: string, options: PromptOptions = {}): Promise<string> {
        const { default: defaultValue, validate, required = true } = options;
        
        const promptConfig: any = {
            type: 'input',
            name: 'value',
            message,
            validate: (input: string) => {
                if (required && !input.trim()) {
                    return 'This field is required';
                }
                if (validate && !validate(input)) {
                    return options.errorMessage || 'Invalid input';
                }
                return true;
            }
        };

        if (defaultValue !== undefined) {
            promptConfig.default = defaultValue;
        }
        
        const answer = await inquirer.prompt([promptConfig]);
        return answer.value;
    }

    // Password input (hidden)
    static async promptPassword(message: string, options: Omit<PromptOptions, 'default'> = {}): Promise<string> {
        const { validate, required = true } = options;
        
        const answer = await inquirer.prompt([
            {
                type: 'password',
                name: 'value',
                message,
                mask: '*',
                validate: (input: string) => {
                    if (required && !input) {
                        return 'Password is required';
                    }
                    if (validate && !validate(input)) {
                        return options.errorMessage || 'Invalid password';
                    }
                    return true;
                }
            }
        ]);
        
        return answer.value;
    }

    // Confirmation prompt
    static async promptConfirm(message: string, defaultValue: boolean = false): Promise<boolean> {
        const answer = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'value',
                message,
                default: defaultValue
            }
        ]);
        
        return answer.value;
    }

    // Single choice selection
    static async promptSelect<T = string>(
        message: string, 
        choices: Array<{ name: string; value: T } | string>, 
        options: { default?: string; pageSize?: number } = {}
    ): Promise<T> {
        const { default: defaultValue, pageSize = 10 } = options;
        
        const promptConfig: any = {
            type: 'list',
            name: 'value',
            message,
            choices,
            pageSize
        };

        if (defaultValue !== undefined) {
            promptConfig.default = defaultValue;
        }
        
        const answer = await inquirer.prompt([promptConfig]);
        return answer.value;
    }

    // Private key input
    static async promptPrivateKey(message: string = 'Enter private key:'): Promise<string> {
        return await this.promptPassword(message, {
            validate: ValidationUtils.isValidPrivateKey,
            errorMessage: 'Please enter a valid private key (64 hex characters)'
        });
    }

    // Network selection
    static async promptNetwork(message: string = 'Select network:'): Promise<string> {
        const networks = NetworkUtils.getAvailableNetworks();
        
        const choices = networks.map(name => ({
            name: `${NetworkUtils.getNetwork(name)?.name} (${name})`,
            value: name
        }));
        
        return await this.promptSelect(message, choices);
    }

    // Business information input
    static async promptBusinessInfo(): Promise<{
        businessName: string;
        region: 'India' | 'Brazil' | 'Europe';
        kycLevel: 1 | 2 | 3;
    }> {
        const businessName = await this.promptText('Enter business name:', {
            validate: ValidationUtils.isValidBusinessName,
            errorMessage: 'Business name must be 2-100 characters'
        });
        
        const region = await this.promptSelect<'India' | 'Brazil' | 'Europe'>('Select region:', [
            { name: 'India', value: 'India' },
            { name: 'Brazil', value: 'Brazil' },
            { name: 'Europe', value: 'Europe' }
        ]);
        
        const kycLevel = await this.promptSelect<1 | 2 | 3>('Select KYC level:', [
            { name: 'Level 1 - Basic verification', value: 1 },
            { name: 'Level 2 - Enhanced verification', value: 2 },
            { name: 'Level 3 - Full verification', value: 3 }
        ]);
        
        return { businessName, region, kycLevel };
    }

    // UPI ID input
    static async promptUPIId(message: string = 'Enter UPI ID:'): Promise<string> {
        return await this.promptText(message, {
            validate: ValidationUtils.isValidUPIId,
            errorMessage: 'Please enter a valid UPI ID (e.g., user@bank)'
        });
    }

    // Configuration setup
    static async promptConfiguration(): Promise<{
        network: string;
        privateKey: string;
        saveConfig: boolean;
    }> {
        console.log('\n🔧 CLI Configuration Setup\n');
        
        const network = await this.promptNetwork();
        const privateKey = await this.promptPrivateKey();
        const saveConfig = await this.promptConfirm('Save configuration?', true);
        
        return { network, privateKey, saveConfig };
    }

    // Summary confirmation
    static async confirmSummary(title: string, items: string[]): Promise<boolean> {
        console.log(`\n📋 ${title}\n`);
        
        items.forEach(item => {
            console.log(`• ${item}`);
        });
        
        console.log();
        return await this.promptConfirm('Confirm these details?', true);
    }

    // Error handling with retry option
    static async handleError(error: Error, operation: string): Promise<boolean> {
        console.error(`\n❌ Error during ${operation}:`);
        console.error(error.message);
        
        const retry = await this.promptConfirm('\nWould you like to retry?', false);
        return retry;
    }

    // Simple payment method prompt
    static async promptPaymentMethod(region: string): Promise<{
        type: 'UPI' | 'PIX' | 'SEPA';
        identifier: string;
    }> {
        let availableTypes: Array<{ name: string; value: 'UPI' | 'PIX' | 'SEPA' }> = [];
        
        switch (region) {
            case 'India':
                availableTypes = [{ name: 'UPI', value: 'UPI' }];
                break;
            case 'Brazil':
                availableTypes = [{ name: 'PIX', value: 'PIX' }];
                break;
            case 'Europe':
                availableTypes = [{ name: 'SEPA', value: 'SEPA' }];
                break;
            default:
                availableTypes = [
                    { name: 'UPI', value: 'UPI' },
                    { name: 'PIX', value: 'PIX' },
                    { name: 'SEPA', value: 'SEPA' }
                ];
        }
        
        const type = await this.promptSelect('Select payment method type:', availableTypes);
        
        let identifier: string;
        
        switch (type) {
            case 'UPI':
                identifier = await this.promptUPIId();
                break;
            case 'PIX':
                identifier = await this.promptText('Enter PIX key:');
                break;
            case 'SEPA':
                identifier = await this.promptText('Enter IBAN:');
                break;
        }
        
        return { type, identifier };
    }
}

export default PromptUtils;