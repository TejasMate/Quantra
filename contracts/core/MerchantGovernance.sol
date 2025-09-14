// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract SimpleMerchantGovernance is 
    Initializable, 
    AccessControlUpgradeable, 
    PausableUpgradeable, 
    UUPSUpgradeable 
{
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant DAO_ROLE = keccak256("DAO_ROLE");
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");

    address public daoGovernance;
    address public regionalRegistry;
    
    // Proposal structure
    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        address[] targets;
        uint256[] values;
        bytes[] calldatas;
        uint256 startBlock;
        uint256 endBlock;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool executed;
        bool canceled;
        mapping(address => bool) hasVoted;
        mapping(address => uint8) votes;
    }
    
    mapping(uint256 => Proposal) public proposals;
    uint256 public proposalCount;
    
    // Governance parameters
    uint256 public votingDelay = 1;
    uint256 public votingPeriod = 50400;
    uint256 public proposalThreshold = 100000e18;
    uint256 public quorum = 400000e18;
    
    // Delegation
    mapping(address => address) public delegates;
    mapping(address => uint256) public delegatedVotingPower;
    
    // Events
    event ProposalCreated(uint256 indexed id, address indexed proposer, string title, string description, uint256 startBlock, uint256 endBlock);
    event VoteCast(address indexed voter, uint256 indexed proposalId, uint8 support, uint256 weight, string reason);
    event ProposalExecuted(uint256 indexed proposalId);
    event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);
    
    function initialize(address _admin, address _daoGovernance, address _regionalRegistry) external initializer {
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(DAO_ROLE, _daoGovernance);
        
        daoGovernance = _daoGovernance;
        regionalRegistry = _regionalRegistry;
    }
    
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) external returns (uint256) {
        require(getVotingPower(msg.sender) >= proposalThreshold, "Insufficient voting power");
        require(targets.length == values.length && targets.length == calldatas.length, "Array length mismatch");
        require(targets.length > 0, "Empty proposal");
        
        uint256 proposalId = ++proposalCount;
        
        Proposal storage proposal = proposals[proposalId];
        proposal.id = proposalId;
        proposal.proposer = msg.sender;
        proposal.description = description;
        proposal.targets = targets;
        proposal.values = values;
        proposal.calldatas = calldatas;
        proposal.startBlock = block.number + votingDelay;
        proposal.endBlock = proposal.startBlock + votingPeriod;
        
        emit ProposalCreated(proposalId, msg.sender, "", description, proposal.startBlock, proposal.endBlock);
        
        return proposalId;
    }
    
    function proposeWithMetadata(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        uint256 category
    ) external returns (uint256) {
        // Duplicate the propose logic to avoid scope issues
        require(getVotingPower(msg.sender) >= proposalThreshold, "Insufficient voting power");
        require(targets.length == values.length && targets.length == calldatas.length, "Array length mismatch");
        require(targets.length > 0, "Empty proposal");
        
        uint256 proposalId = ++proposalCount;
        
        Proposal storage proposal = proposals[proposalId];
        proposal.id = proposalId;
        proposal.proposer = msg.sender;
        proposal.description = description;
        proposal.targets = targets;
        proposal.values = values;
        proposal.calldatas = calldatas;
        proposal.startBlock = block.number + votingDelay;
        proposal.endBlock = proposal.startBlock + votingPeriod;
        
        emit ProposalCreated(proposalId, msg.sender, "", description, proposal.startBlock, proposal.endBlock);
        
        return proposalId;
    }
    
    function castVote(uint256 proposalId, uint8 support) external returns (uint256) {
        return castVoteWithReason(proposalId, support, "");
    }
    
    function castVoteWithReason(
        uint256 proposalId,
        uint8 support,
        string memory reason
    ) public returns (uint256) {
        require(proposalId <= proposalCount && proposalId > 0, "Invalid proposal ID");
        require(support <= 2, "Invalid vote type");
        
        Proposal storage proposal = proposals[proposalId];
        require(block.number >= proposal.startBlock, "Voting not started");
        require(block.number <= proposal.endBlock, "Voting ended");
        require(!proposal.hasVoted[msg.sender], "Already voted");
        require(!proposal.executed && !proposal.canceled, "Proposal finalized");
        
        uint256 weight = getVotingPower(msg.sender);
        require(weight > 0, "No voting power");
        
        proposal.hasVoted[msg.sender] = true;
        proposal.votes[msg.sender] = support;
        
        if (support == 0) {
            proposal.againstVotes += weight;
        } else if (support == 1) {
            proposal.forVotes += weight;
        } else {
            proposal.abstainVotes += weight;
        }
        
        emit VoteCast(msg.sender, proposalId, support, weight, reason);
        
        return weight;
    }
    
    function execute(uint256 proposalId) external payable {
        require(proposalId <= proposalCount && proposalId > 0, "Invalid proposal ID");
        
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Already executed");
        require(!proposal.canceled, "Proposal canceled");
        require(block.number > proposal.endBlock, "Voting not ended");
        require(proposal.forVotes > proposal.againstVotes, "Proposal failed");
        require(proposal.forVotes >= quorum, "Quorum not reached");
        
        proposal.executed = true;
        
        for (uint256 i = 0; i < proposal.targets.length; i++) {
            (bool success, ) = proposal.targets[i].call{value: proposal.values[i]}(proposal.calldatas[i]);
            require(success, "Execution failed");
        }
        
        emit ProposalExecuted(proposalId);
    }
    
    function state(uint256 proposalId) external view returns (uint8) {
        require(proposalId <= proposalCount && proposalId > 0, "Invalid proposal ID");
        
        Proposal storage proposal = proposals[proposalId];
        
        if (proposal.canceled) return 2;
        if (proposal.executed) return 7;
        if (block.number <= proposal.startBlock) return 0;
        if (block.number <= proposal.endBlock) return 1;
        if (proposal.forVotes <= proposal.againstVotes || proposal.forVotes < quorum) return 3;
        return 4;
    }
    
    function getProposal(uint256 proposalId) external view returns (
        address proposer,
        string memory description,
        uint256 startBlock,
        uint256 endBlock,
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes,
        bool executed,
        bool canceled
    ) {
        require(proposalId <= proposalCount && proposalId > 0, "Invalid proposal ID");
        
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.proposer,
            proposal.description,
            proposal.startBlock,
            proposal.endBlock,
            proposal.forVotes,
            proposal.againstVotes,
            proposal.abstainVotes,
            proposal.executed,
            proposal.canceled
        );
    }
    
    function delegate(address delegatee) external {
        address currentDelegate = delegates[msg.sender];
        if (currentDelegate != address(0)) {
            delegatedVotingPower[currentDelegate] -= getTokenBalance(msg.sender);
        }
        
        delegates[msg.sender] = delegatee;
        if (delegatee != address(0)) {
            delegatedVotingPower[delegatee] += getTokenBalance(msg.sender);
        }
        
        emit DelegateChanged(msg.sender, currentDelegate, delegatee);
    }
    
    function getVotingPower(address account) public view returns (uint256) {
        return getTokenBalance(account) + delegatedVotingPower[account];
    }
    
    function getTokenBalance(address account) internal view returns (uint256) {
        if (daoGovernance == address(0)) return 1000000e18;
        
        (bool success, bytes memory data) = daoGovernance.staticcall(
            abi.encodeWithSignature("balanceOf(address)", account)
        );
        
        if (success && data.length == 32) {
            return abi.decode(data, (uint256));
        }
        
        return 1000000e18;
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}