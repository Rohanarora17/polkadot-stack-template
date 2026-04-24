import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getDynamicBuilder, getLookupFn } from "@polkadot-api/metadata-builders";
import { decAnyMetadata, unifyMetadata } from "@polkadot-api/substrate-bindings";
import { blake2b } from "blakejs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { CID } from "multiformats/cid";
import * as digest from "multiformats/hashes/digest";
import { bulletin } from "@polkadot-api/descriptors";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import { entropyToMiniSecret, mnemonicToEntropy, ss58Address } from "@polkadot-labs/hdkd-helpers";
import { Binary, createClient, Enum } from "polkadot-api";
import { withPolkadotSdkCompat } from "polkadot-api/polkadot-sdk-compat";
import { getPolkadotSigner } from "polkadot-api/signer";
import { getWsProvider } from "polkadot-api/ws-provider/node";
import {
	createPublicClient,
	createWalletClient,
	decodeEventLog,
	http,
	keccak256,
	parseAbi,
	stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
dotenv.config({ path: path.resolve(ROOT_DIR, ".env") });
const DEFAULT_PORT = Number(process.env.PORT || process.env.RELAYER_PORT || 8787);
const QUOTE_TTL_SECONDS = Number(process.env.RELAYER_QUOTE_TTL_SECONDS || 600);
const QUOTE_GAS_UNITS = BigInt(process.env.RELAYER_QUOTE_GAS_UNITS || "450000");
const QUOTE_PREMIUM_WEI = BigInt(process.env.RELAYER_PREMIUM_WEI || "25000000000000");
const QUOTE_BUFFER_BPS = BigInt(process.env.RELAYER_BUFFER_BPS || "1500");
const BULLETIN_WS = process.env.BULLETIN_WS || "wss://paseo-bulletin-rpc.polkadot.io";
const MAX_BULLETIN_UPLOAD_BYTES = Number(process.env.BULLETIN_MAX_UPLOAD_BYTES || 8 * 1024 * 1024);
const BULLETIN_UPLOAD_RATE_WINDOW_MS = Number(process.env.BULLETIN_UPLOAD_RATE_WINDOW_MS || 60_000);
const BULLETIN_UPLOAD_RATE_MAX = Number(process.env.BULLETIN_UPLOAD_RATE_MAX || 30);
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);
const BLAKE2B_256_CODE = 0xb220;
const RAW_CODEC = 0x55;
const LOCAL_RELAYER_PRIVATE_KEY =
	"0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";
const INDEXER_ENABLED = process.env.STEALTHPAY_INDEXER_ENABLED !== "false";
const INDEXER_WS =
	process.env.STEALTHPAY_INDEXER_WS ||
	process.env.VITE_WS_URL ||
	"wss://asset-hub-paseo-rpc.n.dwellir.com";
const INDEXER_LOOKBACK_BLOCKS = BigInt(process.env.STEALTHPAY_INDEXER_LOOKBACK_BLOCKS || 5_000);
const INDEXER_POLL_MS = Number(process.env.STEALTHPAY_INDEXER_POLL_MS || 6_000);
const INDEXER_DATA_FILE = process.env.STEALTHPAY_INDEXER_DATA_FILE
	? path.resolve(ROOT_DIR, process.env.STEALTHPAY_INDEXER_DATA_FILE)
	: path.resolve(ROOT_DIR, ".stealthpay-indexer.json");

const poolAbi = parseAbi([
	"function MAX_RELAYER_FEE() view returns (uint256)",
	"function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, bytes32 root, bytes32 nullifierHash, address recipient, address relayer, uint256 fee, uint256 expiry)",
	"event Deposit(bytes32 indexed commitment, uint32 leafIndex, bytes32 root)",
	"event Withdrawal(address indexed recipient, address indexed relayer, bytes32 nullifierHash, uint256 fee)",
	"error FeeTooHigh()",
	"error InvalidDenomination()",
	"error InvalidFieldElement()",
	"error InvalidProof()",
	"error NullifierAlreadyUsed()",
	"error QuoteExpired()",
	"error TransferFailed()",
	"error TreeFull()",
	"error UnknownRoot()",
]);

const stealthPayAbi = parseAbi([
	"event Announcement(uint256 indexed schemeId, address sender, address stealthAddress, bytes ephemeralPubKey, uint8 viewTag, bytes32 memoHash, uint256 nonce)",
]);

