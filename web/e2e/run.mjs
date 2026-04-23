/* global WebSocket, clearTimeout, console, process, setTimeout */

import { spawn } from "node:child_process";

const localWsUrl = process.env.E2E_LOCAL_WS_URL ?? "ws://127.0.0.1:9944";

async function fetchGenesisHash(wsUrl) {
	return await new Promise((resolve, reject) => {
		const socket = new WebSocket(wsUrl);
		const timer = setTimeout(() => {
			socket.close();
			reject(new Error(`Timed out connecting to ${wsUrl}`));
		}, 10_000);

		socket.addEventListener("open", () => {
			socket.send(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "chain_getBlockHash",
					params: [0],
				}),
			);
		});

		socket.addEventListener("message", (event) => {
			try {
				const payload = JSON.parse(String(event.data));
				if (payload.id !== 1) {
					return;
				}

				clearTimeout(timer);
				socket.close();

				if (typeof payload.result !== "string" || !payload.result.startsWith("0x")) {
					reject(new Error(`Unexpected genesis hash response: ${JSON.stringify(payload)}`));
					return;
				}

				resolve(payload.result);
			} catch (cause) {
				clearTimeout(timer);
				socket.close();
				reject(cause);
			}
		});

		socket.addEventListener("error", () => {
			clearTimeout(timer);
			reject(new Error(`Failed to connect to local chain at ${wsUrl}`));
		});
	});
}

function runPlaywright(extraEnv) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.platform === "win32" ? "npx.cmd" : "npx",
			["playwright", "test", ...process.argv.slice(2)],
			{
				stdio: "inherit",
				env: {
					...process.env,
					...extraEnv,
				},
			},
		);

		child.on("exit", (code, signal) => {
			if (signal) {
				reject(new Error(`Playwright terminated with signal ${signal}`));
				return;
			}
			resolve(code ?? 1);
		});

		child.on("error", reject);
	});
}

try {
	const genesisHash = await fetchGenesisHash(localWsUrl);
	const exitCode = await runPlaywright({
		STEALTHPAY_LOCAL_GENESIS_HASH: genesisHash,
		E2E_LOCAL_WS_URL: localWsUrl,
	});
	process.exit(Number(exitCode));
} catch (cause) {
	console.error(cause instanceof Error ? cause.message : String(cause));
	process.exit(1);
}
