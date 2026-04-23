import { describe, expect, it, beforeEach, vi } from "vitest";

import {
	readPrivateWalletActivity,
	recordPrivateGiftClaimed,
	recordPrivateGiftCreated,
} from "./walletActivity";

describe("wallet activity", () => {
	beforeEach(() => {
		const store = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
		});
		vi.stubGlobal("window", {
			dispatchEvent: vi.fn(),
		});
	});

	it("records created gifts without storing claim secrets", () => {
		recordPrivateGiftCreated({
			commitment: "0x1111111111111111111111111111111111111111111111111111111111111111",
			createdAt: 1,
			giftMode: "bearer",
			memoHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
			memoPreview: "coffee",
			poolAddress: "0x3333333333333333333333333333333333333333",
			recipientLabel: "Walletless gift link",
			status: "created",
			transactionHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
		});

		const activity = readPrivateWalletActivity();
		expect(activity.gifts).toHaveLength(1);
		expect(JSON.stringify(activity)).not.toContain("giftKey");
		expect(activity.gifts[0]?.recipientLabel).toBe("Walletless gift link");
	});

	it("marks a matching gift as claimed when a claim is recorded", () => {
		const commitment =
			"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

		recordPrivateGiftCreated({
			commitment,
			createdAt: 1,
			giftMode: "registered",
			memoHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			memoPreview: null,
			poolAddress: "0x3333333333333333333333333333333333333333",
			recipientLabel: "0x5555555555555555555555555555555555555555",
			status: "created",
			transactionHash: null,
		});
		recordPrivateGiftClaimed({
			claimedAt: 2,
			commitment,
			destination: "0x6666666666666666666666666666666666666666",
			giftMode: "registered",
			memoPreview: null,
			poolAddress: "0x3333333333333333333333333333333333333333",
			quoteFee: "100",
			relayer: "0x7777777777777777777777777777777777777777",
			transactionHash: "0x8888888888888888888888888888888888888888888888888888888888888888",
		});

		const activity = readPrivateWalletActivity();
		expect(activity.claims).toHaveLength(1);
		expect(activity.gifts[0]?.status).toBe("claimed");
	});
});
