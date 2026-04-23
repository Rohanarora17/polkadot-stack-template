import { Link } from "react-router-dom";
import { useChainStore } from "../store/chainStore";

type AdvancedLink = {
	description: string;
	label: string;
	path: string;
};

const recoveryLinks: AdvancedLink[] = [
	{
		label: "Wallet Setup",
		path: "/register",
		description: "Create or restore the private wallet identity and register its meta-address.",
	},
	{
		label: "Public Recovery",
		path: "/scan",
		description: "Legacy stealth-account recovery path for debugging and non-private recovery.",
	},
];

const templateLinks: AdvancedLink[] = [
	{
		label: "Accounts",
		path: "/accounts",
		description:
			"Inspect dev, extension, and host accounts available in the current environment.",
	},
	{
		label: "Statements",
		path: "/statements",
		description: "Use the template Statement Store tooling and runtime-backed statement flow.",
	},
	{
		label: "Pallet PoE",
		path: "/pallet",
		description: "Original Proof of Existence pallet demo via PAPI.",
	},
	{
		label: "EVM PoE",
		path: "/evm",
		description: "Original Solidity + solc contract demo over the EVM backend.",
	},
	{
		label: "PVM PoE",
		path: "/pvm",
		description: "Original Solidity + resolc demo over pallet-revive and PolkaVM.",
	},
];

export default function AdvancedPage() {
	const pallets = useChainStore((s) => s.pallets);
	const connected = useChainStore((s) => s.connected);

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="card space-y-3">
				<p className="text-xs uppercase tracking-[0.18em] text-text-muted">Advanced</p>
				<h1 className="page-title">Recovery tools, diagnostics, and template surfaces.</h1>
				<p className="max-w-3xl text-sm leading-relaxed text-text-secondary">
					This area keeps the working expert tools available without making them the main
					product path. Use it for recovery, debugging, or the original template demos.
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<SectionCard
					title="Recovery Tools"
					description="Private wallet setup and public recovery stay here so the product path can remain simpler."
					links={recoveryLinks}
				/>
				<SectionCard
					title="Template Tools"
					description="The original Polkadot Stack template pages still exist and can be used independently."
					links={templateLinks.filter((item) => {
						if (item.path === "/pallet") {
							return pallets.templatePallet === true;
						}
						if (item.path === "/evm" || item.path === "/pvm") {
							return pallets.revive === true;
						}
						return true;
					})}
				/>
			</div>

			<div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-text-secondary">
				{connected
					? "Connected chain utilities are available below."
					: "You can browse these pages offline, but most advanced tools need a live chain connection."}
			</div>
		</div>
	);
}

function SectionCard({
	title,
	description,
	links,
}: {
	title: string;
	description: string;
	links: AdvancedLink[];
}) {
	return (
		<div className="card space-y-4">
			<div className="space-y-2">
				<h2 className="section-title">{title}</h2>
				<p className="text-sm text-text-secondary">{description}</p>
			</div>
			<div className="space-y-3">
				{links.map((item) => (
					<Link
						key={item.path}
						to={item.path}
						className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.05]"
					>
						<div className="font-medium text-text-primary">{item.label}</div>
						<div className="mt-1 text-sm text-text-secondary">{item.description}</div>
					</Link>
				))}
			</div>
		</div>
	);
}
