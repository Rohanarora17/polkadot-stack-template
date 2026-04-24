import { decodeEventLog, type AbiEvent, type Address, type Hex, type Log } from "viem";

import { getPublicClient } from "../config/evm";
import { getPublicEventIndexerConfig } from "../config/indexer";
import { privatePoolAbi } from "../config/privatePool";
import { stealthPayAbi } from "../config/stealthPay";
import type { HexString } from "../crypto/stealth";
import type { PoolDepositRecord } from "../crypto/privatePool";
import { fetchBlockscoutEventLogs } from "./blockscoutIndexer";
import { scanRuntimeContractEvents } from "./runtimeContractEvents";
import {
	findIndexedAnnouncementByMemo,
	findIndexedDepositByCommitment,
	listIndexedDeposits,
} from "./stealthPayIndexer";

type PublicClientLike = ReturnType<typeof getPublicClient>;

const privatePoolDepositEvent = privatePoolAbi.find(
	(item) => item.type === "event" && item.name === "Deposit",
) as AbiEvent | undefined;

export type PrivateAnnouncementCandidate = {
	blockNumber: bigint;
	ephemeralPubKey: HexString;
	groupKey: string;
	memoHash: HexString;
	nonce: bigint;
	poolAddress: Address;
	sender: HexString;
	transactionHash: HexString;
	viewTag: number;
};

type AnnouncementArgs = {
	ephemeralPubKey: HexString;
	memoHash: HexString;
	nonce: bigint;
	schemeId: bigint;
	sender: HexString;
	stealthAddress: HexString;
	viewTag: number;
};

type DepositArgs = {
	commitment: HexString;
	leafIndex: number;
	root: HexString;
};

const EXACT_MEMO_BLOCKSCOUT_PAGE_LIMIT = 200;
const POOL_DEPOSIT_BLOCKSCOUT_PAGE_LIMIT = 500;
const RECENT_RUNTIME_DEPOSIT_SCAN_DEPTH = 10_000n;
const FULL_HISTORY_FROM_BLOCK = 0n;
const POOL_DEPOSIT_CACHE_VERSION = 1;
const POOL_DEPOSIT_CACHE_PREFIX = "stealthpay.pool-deposits";

export type PrivateAnnouncementScanResult = {
	announcements: PrivateAnnouncementCandidate[];
	fromBlock: bigint;
	note: string | null;
	scanSource: string;
	toBlock: bigint;
};

export type PoolDepositScanResult = {
	deposits: PoolDepositRecord[];
	fromBlock: bigint;
	note: string | null;
	scanSource: string;
	toBlock: bigint;
};

export type ExactPoolDepositScanResult = {
	deposit: PoolDepositRecord | null;
	fromBlock: bigint;
	note: string | null;
	scanSource: string;
	toBlock: bigint;
};

export async function scanPrivateAnnouncements(args: {
	contractAddress: Address;
	ethRpcUrl?: string;
	fromBlock: bigint;
	publicClient: PublicClientLike;
	toBlock: bigint;
	wsUrl: string;
}): Promise<PrivateAnnouncementScanResult> {
	const indexer = getPublicEventIndexerConfig(args.wsUrl, args.ethRpcUrl);
	if (indexer?.kind === "blockscout") {
		try {
			const logs = await fetchBlockscoutEventLogs({
				abi: stealthPayAbi,
				address: args.contractAddress,
				baseUrl: indexer.baseUrl,
				eventName: "Announcement",
				fromBlock: args.fromBlock,
				toBlock: args.toBlock,
			});
			const announcements = logs.flatMap(logToPrivateAnnouncement);

			if (announcements.length > 0) {
				return {
					announcements: sortAnnouncements(announcements),
					fromBlock: args.fromBlock,
					note: null,
					scanSource: "Blockscout public event indexer",
					toBlock: args.toBlock,
				};
			}
		} catch {
			// Fall through to direct eth-rpc scan.
		}
	}

	try {
		const logs = await args.publicClient.getLogs({
			address: args.contractAddress,
			event: stealthPayAbi[8],
			fromBlock: args.fromBlock,
			toBlock: args.toBlock,
		});

		const announcements = logs.flatMap(logToPrivateAnnouncement);

		if (announcements.length > 0) {
			return {
				announcements: sortAnnouncements(announcements),
				fromBlock: args.fromBlock,
				note: null,
				scanSource: "eth-rpc logs",
				toBlock: args.toBlock,
			};
		}
	} catch {
		// Fall through to runtime scan.
	}

	const runtime = await scanRuntimeContractEvents<AnnouncementArgs>({
		abi: stealthPayAbi,
		contractAddress: args.contractAddress,
		eventName: "Announcement",
		requestedFromBlock: args.fromBlock,
		toBlock: args.toBlock,
		wsUrl: args.wsUrl,
	});

	return {
		announcements: sortAnnouncements(
			runtime.events.flatMap(runtimeAnnouncementToPrivateAnnouncement),
		),
		fromBlock: runtime.fromBlock,
		note: runtime.truncatedByPrunedState
			? "Historic runtime state was pruned before the requested range, so the private announcement scan started later than requested."
			: null,
		scanSource: "runtime fallback (Revive.ContractEmitted)",
		toBlock: runtime.toBlock,
	};
}

