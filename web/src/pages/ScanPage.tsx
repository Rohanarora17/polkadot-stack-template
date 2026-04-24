import { useEffect, useMemo, useState } from "react";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { InjectedPolkadotAccount } from "polkadot-api/pjs-signer";
import { type Address } from "viem";

import { deployments } from "../config/deployments";
import { getPublicClient, getWalletClientForPrivateKey } from "../config/evm";
import { stealthPayAbi } from "../config/stealthPay";
import { decryptTextMemo, ZERO_MEMO_HASH } from "../crypto/memo";
import {
	deriveKeysFromSeed,
	encodeMetaAddressHex,
	type HexString,
	type MetaAddressKeys,
} from "../crypto/stealth";
import { devAccounts } from "../hooks/useAccount";
import { fetchFromBulletinByHash } from "../hooks/useBulletin";
import { useChainStore } from "../store/chainStore";
import { formatPlanck, resolveReviveAddress } from "../utils/stealthRevive";
import {
	matchAnnouncements,
	type AnnouncementCandidate,
	type MatchedAnnouncement,
} from "../utils/stealthScan";
import { computeWithdrawValue } from "../utils/stealthWithdraw";
import { scanRuntimeAnnouncements } from "../utils/runtimeAnnouncementScan";
import {
	createBrowserExtensionTxSession,
	createDevTxSession,
	createPwalletTxSession,
	getBrowserExtensionAccounts,
	listBrowserExtensions,
	type RegisterWalletMode,
	type TransactionWalletSession,
} from "../wallet/stealthRegister";
import { requireStealthSeed, type ResolvedStealthSeed } from "../utils/stealthSeed";
import { readWalletPreference, writeWalletPreference } from "../utils/walletPreference";
import { isPolkadotHostEnvironment } from "../utils/hostEnvironment";

const SCAN_STORAGE_KEY_PREFIX = "stealthpay-scan-address";
const DEFAULT_SCAN_DEPTH = "1000";

type ScanSnapshot = {
	keys: MetaAddressKeys;
	metaAddressHex: HexString;
	ownerAddress: Address;
	seed: ResolvedStealthSeed;
	session: TransactionWalletSession;
};

type ScanReadback = {
	fromBlock: bigint;
	latestBlock: bigint;
	matched: Array<
		MatchedAnnouncement & {
			bulletinCid: string | null;
			memoStatus: "none" | "decrypted" | "fetch-failed" | "decrypt-failed";
			memoText: string | null;
			memoError: string | null;
			stealthBalance: bigint;
		}
	>;
	note: string | null;
	scanSource: string;
	totalAnnouncements: number;
};

type WithdrawalState = {
	amountPlanck?: bigint;
	destination?: Address;
	error?: string | null;
	feePlanck?: bigint;
	gasLimit?: bigint;
	gasPrice?: bigint;
	status?: string | null;
	transactionHash?: HexString;
};

function scopedStorageKey(ethRpcUrl: string) {
	return `${SCAN_STORAGE_KEY_PREFIX}:${ethRpcUrl}`;
}

