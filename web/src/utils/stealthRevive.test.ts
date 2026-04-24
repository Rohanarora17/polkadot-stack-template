import { describe, expect, it } from "vitest";
import { encodeAddress } from "@polkadot/util-crypto";

import {
	PASEO_HUB_TESTNET_CHAIN_ID,
	UNIT_PLANCK,
	contractValueToReviveCallValue,
	formatPlanck,
	parseUnitAmount,
	sameSs58Account,
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

	it("compares mapped accounts by AccountId bytes instead of SS58 prefix", () => {
		const publicKey = new Uint8Array(32).fill(7);
		expect(sameSs58Account(encodeAddress(publicKey, 0), encodeAddress(publicKey, 42))).toBe(
			true,
		);
		expect(
			sameSs58Account(
				encodeAddress(publicKey, 42),
				encodeAddress(new Uint8Array(32).fill(8), 42),
			),
		).toBe(false);
	});
});
