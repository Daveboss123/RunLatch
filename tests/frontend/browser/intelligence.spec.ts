import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { outcomeFixture } from "../helpers/outcomes";
import { commercialQuoteHash } from "../../../src/lib/purchasing/hashing";

const view = (page: Page) => page.locator("#run-intelligence");
async function importFile(page: Page, value: unknown) {
  await page.getByLabel("LOCAL outcome observation JSON files").setInputFiles({ name: "observation.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await expect(view(page).getByRole("status").first()).not.toContainText("Checking selected records");
}
test.beforeEach(async ({ page }) => { await page.goto("/intelligence"); });

test("empty read-only state, illustrative selection and source separation", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Paid is not the same as done." })).toBeVisible();
  await expect(view(page)).toContainText("No files selected"); await expect(page.getByTestId("cost-per-success")).toHaveCount(0);
  await page.getByLabel("Record source").selectOption("illustrative"); await page.getByRole("button", { name: "Load illustrative sample" }).click();
  await expect(page.getByTestId("cost-per-success")).toHaveText("100"); await expect(page.getByTestId("failed-run-cost")).toHaveText("50");
  await expect(view(page)).toContainText("Illustrative only — fabricated references"); await expect(view(page)).toContainText("3 selected runs");
  await page.getByRole("checkbox", { name: "illustrative-paid-failure", exact: true }).uncheck();
  await expect(page.getByTestId("cost-per-success")).toHaveText("50"); await expect(page.getByTestId("failed-run-cost")).toHaveText("0");
  await page.getByRole("checkbox", { name: "illustrative-passed", exact: true }).uncheck(); await expect(page.getByTestId("cost-per-success")).toHaveText("Unavailable");
  await page.getByLabel("Record source").selectOption("local"); await expect(page.getByTestId("cost-per-success")).toHaveCount(0);
});

test("costs respond to changed canonical records and failed checks, not hardcoded labels", async ({ page }) => {
  const raw = await outcomeFixture(); await importFile(page, raw);
  await expect(page.getByTestId("cost-per-success")).toHaveText("50");
  raw.quotes[0].terms = { ...raw.quotes[0].terms, input: { ...raw.quotes[0].terms.input, price: "75" } };
  raw.quotes[0].quote_hash = await commercialQuoteHash(raw.quotes[0].terms, "testnet", raw.contract_id);
  raw.snapshots[0].purchases[0].canonical_quote = raw.quotes[0].terms; raw.snapshots[0].purchases[0].proposal.expected_quote_hash = raw.quotes[0].quote_hash;
  raw.snapshots[0].capsule.spent = raw.attempts[0].transfer!.amount = "75";
  await importFile(page, raw); await expect(page.getByTestId("cost-per-success")).toHaveText("75");
  await expect(page.getByRole("region", { name: "Provider spend table" })).toContainText("75");
  await importFile(page, await outcomeFixture("SETTLED", "VALIDATION_FAILED"));
  await expect(page.getByTestId("cost-per-success")).toHaveText("Unavailable"); await expect(page.getByTestId("failed-run-cost")).toHaveText("50");
  await view(page).locator(".outcome-receipt > summary").click();
  await expect(view(page).locator(".outcome-receipt")).toContainText("validation failed"); await expect(view(page).locator(".outcome-receipt")).toContainText("settled");
});

test("missing callback, failed payment and no final report cannot become successful run cost", async ({ page }) => {
  const raw = await outcomeFixture(); raw.attempts[0].callback = null; await importFile(page, raw);
  await expect(view(page)).toContainText("SETTLEMENT_UNVERIFIED"); await expect(page.getByTestId("cost-per-success")).toHaveCount(0);
  await expect(view(page).locator(".outcome-receipt")).toContainText("settlement unverified");
  await importFile(page, await outcomeFixture("SETTLEMENT_FAILED", "VALIDATION_ERROR"));
  await expect(page.getByTestId("failed-run-cost")).toHaveText("0"); await expect(view(page).locator(".outcome-receipt")).toContainText("settlement failed");
  await importFile(page, await outcomeFixture("SETTLED", null)); await expect(view(page)).toContainText("UNATTESTED");
  await expect(page.getByTestId("cost-per-success")).toHaveCount(0);
});

test("time/owner selection removes underlying records and rejects invalid ranges", async ({ page }) => {
  await importFile(page, await outcomeFixture()); await page.getByLabel("From time (integer ns)").fill("24");
  await expect(view(page)).toContainText("0 selected runs"); await expect(view(page).locator(".outcome-receipt")).toHaveCount(0);
  await page.getByLabel("Through time (integer ns)").fill("1"); await expect(view(page).getByRole("alert")).toContainText("Cannot aggregate");
  await page.getByLabel("From time (integer ns)").fill(""); await page.getByLabel("Through time (integer ns)").fill("");
  await expect(page.getByTestId("cost-per-success")).toHaveText("50");
  await page.getByRole("checkbox", { name: "client-work", exact: true }).uncheck(); await expect(page.getByTestId("cost-per-success")).toHaveCount(0);
});

test("repeatable objective artifact check fails honestly and cannot overwrite canonical analytics", async ({ page }) => {
  await importFile(page, await outcomeFixture()); await page.getByText("Repeat the objective fixture checks locally", { exact: true }).click();
  const artifact = { fixture_version: 1, project_id: "client-work", resource_key: "booking-database", fixture_provider_id: "database-fixture", provisioning_status: "PROVISIONED",
    health_status: 200, https_fixture: true, route: "/health", health_body: "ok", observed_at_ns: "21" };
  const file = () => ({ name: "manifest.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(artifact)) });
  await page.getByLabel("Resource fixture JSON (16 KiB maximum)").setInputFiles(file());
  await expect(page.locator(".intelligence-check")).toContainText("validation passed · UNATTESTED");
  const original = await page.locator(".intelligence-check").textContent();
  await page.getByLabel("Resource fixture JSON (16 KiB maximum)").setInputFiles(file()); await expect(page.locator(".intelligence-check")).toHaveText(original!);
  artifact.health_body = "unavailable"; await page.getByLabel("Resource fixture JSON (16 KiB maximum)").setInputFiles(file());
  await expect(page.locator(".intelligence-check")).toContainText("validation failed · UNATTESTED");
  await expect(page.getByTestId("cost-per-success")).toHaveText("50");
  await page.getByLabel("Resource fixture JSON (16 KiB maximum)").setInputFiles({ name: "malformed.json", mimeType: "application/json", buffer: Buffer.from('{"unsafe":"<script>window.__bad=true</script>"}') });
  await expect(page.locator(".intelligence-check")).toContainText("VALIDATION_FAILED"); expect(await page.evaluate(() => Object.hasOwn(window, "__bad"))).toBe(false);
});

test("malformed/oversized/owner-substituted replacement discards stale results", async ({ page }) => {
  await importFile(page, await outcomeFixture());
  await page.getByLabel("LOCAL outcome observation JSON files").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{bad") });
  await expect(view(page).getByRole("alert")).toContainText("INVALID_CONTRACT_JSON"); await expect(page.getByTestId("cost-per-success")).toHaveCount(0);
  await page.getByLabel("LOCAL outcome observation JSON files").setInputFiles({ name: "large.json", mimeType: "application/json", buffer: Buffer.alloc(1048577) });
  await expect(view(page).getByRole("alert")).toContainText("OUTCOME_FILE_LIMIT");
  const substituted = await outcomeFixture(); substituted.snapshots[0].task_check!.attested_by = "intruder.sandbox"; await importFile(page, substituted);
  await expect(view(page).getByRole("alert")).toContainText("OUTCOME_OWNER_BINDING_MISMATCH");
});

test("late imports discarded after clear/replacement; memory-only no writes/network/signatures", async ({ page }) => {
  const writes: string[] = [], external: string[] = [], errors: string[] = [];
  page.on("request", r => { if (!["GET", "HEAD"].includes(r.method())) writes.push(r.method()); if (/^https?:/u.test(r.url()) && new URL(r.url()).origin !== new URL(page.url()).origin) external.push(r.url()); });
  page.on("pageerror", e => errors.push(e.message));
  await page.evaluate(() => {
    const original = File.prototype.text; let first = true;
    File.prototype.text = function () { if (!first) return original.call(this); first = false; const text = original.call(this);
      return new Promise<string>(resolve => { Object.assign(window, { finishIntelligenceRead: async () => resolve(await text) }); }); };
  });
  await page.getByLabel("LOCAL outcome observation JSON files").setInputFiles({ name: "first.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(await outcomeFixture())) });
  await expect(view(page).getByRole("status").first()).toContainText("Checking selected records");
  await page.getByRole("button", { name: "Clear intelligence view" }).click(); await importFile(page, await outcomeFixture("SETTLEMENT_FAILED", "VALIDATION_ERROR"));
  await page.evaluate(async () => { const finish = Reflect.get(window, "finishIntelligenceRead") as () => Promise<void>; await finish(); });
  await expect(page.getByTestId("failed-run-cost")).toHaveText("0");
  await expect(page.locator('a[href*="explorer"],a[href*="nearblocks"]')).toHaveCount(0);
  expect(writes).toEqual([]); expect(external).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`intelligence ${width}px ${theme}: keyboard, static dither fallback, no overflow, axe and capture`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: "reduce" });
    if (theme === "light") await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
    await importFile(page, await outcomeFixture());
    const summary = view(page).locator(".outcome-receipt > summary"); await summary.focus(); await page.keyboard.press("Enter");
    await expect(view(page).locator(".outcome-receipt")).toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]).analyze()).violations).toEqual([]);
    await page.addStyleTag({ content: ".provider-bar span { mask-image: none !important; -webkit-mask-image: none !important; }" });
    await expect(page.getByRole("region", { name: "Provider spend table" })).toContainText("50");
    await page.getByLabel("Record source").focus(); await page.evaluate(() => window.scrollTo(0, 0));
    await mkdir(".local/run-intelligence", { recursive: true }); await page.screenshot({ path: `.local/run-intelligence/synthetic-${width}-${theme}.png`, fullPage: true });
  });
}

