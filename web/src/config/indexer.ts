export type PublicEventIndexerConfig = {
	baseUrl: string;
	kind: "blockscout";
} | null;

const TESTNET_BLOCKSCOUT_URL = "https://blockscout-testnet.polkadot.io";

export function getPublicEventIndexerConfig(
	wsUrl: string,
	ethRpcUrl?: string,
): PublicEventIndexerConfig {
	const configuredKind = import.meta.env.VITE_STEALTHPAY_INDEXER_KIND;
	const configuredUrl = import.meta.env.VITE_STEALTHPAY_INDEXER_URL;

	if (configuredKind === "none") {
		return null;
	}

	if (configuredKind === "blockscout") {
		return {
			baseUrl: normalizeBaseUrl(configuredUrl || TESTNET_BLOCKSCOUT_URL),
			kind: "blockscout",
		};
	}

	if (configuredUrl && configuredUrl.toLowerCase().includes("blockscout")) {
		return {
			baseUrl: normalizeBaseUrl(configuredUrl),
			kind: "blockscout",
		};
	}

	const networkHint = `${wsUrl} ${ethRpcUrl ?? ""}`.toLowerCase();
	if (
		networkHint.includes("asset-hub-paseo") ||
		networkHint.includes("polkadothub-rpc.com/testnet") ||
		networkHint.includes("paseo")
	) {
		return {
			baseUrl: TESTNET_BLOCKSCOUT_URL,
			kind: "blockscout",
		};
	}

	return null;
}

function normalizeBaseUrl(value: string) {
	return value.replace(/\/+$/, "");
}
