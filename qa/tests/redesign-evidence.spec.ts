import { test } from "@playwright/test";
import { openRole, type RoleLabel } from "./helpers/agra";

const evidence: Array<[RoleLabel, string]> = [
  ["Sales", "sales-home.png"],
  ["Stock & quality", "inventory-quality-home.png"],
  ["Packing", "packing-dispatch-home.png"],
  ["Supervisor", "supervisor-home.png"],
  ["Manager", "manager-home.png"],
];

for (const [role, file] of evidence) {
  test(`${role} redesign evidence`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openRole(page, role);
    await page.screenshot({
      path: `docs/evidence/after/${file}`,
      fullPage: true,
    });
  });
}
