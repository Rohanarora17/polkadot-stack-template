import {
	PrivyProvider,
	getEmbeddedConnectedWallet,
	useExportWallet,
	usePrivy,
	useWallets,
} from "@privy-io/react-auth";
import { enumValue } from "@novasamatech/host-api";
import { hostApi } from "@novasamatech/product-sdk";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
	createPublicClient,
	createWalletClient,
	custom,
	defineChain,
	http,
	isAddress,
	type Address,
} from "viem";
import { isPolkadotHostEnvironment } from "../utils/hostEnvironment";
import {
	disabledEmbeddedWallet,
	EmbeddedWalletContext,
	type EmbeddedWalletContextValue,
} from "./EmbeddedWalletContext";
const PRIVY_EXTERNAL_ORIGINS = ["https://auth.privy.io", "https://api.privy.io"];

export function EmbeddedWalletProvider({ children }: { children: ReactNode }) {
	const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;
	const shouldEnablePrivy = useShouldEnablePrivyProvider();
	const hostExternalAccessReady = usePrivyHostExternalAccess(shouldEnablePrivy);

	if (!privyAppId || !shouldEnablePrivy || !hostExternalAccessReady) {
		return (
			<EmbeddedWalletContext.Provider value={disabledEmbeddedWallet}>
				{children}
			</EmbeddedWalletContext.Provider>
		);
	}

	return (
		<PrivyProvider appId={privyAppId}>
			<PrivyEmbeddedWalletBridge>{children}</PrivyEmbeddedWalletBridge>
		</PrivyProvider>
	);
}

