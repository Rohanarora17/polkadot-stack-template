// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MockPrivatePool {
	bytes32 public lastCommitment;
	uint256 public lastValue;
	uint256 public deposits;

	event DepositRecorded(bytes32 commitment, uint256 value, uint256 deposits);

	function deposit(bytes32 commitment) external payable returns (uint32 leafIndex, bytes32 root) {
		lastCommitment = commitment;
		lastValue = msg.value;
		deposits += 1;
		emit DepositRecorded(commitment, msg.value, deposits);
		return (uint32(deposits - 1), bytes32(commitment));
	}
}
