import { describe, expect, it } from "vitest";

import {
	PASEO_HUB_TESTNET_CHAIN_ID,
	UNIT_PLANCK,
	contractValueToReviveCallValue,
	formatPlanck,
	parseUnitAmount,
} from "./stealthRevive";

describe("stealth Revive value helpers", () => {
	it("parses native UNIT amounts with 12 decimal places", () => {
		expect(parseUnitAmount("1")).toBe(UNIT_PLANCK);
		expect(parseUnitAmount("1.25")).toBe(UNIT_PLANCK + UNIT_PLANCK / 4n);
	});

	it("formats native UNIT planck amounts", () => {
		expect(formatPlanck(UNIT_PLANCK)).toBe("1");
		expect(formatPlanck(UNIT_PLANCK + 500_000_000_000n)).toBe("1.5");
	});

	it("converts Paseo contract msg.value into Revive.call value", () => {
		expect(contractValueToReviveCallValue(10n ** 18n, PASEO_HUB_TESTNET_CHAIN_ID)).toBe(
			10_000_000_000n,
		);
	});

	it("leaves non-Paseo contract values unchanged", () => {
		expect(contractValueToReviveCallValue(10n ** 18n, 420420421)).toBe(10n ** 18n);
	});
});
