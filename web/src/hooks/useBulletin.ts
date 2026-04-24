import {
	createClient,
	type PolkadotClient,
	type PolkadotSigner,
	Binary,
	Enum,
	AccountId,
} from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws-provider/web";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { createPapiProvider } from "@novasamatech/product-sdk";
import { bulletin } from "@polkadot-api/descriptors";
import { hexHashToCid, ipfsUrl } from "../utils/cid";
import { hashBytes } from "../utils/hash";
import { getRelayerUrl, requireRelayerUrl } from "../utils/privateRelayer";
import { isPolkadotHostEnvironment } from "../utils/hostEnvironment";

const BULLETIN_WS = "wss://paseo-bulletin-rpc.polkadot.io";
const BULLETIN_GENESIS_HASH =
	"0x744960c32e3a3df5440e1ecd4d34096f1ce2230d7016a5ada8a765d5a622b4ea";
const BULLETIN_SS58_PREFIX = 0;
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MiB
const UPLOAD_TIMEOUT_MS = 60_000;
const AUTHORIZATION_CHECK_TIMEOUT_MS = 8_000;
const BULLETIN_UPLOAD_TIMEOUT_HELP =
	"Bulletin upload timed out while waiting for the P-wallet signed transaction to land. If Dot.li stays on Signing, cancel the modal, reset the P-wallet account/passkey, reconnect, and retry. This matches the known post-reset P-wallet/Bulletin issue on Paseo.";

let bulletinClient: PolkadotClient | null = null;

function getBulletinClient(): PolkadotClient {
	if (!bulletinClient) {
		bulletinClient = isPolkadotHostEnvironment()
			? createClient(createPapiProvider(BULLETIN_GENESIS_HASH))
			: createClient(withPolkadotSdkCompat(getWsProvider(BULLETIN_WS)));
	}
	return bulletinClient;
}

function getBulletinApi() {
	return getBulletinClient().getTypedApi(bulletin);
}

export type BulletinBlobRef = {
	cid: string;
	memoHash: `0x${string}`;
	sizeBytes: number;
};

type PublishBulletinOptions = {
	onStatus?: (status: string) => void;
};

export function buildBulletinBlobRef(bytes: Uint8Array): BulletinBlobRef {
	const memoHash = hashBytes(bytes);
	return {
		cid: hexHashToCid(memoHash),
		memoHash,
		sizeBytes: bytes.length,
	};
}

/**
 * Check if an account is authorized to store data on the Bulletin Chain.
 */
export async function checkBulletinAuthorization(
	address: string,
	dataSize: number,
): Promise<boolean> {
	try {
		const api = getBulletinApi();
		const auth = await withTimeout(
			api.query.TransactionStorage.Authorizations.getValue(Enum("Account", address)),
			AUTHORIZATION_CHECK_TIMEOUT_MS,
			"Bulletin authorization lookup timed out.",
		);
		if (!auth) return false;
		return auth.extent.transactions > 0n && auth.extent.bytes >= BigInt(dataSize);
	} catch {
		return false;
	}
}

/**
 * Upload file bytes to the Bulletin Chain via TransactionStorage.store().
 * Wraps the Observable-based signSubmitAndWatch in a Promise.
 */
export async function uploadToBulletin(
	fileBytes: Uint8Array,
	signer: PolkadotSigner,
): Promise<BulletinBlobRef> {
	if (fileBytes.length > MAX_FILE_SIZE) {
		throw new Error(
			`File too large (${(fileBytes.length / 1024 / 1024).toFixed(1)} MiB). Maximum is 8 MiB.`,
		);
	}

	const api = getBulletinApi();
	const tx = api.tx.TransactionStorage.store({
		data: Binary.fromBytes(fileBytes),
	});
	const blobRef = buildBulletinBlobRef(fileBytes);

	return new Promise<BulletinBlobRef>((resolve, reject) => {
		const timeout = setTimeout(() => {
			subscription.unsubscribe();
			reject(new Error(BULLETIN_UPLOAD_TIMEOUT_HELP));
		}, UPLOAD_TIMEOUT_MS);

		console.info("[StealthPay][Bulletin] submitting encrypted payload", {
			cid: blobRef.cid,
			memoHash: blobRef.memoHash,
			sizeBytes: blobRef.sizeBytes,
		});

		const subscription = tx.signSubmitAndWatch(signer).subscribe({
			next: (ev) => {
				if (ev.type === "txBestBlocksState" && ev.found) {
					clearTimeout(timeout);
					subscription.unsubscribe();
					console.info("[StealthPay][Bulletin] encrypted payload stored", {
						cid: blobRef.cid,
						memoHash: blobRef.memoHash,
					});
					resolve(blobRef);
				}
			},
			error: (err) => {
				clearTimeout(timeout);
				subscription.unsubscribe();
				reject(err);
			},
		});
	});
}

