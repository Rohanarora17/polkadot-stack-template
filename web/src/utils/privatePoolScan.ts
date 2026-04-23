import { decodeEventLog, type AbiEvent, type Address, type Hex, type Log } from "viem";

import { getPublicClient } from "../config/evm";
import { getPublicEventIndexerConfig } from "../config/indexer";
import { privatePoolAbi } from "../config/privatePool";
import { stealthPayAbi } from "../config/stealthPay";
import type { HexString } from "../crypto/stealth";
import type { PoolDepositRecord } from "../crypto/privatePool";
import { fetchBlockscoutEventLogs } from "./blockscoutIndexer";
import { scanRuntimeContractEvents } from "./runtimeContractEvents";

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
			const announcements = logs.flatMap((log) => {
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
			});

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

		const announcements = logs.flatMap((log) => {
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
		});

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
			runtime.events.flatMap((event) => {
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
			}),
		),
		fromBlock: runtime.fromBlock,
		note: runtime.truncatedByPrunedState
			? "Historic runtime state was pruned before the requested range, so the private announcement scan started later than requested."
			: null,
		scanSource: "runtime fallback (Revive.ContractEmitted)",
		toBlock: runtime.toBlock,
	};
}

export async function scanPoolDeposits(args: {
	ethRpcUrl?: string;
	fromBlock: bigint;
	poolAddress: Address;
	publicClient: PublicClientLike;
	toBlock: bigint;
	wsUrl: string;
}): Promise<PoolDepositScanResult> {
	const indexer = getPublicEventIndexerConfig(args.wsUrl, args.ethRpcUrl);
	if (indexer?.kind === "blockscout") {
		try {
			const logs = await fetchBlockscoutEventLogs({
				abi: privatePoolAbi,
				address: args.poolAddress,
				baseUrl: indexer.baseUrl,
				eventName: "Deposit",
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
				return {
					deposits,
					fromBlock: args.fromBlock,
					note: depositsHaveContiguousPrefix(deposits)
						? null
						: "Blockscout returned pool deposit logs, but the selected scan range does not include all earlier deposit leaves needed for old notes.",
					scanSource: "Blockscout public event indexer",
					toBlock: args.toBlock,
				};
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
			if (!depositsHaveContiguousPrefix(deposits)) {
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

	const runtime = await scanRuntimeContractEvents<DepositArgs>({
		abi: privatePoolAbi,
		contractAddress: args.poolAddress,
		eventName: "Deposit",
		requestedFromBlock: args.fromBlock,
		toBlock: args.toBlock,
		wsUrl: args.wsUrl,
	});

	return {
		deposits: sortDeposits(
			runtime.events.map((event) => ({
				blockNumber: event.blockNumber,
				commitment: event.args.commitment,
				leafIndex: Number(event.args.leafIndex),
				root: event.args.root,
			})),
		),
		fromBlock: runtime.fromBlock,
		note: runtime.truncatedByPrunedState
			? "Historic runtime state was pruned before the requested range, so the pool deposit scan started later than requested."
			: null,
		scanSource: "runtime fallback (Revive.ContractEmitted)",
		toBlock: runtime.toBlock,
	};
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
