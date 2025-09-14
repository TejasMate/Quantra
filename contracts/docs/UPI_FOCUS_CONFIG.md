# UPI-Focused Configuration Guide

This guide explains how to configure the merchant protocol to focus on UPI payments while keeping SEPA and PIX verifier structures intact for future use.

## Current Verifier Structure

The protocol maintains three payment verifiers:
- **UPIVerifier.sol** - For Indian UPI payments (PRIMARY)
- **SEPAVerifier.sol** - For European SEPA payments (INACTIVE)
- **PIXVerifier.sol** - For Brazilian PIX payments (INACTIVE)

## Configuration Steps

### 1. Deploy All Verifiers

Deploy all three verifier contracts to maintain the complete infrastructure:

```solidity
// Deploy UPI Verifier (Active)
UPIVerifier upiVerifier = new UPIVerifier();

// Deploy SEPA Verifier (Inactive)
SEPAVerifier sepaVerifier = new SEPAVerifier();

// Deploy PIX Verifier (Inactive)
PIXVerifier pixVerifier = new PIXVerifier();
```

### 2. Register Verifiers in VerifierRegistry

```solidity
// Register UPI Verifier as ACTIVE
verifierRegistry.registerVerifier(
    address(upiVerifier),
    "UPI",
    [IRegionalRegistry.Region.INDIA],
    "Primary UPI payment verifier for Indian market"
);

// Register SEPA Verifier as INACTIVE
verifierRegistry.registerVerifier(
    address(sepaVerifier),
    "SEPA",
    [IRegionalRegistry.Region.EUROPE],
    "SEPA payment verifier for European market - Currently inactive"
);

// Register PIX Verifier as INACTIVE
verifierRegistry.registerVerifier(
    address(pixVerifier),
    "PIX",
    [IRegionalRegistry.Region.SOUTH_AMERICA],
    "PIX payment verifier for Brazilian market - Currently inactive"
);
```

### 3. Set Verifier Status

```solidity
// Keep UPI active (default after registration)
// verifierRegistry.setVerifierActive(address(upiVerifier), true); // Already active

// Deactivate SEPA and PIX
verifierRegistry.setVerifierActive(address(sepaVerifier), false);
verifierRegistry.setVerifierActive(address(pixVerifier), false);
```

### 4. Configure Regional Registry

```solidity
// Focus on India region for UPI
regionalRegistry.setRegionActive(IRegionalRegistry.Region.INDIA, true);
regionalRegistry.setRegionActive(IRegionalRegistry.Region.EUROPE, false);
regionalRegistry.setRegionActive(IRegionalRegistry.Region.SOUTH_AMERICA, false);

// Set UPI as the primary payment method for India
regionalRegistry.addPaymentMethodToRegion(
    IRegionalRegistry.Region.INDIA,
    "UPI",
    address(upiVerifier)
);
```

## Benefits of This Approach

1. **Focused Operations**: Only UPI verifier is active, reducing operational complexity
2. **Future-Ready**: SEPA and PIX infrastructure remains intact for future activation
3. **Easy Expansion**: Can activate additional verifiers without redeployment
4. **Maintained Compatibility**: All interfaces and contracts remain consistent

## Activation Commands for Future Use

When ready to expand to other regions:

```solidity
// Activate SEPA for European expansion
verifierRegistry.setVerifierActive(address(sepaVerifier), true);
regionalRegistry.setRegionActive(IRegionalRegistry.Region.EUROPE, true);

// Activate PIX for Brazilian expansion
verifierRegistry.setVerifierActive(address(pixVerifier), true);
regionalRegistry.setRegionActive(IRegionalRegistry.Region.SOUTH_AMERICA, true);
```

## Monitoring and Management

- Use `VerifierRegistry.getActiveVerifiers()` to check currently active verifiers
- Monitor UPI verifier performance through `VerifierRegistry.getVerifierStats()`
- Inactive verifiers can be updated and maintained without affecting operations

## Contract Files Status

✅ **UPIVerifier.sol** - Active and primary
⏸️ **SEPAVerifier.sol** - Deployed but inactive
⏸️ **PIXVerifier.sol** - Deployed but inactive

All contracts maintain their full functionality and can be activated when needed.