function useShouldEnablePrivyProvider() {
	const [hash, setHash] = useState(() => window.location.hash);

	useEffect(() => {
		function handleHashChange() {
			setHash(window.location.hash);
		}

		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	if (!isPolkadotHostEnvironment()) {
		return true;
	}

	return (
		hash.startsWith("#/wallet") ||
		hash.startsWith("#/gift") ||
		hash.startsWith("#/claim") ||
		hash.startsWith("#/withdraw")
	);
}

function usePrivyHostExternalAccess(enabled: boolean) {
	const [permissionReady, setPermissionReady] = useState(false);

	useEffect(() => {
		if (!enabled || !isPolkadotHostEnvironment()) {
			return;
		}

		let cancelled = false;
		Promise.allSettled(
			PRIVY_EXTERNAL_ORIGINS.map((origin) =>
				hostApi.permission(
					enumValue("v1", {
						tag: "ExternalRequest",
						value: origin,
					}),
				),
			),
		).then(() => {
			if (!cancelled) setPermissionReady(true);
		});

		return () => {
			cancelled = true;
		};
	}, [enabled]);

	return !enabled || !isPolkadotHostEnvironment() || permissionReady;
}

function PrivyEmbeddedWalletBridge({ children }: { children: ReactNode }) {
	const value = usePrivyEmbeddedWalletValue();
	return (
		<EmbeddedWalletContext.Provider value={value}>{children}</EmbeddedWalletContext.Provider>
	);
}

function usePrivyEmbeddedWalletValue() {
	const { authenticated, createWallet, login, logout, ready } = usePrivy();
	const { exportWallet } = useExportWallet();
	const { ready: walletsReady, wallets } = useWallets();
	const embeddedWallet = getEmbeddedConnectedWallet(wallets);
	const address =
		embeddedWallet?.address && isAddress(embeddedWallet.address)
			? (embeddedWallet.address as Address)
			: null;

	return useMemo<EmbeddedWalletContextValue>(
		() => ({
			address,
			available: true,
			canExportWallet: Boolean(address),
			ensureAddress: async () => {
				if (!ready || !walletsReady) {
					throw new Error("StealthPay wallet is still loading.");
				}

				if (!authenticated) {
					login({ loginMethods: ["email", "google", "passkey"] });
					return null;
				}

				const existingWallet = getEmbeddedConnectedWallet(wallets);
				if (existingWallet?.address && isAddress(existingWallet.address)) {
					return existingWallet.address as Address;
				}

				const createdWallet = await createWallet();
				if (!createdWallet.address || !isAddress(createdWallet.address)) {
					throw new Error("Privy did not return a StealthPay wallet address.");
				}
				return createdWallet.address as Address;
			},
			exportWallet: async () => {
				const currentAddress = await getCurrentPrivyAddress({
					authenticated,
					createWallet,
					login,
					ready,
					wallets,
					walletsReady,
				});
				if (!currentAddress) {
					return;
				}
				await exportWallet({ address: currentAddress });
			},
			getAddress: async () =>
				getCurrentPrivyAddress({
					authenticated,
					createWallet,
					login,
					ready,
					wallets,
					walletsReady,
				}),
			getBalance: async (ethRpcUrl: string) => {
				const currentAddress = await getCurrentPrivyAddress({
					authenticated,
					createWallet,
					login,
					ready,
					wallets,
					walletsReady,
				});
				if (!currentAddress) {
					return 0n;
				}
				return createPublicClient({ transport: http(ethRpcUrl) }).getBalance({
					address: currentAddress,
				});
			},
			isRecoverable: true,
			login: async () => {
				login({ loginMethods: ["email", "google", "passkey"] });
			},
			logout: async () => {
				await logout();
			},
			name: "Privy embedded wallet",
			providerName: "Privy",
			ready: ready && walletsReady,
			recoveryLabel:
				"Recovered by Privy using the user's email, Google account, or passkey. StealthPay never sees the private key.",
			sendNativeTransfer: async ({ ethRpcUrl, to, value }) => {
				const wallet = getEmbeddedConnectedWallet(wallets);
				if (!wallet?.address || !isAddress(wallet.address)) {
					throw new Error("Sign in with Privy before transferring out.");
				}
				if (!isAddress(to)) {
					throw new Error("Enter a valid H160 destination address.");
				}

				const publicClient = createPublicClient({ transport: http(ethRpcUrl) });
				const chainId = await publicClient.getChainId();
				await wallet.switchChain(chainId);
				const provider = await wallet.getEthereumProvider();
				const chain = defineChain({
					id: chainId,
					name: ethRpcUrl.includes("localhost") || ethRpcUrl.includes("127.0.0.1")
						? "Local Parachain"
						: "Polkadot Hub TestNet",
					nativeCurrency: { decimals: 18, name: "Unit", symbol: "UNIT" },
					rpcUrls: { default: { http: [ethRpcUrl] } },
				});
				const walletClient = createWalletClient({
					account: wallet.address as Address,
					chain,
					transport: custom(provider),
				});
				return walletClient.sendTransaction({
					account: wallet.address as Address,
					to,
					value,
				});
			},
		}),
		[
			address,
			authenticated,
			createWallet,
			exportWallet,
			login,
			logout,
			ready,
			wallets,
			walletsReady,
		],
	);
}

async function getCurrentPrivyAddress({
	authenticated,
	createWallet,
	login,
	ready,
	wallets,
	walletsReady,
}: {
	authenticated: boolean;
	createWallet: ReturnType<typeof usePrivy>["createWallet"];
	login: ReturnType<typeof usePrivy>["login"];
	ready: boolean;
	wallets: ReturnType<typeof useWallets>["wallets"];
	walletsReady: boolean;
}) {
	if (!ready || !walletsReady) {
		throw new Error("StealthPay wallet is still loading.");
	}
	if (!authenticated) {
		login({ loginMethods: ["email", "google", "passkey"] });
		return null;
	}
	const existingWallet = getEmbeddedConnectedWallet(wallets);
	if (existingWallet?.address && isAddress(existingWallet.address)) {
		return existingWallet.address as Address;
	}
	const createdWallet = await createWallet();
	if (!createdWallet.address || !isAddress(createdWallet.address)) {
		throw new Error("Privy did not return a StealthPay wallet address.");
	}
	return createdWallet.address as Address;
}
