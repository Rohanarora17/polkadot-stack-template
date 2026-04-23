import { decodeEventLog, type Abi, type Address, type Hex, type Log } from "viem";

type BlockscoutLogItem = {
	block_hash?: Hex;
	block_number?: number;
	data?: Hex;
	index?: number;
	topics?: Array<Hex | null>;
	transaction_hash?: Hex;
};

type BlockscoutLogsResponse = {
	items?: BlockscoutLogItem[];
	next_page_params?: Record<string, string | number | boolean | null> | null;
};

const MAX_BLOCKSCOUT_PAGES = 10;

export async function fetchBlockscoutEventLogs(args: {
	abi: Abi;
	address: Address;
	baseUrl: string;
	eventName: string;
	fromBlock: bigint;
	toBlock: bigint;
}) {
	const logs = await fetchBlockscoutAddressLogs({
		address: args.address,
		baseUrl: args.baseUrl,
		fromBlock: args.fromBlock,
		toBlock: args.toBlock,
	});

	return logs.filter((log) => canDecodeEvent(log, args.abi, args.eventName));
}

async function fetchBlockscoutAddressLogs(args: {
	address: Address;
	baseUrl: string;
	fromBlock: bigint;
	toBlock: bigint;
}) {
	const logs: Log[] = [];
	let nextPageParams: BlockscoutLogsResponse["next_page_params"] = null;

	for (let page = 0; page < MAX_BLOCKSCOUT_PAGES; page++) {
		const url = buildLogsUrl(args.baseUrl, args.address, nextPageParams);
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Blockscout logs request failed with ${response.status}`);
		}

		const json = (await response.json()) as BlockscoutLogsResponse;
		const items = Array.isArray(json.items) ? json.items : [];
		for (const item of items) {
			if (!isUsableBlockscoutLogItem(item)) {
				continue;
			}

			const blockNumber = BigInt(item.block_number);
			if (blockNumber < args.fromBlock || blockNumber > args.toBlock) {
				continue;
			}
			logs.push({
				address: args.address,
				blockHash: item.block_hash,
				blockNumber,
				data: item.data,
				logIndex: item.index,
				removed: false,
				topics: normalizeTopics(item.topics),
				transactionHash: item.transaction_hash,
				transactionIndex: 0,
			});
		}

		nextPageParams = json.next_page_params ?? null;
		if (!nextPageParams) {
			break;
		}
	}

	return logs;
}

function isUsableBlockscoutLogItem(item: BlockscoutLogItem): item is Required<BlockscoutLogItem> {
	return (
		typeof item.block_hash === "string" &&
		typeof item.block_number === "number" &&
		typeof item.data === "string" &&
		typeof item.index === "number" &&
		Array.isArray(item.topics) &&
		typeof item.transaction_hash === "string"
	);
}

function buildLogsUrl(
	baseUrl: string,
	address: Address,
	nextPageParams: BlockscoutLogsResponse["next_page_params"],
) {
	const url = new URL(`/api/v2/addresses/${address}/logs`, baseUrl);
	if (nextPageParams) {
		for (const [key, value] of Object.entries(nextPageParams)) {
			if (value !== null && value !== undefined) {
				url.searchParams.set(key, String(value));
			}
		}
	}
	return url.toString();
}

function normalizeTopics(topics: Array<Hex | null>): [] | [Hex, ...Hex[]] {
	const compact = topics.filter((topic): topic is Hex => Boolean(topic));
	if (compact.length === 0) {
		return [];
	}
	return compact as [Hex, ...Hex[]];
}

function canDecodeEvent(log: Log, abi: Abi, eventName: string) {
	try {
		const decoded = decodeEventLog({
			abi,
			data: log.data,
			eventName,
			topics: log.topics as [Hex, ...Hex[]],
			strict: true,
		});
		return decoded.eventName === eventName;
	} catch {
		return false;
	}
}