export async function scanPrivateAnnouncementsByMemoHash(args: {
	contractAddress: Address;
	ethRpcUrl?: string;
	memoHash: HexString;
	publicClient: PublicClientLike;
	toBlock: bigint;
	wsUrl: string;
}): Promise<PrivateAnnouncementScanResult> {
	const targetMemoHash = args.memoHash.toLowerCase();
	const filterExactMemo = (announcements: PrivateAnnouncementCandidate[]) =>
		sortAnnouncements(
			announcements.filter(
				(announcement) => announcement.memoHash.toLowerCase() === targetMemoHash,
			),
		);

	const indexedAnnouncement = await findIndexedAnnouncementByMemo({
		memoHash: args.memoHash,
		registryAddress: args.contractAddress,
	});
	if (indexedAnnouncement) {
		return {
			announcements: [indexedAnnouncement],
			fromBlock: indexedAnnouncement.blockNumber,
			note: null,
			scanSource: "StealthPay indexer exact memo lookup",
			toBlock: args.toBlock,
		};
	}

	const indexer = getPublicEventIndexerConfig(args.wsUrl, args.ethRpcUrl);
	if (indexer?.kind === "blockscout") {
		try {
			const logs = await fetchBlockscoutEventLogs({
				abi: stealthPayAbi,
				address: args.contractAddress,
				baseUrl: indexer.baseUrl,
				eventName: "Announcement",
				fromBlock: FULL_HISTORY_FROM_BLOCK,
				maxPages: EXACT_MEMO_BLOCKSCOUT_PAGE_LIMIT,
				toBlock: args.toBlock,
			});
			const announcements = filterExactMemo(logs.flatMap(logToPrivateAnnouncement));
			if (announcements.length > 0) {
				return {
					announcements,
					fromBlock: FULL_HISTORY_FROM_BLOCK,
					note: null,
					scanSource: "Blockscout exact memo lookup",
					toBlock: args.toBlock,
				};
			}
		} catch {
			// Fall through to direct eth-rpc scan.
		}
	}

	try {
		const logs = await args.publicClient.getLogs({
			address: args.contractAddress,
			event: stealthPayAbi[8],
			fromBlock: FULL_HISTORY_FROM_BLOCK,
			toBlock: args.toBlock,
		});
		const announcements = filterExactMemo(logs.flatMap(logToPrivateAnnouncement));
		if (announcements.length > 0) {
			return {
				announcements,
				fromBlock: FULL_HISTORY_FROM_BLOCK,
				note: null,
				scanSource: "eth-rpc exact memo lookup",
				toBlock: args.toBlock,
			};
		}
	} catch {
		// Fall through to runtime scan.
	}

	const runtime = await scanRuntimeContractEvents<AnnouncementArgs>({
		abi: stealthPayAbi,
		contractAddress: args.contractAddress,
		eventName: "Announcement",
		requestedFromBlock: FULL_HISTORY_FROM_BLOCK,
		toBlock: args.toBlock,
		wsUrl: args.wsUrl,
	});
	const announcements = filterExactMemo(
		runtime.events.flatMap(runtimeAnnouncementToPrivateAnnouncement),
	);

	return {
		announcements,
		fromBlock: runtime.fromBlock,
		note: runtime.truncatedByPrunedState
			? "Historic runtime state was pruned before the requested range, so exact gift lookup may not include older announcements."
			: null,
		scanSource: "runtime exact memo lookup (Revive.ContractEmitted)",
		toBlock: runtime.toBlock,
	};
}

