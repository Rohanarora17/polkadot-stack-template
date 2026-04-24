import { useEffect, useMemo, useState } from "react";
import { AccountId } from "polkadot-api";
import type { PolkadotSigner } from "polkadot-api";
import { createAccountsProvider, sandboxTransport } from "@novasamatech/product-sdk";

import { detectHostEnvironment, type HostEnvironment } from "../utils/hostEnvironment";
import { TESTNET_SS58_PREFIX } from "../config/network";

export type HostPolkadotAccount = {
	address: string;
	name?: string;
	polkadotSigner: PolkadotSigner;
	publicKey: Uint8Array;
};

export type HostWalletState = {
	account: HostPolkadotAccount | null;
	available: boolean;
	environment: HostEnvironment;
	error: string | null;
	status: "standalone" | "detecting" | "ready" | "connected" | "disconnected" | "failed";
};

export function useHostWallet(): HostWalletState {
	const [environment] = useState<HostEnvironment>(() => detectHostEnvironment());
	const [account, setAccount] = useState<HostPolkadotAccount | null>(null);
	const [status, setStatus] = useState<HostWalletState["status"]>(() =>
		detectHostEnvironment() === "standalone" ? "standalone" : "detecting",
	);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;
		const detectedEnvironment = detectHostEnvironment();

		if (detectedEnvironment === "standalone") {
			return undefined;
		}

		async function refreshHostAccount() {
			try {
				setError(null);
				const accountProvider = await getHostAccountFromProvider();
				if (cancelled) {
					return;
				}

				setAccount(accountProvider);
				setStatus(accountProvider ? "connected" : "disconnected");
			} catch (cause) {
				if (!cancelled) {
					setStatus("failed");
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}
		}

		refreshHostAccount();
		const intervalId = window.setInterval(refreshHostAccount, 3_000);

		return () => {
			cancelled = true;
			unsubscribe?.();
			window.clearInterval(intervalId);
		};
	}, []);

	return useMemo(
		() => ({
			account,
			available: environment !== "standalone",
			environment,
			error,
			status,
		}),
		[account, environment, error, status],
	);
}

async function getHostAccountFromProvider(): Promise<HostPolkadotAccount | null> {
	if (!(await sandboxTransport.isReady())) {
		return null;
	}

	const accountsProvider = createAccountsProvider(sandboxTransport);
	const codec = AccountId(TESTNET_SS58_PREFIX);
	const result = await accountsProvider.getNonProductAccounts();
	return result.match(
		(accounts) => {
			const account = accounts[0];
			if (!account) {
				return null;
			}

			return {
				address: codec.dec(account.publicKey),
				name: account.name,
				polkadotSigner: accountsProvider.getNonProductAccountSigner(
					account as unknown as Parameters<typeof accountsProvider.getNonProductAccountSigner>[0],
				),
				publicKey: account.publicKey,
			};
		},
		() => null,
	);
}
