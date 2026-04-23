import {
	decodeStealthSeed,
	encodeStealthSeedHex,
	generateStealthSeed,
	type HexString,
} from "../crypto/stealth";
import type { TransactionWalletSession } from "../wallet/stealthRegister";

const STEALTH_SEED_STORAGE_PREFIX = "stealthpay-stealth-seed";

export type StoredStealthSeed = {
	chainId: string;
	createdAt: string;
	originSs58: string;
	seedHex: HexString;
};

export type LoadedStealthSeed = {
	record: StoredStealthSeed;
	seedBytes: Uint8Array;
};

export type ResolveStealthSeedInput = {
	importedSeedHex?: string;
	session: TransactionWalletSession;
};

export type ResolvedStealthSeed = LoadedStealthSeed & {
	source: "generated" | "imported" | "stored";
};

export function getStealthSeedStorageKey(session: TransactionWalletSession) {
	return [
		STEALTH_SEED_STORAGE_PREFIX,
		session.chainId.toString(),
		session.originSs58.toLowerCase(),
	].join(":");
}

export function loadStoredStealthSeed(session: TransactionWalletSession): LoadedStealthSeed | null {
	const raw = localStorage.getItem(getStealthSeedStorageKey(session));
	if (!raw) {
		return null;
	}

	const parsed = JSON.parse(raw) as StoredStealthSeed;
	const seedBytes = decodeStealthSeed(parsed.seedHex);
	return { record: parsed, seedBytes };
}

export function storeStealthSeed(
	session: TransactionWalletSession,
	seedBytes: Uint8Array,
): LoadedStealthSeed {
	const record: StoredStealthSeed = {
		chainId: session.chainId.toString(),
		createdAt: new Date().toISOString(),
		originSs58: session.originSs58,
		seedHex: encodeStealthSeedHex(seedBytes),
	};

	localStorage.setItem(getStealthSeedStorageKey(session), JSON.stringify(record));
	return { record, seedBytes };
}

export function resolveStealthSeed({
	importedSeedHex,
	session,
}: ResolveStealthSeedInput): ResolvedStealthSeed {
	const normalizedImport = importedSeedHex?.trim();
	if (normalizedImport) {
		const seedBytes = decodeStealthSeed(normalizedImport as HexString);
		const stored = storeStealthSeed(session, seedBytes);
		return { ...stored, source: "imported" };
	}

	const existing = loadStoredStealthSeed(session);
	if (existing) {
		return { ...existing, source: "stored" };
	}

	const generated = storeStealthSeed(session, generateStealthSeed());
	return { ...generated, source: "generated" };
}

export function requireStealthSeed({
	importedSeedHex,
	session,
}: ResolveStealthSeedInput): ResolvedStealthSeed {
	const normalizedImport = importedSeedHex?.trim();
	if (normalizedImport) {
		const seedBytes = decodeStealthSeed(normalizedImport as HexString);
		const stored = storeStealthSeed(session, seedBytes);
		return { ...stored, source: "imported" };
	}

	const existing = loadStoredStealthSeed(session);
	if (!existing) {
		throw new Error(
			"No stored stealth seed was found for this signer and chain. Import the seed you exported during registration, or register this signer first.",
		);
	}

	return { ...existing, source: "stored" };
}
