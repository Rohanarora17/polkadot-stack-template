import { useEffect, useMemo, useState } from "react";
import { bytesToHex } from "@noble/hashes/utils.js";
import { stack_template } from "@polkadot-api/descriptors";
import { Binary } from "polkadot-api";
import type { InjectedPolkadotAccount } from "polkadot-api/pjs-signer";
import { type Address, encodeFunctionData } from "viem";

import { deployments } from "../config/deployments";
import { getPublicClient } from "../config/evm";
import { stealthPayAbi } from "../config/stealthPay";
import { deriveKeysFromSeed, encodeMetaAddressHex, type MetaAddressKeys } from "../crypto/stealth";
import { getClient } from "../hooks/useChain";
import { devAccounts } from "../hooks/useAccount";
import { useChainStore } from "../store/chainStore";
import {
	DEFAULT_STORAGE_DEPOSIT_LIMIT,
	DEFAULT_WEIGHT_LIMIT,
	ensureMappedForRevive,
	resolveReviveAddress,
	toReviveDest,
} from "../utils/stealthRevive";
import { formatDispatchError } from "../utils/format";
import {
	createBrowserExtensionTxSession,
	createDevTxSession,
	createPwalletTxSession,
	getBrowserExtensionAccounts,
	listBrowserExtensions,
	type RegisterWalletMode,
	type TransactionWalletSession,
} from "../wallet/stealthRegister";
import { resolveStealthSeed, type ResolvedStealthSeed } from "../utils/stealthSeed";

const REGISTER_STORAGE_KEY_PREFIX = "stealthpay-register-address";

type RegistrationSnapshot = {
	keys: MetaAddressKeys;
	metaAddressHex: `0x${string}`;
	seed: ResolvedStealthSeed;
	session: TransactionWalletSession;
};

type RegistrationReadback = {
	blockNumber: bigint;
	hasMetaAddress: boolean;
	matchesExpected: boolean;
	owner: Address;
	storedMetaAddressHex: `0x${string}`;
};

function formatHex(bytes: Uint8Array) {
	return `0x${bytesToHex(bytes)}` as const;
}

function normalizeHex(value: string) {
	return value.toLowerCase();
}

function scopedStorageKey(ethRpcUrl: string) {
	return `${REGISTER_STORAGE_KEY_PREFIX}:${ethRpcUrl}`;
}

