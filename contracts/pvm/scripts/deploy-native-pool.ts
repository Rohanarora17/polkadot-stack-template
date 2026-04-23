import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { poseidonContract } from "circomlibjs";
import { polkadotHubTestnet } from "../hardhat.config";

const OUTPUT_JSON = path.resolve(__dirname, "../../../deployments.native-pool.json");

async function main() {
	console.log("Deploying experimental native-denomination StealthPay pool (PVM/resolc)...");

	const isTestnet = hre.network.name === "polkadotTestnet";
	const chainOption = isTestnet ? { chain: polkadotHubTestnet } : {};

	const [walletClient] = await hre.viem.getWalletClients(chainOption);
	const publicClient = await hre.viem.getPublicClient(chainOption);

	console.log("Deploying Poseidon hasher...");
	const poseidonHash = await walletClient.deployContract({
		abi: poseidonContract.generateABI(2) as unknown[],
		bytecode: poseidonContract.createCode(2) as `0x${string}`,
	});
	const poseidonReceipt = await publicClient.waitForTransactionReceipt({
		hash: poseidonHash,
		timeout: 120_000,
	});
	if (!poseidonReceipt.contractAddress) {
		throw new Error(`Poseidon deploy tx ${poseidonHash} did not create a contract`);
	}

	console.log("Deploying StealthPayPoolNativeV1...");
	const poolArtifact = await hre.artifacts.readArtifact("StealthPayPoolNativeV1");
	const poolHash = await walletClient.deployContract({
		abi: poolArtifact.abi,
		args: [poseidonReceipt.contractAddress],
		bytecode: poolArtifact.bytecode as `0x${string}`,
	});
	const poolReceipt = await publicClient.waitForTransactionReceipt({
		hash: poolHash,
		timeout: 120_000,
	});
	if (!poolReceipt.contractAddress) {
		throw new Error(`StealthPayPoolNativeV1 deploy tx ${poolHash} did not create a contract`);
	}

	const deployment = {
		chainId: await publicClient.getChainId(),
		denomination: "1000000000000",
		deployedAt: new Date().toISOString(),
		network: hre.network.name,
		poseidon: poseidonReceipt.contractAddress,
		poseidonTx: poseidonHash,
		stealthPayPoolNativePvm: poolReceipt.contractAddress,
		stealthPayPoolNativeTx: poolHash,
	};
	fs.writeFileSync(OUTPUT_JSON, JSON.stringify(deployment, null, 2) + "\n");

	console.log(`Poseidon deployed to: ${poseidonReceipt.contractAddress}`);
	console.log(`StealthPayPoolNativeV1 deployed to: ${poolReceipt.contractAddress}`);
	console.log(`Wrote ${OUTPUT_JSON}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
