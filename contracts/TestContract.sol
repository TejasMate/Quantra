// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title TestContract
 * @dev A minimal test contract for deployment testing
 */
contract TestContract {
    string public message;
    address public owner;
    
    constructor(string memory _message) {
        message = _message;
        owner = msg.sender;
    }
    
    function updateMessage(string memory _newMessage) external {
        require(msg.sender == owner, "Only owner can update");
        message = _newMessage;
    }
}