test("no-JS has visible CLI fallback and no signing/payment action", async ({ browser }, info) => {
  const context = await browser.newContext({ javaScriptEnabled: false }), page = await context.newPage();
  await page.goto(new URL("/intelligence", info.project.use.baseURL).href); await expect(page.locator("noscript p")).toBeVisible();
  await expect(page.locator("noscript p")).toContainText("analyze:local"); await expect(page.locator(".intelligence-results")).toHaveCount(0); await context.close();
});

test("actual three LOCAL agency bundles aggregate and owner selection changes cost", async ({ page }) => {
  let m: { runs: { project_id: string; settled_spend: string }[] };
  try { m = JSON.parse(await readFile(".local/projects/latest.json", "utf8")); } catch { test.skip(true, "Actual LOCAL artifacts absent from this checkout"); return; }
  const started = Date.now();
  await page.getByLabel("LOCAL outcome observation JSON files").setInputFiles(m.runs.map(r => `.local/projects/${r.project_id}/observation.json`));
  const total = m.runs.reduce((sum, r) => sum + BigInt(r.settled_spend), 0n).toString();
  await expect(page.getByTestId("cost-per-success")).toHaveText(total); await expect(view(page)).toContainText("3 selected runs");
  const importMs = Date.now() - started;
  await expect(view(page).locator(".outcome-receipt")).toHaveCount(9);
  await page.getByRole("checkbox", { name: m.runs[1].project_id, exact: true }).uncheck();
  await expect(page.getByTestId("cost-per-success")).toHaveText((BigInt(total) - BigInt(m.runs[1].settled_spend)).toString());
  await page.getByRole("checkbox", { name: m.runs[1].project_id, exact: true }).check();
  await mkdir(".local/run-intelligence", { recursive: true });
  await writeFile(".local/run-intelligence/actual-browser-readback.json", JSON.stringify({ source: "ACTUAL_LOCAL_BUNDLES_BROWSER_READBACK_NOT_CHAIN_VERIFICATION",
    import_ms: importMs, selected_runs: m.runs.length, receipts: await view(page).locator(".outcome-receipt").count(), cost_per_success: await page.getByTestId("cost-per-success").innerText(),
    failed_run_cost: await page.getByTestId("failed-run-cost").innerText(), sample_and_range: await page.locator(".intelligence-sample").innerText(), independently_verified: false }, null, 2));
  for (const width of [1440, 390]) for (const theme of ["dark", "light"]) {
    await page.setViewportSize({ width, height: 900 });
    if ((theme === "dark") !== await page.locator("html").evaluate(e => e.classList.contains("dark"))) await page.getByRole("button", { name: `Switch to ${theme} theme`, exact: true }).click();
    await page.getByLabel("Record source").focus(); await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.local/run-intelligence/actual-${width}-${theme}.png`, fullPage: true });
    const receipt = view(page).locator(".outcome-receipt").filter({ hasText: m.runs[0].project_id }).filter({ has: page.getByText("database", { exact: true }) }).first();
    await receipt.locator("summary").click(); await expect(receipt).toContainText("Recorded objective validation");
    await receipt.screenshot({ path: `.local/run-intelligence/actual-receipt-${width}-${theme}.png` });
    await receipt.locator("summary").click();
  }
});
