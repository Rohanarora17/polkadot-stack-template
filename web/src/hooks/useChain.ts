import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { createPapiProvider } from "@novasamatech/product-sdk";

import { getDefaultWsUrl, TESTNET_ASSET_HUB_GENESIS } from "../config/network";
import { isPolkadotHostEnvironment } from "../utils/hostEnvironment";

let client: PolkadotClient | null = null;
let currentUrl: string | null = null;

export function getClient(wsUrl?: string): PolkadotClient {
	const url = wsUrl || currentUrl || getDefaultWsUrl();
	if (!client || currentUrl !== url) {
		if (client) {
			client.destroy();
		}
		client = isPolkadotHostEnvironment()
			? createClient(createPapiProvider(TESTNET_ASSET_HUB_GENESIS))
			: createClient(withPolkadotSdkCompat(getWsProvider(url)));
		currentUrl = url;
	}
	return client;
}

export function disconnectClient() {
	if (client) {
		client.destroy();
		client = null;
		currentUrl = null;
	}
}
