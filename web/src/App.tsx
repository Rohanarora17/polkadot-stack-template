import { Outlet, Link, useLocation } from "react-router-dom";
import { useChainStore } from "./store/chainStore";
import { useConnectionManagement } from "./hooks/useConnection";
import { useStealthPayAccount } from "./hooks/useStealthPayAccount";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";

export default function App() {
	const location = useLocation();
	const connected = useChainStore((s) => s.connected);
	const stealthAccount = useStealthPayAccount();

	useConnectionManagement();

	const navItems = [
		{ path: "/", label: "Home", enabled: true },
		{ path: "/wallet", label: "Wallet", enabled: true },
		{ path: "/send", label: "Send Gift", enabled: true },
		{ path: "/claim", label: "Claim", enabled: true },
		{ path: "/advanced", label: "Advanced", enabled: true },
	];

	return (
		<div className="min-h-screen bg-pattern relative">
			<div
				className="gradient-orb"
				style={{ background: "#d96f4f", top: "-220px", right: "-120px" }}
			/>
			<div
				className="gradient-orb"
				style={{ background: "#326c52", bottom: "-240px", left: "-140px" }}
			/>

			<nav className="sticky top-0 z-50 border-b border-ink-950/10 bg-ivory-50/90 backdrop-blur-xl">
				<div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 md:flex-nowrap md:gap-6">
					<Link to="/" className="flex min-w-0 items-center gap-2.5 shrink-0 group">
						<div className="relative flex h-9 w-9 items-center justify-center rounded-2xl border border-emerald-900/15 bg-ivory-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7)] transition-transform group-hover:-rotate-3">
							<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
								<path
									d="M5 9.5h14v9H5z"
									fill="#18372d"
									stroke="#18372d"
									strokeLinejoin="round"
								/>
								<path
									d="M7 9.5V7.8C7 5.7 8.6 4 10.6 4c1.1 0 2.1.5 2.8 1.3.7-.8 1.7-1.3 2.8-1.3 2 0 3.6 1.7 3.6 3.8v1.7"
									stroke="#d96f4f"
									strokeLinecap="round"
									strokeWidth="1.8"
								/>
								<path d="M12 9.5v9" stroke="#fffaf0" strokeWidth="1.5" />
								<path d="M5 13h14" stroke="#fffaf0" strokeWidth="1.5" />
							</svg>
						</div>
						<div className="min-w-0 leading-tight">
							<div className="font-display text-lg font-semibold tracking-tight text-ink-950">
								StealthPay
							</div>
							<div className="max-w-[11rem] truncate text-[11px] uppercase tracking-[0.16em] text-ink-700 sm:max-w-none">
								Private gift protocol
							</div>
						</div>
					</Link>

					<div className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-1 md:order-none md:mx-0 md:w-auto md:pb-0">
						{navItems.map((item) =>
							item.enabled ? (
								<Link
									key={item.path}
									to={item.path}
									className={`relative rounded-full px-3 py-1.5 text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
										location.pathname === item.path
											? "active-nav-link"
											: "text-ink-700 hover:text-ink-950 hover:bg-white/50"
									}`}
								>
									{location.pathname === item.path && (
										<span className="absolute inset-0 rounded-full bg-emerald-900 shadow-[0_12px_24px_-18px_rgba(24,55,45,0.85)]" />
									)}
									<span className="relative">{item.label}</span>
								</Link>
							) : (
								<span
									key={item.path}
									className="px-3 py-1.5 rounded-lg text-sm font-medium text-text-muted cursor-not-allowed whitespace-nowrap"
									title="Pallet not available on connected chain"
								>
									{item.label}
								</span>
							),
						)}
					</div>

					<div className="ml-auto flex flex-wrap items-center justify-end gap-2 shrink-0">
						<Link
							to="/wallet"
							className="hidden max-w-[24rem] rounded-2xl border border-emerald-900/10 bg-white/60 px-3 py-1.5 text-[11px] font-semibold text-ink-800 shadow-[0_14px_30px_-24px_rgba(24,55,45,0.55)] sm:block"
						>
							<span className="text-ink-600">StealthPay account</span>
							<span className="mx-2 text-ink-300">/</span>
							<span>{stealthAccount.statusLabel}</span>
							<span className="mx-2 text-ink-300">/</span>
							<span className="font-mono">{stealthAccount.displayLabel}</span>
						</Link>
						<span
							className={`w-2 h-2 rounded-full transition-colors duration-500 ${
								connected
									? "bg-emerald-600 shadow-[0_0_6px_rgba(50,108,82,0.5)]"
									: "bg-text-muted"
							}`}
						/>
						<span className="text-xs text-text-tertiary hidden sm:inline">
							{connected ? "Connected" : "Offline"}
						</span>
					</div>
				</div>
			</nav>

			{/* Main content */}
			<main className="relative z-10 max-w-6xl mx-auto px-4 py-8">
				<RouteErrorBoundary resetKey={`${location.pathname}${location.search}`}>
					<Outlet />
				</RouteErrorBoundary>
			</main>
		</div>
	);
}
