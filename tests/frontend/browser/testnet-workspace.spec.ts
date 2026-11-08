/** Intercepted synthetic RPC responses only. Browser fetch is exercised; no public chain or signing. */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import { setupFixture, setupTransport } from "../helpers/setup-review";
import { evidenceFixture, evidenceTransport, target } from "../helpers/testnet-evidence";
import { ownerFixture, ownerTransport } from "../helpers/owner-review";

const view = (page: Page) => page.locator(".testnet-workspace");
async function intercept(page: Page, transport: typeof fetch) {
  const methods: string[] = [];
  await page.route(target.rpc_url, async route => {
    const request = route.request(), headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    methods.push(request.postDataJSON().method);
    expect(request.method()).toBe("POST"); expect(request.headers()["cookie"]).toBeUndefined(); expect(request.headers()["referer"]).toBeUndefined();
    const response = await transport(request.url(), { method: "POST", body: request.postData() });
    await route.fulfill({ status: response.status, headers: { ...headers, "content-type": "application/json" }, body: await response.text() });
  });
  return methods;
}
async function targetFields(page: Page) {
  await page.getByLabel("Contract account", { exact: true }).fill(target.contract_id);
  await page.getByLabel("Operator account", { exact: true }).fill(target.operator_id);
  await page.getByLabel("Expected deployed code hash", { exact: true }).fill(target.expected_code_hash);
  await page.getByRole("checkbox", { name: "I permit read-only RPC requests" }).check();
}
async function setupFields(page: Page) {
  const f = setupFixture(); await targetFields(page);
  await page.getByLabel("Signer account", { exact: true }).fill(target.operator_id);
  await page.getByLabel("Human wallet public key", { exact: true }).fill(f.actions.project.public_key);
  await page.getByLabel("Exact gas limit (gas units)", { exact: true }).fill(f.actions.project.gas);
  await page.getByLabel("Exact arguments JSON", { exact: true }).fill(JSON.stringify({ project: { ...f.project.input, project_id: "new-project" } }));
}
test.beforeEach(async ({ page }) => { await page.goto("/testnet"); });

test("no auto-read/wallet/storage; missing scope and invalid identity cannot send; error receives focus", async ({ page }) => {
  const methods = await intercept(page, async () => { throw Error("NETWORK_MUST_NOT_RUN"); });
  await expect(page.getByRole("button", { name: "Read and prepare unsigned review" })).toBeDisabled();
  await expect(view(page)).toContainText("No wallet is connected");
  await page.getByRole("checkbox", { name: "I permit read-only RPC requests" }).check();
  await page.getByRole("button", { name: "Read and prepare unsigned review" }).click();
  await expect(view(page).getByRole("alert")).toContainText("INVALID_CONTRACT_ACCOUNT");
  await expect(view(page).getByRole("alert")).toBeFocused(); expect(methods).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, search: location.search }))).toEqual({ local: 0, session: 0, search: "" });
});

