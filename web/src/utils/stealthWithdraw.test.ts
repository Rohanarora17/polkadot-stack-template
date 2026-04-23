import { describe, expect, it } from "vitest";

import { computeWithdrawValue, DEFAULT_WITHDRAW_TRANSFER_GAS } from "./stealthWithdraw";

describe("computeWithdrawValue", () => {
	it("subtracts the estimated fee from the stealth balance", () => {
		expect(
			computeWithdrawValue({
				balance: 1_000_000n,
				gasPrice: 10n,
			}),
		).toEqual({
			fee: DEFAULT_WITHDRAW_TRANSFER_GAS * 10n,
			gasLimit: DEFAULT_WITHDRAW_TRANSFER_GAS,
			gasPrice: 10n,
			transferValue: 1_000_000n - DEFAULT_WITHDRAW_TRANSFER_GAS * 10n,
		});
	});

	it("supports a caller-provided gas limit", () => {
		expect(
			computeWithdrawValue({
				balance: 5_000_000n,
				gasLimit: 35_000n,
				gasPrice: 20n,
			}),
		).toEqual({
			fee: 700_000n,
			gasLimit: 35_000n,
			gasPrice: 20n,
			transferValue: 4_300_000n,
		});
	});

	it("fails when the stealth balance cannot cover gas", () => {
		expect(() =>
			computeWithdrawValue({
				balance: 210_000n,
				gasPrice: 10n,
			}),
		).toThrow(/not enough to cover the estimated withdrawal fee/i);
	});
});
