import type { PolkadotSigner } from "polkadot-api";

import { isPolkadotHostEnvironment } from "./hostEnvironment";

const HOST_TX_TIMEOUT_MS = 90_000;

export type PapiSubmitResult = {
	block: {
		number: bigint | number;
	};
	dispatchError?: unknown;
	events?: unknown[];
	ok: boolean;
	txHash?: string;
};

type PapiTxLike = {
	signAndSubmit(signer: PolkadotSigner): Promise<PapiSubmitResult>;
	signSubmitAndWatch(signer: PolkadotSigner): {
		subscribe(observer: {
			error(error: unknown): void;
			next(event: PapiTxEvent): void;
		}): { unsubscribe(): void };
	};
};

type PapiTxEvent = {
	dispatchError?: unknown;
	error?: unknown;
	found?: unknown;
	ok?: boolean;
	txHash?: string;
	type: string;
};

export async function submitPapiTx(
	tx: PapiTxLike,
	signer: PolkadotSigner,
	label: string,
): Promise<PapiSubmitResult> {
	if (!isPolkadotHostEnvironment()) {
		const result = await tx.signAndSubmit(signer);
		return {
			...result,
			block: {
				number: result.block?.number ?? 0n,
			},
		};
	}

	return new Promise<PapiSubmitResult>((resolve, reject) => {
		let subscription: { unsubscribe(): void } | undefined;
		const timeout = window.setTimeout(() => {
			subscription?.unsubscribe();
			reject(
				new Error(
					`${label} timed out after approval in the Dot.li host. The transaction was signed but no inclusion event was received.`,
				),
			);
		}, HOST_TX_TIMEOUT_MS);

		const finish = (result: PapiSubmitResult) => {
			window.clearTimeout(timeout);
			subscription?.unsubscribe();
			resolve(result);
		};

		subscription = tx.signSubmitAndWatch(signer).subscribe({
			next(event) {
				console.info("[StealthPay][HostTx]", label, event.type, event);

				if (event.error) {
					window.clearTimeout(timeout);
					subscription?.unsubscribe();
					reject(event.error);
					return;
				}

				if (event.type === "txBestBlocksState" && event.found) {
					finish(normalizeHostTxResult(event.found, event));
					return;
				}

				if (event.type === "finalized" || event.type === "txFinalized") {
					finish(normalizeHostTxResult(event, event));
				}
			},
			error(error) {
				window.clearTimeout(timeout);
				subscription?.unsubscribe();
				reject(error);
			},
		});
	});
}

function normalizeHostTxResult(found: unknown, event: PapiTxEvent): PapiSubmitResult {
	if (typeof found === "object" && found !== null) {
		const record = found as Partial<PapiSubmitResult>;
		return {
			...record,
			block: {
				number: record.block?.number ?? 0n,
			},
			ok: record.ok !== false,
			txHash: typeof record.txHash === "string" ? record.txHash : event.txHash,
		};
	}

	return {
		block: {
			number: 0n,
		},
		ok: event.ok !== false,
		txHash: event.txHash,
	};
}