const quotes = new Map();
const app = express();
let bulletinClient = null;
const bulletinUploadRate = new Map();
let indexerClient = null;
let indexerStorage = null;
let indexerTimer = null;
let indexerRunning = false;
let indexerLastError = null;
const indexerContracts = loadIndexerContracts();
const indexerState = loadIndexerState();

app.use(
	cors({
		origin(origin, callback) {
			if (isAllowedCorsOrigin(origin)) {
				callback(null, true);
				return;
			}
			callback(new Error("Origin is not allowed by this StealthPay relayer."));
		},
	}),
);
app.use(express.json({ limit: `${Math.ceil(MAX_BULLETIN_UPLOAD_BYTES * 2.2)}b` }));

function isAllowedCorsOrigin(origin) {
	if (!origin) return true;
	if (CORS_ALLOWED_ORIGINS.includes(origin)) return true;
	try {
		const { hostname, protocol } = new URL(origin);
		if (protocol !== "https:" && !hostname.endsWith(".localhost")) return false;
		return (
			hostname === "stealthpaygift24.dot.li" ||
			hostname.endsWith(".app.dot.li") ||
			hostname === "localhost" ||
			hostname === "127.0.0.1"
		);
	} catch {
		return false;
	}
}

app.get("/health", async (_req, res) => {
	res.json({ ok: true });
});

app.use(
	"/zk",
	express.static(path.resolve(ROOT_DIR, "web/public/zk"), {
		immutable: true,
		maxAge: "1y",
		setHeaders(res) {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
		},
	}),
);

app.get("/index/status", async (_req, res) => {
	const finalizedBlock = await getIndexerFinalizedBlock().catch(() => null);
	res.json({
		announcements: indexerState.announcements.length,
		contracts: indexerContracts,
		deposits: indexerState.deposits.length,
		enabled: INDEXER_ENABLED,
		finalizedBlock: finalizedBlock?.toString() ?? null,
		lastError: indexerLastError,
		latestIndexedBlock: indexerState.latestIndexedBlock,
		ok: true,
		running: indexerRunning,
		withdrawals: indexerState.withdrawals.length,
		wsUrl: INDEXER_WS,
	});
});

app.get("/index/deposit", (req, res) => {
	const pool = normalizeAddress(req.query.pool);
	const commitment = normalizeHex32(req.query.commitment);
	if (!pool || !commitment) {
		res.status(400).json({ error: "pool and commitment are required" });
		return;
	}
	const deposit =
		indexerState.deposits.find(
			(item) =>
				item.poolAddress.toLowerCase() === pool && item.commitment.toLowerCase() === commitment,
		) ?? null;
	res.json({ deposit, ok: true });
});

app.get("/index/deposits", (req, res) => {
	const pool = normalizeAddress(req.query.pool);
	if (!pool) {
		res.status(400).json({ error: "pool is required" });
		return;
	}
	const fromLeaf = Math.max(0, Number(req.query.fromLeaf ?? 0));
	const limit = Math.max(1, Math.min(5000, Number(req.query.limit ?? 1024)));
	const deposits = indexerState.deposits
		.filter((item) => item.poolAddress.toLowerCase() === pool && item.leafIndex >= fromLeaf)
		.sort((a, b) => a.leafIndex - b.leafIndex)
		.slice(0, limit);
	res.json({ deposits, ok: true });
});

app.get("/index/announcement", (req, res) => {
	const registry = normalizeAddress(req.query.registry);
	const memo = normalizeHex32(req.query.memo);
	if (!registry || !memo) {
		res.status(400).json({ error: "registry and memo are required" });
		return;
	}
	const announcement =
		indexerState.announcements.find(
			(item) =>
				item.registryAddress.toLowerCase() === registry && item.memoHash.toLowerCase() === memo,
		) ?? null;
	res.json({ announcement, ok: true });
});

app.get("/index/withdrawal", (req, res) => {
	const pool = normalizeAddress(req.query.pool);
	const nullifierHash = normalizeHex32(req.query.nullifierHash);
	if (!pool || !nullifierHash) {
		res.status(400).json({ error: "pool and nullifierHash are required" });
		return;
	}
	const withdrawal =
		indexerState.withdrawals.find(
			(item) =>
				item.poolAddress.toLowerCase() === pool &&
				item.nullifierHash.toLowerCase() === nullifierHash,
		) ?? null;
	res.json({ ok: true, withdrawal });
});

