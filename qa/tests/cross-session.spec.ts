import { expect, test } from "@playwright/test";
import { captureAction, observePage, openRole, resetDemo, saveJson } from "./helpers/agra";

test.describe.serial("cross-session operational freshness", () => {
  test.beforeEach(async () => {
    await resetDemo();
  });

  test.afterEach(async () => {
    await resetDemo();
  });

  test("submitted order reaches the affected role within eight seconds", async ({ browser }) => {
    const salesContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const qualityContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const salesPage = await salesContext.newPage();
    const qualityPage = await qualityContext.newPage();
    const salesSignals = observePage(salesPage);
    const qualitySignals = observePage(qualityPage);

    await Promise.all([
      openRole(salesPage, "Sales"),
      openRole(qualityPage, "Stock & quality"),
    ]);
    await salesPage.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Orders" }).click();
    await salesPage.getByRole("button", { name: /AGRA-DEMO-001/ }).click();
    const action = await captureAction(salesPage, async () => {
      await salesPage.getByRole("button", { name: /Submit for stock check/ }).click();
    });
    expect(action.response.ok).toBe(true);
    if (process.env.N8N_MCP_ACCESS_TOKEN) {
      expect(action.n8nExecution?.id).toBeTruthy();
    }
    await expect(
      salesPage.locator("span").filter({ hasText: /^Awaiting Stock Check$/ }).first(),
    ).toBeVisible();

    await expect
      .poll(
        async () => qualityPage.getByText("AGRA-DEMO-001", { exact: true }).count(),
        { timeout: 8_000, intervals: [500, 1_000] },
      )
      .toBeGreaterThan(0);

    await saveJson("cross-session/submit-order.json", {
      action,
      salesSignals,
      qualitySignals,
      freshnessLimitMs: 8_000,
    });
    expect(salesSignals.consoleErrors).toEqual([]);
    expect(qualitySignals.consoleErrors).toEqual([]);
    expect(salesSignals.failedRequests).toEqual([]);
    expect(qualitySignals.failedRequests).toEqual([]);
    await Promise.all([salesContext.close(), qualityContext.close()]);
  });
});
