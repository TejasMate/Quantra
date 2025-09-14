import { GlobalOptions, ValidationResult, ValidationError } from '../types/index.js';

export class InputValidator {
  /**
   * Validate and sanitize network parameter
   */
  static validateNetwork(network: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!network || typeof network !== 'string') {
      errors.push({
        field: 'network',
        message: 'Network is required and must be a string',
        code: 'INVALID_NETWORK'
      });
      return { isValid: false, errors };
    }
    
    // Sanitize network name
    const sanitized = network.toLowerCase().trim();
    
    // Validate network name format
    if (!/^[a-z0-9_-]+$/.test(sanitized)) {
      errors.push({
        field: 'network',
        message: 'Network name must contain only lowercase letters, numbers, underscores, and hyphens',
        code: 'INVALID_NETWORK_FORMAT'
      });
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate private key format and security
   */
  static validatePrivateKey(privateKey: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!privateKey || typeof privateKey !== 'string') {
      errors.push({
        field: 'privateKey',
        message: 'Private key is required',
        code: 'MISSING_PRIVATE_KEY'
      });
      return { isValid: false, errors };
    }
    
    // Check format
    if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
      errors.push({
        field: 'privateKey',
        message: 'Private key must be a valid 64-character hexadecimal string starting with 0x',
        code: 'INVALID_PRIVATE_KEY_FORMAT'
      });
    }
    
    // Security checks
    const commonKeys = [
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' // Default hardhat key
    ];
    
