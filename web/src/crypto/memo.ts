import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { HexString } from "./stealth";

const MEMO_CONTEXT_LABEL = new TextEncoder().encode("memo:v1");
const NONCE_LENGTH = 24;
const MAX_TEXT_MEMO_BYTES = 512;
export const ZERO_MEMO_HASH =
	"0x0000000000000000000000000000000000000000000000000000000000000000" as const;

type MemoEnvelopeV1 = {
	c: HexString;
	n: HexString;
	v: 1;
};

export function deriveMemoKey(sharedSecret: Uint8Array) {
	return keccak_256(concatBytes(sharedSecret, MEMO_CONTEXT_LABEL));
}

export function encryptTextMemo(sharedSecret: Uint8Array, plaintext: string) {
	const plaintextBytes = new TextEncoder().encode(plaintext);
	if (plaintextBytes.length === 0) {
		throw new Error("Memo text cannot be empty.");
	}
	if (plaintextBytes.length > MAX_TEXT_MEMO_BYTES) {
		throw new Error(
			`Memo text is too large (${plaintextBytes.length} bytes). Maximum is ${MAX_TEXT_MEMO_BYTES} bytes.`,
		);
	}

	const nonce = randomNonce(NONCE_LENGTH);
	const memoKey = deriveMemoKey(sharedSecret);
	const ciphertext = xchacha20poly1305(memoKey, nonce).encrypt(plaintextBytes);
	const envelope: MemoEnvelopeV1 = {
		c: `0x${bytesToHex(ciphertext)}`,
		n: `0x${bytesToHex(nonce)}`,
		v: 1,
	};
	const envelopeBytes = new TextEncoder().encode(JSON.stringify(envelope));

	return {
		ciphertext,
		envelope,
		envelopeBytes,
		memoKey,
		nonce,
		plaintextBytes,
	};
}

export function decryptTextMemo(sharedSecret: Uint8Array, envelopeBytes: Uint8Array) {
	const envelope = decodeMemoEnvelope(envelopeBytes);
	const memoKey = deriveMemoKey(sharedSecret);
	const plaintextBytes = xchacha20poly1305(
		memoKey,
		hexToBytes(stripHexPrefix(envelope.n)),
	).decrypt(hexToBytes(stripHexPrefix(envelope.c)));

	return {
		envelope,
		memoKey,
		plaintext: new TextDecoder().decode(plaintextBytes),
		plaintextBytes,
	};
}

export function decodeMemoEnvelope(envelopeBytes: Uint8Array): MemoEnvelopeV1 {
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(envelopeBytes));
	} catch {
		throw new Error("Memo envelope is not valid JSON.");
	}

	if (
		!parsed ||
		typeof parsed !== "object" ||
		!("v" in parsed) ||
		!("n" in parsed) ||
		!("c" in parsed)
	) {
		throw new Error("Memo envelope is missing required fields.");
	}

	const envelope = parsed as {
		c: unknown;
		n: unknown;
		v: unknown;
	};
	if (envelope.v !== 1) {
		throw new Error(`Unsupported memo envelope version: ${String(envelope.v)}`);
	}
	if (typeof envelope.n !== "string" || typeof envelope.c !== "string") {
		throw new Error("Memo envelope nonce and ciphertext must be hex strings.");
	}
	const nonce = normalizeHex(envelope.n);
	const ciphertext = normalizeHex(envelope.c);
	if (hexToBytes(stripHexPrefix(nonce)).length !== NONCE_LENGTH) {
		throw new Error(`Memo nonce must be ${NONCE_LENGTH} bytes.`);
	}

	return {
		c: ciphertext,
		n: nonce,
		v: 1,
	};
}

function normalizeHex(value: string): HexString {
	return (value.startsWith("0x") ? value : `0x${value}`) as HexString;
}

function stripHexPrefix(value: string) {
	return value.startsWith("0x") ? value.slice(2) : value;
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

function randomNonce(length: number) {
	const out = new Uint8Array(length);
	crypto.getRandomValues(out);
	return out;
}
