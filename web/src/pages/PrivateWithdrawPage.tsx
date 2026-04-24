import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { InjectedPolkadotAccount } from "polkadot-api/pjs-signer";
import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { deployments } from "../config/deployments";
import { getPublicClient } from "../config/evm";
import { privatePoolAbi } from "../config/privatePool";
import {
	decryptBearerGiftEnvelope,
	exportEncryptedBearerGiftRecovery,
	serializeBearerGiftRecoveryBackup,
	type BearerGiftRecoveryPayload,
} from "../crypto/bearerGift";
import {
	PRIVATE_POOL_TREE_DEPTH,
	computeMerkleProofForDeposit,
	decodePrivateDeliveryPayload,
	exportEncryptedNoteBackup,
	serializeEncryptedNoteBackup,
	type MerkleProof,
	type MerkleProofHint,
	type PrivateNotePayload,
} from "../crypto/privatePool";
import { decryptPrivateNote } from "../crypto/privateNote";
import {
	deriveAnnouncementSharedSecret,
	deriveKeysFromSeed,
	encodeMetaAddressHex,
	type MetaAddressKeys,
} from "../crypto/stealth";
import { fetchFromBulletinByHash } from "../hooks/useBulletin";
import { devAccounts } from "../hooks/useAccount";
import { useChainStore } from "../store/chainStore";
import { generatePrivateWithdrawProof } from "../utils/privateWithdrawProof";
import { requestRelayerQuote, submitRelayedPrivateWithdraw } from "../utils/privateRelayer";
import {
	scanPoolDepositByCommitment,
	scanPoolDeposits,
	scanPrivateAnnouncements,
	scanPrivateAnnouncementsByMemoHash,
	type PrivateAnnouncementCandidate,
} from "../utils/privatePoolScan";
import { isMappedForRevive, resolveReviveAddress } from "../utils/stealthRevive";
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
import { parseClaimLinkSearch } from "../utils/claimLinks";
import { saveEmbeddedClaimWallet } from "../utils/embeddedWalletVault";
import { recordPrivateGiftClaimed } from "../utils/walletActivity";
import { useEmbeddedWalletProvider } from "../wallet/EmbeddedWalletContext";
import { readWalletPreference, writeWalletPreference } from "../utils/walletPreference";
import { isPolkadotHostEnvironment } from "../utils/hostEnvironment";

const CONTRACT_STORAGE_KEY_PREFIX = "stealthpay-private-withdraw-registry";
const POOL_STORAGE_KEY_PREFIX = "stealthpay-private-withdraw-pool";
const DEFAULT_SCAN_DEPTH = "1000";
const POOL_DEPOSIT_HISTORY_FROM_BLOCK = 0n;

type PrivateWithdrawPageProps = {
	consumerMode?: boolean;
};

type WithdrawSnapshot = {
	keys: MetaAddressKeys;
	metaAddressHex: `0x${string}`;
	ownerAddress: Address;
	seed: ResolvedStealthSeed;
	session: TransactionWalletSession;
};

type MatchedPrivateWithdrawal = {
	announcement: PrivateAnnouncementCandidate;
	bulletinCid: string;
	decryptedMemo: string | null;
	merkleProof: MerkleProof;
	note: PrivateNotePayload;
	spent: boolean;
};

type ScanReadback = {
	fromBlock: bigint;
	matches: MatchedPrivateWithdrawal[];
	note: string | null;
	privateAnnouncementCount: number;
	poolDepositCount: number;
	toBlock: bigint;
};

type WithdrawalState = {
	error?: string | null;
	quoteExpiry?: bigint;
	quoteFee?: bigint;
	relayer?: Address;
	status?: string | null;
	transactionHash?: `0x${string}`;
};

type BearerClaimWallet = {
	address: Address;
	privateKey?: Hex;
	provider: "embedded" | "local-vault" | "pwallet-h160";
	providerName: string;
};

function scopedStorageKey(prefix: string, ethRpcUrl: string) {
	return `${prefix}:${ethRpcUrl}`;
}

