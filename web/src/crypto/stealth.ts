import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export type HexString = `0x${string}`;

export type MetaAddress = {
	spendingPubKey: Uint8Array;
	viewingPubKey: Uint8Array;
};

export type MetaAddressKeys = MetaAddress & {
	spendingPrivKey: Uint8Array;
	viewingPrivKey: Uint8Array;
};

export type StealthPayment = {
	stealthAddress: HexString;
	ephemeralPubKey: Uint8Array;
	viewTag: number;
	sharedSecret: Uint8Array;
};

const CURVE_ORDER = secp256k1.Point.Fn.ORDER;
const COMPRESSED_PUBKEY_LENGTH = 33;
const META_ADDRESS_LENGTH = COMPRESSED_PUBKEY_LENGTH * 2;
const STEALTH_SEED_LENGTH = 32;
const STEALTH_CONTEXT_PREFIX = "StealthPay v1";

export function getStealthDerivationMessage(chainId: bigint | number | string) {
	return `${STEALTH_CONTEXT_PREFIX}: stealth keys for chain ${chainId.toString()}`;
}

export function deriveKeysFromSignature(
	signature: HexString,
	chainId: bigint | number | string,
): MetaAddressKeys {
	const signatureBytes = hexToBytes(stripHexPrefix(signature));
	const seed = keccak_256(signatureBytes);
	return deriveKeysFromSeedBytes(seed, chainId);
}

export function deriveKeysFromSeed(
	seed: Uint8Array | HexString,
	chainId: bigint | number | string,
): MetaAddressKeys {
	const seedBytes = typeof seed === "string" ? hexToBytes(stripHexPrefix(seed)) : seed;
	return deriveKeysFromSeedBytes(seedBytes, chainId);
}

export function generateStealthSeed() {
	const seed = new Uint8Array(STEALTH_SEED_LENGTH);
	crypto.getRandomValues(seed);
	return seed;
}

export function encodeStealthSeedHex(seed: Uint8Array): HexString {
	assertStealthSeed(seed);
	return `0x${bytesToHex(seed)}`;
}

export function decodeStealthSeed(seed: Uint8Array | HexString): Uint8Array {
	const seedBytes = typeof seed === "string" ? hexToBytes(stripHexPrefix(seed)) : seed;
	assertStealthSeed(seedBytes);
	return seedBytes;
}

function deriveKeysFromSeedBytes(
	seed: Uint8Array,
	chainId: bigint | number | string,
): MetaAddressKeys {
	assertStealthSeed(seed);
	const chainContext = utf8Bytes(`chain:${chainId.toString()}`);

	const spendingPrivKey = deriveSecretKey(seed, chainContext, utf8Bytes("spending"));
	const viewingPrivKey = deriveSecretKey(seed, chainContext, utf8Bytes("viewing"));

	return {
		spendingPrivKey,
		viewingPrivKey,
		spendingPubKey: secp256k1.getPublicKey(spendingPrivKey, true),
		viewingPubKey: secp256k1.getPublicKey(viewingPrivKey, true),
	};
}

export function deriveStealthAddress(
	metaAddress: MetaAddress,
	ephemeralPrivKey?: Uint8Array,
): StealthPayment {
	assertCompressedPubKey(metaAddress.spendingPubKey);
	assertCompressedPubKey(metaAddress.viewingPubKey);

	const ephemeralSecretKey = ephemeralPrivKey ?? secp256k1.utils.randomSecretKey();
	const ephemeralPubKey = secp256k1.getPublicKey(ephemeralSecretKey, true);

	const sharedSecret = deriveSharedSecret(metaAddress.viewingPubKey, ephemeralSecretKey);
	const stealthPoint = deriveStealthPoint(metaAddress.spendingPubKey, sharedSecret);

	return {
		stealthAddress: publicKeyToAddress(stealthPoint.toBytes(false)),
		ephemeralPubKey,
		viewTag: sharedSecret[0],
		sharedSecret,
	};
}

export function scanAnnouncement(
	viewingPrivKey: Uint8Array,
	spendingPubKey: Uint8Array,
	ephemeralPubKey: Uint8Array,
	viewTag: number,
	announcedStealthAddress: HexString,
): { match: boolean; sharedSecret?: Uint8Array; derivedAddress?: HexString } {
	assertSecretKey(viewingPrivKey);
	assertCompressedPubKey(spendingPubKey);
	assertCompressedPubKey(ephemeralPubKey);

	const sharedSecret = deriveSharedSecret(ephemeralPubKey, viewingPrivKey);
	if (sharedSecret[0] !== viewTag) {
		return { match: false };
	}

	const stealthPoint = deriveStealthPoint(spendingPubKey, sharedSecret);
	const derivedAddress = publicKeyToAddress(stealthPoint.toBytes(false));

	if (derivedAddress.toLowerCase() !== announcedStealthAddress.toLowerCase()) {
		return { match: false, derivedAddress };
	}

	return {
		match: true,
		sharedSecret,
		derivedAddress,
	};
}

export function deriveAnnouncementSharedSecret(
	viewingPrivKey: Uint8Array,
	ephemeralPubKey: Uint8Array,
	viewTag: number,
): Uint8Array | null {
	assertSecretKey(viewingPrivKey);
	assertCompressedPubKey(ephemeralPubKey);

	const sharedSecret = deriveSharedSecret(ephemeralPubKey, viewingPrivKey);
	return sharedSecret[0] === viewTag ? sharedSecret : null;
}

