import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import {
	disabledEmbeddedWallet,
	EmbeddedWalletContext,
} from "./EmbeddedWalletContext";
import { isPolkadotHostEnvironment } from "../utils/hostEnvironment";

const PrivyEmbeddedWalletProvider = lazy(() =>
	import("./EmbeddedWalletProvider").then((module) => ({
		default: module.EmbeddedWalletProvider,
	})),
);

export function LazyEmbeddedWalletProvider({ children }: { children: ReactNode }) {
	const shouldLoadPrivy = useShouldLoadPrivyProvider();

	if (!shouldLoadPrivy) {
		return (
			<EmbeddedWalletContext.Provider value={disabledEmbeddedWallet}>
				{children}
			</EmbeddedWalletContext.Provider>
		);
	}

	return (
		<Suspense
			fallback={
				<EmbeddedWalletContext.Provider value={disabledEmbeddedWallet}>
					{children}
				</EmbeddedWalletContext.Provider>
			}
		>
			<PrivyEmbeddedWalletProvider>{children}</PrivyEmbeddedWalletProvider>
		</Suspense>
	);
}

function useShouldLoadPrivyProvider() {
	const [hash, setHash] = useState(() =>
		typeof window === "undefined" ? "" : window.location.hash,
	);

	useEffect(() => {
		function handleHashChange() {
			setHash(window.location.hash);
		}

		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	if (!import.meta.env.VITE_PRIVY_APP_ID) {
		return false;
	}

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
