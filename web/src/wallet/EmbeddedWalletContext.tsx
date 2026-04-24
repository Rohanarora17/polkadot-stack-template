import { createContext, useContext } from "react";
import type { Address } from "viem";

export type EmbeddedNativeTransferArgs = {
	ethRpcUrl: string;
	to: Address;
	value: bigint;
};

export type EmbeddedWalletContextValue = {
	address: Address | null;
	available: boolean;
	canExportWallet: boolean;
	ensureAddress: () => Promise<Address | null>;
	exportWallet: () => Promise<void>;
	getAddress: () => Promise<Address | null>;
	getBalance: (ethRpcUrl: string) => Promise<bigint>;
	isRecoverable: boolean;
	login: () => Promise<void>;
	logout: () => Promise<void>;
	name: string;
	providerName: string;
	ready: boolean;
	recoveryLabel: string;
	sendNativeTransfer: (args: EmbeddedNativeTransferArgs) => Promise<`0x${string}`>;
};

export const disabledEmbeddedWallet: EmbeddedWalletContextValue = {
	address: null,
	available: false,
	canExportWallet: false,
	ensureAddress: async () => null,
	exportWallet: async () => {
		throw new Error("Privy embedded wallet is not configured.");
	},
	getAddress: async () => null,
	getBalance: async () => 0n,
	isRecoverable: false,
	login: async () => {
		throw new Error("Privy embedded wallet is not configured.");
	},
	logout: async () => undefined,
	name: "No StealthPay wallet",
	providerName: "Privy",
	ready: true,
	recoveryLabel: "Configure VITE_PRIVY_APP_ID to enable recoverable walletless claims.",
	sendNativeTransfer: async () => {
		throw new Error("Privy embedded wallet is not configured.");
	},
};

export const EmbeddedWalletContext =
	createContext<EmbeddedWalletContextValue>(disabledEmbeddedWallet);

export function useEmbeddedWalletProvider() {
	return useContext(EmbeddedWalletContext);
}
