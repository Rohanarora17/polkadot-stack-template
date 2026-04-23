import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import type { Address, Hex } from "viem";

import {
	decodePrivateDeliveryPayload,
	encodePrivateDeliveryPayload,
	type PrivateDeliveryPayload,
	type PrivateNotePayload,
} from "./privatePool";
import type { HexString } from "./stealth";

export const BEARER_GIFT_ENVELOPE_VERSION = 1;
export const BEARER_GIFT_RECOVERY_VERSION = 1;

type BearerGiftEnvelope = {
	algorithm: "XChaCha20-Poly1305";
	chainId: string;
	ciphertext: HexString;
	createdAt: string;
	denominationPlanck: string;
	nonce: HexString;
	poolAddress: Address;
	v: typeof BEARER_GIFT_ENVELOPE_VERSION;
};

export type BearerGiftRecoveryBackup = {
	algorithm: "XChaCha20-Poly1305";
	ciphertext: HexString;
	createdAt: string;
	kdf: {
		iterations: number;
		name: "PBKDF2-SHA256";
		salt: HexString;
	};
	nonce: HexString;
	v: typeof BEARER_GIFT_RECOVERY_VERSION;
};

export type BearerGiftRecoveryPayload = {
	claimDestination: Address;
	claimWalletPrivateKey: Hex;
	note: PrivateNotePayload;
	v: typeof BEARER_GIFT_RECOVERY_VERSION;
};

export function generateBearerGiftKey(): HexString {
	return `0x${bytesToHex(randomBytes(32))}`;
}

export function createNeutralBearerAnnouncement() {
	return {
		ephemeralPubKey: secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true),
		viewTag: 0,
	};
}

export function encryptBearerGiftEnvelope(args: {
	giftKey: HexString;
	payload: PrivateDeliveryPayload;
}) {
	const key = parseGiftKey(args.giftKey);
	const nonce = randomBytes(24);
	const plaintext = encodePrivateDeliveryPayload(args.payload);
	const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
	const envelope: BearerGiftEnvelope = {
		algorithm: "XChaCha20-Poly1305",
		chainId: args.payload.note.chainId.toString(),
		ciphertext: `0x${bytesToHex(ciphertext)}`,
		createdAt: new Date().toISOString(),
		denominationPlanck: args.payload.note.denominationPlanck.toString(),
		nonce: `0x${bytesToHex(nonce)}`,
		poolAddress: args.payload.note.poolAddress,
		v: BEARER_GIFT_ENVELOPE_VERSION,
	};

	return {
		envelope,
		envelopeBytes: new TextEncoder().encode(JSON.stringify(envelope)),
	};
}

export function decryptBearerGiftEnvelope(args: { envelopeBytes: Uint8Array; giftKey: HexString }) {
	const envelope = parseBearerGiftEnvelopeBytes(args.envelopeBytes);
	const plaintext = xchacha20poly1305(
		parseGiftKey(args.giftKey),
		hexToBytes(stripHexPrefix(envelope.nonce)),
	).decrypt(hexToBytes(stripHexPrefix(envelope.ciphertext)));

	return {
		envelope,
		payload: decodePrivateDeliveryPayload(plaintext),
	};
}

export async function exportEncryptedBearerGiftRecovery(
	payload: BearerGiftRecoveryPayload,
	password: string,
): Promise<BearerGiftRecoveryBackup> {
	const trimmedPassword = password.trim();
	if (trimmedPassword.length < 8) {
		throw new Error("Recovery password must be at least 8 characters.");
	}

	const salt = randomBytes(16);
	const nonce = randomBytes(24);
	const key = await deriveRecoveryKey(trimmedPassword, salt);
	const plaintext = new TextEncoder().encode(
		JSON.stringify({
			...payload,
			note: {
				...payload.note,
				chainId: payload.note.chainId.toString(),
				denominationPlanck: payload.note.denominationPlanck.toString(),
			},
		}),
	);
	const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);

	return {
		algorithm: "XChaCha20-Poly1305",
		ciphertext: `0x${bytesToHex(ciphertext)}`,
		createdAt: new Date().toISOString(),
		kdf: {
			iterations: 150_000,
			name: "PBKDF2-SHA256",
			salt: `0x${bytesToHex(salt)}`,
		},
		nonce: `0x${bytesToHex(nonce)}`,
		v: BEARER_GIFT_RECOVERY_VERSION,
	};
}

export function serializeBearerGiftRecoveryBackup(backup: BearerGiftRecoveryBackup) {
	return JSON.stringify(backup, null, 2);
}

function parseBearerGiftEnvelopeBytes(bytes: Uint8Array): BearerGiftEnvelope {
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new Error("Bearer gift envelope is not valid JSON.");
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error("Bearer gift envelope is missing.");
	}
	const envelope = parsed as Partial<BearerGiftEnvelope>;
	if (
		envelope.v !== BEARER_GIFT_ENVELOPE_VERSION ||
		envelope.algorithm !== "XChaCha20-Poly1305" ||
		typeof envelope.ciphertext !== "string" ||
		typeof envelope.nonce !== "string" ||
		typeof envelope.poolAddress !== "string" ||
		typeof envelope.chainId !== "string" ||
		typeof envelope.denominationPlanck !== "string" ||
		typeof envelope.createdAt !== "string"
	) {
		throw new Error("Bearer gift envelope is missing required fields.");
	}

	return {
		algorithm: "XChaCha20-Poly1305",
		chainId: envelope.chainId,
		ciphertext: normalizeHex(envelope.ciphertext),
		createdAt: envelope.createdAt,
		denominationPlanck: envelope.denominationPlanck,
		nonce: normalizeHex(envelope.nonce),
		poolAddress: envelope.poolAddress,
		v: BEARER_GIFT_ENVELOPE_VERSION,
	};
}

function parseGiftKey(key: HexString) {
	const bytes = hexToBytes(stripHexPrefix(key));
	if (bytes.length !== 32) {
		throw new Error("Bearer gift key must be 32 bytes.");
	}
	return bytes;
}

async function deriveRecoveryKey(password: string, salt: Uint8Array) {
	return pbkdf2Async(sha256, new TextEncoder().encode(password), salt, {
		c: 150_000,
		dkLen: 32,
	});
}

function normalizeHex(value: string): HexString {
	return (value.startsWith("0x") ? value : `0x${value}`) as HexString;
}

function stripHexPrefix(value: string) {
	return value.startsWith("0x") ? value.slice(2) : value;
}

function randomBytes(length: number) {
	const out = new Uint8Array(length);
	crypto.getRandomValues(out);
	return out;
}
