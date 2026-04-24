import { useEffect, useState } from "react";
import QRCode from "qrcode";

type GiftQrCardProps = {
	claimLink: string;
	giftMode: "registered" | "bearer";
	onClose?: () => void;
	presentation?: boolean;
};

export function GiftQrCard({
	claimLink,
	giftMode,
	onClose,
	presentation = false,
}: GiftQrCardProps) {
	const [svg, setSvg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const isBearerGift = giftMode === "bearer";

	useEffect(() => {
		let cancelled = false;

		QRCode.toString(claimLink, {
			color: {
				dark: "#18372d",
				light: "#fffaf0",
			},
			errorCorrectionLevel: "M",
			margin: 3,
			type: "svg",
			width: presentation ? 400 : 220,
		})
			.then((value) => {
				if (!cancelled) {
					setSvg(value);
					setError(null);
				}
			})
			.catch((cause) => {
				console.error(cause);
				if (!cancelled) {
					setError("Could not render QR code for this gift link.");
				}
			});

		return () => {
			cancelled = true;
		};
	}, [claimLink, presentation]);

	return (
		<div
			className={
				presentation
					? "fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/85 p-4 backdrop-blur-xl"
					: "qr-gift-card"
			}
		>
			<div
				className={
					presentation
						? "w-full max-w-2xl rounded-[2rem] border border-white/20 bg-ivory-50 p-6 shadow-2xl md:p-8"
						: "space-y-4"
				}
			>
				<div className="flex items-start justify-between gap-4">
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<p className="eyebrow text-emerald-700">Scan to claim</p>
							<span
								className={
									isBearerGift
										? "rounded-full border border-coral-500/30 bg-coral-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-coral-800"
										: "rounded-full border border-emerald-900/15 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800"
								}
							>
								{isBearerGift ? "Bearer gift" : "Registered gift"}
							</span>
						</div>
						<h3 className="mt-2 font-display text-2xl font-semibold text-ink-950">
							{presentation ? "Scan this private gift" : "Private gift QR"}
						</h3>
						<p className="mt-2 text-sm leading-relaxed text-ink-700">
							{isBearerGift
								? "This QR is the gift until redeemed. Anyone who scans it before redemption can claim."
								: "This QR opens the same private claim flow as the share link."}
						</p>
					</div>
					{onClose ? (
						<button type="button" className="btn-secondary shrink-0" onClick={onClose}>
							Close
						</button>
					) : null}
				</div>

				<div
					className={
						presentation
							? "rounded-[1.7rem] border border-emerald-900/10 bg-[#fffaf0] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)]"
							: "rounded-[1.5rem] border border-emerald-900/10 bg-[#fffaf0] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)]"
					}
				>
					{svg ? (
						<div
							className="mx-auto flex max-w-[360px] justify-center"
							aria-label="QR code for private gift claim link"
							dangerouslySetInnerHTML={{ __html: svg }}
						/>
					) : error ? (
						<div className="rounded-2xl border border-coral-500/30 bg-coral-50 px-4 py-6 text-sm text-coral-800">
							{error}
						</div>
					) : (
						<div className="mx-auto h-[220px] max-w-[220px] animate-pulse rounded-2xl bg-emerald-900/10" />
					)}
				</div>

				{presentation ? (
					<div
						className={
							isBearerGift
								? "rounded-2xl border border-coral-500/20 bg-coral-50 px-4 py-3 text-sm text-coral-900"
								: "rounded-2xl border border-emerald-900/10 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
						}
					>
						{isBearerGift
							? "Bearer QR security: treat this like cash until the recipient claims it."
							: "Registered QR: opens the recipient-specific private claim flow."}
					</div>
				) : (
					<div className="rounded-2xl border border-ink-950/10 bg-white/55 px-4 py-3">
						<div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
							Encoded claim URL
						</div>
						<p className="mt-2 break-all font-mono text-xs text-ink-700">{claimLink}</p>
					</div>
				)}
			</div>
		</div>
	);
}
