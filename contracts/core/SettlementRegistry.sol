// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title SettlementRegistry
 * @dev On-chain registry for crypto-to-fiat settlements with proof tracking
 * Records settlement requests, withdrawals, and completion proofs for auditability
 */
contract SettlementRegistry is AccessControl, ReentrancyGuard, Pausable {

    // Roles
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");
    bytes32 public constant DISPUTE_RESOLVER_ROLE = keccak256("DISPUTE_RESOLVER_ROLE");

    // Settlement status enum
    enum SettlementStatus {
        Pending,      // Settlement queued, dispute period active
        Ready,        // Dispute period ended, ready for execution
        Withdrawn,    // Crypto withdrawn from escrow
        Completed,    // Fiat settlement completed with proof
        Disputed,     // Settlement disputed, needs resolution
        Failed,       // Settlement failed, funds returned
        Cancelled     // Settlement cancelled before execution
    }

    // Payment method enum
    enum PaymentMethod {
        UPI,    // Indian Unified Payments Interface
        PIX,    // Brazilian Instant Payment System
        SEPA    // European Single Euro Payments Area
    }

    // Settlement record structure (simplified to avoid stack depth issues)
    struct SettlementRecord {
        string settlementId;        // Unique settlement identifier
        string escrowId;           // Associated escrow contract ID
        address escrowAddress;     // Escrow contract address
        address payer;             // Payer wallet address
        string merchantId;         // Merchant identifier
        address settler;           // Settler wallet address
        uint256 cryptoAmount;      // Amount in crypto wei
        string tokenSymbol;        // Token symbol (ETH, USDC, etc)
        PaymentMethod paymentMethod; // Fiat payment method
        uint256 fiatAmount;        // Amount in fiat (scaled by 1e6 for decimals)
        string fiatCurrency;       // Fiat currency code (INR, BRL, EUR)
        uint256 disputePeriodEnd;  // Timestamp when dispute period ends
        SettlementStatus status;   // Current settlement status
        uint256 createdAt;         // Settlement creation timestamp
    }

    // Extended settlement data (stored separately to avoid stack depth)
    struct SettlementExtended {
        uint256 settlementFee;     // Settler fee in crypto wei
        uint256 exchangeRate;      // Exchange rate (scaled by 1e6)
        uint256 withdrawnAt;       // Crypto withdrawal timestamp
        uint256 completedAt;       // Fiat settlement completion timestamp
        string cryptoTxHash;       // Hash of crypto withdrawal transaction
        string fiatTxRef;          // Fiat transaction reference (UTR/TxID)
        string proofHash;          // Hash of settlement proof documents
        uint256 chainId;           // Blockchain network ID
    }

    // State variables
    uint256 private _settlementCounter;
    mapping(string => SettlementRecord) public settlements;
    mapping(string => SettlementExtended) public settlementsExtended;
    mapping(address => string[]) public settlerToSettlements;
    mapping(string => string[]) public merchantToSettlements;
    mapping(address => string[]) public payerToSettlements;
    mapping(string => string[]) public escrowToSettlements;

    // Configuration
    uint256 public defaultDisputePeriod = 72 hours;
    uint256 public maxDisputePeriod = 7 days;
    uint256 public settlementFeeRate = 50; // 0.5% = 50/10000
    uint256 public constant FEE_DENOMINATOR = 10000;

    // Events
    event SettlementRegistered(
        string indexed settlementId,
        string indexed escrowId,
        string indexed merchantId,
        address payer,
        address settler,
        uint256 cryptoAmount,
        string tokenSymbol,
        PaymentMethod paymentMethod,
        uint256 fiatAmount,
        string fiatCurrency,
        uint256 disputePeriodEnd
    );

    event SettlementWithdrawn(
        string indexed settlementId,
        address indexed settler,
        uint256 amount,
        string tokenSymbol,
        string cryptoTxHash,
        uint256 timestamp
    );

    event SettlementCompleted(
        string indexed settlementId,
        address indexed settler,
        string fiatTxRef,
        string proofHash,
        uint256 timestamp
    );

    event SettlementDisputed(
        string indexed settlementId,
        address indexed disputer,
        string reason,
        uint256 timestamp
    );

    event SettlementResolved(
        string indexed settlementId,
        address indexed resolver,
        SettlementStatus resolution,
        string reason,
        uint256 timestamp
    );

    event SettlementCancelled(
        string indexed settlementId,
        address indexed canceller,
        string reason,
        uint256 timestamp
    );

    // Modifiers
    modifier onlySettler() {
        require(hasRole(SETTLER_ROLE, msg.sender), "SettlementRegistry: caller is not a settler");
        _;
    }

    modifier onlyDAO() {
        require(hasRole(DAO_ROLE, msg.sender), "SettlementRegistry: caller is not DAO");
        _;
    }

    modifier validSettlement(string memory settlementId) {
        require(bytes(settlements[settlementId].settlementId).length > 0, "SettlementRegistry: settlement does not exist");
        _;
    }

    constructor(address daoAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DAO_ROLE, daoAddress);
        _grantRole(DISPUTE_RESOLVER_ROLE, daoAddress);
    }

    /**
     * @dev Register a new settlement request
     */
    function registerSettlement(
        string memory settlementId,
        string memory escrowId,
        address escrowAddress,
        address payer,
        string memory merchantId,
        uint256 cryptoAmount,
        string memory tokenSymbol,
        PaymentMethod paymentMethod,
        uint256 fiatAmount,
        string memory fiatCurrency,
        uint256 exchangeRate,
        uint256 disputePeriod
    ) external onlySettler whenNotPaused nonReentrant {
        require(bytes(settlementId).length > 0, "SettlementRegistry: invalid settlement ID");
        require(bytes(settlements[settlementId].settlementId).length == 0, "SettlementRegistry: settlement already exists");
        require(escrowAddress != address(0), "SettlementRegistry: invalid escrow address");
        require(payer != address(0), "SettlementRegistry: invalid payer address");
        require(cryptoAmount > 0, "SettlementRegistry: invalid crypto amount");
        require(fiatAmount > 0, "SettlementRegistry: invalid fiat amount");
        require(disputePeriod <= maxDisputePeriod, "SettlementRegistry: dispute period too long");

        uint256 disputePeriodToUse = disputePeriod > 0 ? disputePeriod : defaultDisputePeriod;
        uint256 settlementFee = (cryptoAmount * settlementFeeRate) / FEE_DENOMINATOR;

        SettlementRecord memory settlement = SettlementRecord({
            settlementId: settlementId,
            escrowId: escrowId,
            escrowAddress: escrowAddress,
            payer: payer,
            merchantId: merchantId,
            settler: msg.sender,
            cryptoAmount: cryptoAmount,
            tokenSymbol: tokenSymbol,
            paymentMethod: paymentMethod,
            fiatAmount: fiatAmount,
            fiatCurrency: fiatCurrency,
            disputePeriodEnd: block.timestamp + disputePeriodToUse,
            status: SettlementStatus.Pending,
            createdAt: block.timestamp
        });

        SettlementExtended memory extended = SettlementExtended({
            settlementFee: settlementFee,
            exchangeRate: exchangeRate,
            withdrawnAt: 0,
            completedAt: 0,
            cryptoTxHash: "",
            fiatTxRef: "",
            proofHash: "",
            chainId: block.chainid
        });

        settlements[settlementId] = settlement;
        settlementsExtended[settlementId] = extended;
        settlerToSettlements[msg.sender].push(settlementId);
        merchantToSettlements[merchantId].push(settlementId);
        payerToSettlements[payer].push(settlementId);
        escrowToSettlements[escrowId].push(settlementId);

        _settlementCounter++;

        emit SettlementRegistered(
            settlementId,
            escrowId,
            merchantId,
            payer,
            msg.sender,
            cryptoAmount,
            tokenSymbol,
            paymentMethod,
            fiatAmount,
            fiatCurrency,
            settlement.disputePeriodEnd
        );
    }

    /**
     * @dev Record crypto withdrawal from escrow
     */
    function recordWithdrawal(
        string memory settlementId,
        string memory cryptoTxHash
    ) external onlySettler validSettlement(settlementId) whenNotPaused nonReentrant {
        SettlementRecord storage settlement = settlements[settlementId];
        SettlementExtended storage extended = settlementsExtended[settlementId];
        
        require(settlement.settler == msg.sender, "SettlementRegistry: not settlement owner");
        require(settlement.status == SettlementStatus.Pending || settlement.status == SettlementStatus.Ready, "SettlementRegistry: invalid status for withdrawal");
        require(block.timestamp >= settlement.disputePeriodEnd, "SettlementRegistry: dispute period not ended");
        require(bytes(cryptoTxHash).length > 0, "SettlementRegistry: invalid transaction hash");

        settlement.status = SettlementStatus.Withdrawn;
        extended.withdrawnAt = block.timestamp;
        extended.cryptoTxHash = cryptoTxHash;

        emit SettlementWithdrawn(
            settlementId,
            msg.sender,
            settlement.cryptoAmount,
            settlement.tokenSymbol,
            cryptoTxHash,
            block.timestamp
        );
    }

    /**
     * @dev Record fiat settlement completion with proof
     */
    function recordCompletion(
        string memory settlementId,
        string memory fiatTxRef,
        string memory proofHash
    ) external onlySettler validSettlement(settlementId) whenNotPaused nonReentrant {
        SettlementRecord storage settlement = settlements[settlementId];
        SettlementExtended storage extended = settlementsExtended[settlementId];
        
        require(settlement.settler == msg.sender, "SettlementRegistry: not settlement owner");
        require(settlement.status == SettlementStatus.Withdrawn, "SettlementRegistry: crypto not withdrawn");
        require(bytes(fiatTxRef).length > 0, "SettlementRegistry: invalid fiat transaction reference");
        require(bytes(proofHash).length > 0, "SettlementRegistry: invalid proof hash");

        settlement.status = SettlementStatus.Completed;
        extended.completedAt = block.timestamp;
        extended.fiatTxRef = fiatTxRef;
        extended.proofHash = proofHash;

        emit SettlementCompleted(
            settlementId,
            msg.sender,
            fiatTxRef,
            proofHash,
            block.timestamp
        );
    }

    /**
     * @dev Dispute a settlement
     */
    function disputeSettlement(
        string memory settlementId,
        string memory reason
    ) external validSettlement(settlementId) whenNotPaused {
        SettlementRecord storage settlement = settlements[settlementId];
        
        require(
            msg.sender == settlement.payer || 
            hasRole(DAO_ROLE, msg.sender) || 
            hasRole(DISPUTE_RESOLVER_ROLE, msg.sender),
            "SettlementRegistry: not authorized to dispute"
        );
        require(
            settlement.status == SettlementStatus.Pending || 
            settlement.status == SettlementStatus.Ready || 
            settlement.status == SettlementStatus.Withdrawn,
            "SettlementRegistry: cannot dispute completed settlement"
        );

        settlement.status = SettlementStatus.Disputed;

        emit SettlementDisputed(settlementId, msg.sender, reason, block.timestamp);
    }

    /**
     * @dev Resolve a disputed settlement
     */
    function resolveDispute(
        string memory settlementId,
        SettlementStatus resolution,
        string memory reason
    ) external validSettlement(settlementId) whenNotPaused {
        require(hasRole(DISPUTE_RESOLVER_ROLE, msg.sender), "SettlementRegistry: not authorized to resolve");
        
        SettlementRecord storage settlement = settlements[settlementId];
        require(settlement.status == SettlementStatus.Disputed, "SettlementRegistry: settlement not disputed");
        require(
            resolution == SettlementStatus.Pending || 
            resolution == SettlementStatus.Failed || 
            resolution == SettlementStatus.Completed,
            "SettlementRegistry: invalid resolution"
        );

        settlement.status = resolution;

        emit SettlementResolved(settlementId, msg.sender, resolution, reason, block.timestamp);
    }

    /**
     * @dev Cancel a settlement before execution
     */
    function cancelSettlement(
        string memory settlementId,
        string memory reason
    ) external validSettlement(settlementId) whenNotPaused {
        SettlementRecord storage settlement = settlements[settlementId];
        
        require(
            msg.sender == settlement.settler || 
            msg.sender == settlement.payer || 
            hasRole(DAO_ROLE, msg.sender),
            "SettlementRegistry: not authorized to cancel"
        );
        require(settlement.status == SettlementStatus.Pending, "SettlementRegistry: cannot cancel processed settlement");

        settlement.status = SettlementStatus.Cancelled;

        emit SettlementCancelled(settlementId, msg.sender, reason, block.timestamp);
    }

    // View functions

    /**
     * @dev Get settlement details
     */
    function getSettlement(string memory settlementId) external view returns (SettlementRecord memory) {
        return settlements[settlementId];
    }

    /**
     * @dev Get settlement extended data
     */
    function getSettlementExtended(string memory settlementId) external view returns (SettlementExtended memory) {
        return settlementsExtended[settlementId];
    }

    /**
     * @dev Get settlements by settler
     */
    function getSettlementsBySeller(address settler) external view returns (string[] memory) {
        return settlerToSettlements[settler];
    }

    /**
     * @dev Get settlements by merchant
     */
    function getSettlementsByMerchant(string memory merchantId) external view returns (string[] memory) {
        return merchantToSettlements[merchantId];
    }

    /**
     * @dev Get settlements by payer
     */
    function getSettlementsByPayer(address payer) external view returns (string[] memory) {
        return payerToSettlements[payer];
    }

    /**
     * @dev Get settlements by escrow
     */
    function getSettlementsByEscrow(string memory escrowId) external view returns (string[] memory) {
        return escrowToSettlements[escrowId];
    }

    /**
     * @dev Check if settlement is ready for execution
     */
    function isSettlementReady(string memory settlementId) external view validSettlement(settlementId) returns (bool) {
        SettlementRecord memory settlement = settlements[settlementId];
        return settlement.status == SettlementStatus.Pending && block.timestamp >= settlement.disputePeriodEnd;
    }

    /**
     * @dev Get total settlements count
     */
    function getTotalSettlements() external view returns (uint256) {
        return _settlementCounter;
    }

    // Admin functions

    /**
     * @dev Add settler role
     */
    function addSettler(address settler) external onlyDAO {
        grantRole(SETTLER_ROLE, settler);
    }

    /**
     * @dev Remove settler role
     */
    function removeSettler(address settler) external onlyDAO {
        revokeRole(SETTLER_ROLE, settler);
    }

    /**
     * @dev Update settlement fee rate
     */
    function updateSettlementFeeRate(uint256 newRate) external onlyDAO {
        require(newRate <= 500, "SettlementRegistry: fee rate too high"); // Max 5%
        settlementFeeRate = newRate;
    }

    /**
     * @dev Update default dispute period
     */
    function updateDefaultDisputePeriod(uint256 newPeriod) external onlyDAO {
        require(newPeriod <= maxDisputePeriod, "SettlementRegistry: period too long");
        defaultDisputePeriod = newPeriod;
    }

    /**
     * @dev Pause contract
     */
    function pause() external onlyDAO {
        _pause();
    }

    /**
     * @dev Unpause contract
     */
    function unpause() external onlyDAO {
        _unpause();
    }
}