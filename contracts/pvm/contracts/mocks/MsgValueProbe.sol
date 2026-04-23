// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MsgValueProbe {
	error UnexpectedValue(uint256 actual);

	uint256 public lastValue;
	uint256 public recordCount;

	event ValueRecorded(address indexed sender, uint256 value, uint256 count);

	function echoValue() external payable returns (uint256) {
		return msg.value;
	}

	function requireValue(uint256 expected) external payable {
		if (msg.value != expected) revert UnexpectedValue(msg.value);
	}

	function recordValue() external payable {
		lastValue = msg.value;
		recordCount += 1;
		emit ValueRecorded(msg.sender, msg.value, recordCount);
	}
}
