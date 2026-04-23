import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
	decodeMetaAddress,
	decodeStealthSeed,
	deriveKeysFromSeed,
	deriveKeysFromSignature,
	deriveStealthAddress,
	deriveStealthPrivateKey,
	encodeMetaAddress,
	encodeMetaAddressHex,
	encodeStealthSeedHex,
	getStealthDerivationMessage,
	generateStealthSeed,
	publicKeyToAddress,
	scanAnnouncement,
} from "./stealth";

function scalarToBytes(value: bigint) {
	const bytes = new Uint8Array(32);
	let remaining = value;
	for (let i = 31; i >= 0; i--) {
		bytes[i] = Number(remaining & 0xffn);
		remaining >>= 8n;
	}
	return bytes;
}

describe("stealth derivation", () => {
	it("sender and recipient agree on the same stealth payment", () => {
		const spendingPrivKey = scalarToBytes(11n);
		const viewingPrivKey = scalarToBytes(29n);
		const recipient = {
			spendingPrivKey,
			viewingPrivKey,
			spendingPubKey: secp256k1.getPublicKey(spendingPrivKey, true),
			viewingPubKey: secp256k1.getPublicKey(viewingPrivKey, true),
		};

		const payment = deriveStealthAddress(
			{
				spendingPubKey: recipient.spendingPubKey,
				viewingPubKey: recipient.viewingPubKey,
			},
			scalarToBytes(7n),
		);

		const scan = scanAnnouncement(
			recipient.viewingPrivKey,
			recipient.spendingPubKey,
			payment.ephemeralPubKey,
			payment.viewTag,
			payment.stealthAddress,
		);

		expect(scan.match).toBe(true);
		expect(bytesToHex(scan.sharedSecret!)).toBe(bytesToHex(payment.sharedSecret));

		const stealthPrivKey = deriveStealthPrivateKey(
			recipient.spendingPrivKey,
			scan.sharedSecret!,
		);
		const stealthPublicKey = secp256k1.getPublicKey(stealthPrivKey, false);

		expect(publicKeyToAddress(stealthPublicKey)).toBe(payment.stealthAddress);
	});

	it("wrong recipient does not match the payment", () => {
		const aliceSpendingPrivKey = scalarToBytes(111n);
		const aliceViewingPrivKey = scalarToBytes(222n);
		const bobSpendingPrivKey = scalarToBytes(333n);
		const bobViewingPrivKey = scalarToBytes(444n);

		const payment = deriveStealthAddress(
			{
				spendingPubKey: secp256k1.getPublicKey(aliceSpendingPrivKey, true),
				viewingPubKey: secp256k1.getPublicKey(aliceViewingPrivKey, true),
			},
			scalarToBytes(5n),
		);

		const bobScan = scanAnnouncement(
			bobViewingPrivKey,
			secp256k1.getPublicKey(bobSpendingPrivKey, true),
			payment.ephemeralPubKey,
			payment.viewTag,
			payment.stealthAddress,
		);

		expect(bobScan.match).toBe(false);
	});

	it("re-derives the same keys for the same signature and chain id", () => {
		const signature = `0x${"11".repeat(64)}1b` as const;
		const first = deriveKeysFromSignature(signature, 420420417);
		const second = deriveKeysFromSignature(signature, 420420417);

		expect(bytesToHex(first.spendingPrivKey)).toBe(bytesToHex(second.spendingPrivKey));
		expect(bytesToHex(first.viewingPrivKey)).toBe(bytesToHex(second.viewingPrivKey));
		expect(encodeMetaAddressHex(first)).toBe(encodeMetaAddressHex(second));
	});

	it("derives different keys for different chain ids", () => {
		const signature = `0x${"22".repeat(64)}1c` as const;
		const paseo = deriveKeysFromSignature(signature, 420420417);
		const local = deriveKeysFromSignature(signature, 420420421);

		expect(bytesToHex(paseo.spendingPrivKey)).not.toBe(bytesToHex(local.spendingPrivKey));
		expect(bytesToHex(paseo.viewingPrivKey)).not.toBe(bytesToHex(local.viewingPrivKey));
	});

	it("re-derives the same keys for the same dedicated seed and chain id", () => {
		const seed = `0x${"44".repeat(32)}` as const;
		const first = deriveKeysFromSeed(seed, 420420421);
		const second = deriveKeysFromSeed(seed, 420420421);

		expect(bytesToHex(first.spendingPrivKey)).toBe(bytesToHex(second.spendingPrivKey));
		expect(bytesToHex(first.viewingPrivKey)).toBe(bytesToHex(second.viewingPrivKey));
		expect(encodeMetaAddressHex(first)).toBe(encodeMetaAddressHex(second));
	});

	it("derives different keys for different chain ids from the same dedicated seed", () => {
		const seed = `0x${"55".repeat(32)}` as const;
		const paseo = deriveKeysFromSeed(seed, 420420417);
		const local = deriveKeysFromSeed(seed, 420420421);

		expect(bytesToHex(paseo.spendingPrivKey)).not.toBe(bytesToHex(local.spendingPrivKey));
		expect(bytesToHex(paseo.viewingPrivKey)).not.toBe(bytesToHex(local.viewingPrivKey));
	});

	it("round-trips meta-address encoding helpers", () => {
		const keys = deriveKeysFromSignature(`0x${"33".repeat(64)}1b`, 420420417);
		const encoded = encodeMetaAddress(keys);
		const decoded = decodeMetaAddress(encoded);
		const redecoded = decodeMetaAddress(`0x${bytesToHex(encoded)}`);

		expect(bytesToHex(decoded.spendingPubKey)).toBe(bytesToHex(keys.spendingPubKey));
		expect(bytesToHex(decoded.viewingPubKey)).toBe(bytesToHex(keys.viewingPubKey));
		expect(bytesToHex(redecoded.spendingPubKey)).toBe(bytesToHex(keys.spendingPubKey));
		expect(bytesToHex(redecoded.viewingPubKey)).toBe(bytesToHex(keys.viewingPubKey));
	});

	it("builds a deterministic derivation message", () => {
		expect(getStealthDerivationMessage(420420417)).toBe(
			"StealthPay v1: stealth keys for chain 420420417",
		);
	});

	it("round-trips stealth seed encoding helpers", () => {
		const generated = generateStealthSeed();
		const encoded = encodeStealthSeedHex(generated);
		const decoded = decodeStealthSeed(encoded);

		expect(bytesToHex(decoded)).toBe(bytesToHex(generated));
	});

	it("accepts compressed or uncompressed public keys when deriving addresses", () => {
		const privKey = scalarToBytes(500n);
		const compressed = secp256k1.getPublicKey(privKey, true);
		const uncompressed = secp256k1.getPublicKey(privKey, false);

		expect(publicKeyToAddress(compressed)).toBe(publicKeyToAddress(uncompressed));
		expect(
			encodeMetaAddressHex({
				spendingPubKey: compressed,
				viewingPubKey: compressed,
			}).length,
		).toBe(134);
	});
});
