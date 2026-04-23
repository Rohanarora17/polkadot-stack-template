import path from "node:path";
import { fileURLToPath } from "node:url";

import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { groth16 } from "snarkjs";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
dotenv.config({ path: path.resolve(ROOT_DIR, ".env") });
const WASM_PATH = path.resolve(
	ROOT_DIR,
	"web/public/zk/private-withdraw/private-withdraw.wasm",
);
const ZKEY_PATH = path.resolve(
	ROOT_DIR,
	"web/public/zk/private-withdraw/private-withdraw.zkey",
);

const DEFAULT_PORT = Number(process.env.RELAYER_PORT || 8787);
const QUOTE_TTL_SECONDS = Number(process.env.RELAYER_QUOTE_TTL_SECONDS || 600);
const QUOTE_GAS_UNITS = BigInt(process.env.RELAYER_QUOTE_GAS_UNITS || "450000");
const QUOTE_PREMIUM_WEI = BigInt(process.env.RELAYER_PREMIUM_WEI || "25000000000000");
const QUOTE_BUFFER_BPS = BigInt(process.env.RELAYER_BUFFER_BPS || "1500");
const LOCAL_RELAYER_PRIVATE_KEY =
	"0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133";

const poolAbi = parseAbi([
	"function MAX_RELAYER_FEE() view returns (uint256)",
	"function withdraw(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, bytes32 root, bytes32 nullifierHash, address recipient, address relayer, uint256 fee, uint256 expiry)",
]);

const quotes = new Map();
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
	res.json({ ok: true });
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
		const [chainId, gasPrice, maxRelayerFee] = await Promise.all([
			publicClient.getChainId(),
			publicClient.getGasPrice(),
			publicClient.readContract({
				address: poolAddress,
				abi: poolAbi,
				functionName: "MAX_RELAYER_FEE",
			}),
		]);

		const expiry = BigInt(Math.floor(Date.now() / 1000) + QUOTE_TTL_SECONDS);
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
			proofInput,
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

		if (BigInt(Math.floor(Date.now() / 1000)) > quote.expiry) {
			quotes.delete(quoteId);
			res.status(400).json({ error: "quote expired" });
			return;
		}

		const relayerAccount = await getRelayerAccount({ ethRpcUrl });
		if (relayerAccount.address.toLowerCase() !== quote.relayerAddress) {
			res.status(400).json({ error: "relayer account changed after quote issuance" });
			return;
		}

		let proof = { pA, pB, pC };
		if (!Array.isArray(proof.pA) || !Array.isArray(proof.pB) || !Array.isArray(proof.pC)) {
			if (!proofInput) {
				res.status(400).json({ error: "submit requires proof coordinates or proofInput" });
				return;
			}
			proof = await generateProofFromInput(proofInput);
		}

		const walletClient = createWalletClient({
			account: relayerAccount,
			transport: http(ethRpcUrl),
		});
		const publicClient = createPublicClient({ transport: http(ethRpcUrl) });
		const hash = await walletClient.writeContract({
			address: poolAddress,
			abi: poolAbi,
			functionName: "withdraw",
			args: [
				proof.pA,
				proof.pB,
				proof.pC,
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

app.listen(DEFAULT_PORT, () => {
	console.log(`StealthPay relayer listening on http://127.0.0.1:${DEFAULT_PORT}`);
});

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

async function generateProofFromInput(input) {
	const normalizedInput = {
		context: String(input.context),
		nullifier: String(input.nullifier),
		nullifierHash: String(input.nullifierHash),
		pathElements: input.pathElements.map((value) => String(value)),
		pathIndices: input.pathIndices.map((value) => String(value)),
		root: String(input.root),
		scope: String(input.scope),
		secret: String(input.secret),
	};

	const { proof, publicSignals } = await groth16.fullProve(
		normalizedInput,
		WASM_PATH,
		ZKEY_PATH,
	);
	const callData = await groth16.exportSolidityCallData(proof, publicSignals);
	const [pA, pB, pC] = JSON.parse(`[${callData}]`);

	return { pA, pB, pC };
}
