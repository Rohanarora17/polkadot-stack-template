import type { Address } from "viem";

import type { HexString } from "../crypto/stealth";

export type RelayerQuote = {
	chainId: bigint;
	expiry: bigint;
	fee: bigint;
	poolAddress: Address;
	quoteId: string;
	relayerAddress: Address;
};

export type RelayerSubmitResult = {
	blockNumber: bigint;
	ok: true;
	transactionHash: HexString;
};

export function getRelayerUrl() {
	return getUsableRelayerUrl() ?? "not configured";
}

export function requireRelayerUrl() {
	const relayerUrl = getUsableRelayerUrl();
	if (!relayerUrl) {
		throw new Error(
			"Public StealthPay relayer is not configured for this hosted app. Set VITE_RELAYER_URL to an HTTPS relayer URL before deploying to Dot.li.",
		);
	}
	return relayerUrl;
}

function getUsableRelayerUrl() {
	const configured = import.meta.env.VITE_RELAYER_URL || "";
	if (configured && (!isLoopbackUrl(configured) || isLocalBrowserHost())) {
		return configured.replace(/\/+$/, "");
	}

	if (isLocalBrowserHost()) {
		return "http://127.0.0.1:8787";
	}

	return null;
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

export async function requestRelayerQuote(args: { ethRpcUrl: string; poolAddress: Address }) {
	const response = await fetchRelayer("/quote", {
		body: JSON.stringify(args),
		headers: {
			"content-type": "application/json",
		},
		method: "POST",
	});
	const payload = await readRelayerJson(response);
	if (!response.ok) {
		throw new Error(payload.error || `Relayer quote failed with status ${response.status}`);
	}
	assertRelayerQuotePayload(payload);

	return {
		chainId: BigInt(payload.chainId),
		expiry: BigInt(payload.expiry),
		fee: BigInt(payload.fee),
		poolAddress: payload.poolAddress,
		quoteId: payload.quoteId,
		relayerAddress: payload.relayerAddress,
	} satisfies RelayerQuote;
}

export async function submitRelayedPrivateWithdraw(args: {
	ethRpcUrl: string;
	expiry: bigint;
	fee: bigint;
	notice?: Record<string, unknown>;
	pA: [string, string];
	pB: [[string, string], [string, string]];
	pC: [string, string];
	poolAddress: Address;
	quoteId: string;
	recipient: Address;
	root: HexString;
	nullifierHash: HexString;
}) {
	const response = await fetchRelayer("/submit", {
		body: JSON.stringify({
			ethRpcUrl: args.ethRpcUrl,
			expiry: args.expiry.toString(),
			fee: args.fee.toString(),
			nullifierHash: args.nullifierHash,
			pA: args.pA,
			pB: args.pB,
			pC: args.pC,
			poolAddress: args.poolAddress,
			quoteId: args.quoteId,
			recipient: args.recipient,
			root: args.root,
		}),
		headers: {
			"content-type": "application/json",
		},
		method: "POST",
	});
	const payload = await readRelayerJson(response);
	if (!response.ok) {
		throw new Error(payload.error || `Relayer submit failed with status ${response.status}`);
	}
	assertRelayerSubmitPayload(payload);

	return {
		blockNumber: BigInt(payload.blockNumber),
		ok: true,
		transactionHash: payload.transactionHash,
	} satisfies RelayerSubmitResult;
}

async function fetchRelayer(path: "/quote" | "/submit", init: RequestInit) {
	const relayerUrl = requireRelayerUrl();
	try {
		return await fetch(`${relayerUrl}${path}`, init);
	} catch (cause) {
		throw new Error(
			`Private relayer is not reachable at ${relayerUrl}. Start the relayer and try again. ${formatRelayerCause(cause)}`,
		);
	}
}

async function readRelayerJson(response: Response) {
	try {
		return (await response.json()) as { error?: string } & Record<string, unknown>;
	} catch (cause) {
		throw new Error(
			`Relayer returned a non-JSON response with status ${response.status}. ${formatRelayerCause(cause)}`,
		);
	}
}

function formatRelayerCause(cause: unknown) {
	const message = cause instanceof Error ? cause.message : String(cause);
	return message ? `Underlying error: ${message}` : "";
}

function assertRelayerQuotePayload(payload: unknown): asserts payload is {
	chainId: string | number | bigint;
	expiry: string | number | bigint;
	fee: string | number | bigint;
	poolAddress: Address;
	quoteId: string;
	relayerAddress: Address;
} {
	if (!payload || typeof payload !== "object") {
		throw new Error("Relayer quote returned an invalid response.");
	}
	const record = payload as Record<string, unknown>;
	for (const key of ["chainId", "expiry", "fee", "poolAddress", "quoteId", "relayerAddress"]) {
		if (record[key] === undefined || record[key] === null) {
			throw new Error(`Relayer quote response is missing ${key}.`);
		}
	}
}

function assertRelayerSubmitPayload(payload: unknown): asserts payload is {
	blockNumber: string | number | bigint;
	transactionHash: HexString;
} {
	if (!payload || typeof payload !== "object") {
		throw new Error("Relayer submit returned an invalid response.");
	}
	const record = payload as Record<string, unknown>;
	if (record.blockNumber === undefined || record.blockNumber === null) {
		throw new Error("Relayer submit response is missing blockNumber.");
	}
	if (typeof record.transactionHash !== "string") {
		throw new Error("Relayer submit response is missing transactionHash.");
	}
}
