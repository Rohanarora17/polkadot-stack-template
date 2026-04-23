import { test, expect } from "./fixtures";
import { waitForStealthLab } from "./helpers";

test.describe("Stealth lab via host wallet", () => {
	test("loads the stealth lab inside the host container", async ({ testHost }) => {
		const frame = await waitForStealthLab(testHost);
		await expect(frame.locator('[data-testid="stealth-lab-heading"]')).toBeVisible();
		await expect(frame.locator('[data-testid="stealth-derive-button"]')).toBeVisible();
	});

	test.fixme("derives deterministic stealth keys through the host signing flow", async ({
		testHost,
	}) => {
		await testHost.setEnforcePermissions(false);
		const frame = await waitForStealthLab(testHost);
		const deriveButton = frame.locator('[data-testid="stealth-derive-button"]');

		await deriveButton.click();

		await expect(frame.locator('[data-testid="stealth-results"]')).toBeVisible();
		await expect(frame.locator('[data-testid="stealth-wallet-adapter"]')).toContainText(
			"Pwallet / Host API",
		);
		await expect(frame.locator('[data-testid="stealth-account"]')).not.toHaveText("");
		await expect(frame.locator('[data-testid="stealth-chain-id"]')).toContainText("420420421");
		await expect(frame.locator('[data-testid="stealth-signature"]')).toContainText("0x");
		await expect(frame.locator('[data-testid="stealth-meta-address"]')).toContainText("0x");

		await deriveButton.click();

		await expect(frame.locator('[data-testid="stealth-reproducible"]')).toBeVisible();

		const signingLog = await testHost.getSigningLog();
		expect(signingLog).toHaveLength(2);
	});
});