export async function scanPoolDepositByCommitment(args: {
	commitment: HexString;
	ethRpcUrl?: string;
	poolAddress: Address;
	publicClient: PublicClientLike;
	toBlock: bigint;
	wsUrl: string;
}): Promise<ExactPoolDepositScanResult> {
	const targetCommitment = args.commitment.toLowerCase();
	const indexedDeposit = await findIndexedDepositByCommitment({
		commitment: args.commitment,
		poolAddress: args.poolAddress,
	});
	if (indexedDeposit) {
		return {
			deposit: indexedDeposit,
			fromBlock: indexedDeposit.blockNumber,
			note: null,
			scanSource: "StealthPay indexer exact deposit lookup",
			toBlock: args.toBlock,
		};
	}

	try {
		if (!privatePoolDepositEvent) {
			throw new Error("Private pool Deposit event ABI is missing.");
		}
		const logs = await args.publicClient.getLogs({
			address: args.poolAddress,
			event: privatePoolDepositEvent,
			args: { commitment: args.commitment },
			fromBlock: FULL_HISTORY_FROM_BLOCK,
			toBlock: args.toBlock,
		});
		const deposits = sortDeposits(
			logs.flatMap((log) => {
				const decoded = decodeDepositLog(log);
				return decoded
					? [
							{
								blockNumber: log.blockNumber ?? 0n,
								commitment: decoded.commitment,
								leafIndex: decoded.leafIndex,
								root: decoded.root,
							},
						]
					: [];
			}),
		).filter((deposit) => deposit.commitment.toLowerCase() === targetCommitment);
		if (deposits[0]) {
			return {
				deposit: deposits[0],
				fromBlock: FULL_HISTORY_FROM_BLOCK,
				note: null,
				scanSource: "eth-rpc exact deposit lookup",
				toBlock: args.toBlock,
			};
		}
	} catch {
		// Fall through to runtime event scan. Substrate Revive.call deposits are not
		// consistently exposed through the EVM log endpoints.
	}

	const runtimeFromBlock =
		args.toBlock > RECENT_RUNTIME_DEPOSIT_SCAN_DEPTH
			? args.toBlock - RECENT_RUNTIME_DEPOSIT_SCAN_DEPTH + 1n
			: FULL_HISTORY_FROM_BLOCK;
	const runtime = await scanRuntimeContractEvents<DepositArgs>({
		abi: privatePoolAbi,
		contractAddress: args.poolAddress,
		eventName: "Deposit",
		requestedFromBlock: runtimeFromBlock,
		stopWhen: (event) =>
			isDecodedDeposit(event.args) && event.args.commitment.toLowerCase() === targetCommitment,
		toBlock: args.toBlock,
		wsUrl: args.wsUrl,
	});
	const deposit =
		runtime.events
			.filter((event) => isDecodedDeposit(event.args))
			.map((event) => ({
				blockNumber: event.blockNumber,
				commitment: event.args.commitment,
				leafIndex: Number(event.args.leafIndex),
				root: event.args.root,
			}))
			.find((candidate) => candidate.commitment.toLowerCase() === targetCommitment) ?? null;

	return {
		deposit,
		fromBlock: runtime.fromBlock,
		note: runtime.truncatedByPrunedState
			? "Historic runtime state was pruned before the requested range, so exact pool deposit lookup may not include older deposits."
			: null,
		scanSource: "runtime exact deposit lookup (Revive.ContractEmitted)",
		toBlock: runtime.toBlock,
	};
}

