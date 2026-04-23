import { randomBytes } from "node:crypto";
import path from "node:path";

import { buildPoseidon, poseidonContract } from "circomlibjs";
import { groth16 } from "snarkjs";
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export const SNARK_SCALAR_FIELD =
	21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const DENOMINATION = 10n ** 18n;
export const TREE_DEPTH = 10;

const zeroValues = [
	0x0000000000000000000000000000000000000000000000000000000000000000n,
	0x2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864n,
	0x1069673dcdb12263df301a6ff584a7ec261a44cb9dc68df067a4774460b1f1e1n,
	0x18f43331537ee2af2e3d758d50f72106467c6eea50371dd528d57eb2b856d238n,
	0x07f9d837cb17b0d36320ffe93ba52345f1b728571a568265caac97559dbc952an,
	0x2b94cf5e8746b3f5c9631f4c5df32907a699c58c94b2ad4d7b5cec1639183f55n,
	0x2dee93c5a666459646ea7d22cca9e1bcfed71e6951b953611d11dda32ea09d78n,
	0x078295e5a22b84e982cf601eb639597b8b0515a88cb5ac7fa8a4aabe3c87349dn,
	0x2fa5e5f18f6027a6501bec864564472a616b2e274a41211a444cbe3a99f3cc61n,
	0x0e884376d0d8fd21ecb780389e941f66e45e7acce3e228ab3e2156a614fcd747n,
	0x1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2n,
] as const;

type PoolProofData = {
	scope: bigint;
	commitment: bigint;
	nullifier: bigint;
	nullifierHash: bigint;
	secret: bigint;
	root: bigint;
	pathElements: bigint[];
	pathIndices: number[];
};

const wasmPath = path.resolve(
	__dirname,
	"../../web/public/zk/private-withdraw/private-withdraw.wasm",
);
const zkeyPath = path.resolve(
	__dirname,
	"../../web/public/zk/private-withdraw/private-withdraw.zkey",
);

function hexToBigInt(hex: Hex) {
	return BigInt(hex);
}

function randomFieldElement() {
	return BigInt(`0x${randomBytes(31).toString("hex")}`) % (SNARK_SCALAR_FIELD - 1n) + 1n;
}

export async function deployPoseidon2(walletClient: {
	account: { address: Address };
	deployContract(args: { abi: unknown[]; bytecode: Hex; args?: unknown[] }): Promise<Hex>;
}) {
	const hash = await walletClient.deployContract({
		abi: poseidonContract.generateABI(2) as unknown[],
		bytecode: `0x${poseidonContract.createCode(2)}` as Hex,
	});

	return hash;
}

export async function buildPoolProofFixture(scope: bigint): Promise<PoolProofData> {
	const poseidon = await buildPoseidon();
	const fieldToBigInt = (value: unknown) => BigInt(poseidon.F.toString(value));

	const nullifier = randomFieldElement();
	const secret = randomFieldElement();
	const commitment = fieldToBigInt(poseidon([scope, nullifier, secret]));
	const nullifierHash = fieldToBigInt(poseidon([scope, nullifier]));

	let current = commitment;
	const pathElements: bigint[] = [];
	const pathIndices: number[] = [];

	for (let level = 0; level < TREE_DEPTH; level++) {
		pathElements.push(zeroValues[level]);
		pathIndices.push(0);
		current = fieldToBigInt(poseidon([current, zeroValues[level]]));
	}

	return {
		scope,
		commitment,
		nullifier,
		nullifierHash,
		secret,
		root: current,
		pathElements,
		pathIndices,
	};
}

export function computeContext({
	chainId,
	poolAddress,
	recipient,
	relayer,
	fee,
	expiry,
}: {
	chainId: bigint;
	poolAddress: Address;
	recipient: Address;
	relayer: Address;
	fee: bigint;
	expiry: bigint;
}) {
	return (
		hexToBigInt(
			keccak256(
				encodeAbiParameters(
					[
						{ type: "uint256" },
						{ type: "address" },
						{ type: "address" },
						{ type: "address" },
						{ type: "uint256" },
						{ type: "uint256" },
						{ type: "uint256" },
					],
					[chainId, poolAddress, recipient, relayer, fee, expiry, DENOMINATION],
				),
			),
		) % SNARK_SCALAR_FIELD
	);
}

export async function generateWithdrawProof(args: {
	root: bigint;
	nullifierHash: bigint;
	scope: bigint;
	context: bigint;
	nullifier: bigint;
	secret: bigint;
	pathElements: bigint[];
	pathIndices: number[];
}) {
	const input = {
		root: args.root.toString(),
		nullifierHash: args.nullifierHash.toString(),
		scope: args.scope.toString(),
		context: args.context.toString(),
		nullifier: args.nullifier.toString(),
		secret: args.secret.toString(),
		pathElements: args.pathElements.map((value) => value.toString()),
		pathIndices: args.pathIndices.map((value) => value.toString()),
	};

	const { proof, publicSignals } = await groth16.fullProve(input, wasmPath, zkeyPath);
	const callData = await groth16.exportSolidityCallData(proof, publicSignals);
	const [pA, pB, pC] = JSON.parse(`[${callData}]`) as [
		[bigint, bigint],
		[[bigint, bigint], [bigint, bigint]],
		[bigint, bigint],
		bigint[],
	];

	return { pA, pB, pC, publicSignals };
}
