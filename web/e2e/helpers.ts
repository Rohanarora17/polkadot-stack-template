import { expect, type FrameLocator } from "@playwright/test";
import type { TestHost } from "./fixtures";

export async function waitForStealthLab(testHost: TestHost): Promise<FrameLocator> {
	const frame = testHost.productFrame();
	await frame.locator("body").waitFor({ state: "attached", timeout: 30_000 });
	await frame.locator('[data-testid="stealth-lab-heading"]').waitFor({
		state: "visible",
		timeout: 30_000,
	});
	await expect(frame.locator('[data-testid="stealth-derive-button"]')).toBeVisible();
	return frame;
}
