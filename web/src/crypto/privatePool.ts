import { buildPoseidon } from "circomlibjs";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { keccak256, encodeAbiParameters, type Address } from "viem";

import type { HexString } from "./stealth";

export const PRIVATE_POOL_TREE_DEPTH = 10;
export const PRIVATE_POOL_DENOMINATION = 10n ** 18n;
export const PRIVATE_POOL_BACKUP_VERSION = 1;
export const PRIVATE_POOL_NOTE_VERSION = 1;
export const SNARK_SCALAR_FIELD =
	21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const zeroValues: bigint[] = [
	0x0000000000000000000000000000000000000000000000000000000000000000n,
	0x2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864n,
	0x1069673dcdb12263df301a6ff584a7ec261a44cb9dc68df067a4774460b1f1e1n,
	0x18f43331537ee2af2e3d758d50f72106467c6eea50371dd528d57eb2b856d238n,
	0x07f9d837cb17b0d36320ffe93ba52345f1b728571a568265caac97559dbc952an,
	0x2b94cf5e8746b3f5c9631f4c5df32907a699c58c94b2ad4d7b5cec1639183f55n,
	0x2dee93c5a666459646ea7d22cca9e1bcfed71e6951b953611d11dda32ea09d78n,
	0x078295e5a22b84e982cf601eb639597b8b0515a88cb5ac7fa8a4aabe3c87349dn,
	0x2fa5e5f18f6027a6501bec864564472a616b2e274a41211a444cbe3a99f3cc61n,
	0x0e884376d0d8fd21ecb780389e941f66e45e7acce3e228ab3e2156a614fcd747n,
	0x1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2n,
] as const;

type PoseidonLike = Awaited<ReturnType<typeof buildPoseidon>>;

type PoseidonBuilder = {
	F: PoseidonLike["F"];
	hash2(values: [bigint, bigint]): bigint;
	hash3(values: [bigint, bigint, bigint]): bigint;
};

export type PrivateNotePayload = {
	chainId: bigint;
	commitment: HexString;
	createdAt: string;
	denominationPlanck: bigint;
	nullifier: HexString;
	nullifierHash: HexString;
	poolAddress: Address;
	scope: HexString;
	secret: HexString;
	v: typeof PRIVATE_POOL_NOTE_VERSION;
};

export type PrivateDeliveryPayload = {
	memoText: string | null;
	note: PrivateNotePayload;
	v: 1;
};

export type EncryptedNoteBackup = {
	algorithm: "XChaCha20-Poly1305";
	ciphertext: HexString;
	createdAt: string;
	denominationPlanck: string;
	nonce: HexString;
	kdf: {
		iterations: number;
		name: "PBKDF2-SHA256";
		salt: HexString;
	};
	poolAddress: Address;
	v: typeof PRIVATE_POOL_BACKUP_VERSION;
};

export type PoolDepositRecord = {
	blockNumber: bigint;
	commitment: HexString;
	leafIndex: number;
	root: HexString;
};

export type MerkleProof = {
	commitment: HexString;
	leafIndex: number;
	pathElements: bigint[];
	pathIndices: number[];
	root: HexString;
};

let poseidonBuilderPromise: Promise<PoseidonBuilder> | undefined;

export function fieldToHex(value: bigint): HexString {
	return `0x${value.toString(16).padStart(64, "0")}`;
}

export function hexToField(value: string): bigint {
	if (typeof value !== "string" || !/^0x[a-fA-F0-9]{1,64}$/.test(value)) {
		throw new Error("Field element must be a valid hex string.");
	}
	const parsed = BigInt(value);
	if (parsed < 0n || parsed >= SNARK_SCALAR_FIELD) {
		throw new Error("Field element is out of range.");
	}
	return parsed;
}

export async function createPrivateNote(args: {
	chainId: bigint;
	poolAddress: Address;
	scope: bigint;
}) {
	const poseidon = await getPoseidonBuilder();
	const nullifier = randomFieldElement();
	const secret = randomFieldElement();
	const commitment = poseidon.hash3([args.scope, nullifier, secret]);
	const nullifierHash = poseidon.hash2([args.scope, nullifier]);

	return {
		note: {
			chainId: args.chainId,
			commitment: fieldToHex(commitment),
			createdAt: new Date().toISOString(),
			denominationPlanck: PRIVATE_POOL_DENOMINATION,
			nullifier: fieldToHex(nullifier),
			nullifierHash: fieldToHex(nullifierHash),
			poolAddress: args.poolAddress,
			scope: fieldToHex(args.scope),
			secret: fieldToHex(secret),
			v: PRIVATE_POOL_NOTE_VERSION,
		} satisfies PrivateNotePayload,
	};
}

