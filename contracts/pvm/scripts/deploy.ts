import { ethers } from "hardhat";

async function main() {
  const Counter = await ethers.getContractFactory("Counter");
  console.log("Deploying Counter (PVM/resolc)...");
  const counter = await Counter.deploy();
  await counter.waitForDeployment();
  const address = await counter.getAddress();
  console.log(`PVM Counter deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