export default function RegisterPage() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const [walletMode, setWalletMode] = useState<RegisterWalletMode>("pwallet-host");
	const [devAccountIndex, setDevAccountIndex] = useState(0);
	const [availableExtensionWallets, setAvailableExtensionWallets] = useState<string[]>([]);
	const [selectedExtensionWallet, setSelectedExtensionWallet] = useState("");
	const [extensionAccounts, setExtensionAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const [selectedExtensionAccount, setSelectedExtensionAccount] = useState("");
	const [contractAddress, setContractAddress] = useState("");
	const [importSeedHex, setImportSeedHex] = useState("");
	const [snapshot, setSnapshot] = useState<RegistrationSnapshot | null>(null);
	const [readback, setReadback] = useState<RegistrationReadback | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const defaultAddress = deployments.stealthPayPvm ?? "";
	const storageKey = useMemo(() => scopedStorageKey(ethRpcUrl), [ethRpcUrl]);

	useEffect(() => {
		setContractAddress(localStorage.getItem(storageKey) || defaultAddress);
	}, [defaultAddress, storageKey]);

	useEffect(() => {
		const wallets = listBrowserExtensions();
		setAvailableExtensionWallets(wallets);
		setSelectedExtensionWallet((current) =>
			current && wallets.includes(current) ? current : (wallets[0] ?? ""),
		);
	}, []);

	useEffect(() => {
		if (walletMode !== "browser-extension" || !selectedExtensionWallet) {
			setExtensionAccounts([]);
			setSelectedExtensionAccount("");
			return;
		}

		let cancelled = false;

		async function loadExtensionAccounts() {
			try {
				const accounts = await getBrowserExtensionAccounts(selectedExtensionWallet);
				if (cancelled) {
					return;
				}

				setExtensionAccounts(accounts);
				setSelectedExtensionAccount((current) =>
					current && accounts.some((account) => account.address === current)
						? current
						: (accounts[0]?.address ?? ""),
				);
			} catch (cause) {
				console.error(cause);
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause));
					setExtensionAccounts([]);
					setSelectedExtensionAccount("");
				}
			}
		}

		void loadExtensionAccounts();

		return () => {
			cancelled = true;
		};
	}, [walletMode, selectedExtensionWallet]);

	function saveContractAddress(value: string) {
		setContractAddress(value);
		if (value) {
			localStorage.setItem(storageKey, value);
		} else {
			localStorage.removeItem(storageKey);
		}
	}

	async function deriveKeys() {
		setError(null);
		setReadback(null);
		setStatus("Connecting signer and loading the dedicated StealthPay seed...");

		try {
			const session =
				walletMode === "pwallet-host"
					? await createPwalletTxSession()
					: walletMode === "browser-extension"
						? await createBrowserExtensionTxSession({
								walletName: selectedExtensionWallet,
								accountAddress: selectedExtensionAccount || undefined,
							})
						: await createDevTxSession(devAccountIndex);

			const seed = resolveStealthSeed({
				importedSeedHex: importSeedHex,
				session,
			});
			const keys = deriveKeysFromSeed(seed.seedBytes, session.chainId);
			setSnapshot({
				keys,
				metaAddressHex: encodeMetaAddressHex(keys),
				seed,
				session,
			});
			const seedStatus =
				seed.source === "generated"
					? "Generated and stored a new dedicated stealth seed."
					: seed.source === "imported"
						? "Imported and stored the provided stealth seed."
						: "Loaded the existing stored stealth seed.";
			setStatus(`${seedStatus} Derived the spending and viewing keys from that seed.`);
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		}
	}

	async function registerMetaAddress() {
		if (!snapshot) {
			setError("Derive keys first.");
			return;
		}

		if (!contractAddress) {
			setError("Enter the PVM StealthPay contract address first.");
			return;
		}

		setSubmitting(true);
		setError(null);
		setReadback(null);

		try {
			const publicClient = getPublicClient(ethRpcUrl);
			const code = await publicClient.getCode({ address: contractAddress as Address });
			if (!code || code === "0x") {
				throw new Error(`No contract code found at ${contractAddress} on ${ethRpcUrl}.`);
			}

			const typedApi = getClient(wsUrl).getTypedApi(stack_template);

			setStatus("Ensuring the signer account is mapped for Revive contract calls...");
			await ensureMappedForRevive({
				wsUrl,
				txSigner: snapshot.session.txSigner,
			});

			const data = encodeFunctionData({
				abi: stealthPayAbi,
				functionName: "setMetaAddress",
				args: [
					formatHex(snapshot.keys.spendingPubKey),
					formatHex(snapshot.keys.viewingPubKey),
				],
			});
			const reviveDest = toReviveDest(contractAddress as `0x${string}`) as Parameters<
				typeof typedApi.tx.Revive.call
			>[0]["dest"];

			setStatus("Submitting Revive.call(setMetaAddress)...");
			const result = await typedApi.tx.Revive.call({
				dest: reviveDest,
				value: 0n,
				weight_limit: DEFAULT_WEIGHT_LIMIT,
				storage_deposit_limit: DEFAULT_STORAGE_DEPOSIT_LIMIT,
				data: Binary.fromHex(data),
			}).signAndSubmit(snapshot.session.txSigner);

			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}

			const blockNumber = BigInt(result.block.number);
			setStatus(`Included in block #${result.block.number}. Loading contract readback...`);

			const owner = await resolveReviveAddress({
				wsUrl,
				originSs58: snapshot.session.originSs58,
			});

			const loadedReadback = await loadReadback({
				contractAddress: contractAddress as Address,
				ethRpcUrl,
				expectedMetaAddressHex: snapshot.metaAddressHex,
				owner,
				blockNumber,
			});

			setReadback(loadedReadback);
			setStatus("Meta-address registered and read back successfully.");
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="space-y-8 animate-fade-in" data-testid="register-page">
			<div className="space-y-3">
				<h1 className="page-title" data-testid="register-heading">
					StealthPay{" "}
					<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
						Register
					</span>
				</h1>
				<p className="text-text-secondary text-base leading-relaxed max-w-3xl">
					Load or create a dedicated stealth seed in the browser, derive the recipient
					meta-address from that seed, then register it on the PVM StealthPay contract
					through{" "}
					<code className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-xs font-mono">
						Revive.call
					</code>{" "}
					using a Substrate signer. The seed is stored per signer and chain so Register
					and Scan reuse the same stealth keys instead of relying on non-deterministic
					wallet signatures.
				</p>
			</div>

			<div className="card space-y-5">
				<div className="space-y-2">
					<label className="label">Registration Signer</label>
					<div className="flex flex-wrap gap-2">
						<ToggleButton
							active={walletMode === "pwallet-host"}
							onClick={() => setWalletMode("pwallet-host")}
							label="Pwallet / Host"
						/>
						<ToggleButton
							active={walletMode === "dev-account"}
							onClick={() => setWalletMode("dev-account")}
							label="Local Dev Signer"
						/>
						<ToggleButton
							active={walletMode === "browser-extension"}
							onClick={() => setWalletMode("browser-extension")}
							label="Browser Extension"
						/>
					</div>
					<p className="text-xs text-text-muted">
						Pwallet host, browser extension wallets, and the local dev signer are kept
						as separate paths on purpose. QR-paired Pwallet is a different integration
						from injected extension wallets.
					</p>
				</div>

				{walletMode === "browser-extension" ? (
					<>
						<div>
							<label className="label">Extension Wallet</label>
							<select
								value={selectedExtensionWallet}
								onChange={(event) => setSelectedExtensionWallet(event.target.value)}
								className="input-field w-full"
								disabled={availableExtensionWallets.length === 0}
							>
								{availableExtensionWallets.length === 0 ? (
									<option value="">No browser extension wallets detected</option>
								) : (
									availableExtensionWallets.map((walletName) => (
										<option key={walletName} value={walletName}>
											{walletName}
										</option>
									))
								)}
							</select>
						</div>

						<div>
							<label className="label">Extension Account</label>
							<select
								value={selectedExtensionAccount}
								onChange={(event) =>
									setSelectedExtensionAccount(event.target.value)
								}
								className="input-field w-full"
								disabled={extensionAccounts.length === 0}
							>
								{extensionAccounts.length === 0 ? (
									<option value="">
										No accounts returned by the selected wallet
									</option>
								) : (
									extensionAccounts.map((account) => (
										<option key={account.address} value={account.address}>
											{account.name ?? "Unnamed"} ({account.address})
										</option>
									))
								)}
							</select>
						</div>
					</>
				) : null}

				{walletMode === "dev-account" ? (
					<div>
						<label className="label">Dev Signer</label>
						<select
							value={devAccountIndex}
							onChange={(event) => setDevAccountIndex(Number(event.target.value))}
							className="input-field w-full"
						>
							{devAccounts.map((account, index) => (
								<option key={account.address} value={index}>
									{account.name} ({account.address})
								</option>
							))}
						</select>
					</div>
				) : null}

				<div>
					<label className="label">Optional Stealth Seed Import</label>
					<textarea
						value={importSeedHex}
						onChange={(event) => setImportSeedHex(event.target.value)}
						placeholder="0x... (64 hex bytes, only needed to restore a previous seed)"
						className="input-field min-h-28 w-full font-mono text-xs"
						data-testid="register-import-seed"
					/>
					<p className="mt-2 text-xs text-text-muted">
						Leave this empty to reuse the stored seed for this signer and chain, or to
						generate a new one on first registration.
					</p>
				</div>

				<div>
					<label className="label">StealthPay PVM Contract Address</label>
					<div className="flex gap-2">
						<input
							type="text"
							value={contractAddress}
							onChange={(event) => saveContractAddress(event.target.value)}
							placeholder="0x..."
							className="input-field flex-1"
							data-testid="register-contract-address"
						/>
						{defaultAddress && contractAddress !== defaultAddress ? (
							<button
								onClick={() => saveContractAddress(defaultAddress)}
								className="btn-secondary text-xs whitespace-nowrap"
							>
								Reset
							</button>
						) : null}
					</div>
				</div>

				<div className="flex flex-wrap gap-3">
					<button
						onClick={deriveKeys}
						className="btn-primary"
						data-testid="register-derive-button"
					>
						Derive Keys
					</button>
					<button
						onClick={registerMetaAddress}
						className="btn-secondary"
						disabled={!snapshot || submitting}
						data-testid="register-submit-button"
					>
						{submitting ? "Registering..." : "Register Meta-Address"}
					</button>
				</div>

				{status ? (
					<p className="text-sm text-accent-blue" data-testid="register-status">
						{status}
					</p>
				) : null}
				{error ? (
					<p className="text-sm text-accent-red" data-testid="register-error">
						{error}
					</p>
				) : null}
			</div>

			{snapshot ? (
				<div className="card space-y-4" data-testid="register-derived-state">
					<RegisterRow
						label="Wallet Adapter"
						value={snapshot.session.providerLabel}
						testId="register-provider-label"
					/>
					<RegisterRow
						label="Origin SS58"
						value={snapshot.session.originSs58}
						testId="register-origin"
					/>
					{snapshot.session.accountName ? (
						<RegisterRow label="Account Name" value={snapshot.session.accountName} />
					) : null}
					<RegisterRow
						label="Chain ID"
						value={snapshot.session.chainId.toString()}
						testId="register-chain-id"
					/>
					<RegisterRow
						label="Stealth Seed Source"
						value={snapshot.seed.source}
						testId="register-seed-source"
					/>
					<RegisterRow
						label="Stealth Seed Backup"
						value={snapshot.seed.record.seedHex}
						testId="register-stealth-seed"
					/>
					<RegisterRow
						label="Spending Public Key"
						value={formatHex(snapshot.keys.spendingPubKey)}
						testId="register-spending-public-key"
					/>
					<RegisterRow
						label="Viewing Public Key"
						value={formatHex(snapshot.keys.viewingPubKey)}
						testId="register-viewing-public-key"
					/>
					<RegisterRow
						label="Encoded Meta-Address"
						value={snapshot.metaAddressHex}
						testId="register-meta-address"
					/>
				</div>
			) : null}

			{readback ? (
				<div className="card space-y-4" data-testid="register-readback">
					<RegisterRow
						label="Owner (H160)"
						value={readback.owner}
						testId="register-owner"
					/>
					<RegisterRow
						label="Readback Meta-Address"
						value={readback.storedMetaAddressHex}
						testId="register-readback-meta-address"
					/>
					<RegisterRow
						label="Registration Block"
						value={readback.blockNumber.toString()}
						testId="register-readback-block"
					/>
					<p
						className={
							readback.hasMetaAddress && readback.matchesExpected
								? "text-sm text-accent-green"
								: "text-sm text-accent-yellow"
						}
						data-testid="register-readback-status"
					>
						{readback.hasMetaAddress && readback.matchesExpected
							? "Contract readback matches the derived meta-address."
							: "The contract stored a meta-address, but it did not match the derived value."}
					</p>
				</div>
			) : null}
		</div>
	);
}