export async function scanPoolDeposits(args: {
	bypassCache?: boolean;
	ethRpcUrl?: string;
	fromBlock: bigint;
	poolAddress: Address;
	publicClient: PublicClientLike;
	toBlock: bigint;
	wsUrl: string;
}): Promise<PoolDepositScanResult> {
	const expectedDepositCount =
		args.fromBlock === FULL_HISTORY_FROM_BLOCK ? await readExpectedPoolDepositCount(args) : null;

	if (args.fromBlock === FULL_HISTORY_FROM_BLOCK && !args.bypassCache) {
		const cached = readPoolDepositCache(args);
		if (
			cached &&
			cached.toBlock >= args.toBlock &&
			depositsHaveCompletePrefix(cached.deposits, expectedDepositCount)
		) {
			return {
				deposits: cached.deposits,
				fromBlock: cached.fromBlock,
				note: "Loaded public pool deposit history from this browser cache.",
				scanSource: "browser public event cache",
				toBlock: args.toBlock,
			};
		}

		if (
			cached &&
			depositsHaveCompletePrefix(cached.deposits, expectedDepositCount) &&
			cached.toBlock + 1n <= args.toBlock
		) {
			const incrementalScan = await scanPoolDepositsFromChain({
				...args,
				fromBlock: cached.toBlock + 1n,
			});
			const deposits = mergeDeposits(cached.deposits, incrementalScan.deposits);
			if (depositsHaveContiguousPrefix(deposits)) {
				writePoolDepositCache(args, {
					deposits,
					fromBlock: cached.fromBlock,
					toBlock: args.toBlock,
				});
				return {
					deposits,
					fromBlock: cached.fromBlock,
					note: incrementalScan.note,
					scanSource: `${incrementalScan.scanSource} + browser public event cache`,
					toBlock: args.toBlock,
				};
			}
		}
	}

	const result = await scanPoolDepositsFromChain(args);
	if (
		args.fromBlock === FULL_HISTORY_FROM_BLOCK &&
		depositsHaveContiguousPrefix(result.deposits)
	) {
		writePoolDepositCache(args, {
			deposits: result.deposits,
			fromBlock: result.fromBlock,
			toBlock: result.toBlock,
		});
	}
	return result;
}

