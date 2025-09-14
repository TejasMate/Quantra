import { ethers } from 'ethers';
import { ValidationResult, ValidationError, MerchantRegistrationData, PaymentMethodData, EscrowData } from '../types/index.js';

export class ValidationUtils {
    /**
     * Validate Ethereum address
     */
    static isValidAddress(address: string): boolean {
        try {
            return /^0x[a-fA-F0-9]{40}$/.test(address);
        } catch {
            return false;
        }
    }

    /**
     * Validate URL format
     */
    static isValidURL(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validate chain ID
     */
    static isValidChainId(chainId: number): boolean {
        return Number.isInteger(chainId) && chainId > 0;
    }

    /**
     * Validate private key
     */
    static isValidPrivateKey(privateKey: string): boolean {
        try {
            return /^0x[a-fA-F0-9]{64}$/.test(privateKey);
        } catch {
            return false;
        }
    }

    /**
     * Validate email format
     */
    static isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate amount (must be positive number)
     */
    static isValidAmount(amount: string | number): boolean {
        try {
            const num = typeof amount === 'string' ? parseFloat(amount) : amount;
            return !isNaN(num) && num > 0;
        } catch {
            return false;
        }
    }

    /**
     * Validate business name
     */
    static isValidBusinessName(name: string): boolean {
        return name.trim().length >= 2 && name.trim().length <= 100;
    }

    /**
     * Validate region code
     */
    static isValidRegion(region: string): boolean {
        const validRegions = ['US', 'EU', 'IN', 'BR', 'GLOBAL'];
        return validRegions.includes(region.toUpperCase());
    }

    // Address validation
    static isValidAddressOld(address: string): boolean {
        try {
            return ethers.isAddress(address);
        } catch (error) {
            return false;
        }
    }

    // Private key validation
    static isValidPrivateKeyOld(privateKey: string): boolean {
        try {
            // Remove 0x prefix if present
            const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
            
            // Check if it's a valid hex string of correct length
            if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
                return false;
            }
            
            // Try to create a wallet to validate
            new ethers.Wallet(privateKey);
            return true;
        } catch (error) {
            return false;
        }
    }

    // UPI ID validation
    static isValidUPIId(upiId: string): boolean {
        // UPI ID format: username@bank or phone@bank
        const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
        
        if (!upiRegex.test(upiId)) {
            return false;
        }
        
        // Additional checks
        const [username, bank] = upiId.split('@');
        
        // Username should be 3-50 characters
        if (username.length < 3 || username.length > 50) {
            return false;
        }
        
        // Bank should be 2-20 characters
        if (bank.length < 2 || bank.length > 20) {
            return false;
        }
        
        return true;
    }

    // PIX key validation
    static isValidPIXKey(pixKey: string, keyType: string): boolean {
        switch (keyType) {
            case 'EMAIL':
                return this.isValidEmail(pixKey);
            case 'PHONE':
                return this.isValidBrazilianPhone(pixKey);
            case 'CPF':
                return this.isValidCPF(pixKey);
            case 'CNPJ':
                return this.isValidCNPJ(pixKey);
            default:
                return false;
        }
    }

    // Email validation
    static isValidEmailOld(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= 254;
    }

    // Brazilian phone validation
    static isValidBrazilianPhone(phone: string): boolean {
        // Remove all non-digits
        const cleanPhone = phone.replace(/\D/g, '');
        
        // Brazilian phone: 11 digits (with area code) or 10 digits (landline)
        // Format: +55 (11) 99999-9999 or +55 (11) 9999-9999
        return /^55[1-9][1-9][0-9]{8,9}$/.test(cleanPhone) || /^[1-9][1-9][0-9]{8,9}$/.test(cleanPhone);
    }

    // CPF validation (Brazilian individual tax ID)
    static isValidCPF(cpf: string): boolean {
        // Remove all non-digits
        const cleanCPF = cpf.replace(/\D/g, '');
        
        // Check if it has 11 digits
        if (cleanCPF.length !== 11) {
            return false;
        }
        
        // Check for known invalid CPFs
        const invalidCPFs = [
            '00000000000', '11111111111', '22222222222', '33333333333',
            '44444444444', '55555555555', '66666666666', '77777777777',
            '88888888888', '99999999999'
        ];
        
        if (invalidCPFs.includes(cleanCPF)) {
            return false;
        }
        
        // Validate check digits
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
        }
        
