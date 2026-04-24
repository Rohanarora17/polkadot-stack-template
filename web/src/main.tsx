import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import "./index.css";
import { LazyEmbeddedWalletProvider } from "./wallet/LazyEmbeddedWalletProvider";

const HomePage = lazy(() => import("./pages/HomePage"));
const WalletPage = lazy(() => import("./pages/WalletPage"));
const SendPage = lazy(() => import("./pages/SendPage"));
const GiftLinkPage = lazy(() => import("./pages/GiftLinkPage"));
const ClaimGiftPage = lazy(() => import("./pages/ClaimGiftPage"));
const PalletPage = lazy(() => import("./pages/PalletPage"));
const EvmContractPage = lazy(() => import("./pages/EvmContractPage"));
const PvmContractPage = lazy(() => import("./pages/PvmContractPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const StatementStorePage = lazy(() => import("./pages/StatementStorePage"));
const StealthLabPage = lazy(() => import("./pages/StealthLabPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ScanPage = lazy(() => import("./pages/ScanPage"));
const PrivateWithdrawPage = lazy(() => import("./pages/PrivateWithdrawPage"));
const AdvancedPage = lazy(() => import("./pages/AdvancedPage"));

const routeFallback = (
	<div className="card animate-pulse">
		<div className="h-4 w-32 rounded bg-emerald-900/10" />
		<div className="mt-3 h-3 w-48 rounded bg-emerald-900/10" />
	</div>
);

function applyE2ERouteOverride() {
	if (typeof window === "undefined" || window.location.hash) {
		return;
	}

	const requestedRoute = new URLSearchParams(window.location.search).get("e2e-route");
	if (!requestedRoute) {
		return;
	}

	const normalizedRoute = requestedRoute.startsWith("/") ? requestedRoute : `/${requestedRoute}`;
	window.location.replace(
		`${window.location.pathname}${window.location.search}#${normalizedRoute}`,
	);
}

applyE2ERouteOverride();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<LazyEmbeddedWalletProvider>
			<HashRouter>
				<Routes>
					<Route element={<App />}>
						<Route
							index
							element={
								<Suspense fallback={routeFallback}>
									<HomePage />
								</Suspense>
							}
						/>
						<Route
							path="wallet"
							element={
								<Suspense fallback={routeFallback}>
									<WalletPage />
								</Suspense>
							}
						/>
						<Route
							path="pallet"
							element={
								<Suspense fallback={routeFallback}>
									<PalletPage />
								</Suspense>
							}
						/>
						<Route
							path="evm"
							element={
								<Suspense fallback={routeFallback}>
									<EvmContractPage />
								</Suspense>
							}
						/>
						<Route
							path="pvm"
							element={
								<Suspense fallback={routeFallback}>
									<PvmContractPage />
								</Suspense>
							}
						/>
						<Route
							path="accounts"
							element={
								<Suspense fallback={routeFallback}>
									<AccountsPage />
								</Suspense>
							}
						/>
						<Route
							path="statements"
							element={
								<Suspense fallback={routeFallback}>
									<StatementStorePage />
								</Suspense>
							}
						/>
						<Route
							path="advanced"
							element={
								<Suspense fallback={routeFallback}>
									<AdvancedPage />
								</Suspense>
							}
						/>
						<Route
							path="stealth-lab"
							element={
								<Suspense fallback={routeFallback}>
									<StealthLabPage />
								</Suspense>
							}
						/>
						<Route
							path="register"
							element={
								<Suspense fallback={routeFallback}>
									<RegisterPage />
								</Suspense>
							}
						/>
						<Route
							path="send"
							element={
								<Suspense fallback={routeFallback}>
									<SendPage />
								</Suspense>
							}
						/>
						<Route
							path="scan"
							element={
								<Suspense fallback={routeFallback}>
									<ScanPage />
								</Suspense>
							}
						/>
						<Route
							path="gift"
							element={
								<Suspense fallback={routeFallback}>
									<GiftLinkPage />
								</Suspense>
							}
						/>
						<Route
							path="claim"
							element={
								<Suspense fallback={routeFallback}>
									<ClaimGiftPage />
								</Suspense>
							}
						/>
						<Route
							path="withdraw"
							element={
								<Suspense fallback={routeFallback}>
									<PrivateWithdrawPage />
								</Suspense>
							}
						/>
					</Route>
				</Routes>
			</HashRouter>
		</LazyEmbeddedWalletProvider>
	</StrictMode>,
);