function isAddress(value: string): value is Address {
	return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parseDepth(value: string) {
	const trimmed = value.trim();
	if (!/^\d+$/.test(trimmed)) {
		throw new Error("Recent block scan depth must be a positive integer.");
	}
	const depth = BigInt(trimmed);
	if (depth <= 0n) {
		throw new Error("Recent block scan depth must be greater than zero.");
	}
	return depth;
}

function downloadFile(filename: string, text: string) {
	const blob = new Blob([text], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

function formatPrivateWithdrawError(cause: unknown) {
	const message = cause instanceof Error ? cause.message : String(cause);
	if (
		message.includes("Assert Failed") &&
		(message.includes("PrivateWithdraw_210") || message.includes("line: 59"))
	) {
		return "Private withdraw proof generation failed because the scanned pool deposit history is incomplete for this note. Increase the scan range, rescan, and try again.";
	}

	return message;
}

export default function PrivateWithdrawPage({ consumerMode = false }: PrivateWithdrawPageProps) {
	const location = useLocation();
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);
	const embeddedWalletProvider = useEmbeddedWalletProvider();

	const [walletMode, setWalletMode] = useState<RegisterWalletMode>(() =>
		isPolkadotHostEnvironment() ? "pwallet-host" : "browser-extension",
	);
	const [devAccountIndex, setDevAccountIndex] = useState(0);
	const [availableExtensionWallets, setAvailableExtensionWallets] = useState<string[]>([]);
	const [selectedExtensionWallet, setSelectedExtensionWallet] = useState("");
	const [extensionAccounts, setExtensionAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const [selectedExtensionAccount, setSelectedExtensionAccount] = useState("");
	const [contractAddress, setContractAddress] = useState("");
	const [poolAddress, setPoolAddress] = useState("");
	const [importSeedHex, setImportSeedHex] = useState("");
	const [scanDepthInput, setScanDepthInput] = useState(DEFAULT_SCAN_DEPTH);
	const [withdrawDestination, setWithdrawDestination] = useState("");
	const [snapshot, setSnapshot] = useState<WithdrawSnapshot | null>(null);
	const [readback, setReadback] = useState<ScanReadback | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [claimLinkCopied, setClaimLinkCopied] = useState(false);
	const [bearerClaimWallet, setBearerClaimWallet] = useState<BearerClaimWallet | null>(null);
	const [resumeBearerClaimAfterLogin, setResumeBearerClaimAfterLogin] = useState(false);
	const [useExistingBearerDestination, setUseExistingBearerDestination] = useState(false);
	const [backupPasswords, setBackupPasswords] = useState<Record<string, string>>({});
	const [backupReady, setBackupReady] = useState<Record<string, boolean>>({});
	const [embeddedWalletReady, setEmbeddedWalletReady] = useState<Record<string, boolean>>({});
	const [withdrawals, setWithdrawals] = useState<Record<string, WithdrawalState>>({});
	const [claimLinkHint, setClaimLinkHint] = useState<ReturnType<
		typeof parseClaimLinkSearch
	> | null>(null);

	const contractStorageKey = useMemo(
		() => scopedStorageKey(CONTRACT_STORAGE_KEY_PREFIX, ethRpcUrl),
		[ethRpcUrl],
	);
	const poolStorageKey = useMemo(
		() => scopedStorageKey(POOL_STORAGE_KEY_PREFIX, ethRpcUrl),
		[ethRpcUrl],
	);
	const hasClaimLink = Boolean(claimLinkHint);
	const isBearerClaim = claimLinkHint?.mode === "bearer";
	const claimLinkIsComplete = !claimLinkHint
		? false
		: claimLinkHint.mode === "bearer"
			? Boolean(
					claimLinkHint.poolAddress &&
						claimLinkHint.registryAddress &&
						claimLinkHint.memoHash &&
						claimLinkHint.giftKey,
				)
			: Boolean(
					claimLinkHint.poolAddress &&
						claimLinkHint.registryAddress &&
						claimLinkHint.recipientOwner,
				);
	const claimLinkIsIncomplete = hasClaimLink && !claimLinkIsComplete;
	const hasExtensionWallets = availableExtensionWallets.length > 0;
	const needsSupportedWalletBrowser =
		consumerMode &&
		!claimLinkIsIncomplete &&
		!isBearerClaim &&
		walletMode === "browser-extension" &&
		!hasExtensionWallets;
	const advancedClaimHref =
		hasClaimLink && !claimLinkIsIncomplete ? `#/withdraw${location.search}` : "#/withdraw";
	const claimedCommitment = Object.entries(withdrawals).find(
		([, value]) => value.transactionHash,
	)?.[0];
	const claimedMatch =
		claimedCommitment && readback
			? (readback.matches.find((match) => match.note.commitment === claimedCommitment) ??
				null)
			: null;
	const claimedWithdrawal = claimedCommitment ? (withdrawals[claimedCommitment] ?? null) : null;
	const prepareBearerGiftClaimRef = useRef<() => Promise<void>>(async () => undefined);

	useEffect(() => {
		setContractAddress(
			localStorage.getItem(contractStorageKey) || deployments.stealthPayPvm || "",
		);
		setPoolAddress(localStorage.getItem(poolStorageKey) || deployments.stealthPayPoolPvm || "");
	}, [contractStorageKey, poolStorageKey]);

	useEffect(() => {
		const hint = parseClaimLinkSearch(location.search);
		const hasHint =
			hint.poolAddress ||
			hint.recipientOwner ||
			hint.registryAddress ||
			hint.transactionHash ||
			hint.memoHash ||
			hint.giftKey;
		if (!hasHint) {
			setClaimLinkHint(null);
			return;
		}

		setClaimLinkHint(hint);
		if (hint.registryAddress) {
			setStoredAddress(contractStorageKey, setContractAddress, hint.registryAddress);
		}
		if (hint.poolAddress) {
			setStoredAddress(poolStorageKey, setPoolAddress, hint.poolAddress);
		}
	}, [contractStorageKey, location.search, poolStorageKey]);

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
		async function loadAccounts() {
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
				}
			}
		}

		void loadAccounts();
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

	useEffect(() => {
		if (
			!resumeBearerClaimAfterLogin ||
			!isBearerClaim ||
			claimLinkIsIncomplete ||
			!embeddedWalletProvider.address
		) {
			return;
		}

		setResumeBearerClaimAfterLogin(false);
		void prepareBearerGiftClaimRef.current();
	}, [
		claimLinkIsIncomplete,
		embeddedWalletProvider.address,
		isBearerClaim,
		resumeBearerClaimAfterLogin,
	]);

	function setStoredAddress(storageKey: string, setter: (value: string) => void, value: string) {
		setter(value);
		if (value) {
			localStorage.setItem(storageKey, value);
		} else {
			localStorage.removeItem(storageKey);
		}
	}

	async function copyCurrentGiftLink() {
		if (typeof navigator === "undefined" || !navigator.clipboard) {
			setError("This browser cannot copy the gift link automatically.");
			return;
		}

		try {
			await navigator.clipboard.writeText(window.location.href);
			setClaimLinkCopied(true);
			setStatus("Gift link copied. Reopen it in a wallet-enabled browser to continue.");
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}

	async function createSession() {
		return walletMode === "pwallet-host"
			? createPwalletTxSession()
			: walletMode === "browser-extension"
				? createBrowserExtensionTxSession({
						accountAddress: selectedExtensionAccount || undefined,
						walletName: selectedExtensionWallet,
					})
				: createDevTxSession(devAccountIndex);
	}

	async function deriveRecipientKeys() {
		if (claimLinkIsIncomplete) {
			setError(
				"This private gift link is incomplete. Ask the sender to resend the full private gift link or QR.",
			);
			return;
		}

		setError(null);
		setReadback(null);
		setWithdrawals({});
		setBackupReady({});
		setEmbeddedWalletReady({});
		setStatus("Loading the recipient stealth seed and deriving the private-withdraw keys...");

		try {
			const session = await createSession();
			const seed = requireStealthSeed({
				importedSeedHex: importSeedHex,
				session,
			});
			const keys = deriveKeysFromSeed(seed.seedBytes, session.chainId);
			const ownerAddress = (await resolveReviveAddress({
				originSs58: session.originSs58,
				wsUrl,
			})) as Address;

			const nextSnapshot = {
				keys,
				metaAddressHex: encodeMetaAddressHex(keys),
				ownerAddress,
				seed,
				session,
			};
			setSnapshot(nextSnapshot);
			setWithdrawDestination(ownerAddress);
			if (claimLinkHint) {
				setStatus("Private wallet unlocked. Looking for the linked gift...");
				await scanPrivateWithdrawals(nextSnapshot);
			} else {
				setStatus(
					seed.source === "imported"
						? "Imported the recipient stealth seed. You can scan private announcements now."
						: "Loaded the stored recipient stealth seed. You can scan private announcements now.",
				);
			}
		} catch (cause) {
			console.error(cause);
			setError(formatPrivateWithdrawError(cause));
			setStatus(null);
		}
	}

	async function scanPrivateWithdrawals(snapshotOverride?: WithdrawSnapshot) {
		const targetSnapshot = snapshotOverride ?? snapshot;
		if (!targetSnapshot) {
			setError("Derive recipient keys first.");
			return;
		}
		if (!contractAddress || !isAddress(contractAddress)) {
			setError("Enter a valid StealthPay PVM contract address.");
			return;
		}
		if (!poolAddress || !isAddress(poolAddress)) {
			setError("Enter a valid privacy pool contract address.");
			return;
		}

		setError(null);
		setReadback(null);
		setWithdrawals({});
		setBackupReady({});
		setEmbeddedWalletReady({});
		const exactRegisteredGiftMemo =
			claimLinkHint?.mode === "registered" && claimLinkHint.memoHash
				? claimLinkHint.memoHash
				: null;
		setStatus(
			exactRegisteredGiftMemo
				? "Looking up the exact private gift from indexed history..."
				: "Scanning recent private announcements for this wallet...",
		);

		try {
			const publicClient = getPublicClient(ethRpcUrl);
			const latestBlock = await publicClient.getBlockNumber();
			const depth = parseDepth(scanDepthInput);
			const fromBlock = latestBlock > depth ? latestBlock - depth + 1n : 0n;

			const announcementScan = exactRegisteredGiftMemo
				? await scanPrivateAnnouncementsByMemoHash({
						contractAddress: contractAddress as Address,
						ethRpcUrl,
						memoHash: exactRegisteredGiftMemo,
						publicClient,
						toBlock: latestBlock,
						wsUrl,
					})
				: await scanPrivateAnnouncements({
						contractAddress: contractAddress as Address,
						ethRpcUrl,
						fromBlock,
						publicClient,
						toBlock: latestBlock,
						wsUrl,
					});

			if (announcementScan.announcements.length === 0) {
				setReadback({
					fromBlock:
						fromBlock > announcementScan.fromBlock
							? fromBlock
							: announcementScan.fromBlock,
					matches: [],
					note: announcementScan.note,
					privateAnnouncementCount: 0,
					poolDepositCount: 0,
					toBlock: latestBlock,
				});
				setStatus(
					exactRegisteredGiftMemo
						? "Opened a claim link, but the exact gift announcement was not found in indexed history."
						: "Scanned the recent range but found no private matches for this recipient.",
				);
				return;
			}

			setStatus(
				exactRegisteredGiftMemo
					? "Gift announcement found. Decrypting the private note..."
					: `Found ${announcementScan.announcements.length} announcements. Checking which ones belong to this wallet...`,
			);

			const decryptedMatches: Array<{
				announcement: PrivateAnnouncementCandidate;
				bulletinCid: string;
				decryptedMemo: string | null;
				note: MatchedPrivateWithdrawal["note"];
			}> = [];
			for (const announcement of announcementScan.announcements) {
				if (
					claimLinkHint?.transactionHash &&
					announcement.transactionHash.toLowerCase() !==
						claimLinkHint.transactionHash.toLowerCase()
				) {
					continue;
				}
				if (announcement.poolAddress.toLowerCase() !== poolAddress.toLowerCase()) {
					continue;
				}
				if (
					claimLinkHint?.memoHash &&
					announcement.memoHash.toLowerCase() !== claimLinkHint.memoHash.toLowerCase()
				) {
					continue;
				}

				const sharedSecret = deriveAnnouncementSharedSecret(
					targetSnapshot.keys.viewingPrivKey,
					hexToBytes(announcement.ephemeralPubKey),
					announcement.viewTag,
				);
				if (!sharedSecret) {
					continue;
				}

				const fetched = await fetchFromBulletinByHash(announcement.memoHash);
				const decrypted = decryptPrivateNote(sharedSecret, fetched.bytes);
				const deliveryPayload = decodePrivateDeliveryPayload(decrypted.plaintextBytes);
				const note = deliveryPayload.note;
				if (note.poolAddress.toLowerCase() !== poolAddress.toLowerCase()) {
					continue;
				}

				decryptedMatches.push({
					announcement,
					bulletinCid: fetched.cid ?? "unknown",
					decryptedMemo: deliveryPayload.memoText,
					note,
				});
			}

			if (decryptedMatches.length === 0) {
				setReadback({
					fromBlock:
						fromBlock > announcementScan.fromBlock
							? fromBlock
							: announcementScan.fromBlock,
					matches: [],
					note: announcementScan.note,
					privateAnnouncementCount: announcementScan.announcements.length,
					poolDepositCount: 0,
					toBlock: latestBlock,
				});
				setStatus(
					claimLinkHint?.transactionHash || claimLinkHint?.memoHash
						? "Opened a claim link, but this wallet could not decrypt the linked private gift. Check that you are using the intended recipient wallet."
						: "Scanned the recent range but found no private matches for this recipient.",
				);
				return;
			}

			setStatus(
				exactRegisteredGiftMemo
					? "Private note decrypted. Reconstructing the pool proof path..."
					: `Matched ${decryptedMatches.length} gift${decryptedMatches.length === 1 ? "" : "s"}. Reconstructing pool proof path...`,
			);

			let depositScan = await scanPoolDeposits({
				ethRpcUrl,
				fromBlock: POOL_DEPOSIT_HISTORY_FROM_BLOCK,
				poolAddress: poolAddress as Address,
				publicClient,
				toBlock: latestBlock,
				wsUrl,
			});
			const poolProofContext = await readPoolProofContext(publicClient, poolAddress as Address);

			const matches: MatchedPrivateWithdrawal[] = [];
			for (const decryptedMatch of decryptedMatches) {
				let merkleProof: Awaited<ReturnType<typeof computeMerkleProofForDeposit>>;
				try {
					merkleProof = await computeMerkleProofForDeposit(
						depositScan.deposits,
						decryptedMatch.note.commitment,
						poolProofContext,
					);
				} catch (cause) {
					if (!isMissingPoolDepositError(cause)) {
						throw cause;
					}
					setStatus("Gift decrypted. Refreshing public pool history for this note...");
					depositScan = await scanPoolDeposits({
						bypassCache: true,
						ethRpcUrl,
						fromBlock: POOL_DEPOSIT_HISTORY_FROM_BLOCK,
						poolAddress: poolAddress as Address,
						publicClient,
						toBlock: latestBlock,
						wsUrl,
					});
					try {
						merkleProof = await computeMerkleProofForDeposit(
							depositScan.deposits,
							decryptedMatch.note.commitment,
							poolProofContext,
						);
					} catch (refreshedCause) {
						throw enrichMissingPoolDepositError(refreshedCause, depositScan.note);
					}
				}
				const spent = await publicClient.readContract({
					address: poolAddress,
					abi: privatePoolAbi,
					functionName: "nullifierHashes",
					args: [decryptedMatch.note.nullifierHash],
				});

				matches.push({
					...decryptedMatch,
					merkleProof,
					spent,
				});
			}

			setReadback({
				fromBlock:
					fromBlock > announcementScan.fromBlock ? fromBlock : announcementScan.fromBlock,
				matches,
				note: announcementScan.note || depositScan.note,
				privateAnnouncementCount: announcementScan.announcements.length,
				poolDepositCount: depositScan.deposits.length,
				toBlock: latestBlock,
			});
			setStatus(
				matches.length > 0
					? `Found ${matches.length} private gift${matches.length === 1 ? "" : "s"} ready to claim.`
					: exactRegisteredGiftMemo && announcementScan.announcements.length === 0
						? "Opened a claim link, but the exact gift announcement was not found in indexed history."
						: claimLinkHint?.transactionHash || claimLinkHint?.memoHash
							? "Opened a claim link, but this wallet could not decrypt the linked private gift. Check that you are using the intended recipient wallet."
							: "Scanned the recent range but found no private matches for this recipient.",
			);
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		}
	}

	async function prepareBearerGiftClaim() {
		if (!claimLinkHint || claimLinkHint.mode !== "bearer") {
			setError("Open a walletless bearer gift link first.");
			return;
		}
		if (claimLinkIsIncomplete) {
			setError(
				"This walletless gift link is incomplete. Ask the sender to resend the full private gift link or QR.",
			);
			return;
		}
		if (!claimLinkHint.giftKey || !claimLinkHint.memoHash) {
			setError("This walletless gift link is missing its claim key or Bulletin reference.");
			return;
		}
		if (!poolAddress || !isAddress(poolAddress)) {
			setError("Enter a valid privacy pool contract address.");
			return;
		}

		setError(null);
		setReadback(null);
		setWithdrawals({});
		setBackupReady({});
		setEmbeddedWalletReady({});
		setStatus("Opening the walletless gift and preparing a private claim wallet...");

		try {
			let claimWallet: BearerClaimWallet;
			if (!useExistingBearerDestination && isPolkadotHostEnvironment()) {
				setStatus("Using the connected P-wallet as the Dot.li claim destination...");
				const hostSession = await createPwalletTxSession();
				const mapped = await isMappedForRevive({
					originSs58: hostSession.originSs58,
					wsUrl,
				});
				if (!mapped) {
					throw new Error(
						"This P-wallet is not mapped for Revive yet. Map it once from Send Gift or Register, then reopen this gift link and claim.",
					);
				}
				const mappedAddress = await resolveReviveAddress({
					originSs58: hostSession.originSs58,
					wsUrl,
				});
				if (!isAddress(mappedAddress)) {
					throw new Error(`Mapped P-wallet destination is not a valid H160: ${mappedAddress}`);
				}
				claimWallet = {
					address: mappedAddress,
					provider: "pwallet-h160",
					providerName: "P-wallet mapped H160",
				};
			} else if (!useExistingBearerDestination && embeddedWalletProvider.available) {
				const knownEmbeddedAddress =
					bearerClaimWallet?.provider === "embedded"
						? bearerClaimWallet.address
						: embeddedWalletProvider.address;
				let providerAddress = knownEmbeddedAddress;
				if (!providerAddress) {
					setStatus(
						"Sign in with email, Google, or passkey to open a recoverable embedded wallet...",
					);
					providerAddress = await embeddedWalletProvider.ensureAddress();
				}
				if (!providerAddress) {
					setStatus("Finish sign-in, then continue to claim this walletless gift.");
					setResumeBearerClaimAfterLogin(true);
					return;
				}
				setStatus("Embedded wallet ready. Opening the private gift envelope...");
				claimWallet = {
					address: providerAddress,
					provider: "embedded",
					providerName: embeddedWalletProvider.name,
				};
			} else {
				const privateKey = generatePrivateKey();
				const account = privateKeyToAccount(privateKey);
				claimWallet = {
					address: account.address as Address,
					privateKey,
					provider: "local-vault",
					providerName: "Encrypted browser-local vault",
				};
			}
			setBearerClaimWallet(claimWallet);
			if (!useExistingBearerDestination) {
				setWithdrawDestination(claimWallet.address);
			}

			setStatus("Fetching and decrypting the private gift envelope...");
			const fetched = await fetchFromBulletinByHash(claimLinkHint.memoHash);
			const decrypted = decryptBearerGiftEnvelope({
				envelopeBytes: fetched.bytes,
				giftKey: claimLinkHint.giftKey,
			});
			const note = decrypted.payload.note;
			if (note.poolAddress.toLowerCase() !== poolAddress.toLowerCase()) {
				throw new Error("This gift link points to a different privacy pool.");
			}
			if (claimWallet.privateKey) {
				await saveEmbeddedClaimWallet({
					address: claimWallet.address,
					commitment: note.commitment,
					label: decrypted.payload.memoText || "Walletless private gift",
					memoHash: claimLinkHint.memoHash,
					poolAddress: poolAddress as Address,
					privateKey: claimWallet.privateKey,
				});
			}
			setEmbeddedWalletReady((current) => ({ ...current, [note.commitment]: true }));

			setStatus("Finding this gift in the pool and reconstructing the private proof path...");
			const publicClient = getPublicClient(ethRpcUrl);
			const latestBlock = await publicClient.getBlockNumber();
			const poolProofContext = await readPoolProofContext(publicClient, poolAddress as Address);
			let merkleProof: Awaited<ReturnType<typeof computeMerkleProofForDeposit>>;
			let depositScanNote: string | null = null;
			let poolDepositCount = poolProofContext.expectedDepositCount ?? 0;
			let scanFromBlock = POOL_DEPOSIT_HISTORY_FROM_BLOCK;
			try {
				const exactDepositScan = await scanPoolDepositByCommitment({
					commitment: note.commitment,
					ethRpcUrl,
					poolAddress: poolAddress as Address,
					publicClient,
					toBlock: latestBlock,
					wsUrl,
				});
				depositScanNote = combineScanNotes(depositScanNote, exactDepositScan.note);
				scanFromBlock =
					scanFromBlock < exactDepositScan.fromBlock ? scanFromBlock : exactDepositScan.fromBlock;
				if (!exactDepositScan.deposit) {
					throw new Error("Matching pool deposit was not found for this private note.");
				}
				merkleProof = await computeMerkleProofForDeposit(
					[exactDepositScan.deposit],
					note.commitment,
					poolProofContext,
				);
			} catch (cause) {
				if (!isMissingPoolDepositError(cause)) {
					throw cause;
				}
				setStatus("Exact lookup needs more history. Refreshing public pool history...");
				const depositScan = await scanPoolDeposits({
					bypassCache: true,
					ethRpcUrl,
					fromBlock: POOL_DEPOSIT_HISTORY_FROM_BLOCK,
					poolAddress: poolAddress as Address,
					publicClient,
					toBlock: latestBlock,
					wsUrl,
				});
				depositScanNote = combineScanNotes(depositScanNote, depositScan.note);
				poolDepositCount = depositScan.deposits.length;
				scanFromBlock =
					scanFromBlock < depositScan.fromBlock ? scanFromBlock : depositScan.fromBlock;
				try {
					merkleProof = await computeMerkleProofForDeposit(
						depositScan.deposits,
						note.commitment,
						poolProofContext,
					);
				} catch (refreshedCause) {
					throw enrichMissingPoolDepositError(refreshedCause, depositScan.note);
				}
			}
			const spent = await publicClient.readContract({
				address: poolAddress,
				abi: privatePoolAbi,
				functionName: "nullifierHashes",
				args: [note.nullifierHash],
			});

			const match: MatchedPrivateWithdrawal = {
				announcement: {
					blockNumber: 0n,
					ephemeralPubKey: "0x",
					groupKey: claimLinkHint.transactionHash ?? note.commitment,
					memoHash: claimLinkHint.memoHash,
					nonce: 0n,
					poolAddress: poolAddress as Address,
					sender: "0x0000000000000000000000000000000000000000",
					transactionHash: claimLinkHint.transactionHash ?? "0x",
					viewTag: 0,
				},
				bulletinCid: fetched.cid,
				decryptedMemo: decrypted.payload.memoText,
				merkleProof,
				note,
				spent,
			};

			setReadback({
				fromBlock: scanFromBlock,
				matches: [match],
				note: depositScanNote,
				privateAnnouncementCount: 0,
				poolDepositCount,
				toBlock: latestBlock,
			});
			setStatus(
				claimWallet.provider === "embedded"
					? "Walletless gift opened. A recoverable embedded wallet is ready, and you can claim now."
					: claimWallet.provider === "pwallet-h160"
						? "Walletless gift opened. The connected P-wallet mapped H160 is ready, and you can claim now."
					: "Walletless gift opened. A device-local fallback wallet was saved in this browser, and you can claim now.",
			);
		} catch (cause) {
			console.error(cause);
			setError(formatPrivateWithdrawError(cause));
			setStatus(null);
		}
	}
	prepareBearerGiftClaimRef.current = prepareBearerGiftClaim;

	function backupKey(match: MatchedPrivateWithdrawal) {
		return match.note.commitment;
	}

	function isMissingPoolDepositError(cause: unknown): cause is Error {
		return (
			cause instanceof Error &&
			cause.message === "Matching pool deposit was not found for this private note."
		);
	}

	function enrichMissingPoolDepositError(cause: unknown, scanNote: string | null) {
		if (isMissingPoolDepositError(cause) && scanNote) {
			return new Error(`${cause.message} ${scanNote}`);
		}
		return cause;
	}

	function combineScanNotes(...notes: Array<string | null>) {
		const uniqueNotes = Array.from(new Set(notes.filter((note): note is string => Boolean(note))));
		return uniqueNotes.length > 0 ? uniqueNotes.join(" ") : null;
	}

	async function readPoolProofContext(
		publicClient: ReturnType<typeof getPublicClient>,
		address: Address,
	): Promise<{ expectedDepositCount: number | null; subtreeHints: MerkleProofHint[] }> {
		try {
			const [nextIndex, ...filledSubtrees] = await Promise.all([
				publicClient.readContract({
					address,
					abi: privatePoolAbi,
					functionName: "nextIndex",
				}),
				...Array.from({ length: PRIVATE_POOL_TREE_DEPTH }, (_, level) =>
					publicClient.readContract({
						address,
						abi: privatePoolAbi,
						functionName: "filledSubtrees",
						args: [BigInt(level)],
					}),
				),
			]);
			const expectedDepositCount = Number(nextIndex);
			return {
				expectedDepositCount: Number.isSafeInteger(expectedDepositCount)
					? expectedDepositCount
					: null,
				subtreeHints: filledSubtrees.map((value, level) => ({
					level,
					value,
				})),
			};
		} catch {
			return {
				expectedDepositCount: null,
				subtreeHints: [],
			};
		}
	}

	function requiresRecoveryBeforeClaim() {
		return false;
	}

	async function saveRecoveryFile(
		match: MatchedPrivateWithdrawal,
		options?: { skipStatus?: boolean },
	) {
		const key = backupKey(match);
		const password = backupPasswords[key] ?? "";

		try {
			if (isBearerClaim) {
				if (!bearerClaimWallet) {
					throw new Error("Create the fresh claim wallet before saving recovery.");
				}
				if (!bearerClaimWallet.privateKey) {
					throw new Error(
						"This wallet is recovered by the embedded wallet provider; no local private key export is available from StealthPay.",
					);
				}
				const recoveryDestination = isAddress(withdrawDestination)
					? withdrawDestination
					: bearerClaimWallet.address;
				const recoveryPayload: BearerGiftRecoveryPayload = {
					claimDestination: recoveryDestination,
					claimWalletPrivateKey: bearerClaimWallet.privateKey,
					note: match.note,
					v: 1,
				};
				const backup = await exportEncryptedBearerGiftRecovery(recoveryPayload, password);
				downloadFile(
					`stealthpay-walletless-gift-${match.note.commitment.slice(2, 10)}.json`,
					serializeBearerGiftRecoveryBackup(backup),
				);
			} else {
				const backup = await exportEncryptedNoteBackup(match.note, password);
				downloadFile(
					`stealthpay-note-${match.note.commitment.slice(2, 10)}.json`,
					serializeEncryptedNoteBackup(backup),
				);
			}
			setBackupReady((current) => ({ ...current, [key]: true }));
			if (!options?.skipStatus) {
				setStatus("Recovery file saved. Private withdrawal is now enabled for this gift.");
			}
			return true;
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			return false;
		}
	}

	async function withdrawPrivately(
		match: MatchedPrivateWithdrawal,
		options?: { backupAlreadySatisfied?: boolean },
	) {
		const effectiveWithdrawDestination =
			isBearerClaim && bearerClaimWallet && !isAddress(withdrawDestination)
				? bearerClaimWallet.address
				: withdrawDestination;
		if (!effectiveWithdrawDestination || !isAddress(effectiveWithdrawDestination)) {
			setError("Enter a valid private withdraw destination.");
			return;
		}

		const key = backupKey(match);
		if (
			requiresRecoveryBeforeClaim() &&
			!options?.backupAlreadySatisfied &&
			!backupReady[key]
		) {
			setError("Prepare the walletless claim wallet before claiming this gift.");
			return;
		}

		setWithdrawals((current) => ({
			...current,
			[key]: {
				error: null,
				status: "Requesting a relayer quote...",
			},
		}));
		setError(null);

		try {
			const quote = await requestRelayerQuote({
				ethRpcUrl,
				poolAddress: poolAddress as Address,
			});
			setWithdrawals((current) => ({
				...current,
				[key]: {
					error: null,
					quoteExpiry: quote.expiry,
					quoteFee: quote.fee,
					relayer: quote.relayerAddress,
					status: "Generating a Groth16 proof in a worker...",
				},
			}));

			let proofCoordinates:
				| {
						pA: [string, string];
						pB: [[string, string], [string, string]];
						pC: [string, string];
				  }
				| undefined;

			try {
				const proof = await generatePrivateWithdrawProof({
					expiry: quote.expiry,
					fee: quote.fee,
					merkleProof: match.merkleProof,
					note: match.note,
					recipient: effectiveWithdrawDestination,
					relayer: quote.relayerAddress,
				});
				proofCoordinates = {
					pA: proof.pA,
					pB: proof.pB,
					pC: proof.pC,
				};
			} catch (cause) {
				console.error(cause);
				setWithdrawals((current) => ({
					...current,
					[key]: {
						error: cause instanceof Error ? cause.message : String(cause),
						quoteExpiry: quote.expiry,
						quoteFee: quote.fee,
						relayer: quote.relayerAddress,
						status: "Browser proving failed. The relayer cannot receive private witness data, so the claim was not submitted.",
					},
				}));
				return;
			}

			const result = await submitRelayedPrivateWithdraw({
				ethRpcUrl,
				expiry: quote.expiry,
				fee: quote.fee,
				nullifierHash: match.note.nullifierHash,
				pA: proofCoordinates.pA,
				pB: proofCoordinates.pB,
				pC: proofCoordinates.pC,
				poolAddress: poolAddress as Address,
				quoteId: quote.quoteId,
				recipient: effectiveWithdrawDestination,
				root: match.merkleProof.root,
			});

			setWithdrawals((current) => ({
				...current,
				[key]: {
					error: null,
					quoteExpiry: quote.expiry,
					quoteFee: quote.fee,
					relayer: quote.relayerAddress,
					status: "Private withdrawal confirmed.",
					transactionHash: result.transactionHash,
				},
			}));
			setReadback((current) =>
				current
					? {
							...current,
							matches: current.matches.map((candidate) =>
								candidate.note.commitment === match.note.commitment
									? { ...candidate, spent: true }
									: candidate,
							),
						}
					: current,
			);
			recordPrivateGiftClaimed({
				claimedAt: Date.now(),
				commitment: match.note.commitment,
				destination: effectiveWithdrawDestination,
				giftMode: isBearerClaim ? "bearer" : "registered",
				memoPreview: match.decryptedMemo,
				poolAddress: poolAddress as Address,
				quoteFee: quote.fee.toString(),
				relayer: quote.relayerAddress,
				transactionHash: result.transactionHash,
			});
		} catch (cause) {
			console.error(cause);
			setWithdrawals((current) => ({
				...current,
				[key]: {
					...current[key],
					error: formatPrivateWithdrawError(cause),
					status: null,
				},
			}));
		}
	}

	async function saveRecoveryAndClaim(match: MatchedPrivateWithdrawal) {
		if (!requiresRecoveryBeforeClaim()) {
			await withdrawPrivately(match);
			return;
		}

		const key = backupKey(match);
		if (!backupReady[key]) {
			const saved = await saveRecoveryFile(match, { skipStatus: true });
			if (!saved) {
				return;
			}
			setStatus("Recovery file saved. Claiming the gift privately...");
			await withdrawPrivately(match, { backupAlreadySatisfied: true });
			return;
		}

		await withdrawPrivately(match, { backupAlreadySatisfied: true });
	}

	return (
		<div className="space-y-6 animate-fade-in">
			{consumerMode ? (
				<div className="gift-panel space-y-5">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="space-y-3 max-w-3xl">
							<span className="gift-chip">
								{readback?.matches.length
									? "Gift found"
									: claimLinkIsIncomplete
										? "Gift link incomplete"
									: hasClaimLink
										? "Private gift link"
										: "Gift opener"}
							</span>
							<h1 className="page-title">Open your private gift</h1>
							<p className="text-sm text-text-secondary">
								Open a private gift link or QR, then let StealthPay guide the gift
								from discovery to private claim.
							</p>
						</div>
						<div className="dark-emerald-surface min-w-[220px] rounded-2xl border border-emerald-900/15 bg-emerald-900 px-4 py-4 shadow-[0_18px_36px_-28px_rgba(24,55,45,0.9)]">
							<div className="surface-muted text-xs uppercase tracking-[0.18em]">
								Status
							</div>
							<div className="mt-2 text-lg font-semibold">
								{withdrawals &&
								Object.values(withdrawals).some((item) => item.transactionHash)
									? "Claimed privately"
									: readback?.matches.length
										? "Ready to claim"
										: claimLinkIsIncomplete
											? "Gift link incomplete"
										: snapshot
											? "Wallet connected"
											: hasClaimLink
												? "Link opened"
												: "Awaiting gift link"}
							</div>
							<p className="surface-muted mt-2 text-sm">
								{withdrawals &&
								Object.values(withdrawals).some((item) => item.transactionHash)
									? "The gift has already been claimed through the relayer."
									: claimLinkIsIncomplete
										? "The QR or link is missing required claim data."
									: isBearerClaim
										? "The happy path is scan, sign in, and claim."
										: "The happy path is open, connect your StealthPay account, and claim."}
							</p>
						</div>
					</div>

					{hasClaimLink ? (
						<div className="rounded-xl border border-coral-500/20 bg-coral-50 px-4 py-3 text-sm text-coral-800">
							{claimLinkIsIncomplete ? (
								<>
									This private gift link or QR is incomplete. Ask the sender to
									resend the full StealthPay gift link from the gift success
									screen.
								</>
							) : isBearerClaim ? (
								<>
									You opened a walletless gift link or QR. Sign in to your
									StealthPay account to claim into a recoverable wallet. If no
									provider is configured, StealthPay keeps the device-local vault
									as an advanced fallback.
								</>
							) : (
								<>
									You opened a private gift link or QR. Connect the recipient
									wallet and click <strong>Open Gift</strong>. The app will search
									for the linked gift automatically.
								</>
							)}
						</div>
					) : (
						<div className="paper-surface px-4 py-4 text-sm text-text-secondary">
							<div className="font-medium text-text-primary">
								No gift link detected.
							</div>
							<p className="mt-1">
								Open the private gift link or scan the QR you received to start the
								guided claim flow. If you need the technical recovery screen
								instead, use{" "}
								<a href={advancedClaimHref} className="text-emerald-700 underline">
									advanced claim tools
								</a>
								.
							</p>
						</div>
					)}

					<div className="grid gap-3 md:grid-cols-3">
						<div className="gift-step">
							<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
								1. Open
							</div>
							<div className="mt-2 text-sm font-medium text-text-primary">
								Open link or QR
							</div>
							<p className="mt-2 text-sm text-text-secondary">
								The gift preloads claim context so you do not have to configure the
								protocol manually.
							</p>
						</div>
						<div className="gift-step">
							<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
								2. Connect
							</div>
							<div className="mt-2 text-sm font-medium text-text-primary">
								{claimLinkIsIncomplete
									? "Request a complete gift link"
									: isBearerClaim
									? "Sign in to StealthPay"
									: "Connect the recipient wallet"}
							</div>
							<p className="mt-2 text-sm text-text-secondary">
								{claimLinkIsIncomplete
									? "The sender should resend the private link or QR from the gift success screen."
									: isBearerClaim
									? "StealthPay opens a recoverable H160 wallet with email, Google, or passkey."
									: "The app derives the hidden private wallet identity behind the recipient account and searches for the gift."}
							</p>
						</div>
						<div className="gift-step">
							<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
								3. Claim
							</div>
							<div className="mt-2 text-sm font-medium text-text-primary">
								{claimLinkIsIncomplete ? "Open a valid gift" : "Claim privately"}
							</div>
							<p className="mt-2 text-sm text-text-secondary">
								{claimLinkIsIncomplete
									? "Once a complete link is opened, StealthPay can continue with the normal private claim flow."
									: isBearerClaim
									? "Once found, the app claims through the relayer to your StealthPay wallet."
									: "Once found, the app claims through the relayer without exposing a direct sender-to-recipient payment trail."}
							</p>
						</div>
					</div>

					{claimedWithdrawal?.transactionHash ? (
						<div className="gift-success-card space-y-3">
							<div className="flex flex-wrap items-start justify-between gap-4">
								<div>
									<div className="text-xs uppercase tracking-[0.18em] text-accent-green">
										Gift claimed privately
									</div>
									<div className="mt-2 text-lg font-semibold text-text-primary">
										The gift has been delivered through the relayer
									</div>
									<p className="mt-2 text-sm text-text-secondary max-w-3xl">
										{isBearerClaim
											? "The public chain now shows a pool payout rather than a direct sender-to-recipient payment. In Dot.li the payout can go to the connected P-wallet's mapped H160; outside Dot.li it can go to the embedded wallet provider or a fallback destination."
											: "The public chain now shows a pool payout rather than a direct sender-to-recipient payment."}
									</p>
								</div>
								<span className="gift-chip">Claim complete</span>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<SimpleInfoItem
									label="Claim Transaction"
									value={claimedWithdrawal.transactionHash}
								/>
								<SimpleInfoItem
									label="Private Message"
									value={claimedMatch?.decryptedMemo || "No message attached"}
								/>
							</div>
						</div>
					) : null}
				</div>
			) : (
				<div className="card space-y-3">
					<h1 className="page-title">Claim a Private Gift</h1>
					<p className="text-sm text-text-secondary max-w-3xl">
						Open a private gift, let the app find the matching claim for your wallet,
						and claim it privately through the relayer. Public recovery stays in the
						separate advanced flow.
					</p>
				</div>
			)}

			<div className="card space-y-4">
				<h2 className="section-title">
					{claimLinkIsIncomplete
						? "Gift link incomplete"
						: isBearerClaim
						? "Sign in to claim"
						: consumerMode
							? "Connect Recipient Wallet"
							: "Private Wallet"}
				</h2>
				<p className="text-sm text-text-secondary">
					{claimLinkIsIncomplete
						? "StealthPay can see that a gift link was opened, but required route data is missing or malformed. The safest next step is to request a fresh link or QR from the sender."
						: isBearerClaim
						? "This is a walletless bearer gift. Sign in and StealthPay claims it to your recoverable wallet."
						: consumerMode
							? "Use the wallet that should receive this gift. The app will load the hidden private wallet identity behind it and search for the matching claim."
							: "Unlock the private wallet identity that receives and decrypts incoming private gifts."}
				</p>

				{claimLinkIsIncomplete ? (
					<div className="paper-surface space-y-3 px-4 py-4">
						<div className="text-sm font-semibold text-text-primary">
							Do not continue from this URL
						</div>
						<p className="text-sm text-text-secondary">
							A valid private gift link must include pool, registry, and either
							registered-recipient data or bearer gift key data. This route is missing
							enough context that claiming would be unsafe and unreliable.
						</p>
						<div className="flex flex-wrap gap-3">
							<a href="#/gift" className="btn-secondary">
								Open Gift Page
							</a>
							<a href={advancedClaimHref} className="btn-secondary">
								Advanced Recovery Tools
							</a>
						</div>
					</div>
				) : consumerMode && isBearerClaim ? (
					<div className="soft-success space-y-3 py-4">
						<div className="text-sm font-semibold">
							{isPolkadotHostEnvironment()
								? "Dot.li claim uses P-wallet"
								: "No wallet setup required"}
						</div>
						<p className="text-sm text-text-secondary">
							{isPolkadotHostEnvironment()
								? "This link is the private claim capability until redeemed. Inside Dot.li, StealthPay claims to your connected P-wallet's mapped H160 address so the flow does not depend on Privy or browser extensions."
								: "This link is the private claim capability until redeemed. Keep it private. By default, StealthPay claims to a recoverable H160 wallet so the destination is not your existing public wallet."}
						</p>
						{bearerClaimWallet ? (
							<div className="paper-surface">
								<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
									StealthPay wallet
								</div>
								<div className="mt-2 break-all font-mono text-sm text-text-primary">
									{bearerClaimWallet.address}
								</div>
								<p className="mt-2 text-xs text-text-muted">
									Provider: {bearerClaimWallet.providerName}
								</p>
								<p className="mt-2 text-xs text-text-muted">
									Backup and device-transfer controls live in Wallet after the
									claim. The gift claim itself does not require a file download.
								</p>
							</div>
						) : null}
					</div>
				) : consumerMode ? (
					<div className="paper-surface space-y-3 px-4 py-4">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-sm font-medium text-text-primary">
									Recommended: Browser Extension
								</div>
								<p className="mt-1 text-sm text-text-secondary">
									Use the wallet extension that owns this gift link. Recovery and
									non-standard wallet modes stay under advanced options.
								</p>
							</div>
							{walletMode !== "browser-extension" ? (
								<span className="rounded-full bg-accent-yellow/15 px-3 py-1 text-xs font-semibold text-accent-yellow">
									Advanced mode active
								</span>
							) : null}
						</div>
						<details className="paper-surface">
							<summary className="cursor-pointer list-none text-sm font-semibold text-text-secondary">
								Use a different wallet type or recovery method
							</summary>
							<div className="mt-4 flex flex-wrap gap-2">
								{[
									["browser-extension", "Browser Extension"],
									["pwallet-host", "Pwallet / Host"],
									["dev-account", "Local Dev Signer"],
								].map(([value, label]) => (
									<button
										key={value}
										type="button"
										className={
											walletMode === value ? "btn-primary" : "btn-secondary"
										}
										onClick={() => setWalletMode(value as RegisterWalletMode)}
									>
										{label}
									</button>
								))}
							</div>
						</details>
					</div>
				) : (
					<div className="flex flex-wrap gap-2">
						{[
							["browser-extension", "Browser Extension"],
							["pwallet-host", "Pwallet / Host"],
							["dev-account", "Local Dev Signer"],
						].map(([value, label]) => (
							<button
								key={value}
								type="button"
								className={walletMode === value ? "btn-primary" : "btn-secondary"}
								onClick={() => setWalletMode(value as RegisterWalletMode)}
							>
								{label}
							</button>
						))}
					</div>
				)}

				{needsSupportedWalletBrowser ? (
					<div className="soft-warning space-y-3">
						<div>
							<div className="text-sm font-semibold">
								This browser cannot access your wallet extension
							</div>
							<p className="mt-2 text-sm text-text-secondary">
								The easiest path is to reopen this same gift link in a browser where
								your recipient wallet extension is installed. If you intentionally
								want a different setup, switch to a recovery method below instead of
								trying to continue with an empty extension state.
							</p>
						</div>
						<div className="flex flex-wrap gap-3">
							<button
								type="button"
								className="btn-primary"
								onClick={() => void copyCurrentGiftLink()}
							>
								{claimLinkCopied ? "Gift Link Copied" : "Copy Gift Link"}
							</button>
							<button
								type="button"
								className="btn-secondary"
								onClick={() => setWalletMode("pwallet-host")}
							>
								Use Pwallet / Host Instead
							</button>
							<a href={advancedClaimHref} className="btn-secondary">
								Open Recovery Tools
							</a>
						</div>
					</div>
				) : null}

				{!claimLinkIsIncomplete &&
					!isBearerClaim &&
					walletMode === "browser-extension" &&
					(hasExtensionWallets ? (
						<div className="grid gap-4 lg:grid-cols-2">
							<div className="space-y-2">
								<label className="label">Extension Wallet</label>
								<select
									className="input-field w-full"
									value={selectedExtensionWallet}
									onChange={(event) =>
										setSelectedExtensionWallet(event.target.value)
									}
								>
									{availableExtensionWallets.map((wallet) => (
										<option key={wallet} value={wallet}>
											{wallet}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-2">
								<label className="label">Account</label>
								<select
									className="input-field w-full"
									value={selectedExtensionAccount}
									onChange={(event) =>
										setSelectedExtensionAccount(event.target.value)
									}
								>
									{extensionAccounts.length === 0 ? (
										<option value="">No accounts returned</option>
									) : (
										extensionAccounts.map((account) => (
											<option key={account.address} value={account.address}>
												{account.name || "Unnamed"} ({account.address})
											</option>
										))
									)}
								</select>
							</div>
						</div>
					) : null)}

				{!claimLinkIsIncomplete && !isBearerClaim && walletMode === "dev-account" && (
					<div className="space-y-2">
						<label className="label">Dev Signer</label>
						<select
							className="input-field w-full"
							value={devAccountIndex}
							onChange={(event) => setDevAccountIndex(Number(event.target.value))}
						>
							{devAccounts.map((account, index) => (
								<option key={account.address} value={index}>
									{account.name} ({account.address})
								</option>
							))}
						</select>
					</div>
				)}

				{claimLinkIsIncomplete ? null : consumerMode && isBearerClaim ? (
					<div className="paper-surface space-y-3 px-4 py-4">
						<div>
							<div className="text-sm font-medium text-text-primary">
								Claim destination
							</div>
							<p className="mt-1 text-sm text-text-secondary">
								{withdrawDestination
									? `The gift will currently be claimed to ${withdrawDestination}.`
									: "The app will open your StealthPay wallet before claiming. If no provider is configured, it can use a device-local fallback wallet."}
							</p>
						</div>
						<details
							className="soft-warning"
							open={useExistingBearerDestination}
							onToggle={(event) =>
								setUseExistingBearerDestination(event.currentTarget.open)
							}
						>
							<summary className="cursor-pointer list-none text-sm font-semibold text-accent-yellow">
								Claim to an existing wallet instead
							</summary>
							<div className="mt-4 space-y-2">
								<label className="label">Existing Wallet Destination</label>
								<input
									className="input-field w-full"
									value={withdrawDestination}
									onChange={(event) => setWithdrawDestination(event.target.value)}
									placeholder="0x... existing wallet address"
								/>
								<p className="text-xs text-text-muted">
									This is more convenient, but weaker for privacy because the
									final pool payout goes to a wallet that may already be linked to
									you.
								</p>
							</div>
						</details>
					</div>
				) : consumerMode ? (
					<div className="paper-surface space-y-3 px-4 py-4">
						<div>
							<div className="text-sm font-medium text-text-primary">
								Claim destination
							</div>
							<p className="mt-1 text-sm text-text-secondary">
								{withdrawDestination
									? `The gift will currently be claimed to ${withdrawDestination}.`
									: "By default, the gift will be claimed to the connected wallet after it is unlocked."}
							</p>
						</div>
						<details className="paper-surface">
							<summary className="cursor-pointer list-none text-sm font-semibold text-text-secondary">
								Claim to a different wallet
							</summary>
							<div className="mt-4 space-y-2">
								<label className="label">Custom Claim Destination</label>
								<input
									className="input-field w-full"
									value={withdrawDestination}
									onChange={(event) => setWithdrawDestination(event.target.value)}
									placeholder="Fresh wallet address for best privacy"
								/>
								<p className="text-xs text-text-muted">
									Use a fresh wallet address for best privacy. Claiming to a known
									wallet is more convenient, but weaker for privacy.
								</p>
							</div>
						</details>
					</div>
				) : (
					<div className="space-y-2">
						<label className="label">Claim Destination</label>
						<input
							className="input-field w-full"
							value={withdrawDestination}
							onChange={(event) => setWithdrawDestination(event.target.value)}
							placeholder="Fresh wallet address for best privacy"
						/>
						<p className="text-xs text-text-muted">
							Use a fresh wallet address for best privacy. Claiming to a known wallet
							is more convenient, but weaker for privacy.
						</p>
					</div>
				)}

				{claimLinkHint?.recipientOwner ? (
					<div className="paper-surface px-4 py-3 text-sm text-text-secondary">
						Claim link recipient hint:{" "}
						<span className="font-mono">{claimLinkHint.recipientOwner}</span>
					</div>
				) : null}

				{claimLinkIsIncomplete ? null : (
					<div className="flex flex-wrap gap-3">
						<button
							type="button"
							className="btn-primary"
							onClick={isBearerClaim ? prepareBearerGiftClaim : deriveRecipientKeys}
							disabled={needsSupportedWalletBrowser}
						>
							{isBearerClaim
								? bearerClaimWallet
									? "Find Gift Again"
									: "Sign in and open gift"
								: claimLinkHint
									? "Open Gift"
									: "Unlock Private Wallet"}
						</button>
						{snapshot && !isBearerClaim && (!consumerMode || hasClaimLink) ? (
							<button
								type="button"
								className="btn-secondary"
								onClick={() => scanPrivateWithdrawals()}
							>
								{claimLinkHint ? "Search Again" : "Find My Gifts"}
							</button>
						) : null}
					</div>
				)}

				{!consumerMode || hasClaimLink ? (
					<details className="paper-surface">
						<summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
							{consumerMode
								? "Recovery and troubleshooting"
								: "Advanced Claim Settings"}
						</summary>
						<div className="mt-4 grid gap-4 lg:grid-cols-2">
							<div className="space-y-2">
								<label className="label">StealthPay PVM Contract</label>
								<input
									className="input-field w-full"
									value={contractAddress}
									onChange={(event) =>
										setStoredAddress(
											contractStorageKey,
											setContractAddress,
											event.target.value,
										)
									}
									placeholder="0x..."
								/>
							</div>
							<div className="space-y-2">
								<label className="label">Privacy Pool Contract</label>
								<input
									className="input-field w-full"
									value={poolAddress}
									onChange={(event) =>
										setStoredAddress(
											poolStorageKey,
											setPoolAddress,
											event.target.value,
										)
									}
									placeholder="0x..."
								/>
							</div>
							<div className="space-y-2">
								<label className="label">
									{consumerMode
										? "Restore from Recovery Seed"
										: "Private Wallet Seed Import"}
								</label>
								<textarea
									className="input-field min-h-[86px] w-full"
									value={importSeedHex}
									onChange={(event) => setImportSeedHex(event.target.value)}
									placeholder={
										consumerMode
											? "Paste a saved recovery seed only if you are restoring on a new browser"
											: "0x... only when restoring onto a new browser"
									}
								/>
							</div>
							<div className="space-y-2">
								<label className="label">Scan Range</label>
								<input
									className="input-field w-full"
									value={scanDepthInput}
									onChange={(event) => setScanDepthInput(event.target.value)}
								/>
							</div>
						</div>
					</details>
				) : null}

				{status ? (
					<div className="rounded-xl border border-accent-blue/25 bg-accent-blue/10 px-4 py-3 text-sm text-accent-blue">
						{status}
					</div>
				) : null}
				{error ? (
					<div className="rounded-xl border border-accent-red/25 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
						{error}
					</div>
				) : null}
			</div>

			{snapshot && (!consumerMode || hasClaimLink) ? (
				<details className="card">
					<summary className="cursor-pointer list-none section-title">
						Advanced wallet details
					</summary>
					<dl className="mt-4 grid gap-4 md:grid-cols-2">
						<InfoItem label="Wallet Adapter" value={snapshot.session.providerLabel} />
						<InfoItem label="Origin SS58" value={snapshot.session.originSs58} />
						<InfoItem label="Recipient Owner (H160)" value={snapshot.ownerAddress} />
						<InfoItem label="Derived Meta-Address" value={snapshot.metaAddressHex} />
						<InfoItem label="Stealth Seed Source" value={snapshot.seed.source} />
						<InfoItem
							label="Stealth Seed Backup"
							value={snapshot.seed.record.seedHex}
						/>
					</dl>
				</details>
			) : null}

			{readback ? (
				<div className="space-y-4">
					<div className="card space-y-4">
						<h2 className="section-title">
							{consumerMode ? "Gift Summary" : "Claim Summary"}
						</h2>
						<div className="grid gap-4 md:grid-cols-3">
							<SimpleInfoItem
								label={consumerMode ? "Gift Matches" : "Gifts Found"}
								value={readback.matches.length.toString()}
							/>
							<SimpleInfoItem
								label={consumerMode ? "Search Window" : "Scan Window"}
								value={`${readback.fromBlock.toString()} -> ${readback.toBlock.toString()}`}
							/>
							<SimpleInfoItem
								label="Claim Status"
								value={
									readback.matches.length > 0
										? consumerMode
											? "Ready for a private claim"
											: "Ready to save recovery and claim"
										: "No matching gifts in this scan window"
								}
							/>
						</div>
						{readback.note ? (
							<div className="soft-warning px-4 py-3">{readback.note}</div>
						) : null}
						{!consumerMode || hasClaimLink ? (
							<details className="paper-surface">
								<summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
									Advanced scan details
								</summary>
								<dl className="mt-4 grid gap-4 md:grid-cols-2">
									<InfoItem
										label="Private Announcements Considered"
										value={readback.privateAnnouncementCount.toString()}
									/>
									<InfoItem
										label="Pool Deposits Considered"
										value={readback.poolDepositCount.toString()}
									/>
								</dl>
							</details>
						) : null}
					</div>

					{readback.matches.map((match) => {
						const key = backupKey(match);
						const withdrawalState = withdrawals[key];
						return (
							<div key={key} className="card space-y-4">
								<div className="flex items-center justify-between gap-4">
									<h3 className="section-title !mb-0">
										{consumerMode
											? "Your Gift Is Ready"
											: "Gift Ready to Claim"}
									</h3>
									<span
										className={`rounded-full px-3 py-1 text-xs font-semibold ${
											match.spent
												? "bg-accent-yellow/15 text-accent-yellow"
												: "bg-accent-green/15 text-accent-green"
										}`}
									>
										{match.spent ? "Already withdrawn" : "Ready to claim"}
									</span>
								</div>

								<div className="grid gap-4 md:grid-cols-2">
									<SimpleInfoItem
										label={
											isBearerClaim
												? "Gift Type"
												: consumerMode
													? "Gift From"
													: "Sender"
										}
										value={
											isBearerClaim
												? "Walletless bearer link"
												: match.announcement.sender
										}
									/>
									<SimpleInfoItem
										label={consumerMode ? "Private Message" : "Gift Note"}
										value={match.decryptedMemo || "No message attached"}
									/>
								</div>

								{isBearerClaim ? (
									<div className="soft-success space-y-3 p-4">
										<p className="text-sm text-text-secondary">
											{bearerClaimWallet?.provider === "embedded"
												? "The payout wallet is managed by the embedded wallet provider. Claim now; recovery is handled by that provider."
												: bearerClaimWallet?.provider === "pwallet-h160"
													? "The payout goes to the connected P-wallet's mapped H160 address. This avoids Privy and browser-extension dependencies inside Dot.li."
													: "The payout wallet is stored in this browser's encrypted local fallback vault. Claim now; backup is a Wallet-page setting, not a blocking step."}
										</p>
										<p className="text-xs text-text-muted">
											Wallet status:{" "}
											{embeddedWalletReady[key] ? "ready" : "not ready"}
										</p>
										<Link to="/wallet" className="btn-secondary inline-flex">
											Open Wallet Backup
										</Link>
									</div>
								) : (
									<details className="paper-surface">
										<summary className="cursor-pointer text-sm font-semibold text-text-primary">
											Optional recovery export
										</summary>
										<div className="mt-3 space-y-3">
											<p className="text-sm text-text-secondary">
												Registered gifts are recoverable from the recipient
												wallet identity and Bulletin payload. This export is
												optional and intended only as an extra local backup.
											</p>
											<div className="flex flex-col gap-3 md:flex-row">
												<input
													className="input-field flex-1"
													type="password"
													value={backupPasswords[key] ?? ""}
													onChange={(event) =>
														setBackupPasswords((current) => ({
															...current,
															[key]: event.target.value,
														}))
													}
													placeholder="Optional backup password"
												/>
												<button
													type="button"
													className="btn-secondary"
													onClick={() => void saveRecoveryFile(match)}
												>
													Export Optional Backup
												</button>
											</div>
											<p className="text-xs text-text-muted">
												Optional backup exported:{" "}
												{backupReady[key] ? "yes" : "no"}
											</p>
										</div>
									</details>
								)}

								<div className="flex flex-wrap gap-3">
									<button
										type="button"
										className="btn-primary"
										disabled={match.spent}
										onClick={() => void saveRecoveryAndClaim(match)}
									>
										{requiresRecoveryBeforeClaim()
											? backupReady[key]
												? "Claim to Fresh Wallet"
												: "Save Wallet Recovery and Claim"
											: isBearerClaim
												? "Claim to Private Wallet"
												: consumerMode
													? "Claim Gift Privately"
													: "Claim Privately"}
									</button>
								</div>

								{withdrawalState?.status ? (
									<div className="soft-info">{withdrawalState.status}</div>
								) : null}
								{withdrawalState?.error ? (
									<div className="soft-danger">{withdrawalState.error}</div>
								) : null}
								{withdrawalState?.transactionHash ? (
									<div className="space-y-3">
										{consumerMode ? (
											<div className="soft-success px-4 py-4">
												<div className="text-sm font-medium">
													Gift claimed privately
												</div>
												<p className="mt-2 text-sm text-text-secondary">
													The gift has been withdrawn through the relayer.
													The chain now shows a pool payout rather than a
													direct sender-to-recipient payment.
												</p>
											</div>
										) : null}
										<div className="grid gap-4 md:grid-cols-2">
											<SimpleInfoItem
												label="Claim Transaction"
												value={withdrawalState.transactionHash}
											/>
											<SimpleInfoItem
												label="Claim Status"
												value="Completed through the relayer"
											/>
										</div>
										{!consumerMode || hasClaimLink ? (
											<details className="paper-surface">
												<summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
													Advanced claim details
												</summary>
												<dl className="mt-4 grid gap-4 md:grid-cols-2">
													<InfoItem
														label="Relayer"
														value={withdrawalState.relayer || "—"}
													/>
													<InfoItem
														label="Quoted Fee"
														value={
															withdrawalState.quoteFee !== undefined
																? withdrawalState.quoteFee.toString()
																: "—"
														}
													/>
													<InfoItem
														label="Quote Expiry"
														value={
															withdrawalState.quoteExpiry !==
															undefined
																? withdrawalState.quoteExpiry.toString()
																: "—"
														}
													/>
													<InfoItem
														label="Bulletin CID"
														value={match.bulletinCid}
													/>
													<InfoItem
														label="Commitment"
														value={match.note.commitment}
													/>
													<InfoItem
														label="Nullifier Hash"
														value={match.note.nullifierHash}
													/>
													<InfoItem
														label="Merkle Root"
														value={match.merkleProof.root}
													/>
													<InfoItem
														label="Leaf Index"
														value={match.merkleProof.leafIndex.toString()}
													/>
													<InfoItem
														label="Announcement Reference"
														value={
															match.announcement.transactionHash === "0x"
																? "Announcement reference not indexed yet"
																: match.announcement.transactionHash
														}
													/>
													<InfoItem
														label="Announcement Nonce"
														value={match.announcement.nonce.toString()}
													/>
													<InfoItem
														label="Pool Address"
														value={match.note.poolAddress}
													/>
												</dl>
											</details>
										) : null}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			) : null}
		</div>
	);
}

function InfoItem({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-xs uppercase tracking-[0.16em] text-text-muted">{label}</dt>
			<dd className="mt-1 break-all font-mono text-sm text-text-primary">{value}</dd>
		</div>
	);
}

function SimpleInfoItem({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-xs uppercase tracking-[0.16em] text-text-muted">{label}</dt>
			<dd className="mt-1 break-words text-sm text-text-primary">{value}</dd>
		</div>
	);
}

function hexToBytes(value: `0x${string}`) {
	const normalized = value.startsWith("0x") ? value.slice(2) : value;
	const out = new Uint8Array(normalized.length / 2);
	for (let i = 0; i < normalized.length; i += 2) {
		out[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
	}
	return out;
}
