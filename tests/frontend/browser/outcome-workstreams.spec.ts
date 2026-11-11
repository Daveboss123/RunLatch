/** Synthetic intercepted RPC only: no wallet, signature, public state change or live-chain proof. */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import { fixtureWorkflowRehearsal } from "../../near/helpers/fixture-workflow";
import { ownerReturnFixture } from "../helpers/owner-return";
import { ownerFixture } from "../helpers/owner-review";
import { evidenceTransport, target, encode } from "../helpers/testnet-evidence";
import { RUNLATCH_TESTNET_TARGET } from "../../../src/lib/near/demo-operations";
import { commercialQuoteHash } from "../../../src/lib/purchasing/hashing";
import { parsePurchase } from "../../../src/lib/near/records";
import { parsePurchaseObservationIntent } from "../../../src/lib/near/testnet-evidence";

async function intercept(page: Page, url: string, transport: typeof fetch) {
  const calls: string[] = [];
  await page.route(url, async route => {
    const r = route.request(), headers = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
    if (r.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    const method = r.postDataJSON().method; calls.push(method);
    expect(["status", "block", "query", "tx_status", "EXPERIMENTAL_tx_status"]).toContain(method);
    const result = await transport(url, { method: "POST", body: r.postData() });
    await route.fulfill({ status: result.status, headers: { ...headers, "content-type": "application/json" }, body: await result.text() });
  });
  return calls;
}
async function workflowFields(page: Page, r: Awaited<ReturnType<typeof fixtureWorkflowRehearsal>>) {
  await page.goto("/testnet"); await page.getByLabel("Workspace task").selectOption("workflow");
  await page.getByLabel("Contract account", { exact: true }).fill(target.contract_id);
  await page.getByLabel("Operator account", { exact: true }).fill(target.operator_id);
  await page.getByLabel("Expected deployed code hash", { exact: true }).fill(target.expected_code_hash);
  await page.getByLabel("Outcome owner account").fill(target.operator_id);
  await page.getByLabel("Outcome owner public key").fill(r.config.owner.public_key);
  await page.getByLabel("Outcome gas limit").fill(r.config.owner.gas);
  await page.getByLabel("Original captured purchase JSON").fill(JSON.stringify(r.config.intent));
  await page.getByLabel("Controlled fixture result").selectOption(r.config.fixture_result);
  await page.getByRole("checkbox", { name: "I permit read-only RPC requests" }).check();
}
test("workflow exports exact bytes, requires recorded stages and restores the same artifact after reload", async ({ page }) => {
  const r = await fixtureWorkflowRehearsal(), calls = await intercept(page, target.rpc_url, r.transport.transport);
  await workflowFields(page, r); await page.getByRole("button", { name: "Verify payment and prepare provisioning" }).click();
  await expect(page.locator(".testnet-review").first()).toContainText("VALIDATION_PASSED");
  await expect(page.getByRole("button", { name: "Sign exact reviewed action" })).toBeDisabled();
  const downloaded = page.waitForEvent("download"); await page.getByRole("button", { name: "Download exact fixture bytes" }).click();
  const file = await downloaded, bytes = await readFile((await file.path())!);
  const original = JSON.parse(await page.locator('pre[aria-label="Exact unsigned call arguments"]').textContent() ?? "{}");
  await page.getByRole("button", { name: "Re-read provisioning and prepare task check" }).click();
  await expect(page.locator(".testnet-error")).toContainText("FIXTURE_PROVISIONING_NOT_RECORDED");
  r.recordProvisioning(original.evidence);
  await page.getByRole("button", { name: "Re-read provisioning and prepare task check" }).click();
  await expect(page.locator("article.testnet-review")).toContainText("record_task_check");
  await page.getByLabel("Explicit owner outcome choice").selectOption("ACCEPTED");
  await page.getByRole("button", { name: "Re-read task and prepare explicit acceptance" }).click();
  await expect(page.locator(".testnet-error")).toContainText("FIXTURE_TASK_CHECK_NOT_RECORDED");
  await page.reload(); await workflowFields(page, r);
  await page.getByRole("checkbox", { name: "Restore an already recorded fixture" }).check();
  await page.getByLabel("Exact recorded fixture file").setInputFiles({ name: "exact.json", mimeType: "application/json", buffer: bytes });
  await page.getByRole("button", { name: "Restore recorded outcome fixture" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Exact fixture bytes restored" })).toBeVisible();
  await page.getByRole("button", { name: "Re-read provisioning and prepare task check" }).click();
  await expect(page.locator("article.testnet-review")).toContainText("record_task_check");
  const check = JSON.parse(await page.getByLabel("Exact unsigned call arguments").textContent() ?? "{}");
  r.recordCheck(check.report); // Synthetic contract-state fixture, not a browser write or signature.
  await page.getByLabel("Explicit owner outcome choice").selectOption("ACCEPTED");
  await page.getByRole("button", { name: "Re-read task and prepare explicit acceptance" }).click();
  await expect(page.locator("article.testnet-review")).toContainText("record_human_acceptance");
  r.recordAcceptance("ACCEPTED");
  await page.getByRole("checkbox", { name: "Show workflow expenses" }).check(); await page.getByRole("checkbox", { name: "Show workflow evidence" }).check();
  await page.getByRole("button", { name: "Read recorded workflow receipt" }).click();
  await expect(page.locator(".canonical-report")).toContainText("ACCEPTED");
  await expect(page.locator(".canonical-report")).toContainText("VALIDATION_PASSED");
  expect(calls).not.toContain("broadcast_tx_async");
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});
test("pending purchase produces no artifact or outcome action; failed provisioning does not reverse settled spend", async ({ page }) => {
  const r = await fixtureWorkflowRehearsal("PROVISIONED", "SETTLEMENT_PENDING");
  await intercept(page, target.rpc_url, r.transport.transport); await workflowFields(page, r);
  await page.getByRole("button", { name: "Verify payment and prepare provisioning" }).click();
  await expect(page.locator(".testnet-error")).toContainText("FIXTURE_PAYMENT_NOT_SETTLED");
  await expect(page.getByRole("button", { name: "Download exact fixture bytes" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign exact reviewed action" })).toHaveCount(0);
  const failed = await fixtureWorkflowRehearsal("FAILED"); await intercept(page, target.rpc_url, failed.transport.transport); await workflowFields(page, failed);
  await page.getByRole("button", { name: "Verify payment and prepare provisioning" }).click();
  await expect(page.locator(".testnet-review").first()).toContainText("VALIDATION_FAILED");
  await page.getByRole("checkbox", { name: "Show workflow budget" }).check(); await page.getByRole("checkbox", { name: "Show workflow expenses" }).check(); await page.getByRole("checkbox", { name: "Show workflow evidence" }).check();
  await page.getByRole("button", { name: "Read recorded workflow receipt" }).click();
  await expect(page.locator(".canonical-report")).toContainText("SETTLED");
  await expect(page.locator(".canonical-report")).toContainText("NOT_RECORDED");
});
test("owner-return readback reports exact native transfer/callback without signing or retry", async ({ page }) => {
  const f = await ownerReturnFixture(), calls = await intercept(page, target.rpc_url, f.transport().transport);
  await page.goto("/testnet"); await page.getByLabel("Workspace task").selectOption("owner-return");
  await page.getByLabel("Contract account", { exact: true }).fill(target.contract_id);
  await page.getByLabel("Operator account", { exact: true }).fill(target.operator_id);
  await page.getByLabel("Expected deployed code hash", { exact: true }).fill(target.expected_code_hash);
  await page.getByLabel("Exact owner-return observation JSON").fill(JSON.stringify(f.intent));
  await page.getByRole("checkbox", { name: "I permit read-only RPC requests" }).check();
  await page.getByRole("button", { name: "Inspect owner return once" }).click();
  await expect(page.locator(".testnet-review")).toContainText("RETURNED");
  await expect(page.locator(".testnet-review")).toContainText("250"); expect(calls.filter(x => x === "tx_status")).toHaveLength(1);
});

async function publicFixture() {
  const f = (await ownerFixture()).f;
  const mapped = JSON.parse(JSON.stringify(f).replaceAll(target.contract_id, RUNLATCH_TESTNET_TARGET.contract_id).replaceAll(target.operator_id, RUNLATCH_TESTNET_TARGET.operator_id)) as typeof f;
  mapped.quote.quote_hash = await commercialQuoteHash(mapped.quote.terms, "testnet", RUNLATCH_TESTNET_TARGET.contract_id);
  mapped.intent = parsePurchaseObservationIntent({ ...mapped.intent, proposal: { ...mapped.intent.proposal, expected_quote_hash: mapped.quote.quote_hash } });
  mapped.snapshot.purchases[0] = parsePurchase({ ...mapped.snapshot.purchases[0], proposal: mapped.intent.proposal }); mapped.reply.request = mapped.snapshot.purchases[0];
  mapped.raw.transaction.actions[0].FunctionCall.args = encode({ proposal: mapped.intent.proposal });
  mapped.raw.receipts[0].receipt.Action.actions = mapped.raw.transaction.actions;
  mapped.raw.status = { SuccessValue: encode(mapped.reply) }; mapped.raw.receipts_outcome[2].outcome.status = { SuccessValue: encode(mapped.reply) };
  const base = evidenceTransport(mapped, "2.14.0", (method, params, result) => {
    if (method !== "query") return;
    if (params.request_type === "view_account") return { result: { ...result as object, code_hash: RUNLATCH_TESTNET_TARGET.expected_code_hash } };
    if (params.method_name === "get_operator") return { result: { ...result as object, result: [...Buffer.from(JSON.stringify(RUNLATCH_TESTNET_TARGET.operator_id))] } };
  });
  return { f: mapped, transport: base.transport };
}
async function publicFields(page: Page, f: Awaited<ReturnType<typeof publicFixture>>["f"]) {
  await page.getByLabel("Record source").selectOption("public");
  await page.getByLabel("Public project ID").fill(f.snapshot.project.input.project_id);
  await page.getByLabel("Public Capsule IDs").fill("work"); await page.getByLabel("Public provider IDs").fill(f.provider.provider_id);
  await page.getByLabel("Public quote IDs").fill(f.quote.terms.input.quote_id);
  await page.getByLabel("Captured purchase intents JSON (at most 4)").fill(JSON.stringify([f.intent]));
  await page.getByRole("checkbox", { name: "I permit these read-only RPC requests" }).check();
}
test("public projection feeds real-record-shaped intelligence and selected JSON/print; source and disclosure stay separate", async ({ page }) => {
  const { f, transport } = await publicFixture(), calls = await intercept(page, RUNLATCH_TESTNET_TARGET.rpc_url, transport);
  await page.goto("/intelligence"); await publicFields(page, f); expect(calls).toEqual([]);
  await page.getByRole("button", { name: "Read selected public records" }).click();
  await expect(page.locator(".canonical-report")).toContainText("Budget totals are not selected");
  await expect(page.locator(".intelligence-source-label")).toContainText("Public testnet RPC-reported");
  await expect(page.locator(".outcome-receipt")).toContainText("settled");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download selected canonical JSON" }).click();
  const file = await download, json = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(json.financials).toBeNull(); expect(json.expenses).toEqual([]); expect(json.verified_purchase_spend).toBeNull();
  await page.getByRole("checkbox", { name: "Include budget in exported report" }).check(); await page.getByRole("checkbox", { name: "Include expenses in exported report" }).check();
  await expect(page.locator(".outcome-receipt")).toHaveCount(0); await page.getByRole("button", { name: "Read selected public records" }).click();
  await expect(page.locator(".canonical-report")).toContainText("Evidenced settled purchases"); await expect(page.locator(".canonical-report")).toContainText("SETTLED");
  const print = page.getByRole("button", { name: "Print selected canonical report" }); await print.click();
  await expect(page.getByRole("dialog")).toContainText("Evidenced settled purchases"); await page.keyboard.press("Escape"); await expect(print).toBeFocused();
  await page.getByLabel("Public project ID").fill("wrong"); await expect(page.locator(".canonical-report")).toHaveCount(0); await expect(page.locator(".outcome-receipt")).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("public unknown attempt retains identity without inventing a receipt, cost or settled payment", async ({ page }) => {
  const { f } = await publicFixture(); f.snapshot.purchases = []; f.snapshot.provisioning = []; f.snapshot.capsule.request_ids = []; f.snapshot.capsule.spent = "0";
  const base = evidenceTransport(f), wrapper: typeof fetch = async (url, options) => {
    const request = JSON.parse(String(options?.body)), response = await base.transport(url, options), json = await response.json();
    if (request.method === "tx_status") { delete json.result; json.error = { cause: { name: "UNKNOWN_TRANSACTION" } }; }
    else if (request.params.request_type === "view_account") json.result.code_hash = RUNLATCH_TESTNET_TARGET.expected_code_hash;
    else if (request.params.method_name === "get_operator") json.result.result = [...Buffer.from(JSON.stringify(RUNLATCH_TESTNET_TARGET.operator_id))];
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  };
  await intercept(page, RUNLATCH_TESTNET_TARGET.rpc_url, wrapper); await page.goto("/intelligence"); await publicFields(page, f);
  await page.getByRole("button", { name: "Read selected public records" }).click();
  await expect(page.locator(".public-project")).toContainText("1 unverified captured attempts");
  await expect(page.locator(".public-project")).toContainText(f.intent.transaction_hash);
  await expect(page.locator(".outcome-receipt")).toHaveCount(0); await expect(page.getByTestId("cost-per-success")).toHaveCount(0);
  await expect(page.locator(".public-project")).toContainText("SETTLEMENT_UNVERIFIED");
});
for (const width of [390, 1440]) test(`new public report ${width}px dark/light keyboard contrast and print reflow`, async ({ page }) => {
  const { f, transport } = await publicFixture(); await intercept(page, RUNLATCH_TESTNET_TARGET.rpc_url, transport);
  await page.setViewportSize({ width, height: 900 }); await page.goto("/intelligence"); await publicFields(page, f);
  await page.getByRole("checkbox", { name: "Include budget in exported report" }).check(); await page.getByRole("checkbox", { name: "Include expenses in exported report" }).check();
  await page.getByRole("button", { name: "Read selected public records" }).click(); await expect(page.locator(".canonical-report")).toBeVisible();
  await mkdir(".local/outcome-workstreams-captures", { recursive: true });
  for (const theme of ["dark", "light"]) {
    if (theme === "light") await page.getByRole("button", { name: "Switch to light theme" }).click();
    const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 55), right: el.getBoundingClientRect().right })));
    const wrappers = await page.locator(".intelligence-table-wrap").evaluateAll(els => els.map(el => ({ html: el.outerHTML.slice(0, 80), overflow: getComputedStyle(el).overflowX, display: getComputedStyle(el).display, width: el.clientWidth, scroll: el.scrollWidth })));
    const dimensions = await page.evaluate(() => ({ inner: innerWidth, root: document.documentElement.scrollWidth, body: document.body.scrollWidth, document: document.documentElement.clientWidth,
      spills: [...document.querySelectorAll("main *")].filter(el => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && !el.closest(".intelligence-table-wrap")).slice(-12).map(el => ({ tag: el.tagName, cls: el.className, text: el.textContent?.slice(0, 75), width: el.clientWidth, scroll: el.scrollWidth })) }));
    expect(dimensions.root <= dimensions.inner, JSON.stringify({ overflow, wrappers, dimensions })).toBe(true);
    expect((await new AxeBuilder({ page }).include(".public-project").analyze()).violations).toEqual([]);
    await page.locator(".public-project").screenshot({ path: `.local/outcome-workstreams-captures/public-${width}-${theme}.png` });
  }
  await page.getByRole("button", { name: "Print selected canonical report" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible(); expect((await new AxeBuilder({ page }).include("dialog").analyze()).violations).toEqual([]);
  expect(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("dialog").screenshot({ path: `.local/outcome-workstreams-captures/print-${width}.png` });
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "Print selected canonical report" })).toBeFocused();
});
