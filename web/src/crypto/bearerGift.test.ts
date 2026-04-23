import { describe, expect, it } from "vitest";

import { createPrivateNote } from "./privatePool";
import {
	decryptBearerGiftEnvelope,
	encryptBearerGiftEnvelope,
	exportEncryptedBearerGiftRecovery,
	generateBearerGiftKey,
} from "./bearerGift";

describe("bearer gift helpers", () => {
	it("round-trips a walletless bearer gift envelope", async () => {
		const { note } = await createPrivateNote({
			chainId: 420420421n,
			poolAddress: "0x1111111111111111111111111111111111111111",
			scope: 12345n,
		});
		const giftKey = generateBearerGiftKey();
		const encrypted = encryptBearerGiftEnvelope({
			giftKey,
			payload: {
				memoText: "walletless hello",
				note,
				v: 1,
			},
		});

		const decrypted = decryptBearerGiftEnvelope({
			envelopeBytes: encrypted.envelopeBytes,
			giftKey,
		});

		expect(decrypted.payload.memoText).toBe("walletless hello");
		expect(decrypted.payload.note).toEqual(note);
	});

	it("rejects a bearer envelope when the link key is wrong", async () => {
		const { note } = await createPrivateNote({
			chainId: 420420421n,
			poolAddress: "0x1111111111111111111111111111111111111111",
			scope: 12345n,
		});
		const encrypted = encryptBearerGiftEnvelope({
			giftKey: generateBearerGiftKey(),
			payload: {
				memoText: null,
				note,
				v: 1,
			},
		});

		expect(() =>
			decryptBearerGiftEnvelope({
				envelopeBytes: encrypted.envelopeBytes,
				giftKey: generateBearerGiftKey(),
			}),
		).toThrow();
	});

	it("exports an encrypted walletless recovery bundle", async () => {
		const { note } = await createPrivateNote({
			chainId: 420420421n,
			poolAddress: "0x1111111111111111111111111111111111111111",
			scope: 98765n,
		});

		const backup = await exportEncryptedBearerGiftRecovery(
			{
				claimDestination: "0x2222222222222222222222222222222222222222",
				claimWalletPrivateKey:
					"0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
				note,
				v: 1,
			},
			"supersecret",
		);

		expect(backup.v).toBe(1);
		expect(backup.algorithm).toBe("XChaCha20-Poly1305");
		expect(backup.ciphertext).toMatch(/^0x[0-9a-f]+$/);
	});
});