export function deriveStealthPrivateKey(
	spendingPrivKey: Uint8Array,
	sharedSecret: Uint8Array,
): Uint8Array {
	assertSecretKey(spendingPrivKey);

	const spendingScalar = bytesToBigInt(spendingPrivKey);
	const sharedScalar = hashToValidScalar(sharedSecret);
	const stealthScalar = modCurveOrder(spendingScalar + sharedScalar);
	if (stealthScalar === 0n) {
		throw new Error("Derived stealth private key is zero");
	}

	return bigintToBytes32(stealthScalar);
}

export function encodeMetaAddress(metaAddress: MetaAddress): Uint8Array {
	assertCompressedPubKey(metaAddress.spendingPubKey);
	assertCompressedPubKey(metaAddress.viewingPubKey);

	const out = new Uint8Array(META_ADDRESS_LENGTH);
	out.set(metaAddress.spendingPubKey, 0);
	out.set(metaAddress.viewingPubKey, COMPRESSED_PUBKEY_LENGTH);
	return out;
}

export function encodeMetaAddressHex(metaAddress: MetaAddress): HexString {
	return `0x${bytesToHex(encodeMetaAddress(metaAddress))}`;
}

export function decodeMetaAddress(encoded: Uint8Array | HexString): MetaAddress {
	const bytes = typeof encoded === "string" ? hexToBytes(stripHexPrefix(encoded)) : encoded;
	if (bytes.length !== META_ADDRESS_LENGTH) {
		throw new Error(`Encoded meta-address must be ${META_ADDRESS_LENGTH} bytes`);
	}

	return {
		spendingPubKey: bytes.slice(0, COMPRESSED_PUBKEY_LENGTH),
		viewingPubKey: bytes.slice(COMPRESSED_PUBKEY_LENGTH),
	};
}

export function publicKeyToAddress(publicKey: Uint8Array): HexString {
	const uncompressed = ensureUncompressedPublicKey(publicKey);
	const addressBytes = keccak_256(uncompressed.slice(1)).slice(-20);
	return `0x${bytesToHex(addressBytes)}`;
}

function deriveSecretKey(seed: Uint8Array, chainContext: Uint8Array, label: Uint8Array) {
	const derived = keccak_256(concatBytes(seed, chainContext, label));
	return bigintToBytes32(hashToValidScalar(derived));
}

function deriveSharedSecret(publicKey: Uint8Array, secretKey: Uint8Array) {
	const point = secp256k1.Point.fromBytes(publicKey).multiply(bytesToBigInt(secretKey));
	return keccak_256(point.toBytes(true));
}

function deriveStealthPoint(spendingPubKey: Uint8Array, sharedSecret: Uint8Array) {
	const spendingPoint = secp256k1.Point.fromBytes(spendingPubKey);
	const tweakPoint = secp256k1.Point.BASE.multiply(hashToValidScalar(sharedSecret));
	return spendingPoint.add(tweakPoint);
}

function ensureUncompressedPublicKey(publicKey: Uint8Array) {
	if (publicKey.length === 65 && publicKey[0] === 0x04) {
		return publicKey;
	}
	if (publicKey.length === COMPRESSED_PUBKEY_LENGTH) {
		return secp256k1.Point.fromBytes(publicKey).toBytes(false);
	}
	throw new Error("Public key must be 33-byte compressed or 65-byte uncompressed");
}

function assertCompressedPubKey(publicKey: Uint8Array) {
	if (publicKey.length !== COMPRESSED_PUBKEY_LENGTH) {
		throw new Error("Compressed secp256k1 public keys must be 33 bytes");
	}
}

function assertSecretKey(secretKey: Uint8Array) {
	if (!secp256k1.utils.isValidSecretKey(secretKey)) {
		throw new Error("Invalid secp256k1 secret key");
	}
}

function assertStealthSeed(seed: Uint8Array) {
	if (seed.length !== STEALTH_SEED_LENGTH) {
		throw new Error(`Stealth seed must be ${STEALTH_SEED_LENGTH} bytes`);
	}
}

function hashToValidScalar(bytes: Uint8Array) {
	return modToNonZero(bytesToBigInt(bytes));
}

function modToNonZero(value: bigint) {
	return (value % (CURVE_ORDER - 1n)) + 1n;
}

function modCurveOrder(value: bigint) {
	return value % CURVE_ORDER;
}

function bytesToBigInt(bytes: Uint8Array) {
	let out = 0n;
	for (const byte of bytes) {
		out = (out << 8n) | BigInt(byte);
	}
	return out;
}

function bigintToBytes32(value: bigint) {
	const bytes = new Uint8Array(32);
	let remaining = value;
	for (let i = 31; i >= 0; i--) {
		bytes[i] = Number(remaining & 0xffn);
		remaining >>= 8n;
	}
	return bytes;
}

function utf8Bytes(value: string) {
	return new TextEncoder().encode(value);
}

function concatBytes(...parts: Uint8Array[]) {
	const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(totalLength);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function stripHexPrefix(value: string) {
	return value.startsWith("0x") ? value.slice(2) : value;
}
