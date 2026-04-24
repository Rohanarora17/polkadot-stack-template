import type { Address, Hex } from "viem";

import type { HexString } from "../crypto/stealth";

export type EmbeddedClaimWalletMetadata = {
	address: Address;
	commitment: HexString;
	createdAt: number;
	id: string;
	label: string;
	memoHash: HexString;
	poolAddress: Address;
};

type StoredEmbeddedClaimWallet = EmbeddedClaimWalletMetadata & {
	ciphertext: HexString;
	iv: HexString;
};

const DB_NAME = "stealthpay-embedded-wallet-vault";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const DEVICE_KEY_ID = "device-key";
const STORAGE_KEY = "stealthpay-embedded-claim-wallets-v1";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function saveEmbeddedClaimWallet(args: {
	address: Address;
	commitment: HexString;
	label?: string;
	memoHash: HexString;
	poolAddress: Address;
	privateKey: Hex;
}) {
	const key = await getOrCreateDeviceKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ iv, name: "AES-GCM" },
		key,
		encoder.encode(
			JSON.stringify({
				privateKey: args.privateKey,
				v: 1,
			}),
		),
	);
	const record: StoredEmbeddedClaimWallet = {
		address: args.address,
		ciphertext: bytesToHex(new Uint8Array(ciphertext)),
		commitment: args.commitment,
		createdAt: Date.now(),
		id: args.commitment,
		iv: bytesToHex(iv),
		label: args.label ?? "Walletless gift claim wallet",
		memoHash: args.memoHash,
		poolAddress: args.poolAddress,
	};

	writeStoredWallets(
		[record, ...readStoredWallets().filter((wallet) => wallet.id !== record.id)].slice(0, 20),
	);

	return toMetadata(record);
}

export function listEmbeddedClaimWallets(): EmbeddedClaimWalletMetadata[] {
	return readStoredWallets().map(toMetadata);
}

export async function readEmbeddedClaimWalletPrivateKey(id: string): Promise<Hex | null> {
	const record = readStoredWallets().find((wallet) => wallet.id === id);
	if (!record) {
		return null;
	}

	const key = await getOrCreateDeviceKey();
	const plaintext = await crypto.subtle.decrypt(
		{ iv: hexToBytes(record.iv), name: "AES-GCM" },
		key,
		hexToBytes(record.ciphertext),
	);
	const parsed = JSON.parse(decoder.decode(plaintext)) as { privateKey?: unknown };
	return typeof parsed.privateKey === "string" && /^0x[0-9a-fA-F]{64}$/.test(parsed.privateKey)
		? (parsed.privateKey as Hex)
		: null;
}

function toMetadata(record: StoredEmbeddedClaimWallet): EmbeddedClaimWalletMetadata {
	return {
		address: record.address,
		commitment: record.commitment,
		createdAt: record.createdAt,
		id: record.id,
		label: record.label,
		memoHash: record.memoHash,
		poolAddress: record.poolAddress,
	};
}

function readStoredWallets(): StoredEmbeddedClaimWallet[] {
	if (typeof localStorage === "undefined") {
		return [];
	}

	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter(isStoredWallet) : [];
	} catch {
		return [];
	}
}

function writeStoredWallets(wallets: StoredEmbeddedClaimWallet[]) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
	window.dispatchEvent(new Event("stealthpay-embedded-wallet-vault"));
}

function isStoredWallet(value: unknown): value is StoredEmbeddedClaimWallet {
	if (!value || typeof value !== "object") {
		return false;
	}
	const record = value as Partial<StoredEmbeddedClaimWallet>;
	return (
		typeof record.id === "string" &&
		isAddress(record.address) &&
		isHex(record.commitment) &&
		isHex(record.memoHash) &&
		isHex(record.ciphertext) &&
		isHex(record.iv) &&
		isAddress(record.poolAddress) &&
		typeof record.createdAt === "number" &&
		typeof record.label === "string"
	);
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
	assertBrowserVaultAvailable();
	const existing = await readDeviceKey();
	if (existing) {
		return existing;
	}

	const key = await crypto.subtle.generateKey({ length: 256, name: "AES-GCM" }, false, [
		"decrypt",
		"encrypt",
	]);
	await writeDeviceKey(key);
	return key;
}

function assertBrowserVaultAvailable() {
	if (
		typeof indexedDB === "undefined" ||
		typeof crypto === "undefined" ||
		!crypto.subtle ||
		typeof localStorage === "undefined"
	) {
		throw new Error(
			"This browser cannot create the local private wallet vault. Open the gift in a modern wallet-enabled browser or claim to an existing wallet.",
		);
	}
}

async function readDeviceKey(): Promise<CryptoKey | null> {
	const db = await openVaultDb();
	return new Promise((resolve, reject) => {
		const request = db
			.transaction(KEY_STORE, "readonly")
			.objectStore(KEY_STORE)
			.get(DEVICE_KEY_ID);
		request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
		request.onerror = () => reject(request.error);
	});
}

async function writeDeviceKey(key: CryptoKey) {
	const db = await openVaultDb();
	return new Promise<void>((resolve, reject) => {
		const request = db
			.transaction(KEY_STORE, "readwrite")
			.objectStore(KEY_STORE)
			.put(key, DEVICE_KEY_ID);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

function openVaultDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(KEY_STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function bytesToHex(bytes: Uint8Array): HexString {
	return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function hexToBytes(hex: HexString): Uint8Array {
	const clean = hex.slice(2);
	const bytes = new Uint8Array(clean.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

function isHex(value: unknown): value is HexString {
	return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);
}

function isAddress(value: unknown): value is Address {
	return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}
