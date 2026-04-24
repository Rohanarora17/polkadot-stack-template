import { useEffect, useMemo, useState } from "react";

import { useEmbeddedWalletProvider } from "../wallet/EmbeddedWalletContext";
import { useHostWallet } from "./useHostWallet";
import {
	clearWalletPreference,
	readWalletPreference,
	shortWalletAddress,
	type WalletPreference,
} from "../utils/walletPreference";

export type StealthPayAccount = {
	connected: boolean;
	claimWalletAddress: `0x${string}` | null;
	displayLabel: string;
	fundingWallet: WalletPreference | null;
	hasClaimWallet: boolean;
	hasFundingWallet: boolean;
	primaryAddress: string | null;
	signIn: () => Promise<void>;
	signOut: () => Promise<void>;
	statusLabel: string;
};

export function useStealthPayAccount(): StealthPayAccount {
	const embeddedWallet = useEmbeddedWalletProvider();
	const hostWallet = useHostWallet();
	const [fundingWallet, setFundingWallet] = useState(() => readWalletPreference());

	useEffect(() => {
		function refreshWalletPreference() {
			setFundingWallet(readWalletPreference());
		}
		window.addEventListener("storage", refreshWalletPreference);
		window.addEventListener("stealthpay-wallet-preference", refreshWalletPreference);
		return () => {
			window.removeEventListener("storage", refreshWalletPreference);
			window.removeEventListener("stealthpay-wallet-preference", refreshWalletPreference);
		};
	}, []);

	return useMemo(() => {
		const hasClaimWallet = Boolean(embeddedWallet.address);
		const hasHostWallet = Boolean(hostWallet.account);
		const hasFundingWallet = hasHostWallet || Boolean(fundingWallet);
		const primaryAddress =
			embeddedWallet.address ?? hostWallet.account?.address ?? fundingWallet?.accountAddress ?? null;
		const displayLabel = hasClaimWallet
			? `Social wallet ${shortWalletAddress(embeddedWallet.address)}`
			: hostWallet.account
				? `P-wallet ${shortWalletAddress(hostWallet.account.address)}`
			: fundingWallet
				? `${fundingWallet.accountName ?? fundingWallet.walletName} ${shortWalletAddress(
						fundingWallet.accountAddress,
					)}`
				: "Sign in or connect";
		const statusLabel = hasClaimWallet
			? "Signed in"
			: hasHostWallet
				? "P-wallet connected"
			: hasFundingWallet
				? "Wallet connected"
				: hostWallet.available
					? "Connect in top bar"
				: "No account";

		return {
			claimWalletAddress: embeddedWallet.address,
			connected: hasClaimWallet || hasFundingWallet,
			displayLabel,
			fundingWallet: hostWallet.account
				? {
						accountAddress: hostWallet.account.address,
						accountName: hostWallet.account.name ?? "P-wallet",
						walletName: "spektr",
					}
				: fundingWallet,
			hasClaimWallet,
			hasFundingWallet,
			primaryAddress,
			signIn: embeddedWallet.login,
			signOut: async () => {
				clearWalletPreference();
				await embeddedWallet.logout();
				setFundingWallet(null);
			},
			statusLabel,
		};
	}, [embeddedWallet, fundingWallet, hostWallet]);
}