async function scanPoolDepositsFromChain(args: {
	ethRpcUrl?: string;
	fromBlock: bigint;
	poolAddress: Address;
	publicClient: PublicClientLike;
	toBlock: bigint;
	wsUrl: string;
}): Promise<PoolDepositScanResult> {
	const expectedDepositCount =
		args.fromBlock === FULL_HISTORY_FROM_BLOCK ? await readExpectedPoolDepositCount(args) : null;
	let publicDeposits: PoolDepositRecord[] = [];
	let publicScanSource: string | null = null;

	if (args.fromBlock === FULL_HISTORY_FROM_BLOCK) {
		try {
			const indexedDeposits = await listIndexedDeposits({
				fromLeaf: 0,
				limit: expectedDepositCount ?? 1024,
				poolAddress: args.poolAddress,
			});
			if (indexedDeposits.length > 0) {
				publicDeposits = mergeDeposits(publicDeposits, indexedDeposits);
				publicScanSource = "StealthPay indexer public deposit history";
				if (
					isCompleteForRequestedRange(
						indexedDeposits,
						args.fromBlock,
						expectedDepositCount,
					)
				) {
					return {
						deposits: indexedDeposits,
						fromBlock: FULL_HISTORY_FROM_BLOCK,
						note: null,
						scanSource: "StealthPay indexer public deposit history",
						toBlock: args.toBlock,
					};
				}
			}
		} catch {
			// Indexer is optional; direct public RPC and runtime scans remain the fallback.
		}
	}

	const indexer = getPublicEventIndexerConfig(args.wsUrl, args.ethRpcUrl);
	if (indexer?.kind === "blockscout") {
		try {
			const logs = await fetchBlockscoutEventLogs({
				abi: privatePoolAbi,
				address: args.poolAddress,
				baseUrl: indexer.baseUrl,
				eventName: "Deposit",
				fromBlock: args.fromBlock,
				maxPages:
					args.fromBlock === FULL_HISTORY_FROM_BLOCK
						? POOL_DEPOSIT_BLOCKSCOUT_PAGE_LIMIT
						: undefined,
				toBlock: args.toBlock,
			});

			if (logs.length > 0) {
				const deposits = sortDeposits(
					logs.flatMap((log) => {
						const decoded = decodeDepositLog(log);
						if (!decoded) {
							return [];
						}
						return [
							{
								blockNumber: log.blockNumber ?? 0n,
								commitment: decoded.commitment,
								leafIndex: decoded.leafIndex,
								root: decoded.root,
							},
						];
					}),
				);
				publicDeposits = mergeDeposits(publicDeposits, deposits);
				publicScanSource = "Blockscout public event indexer";
				if (isCompleteForRequestedRange(deposits, args.fromBlock, expectedDepositCount)) {
					return {
						deposits,
						fromBlock: args.fromBlock,
						note: null,
						scanSource: "Blockscout public event indexer",
						toBlock: args.toBlock,
					};
				}
			}
		} catch {
			// Fall through to direct eth-rpc scan.
		}
	}

	try {
		if (!privatePoolDepositEvent) {
			throw new Error("Private pool Deposit event ABI is missing.");
		}
		const logs = await args.publicClient.getLogs({
			address: args.poolAddress,
			event: privatePoolDepositEvent,
			fromBlock: args.fromBlock,
			toBlock: args.toBlock,
		});

		if (logs.length > 0) {
			const deposits = sortDeposits(
				logs.flatMap((log) => {
					const decoded = decodeDepositLog(log);
					if (!decoded) {
						return [];
					}
					return [
						{
							blockNumber: log.blockNumber ?? 0n,
							commitment: decoded.commitment,
							leafIndex: decoded.leafIndex,
							root: decoded.root,
						},
					];
				}),
			);
			publicDeposits = mergeDeposits(publicDeposits, deposits);
			publicScanSource = publicScanSource
				? `${publicScanSource} + eth-rpc logs`
				: "eth-rpc logs";
			if (!isCompleteForRequestedRange(deposits, args.fromBlock, expectedDepositCount)) {
				throw new Error("eth-rpc returned incomplete pool deposit history.");
			}
			return {
				deposits,
				fromBlock: args.fromBlock,
				note: null,
				scanSource: "eth-rpc logs",
				toBlock: args.toBlock,
			};
		}
	} catch {
		// Fall through to runtime scan.
	}

	const runtimeFromBlock =
		args.fromBlock === FULL_HISTORY_FROM_BLOCK && args.toBlock > RECENT_RUNTIME_DEPOSIT_SCAN_DEPTH
			? args.toBlock - RECENT_RUNTIME_DEPOSIT_SCAN_DEPTH + 1n
			: args.fromBlock;
	const runtime = await scanRuntimeContractEvents<DepositArgs>({
		abi: privatePoolAbi,
		contractAddress: args.poolAddress,
		eventName: "Deposit",
		requestedFromBlock: runtimeFromBlock,
		toBlock: args.toBlock,
		wsUrl: args.wsUrl,
	});
	const runtimeDeposits = sortDeposits(
		runtime.events.map((event) => ({
			blockNumber: event.blockNumber,
			commitment: event.args.commitment,
			leafIndex: Number(event.args.leafIndex),
			root: event.args.root,
		})),
	);
	const mergedDeposits = mergeDeposits(publicDeposits, runtimeDeposits);

	return {
		deposits: mergedDeposits,
		fromBlock:
			publicDeposits.length > 0 && args.fromBlock === FULL_HISTORY_FROM_BLOCK
				? args.fromBlock
				: runtime.fromBlock,
		note: formatPoolDepositScanNote({
			deposits: mergedDeposits,
			expectedDepositCount,
			truncatedByPrunedState: runtime.truncatedByPrunedState,
		}),
		scanSource: publicScanSource
			? `${publicScanSource} + recent runtime fallback (Revive.ContractEmitted)`
			: "recent runtime fallback (Revive.ContractEmitted)",
		toBlock: runtime.toBlock,
	};
}

async function readExpectedPoolDepositCount(args: {
	poolAddress: Address;
	publicClient: PublicClientLike;
}) {
	try {
		if (!("readContract" in args.publicClient)) {
			return null;
		}
		const value = await args.publicClient.readContract({
			address: args.poolAddress,
			abi: privatePoolAbi,
			functionName: "nextIndex",
		});
		const count = Number(value);
		return Number.isSafeInteger(count) && count >= 0 ? count : null;
	} catch {
		return null;
	}
}

function isCompleteForRequestedRange(
	deposits: PoolDepositRecord[],
	fromBlock: bigint,
	expectedDepositCount: number | null,
) {
	if (fromBlock !== FULL_HISTORY_FROM_BLOCK) {
		return deposits.length > 0;
	}

	return depositsHaveCompletePrefix(deposits, expectedDepositCount);
}

