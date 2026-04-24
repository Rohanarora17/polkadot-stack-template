import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatEther, isAddress, parseEther, type Address } from "viem";
import {
	connectInjectedExtension,
	getInjectedExtensions,
	type InjectedPolkadotAccount,
} from "polkadot-api/pjs-signer";
import { deployments } from "../config/deployments";
import { useStealthPayAccount } from "../hooks/useStealthPayAccount";
import { useHostWallet } from "../hooks/useHostWallet";
import { useChainStore } from "../store/chainStore";
import { buildClaimRouteLink } from "../utils/claimLinks";
import {
	listEmbeddedClaimWallets,
	type EmbeddedClaimWalletMetadata,
} from "../utils/embeddedWalletVault";
import {
	readPrivateWalletActivity,
	type PrivateClaimRecord,
	type PrivateGiftRecord,
	type PrivateWalletActivity,
} from "../utils/walletActivity";
import {
	clearWalletPreference,
	readWalletPreference,
	shortWalletAddress,
	writeWalletPreference,
} from "../utils/walletPreference";
import { useEmbeddedWalletProvider } from "../wallet/EmbeddedWalletContext";

type TimelineItem =
	| {
			at: number;
			kind: "gift";
			record: PrivateGiftRecord;
	  }
	| {
			at: number;
			kind: "claim";
			record: PrivateClaimRecord;
	  };

