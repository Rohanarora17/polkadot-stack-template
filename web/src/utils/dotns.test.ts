import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";

import { DOTNS_CONTRACTS, parseDotnsLabel, resolveDotnsName } from "./dotns";

describe("DotNS resolver", () => {
	it("normalizes common DotNS inputs to a base label", () => {
		expect(parseDotnsLabel("rohan.dot")).toBe("rohan");
		expect(parseDotnsLabel("https://rohan.paseo.li/#/gift")).toBe("rohan");
		expect(parseDotnsLabel("rohan.dotli.dev")).toBe("rohan");
		expect(parseDotnsLabel("rohan")).toBe("rohan");
		expect(parseDotnsLabel("not a wallet")).toBeNull();
	});

	it("prefers explicit forward resolution when the resolver has an address", async () => {
		const resolved = await resolveDotnsName({
			ethRpcUrl: "https://unused",
			input: "rohan.dot",
			publicClient: fakeDotnsClient({
				recordExists: true,
				registryOwner: "0x1111111111111111111111111111111111111111",
				resolver: DOTNS_CONTRACTS.RESOLVER,
				resolvedAddress: "0x2222222222222222222222222222222222222222",
				registrarOwner: "0x3333333333333333333333333333333333333333",
			}),
		});

		expect(resolved.label).toBe("rohan");
		expect(resolved.owner).toBe("0x2222222222222222222222222222222222222222");
		expect(resolved.source).toBe("forward-resolution");
	});

	it("falls back to registrar ownership when no forward address is set", async () => {
		const resolved = await resolveDotnsName({
			ethRpcUrl: "https://unused",
			input: "rohan.dot",
			publicClient: fakeDotnsClient({
				recordExists: true,
				registryOwner: "0x1111111111111111111111111111111111111111",
				resolver: DOTNS_CONTRACTS.RESOLVER,
				resolvedAddress: zeroAddress,
				registrarOwner: "0x3333333333333333333333333333333333333333",
			}),
		});

		expect(resolved.owner).toBe("0x3333333333333333333333333333333333333333");
		expect(resolved.source).toBe("domain-owner");
	});

	it("rejects unregistered names", async () => {
		await expect(
			resolveDotnsName({
				ethRpcUrl: "https://unused",
				input: "missing.dot",
				publicClient: fakeDotnsClient({
					recordExists: false,
					registryOwner: zeroAddress,
					resolver: zeroAddress,
					resolvedAddress: zeroAddress,
					registrarOwner: zeroAddress,
				}),
			}),
		).rejects.toThrow(/not registered/);
	});
});

function fakeDotnsClient(values: {
	recordExists: boolean;
	registryOwner: `0x${string}`;
	registrarOwner: `0x${string}`;
	resolvedAddress: `0x${string}`;
	resolver: `0x${string}`;
}) {
	return {
		async readContract(args: { functionName: string }) {
			switch (args.functionName) {
				case "recordExists":
					return values.recordExists;
				case "owner":
					return values.registryOwner;
				case "resolver":
					return values.resolver;
				case "addressOf":
					return values.resolvedAddress;
				case "ownerOf":
					return values.registrarOwner;
				default:
					throw new Error(`Unexpected DotNS read: ${args.functionName}`);
			}
		},
	} as never;
}
