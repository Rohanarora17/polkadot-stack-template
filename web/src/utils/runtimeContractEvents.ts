import { getDynamicBuilder, getLookupFn } from "@polkadot-api/metadata-builders";
import { decAnyMetadata, unifyMetadata } from "@polkadot-api/substrate-bindings";
import { decodeEventLog, keccak256, stringToHex, type Abi, type Address } from "viem";

import { getClient } from "../hooks/useChain";
import type { HexString } from "../crypto/stealth";

type RuntimePhase =
	| { type: "ApplyExtrinsic"; value: number }
	| { type: "Finalization" }
	| { type: "Initialization" };

type RuntimeContractEvent = {
	blockHash: HexString;
	blockNumber: bigint;
	dataHex: HexString;
	eventIndex: number;
	phase: RuntimePhase;
	topicsHex: HexString[];
};

export type DecodedRuntimeContractEvent<TArgs extends Record<string, unknown>> = {
	args: TArgs;
	blockNumber: bigint;
	groupKey: string;
	transactionHash: HexString;
};

export type RuntimeContractEventScanResult<TArgs extends Record<string, unknown>> = {
	events: Array<DecodedRuntimeContractEvent<TArgs>>;
	fromBlock: bigint;
	toBlock: bigint;
	truncatedByPrunedState: boolean;
};

export async function scanRuntimeContractEvents<TArgs extends Record<string, unknown>>({
	abi,
	contractAddress,
	eventName,
	requestedFromBlock,
	toBlock,
	wsUrl,
}: {
	abi: Abi;
	contractAddress: Address;
	eventName: string;
	requestedFromBlock: bigint;
	toBlock: bigint;
	wsUrl: string;
}): Promise<RuntimeContractEventScanResult<TArgs>> {
	const client = getClient(wsUrl);
	const metadataRaw = await client.getMetadata("finalized");
	const metadata = unifyMetadata(decAnyMetadata(metadataRaw));
	const dynamicBuilder = getDynamicBuilder(getLookupFn(metadata));
	const eventStorage = dynamicBuilder.buildStorage("System", "Events");
	const eventStorageKey = eventStorage.keys.enc();

	const decodedDescending: Array<DecodedRuntimeContractEvent<TArgs>> = [];
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

			const decoded = decodeRuntimeEvent<TArgs>(
				{
					blockHash,
					blockNumber,
					dataHex: entry.event.value.value.data.asHex(),
					eventIndex,
					phase: entry.phase,
					topicsHex: entry.event.value.value.topics.map((topic) => topic.asHex()),
				},
				abi,
				eventName,
			);

			if (decoded) {
				decodedDescending.push(decoded);
			}
		});

		if (blockNumber === 0n) {
			break;
		}
	}

	return {
		events: decodedDescending.reverse(),
		fromBlock: actualFromBlock,
		toBlock,
		truncatedByPrunedState,
	};
}

function decodeRuntimeEvent<TArgs extends Record<string, unknown>>(
	event: RuntimeContractEvent,
	abi: Abi,
	eventName: string,
): DecodedRuntimeContractEvent<TArgs> | null {
	try {
		const decoded = decodeEventLog({
			abi,
			eventName,
			topics: event.topicsHex as [HexString, ...HexString[]],
			data: event.dataHex,
			strict: true,
		});

		const groupKey = `${event.blockHash}:${event.phase.type === "ApplyExtrinsic" ? event.phase.value : "sys"}`;
		const transactionHash = keccak256(
			stringToHex(`${groupKey}:${event.eventIndex}`),
		) as HexString;

		return {
			args: decoded.args as unknown as TArgs,
			blockNumber: event.blockNumber,
			groupKey,
			transactionHash,
		};
	} catch {
		return null;
	}
}

function hexToBytes(value: HexString) {
	const normalized = value.startsWith("0x") ? value.slice(2) : value;
	const out = new Uint8Array(normalized.length / 2);
	for (let i = 0; i < normalized.length; i += 2) {
		out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
	}
	return out;
}
