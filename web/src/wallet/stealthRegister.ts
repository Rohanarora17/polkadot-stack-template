import { enumValue } from "@novasamatech/host-api";
import {
	hostApi,
	injectSpektrExtension,
	sandboxTransport,
	SpektrExtensionName,
} from "@novasamatech/product-sdk";
import {
	connectInjectedExtension,
	getInjectedExtensions,
	type InjectedPolkadotAccount,
} from "polkadot-api/pjs-signer";
import type { PolkadotSigner } from "polkadot-api";

import { getPublicClient } from "../config/evm";
import { getKnownChainIdForEthRpcUrl, getStoredEthRpcUrl } from "../config/network";
import { devAccounts } from "../hooks/useAccount";

type CodecErrorLike = {
	tag?: string;
	value?: unknown;
};

export type RegisterWalletMode = "pwallet-host" | "browser-extension" | "dev-account";
export type TransactionWalletMode = RegisterWalletMode;

export type TransactionWalletSession = {
	accountName: string | null;
	chainId: bigint;
	originSs58: string;
	providerKind: TransactionWalletMode;
	providerLabel: string;
	txSigner: PolkadotSigner;
};

export function listBrowserExtensions() {
	try {
		return getInjectedExtensions().filter((name) => name !== SpektrExtensionName);
	} catch {
		return [];
	}
}

export async function getBrowserExtensionAccounts(
	walletName: string,
): Promise<InjectedPolkadotAccount[]> {
	const extension = await connectInjectedExtension(walletName, "StealthPay");
	return extension.getAccounts();
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

export async function createPwalletTxSession(): Promise<TransactionWalletSession> {
	const chainId = await getStealthChainId();

	if (!(await withTimeout(sandboxTransport.isReady(), 5_000, "Host transport readiness"))) {
		throw new Error("Host transport is not ready.");
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

	return {
		accountName: account.name ?? null,
		chainId,
		originSs58: account.address,
		providerKind: "pwallet-host",
		providerLabel: "Pwallet / Host API",
		txSigner: account.polkadotSigner,
	};
}

export async function createBrowserExtensionTxSession({
	walletName,
	accountAddress,
}: {
	walletName: string;
	accountAddress?: string;
}): Promise<TransactionWalletSession> {
	if (!walletName) {
		throw new Error("Select a browser extension wallet first.");
	}

	const chainId = await getStealthChainId();
	const accounts = await getBrowserExtensionAccounts(walletName);
	const account =
		(accountAddress
			? accounts.find((candidate) => candidate.address === accountAddress)
			: undefined) ?? accounts[0];

	if (!account) {
		throw new Error(`${walletName} is connected, but no accounts were returned.`);
	}

	return {
		accountName: account.name ?? null,
		chainId,
		originSs58: account.address,
		providerKind: "browser-extension",
		providerLabel: `${walletName} Extension`,
		txSigner: account.polkadotSigner,
	};
}

export async function createDevTxSession(accountIndex: number): Promise<TransactionWalletSession> {
	const chainId = await getStealthChainId();
	const devAccount = devAccounts[accountIndex];
	if (!devAccount) {
		throw new Error(`Unknown dev account index: ${accountIndex}`);
	}

	return {
		accountName: devAccount.name,
		chainId,
		originSs58: devAccount.address,
		providerKind: "dev-account",
		providerLabel: `Local Dev Signer (${devAccount.name})`,
		txSigner: devAccount.signer,
	};
}
