import type { Address } from "viem";

import type { HexString } from "../crypto/stealth";

export type RegisteredClaimLinkPayload = {
	memoHash?: HexString | null;
	mode?: "registered";
	poolAddress: Address;
	recipientOwner: Address;
	registryAddress: Address;
	transactionHash?: HexString | null;
};

export type BearerClaimLinkPayload = {
	giftKey: HexString;
	memoHash: HexString;
	mode: "bearer";
	poolAddress: Address;
	registryAddress: Address;
	transactionHash?: HexString | null;
};

export type ClaimLinkPayload = RegisteredClaimLinkPayload | BearerClaimLinkPayload;

function buildLinkForRoute(route: "gift" | "claim", payload: ClaimLinkPayload) {
	const params = new URLSearchParams({
		pool: payload.poolAddress,
		registry: payload.registryAddress,
	});

	if (payload.mode === "bearer") {
		params.set("mode", "bearer");
		params.set("memo", payload.memoHash);
		params.set("key", payload.giftKey);
	} else {
		params.set("recipient", payload.recipientOwner);
		if (payload.memoHash) {
			params.set("memo", payload.memoHash);
		}
	}

	if (payload.transactionHash) {
		params.set("tx", payload.transactionHash);
	}

	return `${window.location.origin}${window.location.pathname}${window.location.search}#/${route}?${params.toString()}`;
}

export function buildGiftLink(payload: ClaimLinkPayload) {
	return buildLinkForRoute("gift", payload);
}

export function buildClaimRouteLink(payload: ClaimLinkPayload) {
	return buildLinkForRoute("claim", payload);
}

export function buildClaimRouteLinkFromSearch(search: string) {
	const normalized = search.startsWith("?") ? search : `?${search}`;
	return `${window.location.origin}${window.location.pathname}${window.location.search}#/claim${normalized}`;
}

export function parseClaimLinkSearch(search: string) {
	const params = new URLSearchParams(search);
	const mode = params.get("mode") === "bearer" ? "bearer" : "registered";
	const pool = params.get("pool");
	const recipient = params.get("recipient");
	const registry = params.get("registry");
	const tx = params.get("tx");
	const memo = params.get("memo");
	const key = params.get("key");

	if (mode === "bearer") {
		return {
			giftKey: isHex32(key) ? key : null,
			memoHash: isHex32(memo) ? memo : null,
			mode,
			poolAddress: isAddress(pool) ? pool : null,
			recipientOwner: null,
			registryAddress: isAddress(registry) ? registry : null,
			transactionHash: isHex32(tx) ? tx : null,
		};
	}

	return {
		giftKey: null,
		memoHash: isHex32(memo) ? memo : null,
		mode,
		poolAddress: isAddress(pool) ? pool : null,
		recipientOwner: isAddress(recipient) ? recipient : null,
		registryAddress: isAddress(registry) ? registry : null,
		transactionHash: isHex32(tx) ? tx : null,
	};
}

function isAddress(value: string | null): value is Address {
	return !!value && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHex32(value: string | null): value is HexString {
	return !!value && /^0x[a-fA-F0-9]{64}$/.test(value);
}