app.post("/quote", async (req, res) => {
	try {
		const { ethRpcUrl, poolAddress } = req.body ?? {};
		if (typeof ethRpcUrl !== "string" || typeof poolAddress !== "string") {
			res.status(400).json({ error: "quote requires ethRpcUrl and poolAddress" });
			return;
		}

		const publicClient = createPublicClient({ transport: http(ethRpcUrl) });
		const walletAccount = await getRelayerAccount({ ethRpcUrl });
		const [chainId, gasPrice, maxRelayerFee, latestBlock] = await Promise.all([
			publicClient.getChainId(),
			publicClient.getGasPrice(),
			publicClient.readContract({
				address: poolAddress,
				abi: poolAbi,
				functionName: "MAX_RELAYER_FEE",
			}),
			publicClient.getBlock(),
		]);

		const expiry = latestBlock.timestamp + BigInt(QUOTE_TTL_SECONDS);
		const fee = computeQuotedFee({ gasPrice, maxRelayerFee });
		const quoteId = crypto.randomUUID();

		quotes.set(quoteId, {
			chainId: BigInt(chainId),
			ethRpcUrl,
			expiry,
			fee,
			poolAddress: poolAddress.toLowerCase(),
			relayerAddress: walletAccount.address.toLowerCase(),
		});

		res.json({
			chainId: chainId.toString(),
			expiry: expiry.toString(),
			fee: fee.toString(),
			poolAddress,
			quoteId,
			relayerAddress: walletAccount.address,
		});
	} catch (cause) {
		console.error(cause);
		res.status(500).json({
			error: cause instanceof Error ? cause.message : String(cause),
		});
	}
});

app.post("/bulletin/upload", async (req, res) => {
	try {
		if (!consumeBulletinUploadQuota(req)) {
			res.status(429).json({ error: "Bulletin upload rate limit exceeded" });
			return;
		}

		const { payloadHex } = req.body ?? {};
		if (typeof payloadHex !== "string" || !/^0x[0-9a-fA-F]*$/.test(payloadHex)) {
			res.status(400).json({ error: "bulletin upload requires payloadHex" });
			return;
		}

		const bytes = hexToBytes(payloadHex);
		if (bytes.length > MAX_BULLETIN_UPLOAD_BYTES) {
			res.status(413).json({ error: "bulletin payload is too large" });
			return;
		}

		const signer = getBulletinSigner();
		const api = getBulletinApi();
		const authorization = await api.query.TransactionStorage.Authorizations.getValue(
			Enum("Account", signer.address),
		);
		if (
			!authorization ||
			authorization.extent.transactions <= 0n ||
			authorization.extent.bytes < BigInt(bytes.length)
		) {
			res.status(503).json({
				error: `Bulletin relay signer ${signer.address} is not authorized for this payload size.`,
			});
			return;
		}

		await submitBulletinStore({
			api,
			bytes,
			signer: signer.signer,
		});
		const memoHash = hashBytes(bytes);
		res.json({
			cid: hexHashToCid(memoHash),
			memoHash,
			ok: true,
			uploader: signer.address,
		});
	} catch (cause) {
		console.error(cause);
		res.status(500).json({
			error: cause instanceof Error ? cause.message : String(cause),
		});
	}
});

