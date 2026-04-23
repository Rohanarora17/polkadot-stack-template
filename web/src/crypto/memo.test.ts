import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import { decryptTextMemo, deriveMemoKey, encryptTextMemo } from "./memo";
import { hashBytes } from "../utils/hash";

function bytes32(fill: number) {
	return new Uint8Array(32).fill(fill);
}

describe("memo crypto", () => {
	it("encrypts and decrypts a text memo with the same shared secret", () => {
		const sharedSecret = bytes32(7);
		const encrypted = encryptTextMemo(sharedSecret, "lunch tomorrow");
		const decrypted = decryptTextMemo(sharedSecret, encrypted.envelopeBytes);

		expect(decrypted.plaintext).toBe("lunch tomorrow");
		expect(bytesToHex(decrypted.memoKey)).toBe(bytesToHex(deriveMemoKey(sharedSecret)));
	});

	it("fails decryption with the wrong shared secret", () => {
		const encrypted = encryptTextMemo(bytes32(9), "private note");

		expect(() => decryptTextMemo(bytes32(10), encrypted.envelopeBytes)).toThrow();
	});

	it("uses a different nonce and ciphertext for repeated encryption of the same plaintext", () => {
		const sharedSecret = bytes32(11);
		const first = encryptTextMemo(sharedSecret, "same memo");
		const second = encryptTextMemo(sharedSecret, "same memo");

		expect(first.envelope.n).not.toBe(second.envelope.n);
		expect(first.envelope.c).not.toBe(second.envelope.c);
	});

	it("produces a deterministic memo hash for the exact uploaded bytes", () => {
		const sharedSecret = bytes32(12);
		const encrypted = encryptTextMemo(sharedSecret, "cid reference");
		const firstHash = hashBytes(encrypted.envelopeBytes);
		const secondHash = hashBytes(encrypted.envelopeBytes);

		expect(firstHash).toBe(secondHash);
	});
});