export async function publishEncryptedPayloadToBulletin(
	fileBytes: Uint8Array,
	args: {
		originAddress: string;
		signer: PolkadotSigner;
	} & PublishBulletinOptions,
): Promise<BulletinBlobRef> {
	const blobRef = buildBulletinBlobRef(fileBytes);
	const bulletinAddress =
		getBulletinAddressForSigner(args.signer) ?? getBulletinAddressForAccount(args.originAddress);
	args.onStatus?.("Checking Bulletin storage authorization...");
	const authorized = await checkBulletinAuthorization(bulletinAddress, fileBytes.length);
	if (authorized) {
		args.onStatus?.("Requesting P-wallet signature for encrypted Bulletin storage...");
		return uploadToBulletin(fileBytes, args.signer);
	}

	if (isPolkadotHostEnvironment()) {
		args.onStatus?.(
			"Bulletin authorization was not confirmed through Dot.li. Using StealthPay storage sponsor instead of opening a P-wallet Bulletin signature.",
		);
	} else {
		try {
			args.onStatus?.("Requesting wallet signature for encrypted Bulletin storage...");
			return await uploadToBulletin(fileBytes, args.signer);
		} catch (cause) {
			console.warn("[StealthPay][Bulletin] direct upload failed", cause);
		}
	}

	try {
		args.onStatus?.("Using StealthPay storage sponsor for encrypted Bulletin payload...");
		const relayedBlobRef = await uploadToBulletinRelay(fileBytes);
		if (relayedBlobRef.memoHash.toLowerCase() !== blobRef.memoHash.toLowerCase()) {
			throw new Error(
				"Bulletin relay returned a memo hash that does not match the encrypted payload.",
			);
		}
		if (relayedBlobRef.cid !== blobRef.cid) {
			throw new Error(
				"Bulletin relay returned a CID that does not match the encrypted payload.",
			);
		}
		return blobRef;
	} catch (cause) {
		const relayError = cause instanceof Error ? cause : new Error(String(cause));
		if (isPolkadotHostEnvironment()) {
			const relayerUrl = getRelayerUrl();
			if (relayerUrl === "not configured") {
				throw new Error(
					`This P-wallet is not authorized for Bulletin storage, and no public StealthPay storage sponsor is configured for this hosted app. Set VITE_RELAYER_URL to an HTTPS relayer URL with BULLETIN_SIGNER_MNEMONIC before deploying to Dot.li. ${formatRelayError(relayError)}`,
				);
			}
			throw new Error(
				`This P-wallet is not authorized for Bulletin storage, and the StealthPay storage sponsor at ${relayerUrl} could not complete the upload. Authorize this P-wallet for Bulletin or configure the sponsor with BULLETIN_SIGNER_MNEMONIC. ${formatRelayError(relayError)}`,
			);
		}
		throw new Error(
			`App-managed Bulletin upload is not available and ${args.originAddress} is not authorized for direct Bulletin storage. ${formatRelayError(relayError)}`,
		);
	}
}

function getBulletinAddressForSigner(signer: PolkadotSigner) {
	const publicKey = (signer as { publicKey?: Uint8Array }).publicKey;
	if (!publicKey) {
		return null;
	}
	return AccountId(BULLETIN_SS58_PREFIX).dec(publicKey);
}

function getBulletinAddressForAccount(address: string) {
	try {
		return AccountId(BULLETIN_SS58_PREFIX).dec(AccountId().enc(address));
	} catch {
		return address;
	}
}

async function uploadToBulletinRelay(fileBytes: Uint8Array): Promise<BulletinBlobRef> {
	const relayerUrl = requireRelayerUrl();
	const response = await fetch(`${relayerUrl}/bulletin/upload`, {
		body: JSON.stringify({
			payloadHex: bytesToHex(fileBytes),
		}),
		headers: {
			"content-type": "application/json",
		},
		method: "POST",
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(
			typeof payload.error === "string"
				? payload.error
				: `Bulletin relay upload failed with status ${response.status}`,
		);
	}
	if (
		typeof payload.memoHash !== "string" ||
		!/^0x[0-9a-fA-F]{64}$/.test(payload.memoHash) ||
		typeof payload.cid !== "string"
	) {
		throw new Error("Bulletin relay upload returned an invalid hash response.");
	}
	return {
		cid: payload.cid,
		memoHash: payload.memoHash,
		sizeBytes: fileBytes.length,
	};
}

export async function fetchFromBulletinByHash(
	memoHash: `0x${string}`,
): Promise<{ bytes: Uint8Array; cid: string }> {
	const cid = hexHashToCid(memoHash);
	const response = await fetch(ipfsUrl(cid));
	if (!response.ok) {
		throw new Error(`Bulletin fetch failed with status ${response.status}`);
	}
	return {
		bytes: new Uint8Array(await response.arrayBuffer()),
		cid,
	};
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
	return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function formatRelayError(error: Error) {
	if (error.message === "Failed to fetch") {
		return `Start the relayer with an authorized Bulletin signer or deploy it publicly, then set VITE_RELAYER_URL.`;
	}
	return error.message;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeout = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
		promise.then(
			(value) => {
				globalThis.clearTimeout(timeout);
				resolve(value);
			},
			(error) => {
				globalThis.clearTimeout(timeout);
				reject(error);
			},
		);
	});
}