app.post("/submit", async (req, res) => {
	try {
		const {
			ethRpcUrl,
			expiry,
			fee,
			nullifierHash,
			pA,
			pB,
			pC,
			poolAddress,
			quoteId,
			recipient,
			root,
		} = req.body ?? {};

		if (
			typeof ethRpcUrl !== "string" ||
			typeof poolAddress !== "string" ||
			typeof root !== "string" ||
			typeof nullifierHash !== "string" ||
			typeof recipient !== "string" ||
			typeof quoteId !== "string" ||
			typeof fee !== "string" ||
			typeof expiry !== "string"
		) {
			res.status(400).json({ error: "submit request is missing required fields" });
			return;
		}

		const quote = quotes.get(quoteId);
		if (!quote) {
			res.status(400).json({ error: "quote not found or expired" });
			return;
		}

		if (
			quote.ethRpcUrl !== ethRpcUrl ||
			quote.poolAddress !== poolAddress.toLowerCase() ||
			quote.fee !== BigInt(fee) ||
			quote.expiry !== BigInt(expiry)
		) {
			res.status(400).json({ error: "submit request does not match the quoted context" });
			return;
		}

		const publicClient = createPublicClient({ transport: http(ethRpcUrl) });
		const latestBlock = await publicClient.getBlock();
		if (latestBlock.timestamp > quote.expiry) {
			quotes.delete(quoteId);
			res.status(400).json({ error: "quote expired" });
			return;
		}

		const relayerAccount = await getRelayerAccount({ ethRpcUrl });
		if (relayerAccount.address.toLowerCase() !== quote.relayerAddress) {
			res.status(400).json({ error: "relayer account changed after quote issuance" });
			return;
		}

		if (!isGroth16ProofCoordinates({ pA, pB, pC })) {
			res.status(400).json({
				error: "submit requires Groth16 proof coordinates. The relayer does not accept private witness input.",
			});
			return;
		}

		const walletClient = createWalletClient({
			account: relayerAccount,
			transport: http(ethRpcUrl),
		});
		const hash = await walletClient.writeContract({
			address: poolAddress,
			abi: poolAbi,
			functionName: "withdraw",
			args: [
				pA,
				pB,
				pC,
				root,
				nullifierHash,
				recipient,
				relayerAccount.address,
				BigInt(fee),
				BigInt(expiry),
			],
		});
		const receipt = await publicClient.waitForTransactionReceipt({ hash });

		quotes.delete(quoteId);
		res.json({
			blockNumber: receipt.blockNumber.toString(),
			ok: true,
			transactionHash: hash,
		});
	} catch (cause) {
		console.error(cause);
		res.status(500).json({
			error: cause instanceof Error ? cause.message : String(cause),
		});
	}
});

app.listen(DEFAULT_PORT, "0.0.0.0", () => {
	console.log(`StealthPay relayer listening on http://0.0.0.0:${DEFAULT_PORT}`);
	startIndexer();
});

function startIndexer() {
	if (!INDEXER_ENABLED) {
		console.log("StealthPay public event indexer disabled.");
		return;
	}
	if (!indexerContracts.registryAddress || !indexerContracts.poolAddress) {
		console.warn("StealthPay indexer disabled because registry or pool address is missing.");
		return;
	}
	void runIndexerCycle();
	indexerTimer = setInterval(() => {
		void runIndexerCycle();
	}, INDEXER_POLL_MS);
	indexerTimer.unref?.();
}

async function runIndexerCycle() {
	if (indexerRunning) {
		return;
	}
	indexerRunning = true;
	try {
		const finalizedBlock = await getIndexerFinalizedBlock();
		const lowerBound =
			finalizedBlock > INDEXER_LOOKBACK_BLOCKS
				? finalizedBlock - INDEXER_LOOKBACK_BLOCKS + 1n
				: 0n;
		const lastIndexed =
			indexerState.latestIndexedBlock === null ? null : BigInt(indexerState.latestIndexedBlock);
		const fromBlock =
			lastIndexed === null || lastIndexed < lowerBound ? lowerBound : lastIndexed + 1n;

		if (fromBlock > finalizedBlock) {
			indexerLastError = null;
			return;
		}

		await scanIndexerRange(fromBlock, finalizedBlock);
		indexerState.latestIndexedBlock = finalizedBlock.toString();
		indexerLastError = null;
		saveIndexerState();
	} catch (cause) {
		indexerLastError = cause instanceof Error ? cause.message : String(cause);
		console.warn("StealthPay indexer cycle failed:", indexerLastError);
	} finally {
		indexerRunning = false;
	}
}

async function scanIndexerRange(fromBlock, toBlock) {
	const client = await getIndexerClient();
	const eventStorage = await getIndexerEventStorage();
	const eventStorageKey = eventStorage.keys.enc();
	let nextBlock = toBlock;
	const concurrency = 16;

	async function worker() {
		while (nextBlock >= fromBlock) {
			const blockNumber = nextBlock;
			nextBlock -= 1n;
			await indexBlock({ blockNumber, client, eventStorage, eventStorageKey });
		}
	}

	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	sortIndexerRecords();
}