    // Only warn about test keys in production networks
    if (commonKeys.includes(privateKey)) {
      const isDevelopment = process.env.NODE_ENV === 'development' || 
                           process.env.HARDHAT_NETWORK === 'hardhat' ||
                           process.env.NETWORK === 'hardhat' ||
                           process.env.NETWORK === 'localhost';
      
      if (!isDevelopment) {
        errors.push({
          field: 'privateKey',
          message: 'Warning: Using a well-known private key. This is not secure for production use.',
          code: 'INSECURE_PRIVATE_KEY'
        });
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate Ethereum address format
   */
  static validateAddress(address: string, fieldName: string = 'address'): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!address || typeof address !== 'string') {
      errors.push({
        field: fieldName,
        message: `${fieldName} is required`,
        code: 'MISSING_ADDRESS'
      });
      return { isValid: false, errors };
    }
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be a valid Ethereum address`,
        code: 'INVALID_ADDRESS_FORMAT'
      });
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate amount format and value
   */
  static validateAmount(amount: string, fieldName: string = 'amount'): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!amount || typeof amount !== 'string') {
      errors.push({
        field: fieldName,
        message: `${fieldName} is required`,
        code: 'MISSING_AMOUNT'
      });
      return { isValid: false, errors };
    }
    
    // Check numeric format
    if (!/^\d+(\.\d+)?$/.test(amount)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be a valid numeric value`,
        code: 'INVALID_AMOUNT_FORMAT'
      });
      return { isValid: false, errors };
    }
    
    const numericAmount = parseFloat(amount);
    
    // Check for negative values
    if (numericAmount <= 0) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be greater than zero`,
        code: 'INVALID_AMOUNT_VALUE'
      });
    }
    
    // Check for reasonable upper limit (1 billion)
    if (numericAmount > 1000000000) {
      errors.push({
        field: fieldName,
        message: `${fieldName} exceeds maximum allowed value`,
        code: 'AMOUNT_TOO_LARGE'
      });
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate string input with length constraints
   */
  static validateString(
    value: string, 
    fieldName: string, 
    minLength: number = 1, 
    maxLength: number = 255,
    pattern?: RegExp
  ): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!value || typeof value !== 'string') {
      errors.push({
        field: fieldName,
        message: `${fieldName} is required`,
        code: 'MISSING_FIELD'
      });
      return { isValid: false, errors };
    }
    
    const trimmed = value.trim();
    
    if (trimmed.length < minLength) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be at least ${minLength} characters long`,
        code: 'TOO_SHORT'
      });
    }
    
    if (trimmed.length > maxLength) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must not exceed ${maxLength} characters`,
        code: 'TOO_LONG'
      });
    }
    
    if (pattern && !pattern.test(trimmed)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} format is invalid`,
        code: 'INVALID_FORMAT'
      });
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate email format
   */
  static validateEmail(email: string): ValidationResult {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return this.validateString(email, 'email', 5, 254, emailPattern);
  }

  /**
   * Validate global options for CLI commands
   */
  static validateGlobalOptions(options: Partial<GlobalOptions>): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Validate network
    if (options.network) {
      const networkValidation = this.validateNetwork(options.network);
      if (!networkValidation.isValid) {
        errors.push(...networkValidation.errors);
      }
    }
    
    // Validate private key
    if (options.privateKey) {
      const keyValidation = this.validatePrivateKey(options.privateKey);
      if (!keyValidation.isValid) {
        errors.push(...keyValidation.errors);
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Sanitize input by removing dangerous characters
   */
  static sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }
    
    return input
      .trim()
      .replace(/[<>\"'`]/g, '') // Remove potentially dangerous characters
      .replace(/\s+/g, ' '); // Normalize whitespace
  }

  /**
   * Validate and sanitize merchant registration data
   */
  static validateMerchantData(data: any): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Validate name
    const nameValidation = this.validateString(data.name, 'name', 1, 100);
    if (!nameValidation.isValid) {
      errors.push(...nameValidation.errors);
    }
    
    // Validate email
    if (data.email) {
      const emailValidation = this.validateEmail(data.email);
      if (!emailValidation.isValid) {
        errors.push(...emailValidation.errors);
      }
    }
    
    // Validate business type
    const validBusinessTypes = ['individual', 'corporation', 'partnership', 'other'];
    if (data.businessType && !validBusinessTypes.includes(data.businessType)) {
      errors.push({
        field: 'businessType',
        message: `Business type must be one of: ${validBusinessTypes.join(', ')}`,
        code: 'INVALID_BUSINESS_TYPE'
      });
    }
    
    // Validate KYC level
    if (data.kycLevel !== undefined) {
      const kycLevel = parseInt(data.kycLevel);
      if (isNaN(kycLevel) || kycLevel < 1 || kycLevel > 3) {
        errors.push({
          field: 'kycLevel',
          message: 'KYC level must be 1, 2, or 3',
          code: 'INVALID_KYC_LEVEL'
        });
      }
    }
    
    // Validate region
    if (data.region) {
      const regionValidation = this.validateString(data.region, 'region', 2, 10, /^[A-Z]{2,10}$/);
      if (!regionValidation.isValid) {
        errors.push(...regionValidation.errors);
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Comprehensive validation for escrow creation
   */
  static validateEscrowData(data: any): ValidationResult {
    const errors: ValidationError[] = [];
    
    // Validate merchant ID
    const merchantIdValidation = this.validateString(data.merchantId, 'merchantId', 1, 100);
    if (!merchantIdValidation.isValid) {
      errors.push(...merchantIdValidation.errors);
    }
    
    // Validate amount
    const amountValidation = this.validateAmount(data.amount, 'amount');
    if (!amountValidation.isValid) {
      errors.push(...amountValidation.errors);
    }
    
    // Validate token address
    const tokenValidation = this.validateAddress(data.token, 'token');
    if (!tokenValidation.isValid) {
      errors.push(...tokenValidation.errors);
    }
    
    // Validate target chain
    const chainValidation = this.validateString(data.targetChain, 'targetChain', 1, 50);
    if (!chainValidation.isValid) {
      errors.push(...chainValidation.errors);
    }
    
    // Validate dispute period
    if (data.disputePeriod !== undefined) {
      const disputePeriod = parseInt(data.disputePeriod);
      if (isNaN(disputePeriod) || disputePeriod < 0 || disputePeriod > 30) {
        errors.push({
          field: 'disputePeriod',
          message: 'Dispute period must be between 0 and 30 days',
          code: 'INVALID_DISPUTE_PERIOD'
        });
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }
}

/**
 * Middleware function for validating command inputs
 */
export function validateCommandInput<T>(
  data: T,
  validator: (data: T) => ValidationResult,
  throwOnError: boolean = true
): T {
  const validation = validator(data);
  
  if (!validation.isValid) {
    const errorMessage = validation.errors
      .map(err => `${err.field}: ${err.message}`)
      .join(', ');
    
    if (throwOnError) {
      throw new Error(`Validation failed: ${errorMessage}`);
    } else {
      console.warn(`Validation warnings: ${errorMessage}`);
    }
  }
  
  return data;
}

/**
 * Create a validation middleware for specific command types
 */
export function createValidationMiddleware<T>(
  validator: (data: T) => ValidationResult
) {
  return (data: T): T => {
    return validateCommandInput(data, validator, true);
  };
}