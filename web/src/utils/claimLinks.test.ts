import { describe, expect, it } from "vitest";

import { parseClaimLinkSearch } from "./claimLinks";

describe("claim link parsing", () => {
	it("parses legacy registered-recipient claim links", () => {
		const parsed = parseClaimLinkSearch(
			"?pool=0x1111111111111111111111111111111111111111&registry=0x2222222222222222222222222222222222222222&recipient=0x3333333333333333333333333333333333333333&tx=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		);

		expect(parsed.mode).toBe("registered");
		expect(parsed.poolAddress).toBe("0x1111111111111111111111111111111111111111");
		expect(parsed.recipientOwner).toBe("0x3333333333333333333333333333333333333333");
		expect(parsed.memoHash).toBeNull();
		expect(parsed.giftKey).toBeNull();
	});

	it("parses registered-recipient claim links with memo hashes", () => {
		const parsed = parseClaimLinkSearch(
			"?pool=0x1111111111111111111111111111111111111111&registry=0x2222222222222222222222222222222222222222&recipient=0x3333333333333333333333333333333333333333&memo=0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		);

		expect(parsed.mode).toBe("registered");
		expect(parsed.recipientOwner).toBe("0x3333333333333333333333333333333333333333");
		expect(parsed.memoHash).toBe(
			"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		);
		expect(parsed.giftKey).toBeNull();
	});

	it("parses walletless bearer gift links", () => {
		const parsed = parseClaimLinkSearch(
			"?mode=bearer&pool=0x1111111111111111111111111111111111111111&registry=0x2222222222222222222222222222222222222222&memo=0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&key=0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		);

		expect(parsed.mode).toBe("bearer");
		expect(parsed.recipientOwner).toBeNull();
		expect(parsed.memoHash).toBe(
			"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		);
		expect(parsed.giftKey).toBe(
			"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		);
	});

	it("rejects malformed bearer link secrets", () => {
		const parsed = parseClaimLinkSearch(
			"?mode=bearer&pool=0x1111111111111111111111111111111111111111&registry=0x2222222222222222222222222222222222222222&memo=0xbbbb&key=not-a-key",
		);

		expect(parsed.mode).toBe("bearer");
		expect(parsed.memoHash).toBeNull();
		expect(parsed.giftKey).toBeNull();
	});
});
