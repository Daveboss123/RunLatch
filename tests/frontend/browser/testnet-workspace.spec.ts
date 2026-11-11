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

test("no auto-read, wallet discovery or storage; missing scope and invalid identity cannot send", async ({ page }) => {
  const methods = await intercept(page, async () => { throw Error("NETWORK_MUST_NOT_RUN"); });
  await expect(page.getByRole("button", { name: "Read and prepare unsigned review" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Connect browser wallet" })).toBeEnabled();
  await expect(view(page)).toContainText("No private key belongs in RunLatch");
  await page.getByRole("checkbox", { name: "I permit read-only RPC requests" }).check();
  await page.getByRole("button", { name: "Read and prepare unsigned review" }).click();
  await expect(view(page).getByRole("alert")).toContainText("INVALID_CONTRACT_ACCOUNT");
  await expect(view(page).getByRole("alert")).toBeFocused(); expect(methods).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, search: location.search }))).toEqual({ local: 0, session: 0, search: "" });
});

test("missing extension feedback stays beside the wallet button and keyboard focus stays usable", async ({ page }) => {
  const methods = await intercept(page, async () => { throw Error("NETWORK_MUST_NOT_RUN"); });
  const button = page.getByRole("button", { name: "Connect browser wallet" });
  await button.focus(); await page.keyboard.press("Enter");
  const feedback = page.locator(".wallet-connection #wallet-status");
  await expect(feedback).toContainText("No compatible wallet extension was detected");
  await expect(feedback).toBeInViewport(); await expect(button).toBeFocused();
  await expect(page.locator(".wallet-connection")).toContainText("one terminal-signed purchase remains unresolved");
  await expect(page.locator(".wallet-connection")).not.toContainText("template is unsigned");
  await expect(page.locator(".wallet-connection .text-link")).toHaveAttribute("href", "/docs#wallet");
  expect(methods).toEqual([]);
});

test("rejected wallet connection gives inline recovery without leaking wallet text or opening twice", async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = []; Object.defineProperty(window, "__rejectedWalletCalls", { value: calls });
    const wallet = { manifest: { id: "reject-wallet", name: "Reject wallet", type: "injected", features: {
      testnet: true, signInWithoutAddKey: true, signAndSendTransaction: true } },
      async signIn() { calls.push("connect"); throw Error("PRIVATE_WALLET_CANARY"); }, async signOut() {},
      async getAccounts() { return []; }, async signAndSendTransaction() { calls.push("SIGN_MUST_NOT_RUN"); } };
    window.addEventListener("near-selector-ready", () => window.dispatchEvent(new CustomEvent("near-wallet-injected", { detail: wallet })));
  });
  await page.reload();
  await page.getByRole("button", { name: "Connect browser wallet" }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.locator(".wallet-connection #wallet-status")).toContainText("Wallet connection was not completed");
  await expect(view(page)).not.toContainText("PRIVATE_WALLET_CANARY");
  expect(await page.evaluate(() => (window as unknown as { __rejectedWalletCalls: string[] }).__rejectedWalletCalls)).toEqual(["connect"]);
  await expect(page.getByRole("button", { name: "Connect browser wallet" })).toBeEnabled();
});

test("multiple injected wallets require a choice and never silently pick another account", async ({ page }) => {
  const publicKey = setupFixture().actions.project.public_key;
  await page.addInitScript(publicKey => {
    const calls: string[] = []; Object.defineProperty(window, "__choiceWalletCalls", { value: calls });
    for (const name of ["First", "Second"]) {
      const wallet = { manifest: { id: name.toLowerCase() + "-wallet", name: name + " wallet", type: "injected", features: {
        testnet: true, signInWithoutAddKey: true, signAndSendTransaction: true } },
        async signIn() { calls.push(name); return [{ accountId: name.toLowerCase() + ".testnet", publicKey }]; }, async signOut() {},
        async getAccounts() { return []; }, async signAndSendTransaction() { throw Error("SIGN_MUST_NOT_RUN"); } };
      window.addEventListener("near-selector-ready", () => window.dispatchEvent(new CustomEvent("near-wallet-injected", { detail: wallet })));
    }
  }, publicKey);
  await page.reload(); await page.getByRole("button", { name: "Connect browser wallet" }).click();
  await expect(page.locator("#wallet-status")).toContainText("2 compatible wallets found");
  expect(await page.evaluate(() => (window as unknown as { __choiceWalletCalls: string[] }).__choiceWalletCalls)).toEqual([]);
  await page.getByRole("button", { name: "Use Second wallet", exact: true }).click();
  await expect(page.getByLabel("Connected signing account")).toContainText("second.testnet");
  expect(await page.evaluate(() => (window as unknown as { __choiceWalletCalls: string[] }).__choiceWalletCalls)).toEqual(["Second"]);
});

