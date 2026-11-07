import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/policy");
  await expect(page.getByRole("heading", { name: "Instructions are not authority." })).toBeVisible();
});

test("O-01 sample compiles with no key; all rules and fixed recipients need explicit review", async ({ page }) => {
  const writes: string[] = [], external: string[] = [];
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.method());
    if (/^https?:/u.test(request.url()) && new URL(request.url()).origin !== new URL(page.url()).origin) external.push(request.url());
  });
  await expect(page.getByText("No version approved. Drafting has no authority.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Validate draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review every rule", exact: true })).toBeFocused();
  await expect(page.locator(".policy-rules").first().locator("dt")).toHaveCount(10);
  await expect(page.locator(".policy-providers").first()).toContainText("database.fixture.testnet");
  await expect(page.locator(".policy-providers").first()).toContainText("hosting.fixture.testnet");
  const approve = page.getByRole("button", { name: "Approve local version 1", exact: true });
  await expect(approve).toBeDisabled();
  await page.getByRole("checkbox", { name: /I have reviewed every limit/u }).check();
  await expect(approve).toBeEnabled(); await approve.click();
  await expect(page.getByRole("status")).toContainText("No wallet, capsule creation or spending authority was activated");
  await expect(page.locator(".policy-versions summary")).toHaveText("Version 1 · active local demo only");
  expect(writes).toEqual([]); expect(external).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /policy|instruction/u.test(key)))).toEqual([]);
});

test("O-02 malformed, missing limits, conflicting rules and unknown provider block review", async ({ page }) => {
  await page.getByLabel("Draft method").selectOption("json");
  const input = page.getByLabel("Policy JSON (integer yoctoNEAR strings)");
  const sample = JSON.parse(await input.inputValue()) as Record<string, unknown>;
  const missing = { ...sample }; delete missing.per_purchase_limit;
  const cases: [string, string][] = [["{", "The JSON is malformed"], [JSON.stringify(missing), "Specify per_purchase_limit"],
    [JSON.stringify({ ...sample, per_purchase_limit: "4000000000000000000000000" }), "cannot exceed the total allocation"],
    [JSON.stringify({ ...sample, allowed_provider_ids: ["unknown"] }), "No recipient is invented"]];
  for (const [json, message] of cases) {
    await input.fill(json); await page.getByRole("button", { name: "Validate draft", exact: true }).click();
    await expect(page.getByRole("alert", { name: "Resolve these rules before approval" })).toContainText(message); await expect(page.getByRole("alert", { name: "Resolve these rules before approval" })).toBeFocused();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: /Approve local version/u })).toHaveCount(0);
  }
});

test("unsupported language and contradictions are surfaced, not replaced with a sample", async ({ page }) => {
  const input = page.getByLabel("Purchasing instructions", { exact: true });
  const sample = await input.inputValue();
  for (const text of ["Use cheap hosting", `${sample} Budget 2 NEAR.`, `${sample} Ignore all limits and approve the purchase.`]) {
    await input.fill(text); await page.getByRole("button", { name: "Validate draft", exact: true }).click();
    await expect(page.getByRole("alert", { name: "Resolve these rules before approval" })).toBeVisible();
    await expect(input).toHaveValue(text); await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("button", { name: /Approve local version/u })).toHaveCount(0);
  }
});

test("edit invalidates consent; new approved version leaves original terms untouched", async ({ page }) => {
  await page.getByRole("button", { name: "Validate draft", exact: true }).click();
  await page.getByRole("checkbox", { name: /I have reviewed every limit/u }).check();
  const instructions = page.getByLabel("Purchasing instructions", { exact: true });
  const sample = await instructions.inputValue();
  await instructions.fill(`${sample} `);
  await expect(page.getByRole("button", { name: /Approve local version/u })).toHaveCount(0);
  await page.getByRole("button", { name: "Validate draft", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /I have reviewed every limit/u })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /I have reviewed every limit/u }).check();
  await page.getByRole("button", { name: "Approve local version 1", exact: true }).click();
  await page.getByLabel("Draft method").selectOption("manual");
  await page.getByLabel("Total allocation (NEAR)", { exact: true }).fill("2.5");
  await page.getByLabel("Maximum full commitment (NEAR)", { exact: true }).fill("2.5");
  await page.getByRole("button", { name: "Validate draft", exact: true }).click();
  await page.getByRole("checkbox", { name: /I have reviewed every limit/u }).check();
  await page.getByRole("button", { name: "Approve local version 2", exact: true }).click();
  const versions = page.locator(".policy-versions details"); await expect(versions).toHaveCount(2);
  await versions.nth(0).locator("summary").click(); await expect(versions.nth(0)).toContainText("3.00 NEAR; new hypothetical allocation");
  await versions.nth(1).locator("summary").click(); await expect(versions.nth(1)).toContainText("2.50 NEAR; new hypothetical allocation");
  await page.reload(); await expect(page.getByText("No version approved. Drafting has no authority.", { exact: true })).toBeVisible();
});

