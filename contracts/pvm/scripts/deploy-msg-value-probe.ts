import hre from "hardhat";
import { polkadotHubTestnet } from "../hardhat.config";

async function main() {
	const isTestnet = hre.network.name === "polkadotTestnet";
	const chainOption = isTestnet ? { chain: polkadotHubTestnet } : {};
	const [walletClient] = await hre.viem.getWalletClients(chainOption);
	const publicClient = await hre.viem.getPublicClient(chainOption);

	const artifact = await hre.artifacts.readArtifact("MsgValueProbe");
	const hash = await walletClient.deployContract({
		abi: artifact.abi,
		bytecode: artifact.bytecode as `0x${string}`,
	});
	const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
	if (!receipt.contractAddress) {
		throw new Error(`MsgValueProbe deploy tx ${hash} did not create a contract`);
	}

	console.log(`MsgValueProbe deployed to: ${receipt.contractAddress}`);
	console.log(`Deploy tx: ${hash}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
