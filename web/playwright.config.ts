import { defineConfig, devices } from "@playwright/test";

const productPort = Number(process.env.E2E_PRODUCT_PORT ?? "5199");

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	timeout: 120_000,
	expect: {
		timeout: 30_000,
	},
	retries: process.env.CI ? 1 : 0,
	reporter: [["html", { open: "never", outputFolder: "output/playwright/report" }], ["list"]],
	outputDir: "output/playwright/artifacts",
	use: {
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "on-first-retry",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: `npm run dev -- --host 127.0.0.1 --port ${productPort}`,
		port: productPort,
		reuseExistingServer: !process.env.CI,
		timeout: 30_000,
	},
});
