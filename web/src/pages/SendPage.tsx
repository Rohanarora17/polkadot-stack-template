import { useEffect, useMemo, useState } from "react";
import { bytesToHex } from "@noble/hashes/utils.js";
import { stack_template } from "@polkadot-api/descriptors";
import { Binary } from "polkadot-api";
import type { InjectedPolkadotAccount } from "polkadot-api/pjs-signer";
import { type Address, encodeFunctionData } from "viem";

import { deployments } from "../config/deployments";
import {
	evmDevAccounts,
	getInjectedWalletClient,
	getPublicClient,
	getWalletClient,
} from "../config/evm";
import {
	EXPERIMENTAL_NATIVE_POOL_ADDRESS,
	EXPERIMENTAL_NATIVE_POOL_DENOMINATION,
	MSG_VALUE_PROBE_ADDRESS,
	msgValueProbeAbi,
} from "../config/experimentalNativePool";
import { privatePoolAbi } from "../config/privatePool";
import { stealthPayAbi } from "../config/stealthPay";
import {
	PRIVATE_POOL_DENOMINATION,
	encodePrivateDeliveryPayload,
	createPrivateNote,
} from "../crypto/privatePool";
import {
	createNeutralBearerAnnouncement,
	encryptBearerGiftEnvelope,
	generateBearerGiftKey,
} from "../crypto/bearerGift";
import { encryptPrivateNote } from "../crypto/privateNote";
import {
	decodeMetaAddress,
	deriveStealthAddress,
	type HexString,
	type StealthPayment,
} from "../crypto/stealth";
import { checkBulletinAuthorization, uploadToBulletin } from "../hooks/useBulletin";
import { useChainStore } from "../store/chainStore";
import {
	DEFAULT_STORAGE_DEPOSIT_LIMIT,
	DEFAULT_WEIGHT_LIMIT,
	UNIT_PLANCK,
	contractValueToReviveCallValue,
	ensureMappedForRevive,
	resolveReviveAddress,
	toReviveDest,
} from "../utils/stealthRevive";
import {
	createBrowserExtensionTxSession,
	createDevTxSession,
	createPwalletTxSession,
	getBrowserExtensionAccounts,
	listBrowserExtensions,
	type TransactionWalletMode,
	type TransactionWalletSession,
} from "../wallet/stealthRegister";
import { devAccounts } from "../hooks/useAccount";
import { getClient } from "../hooks/useChain";
import { buildGiftLink } from "../utils/claimLinks";
import { formatDispatchError } from "../utils/format";
import { resolveRecipientOwner, type ResolvedRecipient } from "../utils/recipientResolver";
import { recordPrivateGiftCreated } from "../utils/walletActivity";

const SEND_STORAGE_KEY_PREFIX = "stealthpay-private-send-address";
const POOL_STORAGE_KEY_PREFIX = "stealthpay-private-pool-address";
const MEMO_LIMIT_BYTES = 512;

type DepositTxMode = "substrate-revive" | "evm-injected" | "evm-dev";
type GiftMode = "registered" | "bearer";

type RecipientSnapshot = {
	metaAddressHex: HexString;
	owner: Address;
};

type UnregisteredRecipientFallback = {
	recipient: ResolvedRecipient;
};

type PreparedPrivateSend = {
	announcementPubKey: Uint8Array;
	bearerGiftKey: HexString | null;
	bulletinPayloadBytes: Uint8Array;
	giftMode: GiftMode;
	note: Awaited<ReturnType<typeof createPrivateNote>>["note"];
	payment: StealthPayment | null;
	recipientOwner: Address | null;
	viewTag: number;
};

type SendReadback = {
	announcementCountAfter: bigint;
	bearerGiftKey: HexString | null;
	bulletinCid: string;
	bulletinSignerOrigin: string;
	depositPathLabel: string;
	depositTransactionHash: HexString | null;
	giftMode: GiftMode;
	memoHash: HexString;
	noteCommitment: HexString;
	noteNullifierHash: HexString;
	poolAddress: Address;
	poolRootAfter: HexString;
	recipientOwner: Address | null;
	scope: HexString;
	senderOwner: Address;
};

function scopedStorageKey(prefix: string, ethRpcUrl: string) {
	return `${prefix}:${ethRpcUrl}`;
}

