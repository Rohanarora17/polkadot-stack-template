import type { Address } from "viem";

import type { HexString } from "../crypto/stealth";
import type { PoolDepositRecord } from "../crypto/privatePool";
import type { PrivateAnnouncementCandidate } from "./privatePoolScan";

type IndexedDeposit = {
	blockNumber: string;
	commitment: HexString;
	eventRef?: string;
	leafIndex: number;
	poolAddress: Address;
	root: HexString;
};

type IndexedAnnouncement = {
	blockNumber: string;
	ephemeralPubKey: HexString;
	eventRef?: string;
	memoHash: HexString;
	nonce: string;
	poolAddress: Address;
	registryAddress: Address;
	sender: HexString;
	viewTag: number;
};

type IndexedWithdrawal = {
	blockNumber: string;
	fee: string;
	nullifierHash: HexString;
	poolAddress: Address;
	recipient: Address;
	relayer: Address;
};

const INDEXER_REQUEST_TIMEOUT_MS = 3_500;

export function getStealthPayIndexerUrl() {
	if (
		import.meta.env.VITE_STEALTHPAY_INDEXER_KIND === "none" ||
		import.meta.env.VITE_STEALTHPAY_INDEXER_KIND === "blockscout"
	) {
		return null;
	}

	const configured =
		import.meta.env.VITE_STEALTHPAY_INDEXER_URL || import.meta.env.VITE_RELAYER_URL;
	const globalProcess = (
		globalThis as {
			process?: { env?: Record<string, string | undefined> };
		}
	).process;
	if (!configured && globalProcess?.env?.VITEST) {
		return null;
	}
	const fallback = isLocalBrowserHost() ? "http://127.0.0.1:8787" : "";
	const candidate = configured || fallback;
	if (!candidate || (isLoopbackUrl(candidate) && !isLocalBrowserHost())) {
		return null;
	}
	return normalizeBaseUrl(candidate);
}

export async function findIndexedDepositByCommitment(args: {
	commitment: HexString;
	poolAddress: Address;
}): Promise<PoolDepositRecord | null> {
	const data = await fetchIndexerJson<{ deposit: IndexedDeposit | null }>("/index/deposit", {
		commitment: args.commitment,
		pool: args.poolAddress,
	});
	return data?.deposit ? indexedDepositToPoolDeposit(data.deposit) : null;
}

export async function listIndexedDeposits(args: {
	fromLeaf?: number;
	limit?: number;
	poolAddress: Address;
}): Promise<PoolDepositRecord[]> {
	const data = await fetchIndexerJson<{ deposits: IndexedDeposit[] }>("/index/deposits", {
		fromLeaf: String(args.fromLeaf ?? 0),
		limit: String(args.limit ?? 1024),
		pool: args.poolAddress,
	});
	return (data?.deposits ?? []).map(indexedDepositToPoolDeposit);
}

export async function findIndexedAnnouncementByMemo(args: {
	memoHash: HexString;
	registryAddress: Address;
}): Promise<PrivateAnnouncementCandidate | null> {
	const data = await fetchIndexerJson<{ announcement: IndexedAnnouncement | null }>(
		"/index/announcement",
		{
			memo: args.memoHash,
			registry: args.registryAddress,
		},
	);
	return data?.announcement ? indexedAnnouncementToCandidate(data.announcement) : null;
}

export async function findIndexedWithdrawalByNullifier(args: {
	nullifierHash: HexString;
	poolAddress: Address;
}): Promise<IndexedWithdrawal | null> {
	const data = await fetchIndexerJson<{ withdrawal: IndexedWithdrawal | null }>(
		"/index/withdrawal",
		{
			nullifierHash: args.nullifierHash,
			pool: args.poolAddress,
		},
	);
	return data?.withdrawal ?? null;
}

async function fetchIndexerJson<T>(
	path: string,
	params: Record<string, string>,
): Promise<T | null> {
	const baseUrl = getStealthPayIndexerUrl();
	if (!baseUrl || baseUrl.includes("blockscout")) {
		return null;
	}

	try {
		const url = new URL(`${baseUrl}${path}`);
		Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
		const controller = new AbortController();
		const timeout = globalThis.setTimeout(() => controller.abort(), INDEXER_REQUEST_TIMEOUT_MS);
		const response = await fetch(url, { signal: controller.signal }).finally(() =>
			globalThis.clearTimeout(timeout),
		);
		if (!response.ok) {
			return null;
		}
		return (await response.json()) as T;
	} catch {
		return null;
	}
}

function indexedDepositToPoolDeposit(deposit: IndexedDeposit): PoolDepositRecord {
	return {
		blockNumber: BigInt(deposit.blockNumber),
		commitment: deposit.commitment,
		leafIndex: Number(deposit.leafIndex),
		root: deposit.root,
	};
}

function indexedAnnouncementToCandidate(
	announcement: IndexedAnnouncement,
): PrivateAnnouncementCandidate {
	return {
		blockNumber: BigInt(announcement.blockNumber),
		ephemeralPubKey: announcement.ephemeralPubKey,
		groupKey: announcement.eventRef ?? `${announcement.blockNumber}:${announcement.nonce}`,
		memoHash: announcement.memoHash,
		nonce: BigInt(announcement.nonce),
		poolAddress: announcement.poolAddress,
		sender: announcement.sender,
		transactionHash: "0x",
		viewTag: Number(announcement.viewTag),
	};
}

function normalizeBaseUrl(value: string) {
	return value.replace(/\/+$/, "");
}

function isLocalBrowserHost() {
	if (typeof window === "undefined") {
		return true;
	}
	return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function isLoopbackUrl(value: string) {
	try {
		const url = new URL(value);
		return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
	} catch {
		return false;
	}
}
