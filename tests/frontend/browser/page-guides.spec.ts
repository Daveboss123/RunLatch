import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  ["/demo", "Inspect one project"], ["/gate", "Challenge one purchase"], ["/intelligence", "Read cost and outcome together"],
  ["/docs", "Understand the operating model"], ["/testnet", "Review, sign and verify one action"],
] as const;

for (const [route, heading] of pages) test(`${route} explains how to use the existing section without renaming it`, async ({ page }) => {
  await page.goto(route); const guide = page.locator(".page-guide");
  await expect(guide.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expect(guide.locator("ol > li")).toHaveCount(3); await expect(guide).toContainText("You leave with");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect((await new AxeBuilder({ page }).include(".page-guide").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
});