export function encodePrivateNotePayload(note: PrivateNotePayload) {
	return new TextEncoder().encode(
		JSON.stringify({
			...note,
			chainId: note.chainId.toString(),
			denominationPlanck: note.denominationPlanck.toString(),
		}),
	);
}

export function encodePrivateDeliveryPayload(payload: PrivateDeliveryPayload) {
	return new TextEncoder().encode(
		JSON.stringify({
			memoText: payload.memoText,
			note: JSON.parse(new TextDecoder().decode(encodePrivateNotePayload(payload.note))),
			v: 1,
		}),
	);
}

export function decodePrivateNotePayload(bytes: Uint8Array): PrivateNotePayload {
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new Error("Private note payload is not valid JSON.");
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error("Private note payload is missing.");
	}

	const record = parsed as Record<string, unknown>;
	if (record.v !== PRIVATE_POOL_NOTE_VERSION) {
		throw new Error(`Unsupported private note version: ${String(record.v)}`);
	}
	if (
		typeof record.poolAddress !== "string" ||
		typeof record.commitment !== "string" ||
		typeof record.nullifier !== "string" ||
		typeof record.nullifierHash !== "string" ||
		typeof record.secret !== "string" ||
		typeof record.scope !== "string" ||
		typeof record.chainId !== "string" ||
		typeof record.denominationPlanck !== "string" ||
		typeof record.createdAt !== "string"
	) {
		throw new Error("Private note payload is missing required fields.");
	}

	return {
		chainId: BigInt(record.chainId),
		commitment: normalizeBytes32(record.commitment),
		createdAt: record.createdAt,
		denominationPlanck: BigInt(record.denominationPlanck),
		nullifier: normalizeBytes32(record.nullifier),
		nullifierHash: normalizeBytes32(record.nullifierHash),
		poolAddress: record.poolAddress as Address,
		scope: normalizeBytes32(record.scope),
		secret: normalizeBytes32(record.secret),
		v: PRIVATE_POOL_NOTE_VERSION,
	};
}

export function decodePrivateDeliveryPayload(bytes: Uint8Array): PrivateDeliveryPayload {
	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new Error("Private delivery payload is not valid JSON.");
	}

	if (
		!parsed ||
		typeof parsed !== "object" ||
		!("note" in parsed) ||
		!("memoText" in parsed) ||
		!("v" in parsed)
	) {
		throw new Error("Private delivery payload is missing required fields.");
	}

	const record = parsed as Record<string, unknown>;
	if (record.v !== 1) {
		throw new Error(`Unsupported private delivery payload version: ${String(record.v)}`);
	}
	if (record.memoText !== null && typeof record.memoText !== "string") {
		throw new Error("Private delivery memoText must be a string or null.");
	}

	return {
		memoText: record.memoText as string | null,
		note: decodePrivateNotePayload(
			new TextEncoder().encode(JSON.stringify(record.note ?? null)),
		),
		v: 1,
	};
}

export async function computePoolContext(args: {
	chainId: bigint;
	expiry: bigint;
	fee: bigint;
	poolAddress: Address;
	recipient: Address;
	relayer: Address;
}) {
	return (
		BigInt(
			keccak256(
				encodeAbiParameters(
					[
						{ type: "uint256" },
						{ type: "address" },
						{ type: "address" },
						{ type: "address" },
						{ type: "uint256" },
						{ type: "uint256" },
						{ type: "uint256" },
					],
					[
						args.chainId,
						args.poolAddress,
						args.recipient,
						args.relayer,
						args.fee,
						args.expiry,
						PRIVATE_POOL_DENOMINATION,
					],
				),
			),
		) % SNARK_SCALAR_FIELD
	);
}

