import { expect, test } from "@playwright/test";
import { observePage, openRole, type RoleLabel } from "./helpers/agra";

const roleNavigation: Array<[RoleLabel, string[], string[]]> = [
  ["Sales", ["My Work", "Orders", "Customers", "Products"], ["Inventory", "Quality", "Packing & Dispatch", "Exceptions", "Reports", "Administration"]],
  ["Stock & quality", ["My Work", "Products", "Inventory", "Quality", "Orders"], ["Customers", "Packing & Dispatch", "Exceptions", "Reports", "Administration"]],
  ["Packing", ["My Work", "Packing & Dispatch", "Orders", "Inventory"], ["Customers", "Products", "Quality", "Exceptions", "Reports", "Administration"]],
  ["Supervisor", ["My Work", "Orders", "Exceptions"], ["Customers", "Products", "Inventory", "Quality", "Packing & Dispatch", "Reports", "Administration"]],
  ["Manager", ["My Work", "Orders", "Products", "Inventory", "Reports", "Administration"], ["Customers", "Quality", "Packing & Dispatch", "Exceptions"]],
];

for (const [role, permitted, prohibited] of roleNavigation) {
  test(`${role} receives only its role navigation`, async ({ page }) => {
    const evidence = observePage(page);
    await openRole(page, role);
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    for (const item of permitted) {
      await expect(navigation.getByRole("button", { name: new RegExp(`^${item}(?:\\s+\\d+)?$`) })).toBeVisible();
    }
    for (const item of prohibited) {
      await expect(navigation.getByRole("button", { name: new RegExp(`^${item}(?:\\s+\\d+)?$`) })).toHaveCount(0);
    }
    expect(evidence.consoleErrors).toEqual([]);
    expect(evidence.failedRequests).toEqual([]);
  });
}

test("manager signs out without exposing credential fields", async ({ page }) => {
  await openRole(page, "Manager");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Choose your role" })).toBeVisible();
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
});

for (const viewport of [
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} layout has no page overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openRole(page, "Sales");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    if (viewport.width < 1024) {
      await page.getByRole("button", { name: "Open menu" }).click();
    }
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  });
}

test("order search includes customer order reference", async ({ page }) => {
  await openRole(page, "Sales");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Orders" }).click();
  await page.getByPlaceholder(/Search order, customer/).fill("KEG-PO-200");
  await expect(page.getByRole("button", { name: /AGRA-DEMO-001/ })).toBeVisible();
});
