import {
	encodeAbiParameters,
	encodeEventTopics,
	parseAbiParameters,
	type Address,
	type Hex,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { privatePoolAbi } from "../config/privatePool";
import { stealthPayAbi } from "../config/stealthPay";
import {
	scanPoolDepositByCommitment,
	scanPoolDeposits,
	scanPrivateAnnouncementsByMemoHash,
} from "./privatePoolScan";

const CONTRACT = "0x5555555555555555555555555555555555555555" as Address;
const POOL = "0x6666666666666666666666666666666666666666" as Address;
const SENDER = "0x7777777777777777777777777777777777777777" as Address;
const EPHEMERAL_PUB_KEY = `0x${"02"}${"11".repeat(32)}` as Hex;
const MEMO_A = `0x${"aa".repeat(32)}` as Hex;
const MEMO_B = `0x${"bb".repeat(32)}` as Hex;

describe("private pool announcement scanning", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.stubEnv("VITE_STEALTHPAY_INDEXER_KIND", "blockscout");
		installLocalStorageStub();
	});

	it("uses Blockscout full-history pages to find an exact memo hash", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValueOnce({
					json: async () => ({
						items: [
							blockscoutAnnouncementItem({
								blockNumber: 50,
								memoHash: MEMO_A,
								transactionHash:
									"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
							}),
						],
						next_page_params: { block_number: 50, index: 0, items_count: 1 },
					}),
					ok: true,
				})
				.mockResolvedValueOnce({
					json: async () => ({
						items: [
							blockscoutAnnouncementItem({
								blockNumber: 10,
								memoHash: MEMO_B,
								transactionHash:
									"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
							}),
						],
						next_page_params: null,
					}),
					ok: true,
				}),
		);

		const result = await scanPrivateAnnouncementsByMemoHash({
			contractAddress: CONTRACT,
			ethRpcUrl: "https://services.polkadothub-rpc.com/testnet",
			memoHash: MEMO_B,
			publicClient: { getLogs: vi.fn() } as never,
			toBlock: 100n,
			wsUrl: "wss://asset-hub-paseo-rpc.n.dwellir.com",
		});

		expect(fetch).toHaveBeenCalledTimes(2);
		expect(result.scanSource).toBe("Blockscout exact memo lookup");
		expect(result.fromBlock).toBe(0n);
		expect(result.announcements).toHaveLength(1);
		expect(result.announcements[0]?.blockNumber).toBe(10n);
		expect(result.announcements[0]?.memoHash).toBe(MEMO_B);
	});

	it("falls back to full eth-rpc log lookup when no indexer is configured", async () => {
		const getLogs = vi.fn(async () => [
			ethRpcAnnouncementLog({
				blockNumber: 8n,
				memoHash: MEMO_B,
				transactionHash:
					"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
			}),
		]);

		const result = await scanPrivateAnnouncementsByMemoHash({
			contractAddress: CONTRACT,
			memoHash: MEMO_B,
			publicClient: { getLogs } as never,
			toBlock: 100n,
			wsUrl: "ws://127.0.0.1:9944",
		});

		expect(getLogs).toHaveBeenCalledWith(
			expect.objectContaining({
				address: CONTRACT,
				fromBlock: 0n,
				toBlock: 100n,
			}),
		);
		expect(result.scanSource).toBe("eth-rpc exact memo lookup");
		expect(result.announcements[0]?.blockNumber).toBe(8n);
	});
});

