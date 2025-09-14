// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title GovToken
 * @dev Enhanced governance token with delegation, permit, and voting capabilities
 */
contract GovToken is ERC20, ERC20Permit, ERC20Votes, ERC20Burnable, Ownable, Pausable {
    // Token distribution parameters
    uint256 public constant MAX_SUPPLY = 1_000_000_000e18; // 1 billion tokens
    uint256 public constant INITIAL_SUPPLY = 100_000_000e18; // 100 million initial
    
    // Vesting and distribution
    mapping(address => VestingSchedule) public vestingSchedules;
    mapping(address => bool) public minters;
    
    struct VestingSchedule {
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 startTime;
        uint256 duration;
        uint256 cliffDuration;
    }
    
    // Delegation tracking
    mapping(address => address) public delegationHistory;
    mapping(address => uint256) public delegationCount;
    
    event VestingScheduleCreated(
        address indexed beneficiary,
        uint256 totalAmount,
        uint256 startTime,
        uint256 duration,
        uint256 cliffDuration
    );
    
    event TokensReleased(address indexed beneficiary, uint256 amount);
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event DelegationChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);
    
    modifier onlyMinter() {
        require(minters[msg.sender] || msg.sender == owner(), "Not authorized to mint");
        _;
    }
    
    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    ) 
        ERC20(name, symbol) 
        ERC20Permit(name)
        Ownable(initialOwner)
    {
        
        // Mint initial supply to owner
        _mint(initialOwner, INITIAL_SUPPLY);
        
        // Add owner as initial minter
        minters[initialOwner] = true;
        emit MinterAdded(initialOwner);
    }
    
    /**
     * @dev Mint tokens (only by authorized minters)
     */
    function mint(address to, uint256 amount) external onlyMinter whenNotPaused {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
    }
    
    /**
     * @dev Create a vesting schedule for a beneficiary
     */
    function createVestingSchedule(
        address beneficiary,
        uint256 totalAmount,
        uint256 startTime,
        uint256 duration,
        uint256 cliffDuration
    ) external onlyOwner {
        require(beneficiary != address(0), "Invalid beneficiary");
        require(totalAmount > 0, "Amount must be > 0");
        require(duration > 0, "Duration must be > 0");
        require(cliffDuration <= duration, "Cliff cannot exceed duration");
        require(vestingSchedules[beneficiary].totalAmount == 0, "Schedule already exists");
        
        vestingSchedules[beneficiary] = VestingSchedule({
            totalAmount: totalAmount,
            releasedAmount: 0,
            startTime: startTime,
            duration: duration,
            cliffDuration: cliffDuration
        });
        
        // Mint the vested tokens to this contract
        require(totalSupply() + totalAmount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(address(this), totalAmount);
        
        emit VestingScheduleCreated(beneficiary, totalAmount, startTime, duration, cliffDuration);
    }
    
    /**
     * @dev Release vested tokens to beneficiary
     */
    function releaseVestedTokens(address beneficiary) external {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        require(schedule.totalAmount > 0, "No vesting schedule");
        
        uint256 releasableAmount = getReleasableAmount(beneficiary);
        require(releasableAmount > 0, "No tokens to release");
        
        schedule.releasedAmount += releasableAmount;
        _transfer(address(this), beneficiary, releasableAmount);
        
        emit TokensReleased(beneficiary, releasableAmount);
    }
    
    /**
     * @dev Get the amount of tokens that can be released
     */
    function getReleasableAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule memory schedule = vestingSchedules[beneficiary];
        if (schedule.totalAmount == 0) return 0;
        
        if (block.timestamp < schedule.startTime + schedule.cliffDuration) {
            return 0;
        }
        
        uint256 elapsedTime = block.timestamp - schedule.startTime;
        if (elapsedTime >= schedule.duration) {
            return schedule.totalAmount - schedule.releasedAmount;
        }
        
        uint256 vestedAmount = (schedule.totalAmount * elapsedTime) / schedule.duration;
        return vestedAmount - schedule.releasedAmount;
    }
    
    /**
     * @dev Add a minter
     */
    function addMinter(address minter) external onlyOwner {
        require(minter != address(0), "Invalid minter address");
        minters[minter] = true;
        emit MinterAdded(minter);
    }
    
    /**
     * @dev Remove a minter
     */
    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev Enhanced delegation with tracking
     */
    function delegate(address delegatee) public override {
        address currentDelegate = delegates(msg.sender);
        
        if (currentDelegate != delegatee) {
            if (currentDelegate != address(0)) {
                delegationCount[currentDelegate]--;
            }
            if (delegatee != address(0)) {
                delegationCount[delegatee]++;
            }
            
            delegationHistory[msg.sender] = delegatee;
            emit DelegationChanged(msg.sender, currentDelegate, delegatee);
        }
        
        super.delegate(delegatee);
    }
    
    /**
     * @dev Get delegation statistics
     */
    function getDelegationStats(address account) external view returns (
        address currentDelegate,
        uint256 votingPower,
        uint256 delegatorsCount
    ) {
        currentDelegate = delegates(account);
        votingPower = getVotes(account);
        delegatorsCount = delegationCount[account];
    }
    
    /**
     * @dev Pause token transfers (emergency)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause token transfers
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Override transfer to include pause functionality
     */
    // Required overrides for multiple inheritance
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Votes) whenNotPaused {
        super._update(from, to, value);
    }
    
    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}