import { describe, expect, it, vi } from "vitest";

vi.mock("./stealthRevive", () => ({
	resolveReviveAddress: vi.fn(async () => "0x2222222222222222222222222222222222222222"),
}));

import { resolveRecipientOwner } from "./recipientResolver";

describe("recipient resolver", () => {
	it("accepts H160 addresses directly", async () => {
		const resolved = await resolveRecipientOwner({
			ethRpcUrl: "https://unused",
			input: "0x1111111111111111111111111111111111111111",
			wsUrl: "ws://unused",
		});

		expect(resolved.owner).toBe("0x1111111111111111111111111111111111111111");
		expect(resolved.source).toBe("h160");
	});

	it("resolves valid Substrate addresses before trying DotNS", async () => {
		const resolved = await resolveRecipientOwner({
			ethRpcUrl: "https://unused",
			input: "5GpYCNrh5zp5h7B3wGA5rWvMZpETebrc3KaGFWSerjdWWTQX",
			wsUrl: "ws://unused",
		});

		expect(resolved.owner).toBe("0x2222222222222222222222222222222222222222");
		expect(resolved.source).toBe("substrate");
	});

	it("does not misclassify lowercased SS58-looking addresses as DotNS names", async () => {
		await expect(
			resolveRecipientOwner({
				ethRpcUrl: "https://unused",
				input: "5fgz5ksttxwgfrptg8ddieminp67xlakewgwa4ruaeagzpce",
				wsUrl: "ws://unused",
			}),
		).rejects.toThrow(/case-sensitive/);
	});

	it("rejects unrecognized recipients", async () => {
		await expect(
			resolveRecipientOwner({
				ethRpcUrl: "https://unused",
				input: "not a wallet",
				wsUrl: "ws://unused",
			}),
		).rejects.toThrow(/Recipient was not recognized/);
	});
});
