import { mkdir } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  captureAction,
  loadWorkspace,
  observePage,
  openApiSession,
  openRole,
  resetDemo,
  saveJson,
  type ActionEvidence,
  type RoleLabel,
} from "./helpers/agra";

const CUSTOMER_NAME = "Kathmandu Eco Gifts Pvt. Ltd.";
const CUSTOMER_REFERENCE = "KEG-QA-200-DIARY-001";
const DIARY_SKU = "KHK-DIA-A5-NAT";

function futureDate(days = 7) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function rolePage(browser: Browser, role: RoleLabel) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const signals = observePage(page);
  await openRole(page, role);
  return { context, page, signals };
}

async function openOrder(page: Page, orderNo: string) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Orders" }).click();
  await page.getByPlaceholder(/Search order, customer/).fill(orderNo);
  await page.getByRole("button", { name: new RegExp(orderNo) }).click();
  await expect(page.getByRole("heading", { name: orderNo })).toBeVisible();
}

async function snapshot(manager: SupabaseClient, orderId: string | null) {
  const workspace = await loadWorkspace(manager);
  const order = orderId ? workspace.orders.find((item: { id: string }) => item.id === orderId) ?? null : null;
  const diary = workspace.products.find((item: { sku: string }) => item.sku === DIARY_SKU);
  return {
    capturedAt: new Date().toISOString(),
    order,
    diary,
    diaryBatches: workspace.inventoryBatches.filter((item: { product: { sku: string } }) => item.product.sku === DIARY_SKU),
    audit: orderId ? workspace.auditEvents.filter((item: { entity_id: string | null }) => item.entity_id === orderId) : workspace.auditEvents.slice(0, 20),
    exceptions: orderId ? workspace.exceptions.filter((item: { order_id: string | null }) => item.order_id === orderId) : workspace.exceptions,
  };
}

