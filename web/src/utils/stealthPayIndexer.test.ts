import type { Address } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";

import { findIndexedDepositByCommitment } from "./stealthPayIndexer";

const POOL = "0x6666666666666666666666666666666666666666" as Address;
const COMMITMENT = `0x${"11".repeat(32)}` as const;

describe("StealthPay indexer client", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("returns null instead of blocking claim flow when the indexer hangs", async () => {
		vi.useFakeTimers();
		vi.stubEnv("VITE_STEALTHPAY_INDEXER_URL", "https://indexer.example");
		vi.stubGlobal(
			"fetch",
			vi.fn((_url: URL, init?: RequestInit) => {
				return new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
				});
			}),
		);

		const result = findIndexedDepositByCommitment({
			commitment: COMMITMENT,
			poolAddress: POOL,
		});

		await vi.advanceTimersByTimeAsync(3_500);
		await expect(result).resolves.toBeNull();
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