export async function computeMerkleProofForDeposit(
	deposits: PoolDepositRecord[],
	commitmentHex: HexString,
): Promise<MerkleProof> {
	if (!isBytes32Hex(commitmentHex)) {
		throw new Error("Private note commitment is malformed.");
	}
	for (const deposit of deposits) {
		if (!isValidPoolDepositRecord(deposit)) {
			throw new Error(
				"Pool deposit scan returned malformed data. Refresh the claim page and rescan.",
			);
		}
	}

	const sorted = [...deposits].sort((a, b) => a.leafIndex - b.leafIndex);
	const matchedRecord = sorted.find(
		(record) => record.commitment.toLowerCase() === commitmentHex.toLowerCase(),
	);

	if (!matchedRecord) {
		throw new Error("Matching pool deposit was not found for this private note.");
	}

	if (matchedRecord.leafIndex >= 1 << PRIVATE_POOL_TREE_DEPTH) {
		throw new Error("The matched pool deposit is outside the supported tree depth.");
	}

	const knownLeafIndexes = new Set(sorted.map((record) => record.leafIndex));
	for (let index = 0; index <= matchedRecord.leafIndex; index += 1) {
		if (!knownLeafIndexes.has(index)) {
			throw new Error(
				"Pool deposit history is incomplete for this note. Increase the scan range so the app can reconstruct the full Merkle path.",
			);
		}
	}

	const poseidon = await getPoseidonBuilder();
	const leafValues = Array.from({ length: 1 << PRIVATE_POOL_TREE_DEPTH }, () => zeroValues[0]);
	sorted.forEach((record) => {
		leafValues[record.leafIndex] = hexToField(record.commitment);
	});

	const pathElements: bigint[] = [];
	const pathIndices: number[] = [];
	let currentIndex = matchedRecord.leafIndex;
	let levelNodes = leafValues;

	for (let level = 0; level < PRIVATE_POOL_TREE_DEPTH; level++) {
		const isRight = currentIndex % 2 === 1;
		const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
		pathIndices.push(isRight ? 1 : 0);
		pathElements.push(levelNodes[siblingIndex] ?? zeroValues[level]);

		const nextLevel: bigint[] = [];
		for (let i = 0; i < levelNodes.length; i += 2) {
			nextLevel.push(
				poseidon.hash2([
					levelNodes[i] ?? zeroValues[level],
					levelNodes[i + 1] ?? zeroValues[level],
				]),
			);
		}
		levelNodes = nextLevel;
		currentIndex = Math.floor(currentIndex / 2);
	}

	return {
		commitment: commitmentHex,
		leafIndex: matchedRecord.leafIndex,
		pathElements,
		pathIndices,
		root: fieldToHex(levelNodes[0] ?? zeroValues[PRIVATE_POOL_TREE_DEPTH]),
	};
}

function isValidPoolDepositRecord(value: PoolDepositRecord) {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof value.blockNumber === "bigint" &&
		isBytes32Hex(value.commitment) &&
		Number.isInteger(value.leafIndex) &&
		value.leafIndex >= 0 &&
		Number.isSafeInteger(value.leafIndex) &&
		isBytes32Hex(value.root)
	);
}

function isBytes32Hex(value: unknown): value is HexString {
	return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

export async function exportEncryptedNoteBackup(
	note: PrivateNotePayload,
	password: string,
): Promise<EncryptedNoteBackup> {
	const trimmedPassword = password.trim();
	if (trimmedPassword.length < 8) {
		throw new Error("Backup password must be at least 8 characters.");
	}

	const salt = randomBytes(16);
	const nonce = randomBytes(24);
	const key = await deriveBackupKey(trimmedPassword, salt);
	const plaintext = encodePrivateNotePayload(note);
	const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);

	return {
		algorithm: "XChaCha20-Poly1305",
		ciphertext: `0x${bytesToHex(ciphertext)}`,
		createdAt: new Date().toISOString(),
		denominationPlanck: note.denominationPlanck.toString(),
		nonce: `0x${bytesToHex(nonce)}`,
		kdf: {
			iterations: 150_000,
			name: "PBKDF2-SHA256",
			salt: `0x${bytesToHex(salt)}`,
		},
		poolAddress: note.poolAddress,
		v: PRIVATE_POOL_BACKUP_VERSION,
	};
}