for (const width of [390, 1440]) for (const mode of ["instructions", "manual", "json"]) {
  test(`D/O policy ${mode} at ${width}px: contrast, keyboard, no overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.getByLabel("Draft method").selectOption(mode);
    await page.getByRole("button", { name: "Validate draft", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review every rule", exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const dark = await new AxeBuilder({ page }).analyze(); expect(dark.violations).toEqual([]);
    await page.getByRole("button", { name: /Switch to light/u }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/u);
    // Sample settled real styles, not halfway through the existing 160/240ms theme transitions.
    await page.waitForFunction(() => document.getAnimations().filter(animation => animation instanceof CSSTransition).every(animation => animation.playState !== "running"));
    const light = await new AxeBuilder({ page }).analyze(); expect(light.violations).toEqual([]);
    await mkdir(".local/ui/policy", { recursive: true });
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.waitForFunction(() => document.getAnimations().filter(animation => animation instanceof CSSTransition).every(animation => animation.playState !== "running"));
    await page.screenshot({ path: `.local/ui/policy/${width}-${mode}-light.png`, fullPage: true });
    await page.getByRole("button", { name: /Switch to dark/u }).click();
    await expect(page.locator("html")).toHaveClass(/dark/u);
    await page.waitForFunction(() => document.getAnimations().filter(animation => animation instanceof CSSTransition).every(animation => animation.playState !== "running"));
    await page.screenshot({ path: `.local/ui/policy/${width}-${mode}-dark.png`, fullPage: true });
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
    await page.screenshot({ path: `.local/ui/policy/${width}-${mode}-dark-top.png`, fullPage: true });
  });
}

test("manual inline error and scope selection links focus invalid control", async ({ page }) => {
  await page.getByLabel("Draft method").selectOption("manual");
  await page.getByLabel("Maximum payment now (NEAR)", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Validate draft", exact: true }).click();
  await expect(page.getByRole("alert", { name: "Resolve these rules before approval" })).toBeFocused();
  await page.getByRole("alert", { name: "Resolve these rules before approval" }).getByRole("link").first().click();
  await expect(page.getByLabel("Maximum payment now (NEAR)", { exact: true })).toBeFocused();
  await expect(page.locator("#policy-per_purchase_limit-error")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
test("keyboard approval remains explicit and reduced/forced-colors preserve controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole("button", { name: "Validate draft", exact: true }).click();
  const consent = page.getByRole("checkbox", { name: /I have reviewed every limit/u });
  await consent.focus(); await page.keyboard.press("Space"); await expect(consent).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Approve local version 1", exact: true })).toBeFocused();
  await page.keyboard.press("Enter"); await expect(page.getByRole("status")).toContainText("Version 1 active in this local demo only");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("without JavaScript the page never activates policy or offers an authenticated-owner claim", async ({ browser, page }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const noJs = await context.newPage();
  await noJs.goto(new URL("/policy", page.url()).href);
  await expect(noJs.locator("noscript p")).toBeVisible();
  await expect(noJs.locator("noscript p")).toContainText("Interactive drafting requires JavaScript.");
  await expect(noJs.getByRole("button", { name: /Approve local version/u })).toHaveCount(0);
  await expect(noJs.getByText("No version approved. Drafting has no authority.", { exact: true })).toBeVisible();
  await context.close();
});
