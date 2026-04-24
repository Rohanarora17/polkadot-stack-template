import { afterEach, describe, expect, it, vi } from "vitest";

import { buildGiftLink, parseClaimLinkSearch } from "./claimLinks";

afterEach(() => {
	vi.unstubAllGlobals();
});

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

	it("builds registered gift links with exact claim context for link and QR sharing", () => {
		vi.stubGlobal("window", {
			location: {
				origin: "https://demo.stealthpay.app",
				pathname: "/",
				search: "",
			},
		});

		const link = buildGiftLink({
			memoHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			mode: "registered",
			poolAddress: "0x1111111111111111111111111111111111111111",
			recipientOwner: "0x3333333333333333333333333333333333333333",
			registryAddress: "0x2222222222222222222222222222222222222222",
			transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		});

		expect(link).toContain("#/gift?");
		expect(link).toContain("recipient=0x3333333333333333333333333333333333333333");
		expect(link).toContain(
			"memo=0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		);
		expect(link).toContain(
			"tx=0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		);
	});

	it("builds bearer gift links with the sensitive key in the hash route only", () => {
		vi.stubGlobal("window", {
			location: {
				origin: "https://demo.stealthpay.app",
				pathname: "/",
				search: "",
			},
		});

		const link = buildGiftLink({
			giftKey: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
			memoHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			mode: "bearer",
			poolAddress: "0x1111111111111111111111111111111111111111",
			registryAddress: "0x2222222222222222222222222222222222222222",
		});

		const [, hashRoute] = link.split("#");

		expect(link).toBe(
			"https://demo.stealthpay.app/#/gift?pool=0x1111111111111111111111111111111111111111&registry=0x2222222222222222222222222222222222222222&mode=bearer&memo=0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&key=0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		);
		expect(link.split("#")[0]).not.toContain("key=");
		expect(hashRoute).toContain(
			"key=0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		);
	});
});
