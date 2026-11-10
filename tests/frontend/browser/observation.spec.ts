import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { observationFixture } from "../helpers/observation";

const inspector = (page: Page) => page.locator("#contract-observation");
async function importFile(page: Page, value: unknown) {
  await page.getByLabel("LOCAL observation JSON").setInputFiles({ name: "observation.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
}
test.beforeEach(async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Inspect the local contract run." })).toBeVisible();
});

test("LOCAL inspector stays read-only and routes public actions to the owner workspace", async ({ page }) => {
  await expect(inspector(page).getByRole("status")).toContainText("No contract records imported");
  await expect(inspector(page).getByRole("button", { name: "Clear imported view", exact: true })).toBeDisabled();
  await expect(inspector(page).getByRole("link", { name: "Open owner workspace", exact: true })).toHaveAttribute("href", "/testnet");
  await expect(inspector(page).locator(".network-progress")).toContainText("GateDeployedProjectActiveProviderRegistered");
  for (const label of ["Connect testnet owner wallet", "Sign owner approval", "Submit agent purchase"]) await expect(inspector(page).getByRole("button", { name: label, exact: true })).toHaveCount(0);
  expect(await inspector(page).locator('a[href*="explorer"], a[href*="nearblocks"]').count()).toBe(0);
});

test("canonical quote, unsigned agent envelope and clear remain memory-only", async ({ page }) => {
  const writes: string[] = [], external: string[] = [], errors: string[] = [];
  page.on("request", request => {
    if (!["GET", "HEAD"].includes(request.method())) writes.push(request.method());
    if (/^https?:/u.test(request.url()) && new URL(request.url()).origin !== new URL(page.url()).origin) external.push(request.url());
  });
  page.on("pageerror", error => errors.push(error.message));
  await importFile(page, await observationFixture());
  await expect(inspector(page).getByRole("status").filter({ hasText: "LOCAL records imported" })).toBeVisible();
  await inspector(page).getByText("Registered providers and canonical quotes (2 providers, 1 quotes)", { exact: true }).click();
  await expect(inspector(page)).toContainText("Controlled LOCAL demo provider adapter");
  await inspector(page).getByText("database-quote — consumed", { exact: true }).click();
  await expect(inspector(page).getByLabel("Canonical terms database-quote")).toContainText('"recipient_id": "publisher.sandbox"');
  await inspector(page).getByText("Inspect an IDs-only agent draft", { exact: true }).click();
  await inspector(page).getByRole("button", { name: "Prepare unsigned agent draft" }).click();
  await expect(page.locator("#observation-draft-error")).toBeFocused();
  await page.getByLabel("New request ID", { exact: true }).fill("new-request");
  await inspector(page).getByRole("button", { name: "Prepare unsigned agent draft" }).click();
  const draft = JSON.parse(await page.getByLabel("Unsigned agent proposal").innerText());
  expect(Object.keys(draft).sort()).toEqual(["capsule_id", "expected_quote_hash", "project_id", "project_revision", "quote_id", "request_id"]);
  expect(draft.quote_id).toBe("database-quote"); expect(draft.request_id).toBe("new-request");
  await page.getByLabel("New request ID", { exact: true }).fill("database");
  await inspector(page).getByRole("button", { name: "Prepare unsigned agent draft" }).click();
  await expect(page.getByLabel("Unsigned agent proposal")).toHaveCount(0);
  await inspector(page).getByRole("button", { name: "Clear imported view" }).click();
  await expect(inspector(page).getByRole("status")).toContainText("Contract funds and authority are unchanged");
  await expect(inspector(page).locator(".observation-records")).toHaveCount(0);
  await expect(page.locator(".run-board")).toContainText("Demo data");
  expect(writes).toEqual([]); expect(external).toEqual([]); expect(errors).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test("tampered recipient, expired quote, replay, overspend and revoked authority fail closed", async ({ page }) => {
  const tamper = await observationFixture(); tamper.attempts[0].transfer!.receiver = "intruder.sandbox";
  await importFile(page, tamper); await expect(inspector(page).getByRole("alert")).toContainText("TRANSFER_CANONICAL_BINDING_MISMATCH");
  await expect(inspector(page).locator(".observation-records")).toHaveCount(0);
  const over = await observationFixture(); over.snapshots[0].capsule.spent = "301";
  await importFile(page, over); await expect(inspector(page).getByRole("alert")).toContainText("INVALID_BUDGET_STATE");
  for (const state of ["expired", "revoked"]) {
    const pending = await observationFixture("APPROVAL_PENDING");
    if (state === "expired") pending.observed_at_ns = "1000"; else pending.snapshots[0].capsule.status = "REVOKED";
    await importFile(page, pending);
    await inspector(page).locator(".observation-purchases summary").click();
    await inspector(page).getByRole("button", { name: "Inspect exact owner approval" }).click();
    await expect(inspector(page).getByRole("alert")).toContainText("not reviewable");
    await expect(inspector(page).getByRole("button", { name: "Sign owner approval" })).toHaveCount(0);
    await expect(inspector(page).locator(".observation-balances")).toContainText("Reserved now0");
  }
  const replay = await observationFixture(); replay.attempts.push({ ...replay.attempts[0], transaction_id: "6".repeat(32), initial: { receipt_id: "7".repeat(32), succeeded: true }, transfer: null, callback: null,
    response: { ...replay.attempts[0].response, decision: "DENIED", reason_codes: ["REQUEST_REPLAY"], source: "CONTRACT_REJECTED_ATTEMPT" } });
  await importFile(page, replay);
  await expect(inspector(page).locator(".observation-purchases > li")).toHaveCount(1);
  await expect(inspector(page).locator(".observation-purchases")).toContainText("settled");
  await inspector(page).getByText("Execution attempts and receipt evidence (2)", { exact: true }).click();
  await expect(inspector(page).locator(".observation-attempts")).toContainText("REQUEST_REPLAY");
});

test("exact owner review shows bound hash without approving or signing", async ({ page }) => {
  const value = await observationFixture("APPROVAL_PENDING"); await importFile(page, value);
  await inspector(page).locator(".observation-purchases summary").click();
  await inspector(page).getByRole("button", { name: "Inspect exact owner approval" }).click();
  const review = JSON.parse(await page.getByLabel("Exact unsigned owner approval").innerText());
  expect(review.args.expected_request_hash).toBe(value.snapshots[0].purchases[0].request_hash); expect(review.signing_enabled).toBe(false); expect(review.deposit_yocto).toBe("1");
  await expect(inspector(page).getByRole("status").filter({ hasText: "not approved or signed" })).toBeVisible();
  await expect(inspector(page).getByRole("button", { name: "Sign owner approval" })).toHaveCount(0);
});

test("failure and missing callback remain separate from provisioning and owner outcome", async ({ page }) => {
  await importFile(page, await observationFixture("SETTLEMENT_FAILED"));
  await inspector(page).locator(".observation-purchases summary").click();
  await expect(inspector(page).locator(".observation-purchases")).toContainText("settlement failed");
  await expect(inspector(page).locator(".observation-balances")).toContainText("Spent0");
  const unverified = await observationFixture(); unverified.attempts[0].callback = null;
  await importFile(page, unverified); await inspector(page).locator(".observation-purchases summary").click();
  await expect(inspector(page).locator(".observation-purchases")).toContainText("settlement unverified");
  await expect(inspector(page).locator(".observation-purchases")).toContainText("No resend or release is enabled");
  await expect(inspector(page).locator(".observation-purchases")).toContainText("not evidenced");
  await expect(inspector(page).locator(".observation-purchases")).toContainText("Not real client acceptance");
});

test("malformed/oversized imports clear stale records and never render untrusted markup", async ({ page }) => {
  await importFile(page, await observationFixture());
  await page.getByLabel("LOCAL observation JSON").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"x":"<script>window.__bad=true</script>"') });
  await expect(inspector(page).getByRole("alert")).toContainText("INVALID_CONTRACT_JSON");
  await expect(inspector(page).locator(".observation-records")).toHaveCount(0);
  await page.getByLabel("LOCAL observation JSON").setInputFiles({ name: "large.json", mimeType: "application/json", buffer: Buffer.alloc(1_048_577, 32) });
  await expect(inspector(page).getByRole("alert")).toContainText("CONTRACT_INPUT_LIMIT");
  expect(await page.evaluate(() => Object.hasOwn(window, "__bad"))).toBe(false);
});

test("clear during reading discards late results; newest import wins", async ({ page }) => {
  // Delay only the first controlled File.text, then resolve it explicitly. No timers.
  await page.evaluate(() => {
    const original = File.prototype.text; let first = true;
    File.prototype.text = function () {
      if (!first) return original.call(this); first = false;
      const text = original.call(this);
      return new Promise<string>(resolve => { Object.assign(window, { finishObservationRead: async () => resolve(await text) }); });
    };
  });
  await importFile(page, await observationFixture("SETTLED"));
  await expect(inspector(page).getByRole("status")).toContainText("Checking local file");
  await inspector(page).getByRole("button", { name: "Clear imported view" }).click();
  await importFile(page, await observationFixture("SETTLEMENT_FAILED"));
  await expect(inspector(page).locator(".observation-purchases")).toContainText("settlement failed");
  await page.evaluate(async () => { const finish = Reflect.get(window, "finishObservationRead") as () => Promise<void>; await finish(); });
  await expect(inspector(page).locator(".observation-purchases")).toContainText("settlement failed");
  await expect(inspector(page).locator(".observation-purchases")).not.toContainText("settled");
});

for (const width of [320, 390, 768, 1440]) for (const theme of ["dark", "light"]) {
  test(`observation ${width}px ${theme}: expanded record, keyboard, no overflow and axe`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    if (theme === "light") await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
    const value = await observationFixture(); value.snapshots[0].capsule.status = "REVOKED";
    await importFile(page, value);
    await inspector(page).locator(".observation-purchases summary").focus(); await page.keyboard.press("Enter");
    await expect(inspector(page).locator(".observation-purchases details")).toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("#contract-observation").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]).analyze()).violations).toEqual([]);
  });
}

