import { useEffect, useState } from "react";
import { useChainStore } from "../store/chainStore";
import { useConnection } from "../hooks/useConnection";
import { getClient } from "../hooks/useChain";
import {
	LOCAL_ETH_RPC_URL,
	LOCAL_WS_URL,
	getNetworkPresetEndpoints,
	type NetworkPreset,
} from "../config/network";
import { isPolkadotHostEnvironment } from "../utils/hostEnvironment";

export default function HomePage() {
	const { wsUrl, ethRpcUrl, setEthRpcUrl, connected, blockNumber, pallets } = useChainStore();
	const { connect } = useConnection();
	const [urlInput, setUrlInput] = useState(wsUrl);
	const [ethRpcInput, setEthRpcInput] = useState(ethRpcUrl);
	const [error, setError] = useState<string | null>(null);
	const [chainName, setChainName] = useState<string | null>(null);
	const [connecting, setConnecting] = useState(false);

	useEffect(() => {
		setUrlInput(wsUrl);
	}, [wsUrl]);

	useEffect(() => {
		setEthRpcInput(ethRpcUrl);
	}, [ethRpcUrl]);

	useEffect(() => {
		if (!connected) {
			return;
		}

		if (isPolkadotHostEnvironment()) {
			setChainName("Polkadot Hub TestNet via host API");
			return;
		}

		getClient(wsUrl)
			.getChainSpecData()
			.then((data) => setChainName(data.name))
			.catch(() => {});
	}, [connected, wsUrl]);

	async function handleConnect() {
		setConnecting(true);
		setError(null);
		setChainName(null);
		try {
			const result = await connect(urlInput);
			if (result?.ok && result.chain) {
				setChainName(result.chain.name);
			}
		} catch (e) {
			setError(`Could not connect to ${urlInput}. Is the chain running?`);
			console.error(e);
		} finally {
			setConnecting(false);
		}
	}

	function applyPreset(preset: NetworkPreset) {
		const endpoints = getNetworkPresetEndpoints(preset);
		setUrlInput(endpoints.wsUrl);
		setEthRpcInput(endpoints.ethRpcUrl);
		setEthRpcUrl(endpoints.ethRpcUrl);
	}

	return (
		<div className="space-y-10 animate-fade-in">
			<section className="brand-panel overflow-hidden">
				<div className="grid gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
					<div className="space-y-7">
						<div className="flex flex-wrap items-center gap-2">
							<span className="gift-chip">StealthPay</span>
							<span className="rounded-full border border-emerald-900/10 bg-white/45 px-3 py-1 text-xs font-semibold text-ink-700">
								Private gifts on Polkadot
							</span>
						</div>

						<div className="space-y-5">
							<h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-tight text-ink-950 md:text-7xl">
								Private gifts,
								<span className="block text-coral-800">claimed like magic.</span>
							</h1>
							<p className="max-w-2xl text-lg leading-relaxed text-ink-700 md:text-xl">
								Send value into a privacy pool, share a secure gift link or QR, and
								let the recipient claim without a direct public sender-to-recipient
								trail.
							</p>
						</div>

						<div className="flex flex-wrap gap-3">
							<a href="#/send" className="btn-primary px-5 py-3">
								Create private gift
							</a>
							<a href="#/gift" className="btn-secondary px-5 py-3">
								Open received gift
							</a>
							<a href="#/wallet" className="btn-secondary px-5 py-3">
								View private wallet
							</a>
						</div>

						<div className="grid gap-3 sm:grid-cols-3">
							<TrustBadge title="Private by default" detail="Pool-based claim path" />
							<TrustBadge title="Walletless claim" detail="Link or QR onboarding" />
							<TrustBadge
								title="No direct trail"
								detail="Sender to pool, pool to claim"
							/>
						</div>
					</div>

					<div className="sealed-gift-card">
						<div className="rounded-[1.5rem] border border-emerald-900/10 bg-white/55 p-5">
							<div className="flex items-start justify-between gap-4">
								<div>
									<p className="eyebrow text-coral-800">Private gift ticket</p>
									<h2 className="mt-2 font-display text-3xl font-semibold text-ink-950">
										1 UNIT
									</h2>
								</div>
								<div className="dark-emerald-surface rounded-2xl bg-emerald-900 px-4 py-3 text-right">
									<p className="surface-muted text-[10px] uppercase tracking-[0.18em]">
										Status
									</p>
									<p className="mt-1 text-sm font-semibold">Sealed</p>
								</div>
							</div>

							<div className="my-5 border-t border-dashed border-emerald-900/20" />

							<div className="space-y-3">
								<JourneyLine label="Sender" value="Funds a private pool note" />
								<JourneyLine label="Share" value="Link or QR becomes the gift" />
								<JourneyLine label="Recipient" value="Claims through relayer" />
							</div>

							<div className="mt-5 rounded-2xl border border-coral-500/20 bg-coral-50 px-4 py-3 text-sm text-coral-800">
								The QR and link carry the same claim capability. For walletless
								gifts, keep them private until redeemed.
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-3">
				<ProductCard
					kicker="01"
					title="Compose a gift"
					description="Choose a registered private wallet or make a walletless bearer gift for someone who has not onboarded yet."
				/>
				<ProductCard
					kicker="02"
					title="Share the claim"
					description="Send a polished gift link or QR card. The encrypted note stays in storage; the link opens the claim flow."
				/>
				<ProductCard
					kicker="03"
					title="Claim privately"
					description="The recipient claims through a relayer-backed withdrawal, so the public story is pool activity, not a direct payment."
				/>
			</section>

			<section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
				<div className="card space-y-4">
					<p className="eyebrow text-emerald-700">Two gift modes</p>
					<h2 className="page-title">Designed for real recipients.</h2>
					<p className="text-sm leading-relaxed text-text-secondary">
						Registered gifts are the strongest targeted privacy path. Walletless gifts
						win onboarding: the recipient can start from a link or QR and claim into an
						recoverable StealthPay wallet.
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<ModeCard
						title="Private wallet gift"
						tag="Strongest targeting"
						description="Encrypt the claim to a recipient who has registered a StealthPay private inbox."
					/>
					<ModeCard
						title="Walletless gift link"
						tag="Fastest onboarding"
						description="A bearer link or QR opens the gift. Anyone holding it before redemption can claim."
					/>
				</div>
			</section>

			<section className="gift-panel space-y-5">
				<div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
					<div className="space-y-2">
						<p className="eyebrow text-emerald-700">What the chain sees</p>
						<h2 className="section-title text-3xl">
							The public trail stays intentionally boring.
						</h2>
					</div>
					<a href="#/advanced" className="btn-secondary self-start md:self-auto">
						Advanced proof
					</a>
				</div>

				<div className="grid gap-4 md:grid-cols-3">
					<PrivacyLayer
						title="Sender -> Pool"
						description="The sender funds a fixed-denomination pool note."
					/>
					<PrivacyLayer
						title="Proof"
						description="The recipient proves a valid note without revealing which deposit."
					/>
					<PrivacyLayer
						title="Pool -> Claim"
						description="The relayer submits the withdrawal to the chosen destination."
					/>
				</div>
			</section>

			<details className="card space-y-5">
				<summary className="cursor-pointer list-none">
					<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<div>
							<h2 className="section-title">Network setup</h2>
							<p className="mt-1 text-sm text-text-secondary">
								Only open this when switching between local dev and Paseo.
							</p>
						</div>
						<div className="text-sm text-text-muted">
							{connected ? chainName || "Connected" : "Disconnected"}
						</div>
					</div>
				</summary>

				<div className="mt-5 space-y-5">
					<div className="flex flex-wrap gap-2">
						<button
							onClick={() => applyPreset("local")}
							className="btn-secondary text-xs"
						>
							Use local dev
						</button>
						<button
							onClick={() => applyPreset("testnet")}
							className="btn-secondary text-xs"
						>
							Use Hub TestNet
						</button>
					</div>

					<div>
						<label className="label">Substrate WebSocket Endpoint</label>
						<div className="flex flex-col gap-2 md:flex-row">
							<input
								type="text"
								value={urlInput}
								onChange={(e) => setUrlInput(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleConnect()}
								placeholder={LOCAL_WS_URL}
								className="input-field flex-1"
							/>
							<button
								onClick={handleConnect}
								disabled={connecting}
								className="btn-primary"
							>
								{connecting ? "Connecting..." : "Connect"}
							</button>
						</div>
					</div>

					<div>
						<label className="label">Ethereum JSON-RPC Endpoint</label>
						<input
							type="text"
							value={ethRpcInput}
							onChange={(e) => {
								setEthRpcInput(e.target.value);
								setEthRpcUrl(e.target.value);
							}}
							placeholder={LOCAL_ETH_RPC_URL}
							className="input-field w-full"
						/>
					</div>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<StatusItem label="Chain status">
							{error ? (
								<span className="text-accent-red">{error}</span>
							) : connected ? (
								<span className="text-emerald-700">Connected</span>
							) : connecting ? (
								<span className="text-accent-yellow">Connecting...</span>
							) : (
								<span className="text-text-muted">Disconnected</span>
							)}
						</StatusItem>
						<StatusItem label="Chain name">
							{chainName || <span className="text-text-muted">...</span>}
						</StatusItem>
						<StatusItem label="Latest block">
							<span className="font-mono">#{blockNumber}</span>
						</StatusItem>
					</div>
				</div>
			</details>

			<details className="card">
				<summary className="cursor-pointer list-none">
					<div>
						<h2 className="section-title">Developer and template surfaces</h2>
						<p className="mt-1 text-sm text-text-secondary">
							Original Polkadot Stack template pages and advanced recovery tools.
						</p>
					</div>
				</summary>

				<div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
					<FeatureCard
						title="Wallet setup"
						description="Register or restore the private inbox."
						link="/register"
						available={pallets.revive}
						unavailableReason="pallet-revive not found in connected runtime"
					/>
					<FeatureCard
						title="Public recovery"
						description="Advanced legacy recovery for the public stealth path."
						link="/scan"
						available={pallets.revive}
						unavailableReason="pallet-revive not found in connected runtime"
					/>
					<FeatureCard
						title="Pallet PoE"
						description="Original FRAME pallet proof-of-existence demo."
						link="/pallet"
						available={pallets.templatePallet}
						unavailableReason="TemplatePallet not found in connected runtime"
					/>
					<FeatureCard
						title="EVM / PVM PoE"
						description="Original Solidity proof-of-existence demos."
						link="/advanced"
						available={true}
						unavailableReason=""
					/>
				</div>
			</details>
		</div>
	);
}

function TrustBadge({ title, detail }: { title: string; detail: string }) {
	return (
		<div className="rounded-2xl border border-emerald-900/10 bg-white/45 px-4 py-3">
			<div className="text-sm font-semibold text-ink-950">{title}</div>
			<div className="mt-1 text-xs text-text-secondary">{detail}</div>
		</div>
	);
}

function JourneyLine({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center gap-3">
			<div className="h-2.5 w-2.5 rounded-full bg-coral-500" />
			<div>
				<div className="text-xs uppercase tracking-[0.18em] text-text-muted">{label}</div>
				<div className="text-sm font-semibold text-ink-950">{value}</div>
			</div>
		</div>
	);
}

function ProductCard({
	kicker,
	title,
	description,
}: {
	kicker: string;
	title: string;
	description: string;
}) {
	return (
		<div className="card-hover">
			<div className="eyebrow text-coral-800">{kicker}</div>
			<h3 className="mt-3 font-display text-2xl font-semibold text-ink-950">{title}</h3>
			<p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
		</div>
	);
}

function ModeCard({
	title,
	tag,
	description,
}: {
	title: string;
	tag: string;
	description: string;
}) {
	return (
		<div className="card-hover space-y-3">
			<span className="rounded-full border border-emerald-900/10 bg-white/45 px-3 py-1 text-xs font-semibold text-emerald-700">
				{tag}
			</span>
			<h3 className="font-display text-2xl font-semibold text-ink-950">{title}</h3>
			<p className="text-sm leading-relaxed text-text-secondary">{description}</p>
		</div>
	);
}

function PrivacyLayer({ title, description }: { title: string; description: string }) {
	return (
		<div className="rounded-[1.5rem] border border-emerald-900/10 bg-white/45 p-5">
			<h3 className="font-display text-xl font-semibold text-ink-950">{title}</h3>
			<p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
		</div>
	);
}

function StatusItem({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
				{label}
			</h3>
			<p className="text-lg font-semibold text-text-primary">{children}</p>
		</div>
	);
}

function FeatureCard({
	title,
	description,
	link,
	available,
	unavailableReason,
}: {
	title: string;
	description: string;
	link: string;
	available: boolean | null;
	unavailableReason: string;
}) {
	if (available !== true) {
		return (
			<div className="card opacity-75">
				<h3 className="mb-2 font-display text-lg font-semibold text-text-muted">{title}</h3>
				<p className="text-sm text-text-muted">{description}</p>
				<p className="mt-3 text-xs">
					{available === null ? (
						<span className="text-accent-yellow">Detecting...</span>
					) : (
						<span className="text-accent-red">{unavailableReason}</span>
					)}
				</p>
			</div>
		);
	}

	return (
		<a href={`#${link}`} className="card-hover block group">
			<h3 className="mb-2 font-display text-lg font-semibold text-emerald-700">{title}</h3>
			<p className="text-sm text-text-secondary transition-colors group-hover:text-text-primary">
				{description}
			</p>
		</a>
	);
}
