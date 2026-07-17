import { expect, test } from "@playwright/test";
import {
  callAction,
  loadWorkspace,
  observePage,
  openApiSession,
  openRole,
  resetDemo,
} from "./helpers/agra";

const DEMO_ORDER_ID = "30000000-0000-4000-8000-000000000001";

test.describe.serial("diary quality control", () => {
  test.beforeEach(async () => {
    await resetDemo();
    const [sales, quality, supervisor, packing] = await Promise.all([
      openApiSession("Sales"),
      openApiSession("Stock & quality"),
      openApiSession("Supervisor"),
      openApiSession("Packing"),
    ]);
    for (const [client, action] of [
      [sales, "SUBMIT_ORDER"],
      [quality, "CHECK_STOCK"],
      [supervisor, "APPROVE_ORDER"],
      [packing, "START_PICKING"],
      [packing, "COMPLETE_PICKING"],
    ] as const) {
      const result = await callAction(client, action, DEMO_ORDER_ID);
      expect(result.response.ok, result.response.message).toBe(true);
    }
  });

  test.afterEach(async () => {
    await resetDemo();
  });

  test("quality form captures the diary-specific checklist", async ({ page }) => {
    const signals = observePage(page);
    await openRole(page, "Stock & quality");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Orders" }).click();
    await page.getByRole("button", { name: /AGRA-DEMO-001/ }).click();
    await page.getByRole("button", { name: "Complete quality check" }).click();
    await page.getByLabel(/^Result/).selectOption("PASSED");
    await page.getByRole("button", { name: /^Next/ }).click();

    for (const item of [
      "Page count is correct",
      "Dimensions are correct",
      "Binding is secure",
      "Cover is correct",
      "Branding is correct",
      "Pages are clean",
      "No torn pages",
    ]) {
      await expect(page.getByRole("checkbox", { name: item })).toBeVisible();
    }
    expect(signals.consoleErrors).toEqual([]);
    expect(signals.failedRequests).toEqual([]);
  });

  test("quality can split rework into corrected and damaged quantities", async ({ page }) => {
    const qualityApi = await openApiSession("Stock & quality");
    const failed = await callAction(qualityApi, "RECORD_QC", DEMO_ORDER_ID, {
      result: "REWORK_REQUIRED",
      affectedQuantity: 50,
      defectType: "INSECURE_BINDING",
      defectDescription: "Fifty bindings require correction.",
      checklist: { pageCount: true, dimensions: true, binding: false, coverFinish: true, branding: true, pagesClean: true, damageFree: true },
    });
    expect(failed.response.ok, failed.response.message).toBe(true);

    await openRole(page, "Stock & quality");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Orders" }).click();
    await page.getByRole("button", { name: /AGRA-DEMO-001/ }).click();
    await page.getByRole("button", { name: "Complete rework" }).click();
    const dialog = page.getByRole("dialog", { name: "Finish rework" });
    await expect(dialog.getByLabel(/Released quantity/)).toHaveValue("50");
    await dialog.getByLabel(/Released quantity/).fill("45");
    await dialog.getByLabel(/Damaged quantity/).fill("5");
    await dialog.getByLabel(/Blocked quantity/).fill("0");
    await dialog.getByRole("button", { name: /^Next/ }).click();
    await dialog.getByLabel(/Completion note/).fill("Forty-five corrected; five rejected.");
    await expect(dialog.getByRole("button", { name: "Save reinspection" })).toBeVisible();
    await dialog.getByRole("button", { name: "Save reinspection" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });

    const workspace = await loadWorkspace(qualityApi);
    const order = workspace.orders.find((item: { id: string }) => item.id === DEMO_ORDER_ID);
    const diary = workspace.products.find((item: { sku: string }) => item.sku === "KHK-DIA-A5-NAT");
    expect(order.fulfillment_status).toBe("BLOCKED");
    expect(order.reworkRecords[0].rework_quantity).toBe(45);
    expect(order.reworkRecords[0].rejected_quantity).toBe(5);
    expect(diary.reworkStock).toBe(0);
    expect(diary.damagedStock).toBe(5);
  });
});
