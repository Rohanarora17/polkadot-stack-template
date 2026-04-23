import type { Address, Hex } from "viem";

export type PrivateGiftMode = "registered" | "bearer";

export type PrivateGiftRecord = {
	commitment: Hex;
	createdAt: number;
	giftMode: PrivateGiftMode;
	memoPreview: string | null;
	memoHash: Hex;
	poolAddress: Address;
	recipientLabel: string;
	status: "created" | "claimed";
	transactionHash: Hex | null;
};

export type PrivateClaimRecord = {
	claimedAt: number;
	commitment: Hex;
	destination: Address;
	giftMode: PrivateGiftMode;
	memoPreview: string | null;
	poolAddress: Address;
	quoteFee: string | null;
	relayer: Address | null;
	transactionHash: Hex;
};

export type PrivateWalletActivity = {
	claims: PrivateClaimRecord[];
	gifts: PrivateGiftRecord[];
};

const WALLET_ACTIVITY_STORAGE_KEY = "stealthpay-private-wallet-activity-v1";
const MAX_RECORDS = 40;

export function readPrivateWalletActivity(): PrivateWalletActivity {
	if (!canUseLocalStorage()) {
		return { claims: [], gifts: [] };
	}

	try {
		const raw = localStorage.getItem(WALLET_ACTIVITY_STORAGE_KEY);
		if (!raw) {
			return { claims: [], gifts: [] };
		}
		const parsed = JSON.parse(raw) as Partial<PrivateWalletActivity>;
		return {
			claims: Array.isArray(parsed.claims) ? parsed.claims : [],
			gifts: Array.isArray(parsed.gifts) ? parsed.gifts : [],
		};
	} catch {
		return { claims: [], gifts: [] };
	}
}

export function recordPrivateGiftCreated(record: PrivateGiftRecord) {
	writePrivateWalletActivity((current) => ({
		...current,
		gifts: upsertByCommitment(current.gifts, record)
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, MAX_RECORDS),
	}));
}

export function recordPrivateGiftClaimed(record: PrivateClaimRecord) {
	writePrivateWalletActivity((current) => {
		const gifts = current.gifts.map((gift) =>
			gift.commitment === record.commitment ? { ...gift, status: "claimed" as const } : gift,
		);

		return {
			claims: upsertByCommitment(current.claims, record)
				.sort((a, b) => b.claimedAt - a.claimedAt)
				.slice(0, MAX_RECORDS),
			gifts,
		};
	});
}

function writePrivateWalletActivity(
	update: (current: PrivateWalletActivity) => PrivateWalletActivity,
) {
	if (!canUseLocalStorage()) {
		return;
	}

	const next = update(readPrivateWalletActivity());
	localStorage.setItem(WALLET_ACTIVITY_STORAGE_KEY, JSON.stringify(next));
	window.dispatchEvent(new Event("stealthpay-wallet-activity"));
}

function upsertByCommitment<T extends { commitment: Hex }>(records: T[], next: T) {
	const withoutExisting = records.filter((record) => record.commitment !== next.commitment);
	return [next, ...withoutExisting];
}

function canUseLocalStorage() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}
