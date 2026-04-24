import { describe, expect, it } from "vitest";

import {
	PRIVATE_POOL_DENOMINATION,
	computeMerkleProofForDeposit,
	createPrivateNote,
	decodePrivateDeliveryPayload,
	decodePrivateNotePayload,
	encodePrivateDeliveryPayload,
	encodePrivateNotePayload,
	exportEncryptedNoteBackup,
	fieldToHex,
	importEncryptedNoteBackup,
	parseEncryptedNoteBackup,
	type PoolDepositRecord,
} from "./privatePool";

describe("private pool helpers", () => {
	it("round-trips a private note payload", async () => {
		const { note } = await createPrivateNote({
			chainId: 420420421n,
			poolAddress: "0x1111111111111111111111111111111111111111",
			scope: 987654321n,
		});

		expect(decodePrivateNotePayload(encodePrivateNotePayload(note))).toEqual(note);
	});

	it("round-trips a private delivery payload including a human memo", async () => {
		const { note } = await createPrivateNote({
			chainId: 420420421n,
			poolAddress: "0x1111111111111111111111111111111111111111",
			scope: 12345n,
		});

		const decoded = decodePrivateDeliveryPayload(
			encodePrivateDeliveryPayload({
				memoText: "hi from the sender",
				note,
				v: 1,
			}),
		);

		expect(decoded.memoText).toBe("hi from the sender");
		expect(decoded.note).toEqual(note);
	});

	it("round-trips the encrypted note backup format", async () => {
		const { note } = await createPrivateNote({
			chainId: 420420421n,
			poolAddress: "0x1111111111111111111111111111111111111111",
			scope: 4321n,
		});

		const backup = await exportEncryptedNoteBackup(note, "supersecret");
		const parsed = parseEncryptedNoteBackup(JSON.stringify(backup));
		const restored = await importEncryptedNoteBackup(parsed, "supersecret");

		expect(restored).toEqual(note);
	});

	it("reconstructs the Merkle path for a matched deposit", async () => {
		const deposits: PoolDepositRecord[] = [
			{
				blockNumber: 10n,
				commitment: fieldToHex(11n),
				leafIndex: 0,
				root: fieldToHex(0n),
			},
			{
				blockNumber: 11n,
				commitment: fieldToHex(22n),
				leafIndex: 1,
				root: fieldToHex(0n),
			},
			{
				blockNumber: 12n,
				commitment: fieldToHex(33n),
				leafIndex: 2,
				root: fieldToHex(0n),
			},
		];

		const proof = await computeMerkleProofForDeposit(deposits, fieldToHex(22n));

		expect(proof.leafIndex).toBe(1);
		expect(proof.pathElements).toHaveLength(10);
		expect(proof.pathIndices).toHaveLength(10);
		expect(proof.root.startsWith("0x")).toBe(true);
	});

	it("uses public subtree hints when one older leaf is missing from the event index", async () => {
		const completeDeposits: PoolDepositRecord[] = Array.from({ length: 7 }, (_, index) => ({
			blockNumber: BigInt(10 + index),
			commitment: fieldToHex(BigInt(100 + index)),
			leafIndex: index,
			root: fieldToHex(0n),
		}));
		const completeProof = await computeMerkleProofForDeposit(
			completeDeposits,
			fieldToHex(106n),
		);
		const partialDeposits = completeDeposits.filter((deposit) => deposit.leafIndex !== 3);

		const hintedProof = await computeMerkleProofForDeposit(
			partialDeposits,
			fieldToHex(106n),
			{
				expectedDepositCount: 7,
				subtreeHints: [{ level: 2, value: fieldToHex(completeProof.pathElements[2]) }],
			},
		);

		expect(hintedProof.leafIndex).toBe(6);
		expect(hintedProof.pathElements).toEqual(completeProof.pathElements);
		expect(hintedProof.root).toBe(completeProof.root);
	});

	it("rejects Merkle proof reconstruction when earlier leaf history is missing", async () => {
		const deposits: PoolDepositRecord[] = [
			{
				blockNumber: 20n,
				commitment: fieldToHex(44n),
				leafIndex: 3,
				root: fieldToHex(0n),
			},
			{
				blockNumber: 21n,
				commitment: fieldToHex(55n),
				leafIndex: 4,
				root: fieldToHex(0n),
			},
		];

		await expect(computeMerkleProofForDeposit(deposits, fieldToHex(55n))).rejects.toThrow(
			/Increase the scan range/,
		);
	});

	it("rejects malformed deposit scan rows before field conversion", async () => {
		const deposits = [
			{
				blockNumber: 10n,
				commitment: fieldToHex(11n),
				leafIndex: 0,
				root: fieldToHex(0n),
			},
			{
				blockNumber: 11n,
				commitment: undefined,
				leafIndex: 1,
				root: fieldToHex(0n),
			},
		] as unknown as PoolDepositRecord[];

		await expect(computeMerkleProofForDeposit(deposits, fieldToHex(11n))).rejects.toThrow(
			/Pool deposit scan returned malformed data/,
		);
	});

	it("keeps the v1 pool denomination fixed at 1 UNIT", () => {
		expect(PRIVATE_POOL_DENOMINATION).toBe(10n ** 18n);
	});
});