async function indexBlock({ blockNumber, client, eventStorage, eventStorageKey }) {
	const blockHash = await client._request("chain_getBlockHash", [Number(blockNumber)]);
	if (!blockHash) {
		return;
	}

	let rawEventsHex = null;
	try {
		rawEventsHex = await client._request("state_getStorageAt", [eventStorageKey, blockHash]);
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		if (message.includes("UnknownBlock: State already discarded")) {
			return;
		}
		throw cause;
	}

	if (!rawEventsHex || rawEventsHex === "0x") {
		return;
	}

	const runtimeEvents = eventStorage.value.dec(hexToBytes(rawEventsHex));
	runtimeEvents.forEach((entry, eventIndex) => {
		const emitted = getContractEmittedValue(entry);
		if (!emitted) {
			return;
		}

		const contractHex = emitted.contract.asHex();
		if (typeof contractHex !== "string") {
			return;
		}
		const contractAddress = contractHex.toLowerCase();
		if (
			contractAddress !== indexerContracts.registryAddress &&
			contractAddress !== indexerContracts.poolAddress
		) {
			return;
		}

		const dataHex = emitted.data.asHex();
		const topicsHex = emitted.topics
			.map((topic) => topic.asHex())
			.filter((topic) => typeof topic === "string");
		if (typeof dataHex !== "string" || topicsHex.length === 0) {
			return;
		}

		const runtimeEvent = {
			blockHash,
			blockNumber,
			contractAddress,
			dataHex,
			eventIndex,
			eventRef: formatEventRef({ blockHash, blockNumber, eventIndex, phase: entry.phase }),
			phase: entry.phase,
			topicsHex,
		};

		if (contractAddress === indexerContracts.registryAddress) {
			indexAnnouncement(runtimeEvent);
			return;
		}
		indexDeposit(runtimeEvent);
		indexWithdrawal(runtimeEvent);
	});
}

function indexAnnouncement(event) {
	const decoded = decodeRuntimeContractEvent({
		abi: stealthPayAbi,
		event,
		eventName: "Announcement",
	});
	if (!decoded || decoded.schemeId !== 2n) {
		return;
	}
	const poolAddress = normalizeAddress(decoded.stealthAddress);
	const sender = normalizeAddress(decoded.sender);
	const memoHash = normalizeHex32(decoded.memoHash);
	if (!poolAddress || !sender || !memoHash || typeof decoded.ephemeralPubKey !== "string") {
		return;
	}
	upsertIndexerRecord(
		indexerState.announcements,
		(item) =>
			`${item.registryAddress.toLowerCase()}:${item.memoHash.toLowerCase()}:${item.nonce}`,
		{
			blockHash: event.blockHash,
			blockNumber: event.blockNumber.toString(),
			ephemeralPubKey: decoded.ephemeralPubKey,
			eventRef: event.eventRef,
			memoHash,
			nonce: decoded.nonce.toString(),
			poolAddress,
			registryAddress: event.contractAddress,
			sender,
			viewTag: Number(decoded.viewTag),
		},
	);
}

function indexDeposit(event) {
	const decoded = decodeRuntimeContractEvent({
		abi: poolAbi,
		event,
		eventName: "Deposit",
	});
	if (!decoded) {
		return;
	}
	const commitment = normalizeHex32(decoded.commitment);
	const root = normalizeHex32(decoded.root);
	if (!commitment || !root) {
		return;
	}
	upsertIndexerRecord(
		indexerState.deposits,
		(item) => `${item.poolAddress.toLowerCase()}:${item.commitment.toLowerCase()}`,
		{
			blockHash: event.blockHash,
			blockNumber: event.blockNumber.toString(),
			commitment,
			eventRef: event.eventRef,
			leafIndex: Number(decoded.leafIndex),
			poolAddress: event.contractAddress,
			root,
		},
	);
}

function indexWithdrawal(event) {
	const decoded = decodeRuntimeContractEvent({
		abi: poolAbi,
		event,
		eventName: "Withdrawal",
	});
	if (!decoded) {
		return;
	}
	const nullifierHash = normalizeHex32(decoded.nullifierHash);
	const recipient = normalizeAddress(decoded.recipient);
	const relayer = normalizeAddress(decoded.relayer);
	if (!nullifierHash || !recipient || !relayer) {
		return;
	}
	upsertIndexerRecord(
		indexerState.withdrawals,
		(item) => `${item.poolAddress.toLowerCase()}:${item.nullifierHash.toLowerCase()}`,
		{
			blockHash: event.blockHash,
			blockNumber: event.blockNumber.toString(),
			eventRef: event.eventRef,
			fee: decoded.fee.toString(),
			nullifierHash,
			poolAddress: event.contractAddress,
			recipient,
			relayer,
		},
	);
}

