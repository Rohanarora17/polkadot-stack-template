import { secp256k1 } from "@noble/curves/secp256k1.js";

import {
	deriveStealthPrivateKey,
	publicKeyToAddress,
	scanAnnouncement,
	type HexString,
	type MetaAddressKeys,
} from "../crypto/stealth";

export type AnnouncementCandidate = {
	blockNumber: bigint;
	ephemeralPubKey: HexString;
	memoHash: HexString;
	nonce: bigint;
	sender: HexString;
	stealthAddress: HexString;
	transactionHash: HexString;
	viewTag: number;
};

export type MatchedAnnouncement = AnnouncementCandidate & {
	derivedAddress: HexString;
	recoveredAddress: HexString;
	sharedSecret: Uint8Array;
	stealthPrivateKey: Uint8Array;
};

export function matchAnnouncements(
	keys: MetaAddressKeys,
	announcements: AnnouncementCandidate[],
): MatchedAnnouncement[] {
	return announcements.flatMap((announcement) => {
		const scan = scanAnnouncement(
			keys.viewingPrivKey,
			keys.spendingPubKey,
			hexToBytes(announcement.ephemeralPubKey),
			announcement.viewTag,
			announcement.stealthAddress,
		);

		if (!scan.match || !scan.sharedSecret || !scan.derivedAddress) {
			return [];
		}

		const stealthPrivateKey = deriveStealthPrivateKey(keys.spendingPrivKey, scan.sharedSecret);
		const recoveredAddress = publicKeyToAddress(
			secp256k1.getPublicKey(stealthPrivateKey, false),
		);

		return [
			{
				...announcement,
				derivedAddress: scan.derivedAddress,
				recoveredAddress,
				sharedSecret: scan.sharedSecret,
				stealthPrivateKey,
			},
		];
	});
}

function hexToBytes(value: HexString) {
	const normalized = value.startsWith("0x") ? value.slice(2) : value;
	if (normalized.length % 2 !== 0) {
		throw new Error("Hex string must have an even length");
	}

	const out = new Uint8Array(normalized.length / 2);
	for (let i = 0; i < normalized.length; i += 2) {
		out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
	}
	return out;
}
