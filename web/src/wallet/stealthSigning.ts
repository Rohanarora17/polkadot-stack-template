import { enumValue } from "@novasamatech/host-api";
import {
	hostApi,
	injectSpektrExtension,
	sandboxTransport,
	SpektrExtensionName,
} from "@novasamatech/product-sdk";
import { connectInjectedExtension } from "polkadot-api/pjs-signer";
import { stringToHex } from "viem";

import { getPublicClient } from "../config/evm";
import { getKnownChainIdForEthRpcUrl, getStoredEthRpcUrl } from "../config/network";
import { getStealthDerivationMessage } from "../crypto/stealth";

type EthereumProvider = {
	request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export type StealthSigningProviderKind = "pwallet-host" | "eip1193";

export type StealthSigningResult = {
	account: string;
	accountName: string | null;
	chainId: bigint;
	message: string;
	providerKind: StealthSigningProviderKind;
	providerLabel: string;
	signature: `0x${string}`;
};

type CodecErrorLike = {
	tag?: string;
	value?: unknown;
};

type InjectedPjsExtension = {
	enable(dappName?: string): Promise<{
		signer: {
			signRaw(payload: {
				address: string;
				data: `0x${string}`;
				type: "bytes";
			}): Promise<{ id: number; signature: `0x${string}` }>;
		};
	}>;
};

function getEthereumProvider(): EthereumProvider | null {
	return window.ethereum ?? null;
}

function shouldBypassHostPermissionsForE2E() {
	return new URLSearchParams(window.location.search).get("e2e-bypass-host-permissions") === "1";
}

function asErrorMessage(prefix: string, cause: unknown) {
	if (typeof cause === "object" && cause !== null) {
		const codecError = cause as CodecErrorLike;
		if (typeof codecError.tag === "string") {
			if (
				typeof codecError.value === "object" &&
				codecError.value !== null &&
				"reason" in codecError.value &&
				typeof codecError.value.reason === "string"
			) {
				return `${prefix}: ${codecError.tag} (${codecError.value.reason})`;
			}
			return `${prefix}: ${codecError.tag}`;
		}
	}

	if (cause instanceof Error) {
		return `${prefix}: ${cause.message}`;
	}

	return `${prefix}: ${String(cause)}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	let timeoutId: number | undefined;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = window.setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeoutId !== undefined) {
			window.clearTimeout(timeoutId);
		}
	}
}

async function waitForSpektrExtension() {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (await injectSpektrExtension(sandboxTransport)) {
			return;
		}

		if (attempt < 9) {
			await new Promise((resolve) => window.setTimeout(resolve, 500));
		}
	}

	throw new Error("Spektr host wallet injection did not become available.");
}

async function getStealthChainId() {
	const ethRpcUrl = getStoredEthRpcUrl();
	const knownChainId = getKnownChainIdForEthRpcUrl(ethRpcUrl);
	if (knownChainId !== null) {
		return knownChainId;
	}

	const chainId = await getPublicClient(ethRpcUrl).getChainId();
	return BigInt(chainId);
}

async function requestHostSigningPermission() {
	const permissionResult = await hostApi.permission(
		enumValue("v1", {
			tag: "TransactionSubmit",
			value: undefined,
		}),
	);

	return permissionResult.match(
		(response) => {
			if (response.tag !== "v1") {
				throw new Error(`Unsupported host permission response version: ${response.tag}`);
			}
		},
		(error) => {
			throw new Error(asErrorMessage("Host signing permission denied", error.value));
		},
	);
}

async function signWithPwalletHost(chainId: bigint): Promise<StealthSigningResult | null> {
	if (!(await withTimeout(sandboxTransport.isReady(), 5_000, "Host transport readiness"))) {
		return null;
	}

	if (!shouldBypassHostPermissionsForE2E()) {
		await withTimeout(requestHostSigningPermission(), 5_000, "Host signing permission request");
	}
	await withTimeout(waitForSpektrExtension(), 8_000, "Spektr extension injection");

	const extension = await withTimeout(
		connectInjectedExtension(SpektrExtensionName),
		8_000,
		"Spektr extension connection",
	);
	const account = extension.getAccounts()[0];
	if (!account) {
		throw new Error("Pwallet is connected, but no host wallet account is available.");
	}

	const chainMessage = getStealthDerivationMessage(chainId);
	const injected = window.injectedWeb3?.[SpektrExtensionName] as InjectedPjsExtension | undefined;
	if (!injected) {
		throw new Error("Spektr host wallet was not injected into window.injectedWeb3.");
	}

	const enabled = await withTimeout(injected.enable("StealthPay"), 5_000, "Spektr enable");
	const rawResult = await withTimeout(
		enabled.signer.signRaw({
			address: account.address,
			data: stringToHex(chainMessage),
			type: "bytes",
		}),
		5_000,
		"Host raw signing",
	);

	return {
		account: account.address,
		accountName: account.name ?? null,
		chainId,
		message: chainMessage,
		providerKind: "pwallet-host",
		providerLabel: "Pwallet / Host API",
		signature: rawResult.signature as `0x${string}`,
	} satisfies StealthSigningResult;
}

async function signWithEip1193(chainId: bigint): Promise<StealthSigningResult | null> {
	const provider = getEthereumProvider();
	if (!provider) {
		return null;
	}

	const accounts = (await provider.request({
		method: "eth_requestAccounts",
	})) as string[];

	if (!accounts[0]) {
		throw new Error("No EIP-1193 wallet account returned.");
	}

	const message = getStealthDerivationMessage(chainId);
	const signature = (await provider.request({
		method: "personal_sign",
		params: [stringToHex(message), accounts[0]],
	})) as `0x${string}`;

	return {
		account: accounts[0],
		accountName: null,
		chainId,
		message,
		providerKind: "eip1193",
		providerLabel: "EIP-1193 Wallet",
		signature,
	};
}

export async function signStealthDerivationMessage(): Promise<StealthSigningResult> {
	const chainId = await getStealthChainId();

	try {
		const hostResult = await signWithPwalletHost(chainId);
		if (hostResult) {
			return hostResult;
		}
	} catch (cause) {
		const fallbackResult = await signWithEip1193(chainId);
		if (fallbackResult) {
			return fallbackResult;
		}
		throw cause;
	}

	const fallbackResult = await signWithEip1193(chainId);
	if (fallbackResult) {
		return fallbackResult;
	}

	throw new Error(
		"No supported wallet was found. Use Pwallet inside the host, or an EIP-1193 wallet only for standalone fallback.",
	);
}