function decodeRuntimeContractEvent({ abi, event, eventName }) {
	try {
		const decoded = decodeEventLog({
			abi,
			data: event.dataHex,
			eventName,
			strict: true,
			topics: event.topicsHex,
		});
		return decoded.args;
	} catch {
		return null;
	}
}

async function getIndexerClient() {
	if (!indexerClient) {
		indexerClient = createClient(withPolkadotSdkCompat(getWsProvider(INDEXER_WS)));
	}
	return indexerClient;
}

async function getIndexerEventStorage() {
	if (!indexerStorage) {
		const client = await getIndexerClient();
		const metadataRaw = await client.getMetadata("finalized");
		const metadata = unifyMetadata(decAnyMetadata(metadataRaw));
		const dynamicBuilder = getDynamicBuilder(getLookupFn(metadata));
		indexerStorage = dynamicBuilder.buildStorage("System", "Events");
	}
	return indexerStorage;
}

async function getIndexerFinalizedBlock() {
	const client = await getIndexerClient();
	const headHash = await client._request("chain_getFinalizedHead", []);
	const header = await client._request("chain_getHeader", [headHash]);
	return BigInt(header.number);
}

function getContractEmittedValue(entry) {
	if (
		entry?.event?.type !== "Revive" ||
		entry.event.value?.type !== "ContractEmitted" ||
		!entry.event.value.value?.contract?.asHex ||
		!entry.event.value.value?.data?.asHex ||
		!Array.isArray(entry.event.value.value?.topics)
	) {
		return null;
	}
	return entry.event.value.value;
}

function formatEventRef({ blockHash, blockNumber, eventIndex, phase }) {
	const phaseRef = phase?.type === "ApplyExtrinsic" ? phase.value : phase?.type || "system";
	const digest = keccak256(stringToHex(`${blockHash}:${phaseRef}:${eventIndex}`));
	return `${blockNumber.toString()}:${phaseRef}:${eventIndex}:${digest.slice(2, 10)}`;
}

function loadIndexerContracts() {
	const deployments = loadDeployments();
	return {
		poolAddress: normalizeAddress(
			process.env.STEALTHPAY_POOL_ADDRESS || deployments.stealthPayPoolPvm,
		),
		registryAddress: normalizeAddress(
			process.env.STEALTHPAY_REGISTRY_ADDRESS || deployments.stealthPayPvm,
		),
	};
}

function loadDeployments() {
	try {
		return JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, "deployments.json"), "utf8"));
	} catch {
		return {};
	}
}

function loadIndexerState() {
	try {
		const parsed = JSON.parse(fs.readFileSync(INDEXER_DATA_FILE, "utf8"));
		return {
			announcements: Array.isArray(parsed.announcements) ? parsed.announcements : [],
			deposits: Array.isArray(parsed.deposits) ? parsed.deposits : [],
			latestIndexedBlock:
				typeof parsed.latestIndexedBlock === "string" ? parsed.latestIndexedBlock : null,
			withdrawals: Array.isArray(parsed.withdrawals) ? parsed.withdrawals : [],
		};
	} catch {
		return {
			announcements: [],
			deposits: [],
			latestIndexedBlock: null,
			withdrawals: [],
		};
	}
}

function saveIndexerState() {
	fs.writeFileSync(`${INDEXER_DATA_FILE}.tmp`, JSON.stringify(indexerState, null, 2));
	fs.renameSync(`${INDEXER_DATA_FILE}.tmp`, INDEXER_DATA_FILE);
}

function upsertIndexerRecord(records, keyOf, next) {
	const key = keyOf(next);
	const existingIndex = records.findIndex((item) => keyOf(item) === key);
	if (existingIndex >= 0) {
		records[existingIndex] = next;
		return;
	}
	records.push(next);
}

function sortIndexerRecords() {
	indexerState.announcements.sort(compareBlockRecords);
	indexerState.deposits.sort((a, b) => a.leafIndex - b.leafIndex);
	indexerState.withdrawals.sort(compareBlockRecords);
}

function compareBlockRecords(a, b) {
	return Number(BigInt(a.blockNumber) - BigInt(b.blockNumber));
}