function isAddress(value: string): value is Address {
	return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function formatHex(bytes: Uint8Array) {
	return `0x${bytesToHex(bytes)}` as const;
}

function validateOptionalMemo(memoText: string) {
	const bytes = new TextEncoder().encode(memoText);
	if (bytes.length > MEMO_LIMIT_BYTES) {
		throw new Error(`Private memo is too large. Maximum is ${MEMO_LIMIT_BYTES} UTF-8 bytes.`);
	}
}

type RevivePreflightLike = {
	gas_consumed?: bigint;
	max_storage_deposit?: { type?: string; value?: bigint };
	result?: {
		success?: boolean;
		type?: string;
		value?: unknown;
	};
	storage_deposit?: { type?: string; value?: bigint };
	weight_required?: { proof_size?: bigint; ref_time?: bigint };
};

function formatRevivePreflightNote(result: RevivePreflightLike) {
	const storageDeposit =
		result.storage_deposit?.type === "Charge"
			? (result.storage_deposit.value?.toString() ?? "0")
			: (result.storage_deposit?.type ?? "Unknown");
	const maxStorageDeposit =
		result.max_storage_deposit?.type === "Charge"
			? (result.max_storage_deposit.value?.toString() ?? "0")
			: (result.max_storage_deposit?.type ?? "Unknown");
	const returnData = extractReviveReturnData(result.result?.value);
	const success =
		typeof result.result?.success === "boolean"
			? result.result.success
			: result.result?.type === "Success";

	return [
		`Revive preflight ${success ? "succeeded" : "failed"}.`,
		`weight_required = (${result.weight_required?.ref_time?.toString() ?? "unknown"} ref_time, ${result.weight_required?.proof_size?.toString() ?? "unknown"} proof_size)`,
		`gas_consumed = ${result.gas_consumed?.toString() ?? "unknown"}`,
		`storage_deposit = ${storageDeposit}`,
		`max_storage_deposit = ${maxStorageDeposit}`,
		returnData !== "0x" ? `return_data = ${returnData}` : null,
		returnData === "0x" && !success ? `raw_result = ${safeJson(result.result)}` : null,
	]
		.filter(Boolean)
		.join(" ");
}

function extractReviveReturnData(value: unknown) {
	if (!value || typeof value !== "object") {
		return "0x";
	}
	const record = value as Record<string, unknown>;
	const data = record.data;
	if (data && typeof data === "object" && "asHex" in data) {
		const asHex = (data as { asHex?: unknown }).asHex;
		if (typeof asHex === "function") {
			return asHex.call(data) as string;
		}
	}
	if (typeof record.data === "string") {
		return record.data;
	}
	if (typeof record.result === "string") {
		return record.result;
	}
	if (typeof record.value === "string") {
		return record.value;
	}
	return "0x";
}

function safeJson(value: unknown) {
	try {
		return JSON.stringify(value, (_key, innerValue) =>
			typeof innerValue === "bigint" ? innerValue.toString() : innerValue,
		);
	} catch {
		return String(value);
	}
}

function sleep(ms: number) {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function SendPage() {
	const ethRpcUrl = useChainStore((s) => s.ethRpcUrl);
	const wsUrl = useChainStore((s) => s.wsUrl);

	const [walletMode, setWalletMode] = useState<TransactionWalletMode>("browser-extension");
	const [devAccountIndex, setDevAccountIndex] = useState(0);
	const [availableExtensionWallets, setAvailableExtensionWallets] = useState<string[]>([]);
	const [selectedExtensionWallet, setSelectedExtensionWallet] = useState("");
	const [extensionAccounts, setExtensionAccounts] = useState<InjectedPolkadotAccount[]>([]);
	const [selectedExtensionAccount, setSelectedExtensionAccount] = useState("");
	const [depositTxMode, setDepositTxMode] = useState<DepositTxMode>("evm-injected");
	const [giftMode, setGiftMode] = useState<GiftMode>("registered");
	const [evmDevAccountIndex, setEvmDevAccountIndex] = useState(0);
	const [evmInjectedAccount, setEvmInjectedAccount] = useState<Address | "">("");
	const [contractAddress, setContractAddress] = useState("");
	const [poolAddress, setPoolAddress] = useState("");
	const [recipientInput, setRecipientInput] = useState("");
	const [resolvedRecipient, setResolvedRecipient] = useState<ResolvedRecipient | null>(null);
	const [privateMemoText, setPrivateMemoText] = useState("");
	const [session, setSession] = useState<TransactionWalletSession | null>(null);
	const [recipientSnapshot, setRecipientSnapshot] = useState<RecipientSnapshot | null>(null);
	const [unregisteredRecipientFallback, setUnregisteredRecipientFallback] =
		useState<UnregisteredRecipientFallback | null>(null);
	const [preparedSend, setPreparedSend] = useState<PreparedPrivateSend | null>(null);
	const [readback, setReadback] = useState<SendReadback | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [preflightNote, setPreflightNote] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
	const [diagnosticsNote, setDiagnosticsNote] = useState<string | null>(null);
	const [claimLinkCopied, setClaimLinkCopied] = useState(false);

	const contractStorageKey = useMemo(
		() => scopedStorageKey(SEND_STORAGE_KEY_PREFIX, ethRpcUrl),
		[ethRpcUrl],
	);
	const poolStorageKey = useMemo(
		() => scopedStorageKey(POOL_STORAGE_KEY_PREFIX, ethRpcUrl),
		[ethRpcUrl],
	);

	const claimLink = useMemo(() => {
		if (!readback || !isAddress(contractAddress)) {
			return null;
		}

		if (readback.giftMode === "bearer") {
			if (!readback.bearerGiftKey) {
				return null;
			}
			return buildGiftLink({
				giftKey: readback.bearerGiftKey,
				memoHash: readback.memoHash,
				mode: "bearer",
				poolAddress: readback.poolAddress,
				registryAddress: contractAddress,
				transactionHash: readback.depositTransactionHash,
			});
		}

		if (!readback.recipientOwner) {
			return null;
		}

		return buildGiftLink({
			memoHash: readback.memoHash,
			mode: "registered",
			poolAddress: readback.poolAddress,
			recipientOwner: readback.recipientOwner,
			registryAddress: contractAddress,
			transactionHash: readback.depositTransactionHash,
		});
	}, [contractAddress, readback]);
	const giftPreviewMessage = privateMemoText.trim() || "You’ve received a private gift.";
	const canNativeShare =
		typeof navigator !== "undefined" && typeof navigator.share === "function";

	useEffect(() => {
		setContractAddress(
			localStorage.getItem(contractStorageKey) || deployments.stealthPayPvm || "",
		);
		setPoolAddress(localStorage.getItem(poolStorageKey) || deployments.stealthPayPoolPvm || "");
	}, [contractStorageKey, poolStorageKey]);

	useEffect(() => {
		const wallets = listBrowserExtensions();
		setAvailableExtensionWallets(wallets);
		setSelectedExtensionWallet((current) =>
			current && wallets.includes(current) ? current : (wallets[0] ?? ""),
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
				setSelectedExtensionAccount((current) =>
					current && accounts.some((account) => account.address === current)
						? current
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

	function saveAddress(storageKey: string, setter: (value: string) => void, value: string) {
		setter(value);
		if (value) {
			localStorage.setItem(storageKey, value);
		} else {
			localStorage.removeItem(storageKey);
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

	async function preparePrivateSend() {
		setError(null);
		setReadback(null);
		setClaimLinkCopied(false);
		setRecipientSnapshot(null);
		setUnregisteredRecipientFallback(null);
		setPreparedSend(null);
		setPreflightNote(null);
		setResolvedRecipient(null);
		setStatus("Connecting sender and deriving the private delivery payload...");

		try {
			if (!contractAddress || !isAddress(contractAddress)) {
				throw new Error("Enter a valid StealthPay PVM contract address.");
			}
			if (!poolAddress || !isAddress(poolAddress)) {
				throw new Error("Enter a valid privacy pool contract address.");
			}
			validateOptionalMemo(privateMemoText);

			const currentSession = await createSession();
			const recipient =
				giftMode === "registered"
					? await resolveRecipientOwner({
							ethRpcUrl,
							input: recipientInput,
							wsUrl,
						})
					: null;
			const publicClient = getPublicClient(ethRpcUrl);
			const scope = await publicClient.readContract({
				address: poolAddress,
				abi: privatePoolAbi,
				functionName: "scope",
			});
			const { note } = await createPrivateNote({
				chainId: currentSession.chainId,
				poolAddress,
				scope,
			});
			const bulletinPayloadBytes = encodePrivateDeliveryPayload({
				memoText: privateMemoText.trim() || null,
				note,
				v: 1,
			});

			let metaAddressHex: HexString | null = null;
			let payment: StealthPayment | null = null;
			let encrypted: { envelopeBytes: Uint8Array };
			let bearerGiftKey: HexString | null = null;
			let announcementPubKey: Uint8Array;
			let viewTag: number;

			if (giftMode === "registered") {
				const registeredMetaAddress = await publicClient.readContract({
					address: contractAddress,
					abi: stealthPayAbi,
					functionName: "metaAddressOf",
					args: [recipient?.owner as Address],
				});
				if (!registeredMetaAddress || registeredMetaAddress === "0x") {
					if (!recipient) {
						throw new Error(
							"Choose a recipient wallet or create a walletless gift link.",
						);
					}
					setResolvedRecipient(recipient);
					setUnregisteredRecipientFallback({ recipient });
					setStatus(null);
					setError(null);
					return;
				}
				setResolvedRecipient(recipient);
				metaAddressHex = registeredMetaAddress;
				payment = deriveStealthAddress(decodeMetaAddress(metaAddressHex));
				encrypted = encryptPrivateNote(payment.sharedSecret, bulletinPayloadBytes);
				announcementPubKey = payment.ephemeralPubKey;
				viewTag = payment.viewTag;
			} else {
				bearerGiftKey = generateBearerGiftKey();
				encrypted = encryptBearerGiftEnvelope({
					giftKey: bearerGiftKey,
					payload: {
						memoText: privateMemoText.trim() || null,
						note,
						v: 1,
					},
				});
				const neutralAnnouncement = createNeutralBearerAnnouncement();
				announcementPubKey = neutralAnnouncement.ephemeralPubKey;
				viewTag = neutralAnnouncement.viewTag;
			}

			setSession(currentSession);
			setPreparedSend({
				announcementPubKey,
				bearerGiftKey,
				bulletinPayloadBytes: encrypted.envelopeBytes,
				giftMode,
				note,
				payment,
				recipientOwner: recipient?.owner ?? null,
				viewTag,
			});
			setRecipientSnapshot(
				metaAddressHex && recipient
					? {
							metaAddressHex,
							owner: recipient.owner,
						}
					: null,
			);
			setStatus(
				giftMode === "registered"
					? "Prepared a registered-recipient private gift. Review the gift summary, then create it on-chain."
					: "Prepared a walletless bearer gift. The final link will be sensitive: anyone with it can claim before redemption.",
			);
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		}
	}

	function switchToWalletlessGift() {
		setGiftMode("bearer");
		setPreparedSend(null);
		setReadback(null);
		setRecipientSnapshot(null);
		setResolvedRecipient(null);
		setUnregisteredRecipientFallback(null);
		setError(null);
		setStatus(
			"Switched to walletless gift link. The recipient will not need a registered StealthPay wallet before claiming.",
		);
	}

	async function connectInjectedEvmWallet() {
		setError(null);
		try {
			const injected = await getInjectedWalletClient(
				ethRpcUrl,
				evmInjectedAccount || undefined,
			);
			setEvmInjectedAccount(injected.account);
			setStatus(`Connected EVM sender wallet ${injected.account}.`);
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	}

	async function runSubstrateReviveDiagnostics() {
		if (!session) {
			setError("Connect the Substrate sender wallet before running Revive diagnostics.");
			return;
		}
		if (
			!contractAddress ||
			!isAddress(contractAddress) ||
			!poolAddress ||
			!isAddress(poolAddress)
		) {
			setError("Enter valid StealthPay and privacy pool addresses before diagnostics.");
			return;
		}

		setDiagnosticsRunning(true);
		setDiagnosticsNote(null);
		setError(null);

		try {
			const publicClient = getPublicClient(ethRpcUrl);
			const typedApi = getClient(wsUrl).getTypedApi(stack_template);
			setStatus("Running Substrate Revive diagnostics...");

			await ensureMappedForRevive({
				txSigner: session.txSigner,
				wsUrl,
			});

			const [chainId, poolScope] = await Promise.all([
				publicClient.getChainId(),
				publicClient.readContract({
					address: poolAddress,
					abi: privatePoolAbi,
					functionName: "scope",
				}),
			]);
			const revivedPrivatePoolValue = contractValueToReviveCallValue(
				PRIVATE_POOL_DENOMINATION,
				chainId,
			);
			const { note } = await createPrivateNote({
				chainId: BigInt(chainId),
				poolAddress: poolAddress as Address,
				scope: poolScope,
			});
			const directPoolCall = encodeFunctionData({
				abi: privatePoolAbi,
				functionName: "deposit",
				args: [note.commitment],
			});
			const outerPrivateDepositCall = encodeFunctionData({
				abi: stealthPayAbi,
				functionName: "announcePrivateDeposit",
				args: [
					poolAddress,
					note.commitment,
					`0x02${"99".repeat(32)}`,
					0,
					`0x${"00".repeat(32)}`,
				],
			});

			const directPoolNativeValuePreflight = await typedApi.apis.ReviveApi.call(
				session.originSs58,
				toReviveDest(poolAddress),
				UNIT_PLANCK,
				DEFAULT_WEIGHT_LIMIT,
				DEFAULT_STORAGE_DEPOSIT_LIMIT,
				Binary.fromHex(directPoolCall),
			);
			const directPoolContractValuePreflight = await typedApi.apis.ReviveApi.call(
				session.originSs58,
				toReviveDest(poolAddress),
				PRIVATE_POOL_DENOMINATION,
				DEFAULT_WEIGHT_LIMIT,
				DEFAULT_STORAGE_DEPOSIT_LIMIT,
				Binary.fromHex(directPoolCall),
			);
			const directPoolScaledValuePreflight = await typedApi.apis.ReviveApi.call(
				session.originSs58,
				toReviveDest(poolAddress),
				revivedPrivatePoolValue,
				DEFAULT_WEIGHT_LIMIT,
				DEFAULT_STORAGE_DEPOSIT_LIMIT,
				Binary.fromHex(directPoolCall),
			);
			const outerNativeValuePreflight = await typedApi.apis.ReviveApi.call(
				session.originSs58,
				toReviveDest(contractAddress),
				UNIT_PLANCK,
				DEFAULT_WEIGHT_LIMIT,
				DEFAULT_STORAGE_DEPOSIT_LIMIT,
				Binary.fromHex(outerPrivateDepositCall),
			);
			const outerContractValuePreflight = await typedApi.apis.ReviveApi.call(
				session.originSs58,
				toReviveDest(contractAddress),
				PRIVATE_POOL_DENOMINATION,
				DEFAULT_WEIGHT_LIMIT,
				DEFAULT_STORAGE_DEPOSIT_LIMIT,
				Binary.fromHex(outerPrivateDepositCall),
			);
			const outerScaledValuePreflight = await typedApi.apis.ReviveApi.call(
				session.originSs58,
				toReviveDest(contractAddress),
				revivedPrivatePoolValue,
				DEFAULT_WEIGHT_LIMIT,
				DEFAULT_STORAGE_DEPOSIT_LIMIT,
				Binary.fromHex(outerPrivateDepositCall),
			);

			setDiagnosticsNote(
				[
					"Substrate Revive dry-run diagnostics:",
					`Direct pool.deposit with native 1 UNIT value (${UNIT_PLANCK.toString()}): ${formatRevivePreflightNote(directPoolNativeValuePreflight as RevivePreflightLike)}`,
					`Direct pool.deposit with contract denomination value (${PRIVATE_POOL_DENOMINATION.toString()}): ${formatRevivePreflightNote(directPoolContractValuePreflight as RevivePreflightLike)}`,
					`Direct pool.deposit with scaled Revive.call value (${revivedPrivatePoolValue.toString()}): ${formatRevivePreflightNote(directPoolScaledValuePreflight as RevivePreflightLike)}`,
					`Outer announcePrivateDeposit with native 1 UNIT value (${UNIT_PLANCK.toString()}): ${formatRevivePreflightNote(outerNativeValuePreflight as RevivePreflightLike)}`,
					`Outer announcePrivateDeposit with contract denomination value (${PRIVATE_POOL_DENOMINATION.toString()}): ${formatRevivePreflightNote(outerContractValuePreflight as RevivePreflightLike)}`,
					`Outer announcePrivateDeposit with scaled Revive.call value (${revivedPrivatePoolValue.toString()}): ${formatRevivePreflightNote(outerScaledValuePreflight as RevivePreflightLike)}`,
				].join("\n"),
			);
			setStatus("Substrate Revive diagnostics completed.");
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		} finally {
			setDiagnosticsRunning(false);
		}
	}

	async function runNativePoolLiveDepositProbe() {
		if (!session) {
			setError("Connect the Substrate sender wallet before running the native pool probe.");
			return;
		}

		setDiagnosticsRunning(true);
		setDiagnosticsNote(null);
		setError(null);

		try {
			const publicClient = getPublicClient(ethRpcUrl);
			const chainId = await publicClient.getChainId();
			const revivedNativePoolValue = contractValueToReviveCallValue(
				EXPERIMENTAL_NATIVE_POOL_DENOMINATION,
				chainId,
			);
			const typedApi = getClient(wsUrl).getTypedApi(stack_template);
			setStatus("Submitting live Revive.call deposit to the experimental native pool...");

			await ensureMappedForRevive({
				txSigner: session.txSigner,
				wsUrl,
			});

			const beforeIndex = await publicClient.readContract({
				address: EXPERIMENTAL_NATIVE_POOL_ADDRESS,
				abi: privatePoolAbi,
				functionName: "nextIndex",
			});
			const { note } = await createPrivateNote({
				chainId: BigInt(chainId),
				poolAddress: EXPERIMENTAL_NATIVE_POOL_ADDRESS,
				scope: 0n,
			});
			const data = encodeFunctionData({
				abi: privatePoolAbi,
				functionName: "deposit",
				args: [note.commitment],
			});
			const nativePoolDest = toReviveDest(EXPERIMENTAL_NATIVE_POOL_ADDRESS) as Parameters<
				typeof typedApi.tx.Revive.call
			>[0]["dest"];

			const result = await typedApi.tx.Revive.call({
				dest: nativePoolDest,
				value: revivedNativePoolValue,
				weight_limit: DEFAULT_WEIGHT_LIMIT,
				storage_deposit_limit: DEFAULT_STORAGE_DEPOSIT_LIMIT,
				data: Binary.fromHex(data),
			}).signAndSubmit(session.txSigner);

			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}

			let afterIndex = beforeIndex;
			for (let attempt = 0; attempt < 12; attempt++) {
				afterIndex = await publicClient.readContract({
					address: EXPERIMENTAL_NATIVE_POOL_ADDRESS,
					abi: privatePoolAbi,
					functionName: "nextIndex",
				});
				if (afterIndex > beforeIndex) {
					break;
				}
				await sleep(1500);
			}

			const advanced =
				afterIndex > beforeIndex
					? "State advanced. Substrate Revive.call can deposit into the native-denomination pool."
					: "Extrinsic was included, but ETH RPC has not shown nextIndex advancing yet. Re-check the pool state before treating this as success.";

			setDiagnosticsNote(
				[
					"Experimental native pool live Revive.call probe:",
					`Pool: ${EXPERIMENTAL_NATIVE_POOL_ADDRESS}`,
					`Value: ${revivedNativePoolValue.toString()}`,
					`Commitment: ${note.commitment}`,
					`Included block: #${result.block.number}`,
					`nextIndex before: ${beforeIndex.toString()}`,
					`nextIndex after: ${afterIndex.toString()}`,
					advanced,
				].join("\n"),
			);
			setStatus("Experimental native pool live probe completed.");
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		} finally {
			setDiagnosticsRunning(false);
		}
	}

	async function runMsgValueLiveProbe() {
		if (!session) {
			setError("Connect the Substrate sender wallet before running the msg.value probe.");
			return;
		}

		setDiagnosticsRunning(true);
		setDiagnosticsNote(null);
		setError(null);

		try {
			const publicClient = getPublicClient(ethRpcUrl);
			const chainId = await publicClient.getChainId();
			const reviveCallValue = contractValueToReviveCallValue(
				PRIVATE_POOL_DENOMINATION,
				chainId,
			);
			const typedApi = getClient(wsUrl).getTypedApi(stack_template);
			setStatus("Submitting live Revive.call to record contract msg.value...");

			await ensureMappedForRevive({
				txSigner: session.txSigner,
				wsUrl,
			});

			const [beforeCount, beforeValue] = await Promise.all([
				publicClient.readContract({
					address: MSG_VALUE_PROBE_ADDRESS,
					abi: msgValueProbeAbi,
					functionName: "recordCount",
				}),
				publicClient.readContract({
					address: MSG_VALUE_PROBE_ADDRESS,
					abi: msgValueProbeAbi,
					functionName: "lastValue",
				}),
			]);
			const data = encodeFunctionData({
				abi: msgValueProbeAbi,
				functionName: "recordValue",
			});
			const probeDest = toReviveDest(MSG_VALUE_PROBE_ADDRESS) as Parameters<
				typeof typedApi.tx.Revive.call
			>[0]["dest"];

			const result = await typedApi.tx.Revive.call({
				dest: probeDest,
				value: reviveCallValue,
				weight_limit: DEFAULT_WEIGHT_LIMIT,
				storage_deposit_limit: DEFAULT_STORAGE_DEPOSIT_LIMIT,
				data: Binary.fromHex(data),
			}).signAndSubmit(session.txSigner);

			if (!result.ok) {
				throw new Error(formatDispatchError(result.dispatchError));
			}

			let afterCount = beforeCount;
			let afterValue = beforeValue;
			for (let attempt = 0; attempt < 12; attempt++) {
				[afterCount, afterValue] = await Promise.all([
					publicClient.readContract({
						address: MSG_VALUE_PROBE_ADDRESS,
						abi: msgValueProbeAbi,
						functionName: "recordCount",
					}),
					publicClient.readContract({
						address: MSG_VALUE_PROBE_ADDRESS,
						abi: msgValueProbeAbi,
						functionName: "lastValue",
					}),
				]);
				if (afterCount > beforeCount) {
					break;
				}
				await sleep(1500);
			}

			setDiagnosticsNote(
				[
					"Experimental msg.value live Revive.call probe:",
					`Probe: ${MSG_VALUE_PROBE_ADDRESS}`,
					`Revive.call value submitted: ${reviveCallValue.toString()}`,
					`Included block: #${result.block.number}`,
					`recordCount before: ${beforeCount.toString()}`,
					`recordCount after: ${afterCount.toString()}`,
					`lastValue before: ${beforeValue.toString()}`,
					`lastValue after: ${afterValue.toString()}`,
					afterCount > beforeCount
						? "Probe succeeded. lastValue after is the contract-visible msg.value from Substrate Revive.call."
						: "Extrinsic was included, but ETH RPC has not shown probe state advancing yet.",
				].join("\n"),
			);
			setStatus("Experimental msg.value probe completed.");
		} catch (cause) {
			console.error(cause);
			setError(cause instanceof Error ? cause.message : String(cause));
			setStatus(null);
		} finally {
			setDiagnosticsRunning(false);
		}
	}

	async function submitPrivateSend() {
		if (!session || !preparedSend) {
			setError("Prepare the private deposit first.");
			return;
		}
		if (
			!contractAddress ||
			!isAddress(contractAddress) ||
			!poolAddress ||
			!isAddress(poolAddress)
		) {
			setError("Enter valid StealthPay and privacy pool addresses.");
			return;
		}

		setSubmitting(true);
		setError(null);
		setReadback(null);
		setClaimLinkCopied(false);

		try {
			const publicClient = getPublicClient(ethRpcUrl);
			const [contractCode, poolCode] = await Promise.all([
				publicClient.getCode({ address: contractAddress }),
				publicClient.getCode({ address: poolAddress }),
			]);
			if (!contractCode || contractCode === "0x") {
				throw new Error(`No StealthPay contract code found at ${contractAddress}.`);
			}
			if (!poolCode || poolCode === "0x") {
				throw new Error(`No private pool contract code found at ${poolAddress}.`);
			}

			setStatus("Checking Bulletin authorization for the encrypted private note...");
			const bulletinAuthorized = await checkBulletinAuthorization(
				session.originSs58,
				preparedSend.bulletinPayloadBytes.length,
			);
			if (!bulletinAuthorized) {
				throw new Error(
					`Bulletin authorization is missing for ${session.originSs58}. Authorize this Substrate account before sending a private deposit with note delivery.`,
				);
			}

			setStatus("Uploading the encrypted note delivery payload to Bulletin...");
			const bulletinBlob = await uploadToBulletin(
				preparedSend.bulletinPayloadBytes,
				session.txSigner,
			);

			const [announcementCountBefore] = await Promise.all([
				publicClient.readContract({
					address: contractAddress,
					abi: stealthPayAbi,
					functionName: "announcementCount",
				}),
			]);

			setStatus("Ensuring the sender account is mapped for Revive...");
			await ensureMappedForRevive({
				txSigner: session.txSigner,
				wsUrl,
			});
			let senderOwner: Address;
			let depositPathLabel: string;
			let depositTransactionHash: HexString | null = null;

			if (depositTxMode === "substrate-revive") {
				const typedApi = getClient(wsUrl).getTypedApi(stack_template);
				const chainId = await publicClient.getChainId();
				const reviveCallValue = contractValueToReviveCallValue(
					PRIVATE_POOL_DENOMINATION,
					chainId,
				);
				const data = encodeFunctionData({
					abi: stealthPayAbi,
					functionName: "announcePrivateDeposit",
					args: [
						poolAddress,
						preparedSend.note.commitment,
						formatHex(preparedSend.announcementPubKey),
						preparedSend.viewTag,
						bulletinBlob.memoHash,
					],
				});
				const reviveDest = toReviveDest(contractAddress) as Parameters<
					typeof typedApi.tx.Revive.call
				>[0]["dest"];

				setStatus(
					`Submitting announcePrivateDeposit over Substrate Revive.call with scaled value ${reviveCallValue.toString()}...`,
				);
				const result = await typedApi.tx.Revive.call({
					dest: reviveDest,
					value: reviveCallValue,
					weight_limit: DEFAULT_WEIGHT_LIMIT,
					storage_deposit_limit: DEFAULT_STORAGE_DEPOSIT_LIMIT,
					data: Binary.fromHex(data),
				}).signAndSubmit(session.txSigner);
				if (!result.ok) {
					throw new Error(formatDispatchError(result.dispatchError));
				}
				const resolvedOwner = await resolveReviveAddress({
					wsUrl,
					originSs58: session.originSs58,
				});
				if (!isAddress(resolvedOwner)) {
					throw new Error(`Mapped Revive address is not a valid H160: ${resolvedOwner}`);
				}
				senderOwner = resolvedOwner;
				depositPathLabel = "Substrate Revive.call";
			} else if (depositTxMode === "evm-injected") {
				setStatus("Submitting announcePrivateDeposit over the injected EVM wallet...");
				const injected = await getInjectedWalletClient(
					ethRpcUrl,
					evmInjectedAccount || undefined,
				);
				setEvmInjectedAccount(injected.account);
				const hash = await injected.walletClient.writeContract({
					address: contractAddress,
					abi: stealthPayAbi,
					functionName: "announcePrivateDeposit",
					args: [
						poolAddress,
						preparedSend.note.commitment,
						formatHex(preparedSend.announcementPubKey),
						preparedSend.viewTag,
						bulletinBlob.memoHash,
					],
					value: PRIVATE_POOL_DENOMINATION,
				});
				depositTransactionHash = hash as HexString;
				const receipt = await publicClient.waitForTransactionReceipt({ hash });
				if (receipt.status !== "success") {
					throw new Error("Injected EVM wallet transaction reverted on-chain.");
				}
				senderOwner = injected.account;
				depositPathLabel = "Injected EVM wallet";
			} else {
				setStatus("Submitting announcePrivateDeposit over the local EVM dev signer...");
				const walletClient = await getWalletClient(evmDevAccountIndex, ethRpcUrl);
				const account = evmDevAccounts[evmDevAccountIndex].account.address as Address;
				const hash = await walletClient.writeContract({
					address: contractAddress,
					abi: stealthPayAbi,
					functionName: "announcePrivateDeposit",
					args: [
						poolAddress,
						preparedSend.note.commitment,
						formatHex(preparedSend.announcementPubKey),
						preparedSend.viewTag,
						bulletinBlob.memoHash,
					],
					value: PRIVATE_POOL_DENOMINATION,
				});
				depositTransactionHash = hash as HexString;
				const receipt = await publicClient.waitForTransactionReceipt({ hash });
				if (receipt.status !== "success") {
					throw new Error("Local EVM dev signer transaction reverted on-chain.");
				}
				senderOwner = account;
				depositPathLabel = `Local EVM Dev Signer (${evmDevAccounts[evmDevAccountIndex].name})`;
			}

			const [announcementCountAfter, poolRootAfter] = await Promise.all([
				publicClient.readContract({
					address: contractAddress,
					abi: stealthPayAbi,
					functionName: "announcementCount",
				}),
				publicClient.readContract({
					address: poolAddress,
					abi: privatePoolAbi,
					functionName: "latestRoot",
				}),
			]);

			if (announcementCountAfter <= announcementCountBefore) {
				throw new Error("Private deposit landed, but announcementCount did not increase.");
			}

			setReadback({
				announcementCountAfter,
				bearerGiftKey: preparedSend.bearerGiftKey,
				bulletinCid: bulletinBlob.cid,
				bulletinSignerOrigin: session.originSs58,
				depositPathLabel,
				depositTransactionHash,
				giftMode: preparedSend.giftMode,
				memoHash: bulletinBlob.memoHash,
				noteCommitment: preparedSend.note.commitment,
				noteNullifierHash: preparedSend.note.nullifierHash,
				poolAddress,
				poolRootAfter,
				recipientOwner: preparedSend.recipientOwner,
				scope: preparedSend.note.scope,
				senderOwner,
			});
			recordPrivateGiftCreated({
				commitment: preparedSend.note.commitment,
				createdAt: Date.now(),
				giftMode: preparedSend.giftMode,
				memoHash: bulletinBlob.memoHash,
				memoPreview: privateMemoText.trim() || null,
				poolAddress: poolAddress as Address,
				recipientLabel:
					preparedSend.giftMode === "bearer"
						? "Walletless gift link"
						: (preparedSend.recipientOwner ?? "Registered recipient"),
				status: "created",
				transactionHash: depositTransactionHash,
			});
			setStatus(
				preparedSend.giftMode === "bearer"
					? "Walletless private gift created. Share the link carefully: it is the claim capability until redeemed."
					: "Private deposit announced successfully. The recipient can now prepare a private withdrawal from the pool.",
			);
		} catch (cause) {
			console.error(cause);
			const message = cause instanceof Error ? cause.message : String(cause);
			if (message === "Revive.ContractReverted" && depositTxMode === "substrate-revive") {
				setError(
					"Revive.ContractReverted. Run the Substrate Revive Diagnostics in Advanced Send Settings; the dry-run return selector usually identifies whether this is a contract revert such as InvalidDenomination or a transport issue.",
				);
			} else {
				setError(message);
			}
			setStatus(null);
		} finally {
			setSubmitting(false);
		}
	}

	async function copyClaimLink() {
		if (!claimLink) {
			return;
		}

		await navigator.clipboard.writeText(claimLink);
		setClaimLinkCopied(true);
		setStatus(
			"Claim link copied. Share it with the recipient so they can open the private claim flow directly.",
		);
	}

	async function shareGiftLink() {
		if (!claimLink || !canNativeShare) {
			return;
		}

		await navigator.share({
			title: "Private gift",
			text: giftPreviewMessage,
			url: claimLink,
		});
		setStatus("Gift link shared.");
	}

	return (
		<div className="space-y-6 animate-fade-in">
			<div className="gift-panel space-y-5">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="space-y-3 max-w-3xl">
						<span className="gift-chip">
							{readback
								? "Gift created"
								: preparedSend
									? "Gift ready"
									: "Create a private gift"}
						</span>
						<h1 className="page-title">Send a Private Gift</h1>
						<p className="text-sm text-text-secondary">
							Create a private gift worth exactly <strong>1 UNIT</strong>. The app
							deposits it into the privacy pool and gives you a shareable claim link
							instead of exposing a direct payment trail to the recipient.
						</p>
					</div>
					<div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-4 min-w-[220px]">
						<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
							Gift size
						</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">1 UNIT</div>
						<p className="mt-1 text-xs text-text-muted">
							{UNIT_PLANCK.toString()} planck
						</p>
						<p className="mt-3 text-sm text-text-secondary">
							{readback
								? "Share the claim link so the recipient can open the gift directly."
								: "The recipient will later claim through the relayer rather than receiving a direct public transfer."}
						</p>
					</div>
				</div>

				<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
					<div className="text-sm font-medium text-text-primary">Gift type</div>
					<div className="grid gap-3 md:grid-cols-2">
						<button
							type="button"
							className={giftMode === "registered" ? "btn-primary" : "btn-secondary"}
							onClick={() => {
								setGiftMode("registered");
								setUnregisteredRecipientFallback(null);
							}}
						>
							Send to registered wallet
						</button>
						<button
							type="button"
							className={giftMode === "bearer" ? "btn-primary" : "btn-secondary"}
							onClick={() => {
								setGiftMode("bearer");
								setUnregisteredRecipientFallback(null);
							}}
						>
							Create walletless gift link
						</button>
					</div>
					<p className="text-sm text-text-secondary">
						{giftMode === "registered"
							? "Best when the recipient already has a StealthPay wallet. The encrypted claim is targeted to their registered private wallet."
							: "Best when the recipient has no wallet yet. The link becomes the claim capability until redeemed, so share it only with the intended recipient."}
					</p>
				</div>

				<div className="grid gap-3 md:grid-cols-3">
					<div className="gift-step">
						<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
							1. Write
						</div>
						<div className="mt-2 text-sm font-medium text-text-primary">
							{giftMode === "registered"
								? "Choose the recipient and private note"
								: "Write the private gift note"}
						</div>
						<p className="mt-2 text-sm text-text-secondary">
							{giftMode === "registered"
								? "Add the recipient wallet and an optional private message that only they can read."
								: "Add an optional message. The link will carry the private claim capability for a walletless recipient."}
						</p>
					</div>
					<div className="gift-step">
						<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
							2. Create
						</div>
						<div className="mt-2 text-sm font-medium text-text-primary">
							Create the private gift
						</div>
						<p className="mt-2 text-sm text-text-secondary">
							The app encrypts the claim data, deposits into the pool, and prepares
							the recipient’s private claim path.
						</p>
					</div>
					<div className="gift-step">
						<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
							3. Share
						</div>
						<div className="mt-2 text-sm font-medium text-text-primary">
							Send the claim link
						</div>
						<p className="mt-2 text-sm text-text-secondary">
							Once created, share the claim link so the recipient can open the gift
							directly in the app.
						</p>
					</div>
				</div>

				{giftMode === "registered" ? (
					<div className="space-y-3">
						<div>
							<label className="label">Recipient</label>
							<p className="mb-2 text-sm text-text-secondary">
								Choose a wallet from your extension, paste a wallet address, or use
								a DotNS name such as alice.dot or alice.paseo.li. If they do not
								have a wallet, switch to walletless gift link.
							</p>
						</div>
						<input
							className="input-field w-full"
							value={recipientInput}
							onChange={(event) => {
								setRecipientInput(event.target.value);
								setResolvedRecipient(null);
								setUnregisteredRecipientFallback(null);
							}}
							placeholder="Recipient wallet, extension account, or name"
						/>
						{extensionAccounts.length > 0 ? (
							<div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
								<div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
									Detected wallet accounts
								</div>
								<div className="mt-3 flex flex-wrap gap-2">
									{extensionAccounts.map((account) => (
										<button
											key={account.address}
											type="button"
											className="btn-secondary max-w-full truncate"
											onClick={() => {
												setRecipientInput(account.address);
												setResolvedRecipient(null);
												setUnregisteredRecipientFallback(null);
											}}
											title={account.address}
										>
											{account.name || "Unnamed"} ·{" "}
											{shortAddress(account.address)}
										</button>
									))}
								</div>
							</div>
						) : null}
						{resolvedRecipient ? (
							<div className="rounded-xl border border-accent-green/20 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
								Resolved {resolvedRecipient.label} recipient to{" "}
								<span className="font-mono">{resolvedRecipient.owner}</span>.
							</div>
						) : null}
					</div>
				) : (
					<div className="rounded-xl border border-accent-yellow/20 bg-accent-yellow/10 px-4 py-4 text-sm text-text-secondary">
						<div className="font-semibold text-accent-yellow">
							Walletless bearer gift
						</div>
						<p className="mt-2">
							No recipient wallet is required before sending. The final gift link is
							sensitive: anyone who gets it can claim until it is redeemed.
						</p>
					</div>
				)}

				<div className="space-y-2">
					<label className="label">Gift Note</label>
					<textarea
						className="input-field min-h-[110px] w-full"
						value={privateMemoText}
						onChange={(event) => setPrivateMemoText(event.target.value)}
						placeholder="Optional private message that only the recipient can read..."
					/>
					<p className="text-xs text-text-muted">
						The private claim data and this message are bundled into one encrypted
						delivery for the recipient.
					</p>
				</div>
			</div>

			<div className="card space-y-4">
				<h2 className="section-title">Gift Sender</h2>
				<p className="text-sm text-text-secondary">
					This wallet signs the encrypted private delivery. The actual pool deposit can
					use a separate transport underneath, but you should not need to think about that
					in the happy path.
				</p>

				<div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 space-y-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="text-sm font-medium text-text-primary">
								Recommended: Browser Extension
							</div>
							<p className="mt-1 text-sm text-text-secondary">
								Use the wallet extension that should sign the private delivery.
								Alternative sender modes and transport options stay under advanced
								settings.
							</p>
						</div>
						{walletMode !== "browser-extension" ? (
							<span className="rounded-full bg-accent-yellow/15 px-3 py-1 text-xs font-semibold text-accent-yellow">
								Advanced mode active
							</span>
						) : null}
					</div>
					<details className="rounded-xl border border-white/10 bg-black/10 p-4">
						<summary className="cursor-pointer list-none text-sm font-semibold text-text-secondary">
							Use a different sender wallet
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
									onClick={() => setWalletMode(value as TransactionWalletMode)}
								>
									{label}
								</button>
							))}
						</div>
					</details>
				</div>

				{walletMode === "browser-extension" && (
					<div className="grid gap-4 lg:grid-cols-2">
						<div className="space-y-2">
							<label className="label">Extension Wallet</label>
							<select
								className="input-field w-full"
								value={selectedExtensionWallet}
								onChange={(event) => setSelectedExtensionWallet(event.target.value)}
							>
								{availableExtensionWallets.length === 0 ? (
									<option value="">No extension wallets detected</option>
								) : (
									availableExtensionWallets.map((wallet) => (
										<option key={wallet} value={wallet}>
											{wallet}
										</option>
									))
								)}
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
				)}

				{walletMode === "dev-account" && (
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

				<div className="flex flex-wrap gap-3">
					<button type="button" className="btn-primary" onClick={preparePrivateSend}>
						Prepare Gift
					</button>
					<button
						type="button"
						className="btn-secondary"
						disabled={!preparedSend || submitting}
						onClick={submitPrivateSend}
					>
						{submitting ? "Creating Gift..." : "Create Private Gift"}
					</button>
				</div>

				<details className="rounded-xl border border-white/10 bg-white/5 p-4">
					<summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
						Advanced Send Settings
					</summary>
					<div className="mt-4 space-y-4">
						<div className="grid gap-4 lg:grid-cols-2">
							<div className="space-y-2">
								<label className="label">StealthPay PVM Contract</label>
								<input
									className="input-field w-full"
									value={contractAddress}
									onChange={(event) =>
										saveAddress(
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
										saveAddress(
											poolStorageKey,
											setPoolAddress,
											event.target.value,
										)
									}
									placeholder="0x..."
								/>
							</div>
						</div>

						<div className="space-y-2">
							<h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
								How the gift is sent
							</h3>
							<p className="text-sm text-text-secondary">
								The injected EVM wallet route is still the primary sender path. The
								Substrate `Revive.call` route now applies the live Paseo msg.value
								scale discovered by the probe, so it is available for retesting
								against the deployed pool.
							</p>
						</div>

						<div className="flex flex-wrap gap-2">
							{[
								["evm-injected", "Injected EVM Wallet"],
								["substrate-revive", "Substrate Revive.call"],
								["evm-dev", "Local EVM Dev Signer"],
							].map(([value, label]) => (
								<button
									key={value}
									type="button"
									className={
										depositTxMode === value ? "btn-primary" : "btn-secondary"
									}
									onClick={() => setDepositTxMode(value as DepositTxMode)}
								>
									{label}
								</button>
							))}
						</div>

						{depositTxMode === "evm-injected" && (
							<div className="flex flex-wrap items-center gap-3">
								<button
									type="button"
									className="btn-secondary"
									onClick={connectInjectedEvmWallet}
								>
									{evmInjectedAccount
										? "Reconnect EVM Wallet"
										: "Connect EVM Wallet"}
								</button>
								<span className="text-sm text-text-secondary break-all">
									{evmInjectedAccount || "No EVM wallet connected yet."}
								</span>
							</div>
						)}

						{depositTxMode === "substrate-revive" && (
							<div className="rounded-xl border border-accent-yellow/25 bg-accent-yellow/10 p-4 text-sm text-accent-yellow">
								This route submits with the scaled Paseo `Revive.call` value. Use
								diagnostics first if the transaction reverts.
							</div>
						)}

						<div className="rounded-xl border border-white/10 bg-black/10 p-4 space-y-3">
							<div>
								<h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
									Substrate Revive Diagnostics
								</h3>
								<p className="mt-2 text-sm text-text-secondary">
									Dry-runs two fresh commitments with the connected Substrate
									signer: direct `pool.deposit(...)` and outer
									`announcePrivateDeposit(...)`. This isolates whether the failure
									is the pool itself or the nested wrapper path.
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<button
									type="button"
									className="btn-secondary"
									disabled={diagnosticsRunning || !session}
									onClick={() => void runSubstrateReviveDiagnostics()}
								>
									{diagnosticsRunning
										? "Running Diagnostics..."
										: "Run Dry-Run Diagnostics"}
								</button>
								<button
									type="button"
									className="btn-secondary"
									disabled={diagnosticsRunning || !session}
									onClick={() => void runNativePoolLiveDepositProbe()}
								>
									Test Native Pool Live Deposit
								</button>
								<button
									type="button"
									className="btn-secondary"
									disabled={diagnosticsRunning || !session}
									onClick={() => void runMsgValueLiveProbe()}
								>
									Record Revive msg.value
								</button>
							</div>
							<p className="text-xs text-text-muted">
								The live probe submits a real Substrate-signed `Revive.call` to the
								experimental native-denomination pool at{" "}
								{EXPERIMENTAL_NATIVE_POOL_ADDRESS}; it does not touch the production
								private-withdraw pool. The msg.value probe records the value a
								simple payable contract actually receives.
							</p>
							{diagnosticsNote ? (
								<pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-text-secondary">
									{diagnosticsNote}
								</pre>
							) : null}
						</div>

						{depositTxMode === "evm-dev" && (
							<div className="space-y-2">
								<label className="label">Local EVM Dev Signer</label>
								<select
									className="input-field w-full"
									value={evmDevAccountIndex}
									onChange={(event) =>
										setEvmDevAccountIndex(Number(event.target.value))
									}
								>
									{evmDevAccounts.map((account, index) => (
										<option key={account.account.address} value={index}>
											{account.name} ({account.account.address})
										</option>
									))}
								</select>
							</div>
						)}
					</div>
				</details>

				{preflightNote ? (
					<div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-text-secondary">
						{preflightNote}
					</div>
				) : null}

				{status ? (
					<div className="rounded-xl border border-accent-blue/25 bg-accent-blue/10 px-4 py-3 text-sm text-accent-blue">
						{status}
					</div>
				) : null}
				{unregisteredRecipientFallback ? (
					<div className="rounded-xl border border-accent-yellow/25 bg-accent-yellow/10 px-4 py-4 text-sm text-text-secondary">
						<div className="font-semibold text-accent-yellow">
							Recipient found, but private wallet is not set up yet
						</div>
						<p className="mt-2">
							{unregisteredRecipientFallback.recipient.input} resolves to{" "}
							<span className="font-mono">
								{unregisteredRecipientFallback.recipient.owner}
							</span>
							, but that wallet has not registered a StealthPay private inbox.
						</p>
						<p className="mt-2">
							Use a walletless gift link instead. It keeps the same sender-to-pool and
							relayed-claim privacy path, and the recipient can claim without setting
							up a wallet first.
						</p>
						<div className="mt-4 flex flex-wrap gap-3">
							<button
								type="button"
								className="btn-primary"
								onClick={switchToWalletlessGift}
							>
								Create Walletless Gift Link Instead
							</button>
							<a className="btn-secondary" href="#/register">
								Ask Recipient To Set Up Private Wallet
							</a>
						</div>
					</div>
				) : null}
				{error ? (
					<div className="rounded-xl border border-accent-red/25 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
						{error}
					</div>
				) : null}
			</div>

			{session ? (
				<details className="card">
					<summary className="cursor-pointer list-none section-title">
						Advanced sender session details
					</summary>
					<dl className="mt-4 grid gap-4 md:grid-cols-2">
						<InfoItem label="Wallet Adapter" value={session.providerLabel} />
						<InfoItem label="Origin SS58" value={session.originSs58} />
						<InfoItem label="Account Name" value={session.accountName || "—"} />
						<InfoItem label="Chain ID" value={session.chainId.toString()} />
					</dl>
				</details>
			) : null}

			{preparedSend ? (
				<div className="card space-y-4">
					<h2 className="section-title">Gift Ready</h2>
					<p className="text-sm text-text-secondary">
						The private delivery has been prepared. You can now create the on-chain
						gift.
					</p>
					<div className="grid gap-4 md:grid-cols-2">
						<SimpleInfoItem
							label="Gift Type"
							value={
								preparedSend.giftMode === "bearer"
									? "Walletless bearer link"
									: "Registered recipient"
							}
						/>
						<SimpleInfoItem
							label="Recipient"
							value={
								preparedSend.recipientOwner ?? "Claimed by whoever holds the link"
							}
						/>
						<SimpleInfoItem
							label="Gift Note Included"
							value={privateMemoText.trim() ? "Yes" : "No"}
						/>
						<SimpleInfoItem label="Gift Size" value="1 UNIT" />
						<SimpleInfoItem
							label="Encrypted Delivery"
							value={`${preparedSend.bulletinPayloadBytes.length} bytes`}
						/>
					</div>
					<details className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
						<summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
							Advanced gift details
						</summary>
						<dl className="mt-4 grid gap-4 md:grid-cols-2">
							{recipientSnapshot ? (
								<InfoItem
									label="Recipient Meta-Address"
									value={recipientSnapshot.metaAddressHex}
								/>
							) : null}
							<InfoItem label="Privacy Pool" value={poolAddress || "—"} />
							<InfoItem label="Scope" value={preparedSend.note.scope} />
							<InfoItem label="Commitment" value={preparedSend.note.commitment} />
							<InfoItem
								label="Nullifier Hash"
								value={preparedSend.note.nullifierHash}
							/>
							<InfoItem
								label="Ephemeral Public Key"
								value={formatHex(preparedSend.announcementPubKey)}
							/>
							<InfoItem label="View Tag" value={String(preparedSend.viewTag)} />
						</dl>
					</details>
				</div>
			) : null}

			{readback ? (
				<div className="gift-panel space-y-4">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="space-y-2">
							<span className="gift-chip">Gift created</span>
							<h2 className="page-title text-2xl">
								Your private gift is ready to share
							</h2>
							<p className="text-sm text-text-secondary max-w-3xl">
								The gift is now in the privacy pool and the recipient can claim it
								privately through the relayer.
							</p>
						</div>
						<div className="rounded-2xl border border-accent-green/20 bg-accent-green/10 px-4 py-4 min-w-[220px]">
							<div className="text-xs uppercase tracking-[0.18em] text-accent-green">
								Next step
							</div>
							<div className="mt-2 text-lg font-semibold text-text-primary">
								Share the claim link
							</div>
							<p className="mt-2 text-sm text-text-secondary">
								Once the recipient opens it, the app can take them straight into the
								guided private claim flow.
							</p>
						</div>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						<SimpleInfoItem
							label="Gift Type"
							value={
								readback.giftMode === "bearer"
									? "Walletless bearer link"
									: "Registered recipient"
							}
						/>
						<SimpleInfoItem
							label="Recipient"
							value={readback.recipientOwner ?? "Whoever holds the unredeemed link"}
						/>
						<SimpleInfoItem label="Gift Size" value="1 UNIT" />
						<SimpleInfoItem
							label="Gift Status"
							value="Private claim is ready for the recipient"
						/>
						<SimpleInfoItem
							label="Deposit Transaction"
							value={
								readback.depositTransactionHash ||
								"Submitted via Substrate Revive.call"
							}
						/>
					</div>
					{claimLink ? (
						<div className="gift-share-card space-y-4">
							<div className="flex flex-wrap items-start justify-between gap-4">
								<div className="space-y-2 max-w-2xl">
									<h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-polka-200">
										Claim Link
									</h3>
									<p className="text-sm text-polka-100">
										{readback.giftMode === "bearer"
											? "Share this link carefully. It is the private claim capability until the gift is redeemed."
											: "Share this link with the recipient so they land directly in the claim flow with the gift context already loaded."}
									</p>
								</div>
								<span className="gift-chip">Ready to share</span>
							</div>
							<div className="rounded-2xl border border-white/10 bg-black/10 p-4 space-y-3">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
											{readback.giftMode === "bearer"
												? "Link security"
												: "Recipient"}
										</div>
										<div className="mt-2 text-sm font-medium text-text-primary break-all">
											{readback.recipientOwner ??
												"Anyone with this link can claim before redemption"}
										</div>
									</div>
									<div className="text-right">
										<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
											Gift size
										</div>
										<div className="mt-2 text-sm font-medium text-text-primary">
											1 UNIT
										</div>
									</div>
								</div>
								<div>
									<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
										Private note preview
									</div>
									<p className="mt-2 text-sm text-text-secondary">
										{giftPreviewMessage}
									</p>
								</div>
							</div>
							<div className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 font-mono text-xs text-white break-all">
								{claimLink}
							</div>
							<div className="flex flex-wrap gap-3">
								{canNativeShare ? (
									<button
										type="button"
										className="btn-primary"
										onClick={shareGiftLink}
									>
										Share Gift
									</button>
								) : null}
								<button
									type="button"
									className={canNativeShare ? "btn-secondary" : "btn-primary"}
									onClick={copyClaimLink}
								>
									{claimLinkCopied ? "Claim Link Copied" : "Copy Claim Link"}
								</button>
								<a href={claimLink} className="btn-secondary">
									Open Claim Flow
								</a>
							</div>
							<div className="grid gap-3 md:grid-cols-3">
								<div className="gift-step">
									<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
										Share
									</div>
									<p className="mt-2 text-sm text-text-secondary">
										Send the claim link to the recipient through any channel you
										want.
									</p>
								</div>
								<div className="gift-step">
									<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
										Recipient opens
									</div>
									<p className="mt-2 text-sm text-text-secondary">
										The recipient lands in the guided gift-opening flow with the
										context already loaded.
									</p>
								</div>
								<div className="gift-step">
									<div className="text-xs uppercase tracking-[0.18em] text-text-muted">
										Private claim
									</div>
									<p className="mt-2 text-sm text-text-secondary">
										They save a recovery file and claim through the relayer
										without a direct public sender-to-recipient payment trail.
									</p>
								</div>
							</div>
						</div>
					) : null}
					<details className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
						<summary className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.16em] text-text-muted">
							Advanced creation details
						</summary>
						<dl className="mt-4 grid gap-4 md:grid-cols-2">
							<InfoItem label="Deposit Path" value={readback.depositPathLabel} />
							<InfoItem
								label="Bulletin Signer (SS58)"
								value={readback.bulletinSignerOrigin}
							/>
							<InfoItem label="Sender Owner (H160)" value={readback.senderOwner} />
							<InfoItem label="Privacy Pool" value={readback.poolAddress} />
							<InfoItem label="Bulletin CID" value={readback.bulletinCid} />
							<InfoItem label="Memo Hash" value={readback.memoHash} />
							<InfoItem label="Commitment" value={readback.noteCommitment} />
							<InfoItem label="Nullifier Hash" value={readback.noteNullifierHash} />
							<InfoItem
								label="Pool Root After Deposit"
								value={readback.poolRootAfter}
							/>
							<InfoItem
								label="Announcement Count"
								value={readback.announcementCountAfter.toString()}
							/>
							<InfoItem label="Scope" value={readback.scope} />
						</dl>
					</details>
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

function shortAddress(value: string) {
	return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
