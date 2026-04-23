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
			<section className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] p-6 md:p-10">
				<div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(230,0,122,0.28),transparent_34%),radial-gradient(circle_at_90%_20%,rgba(76,194,255,0.16),transparent_28%),linear-gradient(135deg,rgba(15,13,24,0.98),rgba(8,8,13,0.96))]" />
				<div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
					<div className="space-y-6">
						<div className="flex flex-wrap items-center gap-2">
							<span className="gift-chip">StealthPay</span>
							<span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-text-secondary">
								Private gifts on Polkadot Hub
							</span>
						</div>

						<div className="space-y-4">
							<h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-6xl">
								Send money like a gift.
								<span className="block bg-gradient-to-r from-polka-300 via-white to-cyan-200 bg-clip-text text-transparent">
									Claim it without a public trail.
								</span>
							</h1>
							<p className="max-w-2xl text-base leading-relaxed text-text-secondary md:text-lg">
								StealthPay turns the current PVM privacy pool into a product flow:
								create a private gift, share a claim link, and let the recipient
								claim through a relayer instead of exposing a direct
								sender-to-recipient payment.
							</p>
						</div>

						<div className="flex flex-wrap gap-3">
							<a href="#/send" className="btn-primary px-5 py-3">
								Create Private Gift
							</a>
							<a href="#/claim" className="btn-secondary px-5 py-3">
								Claim Gift
							</a>
							<a href="#/wallet" className="btn-secondary px-5 py-3">
								Open Wallet
							</a>
						</div>
					</div>

					<div className="gift-share-card space-y-5">
						<div className="flex items-center justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.2em] text-polka-200">
									Live product shape
								</p>
								<h2 className="mt-1 text-2xl font-semibold text-white font-display">
									One link. One claim. No direct public payment.
								</h2>
							</div>
							<div className="rounded-2xl border border-polka-400/20 bg-polka-500/10 px-4 py-3 text-right">
								<p className="text-xs text-text-muted">Pool ticket</p>
								<p className="font-mono text-lg font-semibold text-polka-100">
									1 UNIT
								</p>
							</div>
						</div>

						<div className="grid gap-3">
							<MiniFlow label="Sender" value="Deposits into the pool" />
							<MiniFlow label="Recipient" value="Opens gift link and claims" />
							<MiniFlow
								label="Chain"
								value="Sees pool activity, not a direct payment"
							/>
						</div>
					</div>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-3">
				<ProductStep
					step="01"
					title="Create"
					description="Choose registered-recipient mode or a walletless bearer link for someone who has no wallet yet."
				/>
				<ProductStep
					step="02"
					title="Share"
					description="The link carries claim routing data. Private note material stays encrypted in the Bulletin envelope."
				/>
				<ProductStep
					step="03"
					title="Claim"
					description="The recipient claims through ZK proof generation and a relayer-backed private withdrawal."
				/>
			</section>

			<section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
				<div className="card space-y-4">
					<p className="text-xs uppercase tracking-[0.18em] text-polka-300">
						Choose the right gift mode
					</p>
					<h2 className="page-title">
						Built for real recipients, not protocol operators.
					</h2>
					<p className="text-sm leading-relaxed text-text-secondary">
						The same privacy pool sits underneath both modes. The difference is only how
						the recipient receives the private claim capability.
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<ModeCard
						title="Registered Wallet Gift"
						tag="Strongest targeting"
						description="Encrypt the claim to a recipient who already registered a StealthPay meta-address."
					/>
					<ModeCard
						title="Walletless Gift Link"
						tag="Fastest onboarding"
						description="Create a bearer link for a recipient with no wallet. The link is sensitive until claimed."
					/>
				</div>
			</section>

			<section className="gift-panel space-y-5">
				<div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
					<div className="space-y-2">
						<p className="text-xs uppercase tracking-[0.18em] text-polka-200">
							Privacy path
						</p>
						<h2 className="section-title text-2xl">
							What the public chain sees is intentionally boring.
						</h2>
					</div>
					<a href="#/advanced" className="btn-secondary self-start md:self-auto">
						View Advanced Tools
					</a>
				</div>

				<div className="grid gap-4 md:grid-cols-3">
					<PrivacyLayer
						title="Sender -> Pool"
						description="The sender funds a fixed-denomination pool note instead of paying the recipient address directly."
					/>
					<PrivacyLayer
						title="ZK Ownership Proof"
						description="The recipient proves a valid note exists without revealing which deposit created it."
					/>
					<PrivacyLayer
						title="Relayed Claim"
						description="The relayer submits the withdrawal, so the recipient is not the public transaction sender."
					/>
				</div>
			</section>

			<section className="space-y-4">
				<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
					<div>
						<h2 className="section-title text-2xl">Start here</h2>
						<p className="mt-2 max-w-2xl text-sm text-text-secondary">
							These are the product surfaces judges and users should see first. Setup,
							recovery, and template demos remain available below.
						</p>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
					<FeatureCard
						title="Wallet"
						description="One private wallet interface for incoming gifts, recovery, and future private balance work."
						link="/wallet"
						accentColor="text-polka-300"
						borderColor="hover:border-polka-500/20"
						available={true}
						unavailableReason=""
					/>
					<FeatureCard
						title="Send Gift"
						description="Create a registered-recipient gift or a walletless bearer link backed by the pool."
						link="/send"
						accentColor="text-polka-400"
						borderColor="hover:border-polka-500/20"
						available={pallets.revive}
						unavailableReason="pallet-revive not found in connected runtime"
					/>
					<FeatureCard
						title="Open Gift"
						description="Recipient landing and claim flow for shared private gift links."
						link="/gift"
						accentColor="text-cyan-200"
						borderColor="hover:border-cyan-300/20"
						available={true}
						unavailableReason=""
					/>
					<FeatureCard
						title="Claim"
						description="Wallet-connected private claim flow with relayer withdrawal and recovery export."
						link="/claim"
						accentColor="text-polka-200"
						borderColor="hover:border-polka-500/20"
						available={pallets.revive}
						unavailableReason="pallet-revive not found in connected runtime"
					/>
				</div>
			</section>

			<details className="card space-y-5">
				<summary className="cursor-pointer list-none">
					<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<div>
							<h2 className="section-title">Network Setup</h2>
							<p className="mt-1 text-sm text-text-secondary">
								Open this only when switching between local dev and Paseo.
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
							Use Local Dev
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
						<p className="text-xs text-text-muted mt-2">
							Used by the EVM sender path, PVM contract calls, and relayer debugging.
						</p>
					</div>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<StatusItem label="Chain Status">
							{error ? (
								<span className="text-sm text-accent-red">{error}</span>
							) : connected ? (
								<span className="flex items-center gap-1.5 text-accent-green">
									<span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse-slow" />
									Connected
								</span>
							) : connecting ? (
								<span className="text-accent-yellow">Connecting...</span>
							) : (
								<span className="text-text-muted">Disconnected</span>
							)}
						</StatusItem>
						<StatusItem label="Chain Name">
							{chainName || <span className="text-text-muted">...</span>}
						</StatusItem>
						<StatusItem label="Latest Block">
							<span className="font-mono">#{blockNumber}</span>
						</StatusItem>
					</div>
				</div>
			</details>

			<details className="card">
				<summary className="cursor-pointer list-none">
					<div>
						<h2 className="section-title">Developer and Template Surfaces</h2>
						<p className="mt-1 text-sm text-text-secondary">
							Original Polkadot Stack template pages and advanced recovery tools.
						</p>
					</div>
				</summary>

				<div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
					<FeatureCard
						title="Wallet Setup"
						description="Create or restore the master stealth identity and register the current meta-address."
						link="/register"
						accentColor="text-polka-400"
						borderColor="hover:border-polka-500/20"
						available={pallets.revive}
						unavailableReason="pallet-revive not found in connected runtime"
					/>
					<FeatureCard
						title="Public Recovery"
						description="Advanced legacy recovery for the older public stealth-account path."
						link="/scan"
						accentColor="text-polka-300"
						borderColor="hover:border-polka-500/20"
						available={pallets.revive}
						unavailableReason="pallet-revive not found in connected runtime"
					/>
					<FeatureCard
						title="Pallet PoE"
						description="Claim file hashes via the Substrate FRAME pallet using PAPI."
						link="/pallet"
						accentColor="text-accent-blue"
						borderColor="hover:border-accent-blue/20"
						available={pallets.templatePallet}
						unavailableReason="TemplatePallet not found in connected runtime"
					/>
					<FeatureCard
						title="EVM / PVM PoE"
						description="Original Solidity proof-of-existence demos for the template."
						link="/advanced"
						accentColor="text-accent-green"
						borderColor="hover:border-accent-green/20"
						available={true}
						unavailableReason=""
					/>
				</div>
			</details>
		</div>
	);
}