test("no-JS has a visible CLI fallback and routes operational work away from the LOCAL inspector", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  await page.goto(new URL("/demo", testInfo.project.use.baseURL).href);
  // Text-engine selectors intentionally skip NOSCRIPT. Verify the actual visible DOM instead.
  await expect(page.locator("noscript p")).toBeVisible();
  await expect(page.locator("noscript p")).toContainText("JavaScript is required for local file inspection.");
  await expect(inspector(page).getByRole("button", { name: "Sign owner approval" })).toHaveCount(0);
  await expect(inspector(page).getByRole("link", { name: "Open owner workspace" })).toBeVisible(); await context.close();
});

test("reimporting the same project/block invalidates prior unsigned drafts and owner review", async ({ page }) => {
  const value = await observationFixture("APPROVAL_PENDING"); await importFile(page, value);
  await inspector(page).locator(".observation-purchases summary").click();
  await inspector(page).getByRole("button", { name: "Inspect exact owner approval" }).click();
  await expect(page.getByLabel("Exact unsigned owner approval")).toBeVisible();
  await inspector(page).getByText("Inspect an IDs-only agent draft", { exact: true }).click();
  await page.getByLabel("New request ID", { exact: true }).fill("new-request");
  await inspector(page).getByRole("button", { name: "Prepare unsigned agent draft" }).click();
  await expect(page.getByLabel("Unsigned agent proposal")).toBeVisible();
  await importFile(page, value);
  await expect(inspector(page).getByRole("status").filter({ hasText: "LOCAL records imported" })).toBeVisible();
  await expect(page.getByLabel("Unsigned agent proposal")).toHaveCount(0); await expect(page.getByLabel("Exact unsigned owner approval")).toHaveCount(0);
});

