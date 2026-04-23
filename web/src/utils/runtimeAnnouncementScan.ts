import { getDynamicBuilder, getLookupFn } from "@polkadot-api/metadata-builders";
import { decAnyMetadata, unifyMetadata } from "@polkadot-api/substrate-bindings";
import { decodeEventLog, keccak256, stringToHex, type Address } from "viem";

import { stealthPayAbi } from "../config/stealthPay";
import { getClient } from "../hooks/useChain";
import type { HexString } from "../crypto/stealth";
import type { AnnouncementCandidate } from "./stealthScan";

type RuntimePhase =
	| { type: "ApplyExtrinsic"; value: number }
	| { type: "Finalization" }
	| { type: "Initialization" };

type RuntimeAnnouncementEvent = {
	blockHash: HexString;
	blockNumber: bigint;
	contractAddress: HexString;
	dataHex: HexString;
	eventIndex: number;
	phase: RuntimePhase;
	topicsHex: HexString[];
};

export type RuntimeAnnouncementScanResult = {
	announcements: AnnouncementCandidate[];
	fromBlock: bigint;
	toBlock: bigint;
	truncatedByPrunedState: boolean;
};

export function decodeRuntimeAnnouncementEvent(
	event: RuntimeAnnouncementEvent,
): AnnouncementCandidate | null {
	try {
		const decoded = decodeEventLog({
			abi: stealthPayAbi,
			eventName: "Announcement",
			topics: event.topicsHex as [HexString, ...HexString[]],
			data: event.dataHex,
			strict: true,
		});

		if (decoded.eventName !== "Announcement" || decoded.args.schemeId !== 1n) {
			return null;
		}

		const syntheticTransactionHash = keccak256(
			stringToHex(
				`${event.blockHash}:${event.phase.type === "ApplyExtrinsic" ? event.phase.value : "sys"}:${event.eventIndex}`,
			),
		) as HexString;

		return {
			blockNumber: event.blockNumber,
			ephemeralPubKey: decoded.args.ephemeralPubKey as HexString,
			memoHash: decoded.args.memoHash as HexString,
			nonce: decoded.args.nonce,
			sender: decoded.args.sender as HexString,
			stealthAddress: decoded.args.stealthAddress as HexString,
			transactionHash: syntheticTransactionHash,
			viewTag: Number(decoded.args.viewTag),
		};
	} catch {
		return null;
	}
}

export async function scanRuntimeAnnouncements({
	contractAddress,
	requestedFromBlock,
	toBlock,
	wsUrl,
}: {
	contractAddress: Address;
	requestedFromBlock: bigint;
	toBlock: bigint;
	wsUrl: string;
}): Promise<RuntimeAnnouncementScanResult> {
	const client = getClient(wsUrl);
	const metadataRaw = await client.getMetadata("finalized");
	const metadata = unifyMetadata(decAnyMetadata(metadataRaw));
	const dynamicBuilder = getDynamicBuilder(getLookupFn(metadata));
	const eventStorage = dynamicBuilder.buildStorage("System", "Events");
	const eventStorageKey = eventStorage.keys.enc();

	const announcementsDescending: AnnouncementCandidate[] = [];
	let actualFromBlock = requestedFromBlock;
	let truncatedByPrunedState = false;

	for (let blockNumber = toBlock; blockNumber >= requestedFromBlock; blockNumber--) {
		const blockHash = (await client._request("chain_getBlockHash", [
			Number(blockNumber),
		])) as HexString | null;

		if (!blockHash) {
			if (blockNumber === 0n) {
				break;
			}
			continue;
		}

		let rawEventsHex: HexString | null = null;
		try {
			rawEventsHex = (await client._request("state_getStorageAt", [
				eventStorageKey,
				blockHash,
			])) as HexString | null;
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			if (message.includes("UnknownBlock: State already discarded")) {
				actualFromBlock = blockNumber + 1n;
				truncatedByPrunedState = true;
				break;
			}
			throw cause;
		}

		if (!rawEventsHex || rawEventsHex === "0x") {
			if (blockNumber === 0n) {
				break;
			}
			continue;
		}

		const decodedEvents = eventStorage.value.dec(hexToBytes(rawEventsHex)) as Array<{
			event: {
				type: string;
				value: {
					type: string;
					value: {
						contract: { asHex(): HexString };
						data: { asHex(): HexString };
						topics: Array<{ asHex(): HexString }>;
					};
				};
			};
			phase: RuntimePhase;
		}>;

		decodedEvents.forEach((entry, eventIndex) => {
			if (
				entry.event.type !== "Revive" ||
				entry.event.value.type !== "ContractEmitted" ||
				entry.event.value.value.contract.asHex().toLowerCase() !==
					contractAddress.toLowerCase()
			) {
				return;
			}

			const candidate = decodeRuntimeAnnouncementEvent({
				blockHash,
				blockNumber,
				contractAddress: entry.event.value.value.contract.asHex(),
				dataHex: entry.event.value.value.data.asHex(),
				eventIndex,
				phase: entry.phase,
				topicsHex: entry.event.value.value.topics.map((topic) => topic.asHex()),
			});

			if (candidate) {
				announcementsDescending.push(candidate);
			}
		});

		if (blockNumber === 0n) {
			break;
		}
	}

	return {
		announcements: announcementsDescending.reverse(),
		fromBlock: actualFromBlock,
		toBlock,
		truncatedByPrunedState,
	};
}

function hexToBytes(value: HexString) {
	const normalized = value.startsWith("0x") ? value.slice(2) : value;
	const out = new Uint8Array(normalized.length / 2);
	for (let i = 0; i < normalized.length; i += 2) {
		out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
	}
	return out;
}
