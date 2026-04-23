import {
	concatHex,
	getAddress,
	keccak256,
	namehash,
	zeroAddress,
	type Address,
	type Hex,
} from "viem";
import { toBytes } from "viem/utils";

import { getPublicClient } from "../config/evm";

const DOTNS_DOT_NODE =
	"0x3fce7d1364a893e213bc4212792b517ffc88f5b13b86c8ef9c8d390c3a1370ce" as const;

export const DOTNS_CONTRACTS = {
	REGISTRAR: "0x329aAA5b6bEa94E750b2dacBa74Bf41291E6c2BD",
	REGISTRY: "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f",
	RESOLVER: "0x95645C7fD0fF38790647FE13F87Eb11c1DCc8514",
} as const satisfies Record<string, Address>;

const dotnsRegistryAbi = [
	{
		type: "function",
		name: "recordExists",
		inputs: [{ name: "node", type: "bytes32" }],
		outputs: [{ name: "", type: "bool" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "owner",
		inputs: [{ name: "node", type: "bytes32" }],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "resolver",
		inputs: [{ name: "node", type: "bytes32" }],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
] as const;

const dotnsResolverAbi = [
	{
		type: "function",
		name: "addressOf",
		inputs: [{ name: "node", type: "bytes32" }],
		outputs: [{ name: "value", type: "address" }],
		stateMutability: "view",
	},
] as const;

const dotnsRegistrarAbi = [
	{
		type: "function",
		name: "ownerOf",
		inputs: [{ name: "tokenId", type: "uint256" }],
		outputs: [{ name: "", type: "address" }],
		stateMutability: "view",
	},
] as const;

export type DotnsResolution = {
	input: string;
	label: string;
	node: Hex;
	owner: Address;
	source: "forward-resolution" | "domain-owner";
};

export type DotnsPublicClient = ReturnType<typeof getPublicClient>;

export function parseDotnsLabel(input: string) {
	const normalized = normalizeDotnsInput(input);
	if (!normalized) {
		return null;
	}

	if (normalized.endsWith(".dot")) {
		return stripDotSuffix(normalized);
	}

	if (normalized.endsWith(".paseo.li")) {
		return normalized.slice(0, -".paseo.li".length);
	}

	if (normalized.endsWith(".dotli.dev")) {
		return normalized.slice(0, -".dotli.dev".length);
	}

	if (isSingleDotnsLabel(normalized)) {
		return normalized;
	}

	return null;
}

export function looksLikeDotnsName(input: string) {
	return parseDotnsLabel(input) !== null;
}

export function computeDotnsTokenId(label: string) {
	const labelhash = keccak256(toBytes(label));
	const node = keccak256(concatHex([DOTNS_DOT_NODE, labelhash]));
	return BigInt(node);
}

export async function resolveDotnsName(args: {
	input: string;
	ethRpcUrl: string;
	publicClient?: DotnsPublicClient;
}): Promise<DotnsResolution> {
	const label = parseDotnsLabel(args.input);
	if (!label) {
		throw new Error("Enter a DotNS name like alice.dot, alice.paseo.li, or alice.");
	}

	const client = args.publicClient ?? getPublicClient(args.ethRpcUrl);
	const node = namehash(`${label}.dot`);
	const exists = await client.readContract({
		address: DOTNS_CONTRACTS.REGISTRY,
		abi: dotnsRegistryAbi,
		functionName: "recordExists",
		args: [node],
	});

	if (!exists) {
		throw new Error(`DotNS name ${label}.dot is not registered.`);
	}

	const [registryOwner, resolver] = await Promise.all([
		client.readContract({
			address: DOTNS_CONTRACTS.REGISTRY,
			abi: dotnsRegistryAbi,
			functionName: "owner",
			args: [node],
		}),
		client.readContract({
			address: DOTNS_CONTRACTS.REGISTRY,
			abi: dotnsRegistryAbi,
			functionName: "resolver",
			args: [node],
		}),
	]);

	if (resolver !== zeroAddress) {
		const resolvedAddress = await client
			.readContract({
				address: resolver,
				abi: dotnsResolverAbi,
				functionName: "addressOf",
				args: [node],
			})
			.catch(() => zeroAddress);

		if (resolvedAddress !== zeroAddress) {
			return {
				input: args.input,
				label,
				node,
				owner: getAddress(resolvedAddress),
				source: "forward-resolution",
			};
		}
	}

	const registrarOwner = await resolveRegistrarOwner(client, label).catch(() => registryOwner);
	if (registrarOwner === zeroAddress) {
		throw new Error(`DotNS name ${label}.dot is registered but has no usable owner address.`);
	}

	return {
		input: args.input,
		label,
		node,
		owner: getAddress(registrarOwner),
		source: "domain-owner",
	};
}

async function resolveRegistrarOwner(client: DotnsPublicClient, label: string) {
	const tokenId = computeDotnsTokenId(label);
	return await client.readContract({
		address: DOTNS_CONTRACTS.REGISTRAR,
		abi: dotnsRegistrarAbi,
		functionName: "ownerOf",
		args: [tokenId],
	});
}

function normalizeDotnsInput(input: string) {
	let value = input.trim().toLowerCase();
	if (!value) {
		return null;
	}

	try {
		const url = new URL(value.includes("://") ? value : `https://${value}`);
		value = url.hostname.toLowerCase();
	} catch {
		// Keep plain labels as-is.
	}

	return value.replace(/\.$/, "");
}

function stripDotSuffix(input: string) {
	return input.slice(0, -".dot".length);
}

function isSingleDotnsLabel(input: string) {
	return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input);
}
