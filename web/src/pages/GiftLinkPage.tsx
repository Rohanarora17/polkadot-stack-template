import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { buildClaimRouteLinkFromSearch, parseClaimLinkSearch } from "../utils/claimLinks";
import { listBrowserExtensions } from "../wallet/stealthRegister";

function maskAddress(value: string | null) {
	if (!value) {
		return "Unknown recipient";
	}
	return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export default function GiftLinkPage() {
	const location = useLocation();
	const hint = useMemo(() => parseClaimLinkSearch(location.search), [location.search]);
	const isBearerGift = hint.mode === "bearer";
	const hasGiftContext =
		Boolean(hint.poolAddress) &&
		Boolean(hint.registryAddress) &&
		(isBearerGift
			? Boolean(hint.memoHash) && Boolean(hint.giftKey)
			: Boolean(hint.recipientOwner));
	const claimHref = hasGiftContext ? buildClaimRouteLinkFromSearch(location.search) : "#/claim";
	const advancedClaimHref = hasGiftContext ? `#/withdraw${location.search}` : "#/withdraw";
	const [linkCopied, setLinkCopied] = useState(false);
	const canNativeShare =
		typeof navigator !== "undefined" && typeof navigator.share === "function";
	const hasExtensionWallets = listBrowserExtensions().length > 0;
	const shouldReopenInWalletBrowser = hasGiftContext && !isBearerGift && !hasExtensionWallets;
	const isCompactDevice =
		typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;

	const environmentNote = hasExtensionWallets
		? null
		: isCompactDevice
			? "This browser does not expose a wallet extension right now. Copy this gift link and reopen it in a desktop browser or wallet-enabled browser to claim."
			: "No browser extension wallet was detected here. Copy this gift link and reopen it in a browser with your recipient wallet extension installed.";

	async function copyGiftLink() {
		await navigator.clipboard.writeText(window.location.href);
		setLinkCopied(true);
	}

	async function shareGiftLink() {
		if (!canNativeShare) {
			return;
		}
		await navigator.share({
			title: "Private gift",
			text: "Open this private gift in StealthPay.",
			url: window.location.href,
		});
	}

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="gift-panel space-y-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="space-y-3 max-w-3xl">
						<span className="gift-chip">
							{hasGiftContext ? "Private gift received" : "Gift link"}
						</span>
						<h1 className="page-title">Someone sent you a private gift</h1>
						<p className="text-sm text-text-secondary">
							{isBearerGift
								? "This walletless gift link can create a fresh private claim wallet for you. Keep the link private until you claim."
								: "This link opens a private claim flow powered by StealthPay. Your gift is claimed through the privacy pool and relayer rather than appearing as a direct public payment to your wallet."}
						</p>
					</div>
					<div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-4 min-w-[220px]">
						<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
							Gift size
						</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">1 UNIT</div>
						<p className="mt-2 text-sm text-text-secondary">
							Open the gift to connect the recipient wallet and continue privately.
						</p>
					</div>
				</div>

				{hasGiftContext ? (
					<div className="grid gap-3 md:grid-cols-3">
						<div className="gift-step">
							<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
								Recipient hint
							</div>
							<div className="mt-2 text-sm font-medium text-text-primary">
								{isBearerGift
									? "No wallet needed yet"
									: maskAddress(hint.recipientOwner)}
							</div>
							<p className="mt-2 text-sm text-text-secondary">
								{isBearerGift
									? "The app will create a fresh local claim wallet before withdrawal."
									: "This link is intended for the wallet that matches the hidden private claim."}
							</p>
						</div>
						<div className="gift-step">
							<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
								Private claim
							</div>
							<div className="mt-2 text-sm font-medium text-text-primary">
								{isBearerGift
									? "Create wallet and claim"
									: "Claim through the relayer"}
							</div>
							<p className="mt-2 text-sm text-text-secondary">
								{isBearerGift
									? "You will save the generated wallet before the gift is claimed."
									: "The app will guide the recipient wallet directly into the private claim flow."}
							</p>
						</div>
						<div className="gift-step">
							<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
								Privacy
							</div>
							<div className="mt-2 text-sm font-medium text-text-primary">
								No direct sender-to-wallet transfer
							</div>
							<p className="mt-2 text-sm text-text-secondary">
								The public chain sees pool interactions instead of a simple public
								payment trail.
							</p>
						</div>
					</div>
				) : (
					<div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-text-secondary">
						This gift link is missing some required context. You can still open the
						private claim flow directly or use advanced claim tools if needed.
					</div>
				)}

				{environmentNote ? (
					<div className="rounded-xl border border-accent-yellow/20 bg-accent-yellow/10 px-4 py-4 text-sm text-accent-yellow">
						<div className="font-semibold">Wallet browser needed</div>
						<p className="mt-1 text-text-secondary">{environmentNote}</p>
					</div>
				) : null}

				<div className="flex flex-wrap gap-3">
					{shouldReopenInWalletBrowser ? (
						<button type="button" className="btn-primary" onClick={copyGiftLink}>
							{linkCopied ? "Gift Link Copied" : "Copy and Reopen"}
						</button>
					) : (
						<a href={claimHref} className="btn-primary">
							{hasGiftContext
								? isBearerGift
									? "Create Private Wallet and Claim"
									: "Open Gift"
								: "Open Claim Tools"}
						</a>
					)}
					{canNativeShare ? (
						<button type="button" className="btn-secondary" onClick={shareGiftLink}>
							Share Gift Link
						</button>
					) : null}
					{shouldReopenInWalletBrowser ? (
						<a href={claimHref} className="btn-secondary">
							Continue Here Anyway
						</a>
					) : (
						<button type="button" className="btn-secondary" onClick={copyGiftLink}>
							{linkCopied ? "Gift Link Copied" : "Copy Gift Link"}
						</button>
					)}
					<a href={advancedClaimHref} className="btn-secondary">
						Recovery Tools
					</a>
				</div>
			</div>
		</div>
	);
}