test("new work-order templates are unsigned, correctly bound and never auto-read", async ({ page }) => {
  const methods = await intercept(page, async () => { throw Error("NETWORK_MUST_NOT_RUN"); });
  await page.getByRole("button", { name: "Load new work order" }).click();
  const args = page.getByRole("textbox", { name: "Exact arguments JSON", exact: true });
  expect(JSON.parse(await args.inputValue()).project.project_id).toBe("project_demo_1110");
  await expect(view(page)).toContainText("demo setup already completed");
  await page.getByRole("button", { name: "Load funded Capsule" }).click();
  const capsule = JSON.parse(await args.inputValue()); expect(capsule.capsule_id).toBe("capsule_demo_1110");
  expect(capsule.policy.project_id).toBe("project_demo_1110");
  expect(capsule.policy.validation_spec_hash).toBe("57ad6f579cc08fc614950b7c15151054c564e4b30370077f14bb780cbd34c4b9");
  await page.getByRole("button", { name: "Load canonical quote" }).click();
  expect(JSON.parse(await args.inputValue()).quote.quote_id).toBe("db_quote_demo_1110"); expect(methods).toEqual([]);
});

test("explicit injected wallet signs only a fresh exact reviewed testnet FunctionCall", async ({ page }) => {
  const f = setupFixture();
  await page.addInitScript(({ accountId, publicKey }) => {
    const calls: unknown[] = []; Object.defineProperty(window, "__runlatchWalletCalls", { value: calls });
    const wallet = { manifest: { id: "fixed-wallet", name: "Fixed wallet", type: "injected", features: {
      testnet: true, signInWithoutAddKey: true, signAndSendTransaction: true } },
    async signIn(input: unknown) { calls.push(["signIn", input]); return [{ accountId, publicKey }]; },
    async signOut(input: unknown) { calls.push(["signOut", input]); },
    async getAccounts(input: unknown) { calls.push(["getAccounts", input]); return [{ accountId, publicKey }]; },
    async signAndSendTransaction(input: unknown) { calls.push(["sign", input]); return { transaction: { hash: "1".repeat(32) } }; } };
    window.addEventListener("near-selector-ready", () => window.dispatchEvent(new CustomEvent("near-wallet-injected", { detail: wallet })));
  }, { accountId: target.operator_id, publicKey: f.actions.project.public_key });
  await page.reload(); const rpc = setupTransport(f), methods = await intercept(page, rpc.transport);
  await targetFields(page); await page.getByRole("button", { name: "Connect browser wallet" }).click();
  await expect(page.getByLabel("Connected signing account")).toContainText(target.operator_id);
  await page.getByLabel("Exact gas limit (gas units)").fill(f.actions.project.gas);
  await page.getByLabel("Exact arguments JSON", { exact: true }).fill(JSON.stringify({ project: { ...f.project.input, project_id: "new-project" } }));
  await page.getByRole("button", { name: "Read and prepare unsigned review" }).click();
  await page.getByRole("checkbox", { name: "I reviewed this exact action" }).check();
  await page.getByRole("button", { name: "Sign exact reviewed action" }).click();
  await expect(page.getByText("Wallet returned a transaction identity", { exact: true })).toBeVisible();
  await expect(page.getByText("1".repeat(32), { exact: true })).toBeVisible();
  const walletCalls = await page.evaluate(() => (window as unknown as { __runlatchWalletCalls: unknown[] }).__runlatchWalletCalls);
  const signed = walletCalls.find(item => Array.isArray(item) && item[0] === "sign") as unknown[];
  expect(signed[1]).toEqual({ network: "testnet", signerId: target.operator_id, receiverId: target.contract_id, actions: [{ type: "FunctionCall", params: {
    methodName: "create_project", args: { project: { ...f.project.input, project_id: "new-project" } }, gas: f.actions.project.gas, deposit: "8192" } }] });
  expect(methods.every(method => ["status", "block", "query"].includes(method))).toBe(true);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("a connected wrong account cannot enable human consent or a signing prompt", async ({ page }) => {
  const f = setupFixture();
  await page.addInitScript(publicKey => {
    const wallet = { manifest: { id: "wrong-account-wallet", name: "Wrong account wallet", type: "injected", features: {
      testnet: true, signInWithoutAddKey: true, signAndSendTransaction: true } },
      async signIn() { return [{ accountId: "different.testnet", publicKey }]; }, async signOut() {},
      async getAccounts() { return [{ accountId: "different.testnet", publicKey }]; },
      async signAndSendTransaction() { throw Error("SIGNING_MUST_NOT_BE_INVOKED"); } };
    window.addEventListener("near-selector-ready", () => window.dispatchEvent(new CustomEvent("near-wallet-injected", { detail: wallet })));
  }, f.actions.project.public_key);
  await page.reload(); await intercept(page, setupTransport(f).transport);
  await page.getByRole("button", { name: "Connect browser wallet" }).click();
  await expect(page.getByLabel("Connected signing account")).toContainText("different.testnet");
  await setupFields(page); await page.getByRole("button", { name: "Read and prepare unsigned review" }).click();
  await expect(page.getByRole("checkbox", { name: "I reviewed this exact action" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sign exact reviewed action" })).toBeDisabled();
  await expect(view(page)).toContainText("connected account and public key do not match this review");
});

test("Meteor extension connects from the primary button without browser key creation or storage", async ({ page }) => {
  const f = setupFixture();
  // This adapter serializes native bytes; the other shared fixtures use
  // format-only references. Supply an actual canonical 32-byte base58 hash.
  f.context.block.hash = "1".repeat(32);
  await page.addInitScript(({ accountId, publicKey }) => {
    const calls: unknown[] = []; Object.defineProperty(window, "__runlatchMeteorCalls", { value: calls });
    Object.defineProperty(window, "meteorComV2", { value: { version: "v2", featureFlags: [], async sendMessageDataAndRespond(input: unknown) {
      calls.push(input); const message = input as { uid: string; actionType: string };
      return message.actionType === "login"
        ? { uid: message.uid, status: "closed_success", endTags: [], payload: { accountId, allKeys: [publicKey] } }
        : { uid: message.uid, status: "closed_success", endTags: [], payload: { executionOutcomes: [{ transaction: { hash: "3".repeat(32) } }] } };
    } } });
  }, { accountId: target.operator_id, publicKey: f.actions.project.public_key });
  await page.reload(); const rpc = setupTransport(f), methods = await intercept(page, rpc.transport);
  await page.route("https://test.rpc.fastnear.com/", async route => {
    const request = route.request(); if (request.method() === "OPTIONS") { await route.fulfill({ status: 204,
      headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type" } }); return; }
    const response = await rpc.transport(request.url(), { method: "POST", body: request.postData() });
    await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: await response.text() });
  });
  await targetFields(page); await page.getByRole("button", { name: "Connect browser wallet" }).click();
  await expect(page.getByLabel("Connected signing account")).toContainText(target.operator_id);
  const first = await page.evaluate(() => (window as unknown as { __runlatchMeteorCalls: { inputs: unknown }[] }).__runlatchMeteorCalls[0]);
  expect(first.inputs).toEqual({ methods: [] }); expect(JSON.stringify(first)).not.toContain("public_key"); expect(JSON.stringify(first)).not.toContain("contract_id");
  await page.getByLabel("Exact gas limit (gas units)").fill(f.actions.project.gas);
  await page.getByLabel("Exact arguments JSON", { exact: true }).fill(JSON.stringify({ project: { ...f.project.input, project_id: "new-project" } }));
  await page.getByRole("button", { name: "Read and prepare unsigned review" }).click();
  await page.getByRole("checkbox", { name: "I reviewed this exact action" }).check(); await page.getByRole("button", { name: "Sign exact reviewed action" }).click();
  await expect(page.getByText("3".repeat(32), { exact: true })).toBeVisible();
  const messages = await page.evaluate(() => (window as unknown as { __runlatchMeteorCalls: { actionType: string; inputs: unknown }[] }).__runlatchMeteorCalls);
  const sign = messages.find(message => message.actionType === "sign"); expect(typeof (sign?.inputs as { transactions: unknown }).transactions).toBe("string");
  expect(methods.every(method => ["status", "block", "query"].includes(method))).toBe(true);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
});

test("agent recovery wallet installs only the exact finite submit-only key after fresh readback", async ({ page }) => {
  const recovery = "ed25519:6JcrDrG1V7GarzGkJF8vCsTcfKHSWqGfcP5BVT5n19C8", restricted = "ed25519:ABWnTWVgg59wN1p7pYfjcUUf53FFYubzELSBPq57Z2hY";
  const agent = "agent.runlatch-demo-1108.testnet", f = setupFixture();
  await page.addInitScript(({ accountId, publicKey }) => {
    const calls: unknown[] = []; Object.defineProperty(window, "__runlatchAgentWalletCalls", { value: calls });
    const wallet = { manifest: { id: "agent-wallet", name: "Agent recovery wallet", type: "injected", features: {
      testnet: true, signInWithoutAddKey: true, signAndSendTransaction: true } },
    async signIn(input: unknown) { calls.push(["signIn", input]); return [{ accountId, publicKey }]; },
    async signOut(input: unknown) { calls.push(["signOut", input]); }, async getAccounts() { return [{ accountId, publicKey }]; },
    async signAndSendTransaction(input: unknown) { calls.push(["sign", input]); return { transaction: { hash: "2".repeat(32) } }; } };
    window.addEventListener("near-selector-ready", () => window.dispatchEvent(new CustomEvent("near-wallet-injected", { detail: wallet })));
  }, { accountId: agent, publicKey: recovery });
  await page.reload(); const rpc = setupTransport(f, (params, value) => params.request_type === "view_access_key_list"
    ? { ...(value as object), keys: [{ public_key: recovery, access_key: { nonce: 1, permission: "FullAccess" } }] } : value);
  await intercept(page, rpc.transport); await targetFields(page); await page.getByRole("button", { name: "Connect browser wallet" }).click();
  await expect(page.getByLabel("Connected signing account")).toContainText(agent);
  await page.getByLabel("Workspace task").selectOption("agent-key"); await page.getByRole("button", { name: "Review restricted key installation" }).click();
  await expect(page.getByRole("heading", { name: "Exact restricted-agent key review" })).toBeVisible();
  await page.getByRole("checkbox", { name: "I reviewed the exact agent account" }).check();
  await page.getByRole("button", { name: "Install exact restricted key" }).click();
  await expect(page.getByText("Wallet returned an AddKey transaction identity", { exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as unknown as { __runlatchAgentWalletCalls: unknown[] }).__runlatchAgentWalletCalls);
  const signed = calls.find(item => Array.isArray(item) && item[0] === "sign") as unknown[];
  expect(signed[1]).toEqual({ network: "testnet", signerId: agent, receiverId: agent, actions: [{ type: "AddKey", params: { publicKey: restricted,
    accessKey: { nonce: 0, permission: { receiverId: target.contract_id, allowance: "50000000000000000000000", methodNames: ["submit_purchase"] } } } }] });
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
      // Sample settled styles, not halfway through a theme transition (same rule as policy.spec).
      await page.waitForFunction(() => document.getAnimations().filter(animation => animation instanceof CSSTransition)
        .every(animation => animation.playState !== "running"));
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
  await page.goto(`${baseURL}/testnet`); await expect(page.getByText("JavaScript is required for explicit reads and wallet prompts.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Read and prepare unsigned review" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Connect browser wallet" })).toBeDisabled();
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

test("shared header keeps ink and paper together on theme changes across routes", async ({ page }) => {
  expect(await page.locator("header.site-header").evaluate(e => getComputedStyle(e).transitionProperty)).not.toContain("background-color");
  await page.getByRole("link", { name: "Inspect LOCAL records", exact: true }).click();
  await expect(page).toHaveURL(/\/demo#contract-observation$/u);
  expect(await page.locator("header.site-header").evaluate(e => getComputedStyle(e).transitionProperty)).not.toContain("background-color");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/u);
  const result = await new AxeBuilder({ page }).include(".site-header").analyze();
  expect(result.violations).toEqual([]);
});
