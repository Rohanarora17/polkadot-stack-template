import { getSs58AddressInfo } from "@polkadot-api/substrate-bindings";
import { isAddress, type Address } from "viem";

import { looksLikeDotnsName, resolveDotnsName } from "./dotns";
import { resolveReviveAddress } from "./stealthRevive";

export type ResolvedRecipient = {
	input: string;
	label: string;
	owner: Address;
	source: "h160" | "substrate" | "dotns";
};

export async function resolveRecipientOwner(args: {
	ethRpcUrl: string;
	input: string;
	wsUrl: string;
}): Promise<ResolvedRecipient> {
	const input = args.input.trim();
	if (!input) {
		throw new Error("Choose a recipient wallet or create a walletless gift link.");
	}

	if (isAddress(input)) {
		return {
			input,
			label: "EVM wallet",
			owner: input,
			source: "h160",
		};
	}

	const ss58Info = getSs58AddressInfo(input);
	if (ss58Info.isValid) {
		const owner = await resolveReviveAddress({
			originSs58: input,
			wsUrl: args.wsUrl,
		});

		if (!isAddress(owner)) {
			throw new Error("Could not resolve the recipient wallet to an H160 contract identity.");
		}

		return {
			input,
			label: "Extension wallet",
			owner,
			source: "substrate",
		};
	}

	if (looksLikeSs58AddressCandidate(input)) {
		throw new Error(
			"Recipient looks like a Substrate wallet address, but it is not valid. SS58 addresses are case-sensitive, so paste it exactly as shown in the wallet extension.",
		);
	}

	if (looksLikeDotnsName(input)) {
		const resolved = await resolveDotnsName({
			ethRpcUrl: args.ethRpcUrl,
			input,
		});
		return {
			input,
			label:
				resolved.source === "forward-resolution"
					? `${resolved.label}.dot`
					: `${resolved.label}.dot owner`,
			owner: resolved.owner,
			source: "dotns",
		};
	}

	throw new Error(
		"Recipient was not recognized. Use a wallet from the extension, paste a valid wallet address, or create a walletless gift link.",
	);
}

function looksLikeSs58AddressCandidate(input: string) {
	return /^[A-Za-z0-9]{45,60}$/.test(input);
}
