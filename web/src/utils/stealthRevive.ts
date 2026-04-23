import { stack_template } from "@polkadot-api/descriptors";
import type { PolkadotSigner } from "polkadot-api";
import { FixedSizeBinary } from "polkadot-api";

import { getClient } from "../hooks/useChain";
import { formatDispatchError } from "./format";

export const DEFAULT_WEIGHT_LIMIT = {
	ref_time: 500_000_000_000n,
	proof_size: 500_000n,
} as const;

export const DEFAULT_STORAGE_DEPOSIT_LIMIT = 10_000_000_000_000n;
export const UNIT_PLANCK = 1_000_000_000_000n;
export const PASEO_HUB_TESTNET_CHAIN_ID = 420420417;
export const PASEO_REVIVE_MSG_VALUE_SCALE = 100_000_000n;

export async function ensureMappedForRevive({
	wsUrl,
	txSigner,
}: {
	wsUrl: string;
	txSigner: PolkadotSigner;
}) {
	const typedApi = getClient(wsUrl).getTypedApi(stack_template);
	try {
		const mapResult = await typedApi.tx.Revive.map_account().signAndSubmit(txSigner);
		if (!mapResult.ok) {
			const dispatchMessage = formatDispatchError(mapResult.dispatchError);
			if (!dispatchMessage.includes("AlreadyMapped")) {
				throw new Error(dispatchMessage);
			}
		}
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		if (!message.includes("AlreadyMapped")) {
			throw cause;
		}
	}
}

export async function resolveReviveAddress({
	wsUrl,
	originSs58,
}: {
	wsUrl: string;
	originSs58: string;
}) {
	const typedApi = getClient(wsUrl).getTypedApi(stack_template);
	const reviveAddress = await typedApi.apis.ReviveApi.address(originSs58);
	return reviveAddress.asHex();
}

export function toReviveDest(address: `0x${string}`) {
	return FixedSizeBinary.fromHex(address);
}

export function contractValueToReviveCallValue(contractValue: bigint, chainId: number) {
	if (chainId !== PASEO_HUB_TESTNET_CHAIN_ID) {
		return contractValue;
	}
	if (contractValue % PASEO_REVIVE_MSG_VALUE_SCALE !== 0n) {
		throw new Error(
			`Contract value ${contractValue.toString()} is not divisible by Paseo Revive msg.value scale ${PASEO_REVIVE_MSG_VALUE_SCALE.toString()}.`,
		);
	}
	return contractValue / PASEO_REVIVE_MSG_VALUE_SCALE;
}

export function parseUnitAmount(input: string) {
	const trimmed = input.trim();
	if (!trimmed) {
		throw new Error("Enter an amount first.");
	}

	if (!/^\d+(\.\d{0,12})?$/.test(trimmed)) {
		throw new Error("Amount must be a positive decimal with up to 12 fractional digits.");
	}

	const [wholePart, fractionPart = ""] = trimmed.split(".");
	const whole = BigInt(wholePart || "0");
	const fraction = BigInt((fractionPart + "0".repeat(12)).slice(0, 12));
	const planck = whole * UNIT_PLANCK + fraction;
	if (planck <= 0n) {
		throw new Error("Amount must be greater than zero.");
	}
	return planck;
}

export function formatPlanck(planck: bigint) {
	const whole = planck / UNIT_PLANCK;
	const fraction = planck % UNIT_PLANCK;
	if (fraction === 0n) {
		return whole.toString();
	}

	return `${whole}.${fraction.toString().padStart(12, "0").replace(/0+$/, "")}`;
}