test("exact derived funding/key/call review, explicit unsigned export and edit invalidation", async ({ page }) => {
  const rpc = setupTransport(setupFixture()), methods = await intercept(page, rpc.transport); await setupFields(page);
  await page.getByRole("button", { name: "Read and prepare unsigned review" }).click();
  await expect(page.getByRole("heading", { name: "Exact human-action review" })).toBeVisible();
  await expect(page.locator(".testnet-review")).toContainText("8192"); await expect(page.locator(".testnet-review")).toContainText(target.contract_id);
  await expect(page.locator(".testnet-review")).toContainText("create_project"); expect(methods.every(m => ["status", "block", "query"].includes(m))).toBe(true);
  await expect(page.getByRole("button", { name: "Export unsigned review" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "I permit export of this full unsigned review" }).check();
  const downloadPromise = page.waitForEvent("download"); await page.getByRole("button", { name: "Export unsigned review" }).click();
  const download = await downloadPromise, file = await download.path(); expect(file).not.toBeNull();
  const out = JSON.parse(await readFile(file!, "utf8")); expect(out.signing_enabled).toBe(false); expect(out.grants_payment_authority).toBe(false);
  expect(out.review.call.attached_deposit).toBe("8192"); expect(out.review.call.signer_id).toBe(target.operator_id);
  await page.getByLabel("Exact gas limit (gas units)").fill("1"); await expect(page.getByRole("heading", { name: "Exact human-action review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear workspace" }).click(); await expect(page.getByLabel("Contract account", { exact: true })).toHaveValue("");
  await expect(view(page)).toContainText("No reservation released");
});

test("captured receipt uses shared observer once; missing callback remains unverified, never paid-and-done", async ({ page }) => {
  const f = await evidenceFixture(); f.raw.receipts_outcome = f.raw.receipts_outcome.slice(0, -1);
  const methods = await intercept(page, evidenceTransport(f).transport); await targetFields(page);
  await page.getByLabel("Workspace task").selectOption("receipt");
  await page.getByLabel("Exact observation intent JSON").fill(JSON.stringify(f.intent));
  await page.getByRole("button", { name: "Inspect captured purchase once" }).click();
  await expect(page.getByRole("heading", { name: "Observed purchase evidence" })).toBeVisible();
  await expect(page.locator(".testnet-review")).toContainText("SETTLEMENT_UNVERIFIED");
  expect(methods.filter(m => m === "tx_status")).toHaveLength(1); expect(methods).not.toContain("broadcast_tx_async");
  await expect(page.locator(".testnet-review")).toContainText("no release or resend");
});

test("selected report visibility starts off, changing disclosure invalidates and requires another explicit read", async ({ page }) => {
  const f = await ownerFixture(); await intercept(page, ownerTransport(f).transport); await targetFields(page);
  await page.getByLabel("Workspace task").selectOption("report");
  await page.getByLabel("Project ID", { exact: true }).fill("client-work");
  await page.getByLabel("Capsule IDs (comma-separated, at most 4)").fill("work");
  for (const name of ["Show budget", "Show expenses", "Show evidence"]) await expect(page.getByRole("checkbox", { name, exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "Read selected project report" }).click();
  const result = page.getByLabel("Owner-selected project report"); await expect(result).toBeVisible();
  expect(JSON.parse((await result.textContent())!).financials).toBeNull();
  await page.getByRole("checkbox", { name: "Show budget", exact: true }).check(); await expect(result).toHaveCount(0);
  await page.getByRole("button", { name: "Read selected project report" }).click(); await expect(result).toBeVisible();
  const report = JSON.parse((await result.textContent())!); expect(report.financials.spent).toBe("50"); expect(report.financials.available_to_commit).toBe("250");
  await expect(page.locator(".testnet-review")).toContainText("UNVERIFIED_WITHOUT_TRANSACTION_TRANSFER_CALLBACK_READBACK");
});

test("cancelled signal-ignoring read cannot populate stale results or start another request automatically", async ({ page }) => {
  let unblock: (() => void) | undefined, entered = 0;
  const pending = new Promise<void>(resolve => { unblock = resolve; });
  await page.route(target.rpc_url, async route => {
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" } }); return; }
    entered++; await pending;
    await route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, body: "PRIVATE_CANARY" }).catch(() => {});
  });
  await setupFields(page); await page.getByRole("button", { name: "Read and prepare unsigned review" }).click();
  await expect.poll(() => entered).toBe(1); await page.getByRole("button", { name: "Cancel read" }).click(); unblock!();
  await expect(view(page)).toContainText("late results cannot populate"); await expect(page.locator(".testnet-review")).toHaveCount(0);
  expect(entered).toBe(1); await expect(view(page)).not.toContainText("PRIVATE_CANARY");
});

test("390/1440 light and dark, keyboard focus, dither fallback and reduced motion: synthetic reviews only", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await intercept(page, setupTransport(setupFixture()).transport); await setupFields(page);
  await page.getByRole("button", { name: "Read and prepare unsigned review" }).click(); await expect(page.locator(".testnet-review")).toBeVisible();
  await mkdir(".local/frontend/workspace", { recursive: true });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const dark of [true, false]) {
      const isDark = await page.locator("html").evaluate(e => e.classList.contains("dark"));
      if (isDark !== dark) await page.getByRole("button", { name: `Switch to ${dark ? "dark" : "light"} theme` }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.getByRole("heading", { name: "Review the action. Inspect the outcome." }).click();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: `.local/frontend/workspace/review-${width}-${dark ? "dark" : "light"}.png`, fullPage: true });
    }
  }
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 800 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const divider = page.locator('[data-dither="human-review"]'); await expect(divider).toHaveAttribute("aria-hidden", "true");
  expect(await divider.evaluate(e => getComputedStyle(e).maskImage)).not.toBe("none");
  await divider.evaluate(e => { (e as HTMLElement).style.maskImage = "none"; });
  await expect(page.getByRole("heading", { name: "Exact human-action review" })).toBeVisible();
  await page.getByLabel("Contract account", { exact: true }).focus(); await page.keyboard.press("Tab");
  await expect(page.getByLabel("Operator account", { exact: true })).toBeFocused(); expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Textures on", exact: true }).click(); await expect(divider).toBeHidden();
});