function computeQuotedFee({ gasPrice, maxRelayerFee }) {
	const rawCost = gasPrice * QUOTE_GAS_UNITS + QUOTE_PREMIUM_WEI;
	const withBuffer = rawCost + (rawCost * QUOTE_BUFFER_BPS) / 10_000n;
	return withBuffer > maxRelayerFee ? maxRelayerFee : withBuffer;
}

async function getRelayerAccount({ ethRpcUrl }) {
	const chainId = await createPublicClient({ transport: http(ethRpcUrl) }).getChainId();
	const privateKey = resolveRelayerPrivateKey({
		chainId,
		isLocal: ethRpcUrl.includes("127.0.0.1") || ethRpcUrl.includes("localhost"),
	});

	return privateKeyToAccount(privateKey);
}

function getBulletinApi() {
	if (!bulletinClient) {
		bulletinClient = createClient(withPolkadotSdkCompat(getWsProvider(BULLETIN_WS)));
	}
	return bulletinClient.getTypedApi(bulletin);
}

function getBulletinSigner() {
	const mnemonic = process.env.BULLETIN_SIGNER_MNEMONIC;
	if (!mnemonic) {
		throw new Error(
			"BULLETIN_SIGNER_MNEMONIC is not configured. Set an authorized Bulletin signer on the relayer to enable app-managed gift payload upload.",
		);
	}

	const derive = sr25519CreateDerive(entropyToMiniSecret(mnemonicToEntropy(mnemonic)));
	const keypair = derive(process.env.BULLETIN_SIGNER_PATH || "");
	return {
		address: ss58Address(keypair.publicKey),
		signer: getPolkadotSigner(keypair.publicKey, "Sr25519", keypair.sign),
	};
}

function submitBulletinStore({ api, bytes, signer }) {
	const tx = api.tx.TransactionStorage.store({
		data: Binary.fromBytes(bytes),
	});

	return new Promise((resolve, reject) => {
		const subscription = tx.signSubmitAndWatch(signer).subscribe({
			next: (event) => {
				if (event.type === "txBestBlocksState" && event.found) {
					subscription.unsubscribe();
					resolve();
				}
			},
			error: (err) => {
				subscription.unsubscribe();
				reject(err);
			},
		});
	});
}

function resolveRelayerPrivateKey({ chainId, isLocal }) {
	if (chainId === 420420421 && isLocal && !process.env.RELAYER_PRIVATE_KEY) {
		return LOCAL_RELAYER_PRIVATE_KEY;
	}

	if (!process.env.RELAYER_PRIVATE_KEY) {
		throw new Error(
			"RELAYER_PRIVATE_KEY is required for this network. Set it before starting the relayer.",
		);
	}

	return process.env.RELAYER_PRIVATE_KEY;
}

function normalizeAddress(value) {
	return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)
		? value.toLowerCase()
		: null;
}

function normalizeHex32(value) {
	return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value)
		? value.toLowerCase()
		: null;
}

function hexToBytes(hex) {
	const clean = hex.slice(2);
	const bytes = new Uint8Array(clean.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

function hashBytes(bytes) {
	const hash = blake2b(bytes, undefined, 32);
	return `0x${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function hexHashToCid(hexHash) {
	const hashBytes = hexToBytes(hexHash);
	const multihash = digest.create(BLAKE2B_256_CODE, hashBytes);
	return CID.createV1(RAW_CODEC, multihash).toString();
}

function consumeBulletinUploadQuota(req) {
	const now = Date.now();
	const identity = req.get("origin") || req.ip || "unknown";
	const current = bulletinUploadRate.get(identity);
	if (!current || now >= current.resetAt) {
		bulletinUploadRate.set(identity, {
			count: 1,
			resetAt: now + BULLETIN_UPLOAD_RATE_WINDOW_MS,
		});
		return true;
	}

	if (current.count >= BULLETIN_UPLOAD_RATE_MAX) {
		return false;
	}

	current.count += 1;
	return true;
}

function isGroth16ProofCoordinates(value) {
	return (
		Array.isArray(value.pA) &&
		value.pA.length === 2 &&
		Array.isArray(value.pB) &&
		value.pB.length === 2 &&
		value.pB.every((row) => Array.isArray(row) && row.length === 2) &&
		Array.isArray(value.pC) &&
		value.pC.length === 2
	);
}
