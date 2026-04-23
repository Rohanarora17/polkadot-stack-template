import { afterEach, describe, expect, it, vi } from "vitest";

import { buildBulletinBlobRef, fetchFromBulletinByHash } from "./useBulletin";

describe("useBulletin helpers", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns a stable memo hash and cid for the same uploaded bytes", () => {
		const bytes = new TextEncoder().encode("encrypted memo payload");
		const first = buildBulletinBlobRef(bytes);
		const second = buildBulletinBlobRef(bytes);

		expect(first.memoHash).toBe(second.memoHash);
		expect(first.cid).toBe(second.cid);
		expect(first.sizeBytes).toBe(bytes.length);
	});

	it("fetches bulletin bytes back by memo hash", async () => {
		const bytes = new TextEncoder().encode("ciphertext bytes");
		const { memoHash } = buildBulletinBlobRef(bytes);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			arrayBuffer: async () => bytes.buffer.slice(0),
		});
		vi.stubGlobal("fetch", fetchMock);

		const result = await fetchFromBulletinByHash(memoHash);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.bytes).toEqual(bytes);
		expect(result.cid.length).toBeGreaterThan(0);
	});
});
