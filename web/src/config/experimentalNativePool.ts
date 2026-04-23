import type { Address } from "viem";

export const EXPERIMENTAL_NATIVE_POOL_ADDRESS =
	"0x3ac9bfd78241dbe685b1248d3ecdcba081a9512a" as Address;

export const EXPERIMENTAL_NATIVE_POOL_DENOMINATION = 1_000_000_000_000n;

export const MSG_VALUE_PROBE_ADDRESS = "0xf65876ff5e20c99cff46dd2d7ed45a5845bd4585" as Address;

export const msgValueProbeAbi = [
	{
		type: "function",
		name: "lastValue",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "recordCount",
		inputs: [],
		outputs: [{ name: "", type: "uint256" }],
		stateMutability: "view",
	},
	{
		type: "function",
		name: "recordValue",
		inputs: [],
		outputs: [],
		stateMutability: "payable",
	},
] as const;
