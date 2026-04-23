import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import type { HexString } from "./stealth";

const NOTE_CONTEXT_LABEL = new TextEncoder().encode("private-note:v1");
const ENVELOPE_NONCE_LENGTH = 24;

type PrivateEnvelopeV1 = {
	c: HexString;
	n: HexString;
	v: 1;
};

export function derivePrivateNoteKey(sharedSecret: Uint8Array) {
	return keccak_256(concatBytes(sharedSecret, NOTE_CONTEXT_LABEL));
}

export function encryptPrivateNote(sharedSecret: Uint8Array, plaintextBytes: Uint8Array) {
	if (plaintextBytes.length === 0) {
		throw new Error("Private note payload cannot be empty.");
	}

	const nonce = randomNonce(ENVELOPE_NONCE_LENGTH);
	const key = derivePrivateNoteKey(sharedSecret);
	const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintextBytes);
	const envelope: PrivateEnvelopeV1 = {
		c: `0x${bytesToHex(ciphertext)}`,
		n: `0x${bytesToHex(nonce)}`,
		v: 1,
	};

	return {
		ciphertext,
		envelope,
		envelopeBytes: new TextEncoder().encode(JSON.stringify(envelope)),
		key,
		nonce,
	};
}

export function decryptPrivateNote(sharedSecret: Uint8Array, envelopeBytes: Uint8Array) {
	const envelope = decodePrivateEnvelope(envelopeBytes);
	const key = derivePrivateNoteKey(sharedSecret);
	const plaintextBytes = xchacha20poly1305(key, hexToBytes(stripHexPrefix(envelope.n))).decrypt(
		hexToBytes(stripHexPrefix(envelope.c)),
	);

	return {
		envelope,
		key,
		plaintextBytes,
	};
}

export function decodePrivateEnvelope(envelopeBytes: Uint8Array): PrivateEnvelopeV1 {
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(envelopeBytes));
	} catch {
		throw new Error("Private note envelope is not valid JSON.");
	}

	if (
		!parsed ||
		typeof parsed !== "object" ||
		!("v" in parsed) ||
		!("n" in parsed) ||
		!("c" in parsed)
	) {
		throw new Error("Private note envelope is missing required fields.");
	}

	const envelope = parsed as {
		c: unknown;
		n: unknown;
		v: unknown;
	};

	if (envelope.v !== 1) {
		throw new Error(`Unsupported private note envelope version: ${String(envelope.v)}`);
	}
	if (typeof envelope.n !== "string" || typeof envelope.c !== "string") {
		throw new Error("Private note envelope values must be hex strings.");
	}

	const nonce = normalizeHex(envelope.n);
	if (hexToBytes(stripHexPrefix(nonce)).length !== ENVELOPE_NONCE_LENGTH) {
		throw new Error(`Private note nonce must be ${ENVELOPE_NONCE_LENGTH} bytes.`);
	}

	return {
		c: normalizeHex(envelope.c),
		n: nonce,
		v: 1,
	};
}

function normalizeHex(value: string): HexString {
	return (value.startsWith("0x") ? value : `0x${value}`) as HexString;
}

function randomNonce(length: number) {
	const out = new Uint8Array(length);
	crypto.getRandomValues(out);
	return out;
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
