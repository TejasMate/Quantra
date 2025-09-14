// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IRegionalRegistry.sol";

/**
 * @title MerchantRegistryLib
 * @dev Library to reduce contract size by extracting common functionality
 */
library MerchantRegistryLib {
    
    /**
     * @dev Validate merchant registration data
     */
    function validateRegistrationData(
        string calldata merchantName,
        string calldata kycDocumentHash,
        uint256 stakeAmount,
        uint256 minStake
    ) internal pure {
        require(bytes(merchantName).length > 0, "Merchant name required");
        require(bytes(kycDocumentHash).length > 0, "KYC document hash required");
        require(stakeAmount >= minStake, "Insufficient stake");
    }
    
    /**
     * @dev Calculate reputation adjustment
     */
    function calculateReputationAdjustment(
        uint256 successfulTransactions,
        uint256 totalTransactions,
        uint256 currentScore
    ) internal pure returns (uint256 newScore) {
        if (totalTransactions == 0) return currentScore;
        
        uint256 successRate = (successfulTransactions * 100) / totalTransactions;
        
        if (successRate >= 95 && currentScore < 1000) {
            newScore = currentScore + 1 > 1000 ? 1000 : currentScore + 1;
        } else if (successRate < 80 && currentScore > 0) {
            newScore = currentScore > 1 ? currentScore - 1 : 0;
        } else {
            newScore = currentScore;
        }
    }
    
    /**
     * @dev Validate payment method data
     */
    function validatePaymentMethod(
        string memory methodType,
        string memory identifier,
        string[] memory metadataKeys,
        string[] memory metadataValues
    ) internal pure {
        require(bytes(methodType).length > 0, "Method type required");
        require(bytes(identifier).length > 0, "Identifier required");
        require(metadataKeys.length == metadataValues.length, "Metadata arrays length mismatch");
    }
}