        let remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cleanCPF.charAt(9))) return false;
        
        sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
        }
        
        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cleanCPF.charAt(10))) return false;
        
        return true;
    }

    // CNPJ validation (Brazilian company tax ID)
    static isValidCNPJ(cnpj: string): boolean {
        // Remove all non-digits
        const cleanCNPJ = cnpj.replace(/\D/g, '');
        
        // Check if it has 14 digits
        if (cleanCNPJ.length !== 14) {
            return false;
        }
        
        // Check for known invalid CNPJs
        const invalidCNPJs = [
            '00000000000000', '11111111111111', '22222222222222', '33333333333333',
            '44444444444444', '55555555555555', '66666666666666', '77777777777777',
            '88888888888888', '99999999999999'
        ];
        
        if (invalidCNPJs.includes(cleanCNPJ)) {
            return false;
        }
        
        // Validate first check digit
        let sum = 0;
        const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        for (let i = 0; i < 12; i++) {
            sum += parseInt(cleanCNPJ.charAt(i)) * weights1[i];
        }
        
        let remainder = sum % 11;
        const digit1 = remainder < 2 ? 0 : 11 - remainder;
        if (digit1 !== parseInt(cleanCNPJ.charAt(12))) return false;
        
        // Validate second check digit
        sum = 0;
        const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        for (let i = 0; i < 13; i++) {
            sum += parseInt(cleanCNPJ.charAt(i)) * weights2[i];
        }
        
        remainder = sum % 11;
        const digit2 = remainder < 2 ? 0 : 11 - remainder;
        if (digit2 !== parseInt(cleanCNPJ.charAt(13))) return false;
        
        return true;
    }

    // IBAN validation
    static isValidIBAN(iban: string): boolean {
        // Remove spaces and convert to uppercase
        const cleanIBAN = iban.replace(/\s/g, '').toUpperCase();
        
        // Check basic format (2 letters + 2 digits + up to 30 alphanumeric)
        if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(cleanIBAN)) {
            return false;
        }
        
        // Check length (varies by country)
        const countryLengths: Record<string, number> = {
            'AD': 24, 'AE': 23, 'AL': 28, 'AT': 20, 'AZ': 28, 'BA': 20, 'BE': 16,
            'BG': 22, 'BH': 22, 'BR': 29, 'BY': 28, 'CH': 21, 'CR': 22, 'CY': 28,
            'CZ': 24, 'DE': 22, 'DK': 18, 'DO': 28, 'EE': 20, 'EG': 29, 'ES': 24,
            'FI': 18, 'FO': 18, 'FR': 27, 'GB': 22, 'GE': 22, 'GI': 23, 'GL': 18,
            'GR': 27, 'GT': 28, 'HR': 21, 'HU': 28, 'IE': 22, 'IL': 23, 'IS': 26,
            'IT': 27, 'JO': 30, 'KW': 30, 'KZ': 20, 'LB': 28, 'LC': 32, 'LI': 21,
            'LT': 20, 'LU': 20, 'LV': 21, 'MC': 27, 'MD': 24, 'ME': 22, 'MK': 19,
            'MR': 27, 'MT': 31, 'MU': 30, 'NL': 18, 'NO': 15, 'PK': 24, 'PL': 28,
            'PS': 29, 'PT': 25, 'QA': 29, 'RO': 24, 'RS': 22, 'SA': 24, 'SE': 24,
            'SI': 19, 'SK': 24, 'SM': 27, 'TN': 24, 'TR': 26, 'UA': 29, 'VG': 24,
            'XK': 20
        };
        
        const countryCode = cleanIBAN.substring(0, 2);
        const expectedLength = countryLengths[countryCode];
        
        if (!expectedLength || cleanIBAN.length !== expectedLength) {
            return false;
        }
        
        // Perform mod-97 check
        const rearranged = cleanIBAN.substring(4) + cleanIBAN.substring(0, 4);
        let numericString = '';
        
        for (let i = 0; i < rearranged.length; i++) {
            const char = rearranged.charAt(i);
            if (/[A-Z]/.test(char)) {
                // Convert letter to number (A=10, B=11, ..., Z=35)
                numericString += (char.charCodeAt(0) - 55).toString();
            } else {
                numericString += char;
            }
        }
        
        // Calculate mod 97
        let remainder = 0;
        for (let i = 0; i < numericString.length; i++) {
            remainder = (remainder * 10 + parseInt(numericString.charAt(i))) % 97;
        }
        
        return remainder === 1;
    }

    // BIC/SWIFT code validation
    static isValidBIC(bic: string): boolean {
        // BIC format: 4 letters (bank) + 2 letters (country) + 2 alphanumeric (location) + optional 3 alphanumeric (branch)
        const bicRegex = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
        return bicRegex.test(bic.toUpperCase());
    }

    // Amount validation
    static isValidAmountOld(amount: string | number): boolean {
        try {
            const num = parseFloat(amount.toString());
            return !isNaN(num) && num > 0 && isFinite(num);
        } catch (error) {
            return false;
        }
    }

    // Ethereum amount validation (in wei or ether)
    static isValidEthAmount(amount: string | number | bigint): boolean {
        try {
            const parsed = ethers.parseEther(amount.toString());
            return parsed > 0n;
        } catch (error) {
            return false;
        }
    }

    // Transaction hash validation
    static isValidTxHash(hash: string): boolean {
        return /^0x[a-fA-F0-9]{64}$/.test(hash);
    }

    // Block number validation
    static isValidBlockNumber(blockNumber: string | number): boolean {
        const num = parseInt(blockNumber.toString());
        return !isNaN(num) && num >= 0;
    }

    // Network name validation
    static isValidNetworkName(name: string): boolean {
        return /^[a-zA-Z0-9_-]+$/.test(name) && name.length >= 2 && name.length <= 20;
    }

    // Chain ID validation
    static isValidChainIdOld(chainId: string | number): boolean {
        const num = parseInt(chainId.toString());
        return !isNaN(num) && num > 0;
    }

    // Merchant ID validation
    static isValidMerchantId(merchantId: string | number): boolean {
        const num = parseInt(merchantId.toString());
        return !isNaN(num) && num > 0;
    }

    // Business name validation
    static isValidBusinessNameOld(name: string): boolean {
        return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100;
    }

    // Region validation
    static isValidRegionOld(region: string): boolean {
        const validRegions = ['India', 'Brazil', 'Europe'];
        return validRegions.includes(region);
    }

    // KYC level validation
    static isValidKYCLevel(level: string | number): boolean {
        const num = parseInt(level.toString());
        return !isNaN(num) && num >= 1 && num <= 3;
    }

    // Payment method type validation
    static isValidPaymentMethodType(type: string): boolean {
        const validTypes = ['UPI', 'PIX', 'SEPA'];
        return validTypes.includes(type);
    }

    // Proposal type validation
    static isValidProposalType(type: string): boolean {
        const validTypes = [
            'merchant-approval',
            'merchant-revocation',
            'upi-approval',
            'upi-revocation',
            'chain-config',
            'token-support',
            'fee-update',
            'emergency-pause'
        ];
        return validTypes.includes(type);
    }

    // Fee percentage validation
    static isValidFeePercentage(percentage: string | number): boolean {
        const num = parseFloat(percentage.toString());
        return !isNaN(num) && num >= 0 && num <= 100;
    }

    // Deadline validation (in days)
    static isValidDeadlineDays(days: string | number): boolean {
        const num = parseInt(days.toString());
        return !isNaN(num) && num > 0 && num <= 365;
    }

    // Sanitization methods
    static sanitizeAddress(address: string): string {
        return address.trim().toLowerCase();
    }

    static sanitizeUPIId(upiId: string): string {
        return upiId.trim().toLowerCase();
    }

    static sanitizePIXKey(pixKey: string): string {
        return pixKey.trim();
    }

    static sanitizeIBAN(iban: string): string {
        return iban.replace(/\s/g, '').toUpperCase();
    }

    static sanitizeBusinessName(name: string): string {
        return name.trim();
    }

    // Format validation helpers
    static formatValidationError(field: string, value: any, expectedFormat: string): string {
        return `Invalid ${field}: "${value}". Expected format: ${expectedFormat}`;
    }

    static getValidationSummary(validations: Array<{ valid: boolean; error?: string }>): ValidationResult {
        const errors = validations.filter(v => !v.valid);
        return {
            isValid: errors.length === 0,
            errors: errors.map((e, index) => ({
                field: `validation_${index}`,
                message: e.error || 'Validation failed',
                code: 'VALIDATION_ERROR'
            }))
        };
    }

    // Input validation for global options
    static validateGlobalOptions(options: any): ValidationResult {
        const errors: ValidationError[] = [];

        if (options.network && !this.isValidNetworkName(options.network)) {
            errors.push({
                field: 'network',
                message: 'Invalid network name format',
                code: 'INVALID_NETWORK_NAME'
            });
        }

        if (options.privateKey && !this.isValidPrivateKey(options.privateKey)) {
            errors.push({
                field: 'privateKey',
                message: 'Invalid private key format',
                code: 'INVALID_PRIVATE_KEY'
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Batch validation
    static validateMerchantRegistration(data: MerchantRegistrationData): ValidationResult {
        const errors: ValidationError[] = [];

        if (!this.isValidBusinessName(data.businessName)) {
            errors.push({
                field: 'businessName',
                message: this.formatValidationError('business name', data.businessName, 'string with 2-100 characters'),
                code: 'INVALID_BUSINESS_NAME'
            });
        }

        if (!this.isValidRegion(data.region)) {
            errors.push({
                field: 'region',
                message: this.formatValidationError('region', data.region, 'India, Brazil, or Europe'),
                code: 'INVALID_REGION'
            });
        }

        if (!this.isValidKYCLevel(data.kycLevel)) {
            errors.push({
                field: 'kycLevel',
                message: this.formatValidationError('KYC level', data.kycLevel, '1, 2, or 3'),
                code: 'INVALID_KYC_LEVEL'
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static validatePaymentMethod(data: PaymentMethodData): ValidationResult {
        const errors: ValidationError[] = [];

        if (!this.isValidPaymentMethodType(data.type)) {
            errors.push({
                field: 'type',
                message: this.formatValidationError('payment method type', data.type, 'UPI, PIX, or SEPA'),
                code: 'INVALID_PAYMENT_METHOD_TYPE'
            });
        }

        // Type-specific validation
        switch (data.type) {
            case 'UPI':
                if (!this.isValidUPIId(data.identifier)) {
                    errors.push({
                        field: 'upiId',
                        message: this.formatValidationError('UPI ID', data.identifier, 'username@bank'),
                        code: 'INVALID_UPI_ID'
                    });
                }
                break;
            case 'PIX':
                if (!data.keyType || !this.isValidPIXKey(data.identifier, data.keyType)) {
                    errors.push({
                        field: 'pixKey',
                        message: this.formatValidationError('PIX key', data.identifier, `valid ${data.keyType || 'unknown'} format`),
                        code: 'INVALID_PIX_KEY'
                    });
                }
                break;
            case 'SEPA':
                if (!this.isValidIBAN(data.identifier)) {
                    errors.push({
                        field: 'iban',
                        message: this.formatValidationError('IBAN', data.identifier, 'valid IBAN format'),
                        code: 'INVALID_IBAN'
                    });
                }
                break;
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static validateEscrowCreation(data: EscrowData): ValidationResult {
        const errors: ValidationError[] = [];

        if (!this.isValidMerchantId(data.id)) {
            errors.push({
                field: 'merchantId',
                message: this.formatValidationError('merchant ID', data.id, 'positive integer'),
                code: 'INVALID_MERCHANT_ID'
            });
        }

        if (data.tokenAddress && !this.isValidAddress(data.tokenAddress)) {
            errors.push({
                field: 'tokenAddress',
                message: this.formatValidationError('token address', data.tokenAddress, 'valid Ethereum address'),
                code: 'INVALID_TOKEN_ADDRESS'
            });
        }

        if (!this.isValidEthAmount(data.amount)) {
            errors.push({
                field: 'amount',
                message: this.formatValidationError('amount', data.amount, 'positive number'),
                code: 'INVALID_AMOUNT'
            });
        }

        if (data.deliveryDeadline && !this.isValidDeadlineDays(data.deliveryDeadline)) {
            errors.push({
                field: 'deliveryDeadline',
                message: this.formatValidationError('delivery deadline', data.deliveryDeadline, '1-365 days'),
                code: 'INVALID_DEADLINE'
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Advanced validation for addresses and transactions
    static validateAddress(address: string, fieldName: string = 'address'): ValidationResult {
        const errors: ValidationError[] = [];

        if (!address) {
            errors.push({
                field: fieldName,
                message: 'Address is required',
                code: 'REQUIRED_FIELD'
            });
        } else if (!this.isValidAddress(address)) {
            errors.push({
                field: fieldName,
                message: 'Invalid Ethereum address format',
                code: 'INVALID_ADDRESS_FORMAT'
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static validateTransactionHash(hash: string): ValidationResult {
        const errors: ValidationError[] = [];

        if (!hash) {
            errors.push({
                field: 'transactionHash',
                message: 'Transaction hash is required',
                code: 'REQUIRED_FIELD'
            });
        } else if (!this.isValidTxHash(hash)) {
            errors.push({
                field: 'transactionHash',
                message: 'Invalid transaction hash format',
                code: 'INVALID_TX_HASH_FORMAT'
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Comprehensive validation for command options
    static validateCommandOptions(options: any, requiredFields: string[] = []): ValidationResult {
        const errors: ValidationError[] = [];

        // Check required fields
        for (const field of requiredFields) {
            if (!options[field] && options[field] !== 0) {
                errors.push({
                    field,
                    message: `${field} is required`,
                    code: 'REQUIRED_FIELD'
                });
            }
        }

        // Validate specific field types
        if (options.network && !this.isValidNetworkName(options.network)) {
            errors.push({
                field: 'network',
                message: 'Invalid network name',
                code: 'INVALID_NETWORK'
            });
        }

        if (options.privateKey && !this.isValidPrivateKey(options.privateKey)) {
            errors.push({
                field: 'privateKey',
                message: 'Invalid private key',
                code: 'INVALID_PRIVATE_KEY'
            });
        }

        if (options.address && !this.isValidAddress(options.address)) {
            errors.push({
                field: 'address',
                message: 'Invalid Ethereum address',
                code: 'INVALID_ADDRESS'
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

export default ValidationUtils;