describe("private pool deposit scanning", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.stubEnv("VITE_STEALTHPAY_INDEXER_KIND", "blockscout");
		installLocalStorageStub();
	});

	it("caches public pool deposit logs and reuses them for repeated full-history scans", async () => {
		const getLogs = vi.fn(async () => [
			ethRpcDepositLog({ blockNumber: 11n, commitment: MEMO_A, leafIndex: 0 }),
			ethRpcDepositLog({ blockNumber: 12n, commitment: MEMO_B, leafIndex: 1 }),
		]);
		const publicClient = { getLogs } as never;

		const first = await scanPoolDeposits({
			fromBlock: 0n,
			poolAddress: POOL,
			publicClient,
			toBlock: 20n,
			wsUrl: "ws://127.0.0.1:9944",
		});
		const second = await scanPoolDeposits({
			fromBlock: 0n,
			poolAddress: POOL,
			publicClient,
			toBlock: 20n,
			wsUrl: "ws://127.0.0.1:9944",
		});

		expect(getLogs).toHaveBeenCalledTimes(1);
		expect(first.scanSource).toBe("eth-rpc logs");
		expect(second.scanSource).toBe("browser public event cache");
		expect(second.deposits).toHaveLength(2);
		expect(second.deposits[1]?.leafIndex).toBe(1);
	});

	it("extends a cached full-history prefix from the next uncached block", async () => {
		const getLogs = vi
			.fn()
			.mockResolvedValueOnce([
				ethRpcDepositLog({ blockNumber: 11n, commitment: MEMO_A, leafIndex: 0 }),
			])
			.mockResolvedValueOnce([
				ethRpcDepositLog({ blockNumber: 26n, commitment: MEMO_B, leafIndex: 1 }),
			]);
		const publicClient = { getLogs } as never;

		await scanPoolDeposits({
			fromBlock: 0n,
			poolAddress: POOL,
			publicClient,
			toBlock: 20n,
			wsUrl: "ws://127.0.0.1:9944",
		});
		const second = await scanPoolDeposits({
			fromBlock: 0n,
			poolAddress: POOL,
			publicClient,
			toBlock: 30n,
			wsUrl: "ws://127.0.0.1:9944",
		});

		expect(getLogs).toHaveBeenLastCalledWith(
			expect.objectContaining({
				fromBlock: 21n,
				toBlock: 30n,
			}),
		);
		expect(second.scanSource).toBe("eth-rpc logs + browser public event cache");
		expect(second.deposits.map((deposit) => deposit.leafIndex)).toEqual([0, 1]);
	});

	it("bypasses the browser cache when a fresh pool scan is requested", async () => {
		const getLogs = vi
			.fn()
			.mockResolvedValueOnce([
				ethRpcDepositLog({ blockNumber: 11n, commitment: MEMO_A, leafIndex: 0 }),
			])
			.mockResolvedValueOnce([
				ethRpcDepositLog({ blockNumber: 11n, commitment: MEMO_A, leafIndex: 0 }),
				ethRpcDepositLog({ blockNumber: 12n, commitment: MEMO_B, leafIndex: 1 }),
			]);
		const publicClient = { getLogs } as never;

		await scanPoolDeposits({
			fromBlock: 0n,
			poolAddress: POOL,
			publicClient,
			toBlock: 20n,
			wsUrl: "ws://127.0.0.1:9944",
		});
		const refreshed = await scanPoolDeposits({
			bypassCache: true,
			fromBlock: 0n,
			poolAddress: POOL,
			publicClient,
			toBlock: 20n,
			wsUrl: "ws://127.0.0.1:9944",
		});

		expect(getLogs).toHaveBeenCalledTimes(2);
		expect(refreshed.scanSource).toBe("eth-rpc logs");
		expect(refreshed.deposits.map((deposit) => deposit.leafIndex)).toEqual([0, 1]);
	});

	it("falls through when Blockscout returns only a non-proofable recent deposit window", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				json: async () => ({
					items: [
						blockscoutDepositItem({
							blockNumber: 40,
							commitment: MEMO_B,
							leafIndex: 5,
						}),
					],
					next_page_params: null,
				}),
				ok: true,
			})),
		);
		const getLogs = vi.fn(async () => [
			ethRpcDepositLog({ blockNumber: 11n, commitment: MEMO_A, leafIndex: 0 }),
			ethRpcDepositLog({ blockNumber: 40n, commitment: MEMO_B, leafIndex: 1 }),
		]);

		const result = await scanPoolDeposits({
			ethRpcUrl: "https://services.polkadothub-rpc.com/testnet",
			fromBlock: 0n,
			poolAddress: POOL,
			publicClient: { getLogs } as never,
			toBlock: 50n,
			wsUrl: "wss://asset-hub-paseo-rpc.n.dwellir.com",
		});

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(getLogs).toHaveBeenCalledTimes(1);
		expect(result.scanSource).toBe("eth-rpc logs");
		expect(result.deposits.map((deposit) => deposit.leafIndex)).toEqual([0, 1]);
	});

	it("falls through when Blockscout has a contiguous prefix shorter than pool nextIndex", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				json: async () => ({
					items: [
						blockscoutDepositItem({
							blockNumber: 11,
							commitment: MEMO_A,
							leafIndex: 0,
						}),
						blockscoutDepositItem({
							blockNumber: 12,
							commitment: MEMO_B,
							leafIndex: 1,
						}),
					],
					next_page_params: null,
				}),
				ok: true,
			})),
		);
		const getLogs = vi.fn(async () => [
			ethRpcDepositLog({ blockNumber: 11n, commitment: MEMO_A, leafIndex: 0 }),
			ethRpcDepositLog({ blockNumber: 12n, commitment: MEMO_B, leafIndex: 1 }),
			ethRpcDepositLog({
				blockNumber: 13n,
				commitment: `0x${"cc".repeat(32)}`,
				leafIndex: 2,
			}),
		]);
		const readContract = vi.fn(async () => 3);

		const result = await scanPoolDeposits({
			ethRpcUrl: "https://services.polkadothub-rpc.com/testnet",
			fromBlock: 0n,
			poolAddress: POOL,
			publicClient: { getLogs, readContract } as never,
			toBlock: 50n,
			wsUrl: "wss://asset-hub-paseo-rpc.n.dwellir.com",
		});

		expect(fetch).toHaveBeenCalledTimes(1);
		expect(readContract).toHaveBeenCalledWith(
			expect.objectContaining({
				address: POOL,
				functionName: "nextIndex",
			}),
		);
		expect(result.scanSource).toBe("eth-rpc logs");
		expect(result.deposits.map((deposit) => deposit.leafIndex)).toEqual([0, 1, 2]);
	});
});

