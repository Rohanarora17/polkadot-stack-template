import { groth16 } from "snarkjs";

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

type WorkerResponse =
	| {
			pA: [string, string];
			pB: [[string, string], [string, string]];
			pC: [string, string];
			publicSignals: string[];
			requestId: string;
			type: "success";
	  }
	| {
			error: string;
			requestId: string;
			type: "error";
	  };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
	const request = event.data;

	try {
		const { proof, publicSignals } = await groth16.fullProve(
			request.input,
			request.wasmUrl,
			request.zkeyUrl,
		);
		const callData = await groth16.exportSolidityCallData(proof, publicSignals);
		const [pA, pB, pC] = JSON.parse(`[${callData}]`) as [
			[string, string],
			[[string, string], [string, string]],
			[string, string],
			string[],
		];

		self.postMessage({
			pA,
			pB,
			pC,
			publicSignals,
			requestId: request.requestId,
			type: "success",
		} satisfies WorkerResponse);
	} catch (cause) {
		self.postMessage({
			error: cause instanceof Error ? cause.message : String(cause),
			requestId: request.requestId,
			type: "error",
		} satisfies WorkerResponse);
	}
};
