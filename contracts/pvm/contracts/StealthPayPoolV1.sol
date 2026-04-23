// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPoseidonHasher2 {
	function poseidon(uint256[2] memory input) external pure returns (uint256);
}

interface IWithdrawVerifier {
	function verifyProof(
		uint256[2] memory pA,
		uint256[2][2] memory pB,
		uint256[2] memory pC,
		uint256[4] memory pubSignals
	) external view returns (bool);
}

/// @title StealthPayPoolV1
/// @notice Fixed-denomination privacy pool for StealthPay private withdrawals.
contract StealthPayPoolV1 {
	uint8 public constant TREE_DEPTH = 10;
	uint32 public constant ROOT_HISTORY_SIZE = 30;
	uint256 public constant MAX_LEAVES = 1 << TREE_DEPTH;
	uint256 public constant DENOMINATION = 1 ether;
	uint256 public constant MAX_RELAYER_FEE = DENOMINATION / 10;
	uint256 private constant SNARK_SCALAR_FIELD =
		21888242871839275222246405745257275088548364400416034343698204186575808495617;

	IPoseidonHasher2 public immutable hasher;
	IWithdrawVerifier public immutable verifier;
	uint256 public immutable scope;

	uint32 public nextIndex;
	uint32 public currentRootIndex;
	mapping(bytes32 => bool) public nullifierHashes;

	bytes32[TREE_DEPTH] public filledSubtrees;
	bytes32[ROOT_HISTORY_SIZE] public roots;

	event Deposit(bytes32 indexed commitment, uint32 leafIndex, bytes32 root);
	event Withdrawal(
		address indexed recipient,
		address indexed relayer,
		bytes32 nullifierHash,
		uint256 fee
	);

	error FeeTooHigh();
	error InvalidDenomination();
	error InvalidFieldElement();
	error InvalidProof();
	error NullifierAlreadyUsed();
	error QuoteExpired();
	error TransferFailed();
	error TreeFull();
	error UnknownRoot();

	constructor(address poseidonHasher, address withdrawVerifier) {
		hasher = IPoseidonHasher2(poseidonHasher);
		verifier = IWithdrawVerifier(withdrawVerifier);
		scope =
			uint256(
				keccak256(
					abi.encode(block.chainid, address(this), DENOMINATION, "StealthPayPoolV1")
				)
			) % SNARK_SCALAR_FIELD;

		for (uint8 level = 0; level < TREE_DEPTH; level++) {
			filledSubtrees[level] = zeroValue(level);
		}
		roots[0] = zeroValue(TREE_DEPTH);
	}

	function deposit(bytes32 commitment) external payable returns (uint32 leafIndex, bytes32 root) {
		if (msg.value != DENOMINATION) revert InvalidDenomination();

		uint256 current = uint256(commitment);
		if (current == 0 || current >= SNARK_SCALAR_FIELD) revert InvalidFieldElement();
		if (nextIndex >= MAX_LEAVES) revert TreeFull();

		uint32 currentIndex = nextIndex;
		leafIndex = currentIndex;

		for (uint8 level = 0; level < TREE_DEPTH; level++) {
			uint256[2] memory inputs;
			if (currentIndex & 1 == 0) {
				inputs[0] = current;
				inputs[1] = uint256(zeroValue(level));
				filledSubtrees[level] = bytes32(current);
			} else {
				inputs[0] = uint256(filledSubtrees[level]);
				inputs[1] = current;
			}

			current = hasher.poseidon(inputs);
			currentIndex >>= 1;
		}

		currentRootIndex = uint32((uint256(currentRootIndex) + 1) % ROOT_HISTORY_SIZE);
		root = bytes32(current);
		roots[currentRootIndex] = root;
		nextIndex += 1;

		emit Deposit(commitment, leafIndex, root);
	}

	function withdraw(
		uint256[2] calldata pA,
		uint256[2][2] calldata pB,
		uint256[2] calldata pC,
		bytes32 root,
		bytes32 nullifierHash,
		address recipient,
		address relayer,
		uint256 fee,
		uint256 expiry
	) external {
		if (block.timestamp > expiry) revert QuoteExpired();
		if (fee > MAX_RELAYER_FEE || fee >= DENOMINATION) revert FeeTooHigh();
		if (uint256(root) >= SNARK_SCALAR_FIELD || uint256(nullifierHash) >= SNARK_SCALAR_FIELD) {
			revert InvalidFieldElement();
		}
		if (nullifierHashes[nullifierHash]) revert NullifierAlreadyUsed();
		if (!isKnownRoot(root)) revert UnknownRoot();

		uint256[4] memory publicSignals = [
			uint256(root),
			uint256(nullifierHash),
			scope,
			computeContext(recipient, relayer, fee, expiry)
		];

		if (!verifier.verifyProof(pA, pB, pC, publicSignals)) revert InvalidProof();

		nullifierHashes[nullifierHash] = true;
		transferValue(recipient, DENOMINATION - fee);
		if (fee > 0) {
			transferValue(relayer, fee);
		}

		emit Withdrawal(recipient, relayer, nullifierHash, fee);
	}

	function isKnownRoot(bytes32 root) public view returns (bool) {
		if (root == bytes32(0)) return false;

		for (uint256 i = 0; i < ROOT_HISTORY_SIZE; i++) {
			if (roots[i] == root) {
				return true;
			}
		}

		return false;
	}

	function latestRoot() external view returns (bytes32) {
		return roots[currentRootIndex];
	}

	function computeContext(
		address recipient,
		address relayer,
		uint256 fee,
		uint256 expiry
	) public view returns (uint256) {
		return
			uint256(
				keccak256(
					abi.encode(
						block.chainid,
						address(this),
						recipient,
						relayer,
						fee,
						expiry,
						DENOMINATION
					)
				)
			) % SNARK_SCALAR_FIELD;
	}

	function transferValue(address to, uint256 value) private {
		(bool ok, ) = to.call{value: value}("");
		if (!ok) revert TransferFailed();
	}

	function zeroValue(uint8 level) public pure returns (bytes32) {
		if (level == 0) return bytes32(uint256(0x0));
		if (level == 1)
			return
				bytes32(
					uint256(0x2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864)
				);
		if (level == 2)
			return
				bytes32(
					uint256(0x1069673dcdb12263df301a6ff584a7ec261a44cb9dc68df067a4774460b1f1e1)
				);
		if (level == 3)
			return
				bytes32(
					uint256(0x18f43331537ee2af2e3d758d50f72106467c6eea50371dd528d57eb2b856d238)
				);
		if (level == 4)
			return
				bytes32(
					uint256(0x07f9d837cb17b0d36320ffe93ba52345f1b728571a568265caac97559dbc952a)
				);
		if (level == 5)
			return
				bytes32(
					uint256(0x2b94cf5e8746b3f5c9631f4c5df32907a699c58c94b2ad4d7b5cec1639183f55)
				);
		if (level == 6)
			return
				bytes32(
					uint256(0x2dee93c5a666459646ea7d22cca9e1bcfed71e6951b953611d11dda32ea09d78)
				);
		if (level == 7)
			return
				bytes32(
					uint256(0x078295e5a22b84e982cf601eb639597b8b0515a88cb5ac7fa8a4aabe3c87349d)
				);
		if (level == 8)
			return
				bytes32(
					uint256(0x2fa5e5f18f6027a6501bec864564472a616b2e274a41211a444cbe3a99f3cc61)
				);
		if (level == 9)
			return
				bytes32(
					uint256(0x0e884376d0d8fd21ecb780389e941f66e45e7acce3e228ab3e2156a614fcd747)
				);
		if (level == 10)
			return
				bytes32(
					uint256(0x1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2)
				);
		revert InvalidFieldElement();
	}
}