test("no-JS remains honest: no form names/URL data, signer or enabled network action", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false }); const page = await context.newPage();
  await page.goto(`${baseURL}/testnet`); await expect(page.getByText("JavaScript is required for explicit memory-only reads.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Read and prepare unsigned review" })).toBeDisabled();
  await expect(page.locator("form [name]")).toHaveCount(0); await context.close();
});

test("objective fixture bytes are explicitly selected, bounded and locally checked; never sent to RPC", async ({ page }) => {
  const f = await ownerFixture(), rpc = ownerTransport(f); await intercept(page, rpc.transport); await setupFields(page);
  await page.getByLabel("Action", { exact: true }).selectOption("record_task_check");
  await page.getByLabel("Exact arguments JSON", { exact: true }).fill(JSON.stringify(f.actions.check.args));
  await page.getByRole("button", { name: "Read and prepare unsigned review" }).click();
  await expect(view(page).getByRole("alert")).toContainText("EXACT_LOCAL_TASK_REPORT_MISMATCH");
  const artifact = page.getByLabel("Explicit local fixture artifact", { exact: false });
  await artifact.setInputFiles({ name: "too-large.json", mimeType: "application/json", buffer: Buffer.alloc(16_385) });
  await expect(view(page).getByRole("alert")).toContainText("Select at most 16 KiB");
  await artifact.setInputFiles({ name: "fixture.json", mimeType: "application/json", buffer: Buffer.from(f.artifact) });
  await expect(view(page)).toContainText("bytes selected locally; never sent to RPC");
  await page.getByRole("button", { name: "Read and prepare unsigned review" }).click();
  await expect(page.getByRole("heading", { name: "Exact human-action review" })).toBeVisible();
  await expect(page.locator(".testnet-review")).toContainText("record_task_check"); expect(JSON.stringify(rpc.calls)).not.toContain("health_body");
  await expect(page.locator(".testnet-review")).toContainText("not real-provider delivery or client acceptance");
});

test("workspace-only contrast rule does not change the shared header after navigating away", async ({ page }) => {
  expect(await page.locator("header.site-header").evaluate(e => getComputedStyle(e).transitionProperty)).not.toContain("background-color");
  await page.getByRole("link", { name: "Inspect LOCAL records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo#contract-observation$/u);
  expect(await page.locator("header.site-header").evaluate(e => getComputedStyle(e).transitionProperty)).toContain("background-color");
});
