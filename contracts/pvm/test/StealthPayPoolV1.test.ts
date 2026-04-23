import { expect } from "chai";
import hre from "hardhat";
import { type Hex } from "viem";

import {
	buildPoolProofFixture,
	computeContext,
	DENOMINATION,
	deployPoseidon2,
	generateWithdrawProof,
} from "./helpers/privatePool";

function toBytes32Hex(value: bigint) {
	return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

describe("StealthPayPoolV1 (PVM)", function () {
	async function deployFixture() {
		const [owner, recipient, relayer] = await hre.viem.getWalletClients();
		const publicClient = await hre.viem.getPublicClient();

		const poseidonHash = await deployPoseidon2(owner);
		const poseidonReceipt = await publicClient.waitForTransactionReceipt({
			hash: poseidonHash,
		});
		const verifier = await hre.viem.deployContract("WithdrawVerifier");
		const pool = await hre.viem.deployContract("StealthPayPoolV1", [
			poseidonReceipt.contractAddress!,
			verifier.address,
		]);

		return {
			owner,
			recipient,
			relayer,
			publicClient,
			pool,
		};
	}

	it("accepts exact denomination deposits", async function () {
		const { owner, pool } = await deployFixture();
		const commitment = `0x${"11".repeat(32)}` as const;

		await pool.write.deposit([commitment], {
			account: owner.account,
			value: DENOMINATION,
		});

		expect(await pool.read.nextIndex()).to.equal(1);
		expect(await pool.read.latestRoot()).to.not.equal("0x");
	});

	it("reverts on wrong deposit denomination", async function () {
		const { owner, pool } = await deployFixture();
		const commitment = `0x${"22".repeat(32)}` as const;

		try {
			await pool.write.deposit([commitment], {
				account: owner.account,
				value: DENOMINATION - 1n,
			});
			expect.fail("Should have reverted");
		} catch (error: unknown) {
			expect((error as Error).message).to.include("InvalidDenomination");
		}
	});

	it("withdraws with a valid proof and pays the relayer fee", async function () {
		const { owner, recipient, relayer, publicClient, pool } = await deployFixture();
		const scope = await pool.read.scope();
		const fixture = await buildPoolProofFixture(scope);
		const rootHex = toBytes32Hex(fixture.root);
		const nullifierHashHex = toBytes32Hex(fixture.nullifierHash);

		await pool.write.deposit([toBytes32Hex(fixture.commitment)], {
			account: owner.account,
			value: DENOMINATION,
		});

		const latestBlock = await publicClient.getBlock();
		const expiry = latestBlock.timestamp + 3600n;
		const fee = DENOMINATION / 100n;
		const context = computeContext({
			chainId: BigInt(await publicClient.getChainId()),
			poolAddress: pool.address,
			recipient: recipient.account.address,
			relayer: relayer.account.address,
			fee,
			expiry,
		});
		const proof = await generateWithdrawProof({
			root: fixture.root,
			nullifierHash: fixture.nullifierHash,
			scope,
			context,
			nullifier: fixture.nullifier,
			secret: fixture.secret,
			pathElements: fixture.pathElements,
			pathIndices: fixture.pathIndices,
		});

		const beforeRecipient = await publicClient.getBalance({
			address: recipient.account.address,
		});
		const beforeRelayer = await publicClient.getBalance({ address: relayer.account.address });

		await pool.write.withdraw(
			[
				proof.pA,
				proof.pB,
				proof.pC,
				rootHex,
				nullifierHashHex,
				recipient.account.address,
				relayer.account.address,
				fee,
				expiry,
			],
			{ account: owner.account },
		);

		const afterRecipient = await publicClient.getBalance({
			address: recipient.account.address,
		});
		const afterRelayer = await publicClient.getBalance({ address: relayer.account.address });

		expect(afterRecipient - beforeRecipient).to.equal(DENOMINATION - fee);
		expect(afterRelayer - beforeRelayer).to.equal(fee);
		expect(await pool.read.nullifierHashes([nullifierHashHex])).to.equal(true);
	});

	it("rejects reused nullifiers", async function () {
		const { owner, recipient, relayer, publicClient, pool } = await deployFixture();
		const scope = await pool.read.scope();
		const fixture = await buildPoolProofFixture(scope);
		const rootHex = toBytes32Hex(fixture.root);
		const nullifierHashHex = toBytes32Hex(fixture.nullifierHash);

		await pool.write.deposit([toBytes32Hex(fixture.commitment)], {
			account: owner.account,
			value: DENOMINATION,
		});

		const latestBlock = await publicClient.getBlock();
		const expiry = latestBlock.timestamp + 3600n;
		const fee = 0n;
		const context = computeContext({
			chainId: BigInt(await publicClient.getChainId()),
			poolAddress: pool.address,
			recipient: recipient.account.address,
			relayer: relayer.account.address,
			fee,
			expiry,
		});
		const proof = await generateWithdrawProof({
			root: fixture.root,
			nullifierHash: fixture.nullifierHash,
			scope,
			context,
			nullifier: fixture.nullifier,
			secret: fixture.secret,
			pathElements: fixture.pathElements,
			pathIndices: fixture.pathIndices,
		});

		await pool.write.withdraw(
			[
				proof.pA,
				proof.pB,
				proof.pC,
				rootHex,
				nullifierHashHex,
				recipient.account.address,
				relayer.account.address,
				fee,
				expiry,
			],
			{ account: owner.account },
		);

		try {
			await pool.write.withdraw(
				[
					proof.pA,
					proof.pB,
					proof.pC,
					rootHex,
					nullifierHashHex,
					recipient.account.address,
					relayer.account.address,
					fee,
					expiry,
				],
				{ account: owner.account },
			);
			expect.fail("Should have reverted");
		} catch (error: unknown) {
			expect((error as Error).message).to.include("NullifierAlreadyUsed");
		}
	});

	it("rejects proofs when the quoted fee changes", async function () {
		const { owner, recipient, relayer, publicClient, pool } = await deployFixture();
		const scope = await pool.read.scope();
		const fixture = await buildPoolProofFixture(scope);
		const rootHex = toBytes32Hex(fixture.root);
		const nullifierHashHex = toBytes32Hex(fixture.nullifierHash);

		await pool.write.deposit([toBytes32Hex(fixture.commitment)], {
			account: owner.account,
			value: DENOMINATION,
		});

		const latestBlock = await publicClient.getBlock();
		const expiry = latestBlock.timestamp + 3600n;
		const quotedFee = DENOMINATION / 100n;
		const context = computeContext({
			chainId: BigInt(await publicClient.getChainId()),
			poolAddress: pool.address,
			recipient: recipient.account.address,
			relayer: relayer.account.address,
			fee: quotedFee,
			expiry,
		});
		const proof = await generateWithdrawProof({
			root: fixture.root,
			nullifierHash: fixture.nullifierHash,
			scope,
			context,
			nullifier: fixture.nullifier,
			secret: fixture.secret,
			pathElements: fixture.pathElements,
			pathIndices: fixture.pathIndices,
		});

		try {
			await pool.write.withdraw(
				[
					proof.pA,
					proof.pB,
					proof.pC,
					rootHex,
					nullifierHashHex,
					recipient.account.address,
					relayer.account.address,
					quotedFee + 1n,
					expiry,
				],
				{ account: owner.account },
			);
			expect.fail("Should have reverted");
		} catch (error: unknown) {
			expect((error as Error).message).to.include("InvalidProof");
		}
	});
});