function ToggleButton({
	active,
	label,
	onClick,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={
				active
					? "rounded-lg border border-polka-500/35 bg-polka-500/15 px-3 py-1.5 text-sm font-medium text-white"
					: "rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
			}
		>
			{label}
		</button>
	);
}

function RegisterRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
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

async function loadReadback({
	blockNumber,
	contractAddress,
	ethRpcUrl,
	expectedMetaAddressHex,
	owner,
}: {
	blockNumber: bigint;
	contractAddress: Address;
	ethRpcUrl: string;
	expectedMetaAddressHex: `0x${string}`;
	owner: Address;
}): Promise<RegistrationReadback> {
	const publicClient = getPublicClient(ethRpcUrl);
	const [hasMetaAddress, storedMetaAddressHex] = await Promise.all([
		publicClient.readContract({
			address: contractAddress,
			abi: stealthPayAbi,
			functionName: "hasMetaAddress",
			args: [owner],
		}),
		publicClient.readContract({
			address: contractAddress,
			abi: stealthPayAbi,
			functionName: "metaAddressOf",
			args: [owner],
		}),
	]);

	return {
		blockNumber,
		hasMetaAddress,
		matchesExpected:
			normalizeHex(storedMetaAddressHex) === normalizeHex(expectedMetaAddressHex),
		owner,
		storedMetaAddressHex,
	};
}
