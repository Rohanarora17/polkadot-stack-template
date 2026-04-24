import { paseo_hub, stack_template } from "@polkadot-api/descriptors";
import { decodeAddress } from "@polkadot/util-crypto";
import type { PolkadotSigner } from "polkadot-api";
import { FixedSizeBinary } from "polkadot-api";

import { getClient } from "../hooks/useChain";
import { formatDispatchError } from "./format";
import { isPolkadotHostEnvironment } from "./hostEnvironment";
import { submitPapiTx } from "./submitPapiTx";

export const DEFAULT_WEIGHT_LIMIT = {
	ref_time: 500_000_000_000n,
	proof_size: 500_000n,
} as const;

export const DEFAULT_STORAGE_DEPOSIT_LIMIT = 10_000_000_000_000n;
export const UNIT_PLANCK = 1_000_000_000_000n;
export const PASEO_HUB_TESTNET_CHAIN_ID = 420420417;
export const PASEO_REVIVE_MSG_VALUE_SCALE = 100_000_000n;
export const REVIVE_MAPPING_REQUIRED_MESSAGE =
	"This wallet is not mapped for Revive contract calls yet. Map it once, then retry this action.";
const REVIVE_MAPPING_VISIBILITY_ATTEMPTS = 24;
const REVIVE_MAPPING_VISIBILITY_DELAY_MS = 2_500;

export function getStealthTypedApi(wsUrl?: string) {
	return getClient(wsUrl).getTypedApi(getStealthDescriptor(wsUrl));
}

function getStealthDescriptor(wsUrl?: string) {
	if (isPolkadotHostEnvironment() || isPaseoAssetHubUrl(wsUrl)) {
		return paseo_hub;
	}

	return stack_template;
}

function isPaseoAssetHubUrl(wsUrl?: string) {
	const normalized = (wsUrl ?? "").toLowerCase();
	return (
		normalized.includes("asset-hub-paseo") ||
		normalized.includes("paseo") ||
		normalized.includes("polkadothub-rpc.com/testnet")
	);
}

export async function ensureMappedForRevive({
	wsUrl,
	txSigner,
	originSs58,
}: {
	wsUrl: string;
	txSigner: PolkadotSigner;
	originSs58?: string;
}) {
	if (originSs58 && (await isMappedForRevive({ originSs58, wsUrl }))) {
		return;
	}
	if (isPolkadotHostEnvironment()) {
		throw new Error(REVIVE_MAPPING_REQUIRED_MESSAGE);
	}

	await mapAccountForRevive({ originSs58, txSigner, wsUrl });
}

export async function mapAccountForRevive({
	wsUrl,
	txSigner,
	originSs58,
}: {
	wsUrl: string;
	txSigner: PolkadotSigner;
	originSs58?: string;
}) {
	const typedApi = getStealthTypedApi(wsUrl);

	try {
		const mapResult = await submitPapiTx(
			typedApi.tx.Revive.map_account(),
			txSigner,
			"Revive.map_account",
		);
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

	if (!originSs58) {
		return;
	}

	for (let attempt = 0; attempt < REVIVE_MAPPING_VISIBILITY_ATTEMPTS; attempt += 1) {
		if (await isMappedForRevive({ originSs58, wsUrl })) {
			return;
		}
		await new Promise((resolve) =>
			window.setTimeout(resolve, REVIVE_MAPPING_VISIBILITY_DELAY_MS),
		);
	}

	throw new Error(
		"Revive mapping transaction was submitted, but the mapping is not visible yet. Wait a few blocks and retry.",
	);
}

export async function isMappedForRevive({
	wsUrl,
	originSs58,
}: {
	wsUrl: string;
	originSs58: string;
}) {
	const typedApi = getStealthTypedApi(wsUrl);
	const reviveAddress = await typedApi.apis.ReviveApi.address(originSs58);
	const originalAccount = await typedApi.query.Revive.OriginalAccount.getValue(reviveAddress);
	return !!originalAccount && sameSs58Account(originalAccount, originSs58);
}

export function sameSs58Account(left: string, right: string) {
	try {
		return bytesToHex(decodeAddress(left)) === bytesToHex(decodeAddress(right));
	} catch {
		return left === right;
	}
}

function bytesToHex(bytes: Uint8Array) {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function resolveReviveAddress({
	wsUrl,
	originSs58,
}: {
	wsUrl: string;
	originSs58: string;
}) {
	const typedApi = getStealthTypedApi(wsUrl);
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