describe("StealthPay indexer lookups", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		vi.stubEnv("VITE_STEALTHPAY_INDEXER_URL", "http://127.0.0.1:8787");
		installLocalStorageStub();
	});

	it("uses the StealthPay indexer for exact pool deposit lookup before RPC scans", async () => {
		const getLogs = vi.fn();
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				json: async () => ({
					deposit: {
						blockNumber: "77",
						commitment: MEMO_A,
						leafIndex: 4,
						poolAddress: POOL,
						root: MEMO_B,
					},
					ok: true,
				}),
				ok: true,
			})),
		);

		const result = await scanPoolDepositByCommitment({
			commitment: MEMO_A,
			poolAddress: POOL,
			publicClient: { getLogs } as never,
			toBlock: 100n,
			wsUrl: "wss://asset-hub-paseo-rpc.n.dwellir.com",
		});

		expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain("/index/deposit?");
		expect(getLogs).not.toHaveBeenCalled();
		expect(result.scanSource).toBe("StealthPay indexer exact deposit lookup");
		expect(result.deposit?.leafIndex).toBe(4);
	});
});

function installLocalStorageStub() {
	const values = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		clear: vi.fn(() => values.clear()),
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		removeItem: vi.fn((key: string) => values.delete(key)),
		setItem: vi.fn((key: string, value: string) => values.set(key, value)),
	});
}

function blockscoutAnnouncementItem(args: {
	blockNumber: number;
	memoHash: `0x${string}`;
	transactionHash: `0x${string}`;
}) {
	const { data, topics } = encodeAnnouncementEvent(args.memoHash);
	return {
		block_hash: `0x${"33".repeat(32)}`,
		block_number: args.blockNumber,
		data,
		index: 0,
		topics: [...topics, null],
		transaction_hash: args.transactionHash,
	};
}

function ethRpcAnnouncementLog(args: {
	blockNumber: bigint;
	memoHash: `0x${string}`;
	transactionHash: `0x${string}`;
}) {
	const { data, topics } = encodeAnnouncementEvent(args.memoHash);
	return {
		address: CONTRACT,
		blockHash: `0x${"33".repeat(32)}`,
		blockNumber: args.blockNumber,
		data,
		logIndex: 0,
		removed: false,
		topics,
		transactionHash: args.transactionHash,
		transactionIndex: 0,
	};
}

function ethRpcDepositLog(args: {
	blockNumber: bigint;
	commitment: `0x${string}`;
	leafIndex: number;
}) {
	const { data, topics } = encodeDepositEvent(args.commitment, args.leafIndex);
	return {
		address: POOL,
		blockHash: `0x${"44".repeat(32)}`,
		blockNumber: args.blockNumber,
		data,
		logIndex: args.leafIndex,
		removed: false,
		topics,
		transactionHash: `0x${"55".repeat(32)}`,
		transactionIndex: 0,
	};
}

function blockscoutDepositItem(args: {
	blockNumber: number;
	commitment: `0x${string}`;
	leafIndex: number;
}) {
	const { data, topics } = encodeDepositEvent(args.commitment, args.leafIndex);
	return {
		block_hash: `0x${"44".repeat(32)}`,
		block_number: args.blockNumber,
		data,
		index: args.leafIndex,
		topics: [...topics, null],
		transaction_hash: `0x${"55".repeat(32)}`,
	};
}

function encodeAnnouncementEvent(memoHash: `0x${string}`) {
	const topics = encodeEventTopics({
		abi: stealthPayAbi,
		args: { schemeId: 2n },
		eventName: "Announcement",
	});
	const data = encodeAbiParameters(
		parseAbiParameters(
			"address sender,address stealthAddress,bytes ephemeralPubKey,uint8 viewTag,bytes32 memoHash,uint256 nonce",
		),
		[SENDER, POOL, EPHEMERAL_PUB_KEY, 17, memoHash, 4n],
	);

	return { data, topics };
}

function encodeDepositEvent(commitment: `0x${string}`, leafIndex: number) {
	const topics = encodeEventTopics({
		abi: privatePoolAbi,
		args: { commitment },
		eventName: "Deposit",
	});
	const data = encodeAbiParameters(parseAbiParameters("uint32 leafIndex,bytes32 root"), [
		leafIndex,
		`0x${"99".repeat(32)}`,
	]);

	return { data, topics };
}
