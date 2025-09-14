// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IMerchantRegistry.sol";
import "../interfaces/IPriceFeed.sol";

contract CollateralVault is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct CollateralDeposit {
        address merchant;
        address token;
        uint256 amount;
        uint256 depositTime;
        uint256 lockPeriod; // in seconds
        bool isLocked;
        string purpose; // "instant_withdrawal", "dispute_resolution", etc.
    }

    struct MerchantCollateral {
        uint256 totalETH;
        mapping(address => uint256) tokenBalances;
        uint256[] depositIds;
        bool canInstantWithdraw;
    }

    IMerchantRegistry public merchantRegistry;
    
    mapping(uint256 => CollateralDeposit) public deposits;
    mapping(address => MerchantCollateral) public merchantCollaterals;
    mapping(address => bool) public supportedTokens;
    mapping(address => uint256) public minimumCollateral; // minimum collateral per merchant
    mapping(address => IPriceFeed) public priceFeeds; // token => price feed
    mapping(address => uint256) public liquidationThresholds; // token => threshold (basis points)
    
    uint256 public depositCounter;
    uint256 public defaultLockPeriod = 7 days;
    uint256 public instantWithdrawalThreshold = 1 ether; // minimum ETH for instant withdrawal
    uint256 public constant DEFAULT_LIQUIDATION_THRESHOLD = 7500; // 75% in basis points
    uint256 public constant LIQUIDATION_PENALTY = 1000; // 10% penalty in basis points
    uint256 public constant BASIS_POINTS = 10000;
    
    // Events
    event CollateralDeposited(
        uint256 indexed depositId,
        address indexed merchant,
        address token,
        uint256 amount,
        string purpose
    );
    
    event CollateralWithdrawn(
        uint256 indexed depositId,
        address indexed merchant,
        address token,
        uint256 amount
    );
    
    event InstantWithdrawalEnabled(address indexed merchant, bool enabled);
    event TokenSupported(address indexed token, bool supported);
    event MinimumCollateralUpdated(address indexed merchant, uint256 amount);
    event PriceFeedUpdated(address indexed token, address indexed priceFeed);
    event LiquidationThresholdUpdated(address indexed token, uint256 threshold);
    event CollateralLiquidated(
        address indexed merchant,
        address indexed token,
        uint256 amount,
        uint256 penalty,
        address indexed liquidator
    );
    
    constructor(address _merchantRegistry) Ownable(msg.sender) {
        require(_merchantRegistry != address(0), "Invalid merchant registry");
        _transferOwnership(msg.sender);
        merchantRegistry = IMerchantRegistry(_merchantRegistry);
        
        // ETH is always supported (represented as address(0))
        supportedTokens[address(0)] = true;
    }

    modifier onlyRegisteredMerchant() {
        uint256 merchantId = merchantRegistry.ownerToMerchantId(msg.sender);
        require(
            merchantId > 0 && merchantRegistry.isMerchantRegistered(msg.sender),
            "Merchant not registered"
        );
        _;
    }

    modifier validToken(address _token) {
        require(supportedTokens[_token], "Token not supported");
        _;
    }

    function depositETHCollateral(string memory _purpose) 
        external 
        payable 
        onlyRegisteredMerchant 
        whenNotPaused 
        nonReentrant 
        returns (uint256) 
    {
        require(msg.value > 0, "Must deposit some ETH");
        require(bytes(_purpose).length > 0, "Purpose required");
        
        depositCounter++;
        uint256 depositId = depositCounter;
        
        deposits[depositId] = CollateralDeposit({
            merchant: msg.sender,
            token: address(0), // ETH
            amount: msg.value,
            depositTime: block.timestamp,
            lockPeriod: defaultLockPeriod,
            isLocked: true,
            purpose: _purpose
        });
        
        MerchantCollateral storage collateral = merchantCollaterals[msg.sender];
        collateral.totalETH += msg.value;
        collateral.depositIds.push(depositId);
        
        // Enable instant withdrawal if threshold is met
        if (collateral.totalETH >= instantWithdrawalThreshold) {
            collateral.canInstantWithdraw = true;
            emit InstantWithdrawalEnabled(msg.sender, true);
        }
        
        emit CollateralDeposited(depositId, msg.sender, address(0), msg.value, _purpose);
        
        return depositId;
    }

    function depositTokenCollateral(
        address _token,
        uint256 _amount,
        string memory _purpose
    ) 
        external 
        onlyRegisteredMerchant 
        validToken(_token) 
        whenNotPaused 
        nonReentrant 
        returns (uint256) 
    {
        require(_token != address(0), "Use depositETHCollateral for ETH");
        require(_amount > 0, "Must deposit some tokens");
        require(bytes(_purpose).length > 0, "Purpose required");
        
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        
        depositCounter++;
        uint256 depositId = depositCounter;
        
        deposits[depositId] = CollateralDeposit({
            merchant: msg.sender,
            token: _token,
            amount: _amount,
            depositTime: block.timestamp,
            lockPeriod: defaultLockPeriod,
            isLocked: true,
            purpose: _purpose
        });
        
        MerchantCollateral storage collateral = merchantCollaterals[msg.sender];
        collateral.tokenBalances[_token] += _amount;
        collateral.depositIds.push(depositId);
        
        emit CollateralDeposited(depositId, msg.sender, _token, _amount, _purpose);
        
        return depositId;
    }

    function withdrawCollateral(uint256 _depositId) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(_depositId <= depositCounter && _depositId > 0, "Invalid deposit ID");
        
        CollateralDeposit storage deposit = deposits[_depositId];
        require(deposit.merchant == msg.sender, "Not your deposit");
        require(deposit.amount > 0, "Already withdrawn");
        
        // Check if lock period has passed or instant withdrawal is enabled
        bool canWithdraw = false;
        
        if (merchantCollaterals[msg.sender].canInstantWithdraw) {
            canWithdraw = true;
        } else if (block.timestamp >= deposit.depositTime + deposit.lockPeriod) {
            canWithdraw = true;
        }
        
        require(canWithdraw, "Collateral still locked");
        
        uint256 amount = deposit.amount;
        address token = deposit.token;
        
        // Update balances
        if (token == address(0)) {
            merchantCollaterals[msg.sender].totalETH -= amount;
        } else {
            merchantCollaterals[msg.sender].tokenBalances[token] -= amount;
        }
        
        // Mark as withdrawn
        deposit.amount = 0;
        deposit.isLocked = false;
        
        // Transfer funds
        if (token == address(0)) {
            payable(msg.sender).transfer(amount);
        } else {
            IERC20(token).safeTransfer(msg.sender, amount);
        }
        
        // Check if instant withdrawal should be disabled
        if (merchantCollaterals[msg.sender].totalETH < instantWithdrawalThreshold) {
            merchantCollaterals[msg.sender].canInstantWithdraw = false;
            emit InstantWithdrawalEnabled(msg.sender, false);
        }
        
        emit CollateralWithdrawn(_depositId, msg.sender, token, amount);
    }

    function getMerchantCollateral(address _merchant) 
        external 
        view 
        returns (
            uint256 totalETH,
            bool canInstantWithdraw,
            uint256[] memory depositIds
        ) 
    {
        MerchantCollateral storage collateral = merchantCollaterals[_merchant];
        return (
            collateral.totalETH,
            collateral.canInstantWithdraw,
            collateral.depositIds
        );
    }

    function getMerchantTokenBalance(address _merchant, address _token) 
        external 
        view 
        returns (uint256) 
    {
        return merchantCollaterals[_merchant].tokenBalances[_token];
    }

    function getDeposit(uint256 _depositId) 
        external 
        view 
        returns (CollateralDeposit memory) 
    {
        require(_depositId <= depositCounter && _depositId > 0, "Invalid deposit ID");
        return deposits[_depositId];
    }

    function canWithdrawDeposit(uint256 _depositId) external view returns (bool) {
        require(_depositId <= depositCounter && _depositId > 0, "Invalid deposit ID");
        
        CollateralDeposit storage deposit = deposits[_depositId];
        
        if (deposit.amount == 0) return false; // Already withdrawn
        
        if (merchantCollaterals[deposit.merchant].canInstantWithdraw) {
            return true;
        }
        
        return block.timestamp >= deposit.depositTime + deposit.lockPeriod;
    }

    function getTimeUntilUnlock(uint256 _depositId) external view returns (uint256) {
        require(_depositId <= depositCounter && _depositId > 0, "Invalid deposit ID");
        
        CollateralDeposit storage deposit = deposits[_depositId];
        
        if (merchantCollaterals[deposit.merchant].canInstantWithdraw) {
            return 0;
        }
        
        uint256 unlockTime = deposit.depositTime + deposit.lockPeriod;
        if (block.timestamp >= unlockTime) {
            return 0;
        }
        
        return unlockTime - block.timestamp;
    }

    // Admin functions
    function supportToken(address _token, bool _supported) external onlyOwner {
        supportedTokens[_token] = _supported;
        emit TokenSupported(_token, _supported);
    }

    function setMinimumCollateral(address _merchant, uint256 _amount) external onlyOwner {
        minimumCollateral[_merchant] = _amount;
        emit MinimumCollateralUpdated(_merchant, _amount);
    }

    function setDefaultLockPeriod(uint256 _lockPeriod) external onlyOwner {
        require(_lockPeriod <= 30 days, "Lock period too long");
        defaultLockPeriod = _lockPeriod;
    }

    function setInstantWithdrawalThreshold(uint256 _threshold) external onlyOwner {
        instantWithdrawalThreshold = _threshold;
    }

    // Oracle Management Functions
    function setPriceFeed(address _token, address _priceFeed) external onlyOwner {
        require(_token != address(0) || _priceFeed != address(0), "Invalid parameters");
        priceFeeds[_token] = IPriceFeed(_priceFeed);
        emit PriceFeedUpdated(_token, _priceFeed);
    }

    function setLiquidationThreshold(address _token, uint256 _threshold) external onlyOwner {
        require(_threshold >= 5000 && _threshold <= 9000, "Threshold must be 50-90%");
        liquidationThresholds[_token] = _threshold;
        emit LiquidationThresholdUpdated(_token, _threshold);
    }

    // Liquidation Functions
    function getCollateralValue(address _merchant, address _token) public view returns (uint256 value, bool isValid) {
        if (_token == address(0)) {
            // ETH collateral
            uint256 ethAmount = merchantCollaterals[_merchant].totalETH;
            if (address(priceFeeds[_token]) != address(0)) {
                (int256 price, uint256 timestamp, uint8 decimals) = priceFeeds[_token].getLatestPrice();
                if (price > 0 && timestamp > 0) {
                    return (ethAmount * uint256(price) / (10 ** decimals), true);
                }
            }
            // Fallback: assume 1 ETH = 1 USD for simplicity
            return (ethAmount, false);
        } else {
            // Token collateral
            uint256 tokenAmount = merchantCollaterals[_merchant].tokenBalances[_token];
            if (address(priceFeeds[_token]) != address(0)) {
                (int256 price, uint256 timestamp, uint8 decimals) = priceFeeds[_token].getLatestPrice();
                if (price > 0 && timestamp > 0) {
                    return (tokenAmount * uint256(price) / (10 ** decimals), true);
                }
            }
            return (0, false);
        }
    }

    function isLiquidatable(address _merchant, address _token) public view returns (bool) {
        uint256 threshold = liquidationThresholds[_token];
        if (threshold == 0) {
            threshold = DEFAULT_LIQUIDATION_THRESHOLD;
        }
        
        (uint256 collateralValue, bool isValid) = getCollateralValue(_merchant, _token);
        if (!isValid) return false;
        
        uint256 minimumRequired = minimumCollateral[_merchant];
        if (minimumRequired == 0) return false;
        
        uint256 requiredValue = minimumRequired * threshold / BASIS_POINTS;
        return collateralValue < requiredValue;
    }

    function liquidateCollateral(address _merchant, address _token, uint256 _amount) 
        external 
        nonReentrant 
        whenNotPaused 
        returns (uint256 liquidatedAmount, uint256 penalty) 
    {
        require(isLiquidatable(_merchant, _token), "Collateral not liquidatable");
        require(_amount > 0, "Invalid liquidation amount");
        
        uint256 availableAmount;
        if (_token == address(0)) {
            availableAmount = merchantCollaterals[_merchant].totalETH;
        } else {
            availableAmount = merchantCollaterals[_merchant].tokenBalances[_token];
        }
        
        require(availableAmount >= _amount, "Insufficient collateral");
        
        // Calculate penalty
        penalty = _amount * LIQUIDATION_PENALTY / BASIS_POINTS;
        liquidatedAmount = _amount - penalty;
        
        // Update merchant balances
        if (_token == address(0)) {
            merchantCollaterals[_merchant].totalETH -= _amount;
            // Transfer to liquidator
            payable(msg.sender).transfer(liquidatedAmount);
            // Penalty goes to contract owner
            payable(owner()).transfer(penalty);
        } else {
            merchantCollaterals[_merchant].tokenBalances[_token] -= _amount;
            // Transfer to liquidator
            IERC20(_token).safeTransfer(msg.sender, liquidatedAmount);
            // Penalty goes to contract owner
            IERC20(_token).safeTransfer(owner(), penalty);
        }
        
        emit CollateralLiquidated(_merchant, _token, _amount, penalty, msg.sender);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // Emergency functions
    function emergencyWithdraw(uint256 _depositId) external onlyOwner {
        require(_depositId <= depositCounter && _depositId > 0, "Invalid deposit ID");
        
        CollateralDeposit storage deposit = deposits[_depositId];
        require(deposit.amount > 0, "Already withdrawn");
        
        uint256 amount = deposit.amount;
        address token = deposit.token;
        address merchant = deposit.merchant;
        
        // Update balances
        if (token == address(0)) {
            merchantCollaterals[merchant].totalETH -= amount;
        } else {
            merchantCollaterals[merchant].tokenBalances[token] -= amount;
        }
        
        // Mark as withdrawn
        deposit.amount = 0;
        deposit.isLocked = false;
        
        // Transfer to merchant
        if (token == address(0)) {
            payable(merchant).transfer(amount);
        } else {
            IERC20(token).safeTransfer(merchant, amount);
        }
        
        emit CollateralWithdrawn(_depositId, merchant, token, amount);
    }

    receive() external payable {
        // Accept ETH deposits
        revert("Use depositETHCollateral function");
    }
}