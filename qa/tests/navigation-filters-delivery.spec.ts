import { expect, test } from "@playwright/test";
import { callAction, loadWorkspace, openApiSession, openRole, resetDemo } from "./helpers/agra";

const DEMO_ORDER_ID = "30000000-0000-4000-8000-000000000001";

test.describe.serial("navigation, filters, and delivery controls", () => {
  test.beforeEach(async () => {
    await resetDemo();
  });

  test.afterEach(async () => {
    await resetDemo();
  });

  test("direct links, history, invalid IDs, and role-restricted links remain honest", async ({ browser }) => {
    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    await openRole(managerPage, "Manager");
    await managerPage.goto(`/?view=orders&order=${DEMO_ORDER_ID}`, { waitUntil: "domcontentloaded" });
    await expect(managerPage.getByRole("heading", { name: "AGRA-DEMO-001" })).toBeVisible();

    await managerPage.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Reports" }).click();
    await expect(managerPage).toHaveURL(/view=reports/);
    await expect(managerPage.getByRole("heading", { name: "Operations report" })).toBeVisible();
    await managerPage.goBack();
    await expect(managerPage.getByRole("heading", { name: "AGRA-DEMO-001" })).toBeVisible();

    await managerPage.goto("/?view=orders&order=ffffffff-ffff-4fff-8fff-ffffffffffff", { waitUntil: "domcontentloaded" });
    await expect(managerPage.getByText("Choose an order", { exact: true })).toBeVisible();
    await expect(managerPage.getByRole("heading", { name: "AGRA-DEMO-001" })).toHaveCount(0);
    await managerContext.close();

    const salesContext = await browser.newContext();
    const salesPage = await salesContext.newPage();
    await openRole(salesPage, "Sales");
    await salesPage.goto("/?view=system", { waitUntil: "domcontentloaded" });
    await expect(salesPage.getByRole("heading", { name: "Orders waiting for you" })).toBeVisible();
    await expect(salesPage.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "System" })).toHaveCount(0);
    await salesContext.close();
  });

  test("combined order filters, stable sorting, and clear restore the complete list", async ({ page }) => {
    const manager = await openApiSession("Manager");
    const workspace = await loadWorkspace(manager);
    const target = workspace.orders.find((item: { id: string }) => item.id === DEMO_ORDER_ID);
    expect(target).toBeTruthy();

    await openRole(page, "Manager");
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Orders" }).click();
    const allRows = page.getByTestId("order-row");
    await expect(allRows).toHaveCount(5);
    await page.getByLabel("Filter by status").selectOption("DRAFT");
    await page.getByLabel("Filter by customer").selectOption(target.customer_id);
    await page.getByLabel("Filter by dispatch date").fill(target.requested_dispatch_date);
    await page.getByLabel("Filter by SKU").selectOption(target.items[0].product_id);
    await page.getByLabel("Filter by priority").selectOption(target.priority);
    await page.getByLabel("Filter by responsible team").selectOption("Sales & Orders");
    await expect(allRows).toHaveCount(1);
    await expect(allRows.first()).toHaveAttribute("data-order-id", DEMO_ORDER_ID);

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(allRows).toHaveCount(5);
    await page.getByLabel("Sort orders").selectOption("ORDER_NO");
    const labels = await allRows.locator("p.font-semibold").allTextContents();
    expect(labels).toEqual([...labels].sort((left, right) => left.localeCompare(right)));
    await manager.auth.signOut();
  });

  test("delivery forms show only method-relevant fields and the backend enforces them", async ({ page }) => {
    const [sales, quality, supervisor, packing] = await Promise.all([
      openApiSession("Sales"),
      openApiSession("Stock & quality"),
      openApiSession("Supervisor"),
      openApiSession("Packing"),
    ]);
    for (const [client, action, payload] of [
      [sales, "SUBMIT_ORDER", {}],
      [quality, "CHECK_STOCK", {}],
      [supervisor, "APPROVE_ORDER", {}],
      [packing, "START_PICKING", {}],
      [packing, "COMPLETE_PICKING", {}],
      [quality, "RECORD_QC", { result: "PASSED", checklist: { pageCount: true, dimensions: true, binding: true, coverFinish: true, branding: true, pagesClean: true, damageFree: true } }],
      [packing, "COMPLETE_PACKING", { packageCount: 10, cartonCount: 10, quantityPerPackage: 20, packagingType: "QA cartons" }],
      [packing, "VERIFY_DOCUMENTS", { documents: [
        { documentType: "INVOICE", referenceNumber: "INV-DELIVERY-QA" },
        { documentType: "PACKING_LIST", referenceNumber: "PL-DELIVERY-QA" },
        { documentType: "DISPATCH_NOTE", referenceNumber: "DN-DELIVERY-QA" },
      ] }],
    ] as const) {
      const result = await callAction(client, action, DEMO_ORDER_ID, payload);
      expect(result.response.ok, result.response.message).toBe(true);
    }

    const invalidPickup = await callAction(packing, "CONFIRM_HANDOVER", DEMO_ORDER_ID, {
      deliveryMethod: "CUSTOMER_PICKUP",
      packageCount: 10,
      handoverPerson: "QA Packing",
    });
    expect(invalidPickup.response.ok).toBe(false);
    expect(invalidPickup.response.message).toContain("Pickup representative");
    const invalidVehicle = await callAction(packing, "CONFIRM_HANDOVER", DEMO_ORDER_ID, {
      deliveryMethod: "COMPANY_VEHICLE",
      packageCount: 10,
      handoverPerson: "QA Packing",
    });
    expect(invalidVehicle.response.ok).toBe(false);
    expect(invalidVehicle.response.message).toContain("Vehicle, driver, and destination");

    await openRole(page, "Packing");
    await page.goto(`/?view=orders&order=${DEMO_ORDER_ID}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Confirm handover" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirm handover" });
    await expect(dialog.getByLabel(/Courier \/ company/)).toBeVisible();
    await expect(dialog.getByLabel(/Tracking number/)).toBeVisible();
    await expect(dialog.getByLabel(/Customer representative/)).toHaveCount(0);
    await expect(dialog.getByLabel(/Vehicle number/)).toHaveCount(0);

    await dialog.getByLabel(/Delivery method/).selectOption("CUSTOMER_PICKUP");
    await expect(dialog.getByLabel(/Customer representative/)).toBeVisible();
    await expect(dialog.getByLabel(/Contact number/)).toBeVisible();
    await expect(dialog.getByLabel(/Pickup acknowledgement/)).toBeVisible();
    await expect(dialog.getByLabel(/Courier \/ company/)).toHaveCount(0);

    await dialog.getByLabel(/Delivery method/).selectOption("COMPANY_VEHICLE");
    await expect(dialog.getByLabel(/Vehicle number/)).toBeVisible();
    await expect(dialog.getByLabel(/Driver name/)).toBeVisible();
    await expect(dialog.getByLabel(/Destination/)).toBeVisible();
    await expect(dialog.getByLabel(/Tracking number/)).toHaveCount(0);
  });
});
