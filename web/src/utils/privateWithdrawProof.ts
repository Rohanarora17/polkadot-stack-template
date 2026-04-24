import type { Address } from "viem";

import {
	computePoolContext,
	type MerkleProof,
	type PrivateNotePayload,
} from "../crypto/privatePool";

type ProofResult = {
	pA: [string, string];
	pB: [[string, string], [string, string]];
	pC: [string, string];
	publicSignals: string[];
};

type WorkerRequest = {
	context: string;
	expiry: string;
	fee: string;
	input: {
		context: string;
		nullifier: string;
		nullifierHash: string;
		pathElements: string[];
		pathIndices: string[];
		root: string;
		scope: string;
		secret: string;
	};
	requestId: string;
	wasmUrl: string;
	zkeyUrl: string;
};

type WorkerSuccess = ProofResult & {
	requestId: string;
	type: "success";
};

type WorkerFailure = {
	error: string;
	requestId: string;
	type: "error";
};

type WorkerResponse = WorkerSuccess | WorkerFailure;

export async function generatePrivateWithdrawProof(args: {
	expiry: bigint;
	fee: bigint;
	merkleProof: MerkleProof;
	note: PrivateNotePayload;
	recipient: Address;
	relayer: Address;
}) {
	const context = await computePoolContext({
		chainId: args.note.chainId,
		expiry: args.expiry,
		fee: args.fee,
		poolAddress: args.note.poolAddress,
		recipient: args.recipient,
		relayer: args.relayer,
	});

	const worker = new Worker(new URL("../workers/privateWithdrawWorker.ts", import.meta.url), {
		type: "module",
	});

	const requestId = crypto.randomUUID();
	const wasmUrl = getZkAssetUrl("private-withdraw.wasm");
	const zkeyUrl = getZkAssetUrl("private-withdraw.zkey");

	const request: WorkerRequest = {
		context: context.toString(),
		expiry: args.expiry.toString(),
		fee: args.fee.toString(),
		input: {
			context: context.toString(),
			nullifier: BigInt(args.note.nullifier).toString(),
			nullifierHash: BigInt(args.note.nullifierHash).toString(),
			pathElements: args.merkleProof.pathElements.map((value) => value.toString()),
			pathIndices: args.merkleProof.pathIndices.map((value) => value.toString()),
			root: BigInt(args.merkleProof.root).toString(),
			scope: BigInt(args.note.scope).toString(),
			secret: BigInt(args.note.secret).toString(),
		},
		requestId,
		wasmUrl,
		zkeyUrl,
	};

	return new Promise<
		ProofResult & {
			context: bigint;
		}
	>((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			const response = event.data;
			if (response.requestId !== requestId) {
				return;
			}

			worker.terminate();
			if (response.type === "error") {
				reject(new Error(response.error));
				return;
			}

			resolve({
				context,
				pA: response.pA,
				pB: response.pB,
				pC: response.pC,
				publicSignals: response.publicSignals,
			});
		};

		worker.onerror = (event) => {
			worker.terminate();
			reject(new Error(event.message || "Private proof worker failed."));
		};

		worker.postMessage(request);
	});
}

function getZkAssetUrl(fileName: "private-withdraw.wasm" | "private-withdraw.zkey") {
	const remoteBase = import.meta.env.VITE_ZK_ASSET_BASE_URL;
	if (typeof remoteBase === "string" && remoteBase.trim()) {
		const resolvedBase = new URL(ensureTrailingSlash(remoteBase.trim()), window.location.origin);
		return new URL(fileName, resolvedBase).toString();
	}

	const baseUrl = new URL(import.meta.env.BASE_URL || "/", window.location.origin);
	return new URL(`zk/private-withdraw/${fileName}`, baseUrl).toString();
}

function ensureTrailingSlash(value: string) {
	return value.endsWith("/") ? value : `${value}/`;
}