export async function importEncryptedNoteBackup(
	backup: EncryptedNoteBackup,
	password: string,
): Promise<PrivateNotePayload> {
	if (backup.v !== PRIVATE_POOL_BACKUP_VERSION) {
		throw new Error(`Unsupported note backup version: ${backup.v}`);
	}

	const key = await deriveBackupKey(password.trim(), hexToBytes(backup.kdf.salt));
	const plaintext = xchacha20poly1305(key, hexToBytes(backup.nonce)).decrypt(
		hexToBytes(backup.ciphertext),
	);

	return decodePrivateNotePayload(plaintext);
}

export function serializeEncryptedNoteBackup(backup: EncryptedNoteBackup) {
	return JSON.stringify(backup, null, 2);
}

export function parseEncryptedNoteBackup(json: string) {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		throw new Error("Encrypted note backup is not valid JSON.");
	}

	if (!parsed || typeof parsed !== "object") {
		throw new Error("Encrypted note backup is missing.");
	}

	const backup = parsed as Partial<EncryptedNoteBackup>;
	if (
		backup.v !== PRIVATE_POOL_BACKUP_VERSION ||
		backup.algorithm !== "XChaCha20-Poly1305" ||
		!backup.kdf ||
		backup.kdf.name !== "PBKDF2-SHA256" ||
		typeof backup.ciphertext !== "string" ||
		typeof backup.nonce !== "string" ||
		typeof backup.poolAddress !== "string" ||
		typeof backup.createdAt !== "string" ||
		typeof backup.denominationPlanck !== "string" ||
		typeof backup.kdf.salt !== "string" ||
		typeof backup.kdf.iterations !== "number"
	) {
		throw new Error("Encrypted note backup is missing required fields.");
	}

	return {
		algorithm: "XChaCha20-Poly1305",
		ciphertext: normalizeBytes32OrLong(backup.ciphertext),
		createdAt: backup.createdAt,
		denominationPlanck: backup.denominationPlanck,
		nonce: normalizeHex(backup.nonce),
		kdf: {
			iterations: backup.kdf.iterations,
			name: "PBKDF2-SHA256",
			salt: normalizeHex(backup.kdf.salt),
		},
		poolAddress: backup.poolAddress as Address,
		v: PRIVATE_POOL_BACKUP_VERSION,
	} satisfies EncryptedNoteBackup;
}

async function deriveBackupKey(password: string, salt: Uint8Array) {
	return pbkdf2Async(sha256, new TextEncoder().encode(password), salt, {
		c: 150_000,
		dkLen: 32,
	});
}

async function getPoseidonBuilder(): Promise<PoseidonBuilder> {
	if (!poseidonBuilderPromise) {
		poseidonBuilderPromise = buildPoseidon().then((poseidonModule: unknown) => {
			const poseidon = poseidonModule as {
				F: { toString(value: unknown): string };
				(values: unknown[]): unknown;
			};

			return {
				F: poseidon.F,
				hash2(values: [bigint, bigint]) {
					return BigInt(poseidon.F.toString(poseidon(values)));
				},
				hash3(values: [bigint, bigint, bigint]) {
					return BigInt(poseidon.F.toString(poseidon(values)));
				},
			};
		});
	}

	if (!poseidonBuilderPromise) {
		throw new Error("Poseidon builder was not initialized.");
	}

	return poseidonBuilderPromise;
}

function normalizeBytes32(value: string): HexString {
	const normalized = normalizeHex(value);
	if (hexToBytes(normalized).length !== 32) {
		throw new Error("Expected a 32-byte hex value.");
	}
	return normalized;
}

function normalizeBytes32OrLong(value: string): HexString {
	return normalizeHex(value);
}

function normalizeHex(value: string): HexString {
	return (value.startsWith("0x") ? value : `0x${value}`) as HexString;
}

function hexToBytes(value: string) {
	const normalized = value.startsWith("0x") ? value.slice(2) : value;
	if (normalized.length % 2 !== 0) {
		throw new Error("Hex string must have an even length.");
	}
	const out = new Uint8Array(normalized.length / 2);
	for (let i = 0; i < normalized.length; i += 2) {
		out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
	}
	return out;
}

function randomBytes(length: number) {
	const out = new Uint8Array(length);
	crypto.getRandomValues(out);
	return out;
}

function randomFieldElement() {
	const random = randomBytes(31);
	let value = 0n;
	for (const byte of random) {
		value = (value << 8n) | BigInt(byte);
	}
	return (value % (SNARK_SCALAR_FIELD - 1n)) + 1n;
}
