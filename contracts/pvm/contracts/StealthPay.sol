// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title StealthPay
/// @notice Stealth-address registry and payment announcer for Polkadot Hub.
/// @dev Designed for pallet-revive on PVM, but kept EVM-compatible for parity tests.
interface IPrivatePoolDeposit {
	function deposit(bytes32 commitment) external payable returns (uint32 leafIndex, bytes32 root);
}

contract StealthPay {
	uint256 private constant STEALTH_PAYMENT_SCHEME_ID = 1;
	uint256 private constant PRIVATE_POOL_SCHEME_ID = 2;
	uint256 private constant COMPRESSED_PUBKEY_LENGTH = 33;
	uint256 private constant META_ADDRESS_LENGTH = COMPRESSED_PUBKEY_LENGTH * 2;

	/// Encoded as spendingPubKey(33) || viewingPubKey(33). Empty means unset.
	mapping(address => bytes) public metaAddressOf;

	/// Monotonic counter for announcement pagination.
	uint256 public announcementCount;

	event MetaAddressSet(address indexed owner, bytes spendingPubKey, bytes viewingPubKey);

	event Announcement(
		uint256 indexed schemeId,
		address sender,
		address stealthAddress,
		bytes ephemeralPubKey,
		uint8 viewTag,
		bytes32 memoHash,
		uint256 nonce
	);

	error InvalidPubKeyLength();
	error EmptyTransfer();
	error TransferFailed();

	function setMetaAddress(bytes calldata spendingPubKey, bytes calldata viewingPubKey) external {
		if (
			spendingPubKey.length != COMPRESSED_PUBKEY_LENGTH ||
			viewingPubKey.length != COMPRESSED_PUBKEY_LENGTH
		) {
			revert InvalidPubKeyLength();
		}

		metaAddressOf[msg.sender] = abi.encodePacked(spendingPubKey, viewingPubKey);
		emit MetaAddressSet(msg.sender, spendingPubKey, viewingPubKey);
	}

	function clearMetaAddress() external {
		delete metaAddressOf[msg.sender];
		emit MetaAddressSet(msg.sender, "", "");
	}

	function announceAndPay(
		address stealthAddress,
		bytes calldata ephemeralPubKey,
		uint8 viewTag,
		bytes32 memoHash
	) external payable {
		if (msg.value == 0) revert EmptyTransfer();
		if (ephemeralPubKey.length != COMPRESSED_PUBKEY_LENGTH) {
			revert InvalidPubKeyLength();
		}

		unchecked {
			announcementCount++;
		}

		uint256 nonce = announcementCount;
		emit Announcement(
			STEALTH_PAYMENT_SCHEME_ID,
			msg.sender,
			stealthAddress,
			ephemeralPubKey,
			viewTag,
			memoHash,
			nonce
		);

		(bool ok, ) = stealthAddress.call{value: msg.value}("");
		if (!ok) revert TransferFailed();
	}

	function announcePrivateDeposit(
		address pool,
		bytes32 commitment,
		bytes calldata ephemeralPubKey,
		uint8 viewTag,
		bytes32 memoHash
	) external payable {
		if (msg.value == 0) revert EmptyTransfer();
		if (ephemeralPubKey.length != COMPRESSED_PUBKEY_LENGTH) {
			revert InvalidPubKeyLength();
		}

		unchecked {
			announcementCount++;
		}

		uint256 nonce = announcementCount;
		emit Announcement(
			PRIVATE_POOL_SCHEME_ID,
			msg.sender,
			pool,
			ephemeralPubKey,
			viewTag,
			memoHash,
			nonce
		);

		try IPrivatePoolDeposit(pool).deposit{value: msg.value}(commitment) {} catch {
			revert TransferFailed();
		}
	}

	function hasMetaAddress(address who) external view returns (bool) {
		return metaAddressOf[who].length == META_ADDRESS_LENGTH;
	}
}
