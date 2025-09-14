// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../../interfaces/IMerchantOperations.sol";
import "../../interfaces/IMerchantRegistry.sol";


contract Escrow is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    enum EscrowStatus {
        Active,
        Completed,
        Disputed,
        Cancelled,
        Expired
    }

    struct EscrowData {
        uint256 merchantId;
        address merchantOwner;
        address customer;
        address token;
        uint256 amount;
        uint256 createdAt;
        uint256 expiresAt;
        EscrowStatus status;
        string paymentMethodId;
        string description;
        bool merchantConfirmed;
        bool customerConfirmed;
    }

    mapping(uint256 => EscrowData) public escrows;
    mapping(uint256 => uint256[]) public merchantEscrows; // merchantId => escrowIds
    mapping(address => uint256[]) public customerEscrows;
    
    // External contracts
    IMerchantOperations public merchantOperations;
    IMerchantRegistry public merchantRegistry; // For view functions

    uint256 public escrowCounter;
    uint256 public defaultTimeout = 24 hours;
    uint256 public disputeTimeout = 7 days;
    address public feeRecipient;
    uint256 public platformFee = 25; // 0.25% in basis points
    address public escrowFactory; // Authorized factory contract

    event EscrowCreated(
        uint256 indexed escrowId,
        uint256 indexed merchantId,
        address indexed merchantOwner,
        address customer,
        address token,
        uint256 amount,
        string paymentMethodId
    );

    event EscrowCompleted(
        uint256 indexed escrowId,
        uint256 indexed merchantId,
        address indexed customer
    );

    event EscrowDisputed(
        uint256 indexed escrowId,
        address indexed disputeInitiator
    );

    event EscrowCancelled(
        uint256 indexed escrowId,
        address indexed cancelledBy
    );

    event MerchantRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event EscrowFactoryUpdated(address indexed oldFactory, address indexed newFactory);
    event FeeRecipientUpdated(address indexed newFeeRecipient);
    event PlatformFeeUpdated(uint256 newFee);

    constructor(
        address _merchantRegistry,
        address _feeRecipient,
        address _escrowFactory
    ) Ownable(msg.sender) {
        // Allow zero addresses for cross-chain deployment
        // These can be set later via setter functions
        
        _transferOwnership(msg.sender);
        
        if (_merchantRegistry != address(0)) {
            merchantOperations = IMerchantOperations(_merchantRegistry);
            merchantRegistry = IMerchantRegistry(_merchantRegistry);
        }
        
        require(_feeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _feeRecipient;
        
        if (_escrowFactory != address(0)) {
            escrowFactory = _escrowFactory;
        }
    }

    modifier onlyRegisteredMerchant(uint256 _merchantId) {
        require(merchantOperations.isMerchantRegistered(_merchantId), "Merchant not registered");
        require(merchantOperations.isAuthorizedForMerchant(msg.sender, _merchantId), "Not authorized");
        _;
    }

    modifier onlyEscrowFactory() {
        require(msg.sender == escrowFactory, "Only escrow factory");
        _;
    }

    modifier validEscrow(uint256 _escrowId) {
        require(_escrowId < escrowCounter, "Invalid escrow ID");
        require(escrows[_escrowId].status == EscrowStatus.Active, "Escrow not active");
        _;
    }

    function createEscrow(
        uint256 _merchantId,
        address _customer,
        address _token,
        uint256 _amount,
        string memory _paymentMethodId,
        string memory _description,
        uint256 _customTimeout
    ) external onlyRegisteredMerchant(_merchantId) whenNotPaused nonReentrant returns (uint256) {
        require(_customer != address(0), "Invalid customer address");
        require(_token != address(0), "Invalid token address");
        require(_amount > 0, "Amount must be greater than 0");
        require(bytes(_paymentMethodId).length > 0, "Payment method ID required");

        uint256 timeout = _customTimeout > 0 ? _customTimeout : defaultTimeout;
        uint256 escrowId = escrowCounter++;
        (, address merchantOwner, , , , , , , , , , , ) = merchantRegistry.getMerchantProfile(_merchantId);

        escrows[escrowId] = EscrowData({
            merchantId: _merchantId,
            merchantOwner: merchantOwner,
            customer: _customer,
            token: _token,
            amount: _amount,
            createdAt: block.timestamp,
            expiresAt: block.timestamp + timeout,
            status: EscrowStatus.Active,
            paymentMethodId: _paymentMethodId,
            description: _description,
            merchantConfirmed: false,
            customerConfirmed: false
        });

        merchantEscrows[_merchantId].push(escrowId);
        customerEscrows[_customer].push(escrowId);

        // Transfer tokens from customer to escrow
        IERC20(_token).safeTransferFrom(_customer, address(this), _amount);

        emit EscrowCreated(escrowId, _merchantId, merchantOwner, _customer, _token, _amount, _paymentMethodId);
        return escrowId;
    }

    function confirmPayment(uint256 _escrowId) external validEscrow(_escrowId) {
        EscrowData storage escrow = escrows[_escrowId];
        
        if (msg.sender == escrow.merchantOwner) {
            escrow.merchantConfirmed = true;
        } else if (msg.sender == escrow.customer) {
            escrow.customerConfirmed = true;
        } else {
            revert("Not authorized to confirm");
        }

        // Complete escrow if both parties confirmed
        if (escrow.merchantConfirmed && escrow.customerConfirmed) {
            _completeEscrow(_escrowId);
        }
    }

    function _completeEscrow(uint256 _escrowId) internal {
        EscrowData storage escrow = escrows[_escrowId];
        escrow.status = EscrowStatus.Completed;

        uint256 fee = (escrow.amount * platformFee) / 10000;
        uint256 merchantAmount = escrow.amount - fee;

        // Transfer fee to platform
        if (fee > 0) {
            IERC20(escrow.token).safeTransfer(feeRecipient, fee);
        }

        // Transfer remaining amount to merchant
        IERC20(escrow.token).safeTransfer(escrow.merchantOwner, merchantAmount);

        emit EscrowCompleted(_escrowId, escrow.merchantId, escrow.customer);
    }

    function disputeEscrow(uint256 _escrowId) external validEscrow(_escrowId) {
        EscrowData storage escrow = escrows[_escrowId];
        require(
            msg.sender == escrow.merchantOwner || msg.sender == escrow.customer,
            "Not authorized to dispute"
        );

        escrow.status = EscrowStatus.Disputed;
        escrow.expiresAt = block.timestamp + disputeTimeout;

        emit EscrowDisputed(_escrowId, msg.sender);
    }

    function cancelEscrow(uint256 _escrowId) external validEscrow(_escrowId) {
        EscrowData storage escrow = escrows[_escrowId];
        require(
            msg.sender == escrow.merchantOwner || msg.sender == escrow.customer,
            "Not authorized to cancel"
        );

        escrow.status = EscrowStatus.Cancelled;

        // Refund tokens to customer
        IERC20(escrow.token).safeTransfer(escrow.customer, escrow.amount);

        emit EscrowCancelled(_escrowId, msg.sender);
    }

    function expireEscrow(uint256 _escrowId) external {
        EscrowData storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.Active, "Escrow not active");
        require(block.timestamp > escrow.expiresAt, "Escrow not expired");

        escrow.status = EscrowStatus.Expired;

        // Refund tokens to customer on expiration
        IERC20(escrow.token).safeTransfer(escrow.customer, escrow.amount);
    }

    function resolveDispute(uint256 _escrowId, bool _favorMerchant) external onlyOwner {
        EscrowData storage escrow = escrows[_escrowId];
        require(escrow.status == EscrowStatus.Disputed, "Escrow not disputed");

        escrow.status = EscrowStatus.Completed;

        if (_favorMerchant) {
            uint256 fee = (escrow.amount * platformFee) / 10000;
            uint256 merchantAmount = escrow.amount - fee;

            if (fee > 0) {
                IERC20(escrow.token).safeTransfer(feeRecipient, fee);
            }
            IERC20(escrow.token).safeTransfer(escrow.merchantOwner, merchantAmount);
        } else {
            IERC20(escrow.token).safeTransfer(escrow.customer, escrow.amount);
        }

        emit EscrowCompleted(_escrowId, escrow.merchantId, escrow.customer);
    }

    function getEscrow(uint256 _escrowId) external view returns (EscrowData memory) {
        require(_escrowId < escrowCounter, "Invalid escrow ID");
        return escrows[_escrowId];
    }

    function getMerchantEscrows(uint256 _merchantId) external view returns (uint256[] memory) {
        return merchantEscrows[_merchantId];
    }

    function getCustomerEscrows(address _customer) external view returns (uint256[] memory) {
        return customerEscrows[_customer];
    }

    function updateFeeRecipient(address _newFeeRecipient) external onlyOwner {
        require(_newFeeRecipient != address(0), "Invalid fee recipient");
        feeRecipient = _newFeeRecipient;
        emit FeeRecipientUpdated(_newFeeRecipient);
    }

    function updatePlatformFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= 1000, "Fee too high"); // Max 10%
        platformFee = _newFee;
        emit PlatformFeeUpdated(_newFee);
    }

    function updateDefaultTimeout(uint256 _newTimeout) external onlyOwner {
        require(_newTimeout >= 1 hours, "Timeout too short");
        require(_newTimeout <= 30 days, "Timeout too long");
        defaultTimeout = _newTimeout;
    }

    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).safeTransfer(owner(), _amount);
    }

    // Admin functions
    function updateMerchantRegistry(address _merchantRegistry) external onlyOwner {
        require(_merchantRegistry != address(0), "Invalid merchant registry address");
        address oldRegistry = address(merchantRegistry);
        merchantRegistry = IMerchantRegistry(_merchantRegistry);
        emit MerchantRegistryUpdated(oldRegistry, _merchantRegistry);
    }

    function updateEscrowFactory(address _escrowFactory) external onlyOwner {
        require(_escrowFactory != address(0), "Invalid escrow factory address");
        address oldFactory = escrowFactory;
        escrowFactory = _escrowFactory;
        emit EscrowFactoryUpdated(oldFactory, _escrowFactory);
    }

    // Pause/Unpause functions
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}