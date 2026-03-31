import { ethers } from "hardhat";

async function main() {
  const Counter = await ethers.getContractFactory("Counter");
  console.log("Deploying Counter (EVM/solc)...");
  const counter = await Counter.deploy();
  await counter.waitForDeployment();
  const address = await counter.getAddress();
  console.log(`EVM Counter deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