test("actual generated LOCAL agency bundles: settled success, paid failure and failed payment", async ({ page }) => {
  // Explicit development read only. This case is skipped in checkouts without local execution artifacts.
  let latest: { runs: { project_id: string; settled_spend: string; payment_status: string }[] };
  try { latest = JSON.parse(await readFile(".local/projects/latest.json", "utf8")); } catch { test.skip(true, "No actual LOCAL agency artifacts in this checkout"); return; }
  const metrics: { project_id: string; import_ms: number }[] = [];
  for (const run of latest.runs) {
    const started = Date.now();
    await page.getByLabel("LOCAL observation JSON").setInputFiles(`.local/projects/${run.project_id}/observation.json`);
    await expect(inspector(page).getByRole("status").filter({ hasText: "LOCAL records imported" })).toBeVisible();
    metrics.push({ project_id: run.project_id, import_ms: Date.now() - started });
    await expect(inspector(page).locator(".observation-fields").first()).toContainText(run.project_id);
    await expect(inspector(page).locator(".observation-balances")).toContainText(`Spent${run.settled_spend}`);
    await expect(inspector(page).locator(".observation-purchases")).toContainText(run.payment_status.toLowerCase().replaceAll("_", " "));
    await expect(inspector(page).getByText(/Registered providers and canonical quotes \(3 providers/u)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await mkdir(".local/contract-observation", { recursive: true });
  await writeFile(".local/contract-observation/browser-import-metrics.json", JSON.stringify({ source: "ACTUAL_LOCAL_BUNDLE_BROWSER_IMPORT", independently_verified: false, metrics }, null, 2));
  const first = latest.runs[0];
  await page.getByLabel("LOCAL observation JSON").setInputFiles(`.local/projects/${first.project_id}/observation.json`);
  await expect(inspector(page).getByRole("status").filter({ hasText: "LOCAL records imported" })).toBeVisible();
  for (const width of [1440, 390]) for (const theme of ["dark", "light"]) {
    await page.setViewportSize({ width, height: 900 });
    const isDark = await page.locator("html").evaluate(node => node.classList.contains("dark"));
    if ((theme === "dark") !== isDark) await page.getByRole("button", { name: `Switch to ${theme} theme`, exact: true }).click();
    await inspector(page).screenshot({ path: `.local/contract-observation/actual-${width}-${theme}.png` });
  }
});