function depositsHaveCompletePrefix(
	deposits: PoolDepositRecord[],
	expectedDepositCount: number | null,
) {
	if (!depositsHaveContiguousPrefix(deposits)) {
		return false;
	}

	if (expectedDepositCount === null) {
		return true;
	}

	if (expectedDepositCount === 0) {
		return deposits.length === 0;
	}

	const indexes = new Set(deposits.map((deposit) => deposit.leafIndex));
	for (let index = 0; index < expectedDepositCount; index += 1) {
		if (!indexes.has(index)) {
			return false;
		}
	}
	return true;
}

function formatPoolDepositScanNote(args: {
	deposits: PoolDepositRecord[];
	expectedDepositCount: number | null;
	truncatedByPrunedState: boolean;
}) {
	const notes: string[] = [];
	if (args.truncatedByPrunedState) {
		notes.push(
			"Historic runtime state was pruned before the requested range, so the pool deposit scan started later than requested.",
		);
	}
	if (
		args.expectedDepositCount !== null &&
		!depositsHaveCompletePrefix(args.deposits, args.expectedDepositCount)
	) {
		notes.push(
			`The pool reports ${args.expectedDepositCount} deposits, but the public index reconstructed ${args.deposits.length}. This index is incomplete for Merkle proof reconstruction.`,
		);
	}
	return notes.length > 0 ? notes.join(" ") : null;
}

type PoolDepositCacheRecord = {
	blockNumber: string;
	commitment: HexString;
	leafIndex: number;
	root: HexString;
};

type PoolDepositCachePayload = {
	deposits: PoolDepositCacheRecord[];
	fromBlock: string;
	toBlock: string;
	v: typeof POOL_DEPOSIT_CACHE_VERSION;
};

function readPoolDepositCache(args: {
	ethRpcUrl?: string;
	poolAddress: Address;
	wsUrl: string;
}): { deposits: PoolDepositRecord[]; fromBlock: bigint; toBlock: bigint } | null {
	if (typeof localStorage === "undefined") {
		return null;
	}

	try {
		const raw = localStorage.getItem(getPoolDepositCacheKey(args));
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as PoolDepositCachePayload;
		if (parsed.v !== POOL_DEPOSIT_CACHE_VERSION || !Array.isArray(parsed.deposits)) {
			return null;
		}

		const deposits = parsed.deposits.map((deposit) => ({
			blockNumber: BigInt(deposit.blockNumber),
			commitment: deposit.commitment,
			leafIndex: deposit.leafIndex,
			root: deposit.root,
		}));
		if (!deposits.every(isPoolDepositRecord) || !depositsHaveContiguousPrefix(deposits)) {
			return null;
		}

		return {
			deposits: sortDeposits(deposits),
			fromBlock: BigInt(parsed.fromBlock),
			toBlock: BigInt(parsed.toBlock),
		};
	} catch {
		return null;
	}
}

function writePoolDepositCache(
	args: { ethRpcUrl?: string; poolAddress: Address; wsUrl: string },
	value: { deposits: PoolDepositRecord[]; fromBlock: bigint; toBlock: bigint },
) {
	if (typeof localStorage === "undefined" || !depositsHaveContiguousPrefix(value.deposits)) {
		return;
	}

	try {
		const payload: PoolDepositCachePayload = {
			deposits: sortDeposits(value.deposits).map((deposit) => ({
				blockNumber: deposit.blockNumber.toString(),
				commitment: deposit.commitment,
				leafIndex: deposit.leafIndex,
				root: deposit.root,
			})),
			fromBlock: value.fromBlock.toString(),
			toBlock: value.toBlock.toString(),
			v: POOL_DEPOSIT_CACHE_VERSION,
		};
		localStorage.setItem(getPoolDepositCacheKey(args), JSON.stringify(payload));
	} catch {
		// Cache writes are a performance optimization only.
	}
}

function getPoolDepositCacheKey(args: {
	ethRpcUrl?: string;
	poolAddress: Address;
	wsUrl: string;
}) {
	return [
		POOL_DEPOSIT_CACHE_PREFIX,
		args.poolAddress.toLowerCase(),
		args.wsUrl,
		args.ethRpcUrl ?? "",
	].join(":");
}

