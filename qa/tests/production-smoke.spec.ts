import { expect, test } from "@playwright/test";
import { observePage, openRole, type RoleLabel } from "./helpers/agra";

const roleNavigation: Array<[RoleLabel, string[], string[]]> = [
  ["Sales", ["Home", "Orders", "Customers", "Products"], ["Stock", "Quality", "Pack & send", "Issues", "Reports", "Team", "System"]],
  ["Stock & quality", ["Home", "Stock", "Quality", "Orders", "Products"], ["Customers", "Pack & send", "Issues", "Reports", "Team", "System"]],
  ["Packing", ["Home", "Pack & send", "Orders", "Stock"], ["Customers", "Products", "Quality", "Issues", "Reports", "Team", "System"]],
  ["Supervisor", ["Home", "Orders", "Issues", "Reports"], ["Customers", "Products", "Stock", "Quality", "Pack & send", "Team", "System"]],
  ["Manager", ["Home", "Orders", "Stock", "Quality", "Pack & send", "Issues", "Reports", "Team", "System"], ["Customers", "Products"]],
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
  await page.getByPlaceholder("Search orders").fill("KEG-PO-200");
  await expect(page.getByRole("button", { name: /AGRA-DEMO-001/ })).toBeVisible();
});
