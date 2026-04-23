import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";

import { deriveStealthAddress } from "../crypto/stealth";
import { matchAnnouncements, type AnnouncementCandidate } from "./stealthScan";
import { decodeRuntimeAnnouncementEvent } from "./runtimeAnnouncementScan";

function scalarToBytes(value: bigint) {
	const bytes = new Uint8Array(32);
	let remaining = value;
	for (let i = 31; i >= 0; i--) {
		bytes[i] = Number(remaining & 0xffn);
		remaining >>= 8n;
	}
	return bytes;
}

describe("stealthScan", () => {
	it("matches announcements intended for the recipient and recovers the same address", () => {
		const keys = {
			spendingPrivKey: scalarToBytes(11n),
			viewingPrivKey: scalarToBytes(29n),
			spendingPubKey: secp256k1.getPublicKey(scalarToBytes(11n), true),
			viewingPubKey: secp256k1.getPublicKey(scalarToBytes(29n), true),
		};

		const payment = deriveStealthAddress(
			{
				spendingPubKey: keys.spendingPubKey,
				viewingPubKey: keys.viewingPubKey,
			},
			scalarToBytes(7n),
		);

		const announcements: AnnouncementCandidate[] = [
			{
				blockNumber: 12n,
				ephemeralPubKey: `0x${bytesToHex(payment.ephemeralPubKey)}`,
				memoHash: `0x${"00".repeat(32)}`,
				nonce: 1n,
				sender: `0x${"11".repeat(20)}`,
				stealthAddress: payment.stealthAddress,
				transactionHash: `0x${"22".repeat(32)}`,
				viewTag: payment.viewTag,
			},
		];

		const matched = matchAnnouncements(keys, announcements);

		expect(matched).toHaveLength(1);
		expect(matched[0].derivedAddress).toBe(payment.stealthAddress);
		expect(matched[0].recoveredAddress).toBe(payment.stealthAddress);
	});

	it("rejects announcements for a different recipient", () => {
		const aliceKeys = {
			spendingPrivKey: scalarToBytes(11n),
			viewingPrivKey: scalarToBytes(29n),
			spendingPubKey: secp256k1.getPublicKey(scalarToBytes(11n), true),
			viewingPubKey: secp256k1.getPublicKey(scalarToBytes(29n), true),
		};
		const bobKeys = {
			spendingPrivKey: scalarToBytes(111n),
			viewingPrivKey: scalarToBytes(222n),
			spendingPubKey: secp256k1.getPublicKey(scalarToBytes(111n), true),
			viewingPubKey: secp256k1.getPublicKey(scalarToBytes(222n), true),
		};

		const payment = deriveStealthAddress(
			{
				spendingPubKey: aliceKeys.spendingPubKey,
				viewingPubKey: aliceKeys.viewingPubKey,
			},
			scalarToBytes(5n),
		);

		const announcements: AnnouncementCandidate[] = [
			{
				blockNumber: 99n,
				ephemeralPubKey: `0x${bytesToHex(payment.ephemeralPubKey)}`,
				memoHash: `0x${"00".repeat(32)}`,
				nonce: 3n,
				sender: `0x${"33".repeat(20)}`,
				stealthAddress: payment.stealthAddress,
				transactionHash: `0x${"44".repeat(32)}`,
				viewTag: payment.viewTag,
			},
		];

		expect(matchAnnouncements(bobKeys, announcements)).toHaveLength(0);
	});

	it("decodes a runtime ContractEmitted payload into an announcement candidate", () => {
		const payment = deriveStealthAddress(
			{
				spendingPubKey: secp256k1.getPublicKey(scalarToBytes(11n), true),
				viewingPubKey: secp256k1.getPublicKey(scalarToBytes(29n), true),
			},
			scalarToBytes(7n),
		);

		const topics = encodeEventTopics({
			abi: [
				{
					type: "event",
					name: "Announcement",
					inputs: [
						{ indexed: true, name: "schemeId", type: "uint256" },
						{ indexed: false, name: "sender", type: "address" },
						{ indexed: false, name: "stealthAddress", type: "address" },
						{ indexed: false, name: "ephemeralPubKey", type: "bytes" },
						{ indexed: false, name: "viewTag", type: "uint8" },
						{ indexed: false, name: "memoHash", type: "bytes32" },
						{ indexed: false, name: "nonce", type: "uint256" },
					],
				},
			],
			eventName: "Announcement",
			args: { schemeId: 1n },
		});

		const data = encodeAbiParameters(
			parseAbiParameters(
				"address sender,address stealthAddress,bytes ephemeralPubKey,uint8 viewTag,bytes32 memoHash,uint256 nonce",
			),
			[
				`0x${"11".repeat(20)}`,
				payment.stealthAddress,
				`0x${bytesToHex(payment.ephemeralPubKey)}`,
				payment.viewTag,
				`0x${"00".repeat(32)}`,
				9n,
			],
		);

		const candidate = decodeRuntimeAnnouncementEvent({
			blockHash: `0x${"aa".repeat(32)}`,
			blockNumber: 55n,
			contractAddress: `0x${"bb".repeat(20)}`,
			dataHex: data,
			eventIndex: 3,
			phase: { type: "ApplyExtrinsic", value: 2 },
			topicsHex: topics as Array<`0x${string}`>,
		});

		expect(candidate).not.toBeNull();
		expect(candidate?.blockNumber).toBe(55n);
		expect(candidate?.sender).toBe(`0x${"11".repeat(20)}`);
		expect(candidate?.stealthAddress.toLowerCase()).toBe(payment.stealthAddress.toLowerCase());
		expect(candidate?.ephemeralPubKey).toBe(`0x${bytesToHex(payment.ephemeralPubKey)}`);
		expect(candidate?.viewTag).toBe(payment.viewTag);
		expect(candidate?.nonce).toBe(9n);
	});
});