function mergeDeposits(
	cachedDeposits: PoolDepositRecord[],
	nextDeposits: PoolDepositRecord[],
) {
	const byLeafIndex = new Map<number, PoolDepositRecord>();
	for (const deposit of [...cachedDeposits, ...nextDeposits]) {
		byLeafIndex.set(deposit.leafIndex, deposit);
	}
	return sortDeposits([...byLeafIndex.values()]);
}

function isPoolDepositRecord(value: PoolDepositRecord) {
	return (
		typeof value.blockNumber === "bigint" &&
		typeof value.commitment === "string" &&
		/^0x[a-fA-F0-9]{64}$/.test(value.commitment) &&
		Number.isInteger(value.leafIndex) &&
		value.leafIndex >= 0 &&
		typeof value.root === "string" &&
		/^0x[a-fA-F0-9]{64}$/.test(value.root)
	);
}

function sortAnnouncements(announcements: PrivateAnnouncementCandidate[]) {
	return [...announcements].sort((a, b) => Number(a.blockNumber - b.blockNumber));
}

function sortDeposits(deposits: PoolDepositRecord[]) {
	return [...deposits].sort((a, b) => a.leafIndex - b.leafIndex);
}

function depositsHaveContiguousPrefix(deposits: PoolDepositRecord[]) {
	if (deposits.length === 0) {
		return true;
	}

	const indexes = new Set(deposits.map((deposit) => deposit.leafIndex));
	const maxIndex = Math.max(...indexes);
	for (let index = 0; index <= maxIndex; index += 1) {
		if (!indexes.has(index)) {
			return false;
		}
	}
	return true;
}

function logToPrivateAnnouncement(log: Log): PrivateAnnouncementCandidate[] {
	const decoded = decodeAnnouncementLog(log);
	if (!decoded || decoded.schemeId !== 2n) {
		return [];
	}

	return [
		{
			blockNumber: log.blockNumber ?? 0n,
			ephemeralPubKey: decoded.ephemeralPubKey,
			groupKey: log.transactionHash ?? `${log.blockHash}:${log.logIndex ?? 0}`,
			memoHash: decoded.memoHash,
			nonce: decoded.nonce,
			poolAddress: decoded.stealthAddress as Address,
			sender: decoded.sender,
			transactionHash: (log.transactionHash ?? "0x") as HexString,
			viewTag: decoded.viewTag,
		},
	];
}

function runtimeAnnouncementToPrivateAnnouncement(event: {
	args: AnnouncementArgs;
	blockNumber: bigint;
	groupKey: string;
	transactionHash: HexString;
}): PrivateAnnouncementCandidate[] {
	if (event.args.schemeId !== 2n) {
		return [];
	}
	return [
		{
			blockNumber: event.blockNumber,
			ephemeralPubKey: event.args.ephemeralPubKey,
			groupKey: event.groupKey,
			memoHash: event.args.memoHash,
			nonce: event.args.nonce,
			poolAddress: event.args.stealthAddress as Address,
			sender: event.args.sender,
			transactionHash: event.transactionHash,
			viewTag: Number(event.args.viewTag),
		},
	];
}

function decodeAnnouncementLog(log: Log): AnnouncementArgs | null {
	try {
		const decoded = decodeEventLog({
			abi: stealthPayAbi,
			data: log.data,
			eventName: "Announcement",
			topics: log.topics as [Hex, ...Hex[]],
			strict: true,
		});

		return decoded.args as AnnouncementArgs;
	} catch {
		return null;
	}
}

function decodeDepositLog(log: Log): DepositArgs | null {
	try {
		const decoded = decodeEventLog({
			abi: privatePoolAbi,
			data: log.data,
			eventName: "Deposit",
			topics: log.topics as [Hex, ...Hex[]],
			strict: true,
		});

		const deposit = {
			commitment: decoded.args.commitment as HexString,
			leafIndex: Number(decoded.args.leafIndex),
			root: decoded.args.root as HexString,
		};
		return isDecodedDeposit(deposit) ? deposit : null;
	} catch {
		return null;
	}
}

function isDecodedDeposit(value: DepositArgs) {
	return (
		typeof value.commitment === "string" &&
		/^0x[a-fA-F0-9]{64}$/.test(value.commitment) &&
		Number.isInteger(value.leafIndex) &&
		value.leafIndex >= 0 &&
		typeof value.root === "string" &&
		/^0x[a-fA-F0-9]{64}$/.test(value.root)
	);
}