test.describe.serial("200-diary production demonstration", () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await mkdir("qa/artifacts/screenshots", { recursive: true });
    await resetDemo();
  });

  test.afterAll(async () => {
    await resetDemo();
  });

  test("completes the role-to-role dispatch and leaves exactly 50 available", async ({ browser }) => {
    const managerApi = await openApiSession("Manager");
    const evidence: ActionEvidence[] = [];
    const states: Record<string, unknown> = { baseline: await snapshot(managerApi, null) };
    const sessions = [];

    const sales = await rolePage(browser, "Sales");
    sessions.push(sales);
    await sales.page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Orders" }).click();
    await sales.page.getByRole("button", { name: "New order" }).click();
    const orderDialog = sales.page.getByRole("dialog", { name: "New order" });
    const customerSelect = orderDialog.getByLabel(/^Customer \*/);
    const customerId = await customerSelect.locator("option", { hasText: CUSTOMER_NAME }).getAttribute("value");
    expect(customerId).toBeTruthy();
    await customerSelect.selectOption(customerId!);
    await orderDialog.getByLabel(/Customer order ref/).fill(CUSTOMER_REFERENCE);
    await orderDialog.getByRole("button", { name: /^Next/ }).click();
    await expect(orderDialog.getByText("Order products", { exact: true })).toBeVisible();

    const productSelect = orderDialog.locator("label").filter({ hasText: /^Product/ }).locator("select");
    const diaryProductId = await productSelect.locator("option", { hasText: DIARY_SKU }).getAttribute("value");
    expect(diaryProductId).toBeTruthy();
    await productSelect.selectOption(diaryProductId!);
    await orderDialog.getByLabel("Quantity").fill("200");
    await orderDialog.getByRole("button", { name: /^Next/ }).click();
    await orderDialog.getByLabel(/Required dispatch date/).fill(futureDate());
    await orderDialog.getByLabel(/Priority/).selectOption("NORMAL");
    await orderDialog.getByLabel(/Fulfilment source/).selectOption("FINISHED_STOCK");
    await orderDialog.getByRole("button", { name: /^Next/ }).click();
    await orderDialog.getByRole("button", { name: /^Next/ }).click();
    const createOrder = await captureAction(sales.page, () => orderDialog.getByRole("button", { name: "Create order" }).click());
    evidence.push(createOrder);
    expect(createOrder.response.ok, createOrder.response.message).toBe(true);
    const orderId = createOrder.response.entityId!;
    const createdState = await snapshot(managerApi, orderId);
    states.created = createdState;
    const orderNo = (createdState.order as { order_no: string }).order_no;
    await sales.page.screenshot({ path: "qa/artifacts/screenshots/01-order-created.png", fullPage: true });

    await openOrder(sales.page, orderNo);
    evidence.push(await captureAction(sales.page, () => sales.page.getByRole("button", { name: /Submit for stock check/ }).click()));
    states.submitted = await snapshot(managerApi, orderId);
    await sales.context.close();

    const quality = await rolePage(browser, "Stock & quality");
    sessions.push(quality);
    await openOrder(quality.page, orderNo);
    evidence.push(await captureAction(quality.page, () => quality.page.getByRole("button", { name: "Confirm released stock" }).click()));

    const supervisor = await rolePage(browser, "Supervisor");
    sessions.push(supervisor);
    await openOrder(supervisor.page, orderNo);
    evidence.push(await captureAction(supervisor.page, () => supervisor.page.getByRole("button", { name: /Approve and reserve stock/ }).click()));
    states.approved = await snapshot(managerApi, orderId);
    expect((states.approved as { diary: { availableStock: number; reservedStock: number } }).diary.availableStock).toBe(50);
    expect((states.approved as { diary: { availableStock: number; reservedStock: number } }).diary.reservedStock).toBe(200);
    await supervisor.page.screenshot({ path: "qa/artifacts/screenshots/02-order-approved.png", fullPage: true });
    await supervisor.context.close();

    const packing = await rolePage(browser, "Packing");
    sessions.push(packing);
    await openOrder(packing.page, orderNo);
    evidence.push(await captureAction(packing.page, () => packing.page.getByRole("button", { name: "Start picking" }).click()));
    evidence.push(await captureAction(packing.page, () => packing.page.getByRole("button", { name: "Confirm picked quantity" }).click()));

    await quality.page.reload({ waitUntil: "domcontentloaded" });
    await expect(quality.page.getByRole("heading", { name: orderNo })).toBeVisible();
    await quality.page.getByRole("button", { name: "Complete quality check" }).click();
    const qcDialog = quality.page.getByRole("dialog", { name: "Quality check" });
    await qcDialog.getByLabel(/Result/).selectOption("PASSED");
    for (const label of ["Page count is correct", "Dimensions are correct", "Binding is secure", "Cover is correct", "Branding is correct", "Pages are clean", "No torn pages"]) {
      await qcDialog.getByRole("checkbox", { name: label }).check();
    }
    await qcDialog.getByRole("button", { name: /^Next/ }).click();
    await qcDialog.getByRole("button", { name: /^Next/ }).click();
    evidence.push(await captureAction(quality.page, () => qcDialog.getByRole("button", { name: "Save quality result" }).click()));
    states.qualityPassed = await snapshot(managerApi, orderId);
    await quality.page.screenshot({ path: "qa/artifacts/screenshots/03-quality-passed.png", fullPage: true });
    await quality.context.close();

    await packing.page.reload({ waitUntil: "domcontentloaded" });
    await packing.page.getByRole("button", { name: "Complete packing" }).click();
    const packingDialog = packing.page.getByRole("dialog", { name: "Finish packing" });
    await packingDialog.getByLabel(/Package count/).fill("10");
    await packingDialog.getByLabel(/Carton count/).fill("10");
    await packingDialog.getByLabel(/Quantity per package/).fill("20");
    await packingDialog.getByLabel(/Packing type/).fill("Moisture-protected carton");
    await packingDialog.getByLabel(/Shipment weight/).fill("72");
    await packingDialog.getByRole("checkbox", { name: "Moisture protection" }).check();
    await packingDialog.getByRole("button", { name: /^Next/ }).click();
    evidence.push(await captureAction(packing.page, () => packingDialog.getByRole("button", { name: "Save packing" }).click()));
    states.packed = await snapshot(managerApi, orderId);

    await packing.page.getByRole("button", { name: "Confirm handover" }).click();
    let handoverDialog = packing.page.getByRole("dialog", { name: "Confirm handover" });
    await handoverDialog.getByLabel(/Courier \/ company/).fill("Nepal Demo Logistics");
    await handoverDialog.getByLabel(/Tracking number/).fill("NDL-KEG-001");
    await handoverDialog.getByLabel(/Package count/).fill("10");
    const blockedHandover = await captureAction(packing.page, () => handoverDialog.getByRole("button", { name: "Confirm handover" }).click());
    evidence.push(blockedHandover);
    expect(blockedHandover.response.ok).toBe(false);
    expect(blockedHandover.response.code).toBe("MISSING_REQUIRED_DOCUMENT");
    await handoverDialog.getByRole("button", { name: "Close" }).click();
    await expect.poll(async () => (await snapshot(managerApi, orderId)).order?.fulfillment_status, { timeout: 8_000 }).toBe("BLOCKED");
    states.documentBlocked = await snapshot(managerApi, orderId);
    await packing.page.screenshot({ path: "qa/artifacts/screenshots/04-document-block.png", fullPage: true });

    await expect(packing.page.getByRole("button", { name: "Check required documents" })).toBeVisible({ timeout: 8_000 });
    await packing.page.getByRole("button", { name: "Check required documents" }).click();
    const documentsDialog = packing.page.getByRole("dialog", { name: "Check documents" });
    await documentsDialog.locator('label:has-text("Invoice") input').fill("INV-KEG-001");
    await documentsDialog.locator('label:has-text("Packing List") input').fill("PL-KEG-001");
    await documentsDialog.locator('label:has-text("Dispatch Note") input').fill("DN-KEG-001");
    evidence.push(await captureAction(packing.page, () => documentsDialog.getByRole("button", { name: "Save checks" }).click()));
    states.documentsVerified = await snapshot(managerApi, orderId);
    expect((states.documentsVerified as { order: { fulfillment_status: string } }).order.fulfillment_status).toBe("READY_FOR_HANDOVER");

    await packing.page.getByRole("button", { name: "Confirm handover" }).click();
    handoverDialog = packing.page.getByRole("dialog", { name: "Confirm handover" });
    await handoverDialog.getByLabel(/Courier \/ company/).fill("Nepal Demo Logistics");
    await handoverDialog.getByLabel(/Tracking number/).fill("NDL-KEG-001");
    await handoverDialog.getByLabel(/Package count/).fill("10");
    const finalHandover = await captureAction(packing.page, () => handoverDialog.getByRole("button", { name: "Confirm handover" }).click());
    evidence.push(finalHandover);
    expect(finalHandover.response.ok, finalHandover.response.message).toBe(true);
    states.dispatched = await snapshot(managerApi, orderId);
    await packing.page.screenshot({ path: "qa/artifacts/screenshots/05-dispatched.png", fullPage: true });

    const manager = await rolePage(browser, "Manager");
    sessions.push(manager);
    await manager.page.goto(`/?view=orders&order=${orderId}`, { waitUntil: "domcontentloaded" });
    await expect(manager.page.getByRole("heading", { name: orderNo })).toBeVisible({ timeout: 30_000 });
    await expect(manager.page.locator("span").filter({ hasText: /^Dispatched$/ }).first()).toBeVisible();
    await manager.page.reload({ waitUntil: "domcontentloaded" });
    await expect(manager.page.getByRole("heading", { name: orderNo })).toBeVisible();
    await manager.page.screenshot({ path: "qa/artifacts/screenshots/06-manager-persistence.png", fullPage: true });

    const finalState = await snapshot(managerApi, orderId);
    const finalOrder = finalState.order;
    expect(finalOrder.fulfillment_status).toBe("DISPATCHED");
    expect(finalOrder.order_status).toBe("CLOSED");
    expect(finalState.diary.availableStock).toBe(50);
    expect(finalState.diary.reservedStock).toBe(0);
    expect(finalOrder.handover.company_name).toBe("Nepal Demo Logistics");
    expect(finalOrder.handover.tracking_number).toBe("NDL-KEG-001");
    expect(finalOrder.packing.carton_count).toBe(10);
    expect(finalOrder.packing.items.reduce((sum: number, item: { packed_quantity: number }) => sum + Number(item.packed_quantity), 0)).toBe(200);
    expect(finalState.audit.filter((item: { success: boolean }) => item.success).length).toBeGreaterThanOrEqual(10);

    await saveJson("full-dispatch/evidence.json", { evidence, states: { ...states, final: finalState }, signals: sessions.map((item) => item.signals) });
    for (const session of sessions) {
      expect(session.signals.consoleErrors).toEqual([]);
      expect(session.signals.failedRequests).toEqual([]);
    }
    await Promise.all([packing.context.close(), manager.context.close()]);
    await managerApi.auth.signOut();
  });
});
