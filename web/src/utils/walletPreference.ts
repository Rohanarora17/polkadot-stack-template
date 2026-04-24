import type { InjectedPolkadotAccount } from "polkadot-api/pjs-signer";

export type WalletPreference = {
	accountAddress: string;
	accountName: string | null;
	walletName: string;
};

const WALLET_PREFERENCE_KEY = "stealthpay-selected-substrate-wallet-v1";

export function readWalletPreference(): WalletPreference | null {
	if (!canUseLocalStorage()) {
		return null;
	}

	try {
		const raw = localStorage.getItem(WALLET_PREFERENCE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as Partial<WalletPreference>;
		if (
			typeof parsed.walletName !== "string" ||
			typeof parsed.accountAddress !== "string"
		) {
			return null;
		}
		return {
			accountAddress: parsed.accountAddress,
			accountName: typeof parsed.accountName === "string" ? parsed.accountName : null,
			walletName: parsed.walletName,
		};
	} catch {
		return null;
	}
}

export function writeWalletPreference(args: {
	account: InjectedPolkadotAccount | null;
	walletName: string;
}) {
	if (!canUseLocalStorage() || !args.walletName || !args.account) {
		return;
	}

	const next: WalletPreference = {
		accountAddress: args.account.address,
		accountName: args.account.name ?? null,
		walletName: args.walletName,
	};
	localStorage.setItem(WALLET_PREFERENCE_KEY, JSON.stringify(next));
	window.dispatchEvent(new Event("stealthpay-wallet-preference"));
}

export function clearWalletPreference() {
	if (!canUseLocalStorage()) {
		return;
	}
	localStorage.removeItem(WALLET_PREFERENCE_KEY);
	window.dispatchEvent(new Event("stealthpay-wallet-preference"));
}

export function shortWalletAddress(value: string | null | undefined) {
	if (!value) {
		return "Not connected";
	}
	return value.length > 18 ? `${value.slice(0, 6)}...${value.slice(-6)}` : value;
}

function canUseLocalStorage() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}
