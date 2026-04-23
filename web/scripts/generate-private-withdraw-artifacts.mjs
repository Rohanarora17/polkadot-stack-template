import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(webDir, "..");

const circuitName = "private-withdraw";
const circuitDir = path.join(webDir, "zk");
const circuitPath = path.join(circuitDir, `${circuitName}.circom`);

const buildDir = path.join(circuitDir, "build");
const ptauDir = path.join(circuitDir, "ptau");
const publicDir = path.join(webDir, "public", "zk", circuitName);

const r1csPath = path.join(buildDir, `${circuitName}.r1cs`);
const wasmDir = path.join(buildDir, `${circuitName}_js`);
const wasmPath = path.join(wasmDir, `${circuitName}.wasm`);
const zkeyInitial = path.join(buildDir, `${circuitName}_0000.zkey`);
const zkeyFinal = path.join(buildDir, `${circuitName}_final.zkey`);
const verificationKey = path.join(buildDir, `${circuitName}_verification_key.json`);

const ptauInitial = path.join(ptauDir, "pot14_0000.ptau");
const ptauContributed = path.join(ptauDir, "pot14_contributed.ptau");
const ptauFinal = path.join(ptauDir, "pot14_final.ptau");

const evmVerifierPath = path.join(repoDir, "contracts", "evm", "contracts", "WithdrawVerifier.sol");
const pvmVerifierPath = path.join(repoDir, "contracts", "pvm", "contracts", "WithdrawVerifier.sol");

fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(ptauDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

function run(command, args, cwd = webDir) {
	console.log(`\n> ${command} ${args.join(" ")}`);
	execFileSync(command, args, {
		cwd,
		stdio: "inherit",
		env: process.env,
	});
}

function copyArtifact(source, target) {
	fs.copyFileSync(source, target);
	console.log(`Copied ${path.relative(repoDir, source)} -> ${path.relative(repoDir, target)}`);
}

function normalizeVerifier(sourcePath, targetPath) {
	const source = fs.readFileSync(sourcePath, "utf8");
	const normalized = source
		.replace(/^pragma solidity \^[0-9.]+;/m, "pragma solidity ^0.8.28;")
		.replace(
			/contract Groth16Verifier\b/g,
			"contract WithdrawVerifier",
		)
		.replace(
			/\/\/ SPDX-License-Identifier: GPL-3.0/m,
			"// SPDX-License-Identifier: MIT",
		);

	fs.writeFileSync(targetPath, normalized);
	console.log(`Wrote verifier ${path.relative(repoDir, targetPath)}`);
}

run("npx", [
	"circom2",
	circuitPath,
	"--r1cs",
	"--wasm",
	"--sym",
	"-o",
	buildDir,
	"-l",
	path.join(webDir, "node_modules"),
]);

if (!fs.existsSync(ptauInitial)) {
	run("npx", ["snarkjs", "powersoftau", "new", "bn128", "14", ptauInitial]);
}

run("npx", [
	"snarkjs",
	"powersoftau",
	"contribute",
	ptauInitial,
	ptauContributed,
	"--name=StealthPay Powers",
	'-e=stealthpay-private-withdraw',
]);

run("npx", [
	"snarkjs",
	"powersoftau",
	"prepare",
	"phase2",
	ptauContributed,
	ptauFinal,
]);

run("npx", ["snarkjs", "groth16", "setup", r1csPath, ptauFinal, zkeyInitial]);
run("npx", [
	"snarkjs",
	"zkey",
	"contribute",
	zkeyInitial,
	zkeyFinal,
	"--name=StealthPay Withdraw Key",
	'-e=stealthpay-withdraw-v1',
]);
run("npx", ["snarkjs", "zkey", "export", "verificationkey", zkeyFinal, verificationKey]);

const verifierTemp = path.join(buildDir, "WithdrawVerifier.generated.sol");
run("npx", ["snarkjs", "zkey", "export", "solidityverifier", zkeyFinal, verifierTemp]);

copyArtifact(wasmPath, path.join(publicDir, `${circuitName}.wasm`));
copyArtifact(zkeyFinal, path.join(publicDir, `${circuitName}.zkey`));
copyArtifact(verificationKey, path.join(publicDir, "verification_key.json"));

normalizeVerifier(verifierTemp, evmVerifierPath);
normalizeVerifier(verifierTemp, pvmVerifierPath);
