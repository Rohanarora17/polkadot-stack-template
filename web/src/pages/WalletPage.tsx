import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useChainStore } from "../store/chainStore";
import {
	readPrivateWalletActivity,
	type PrivateClaimRecord,
	type PrivateGiftRecord,
	type PrivateWalletActivity,
} from "../utils/walletActivity";

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
	const pallets = useChainStore((s) => s.pallets);
	const [activity, setActivity] = useState<PrivateWalletActivity>(() =>
		readPrivateWalletActivity(),
	);

	const reviveReady = pallets.revive === true;
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
		}

		window.addEventListener("storage", refreshActivity);
		window.addEventListener("stealthpay-wallet-activity", refreshActivity);
		window.addEventListener("focus", refreshActivity);
		return () => {
			window.removeEventListener("storage", refreshActivity);
			window.removeEventListener("stealthpay-wallet-activity", refreshActivity);
			window.removeEventListener("focus", refreshActivity);
		};
	}, []);

	return (
		<div className="space-y-8 animate-fade-in">
			<section className="gift-panel space-y-6">
				<div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
					<div className="max-w-3xl space-y-3">
						<span className="gift-chip">Private Wallet</span>
						<h1 className="page-title">
							Your private gifts, balance, and claim history in one place.
						</h1>
						<p className="text-sm leading-relaxed text-text-secondary">
							This is the user-facing wallet home. It unifies the private gift links
							created in this browser, gifts claimed through the relayer, and the
							recovery actions needed before StealthPay becomes a full private balance
							wallet.
						</p>
					</div>
					<div className="flex flex-wrap gap-3">
						<Link to="/send" className="btn-primary">
							Send Gift
						</Link>
						<Link to="/claim" className="btn-secondary">
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
								? "pallet-revive detected on the connected chain"
								: "Connect to a chain with pallet-revive"
						}
					/>
				</div>
			</section>

			<section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
				<div className="card space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<p className="text-xs uppercase tracking-[0.16em] text-text-muted">
								Private balance
							</p>
							<h2 className="mt-2 text-4xl font-semibold text-white font-display">
								{pendingGifts.length} UNIT
							</h2>
						</div>
						<div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-text-secondary">
							Local view
						</div>
					</div>
					<p className="text-sm leading-relaxed text-text-secondary">
						This is a browser-local estimate from gifts created or opened here. It does
						not yet scan every possible note for your master wallet automatically.
					</p>
					<div className="grid gap-3">
						<WalletAction
							title="Find gifts for this wallet"
							description="Open the guided claim flow and scan for private gifts that belong to your wallet."
							to="/claim"
						/>
						<WalletAction
							title="Set up or restore wallet"
							description="Register or restore the master stealth identity used for registered-recipient gifts."
							to="/register"
						/>
					</div>
				</div>

				<div className="card space-y-4">
					<div className="flex items-center justify-between gap-4">
						<div>
							<h2 className="section-title">Claimable Gifts</h2>
							<p className="mt-1 text-sm text-text-secondary">
								Private gifts that were created in this browser and have not been
								marked claimed.
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
						<h2 className="section-title">Wallet Status</h2>
						<StatusLine
							label="Chain"
							value={connected ? "Connected" : "Offline"}
							tone={connected ? "good" : "muted"}
						/>
						<StatusLine label="Latest block" value={`#${blockNumber}`} tone="muted" />
						<StatusLine
							label="Private contracts"
							value={reviveReady ? "Ready" : "Unavailable"}
							tone={reviveReady ? "good" : "warn"}
						/>
					</div>

					<div className="card space-y-3">
						<h2 className="section-title">Recovery</h2>
						<p className="text-sm leading-relaxed text-text-secondary">
							Walletless gifts require an encrypted recovery file because the fresh
							claim wallet is generated locally. Registered gifts require the master
							stealth wallet identity.
						</p>
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
		<div className="rounded-2xl border border-white/[0.08] bg-black/15 p-5">
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
		<Link
			to={to}
			className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 transition-colors hover:border-polka-400/30 hover:bg-white/[0.05]"
		>
			<div className="font-medium text-text-primary">{title}</div>
			<div className="mt-1 text-sm text-text-secondary">{description}</div>
		</Link>
	);
}

function GiftRow({ gift }: { gift: PrivateGiftRecord }) {
	return (
		<div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
			<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="rounded-full bg-polka-500/10 px-2.5 py-1 text-xs font-medium text-polka-200">
							{gift.giftMode === "bearer" ? "Walletless link" : "Registered wallet"}
						</span>
						<span className="text-xs text-text-muted">
							{formatDate(gift.createdAt)}
						</span>
					</div>
					<p className="mt-2 truncate text-sm font-medium text-text-primary">
						{gift.memoPreview || "Private gift"}
					</p>
					<p className="mt-1 truncate font-mono text-xs text-text-muted">
						{gift.transactionHash ?? gift.commitment}
					</p>
				</div>
				<Link to="/claim" className="btn-secondary shrink-0">
					Claim
				</Link>
			</div>
		</div>
	);
}

function TimelineGift({ gift }: { gift: PrivateGiftRecord }) {
	return (
		<TimelineRow
			detail={`${gift.giftMode === "bearer" ? "Walletless gift link" : "Registered gift"} · ${gift.recipientLabel}`}
			meta={formatDate(gift.createdAt)}
			status={gift.status === "claimed" ? "Claimed" : "Waiting"}
			title={gift.memoPreview || "Private gift created"}
		/>
	);
}

function TimelineClaim({ claim }: { claim: PrivateClaimRecord }) {
	return (
		<TimelineRow
			detail={`Claimed to ${shortAddress(claim.destination)} via ${claim.relayer ? shortAddress(claim.relayer) : "relayer"}`}
			meta={formatDate(claim.claimedAt)}
			status="Private withdraw"
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
		<div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
			<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0">
					<p className="text-sm font-medium text-text-primary">{title}</p>
					<p className="mt-1 truncate text-xs text-text-muted">{detail}</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-text-secondary">
						{status}
					</span>
					<span className="text-xs text-text-muted">{meta}</span>
				</div>
			</div>
		</div>
	);
}

function EmptyState({ title, description }: { title: string; description: string }) {
	return (
		<div className="rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] p-5">
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
		<div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
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
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
