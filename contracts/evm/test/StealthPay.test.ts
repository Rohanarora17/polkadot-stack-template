import { expect } from "chai";
import hre from "hardhat";
import { getAddress, parseEventLogs } from "viem";

const PUBKEY_A = `0x02${"11".repeat(32)}` as const;
const PUBKEY_B = `0x03${"22".repeat(32)}` as const;
const PUBKEY_C = `0x02${"33".repeat(32)}` as const;
const PUBKEY_D = `0x03${"44".repeat(32)}` as const;
const EPHEMERAL_PUBKEY = `0x02${"55".repeat(32)}` as const;
const INVALID_PUBKEY = "0x1234" as const;
const MEMO_HASH = `0x${"66".repeat(32)}` as const;

describe("StealthPay (EVM)", function () {
	async function deployContract() {
		const [owner, otherAccount] = await hre.viem.getWalletClients();
		const stealthPay = await hre.viem.deployContract("StealthPay");
		const publicClient = await hre.viem.getPublicClient();

		return { stealthPay, owner, otherAccount, publicClient };
	}

	it("registers and replaces a meta-address", async function () {
		const { stealthPay, owner } = await deployContract();

		await stealthPay.write.setMetaAddress([PUBKEY_A, PUBKEY_B]);
		expect(await stealthPay.read.hasMetaAddress([owner.account.address])).to.equal(true);
		expect(await stealthPay.read.metaAddressOf([owner.account.address])).to.equal(
			`${PUBKEY_A}${PUBKEY_B.slice(2)}`,
		);

		await stealthPay.write.setMetaAddress([PUBKEY_C, PUBKEY_D]);
		expect(await stealthPay.read.metaAddressOf([owner.account.address])).to.equal(
			`${PUBKEY_C}${PUBKEY_D.slice(2)}`,
		);
	});

	it("clears a meta-address", async function () {
		const { stealthPay, owner, publicClient } = await deployContract();

		await stealthPay.write.setMetaAddress([PUBKEY_A, PUBKEY_B]);
		const hash = await stealthPay.write.clearMetaAddress();
		const receipt = await publicClient.waitForTransactionReceipt({ hash });
		const logs = parseEventLogs({
			abi: stealthPay.abi,
			logs: receipt.logs,
			eventName: "MetaAddressSet",
		}) as Array<{ args: { spendingPubKey: `0x${string}`; viewingPubKey: `0x${string}` } }>;

		expect(await stealthPay.read.hasMetaAddress([owner.account.address])).to.equal(false);
		expect(await stealthPay.read.metaAddressOf([owner.account.address])).to.equal("0x");
		expect(logs).to.have.lengthOf(1);
		expect(logs[0].args.spendingPubKey).to.equal("0x");
		expect(logs[0].args.viewingPubKey).to.equal("0x");
	});

	it("forwards funds and emits an announcement", async function () {
		const { stealthPay, owner, otherAccount, publicClient } = await deployContract();
		const before = await publicClient.getBalance({ address: otherAccount.account.address });
		const hash = await stealthPay.write.announceAndPay(
			[otherAccount.account.address, EPHEMERAL_PUBKEY, 7, MEMO_HASH],
			{ value: 123456789n },
		);
		const receipt = await publicClient.waitForTransactionReceipt({ hash });
		const after = await publicClient.getBalance({ address: otherAccount.account.address });
		const logs = parseEventLogs({
			abi: stealthPay.abi,
			logs: receipt.logs,
			eventName: "Announcement",
		}) as Array<{
			args: {
				schemeId: bigint;
				sender: string;
				stealthAddress: string;
				ephemeralPubKey: `0x${string}`;
				viewTag: number;
				memoHash: `0x${string}`;
				nonce: bigint;
			};
		}>;

		expect(after - before).to.equal(123456789n);
		expect(await stealthPay.read.announcementCount()).to.equal(1n);
		expect(logs).to.have.lengthOf(1);
		expect(logs[0].args.schemeId).to.equal(1n);
		expect(getAddress(logs[0].args.sender)).to.equal(getAddress(owner.account.address));
		expect(getAddress(logs[0].args.stealthAddress)).to.equal(
			getAddress(otherAccount.account.address),
		);
		expect(logs[0].args.ephemeralPubKey).to.equal(EPHEMERAL_PUBKEY);
		expect(logs[0].args.viewTag).to.equal(7);
		expect(logs[0].args.memoHash).to.equal(MEMO_HASH);
		expect(logs[0].args.nonce).to.equal(1n);
	});

	it("announces and forwards a direct private deposit to the pool", async function () {
		const { stealthPay, owner, publicClient } = await deployContract();
		const privatePool = await hre.viem.deployContract("MockPrivatePool");
		const commitment = `0x${"77".repeat(32)}` as const;
		const hash = await stealthPay.write.announcePrivateDeposit(
			[privatePool.address, commitment, EPHEMERAL_PUBKEY, 9, MEMO_HASH],
			{ value: 10n ** 18n },
		);
		const receipt = await publicClient.waitForTransactionReceipt({ hash });
		const logs = parseEventLogs({
			abi: stealthPay.abi,
			logs: receipt.logs,
			eventName: "Announcement",
		}) as Array<{
			args: {
				schemeId: bigint;
				sender: string;
				stealthAddress: string;
				ephemeralPubKey: `0x${string}`;
				viewTag: number;
				memoHash: `0x${string}`;
				nonce: bigint;
			};
		}>;

		expect(await privatePool.read.lastCommitment()).to.equal(commitment);
		expect(await privatePool.read.lastValue()).to.equal(10n ** 18n);
		expect(logs).to.have.lengthOf(1);
		expect(logs[0].args.schemeId).to.equal(2n);
		expect(getAddress(logs[0].args.sender)).to.equal(getAddress(owner.account.address));
		expect(getAddress(logs[0].args.stealthAddress)).to.equal(getAddress(privatePool.address));
		expect(logs[0].args.viewTag).to.equal(9);
		expect(logs[0].args.nonce).to.equal(1n);
	});

	it("reverts on zero-value transfers", async function () {
		const { stealthPay, otherAccount } = await deployContract();

		try {
			await stealthPay.write.announceAndPay(
				[otherAccount.account.address, EPHEMERAL_PUBKEY, 7, MEMO_HASH],
				{ value: 0n },
			);
			expect.fail("Should have reverted");
		} catch (error: unknown) {
			expect((error as Error).message).to.include("EmptyTransfer");
		}
	});

	it("reverts on invalid ephemeral pubkey length", async function () {
		const { stealthPay, otherAccount } = await deployContract();

		try {
			await stealthPay.write.announceAndPay(
				[otherAccount.account.address, INVALID_PUBKEY, 7, MEMO_HASH],
				{ value: 1n },
			);
			expect.fail("Should have reverted");
		} catch (error: unknown) {
			expect((error as Error).message).to.include("InvalidPubKeyLength");
		}
	});

	it("reverts on invalid meta-address pubkey length", async function () {
		const { stealthPay } = await deployContract();

		try {
			await stealthPay.write.setMetaAddress([PUBKEY_A, INVALID_PUBKEY]);
			expect.fail("Should have reverted");
		} catch (error: unknown) {
			expect((error as Error).message).to.include("InvalidPubKeyLength");
		}
	});
});
