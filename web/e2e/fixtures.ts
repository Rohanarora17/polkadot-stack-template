import { test as base } from "@playwright/test";
import { createTestHostServer, type ChainConfig } from "@parity/host-api-test-sdk";
import type { FrameLocator, Page } from "@playwright/test";

export type TestHost = {
	page: Page;
	productFrame(): FrameLocator;
	getSigningLog(): Promise<unknown[]>;
	getPermissionLog(): Promise<unknown[]>;
	setEnforcePermissions(enforce: boolean): Promise<void>;
};

const productPort = Number(process.env.E2E_PRODUCT_PORT ?? "5199");
const localGenesisHash = process.env.STEALTHPAY_LOCAL_GENESIS_HASH as `0x${string}` | undefined;

if (!localGenesisHash) {
	throw new Error(
		"STEALTHPAY_LOCAL_GENESIS_HASH is required. Run e2e tests through `npm run test:e2e`.",
	);
}

const localChain: ChainConfig = {
	id: "stealthpay-local",
	name: "StealthPay Local Asset Hub",
	genesisHash: localGenesisHash,
	rpcUrl: process.env.E2E_LOCAL_WS_URL ?? "ws://127.0.0.1:9944",
	tokenSymbol: "UNIT",
	tokenDecimals: 18,
};

export const test = base.extend<{ testHost: TestHost }>({
	testHost: async ({ page }, runFixture) => {
		const server = await createTestHostServer({
			productUrl: `http://127.0.0.1:${productPort}`,
			accounts: ["alice"],
			chain: localChain,
		});

		await page.goto(
			`${server.url}?e2e-route=stealth-lab&e2e-bypass-host-permissions=1`,
		);
		await page.waitForFunction(() => Boolean(window.__TEST_HOST__), { timeout: 30_000 });

		const testHost: TestHost = {
			page,
			productFrame() {
				return page.frameLocator("#product-frame");
			},
			async getSigningLog() {
				return await page.evaluate(() => window.__TEST_HOST__.getSigningLog());
			},
			async getPermissionLog() {
				return await page.evaluate(() => window.__TEST_HOST__.getPermissionLog());
			},
			async setEnforcePermissions(enforce) {
				await page.evaluate((nextValue) => {
					window.__TEST_HOST__.setEnforcePermissions(nextValue);
				}, enforce);
			},
		};

		await runFixture(testHost);

		await page.evaluate(() => window.__TEST_HOST__?.dispose());
		await server.close();
	},
});

export { expect } from "@playwright/test";