export default function WalletPage() {
	const connected = useChainStore((s) => s.connected);
	const blockNumber = useChainStore((s) => s.blockNumber);
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const pallets = useChainStore((s) => s.pallets);
	const embeddedProvider = useEmbeddedWalletProvider();
	const stealthAccount = useStealthPayAccount();
	const hostWallet = useHostWallet();
	const [activity, setActivity] = useState<PrivateWalletActivity>(() =>
		readPrivateWalletActivity(),
	);
	const [embeddedWallets, setEmbeddedWallets] = useState<EmbeddedClaimWalletMetadata[]>(() =>
		listEmbeddedClaimWallets(),
	);
	const [walletPreference, setWalletPreference] = useState(() => readWalletPreference());
	const [claimWalletBalance, setClaimWalletBalance] = useState<bigint | null>(null);
	const [claimWalletStatus, setClaimWalletStatus] = useState<string | null>(null);
	const [copyStatus, setCopyStatus] = useState<string | null>(null);
	const [transferTo, setTransferTo] = useState("");
	const [transferAmount, setTransferAmount] = useState("");
	const [transferError, setTransferError] = useState<string | null>(null);
	const [transferHash, setTransferHash] = useState<`0x${string}` | null>(null);
	const [transferStatus, setTransferStatus] = useState<string | null>(null);
	const [availableFundingWallets, setAvailableFundingWallets] = useState<string[]>([]);
	const [selectedFundingWallet, setSelectedFundingWallet] = useState("");
	const [fundingAccounts, setFundingAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const [selectedFundingAccount, setSelectedFundingAccount] = useState("");
	const [fundingConnectStatus, setFundingConnectStatus] = useState<string | null>(null);

	const reviveReady = pallets.revive === true;
	const displayedFundingWallet = stealthAccount.fundingWallet ?? walletPreference;
	const pendingGifts = useMemo(
		() => activity.gifts.filter((gift) => gift.status === "created"),
		[activity.gifts],
	);
	const claimedGifts = activity.claims;
	const timeline = useMemo<TimelineItem[]>(
		() =>
			[
				...activity.gifts.map((record) => ({
					at: record.createdAt,
					kind: "gift" as const,
					record,
				})),
				...activity.claims.map((record) => ({
					at: record.claimedAt,
					kind: "claim" as const,
					record,
				})),
			]
				.sort((a, b) => b.at - a.at)
				.slice(0, 8),
		[activity.claims, activity.gifts],
	);

	useEffect(() => {
		function refreshActivity() {
			setActivity(readPrivateWalletActivity());
			setEmbeddedWallets(listEmbeddedClaimWallets());
			setWalletPreference(readWalletPreference());
		}

		window.addEventListener("storage", refreshActivity);
		window.addEventListener("stealthpay-wallet-activity", refreshActivity);
		window.addEventListener("stealthpay-wallet-preference", refreshActivity);
		window.addEventListener("stealthpay-embedded-wallet-vault", refreshActivity);
		window.addEventListener("focus", refreshActivity);
		return () => {
			window.removeEventListener("storage", refreshActivity);
			window.removeEventListener("stealthpay-wallet-activity", refreshActivity);
			window.removeEventListener("stealthpay-wallet-preference", refreshActivity);
			window.removeEventListener("stealthpay-embedded-wallet-vault", refreshActivity);
			window.removeEventListener("focus", refreshActivity);
		};
	}, []);

	useEffect(() => {
		try {
			const wallets = getInjectedExtensions();
			setAvailableFundingWallets(wallets);
			setSelectedFundingWallet((current) => current || wallets[0] || "");
		} catch {
			setAvailableFundingWallets([]);
		}
	}, []);

	useEffect(() => {
		if (!selectedFundingWallet) {
			setFundingAccounts([]);
			setSelectedFundingAccount("");
			return;
		}

		let cancelled = false;
		async function loadFundingAccounts() {
			try {
				const extension = await connectInjectedExtension(selectedFundingWallet);
				const accounts = extension.getAccounts();
				extension.disconnect();
				if (cancelled) {
					return;
				}
				setFundingAccounts(accounts);
				setSelectedFundingAccount((current) =>
					accounts.some((account) => account.address === current)
						? current
						: (accounts[0]?.address ?? ""),
				);
			} catch (cause) {
				if (!cancelled) {
					setFundingAccounts([]);
					setSelectedFundingAccount("");
					setFundingConnectStatus(
						cause instanceof Error ? cause.message : String(cause),
					);
				}
			}
		}

		void loadFundingAccounts();
		return () => {
			cancelled = true;
		};
	}, [selectedFundingWallet]);

	useEffect(() => {
		let cancelled = false;

		async function refreshClaimWalletBalance() {
			if (!embeddedProvider.address) {
				setClaimWalletBalance(null);
				setClaimWalletStatus(
					embeddedProvider.available
						? "Sign in with email, Google, or passkey to open your StealthPay wallet."
						: "Set VITE_PRIVY_APP_ID to enable walletless private claims.",
				);
				return;
			}

			try {
				setClaimWalletStatus("Checking private claim wallet balance...");
				const balance = await embeddedProvider.getBalance(ethRpcUrl);
				if (!cancelled) {
					setClaimWalletBalance(balance);
					setClaimWalletStatus(null);
				}
			} catch (cause) {
				if (!cancelled) {
					setClaimWalletBalance(null);
					setClaimWalletStatus(cause instanceof Error ? cause.message : String(cause));
				}
			}
		}

		void refreshClaimWalletBalance();
		const timer = window.setInterval(refreshClaimWalletBalance, 20_000);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [embeddedProvider, ethRpcUrl]);

	async function copyClaimWalletAddress() {
		if (!embeddedProvider.address) {
			return;
		}
		await navigator.clipboard.writeText(embeddedProvider.address);
		setCopyStatus("Copied");
		window.setTimeout(() => setCopyStatus(null), 1800);
	}

	async function openClaimWallet() {
		setClaimWalletStatus("Opening StealthPay wallet...");
		try {
			await embeddedProvider.ensureAddress();
			setClaimWalletStatus(null);
		} catch (cause) {
			setClaimWalletStatus(cause instanceof Error ? cause.message : String(cause));
		}
	}

	async function connectFundingWallet() {
		if (!selectedFundingWallet) {
			setFundingConnectStatus("No browser wallet detected.");
			return;
		}
		const account = fundingAccounts.find(
			(candidate) => candidate.address === selectedFundingAccount,
		);
		if (!account) {
			setFundingConnectStatus("Choose a wallet account first.");
			return;
		}
		writeWalletPreference({ account, walletName: selectedFundingWallet });
		setWalletPreference(readWalletPreference());
		setFundingConnectStatus("Funding wallet connected.");
	}

	async function manageClaimWallet() {
		setClaimWalletStatus("Opening Privy wallet management...");
		try {
			await embeddedProvider.exportWallet();
			setClaimWalletStatus(null);
		} catch (cause) {
			setClaimWalletStatus(cause instanceof Error ? cause.message : String(cause));
		}
	}

	function disconnectSenderWallet() {
		clearWalletPreference();
		setWalletPreference(null);
	}

	async function disconnectClaimWallet() {
		setClaimWalletStatus("Disconnecting StealthPay wallet...");
		try {
			await embeddedProvider.logout();
			setClaimWalletBalance(null);
			setClaimWalletStatus("StealthPay wallet disconnected.");
		} catch (cause) {
			setClaimWalletStatus(cause instanceof Error ? cause.message : String(cause));
		}
	}

	async function signOutEverywhere() {
		setClaimWalletStatus("Signing out...");
		try {
			clearWalletPreference();
			setWalletPreference(null);
			await embeddedProvider.logout();
			setClaimWalletBalance(null);
			setClaimWalletStatus("Signed out.");
		} catch (cause) {
			setClaimWalletStatus(cause instanceof Error ? cause.message : String(cause));
		}
	}

	async function transferFromClaimWallet(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setTransferError(null);
		setTransferHash(null);
		if (!isAddress(transferTo)) {
			setTransferError("Enter a valid H160 destination address.");
			return;
		}

		let value: bigint;
		try {
			value = parseEther(transferAmount || "0");
		} catch {
			setTransferError("Enter a valid amount.");
			return;
		}
		if (value <= 0n) {
			setTransferError("Transfer amount must be greater than zero.");
			return;
		}

		try {
			setTransferStatus("Submitting transfer from StealthPay wallet...");
			const hash = await embeddedProvider.sendNativeTransfer({
				ethRpcUrl,
				to: transferTo as Address,
				value,
			});
			setTransferHash(hash);
			setTransferStatus("Transfer submitted.");
			setTransferAmount("");
			const balance = await embeddedProvider.getBalance(ethRpcUrl);
			setClaimWalletBalance(balance);
		} catch (cause) {
			setTransferStatus(null);
			setTransferError(cause instanceof Error ? cause.message : String(cause));
		}
	}

	return (
		<div className="space-y-8 animate-fade-in">
			<section className="gift-panel space-y-6">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
					<div className="max-w-3xl space-y-3">
						<span className="gift-chip">Private Wallet</span>
						<h1 className="page-title">
							Your StealthPay account.
						</h1>
						<p className="text-sm leading-relaxed text-text-secondary">
							Sign in or connect a wallet once, then send private gifts, claim
							received gifts, and move funds from one account home.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						{stealthAccount.connected ? (
							<button
								type="button"
								className="btn-secondary"
								onClick={() => void signOutEverywhere()}
							>
								Sign out
							</button>
						) : null}
						<Link to="/send" className="btn-primary">
							Send Gift
						</Link>
						<Link to="/gift" className="btn-secondary">
							Claim Gift
						</Link>
					</div>
				</div>

				<div className="grid gap-4 md:grid-cols-3">
					<WalletStat
						label="Claimable Gifts"
						value={pendingGifts.length.toString()}
						help={`${pendingGifts.length} UNIT pending in local gift history`}
					/>
					<WalletStat
						label="Claimed Gifts"
						value={claimedGifts.length.toString()}
						help="Private withdrawals completed from this browser"
					/>
					<WalletStat
						label="Private Flow"
						value={reviveReady ? "Available" : "Unavailable"}
						help={
							reviveReady
								? "Ready for pool deposits and private claims"
								: "Connect to a chain with pallet-revive"
						}
					/>
				</div>
			</section>

			<section className="card space-y-4">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="max-w-2xl">
						<p className="text-xs uppercase tracking-[0.16em] text-text-muted">
							Account
						</p>
						<h2 className="mt-2 text-3xl font-semibold text-text-primary font-display">
							{stealthAccount.connected ? stealthAccount.displayLabel : "Sign in or connect"}
						</h2>
						<p className="mt-2 text-sm text-text-secondary">
							StealthPay keeps the UX as one account. Behind the scenes, a social
							wallet receives walletless claims and the Dot.li top-bar P-wallet or a
							connected browser wallet can fund private gifts.
						</p>
					</div>
					<span className="paper-pill">{stealthAccount.statusLabel}</span>
				</div>

				<div className="grid gap-4 lg:grid-cols-2">
					<div className="paper-surface space-y-3">
						<div>
							<h3 className="text-sm font-semibold text-text-primary">
								Sign in with social
							</h3>
							<p className="mt-1 text-sm text-text-secondary">
								Creates or opens your recoverable StealthPay wallet for walletless
								claims and received funds.
							</p>
						</div>
						<div className="break-all font-mono text-xs text-text-secondary">
							{embeddedProvider.address ?? "No social wallet opened yet"}
						</div>
						<button type="button" className="btn-primary" onClick={openClaimWallet}>
							{embeddedProvider.address ? "Open social wallet" : "Sign in"}
						</button>
					</div>

					<div className="paper-surface space-y-3">
						<div>
							<h3 className="text-sm font-semibold text-text-primary">
								Connect wallet with funds
							</h3>
							<p className="mt-1 text-sm text-text-secondary">
								Use the Dot.li top-bar P-wallet or a browser wallet as the funding
								source for sending private gifts.
							</p>
						</div>
						{hostWallet.account ? (
							<div className="break-all font-mono text-xs text-text-secondary">
								P-wallet · {hostWallet.account.name ?? "Connected"} ·{" "}
								{hostWallet.account.address}
							</div>
						) : walletPreference ? (
							<div className="break-all font-mono text-xs text-text-secondary">
								{walletPreference.accountName ?? walletPreference.walletName} ·{" "}
								{walletPreference.accountAddress}
							</div>
						) : availableFundingWallets.length > 0 ? (
							<div className="grid gap-3 sm:grid-cols-2">
								<select
									className="input-field w-full"
									value={selectedFundingWallet}
									onChange={(event) => setSelectedFundingWallet(event.target.value)}
								>
									{availableFundingWallets.map((wallet) => (
										<option key={wallet} value={wallet}>
											{wallet}
										</option>
									))}
								</select>
								<select
									className="input-field w-full"
									value={selectedFundingAccount}
									onChange={(event) => setSelectedFundingAccount(event.target.value)}
								>
									{fundingAccounts.length === 0 ? (
										<option value="">No accounts returned</option>
									) : (
										fundingAccounts.map((account) => (
											<option key={account.address} value={account.address}>
												{account.name || "Unnamed"} ({shortWalletAddress(account.address)})
											</option>
										))
									)}
								</select>
							</div>
						) : (
							<p className="text-sm text-text-muted">
								No browser wallet extension detected. Social sign-in still lets you
								claim walletless gifts.
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							{hostWallet.account ? (
								<span className="paper-pill">Connected from Dot.li top bar</span>
							) : walletPreference ? (
								<button
									type="button"
									className="btn-secondary"
									onClick={disconnectSenderWallet}
								>
									Disconnect funding wallet
								</button>
							) : (
								<button
									type="button"
									className="btn-primary"
									onClick={connectFundingWallet}
									disabled={availableFundingWallets.length === 0}
								>
									Connect wallet
								</button>
							)}
						</div>
						{fundingConnectStatus ? (
							<p className="text-xs text-text-muted">{fundingConnectStatus}</p>
						) : null}
					</div>
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
				<div className="card space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-xs uppercase tracking-[0.16em] text-text-muted">
								Private balance
							</p>
							<h2 className="mt-2 text-4xl font-semibold text-text-primary font-display">
								{pendingGifts.length} UNIT
							</h2>
						</div>
						<div className="paper-pill">Local view</div>
					</div>
					<p className="text-sm leading-relaxed text-text-secondary">
						This demo balance is based on private gifts this browser knows about. It
						is intentionally labeled local until the full indexed private balance view
						is wired across every historical note.
					</p>
					<div className="grid gap-3">
						<WalletAction
							title="Find gifts for this wallet"
							description="Open the gift opener and continue into the guided private claim flow."
							to="/gift"
						/>
						<WalletAction
							title="Set up registered inbox"
							description="Optional: register a private inbox for stronger recurring gifts."
							to="/register"
						/>
					</div>
				</div>

				<div className="card space-y-4">
					<div className="flex items-center justify-between gap-4">
						<div>
							<h2 className="section-title">Claimable Gifts</h2>
							<p className="mt-1 text-sm text-text-secondary">
								Private gifts this browser remembers and has not marked claimed.
							</p>
						</div>
						<Link to="/send" className="btn-secondary shrink-0">
							New Gift
						</Link>
					</div>

					{pendingGifts.length === 0 ? (
						<EmptyState
							title="No local gifts waiting"
							description="Create a gift or open a shared gift link to populate this wallet home."
						/>
					) : (
						<div className="space-y-3">
							{pendingGifts.slice(0, 4).map((gift) => (
								<GiftRow key={gift.commitment} gift={gift} />
							))}
						</div>
					)}
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="card space-y-4">
					<h2 className="section-title">Claim History</h2>
					{timeline.length === 0 ? (
						<EmptyState
							title="No private wallet history yet"
							description="After you create or claim gifts, this becomes the private wallet timeline."
						/>
					) : (
						<div className="space-y-3">
							{timeline.map((item) =>
								item.kind === "gift" ? (
									<TimelineGift
										key={`gift-${item.record.commitment}`}
										gift={item.record}
									/>
								) : (
									<TimelineClaim
										key={`claim-${item.record.commitment}`}
										claim={item.record}
									/>
								),
							)}
						</div>
					)}
				</div>

				<div className="space-y-4">
					<div className="card space-y-3">
						<h2 className="section-title">Account Status</h2>
						<StatusLine
							label="Chain"
							value={connected ? "Connected" : "Offline"}
							tone={connected ? "good" : "muted"}
						/>
						<StatusLine
							label="Funding wallet"
							value={
								displayedFundingWallet
									? `${displayedFundingWallet.accountName ?? displayedFundingWallet.walletName} · ${shortWalletAddress(displayedFundingWallet.accountAddress)}`
									: "Not selected"
							}
							tone={displayedFundingWallet ? "good" : "warn"}
						/>
						{walletPreference && !hostWallet.account ? (
							<button
								type="button"
								className="btn-secondary w-full justify-center"
								onClick={disconnectSenderWallet}
							>
								Disconnect sender wallet
							</button>
						) : null}
						<StatusLine label="Latest block" value={`#${blockNumber}`} tone="muted" />
						<StatusLine
							label="Private contracts"
							value={reviveReady ? "Ready" : "Unavailable"}
							tone={reviveReady ? "good" : "warn"}
						/>
						<StatusLine
							label="StealthPay wallet"
							value={
								embeddedProvider.available
									? embeddedProvider.address
										? shortAddress(embeddedProvider.address)
										: "Social sign-in ready"
									: "Social sign-in not configured"
							}
							tone={embeddedProvider.available ? "good" : "warn"}
						/>
					</div>

					<div className="card space-y-3">
						<h2 className="section-title">StealthPay Wallet</h2>
						<p className="text-sm leading-relaxed text-text-secondary">
							Walletless gift funds land here after social sign-in. You can keep
							funds here, copy the address, transfer out, or open provider-managed
							recovery/export controls.
						</p>
						<div className="paper-surface space-y-3">
							<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div className="min-w-0">
									<p className="text-xs uppercase tracking-[0.16em] text-text-muted">
										StealthPay wallet address
									</p>
									<p className="mt-1 break-all font-mono text-sm text-text-primary">
										{embeddedProvider.address ?? "Not opened yet"}
									</p>
								</div>
								{embeddedProvider.address ? (
									<button
										type="button"
										className="btn-secondary shrink-0"
										onClick={copyClaimWalletAddress}
									>
										{copyStatus ?? "Copy address"}
									</button>
								) : (
									<button
										type="button"
										className="btn-primary shrink-0"
										onClick={openClaimWallet}
									>
										Sign in
									</button>
								)}
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<div>
									<p className="text-xs uppercase tracking-[0.16em] text-text-muted">
										Native balance
									</p>
									<p className="mt-1 text-2xl font-semibold text-text-primary font-display">
										{claimWalletBalance === null
											? "—"
											: `${trimBalance(formatEther(claimWalletBalance))} UNIT`}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-[0.16em] text-text-muted">
										Recovery
									</p>
									<p className="mt-1 text-sm text-text-secondary">
										{embeddedProvider.recoveryLabel}
									</p>
								</div>
							</div>
							{claimWalletStatus ? (
								<p className="text-xs text-text-muted">{claimWalletStatus}</p>
							) : null}
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									className="btn-secondary"
									disabled={!embeddedProvider.canExportWallet}
									onClick={manageClaimWallet}
								>
									Manage / export wallet
								</button>
								<Link to="/claim" className="btn-secondary">
									Open Claim Flow
								</Link>
							</div>
							{!embeddedProvider.canExportWallet ? (
								<p className="text-xs text-text-muted">
									Privy export appears after the embedded wallet is opened. Recovery is
									provider-managed; StealthPay cannot access the private key.
								</p>
							) : null}
							{embeddedProvider.address ? (
								<button
									type="button"
									className="btn-secondary"
									onClick={disconnectClaimWallet}
								>
									Disconnect social wallet
								</button>
							) : null}
						</div>

						<form className="paper-surface space-y-3" onSubmit={transferFromClaimWallet}>
							<div>
								<p className="text-xs uppercase tracking-[0.16em] text-text-muted">
									Transfer out
								</p>
								<p className="mt-1 text-sm text-text-secondary">
									Send funds from the StealthPay wallet to another H160 address when
									you want to spend elsewhere.
								</p>
							</div>
							<input
								className="input-field"
								placeholder="Destination 0x..."
								value={transferTo}
								onChange={(event) => setTransferTo(event.target.value)}
							/>
							<div className="flex flex-col gap-3 sm:flex-row">
								<input
									className="input-field"
									placeholder="Amount in UNIT"
									value={transferAmount}
									onChange={(event) => setTransferAmount(event.target.value)}
								/>
								<button
									type="submit"
									className="btn-primary shrink-0"
									disabled={!embeddedProvider.address}
								>
									Transfer
								</button>
							</div>
							{transferError ? (
								<p className="text-xs text-accent-coral">{transferError}</p>
							) : null}
							{transferStatus ? (
								<p className="text-xs text-text-muted">{transferStatus}</p>
							) : null}
							{transferHash ? (
								<p className="break-all font-mono text-xs text-text-secondary">
									Transaction {transferHash}
								</p>
							) : null}
						</form>

						{embeddedWallets.length > 0 ? (
							<div className="space-y-2">
								<p className="text-xs uppercase tracking-[0.16em] text-text-muted">
									Device-local fallback wallets
								</p>
								{embeddedWallets.map((wallet) => (
									<div key={wallet.id} className="paper-surface">
										<div className="text-sm font-medium text-text-primary">
											{wallet.label}
										</div>
										<div className="mt-1 break-all font-mono text-xs text-text-secondary">
											{wallet.address}
										</div>
										<div className="mt-2 text-xs text-text-muted">
											Legacy local fallback only. Privy is the main walletless
											claim wallet path.
										</div>
									</div>
								))}
							</div>
						) : (
							<p className="text-xs text-text-muted">
								No device-local fallback wallets saved in this browser.
							</p>
						)}
						<Link to="/advanced" className="btn-secondary inline-flex">
							Open Recovery Tools
						</Link>
					</div>
				</div>
			</section>
		</div>
	);
}

function WalletStat({ label, value, help }: { label: string; value: string; help: string }) {
	return (
		<div className="paper-surface p-5">
			<p className="text-xs uppercase tracking-[0.16em] text-text-muted">{label}</p>
			<p className="mt-2 text-3xl font-semibold text-text-primary font-display">{value}</p>
			<p className="mt-2 text-sm text-text-secondary">{help}</p>
		</div>
	);
}

function WalletAction({
	title,
	description,
	to,
}: {
	title: string;
	description: string;
	to: string;
}) {
	return (
		<Link to={to} className="paper-surface-hover block">
			<div className="font-medium text-text-primary">{title}</div>
			<div className="mt-1 text-sm text-text-secondary">{description}</div>
		</Link>
	);
}

function GiftRow({ gift }: { gift: PrivateGiftRecord }) {
	const claimHref = getGiftClaimHref(gift);

	return (
		<div className="paper-surface">
			<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="rounded-full border border-polka-700/15 bg-polka-50 px-2.5 py-1 text-xs font-semibold text-polka-700">
							{gift.giftMode === "bearer" ? "Walletless link" : "Registered wallet"}
						</span>
						<span className="text-xs text-text-muted">
							{formatDate(gift.createdAt)}
						</span>
					</div>
					<p className="mt-2 truncate text-sm font-medium text-text-primary">
						{gift.memoPreview || "Private gift"}
					</p>
					<p className="mt-1 text-xs text-text-muted">
						{gift.giftMode === "bearer"
							? "Shareable walletless gift"
							: `Recipient ${shortAddress(gift.recipientOwner ?? gift.recipientLabel)}`}
					</p>
					<p className="mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted">
						Gift ticket {shortFingerprint(gift.commitment)}
					</p>
				</div>
				{claimHref ? (
					<a href={claimHref} className="btn-secondary shrink-0">
						Claim
					</a>
				) : (
					<div className="max-w-[15rem] text-xs text-text-muted">
						Open the original private gift link or QR. This older local row does
						not contain the bearer claim key.
					</div>
				)}
			</div>
		</div>
	);
}

function getGiftClaimHref(gift: PrivateGiftRecord) {
	const registryAddress =
		gift.registryAddress ??
		(deployments.stealthPayPvm && isAddress(deployments.stealthPayPvm)
			? deployments.stealthPayPvm
			: null);

	if (!registryAddress) {
		return null;
	}

	if (gift.giftMode === "bearer") {
		if (!gift.bearerGiftKey) {
			return null;
		}
		return buildClaimRouteLink({
			giftKey: gift.bearerGiftKey,
			memoHash: gift.memoHash,
			mode: "bearer",
			poolAddress: gift.poolAddress,
			registryAddress,
			transactionHash: gift.transactionHash,
		});
	}

	const recipientOwner =
		gift.recipientOwner ?? (isAddress(gift.recipientLabel) ? gift.recipientLabel : null);

	if (!recipientOwner) {
		return null;
	}

	return buildClaimRouteLink({
		mode: "registered",
		memoHash: gift.memoHash,
		poolAddress: gift.poolAddress,
		recipientOwner,
		registryAddress,
		transactionHash: gift.transactionHash,
	});
}

function TimelineGift({ gift }: { gift: PrivateGiftRecord }) {
	return (
		<TimelineRow
			detail={
				gift.giftMode === "bearer"
					? "Walletless gift link created"
					: `Registered gift for ${shortAddress(gift.recipientOwner ?? gift.recipientLabel)}`
			}
			meta={formatDate(gift.createdAt)}
			status={gift.status === "claimed" ? "Claimed" : "Waiting"}
			title={gift.memoPreview || "Private gift created"}
		/>
	);
}

function TimelineClaim({ claim }: { claim: PrivateClaimRecord }) {
	return (
		<TimelineRow
			detail={`Delivered to ${shortAddress(claim.destination)} through the private relayer path`}
			meta={formatDate(claim.claimedAt)}
			status="Claimed"
			title={claim.memoPreview || "Gift claimed privately"}
		/>
	);
}

function TimelineRow({
	title,
	detail,
	meta,
	status,
}: {
	title: string;
	detail: string;
	meta: string;
	status: string;
}) {
	return (
		<div className="paper-surface">
			<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0">
					<p className="text-sm font-medium text-text-primary">{title}</p>
					<p className="mt-1 truncate text-xs text-text-muted">{detail}</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<span className="paper-pill">{status}</span>
					<span className="text-xs text-text-muted">{meta}</span>
				</div>
			</div>
		</div>
	);
}

function EmptyState({ title, description }: { title: string; description: string }) {
	return (
		<div className="paper-dashed">
			<p className="font-medium text-text-primary">{title}</p>
			<p className="mt-1 text-sm text-text-secondary">{description}</p>
		</div>
	);
}

function StatusLine({
	label,
	value,
	tone,
}: {
	label: string;
	value: string;
	tone: "good" | "muted" | "warn";
}) {
	const toneClass =
		tone === "good"
			? "text-accent-green"
			: tone === "warn"
				? "text-accent-yellow"
				: "text-text-secondary";

	return (
		<div className="paper-surface flex items-center justify-between gap-4 px-4 py-3">
			<span className="text-sm text-text-muted">{label}</span>
			<span className={`text-sm font-medium ${toneClass}`}>{value}</span>
		</div>
	);
}

function formatDate(timestamp: number) {
	return new Intl.DateTimeFormat(undefined, {
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		month: "short",
	}).format(new Date(timestamp));
}

function shortAddress(value: string) {
	if (!value) {
		return "unknown";
	}
	if (!isAddress(value)) {
		return value.length > 22 ? `${value.slice(0, 18)}...` : value;
	}
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortFingerprint(value: string) {
	return `${value.slice(2, 8)}-${value.slice(-6)}`;
}

function trimBalance(value: string) {
	const [whole, fraction = ""] = value.split(".");
	const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");
	return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}