function MiniFlow({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
			<div className="text-xs uppercase tracking-[0.18em] text-text-muted">{label}</div>
			<div className="mt-1 text-sm font-medium text-text-primary">{value}</div>
		</div>
	);
}

function ProductStep({
	step,
	title,
	description,
}: {
	step: string;
	title: string;
	description: string;
}) {
	return (
		<div className="gift-step">
			<div className="text-xs font-semibold tracking-[0.2em] text-polka-300">{step}</div>
			<h3 className="mt-3 text-xl font-semibold text-text-primary font-display">{title}</h3>
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
			<span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-text-secondary">
				{tag}
			</span>
			<h3 className="text-xl font-semibold text-text-primary font-display">{title}</h3>
			<p className="text-sm leading-relaxed text-text-secondary">{description}</p>
		</div>
	);
}

function PrivacyLayer({ title, description }: { title: string; description: string }) {
	return (
		<div className="rounded-2xl border border-white/[0.08] bg-black/15 p-5">
			<h3 className="font-display text-lg font-semibold text-white">{title}</h3>
			<p className="mt-2 text-sm leading-relaxed text-text-secondary">{description}</p>
		</div>
	);
}

function StatusItem({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">
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
	accentColor,
	borderColor,
	available,
	unavailableReason,
}: {
	title: string;
	description: string;
	link: string;
	accentColor: string;
	borderColor: string;
	available: boolean | null;
	unavailableReason: string;
}) {
	if (available !== true) {
		return (
			<div className="card opacity-40">
				<h3 className="text-lg font-semibold mb-2 text-text-muted font-display">{title}</h3>
				<p className="text-sm text-text-muted">{description}</p>
				<p className="text-xs mt-3">
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
		<a href={`#${link}`} className={`card-hover block group ${borderColor}`}>
			<h3 className={`text-lg font-semibold mb-2 font-display ${accentColor}`}>{title}</h3>
			<p className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
				{description}
			</p>
		</a>
	);
}
