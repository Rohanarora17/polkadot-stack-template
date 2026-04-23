import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { privatePoolAbi } from "../config/privatePool";
import { fetchBlockscoutEventLogs } from "./blockscoutIndexer";

describe("blockscout indexer", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches and decodes compatible address logs", async () => {
		const topics = encodeEventTopics({
			abi: privatePoolAbi,
			args: {
				commitment: "0x1111111111111111111111111111111111111111111111111111111111111111",
			},
			eventName: "Deposit",
		});
		const data = encodeAbiParameters(parseAbiParameters("uint32 leafIndex,bytes32 root"), [
			7,
			"0x2222222222222222222222222222222222222222222222222222222222222222",
		]);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				json: async () => ({
					items: [
						{
							block_hash:
								"0x3333333333333333333333333333333333333333333333333333333333333333",
							block_number: 100,
							data,
							index: 2,
							topics: [...topics, null],
							transaction_hash:
								"0x4444444444444444444444444444444444444444444444444444444444444444",
						},
					],
					next_page_params: null,
				}),
				ok: true,
			})),
		);

		const logs = await fetchBlockscoutEventLogs({
			abi: privatePoolAbi,
			address: "0x5555555555555555555555555555555555555555",
			baseUrl: "https://blockscout.example",
			eventName: "Deposit",
			fromBlock: 99n,
			toBlock: 101n,
		});

		expect(logs).toHaveLength(1);
		expect(logs[0]?.blockNumber).toBe(100n);
		expect(logs[0]?.topics).toHaveLength(2);
	});

	it("filters logs outside the requested block range", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				json: async () => ({
					items: [
						{
							block_hash:
								"0x3333333333333333333333333333333333333333333333333333333333333333",
							block_number: 10,
							data: "0x",
							index: 0,
							topics: [],
							transaction_hash:
								"0x4444444444444444444444444444444444444444444444444444444444444444",
						},
					],
					next_page_params: null,
				}),
				ok: true,
			})),
		);

		const logs = await fetchBlockscoutEventLogs({
			abi: privatePoolAbi,
			address: "0x5555555555555555555555555555555555555555",
			baseUrl: "https://blockscout.example",
			eventName: "Deposit",
			fromBlock: 99n,
			toBlock: 101n,
		});

		expect(logs).toHaveLength(0);
	});

	it("skips malformed rows instead of throwing on missing block fields", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				json: async () => ({
					items: [
						{
							data: "0x",
							index: 0,
							topics: [],
							transaction_hash:
								"0x4444444444444444444444444444444444444444444444444444444444444444",
						},
					],
					next_page_params: null,
				}),
				ok: true,
			})),
		);

		const logs = await fetchBlockscoutEventLogs({
			abi: privatePoolAbi,
			address: "0x5555555555555555555555555555555555555555",
			baseUrl: "https://blockscout.example",
			eventName: "Deposit",
			fromBlock: 0n,
			toBlock: 101n,
		});

		expect(logs).toHaveLength(0);
	});

	it("does not return other events from the same contract", async () => {
		const topics = encodeEventTopics({
			abi: privatePoolAbi,
			args: {
				recipient: "0x1111111111111111111111111111111111111111",
				relayer: "0x2222222222222222222222222222222222222222",
			},
			eventName: "Withdrawal",
		});
		const data = encodeAbiParameters(parseAbiParameters("bytes32 nullifierHash,uint256 fee"), [
			"0x3333333333333333333333333333333333333333333333333333333333333333",
			1n,
		]);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				json: async () => ({
					items: [
						{
							block_hash:
								"0x3333333333333333333333333333333333333333333333333333333333333333",
							block_number: 100,
							data,
							index: 2,
							topics: [...topics, null],
							transaction_hash:
								"0x4444444444444444444444444444444444444444444444444444444444444444",
						},
					],
					next_page_params: null,
				}),
				ok: true,
			})),
		);

		const logs = await fetchBlockscoutEventLogs({
			abi: privatePoolAbi,
			address: "0x5555555555555555555555555555555555555555",
			baseUrl: "https://blockscout.example",
			eventName: "Deposit",
			fromBlock: 99n,
			toBlock: 101n,
		});

		expect(logs).toHaveLength(0);
	});
});