function isAddress(value: string): value is Address {
	return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function formatHex(bytes: Uint8Array) {
	return `0x${bytesToHex(bytes)}` as const;
}

function parseScanDepth(input: string) {
	const trimmed = input.trim();
	if (!/^\d+$/.test(trimmed)) {
		throw new Error("Scan depth must be a positive integer block count.");
	}

	const depth = BigInt(trimmed);
	if (depth === 0n) {
		throw new Error("Scan depth must be greater than zero.");
	}

	return depth;
}

const announcementEvent = stealthPayAbi[8];

export default function ScanPage() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const [walletMode, setWalletMode] = useState<RegisterWalletMode>(() =>
		isPolkadotHostEnvironment() ? "pwallet-host" : "browser-extension",
	);
	const [devAccountIndex, setDevAccountIndex] = useState(0);
	const [availableExtensionWallets, setAvailableExtensionWallets] = useState<string[]>([]);
	const [selectedExtensionWallet, setSelectedExtensionWallet] = useState("");
	const [extensionAccounts, setExtensionAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const [selectedExtensionAccount, setSelectedExtensionAccount] = useState("");
	const [contractAddress, setContractAddress] = useState("");
	const [importSeedHex, setImportSeedHex] = useState("");
	const [scanDepthInput, setScanDepthInput] = useState(DEFAULT_SCAN_DEPTH);
	const [withdrawDestination, setWithdrawDestination] = useState("");
	const [snapshot, setSnapshot] = useState<ScanSnapshot | null>(null);
	const [readback, setReadback] = useState<ScanReadback | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [scanning, setScanning] = useState(false);
	const [withdrawals, setWithdrawals] = useState<Record<string, WithdrawalState>>({});

	const defaultAddress = deployments.stealthPayPvm ?? "";
	const storageKey = useMemo(() => scopedStorageKey(ethRpcUrl), [ethRpcUrl]);

	useEffect(() => {
		setContractAddress(localStorage.getItem(storageKey) || defaultAddress);
	}, [defaultAddress, storageKey]);

	useEffect(() => {
		const wallets = listBrowserExtensions();
		const preferred = readWalletPreference();
		setAvailableExtensionWallets(wallets);
		setSelectedExtensionWallet((current) =>
			current && wallets.includes(current)
				? current
				: preferred?.walletName && wallets.includes(preferred.walletName)
					? preferred.walletName
					: (wallets[0] ?? ""),
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
				const preferred = readWalletPreference();
				setSelectedExtensionAccount((current) =>
					current && accounts.some((account) => account.address === current)
						? current
						: preferred?.walletName === selectedExtensionWallet &&
							  accounts.some((account) => account.address === preferred.accountAddress)
							? preferred.accountAddress
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

	useEffect(() => {
		if (walletMode !== "browser-extension" || !selectedExtensionWallet) {
			return;
		}
		const account =
			extensionAccounts.find((candidate) => candidate.address === selectedExtensionAccount) ??
			null;
		writeWalletPreference({ account, walletName: selectedExtensionWallet });
	}, [extensionAccounts, selectedExtensionAccount, selectedExtensionWallet, walletMode]);

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
		setWithdrawals({});
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

			const seed = requireStealthSeed({
				importedSeedHex: importSeedHex,
				session,
			});
			const keys = deriveKeysFromSeed(seed.seedBytes, session.chainId);
			const ownerAddress = (await resolveReviveAddress({
				wsUrl,
				originSs58: session.originSs58,
			})) as Address;
			setSnapshot({
				keys,
				metaAddressHex: encodeMetaAddressHex(keys),
				ownerAddress,
				seed,
				session,
			});
			setWithdrawDestination(ownerAddress);
			setStatus(
				seed.source === "imported"
					? "Imported the stealth seed and derived the recipient keys. Ready to scan."
					: "Loaded the stored stealth seed and derived the recipient keys. Ready to scan.",
			);
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		}
	}

	function withdrawalKey(match: Pick<MatchedAnnouncement, "nonce" | "transactionHash">) {
		return `${match.transactionHash}:${match.nonce.toString()}`;
	}

	async function withdrawMatch(match: ScanReadback["matched"][number]) {
		if (!snapshot) {
			setError("Derive recipient keys first.");
			return;
		}

		if (!withdrawDestination || !isAddress(withdrawDestination)) {
			setError("Enter a valid withdraw destination address.");
			return;
		}

		const key = withdrawalKey(match);
		setWithdrawals((current) => ({
			...current,
			[key]: {
				destination: withdrawDestination as Address,
				error: null,
				status: "Estimating a native transfer from the recovered stealth account...",
			},
		}));
		setError(null);

		try {
			const publicClient = getPublicClient(ethRpcUrl);
			const gasPrice = await publicClient.getGasPrice();
			let gasLimit = 21_000n;

			try {
				gasLimit = await publicClient.estimateGas({
					account: match.stealthAddress,
					to: withdrawDestination as Address,
					value: 1n,
				});
			} catch {
				gasLimit = 21_000n;
			}

			const plan = computeWithdrawValue({
				balance: match.stealthBalance,
				gasLimit,
				gasPrice,
			});
			const privateKeyHex = formatHex(match.stealthPrivateKey);
			const walletClient = await getWalletClientForPrivateKey(privateKeyHex, ethRpcUrl);

			setWithdrawals((current) => ({
				...current,
				[key]: {
					amountPlanck: plan.transferValue,
					destination: withdrawDestination as Address,
					error: null,
					feePlanck: plan.fee,
					gasLimit: plan.gasLimit,
					gasPrice: plan.gasPrice,
					status: "Submitting a withdrawal signed by the recovered stealth private key...",
				},
			}));

			const transactionHash = (await walletClient.sendTransaction({
				to: withdrawDestination as Address,
				value: plan.transferValue,
				gas: plan.gasLimit,
				gasPrice: plan.gasPrice,
			})) as HexString;

			setWithdrawals((current) => ({
				...current,
				[key]: {
					amountPlanck: plan.transferValue,
					destination: withdrawDestination as Address,
					error: null,
					feePlanck: plan.fee,
					gasLimit: plan.gasLimit,
					gasPrice: plan.gasPrice,
					status: "Waiting for withdrawal confirmation...",
					transactionHash,
				},
			}));

			await publicClient.waitForTransactionReceipt({
				hash: transactionHash,
			});

			const updatedStealthBalance = await publicClient.getBalance({
				address: match.stealthAddress as Address,
			});

			setReadback((current) =>
				current
					? {
							...current,
							matched: current.matched.map((entry) =>
								withdrawalKey(entry) === key
									? { ...entry, stealthBalance: updatedStealthBalance }
									: entry,
							),
						}
					: current,
			);
			setWithdrawals((current) => ({
				...current,
				[key]: {
					amountPlanck: plan.transferValue,
					destination: withdrawDestination as Address,
					error: null,
					feePlanck: plan.fee,
					gasLimit: plan.gasLimit,
					gasPrice: plan.gasPrice,
					status: "Withdrawal confirmed and the stealth balance was refreshed.",
					transactionHash,
				},
			}));
		} catch (cause) {
			console.error(cause);
			setWithdrawals((current) => ({
				...current,
				[key]: {
					...(current[key] ?? {}),
					destination: withdrawDestination as Address,
					error: cause instanceof Error ? cause.message : String(cause),
					status: null,
				},
			}));
		}
	}

	async function scanPayments() {
		if (!snapshot) {
			setError("Derive keys first.");
			return;
		}

		if (!contractAddress || !isAddress(contractAddress)) {
			setError("Enter a valid PVM StealthPay contract address.");
			return;
		}

		setScanning(true);
		setError(null);
		setReadback(null);

		try {
			const publicClient = getPublicClient(ethRpcUrl);
			const latestBlock = await publicClient.getBlockNumber();
			const scanDepth = parseScanDepth(scanDepthInput);
			const fromBlock = latestBlock >= scanDepth ? latestBlock - scanDepth + 1n : 0n;
			const announcementCount = await publicClient.readContract({
				address: contractAddress as Address,
				abi: stealthPayAbi,
				functionName: "announcementCount",
			});
			let announcements: AnnouncementCandidate[] = [];
			let effectiveFromBlock = fromBlock;
			let effectiveLatestBlock = latestBlock;
			let scanSource = "eth-rpc logs";
			let note: string | null = null;

			setStatus(`Scanning StealthPay Announcement logs from block ${fromBlock}...`);

			const logs = await publicClient.getLogs({
				address: contractAddress as Address,
				event: announcementEvent,
				fromBlock,
				toBlock: latestBlock,
			});

			announcements = logs.flatMap((log) => {
				const { args, blockNumber, transactionHash } = log;
				if (
					args.schemeId !== 1n ||
					!args.sender ||
					!args.stealthAddress ||
					!args.ephemeralPubKey ||
					args.viewTag === undefined ||
					!args.memoHash ||
					args.nonce === undefined ||
					blockNumber === null ||
					!transactionHash
				) {
					return [];
				}

				return [
					{
						blockNumber,
						ephemeralPubKey: args.ephemeralPubKey,
						memoHash: args.memoHash,
						nonce: args.nonce,
						sender: args.sender,
						stealthAddress: args.stealthAddress,
						transactionHash,
						viewTag: Number(args.viewTag),
					},
				];
			});

			if (announcementCount > 0n && announcements.length === 0) {
				setStatus(
					`eth-rpc returned no Announcement logs, so ScanPage is falling back to direct Revive.ContractEmitted decoding over the local Substrate node...`,
				);
				const runtimeFallback = await scanRuntimeAnnouncements({
					contractAddress: contractAddress as Address,
					requestedFromBlock: fromBlock,
					toBlock: latestBlock,
					wsUrl,
				});

				announcements = runtimeFallback.announcements;
				effectiveFromBlock = runtimeFallback.fromBlock;
				effectiveLatestBlock = runtimeFallback.toBlock;
				scanSource = "runtime fallback (Revive.ContractEmitted)";
				note = runtimeFallback.truncatedByPrunedState
					? `Local Substrate state was only available from block ${runtimeFallback.fromBlock.toString()} onward, so older blocks were skipped.`
					: "eth-rpc did not expose Announcement logs for Revive.call, so the scan used direct runtime events instead.";
			}

			if (announcementCount > 0n && announcements.length === 0) {
				throw new Error(
					`StealthPay reports ${announcementCount.toString()} announcement(s), but neither eth-rpc logs nor the runtime fallback produced decodable Announcement events in the scanned range.`,
				);
			}

			const matched = matchAnnouncements(snapshot.keys, announcements);
			const [balances, memoResults] = await Promise.all([
				Promise.all(
					matched.map((entry) =>
						publicClient.getBalance({
							address: entry.stealthAddress as Address,
						}),
					),
				),
				Promise.all(
					matched.map(async (entry) => {
						if (entry.memoHash === ZERO_MEMO_HASH) {
							return {
								bulletinCid: null,
								memoError: null,
								memoStatus: "none" as const,
								memoText: null,
							};
						}

						try {
							const fetched = await fetchFromBulletinByHash(entry.memoHash);
							try {
								const decrypted = decryptTextMemo(
									entry.sharedSecret,
									fetched.bytes,
								);
								return {
									bulletinCid: fetched.cid,
									memoError: null,
									memoStatus: "decrypted" as const,
									memoText: decrypted.plaintext,
								};
							} catch (cause) {
								return {
									bulletinCid: fetched.cid,
									memoError:
										cause instanceof Error ? cause.message : String(cause),
									memoStatus: "decrypt-failed" as const,
									memoText: null,
								};
							}
						} catch (cause) {
							return {
								bulletinCid: null,
								memoError: cause instanceof Error ? cause.message : String(cause),
								memoStatus: "fetch-failed" as const,
								memoText: null,
							};
						}
					}),
				),
			]);

			setReadback({
				fromBlock: effectiveFromBlock,
				latestBlock: effectiveLatestBlock,
				matched: matched.map((entry, index) => ({
					...entry,
					bulletinCid: memoResults[index]?.bulletinCid ?? null,
					memoError: memoResults[index]?.memoError ?? null,
					memoStatus: memoResults[index]?.memoStatus ?? "none",
					memoText: memoResults[index]?.memoText ?? null,
					stealthBalance: balances[index] ?? 0n,
				})),
				note,
				scanSource,
				totalAnnouncements: announcements.length,
			});
			setStatus(
				matched.length === 0
					? `Scanned ${announcements.length} announcements via ${scanSource} and found no recipient matches.`
					: `Scanned ${announcements.length} announcements via ${scanSource} and found ${matched.length} recipient match${matched.length === 1 ? "" : "es"}.`,
			);
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		} finally {
			setScanning(false);
		}
	}

	return (
		<div className="space-y-8 animate-fade-in" data-testid="scan-page">
			<div className="space-y-3">
				<h1 className="page-title" data-testid="scan-heading">
					StealthPay{" "}
					<span className="bg-gradient-to-r from-polka-400 to-polka-600 bg-clip-text text-transparent">
						Public Recovery
					</span>
				</h1>
				<p className="text-text-secondary text-base leading-relaxed max-w-3xl">
					This is the advanced non-private recovery flow. Load the dedicated stealth seed
					used during registration, derive the recipient view and spend keys locally, read
					recent{" "}
					<code className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-xs font-mono">
						Announcement
					</code>{" "}
					logs from the PVM StealthPay contract, and recover funds from the public stealth
					account path when you are not using the relayed private-withdraw flow.
				</p>
			</div>

			<div className="card space-y-5">
				<div className="space-y-2">
					<label className="label">Recipient Signer</label>
					<div className="flex flex-wrap gap-2">
						<ToggleButton
							active={walletMode === "pwallet-host"}
							onClick={() => setWalletMode("pwallet-host")}
							label="Pwallet / Host"
						/>
						<ToggleButton
							active={walletMode === "browser-extension"}
							onClick={() => setWalletMode("browser-extension")}
							label="Browser Extension"
						/>
						<ToggleButton
							active={walletMode === "dev-account"}
							onClick={() => setWalletMode("dev-account")}
							label="Local Dev Signer"
						/>
					</div>
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
						placeholder="0x... (only needed when restoring a seed onto a new browser)"
						className="input-field min-h-28 w-full font-mono text-xs"
						data-testid="scan-import-seed"
					/>
					<p className="mt-2 text-xs text-text-muted">
						If this browser already has the stored seed for the selected signer and
						chain, leave this empty. Otherwise import the seed you exported during
						registration.
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
							data-testid="scan-contract-address"
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

				<div>
					<label className="label">Recent Blocks To Scan</label>
					<input
						type="text"
						value={scanDepthInput}
						onChange={(event) => setScanDepthInput(event.target.value)}
						placeholder={DEFAULT_SCAN_DEPTH}
						className="input-field w-full"
						data-testid="scan-depth-input"
					/>
					<p className="mt-2 text-xs text-text-muted">
						The scan prefers `eth-rpc` logs. On the local stack, if `Revive.call` events
						are missing from `eth_getLogs`, it falls back to decoding recent
						`Revive.ContractEmitted` runtime events directly from the Substrate node.
					</p>
				</div>

				<div>
					<label className="label">Withdraw Destination</label>
					<input
						type="text"
						value={withdrawDestination}
						onChange={(event) => setWithdrawDestination(event.target.value)}
						placeholder="0x... (defaults to the recipient owner H160)"
						className="input-field w-full"
						data-testid="scan-withdraw-destination"
					/>
					<p className="mt-2 text-xs text-text-muted">
						Matched stealth balances can be withdrawn directly from the recovered
						stealth private key to this destination. The current implementation
						withdraws the full spendable balance after subtracting the transfer fee.
					</p>
				</div>

				<div className="flex flex-wrap gap-3">
					<button
						onClick={deriveKeys}
						className="btn-primary"
						data-testid="scan-derive-button"
					>
						Derive Recipient Keys
					</button>
					<button
						onClick={scanPayments}
						className="btn-secondary"
						disabled={!snapshot || scanning}
						data-testid="scan-run-button"
					>
						{scanning ? "Scanning..." : "Scan Announcements"}
					</button>
				</div>

				{status ? (
					<p className="text-sm text-accent-blue" data-testid="scan-status">
						{status}
					</p>
				) : null}
				{error ? (
					<p className="text-sm text-accent-red" data-testid="scan-error">
						{error}
					</p>
				) : null}
			</div>

			{snapshot ? (
				<div className="card space-y-4" data-testid="scan-derived-state">
					<ScanRow label="Wallet Adapter" value={snapshot.session.providerLabel} />
					<ScanRow label="Origin SS58" value={snapshot.session.originSs58} />
					{snapshot.session.accountName ? (
						<ScanRow label="Account Name" value={snapshot.session.accountName} />
					) : null}
					<ScanRow label="Chain ID" value={snapshot.session.chainId.toString()} />
					<ScanRow label="Stealth Seed Source" value={snapshot.seed.source} />
					<ScanRow label="Stealth Seed Backup" value={snapshot.seed.record.seedHex} />
					<ScanRow label="Recipient Owner (H160)" value={snapshot.ownerAddress} />
					<ScanRow label="Derived Meta-Address" value={snapshot.metaAddressHex} />
				</div>
			) : null}

			{readback ? (
				<div className="space-y-6" data-testid="scan-readback">
					<div className="card space-y-4">
						<ScanRow label="Scan Source" value={readback.scanSource} />
						<ScanRow label="Scanned From Block" value={readback.fromBlock.toString()} />
						<ScanRow label="Scanned To Block" value={readback.latestBlock.toString()} />
						<ScanRow
							label="Announcements Considered"
							value={readback.totalAnnouncements.toString()}
						/>
						<ScanRow label="Matches Found" value={readback.matched.length.toString()} />
						{readback.note ? <ScanRow label="Note" value={readback.note} /> : null}
					</div>

					{readback.matched.length === 0 ? null : (
						<div className="space-y-4">
							{readback.matched.map((match, index) => {
								const withdrawal = withdrawals[withdrawalKey(match)];
								const withdrawing =
									withdrawal?.status ===
										"Submitting a withdrawal signed by the recovered stealth private key..." ||
									withdrawal?.status === "Waiting for withdrawal confirmation...";

								return (
									<div
										key={`${match.transactionHash}-${match.nonce.toString()}`}
										className="card space-y-4"
										data-testid={`scan-match-${index}`}
									>
										<ScanRow label="Sender" value={match.sender} />
										<ScanRow
											label="Announcement Transaction"
											value={match.transactionHash}
										/>
										<ScanRow
											label="Announcement Block"
											value={match.blockNumber.toString()}
										/>
										<ScanRow
											label="Announcement Nonce"
											value={match.nonce.toString()}
										/>
										<ScanRow
											label="Announced Stealth Address"
											value={match.stealthAddress}
										/>
										<ScanRow
											label="Derived Address From Scan"
											value={match.derivedAddress}
										/>
										<ScanRow
											label="Recovered Address From Stealth Private Key"
											value={match.recoveredAddress}
										/>
										<ScanRow
											label="Current Stealth Balance"
											value={formatPlanck(match.stealthBalance)}
										/>
										<ScanRow
											label="Ephemeral Public Key"
											value={match.ephemeralPubKey}
										/>
										<ScanRow
											label="View Tag"
											value={match.viewTag.toString()}
										/>
										<ScanRow label="Memo Hash" value={match.memoHash} />
										<ScanRow label="Memo Status" value={match.memoStatus} />
										{match.bulletinCid ? (
											<ScanRow
												label="Bulletin CID"
												value={match.bulletinCid}
											/>
										) : null}
										{match.memoText ? (
											<ScanRow
												label="Decrypted Memo"
												value={match.memoText}
											/>
										) : null}
										{match.memoError ? (
											<ScanRow label="Memo Error" value={match.memoError} />
										) : null}
										<ScanRow
											label="Shared Secret"
											value={formatHex(match.sharedSecret)}
										/>
										<div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
											<h3 className="text-sm font-medium text-text-primary">
												Withdraw
											</h3>
											<p className="text-xs text-text-muted">
												Use the recovered stealth private key to send the
												full spendable balance from this one-time stealth
												account to the destination above.
											</p>
											<div className="flex flex-wrap gap-3">
												<button
													onClick={() => withdrawMatch(match)}
													className="btn-secondary"
													disabled={
														match.stealthBalance === 0n || withdrawing
													}
													data-testid={`withdraw-match-${index}`}
												>
													{withdrawing
														? "Withdrawing..."
														: "Withdraw Spendable Balance"}
												</button>
											</div>
											{withdrawal?.destination ? (
												<ScanRow
													label="Withdraw Destination"
													value={withdrawal.destination}
												/>
											) : null}
											{withdrawal?.amountPlanck !== undefined ? (
												<ScanRow
													label="Withdraw Amount"
													value={formatPlanck(withdrawal.amountPlanck)}
												/>
											) : null}
											{withdrawal?.feePlanck !== undefined ? (
												<ScanRow
													label="Estimated Fee"
													value={formatPlanck(withdrawal.feePlanck)}
												/>
											) : null}
											{withdrawal?.transactionHash ? (
												<ScanRow
													label="Withdraw Transaction"
													value={withdrawal.transactionHash}
												/>
											) : null}
											{withdrawal?.status ? (
												<p className="text-sm text-accent-blue">
													{withdrawal.status}
												</p>
											) : null}
											{withdrawal?.error ? (
												<p className="text-sm text-accent-red">
													{withdrawal.error}
												</p>
											) : null}
										</div>
										<p
											className="text-sm text-accent-green"
											data-testid={`scan-match-status-${index}`}
										>
											This announcement matched the derived recipient keys and
											the recovered stealth private key maps back to the same
											stealth address.
										</p>
									</div>
								);
							})}
						</div>
					)}
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

function ScanRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="space-y-1">
			<h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
				{label}
			</h3>
			<pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-text-primary">
				{value}
			</pre>
		</div>
	);
}
