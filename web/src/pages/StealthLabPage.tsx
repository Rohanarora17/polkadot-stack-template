import { useState } from "react";
import { bytesToHex } from "@noble/hashes/utils.js";

import {
	deriveKeysFromSignature,
	encodeMetaAddressHex,
	getStealthDerivationMessage,
	type MetaAddressKeys,
} from "../crypto/stealth";
import {
	signStealthDerivationMessage,
	type StealthSigningProviderKind,
} from "../wallet/stealthSigning";

type DerivationSnapshot = {
	account: string;
	accountName: string | null;
	chainId: bigint;
	providerKind: StealthSigningProviderKind;
	providerLabel: string;
	signature: `0x${string}`;
	keys: MetaAddressKeys;
	metaAddressHex: `0x${string}`;
};

function formatHex(bytes: Uint8Array) {
	return `0x${bytesToHex(bytes)}`;
}

export default function StealthLabPage() {
	const [snapshot, setSnapshot] = useState<DerivationSnapshot | null>(null);
	const [previousSnapshot, setPreviousSnapshot] = useState<DerivationSnapshot | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function deriveWithWallet() {
		setError(null);
		setStatus("Requesting wallet account...");

		try {
			const signingResult = await signStealthDerivationMessage();

			setStatus("Deriving stealth keys...");
			const keys = deriveKeysFromSignature(signingResult.signature, signingResult.chainId);
			const nextSnapshot: DerivationSnapshot = {
				account: signingResult.account,
				accountName: signingResult.accountName,
				chainId: signingResult.chainId,
				providerKind: signingResult.providerKind,
				providerLabel: signingResult.providerLabel,
				signature: signingResult.signature,
				keys,
				metaAddressHex: encodeMetaAddressHex(keys),
			};

			setPreviousSnapshot(snapshot);
			setSnapshot(nextSnapshot);
			setStatus("Derived keys successfully.");
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		}
	}

	const reproducible =
		snapshot &&
		previousSnapshot &&
		snapshot.account.toLowerCase() === previousSnapshot.account.toLowerCase() &&
		snapshot.chainId === previousSnapshot.chainId &&
		snapshot.metaAddressHex === previousSnapshot.metaAddressHex;

	return (
		<div className="space-y-8 animate-fade-in" data-testid="stealth-lab-page">
			<div className="space-y-3">
				<h1 className="page-title" data-testid="stealth-lab-heading">
					StealthPay{" "}
					<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
						Lab
					</span>
				</h1>
				<p className="text-text-secondary text-base leading-relaxed max-w-3xl">
					Hidden dev-only route for checking whether repeated wallet signatures are stable
					enough to drive stealth key derivation.
				</p>
			</div>

			<div className="card space-y-4">
				<p className="text-sm text-text-secondary">
					This route signs the fixed StealthPay derivation message with Pwallet through
					the host API when available, then falls back to an EIP-1193 wallet only for
					standalone local dev. It derives spending/viewing keys in the browser and checks
					whether repeated signing is actually stable for the same account and chain. The
					main StealthPay flow no longer relies on this because `sr25519` signatures are
					not stable enough for production key recovery.
				</p>

				<div className="flex flex-wrap gap-3">
					<button
						onClick={deriveWithWallet}
						className="btn-primary"
						data-testid="stealth-derive-button"
					>
						Connect and Derive
					</button>
				</div>

				{status ? (
					<p className="text-sm text-accent-blue" data-testid="stealth-status">
						{status}
					</p>
				) : null}
				{error ? (
					<p className="text-sm text-accent-red" data-testid="stealth-error">
						{error}
					</p>
				) : null}
				{reproducible ? (
					<p className="text-sm text-accent-green" data-testid="stealth-reproducible">
						Repeated signing matched the previous result for the same account and chain.
					</p>
				) : null}
				{snapshot && previousSnapshot && !reproducible ? (
					<p
						className="text-sm text-accent-yellow"
						data-testid="stealth-not-reproducible"
					>
						Repeated signing did not match the previous result for the same account and
						chain. This is why Register and Scan now use a dedicated stored stealth seed
						instead of deriving production keys from fresh wallet signatures.
					</p>
				) : null}
			</div>

			{snapshot ? (
				<div className="card space-y-4" data-testid="stealth-results">
					{snapshot.accountName ? (
						<LabRow
							label="Account Name"
							value={snapshot.accountName}
							testId="stealth-account-name"
						/>
					) : null}
					<LabRow
						label="Wallet Adapter"
						value={snapshot.providerLabel}
						testId="stealth-wallet-adapter"
					/>
					<LabRow label="Account" value={snapshot.account} testId="stealth-account" />
					<LabRow
						label="Chain ID"
						value={snapshot.chainId.toString()}
						testId="stealth-chain-id"
					/>
					<LabRow
						label="Signed Message"
						value={getStealthDerivationMessage(snapshot.chainId)}
						testId="stealth-signed-message"
					/>
					<LabRow
						label="Signature"
						value={snapshot.signature}
						testId="stealth-signature"
					/>
					<LabRow
						label="Spending Public Key"
						value={formatHex(snapshot.keys.spendingPubKey)}
						testId="stealth-spending-public-key"
					/>
					<LabRow
						label="Viewing Public Key"
						value={formatHex(snapshot.keys.viewingPubKey)}
						testId="stealth-viewing-public-key"
					/>
					<LabRow
						label="Meta-Address (66 bytes)"
						value={snapshot.metaAddressHex}
						testId="stealth-meta-address"
					/>
				</div>
			) : null}
		</div>
	);
}

function LabRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
	return (
		<div className="space-y-1" data-testid={testId}>
			<h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
				{label}
			</h3>
			<pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-text-primary">
				{value}
			</pre>
		</div>
	);
}
