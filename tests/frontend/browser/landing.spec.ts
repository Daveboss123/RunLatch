import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Inside the boundary.", { exact: true })).toBeVisible({ timeout: 15_000 });
});

for (const width of [320, 360, 390, 768, 1024, 1280, 1364, 1440]) {
  test(`D-07 responsive ${width}px, semantic content and no page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("h1")).toContainText("Your agents can run.");
    await expect(page.locator("h1")).toContainText("Your budget stays yours.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width <= 700) {
      await expect(page.locator(".mobile-purchases")).toBeVisible();
      await expect(page.locator(".table-scroll")).toBeHidden();
      await expect(page.locator(".mobile-purchases").getByRole("button", { name: "Inspect Website hosting" })).toBeVisible();
    } else await expect(page.locator(".table-scroll")).toBeVisible();
  });
}

test("D-03 reconstructed narrative order, labelled fixtures and honest deployment state", async ({ page }) => {
  expect(await page.locator("main > section").evaluateAll(nodes => nodes.map(node => node.id || "hero"))).toEqual(["hero", "board", "problem", "simulator", "commitment", "receipts", "intelligence", "proof", "architecture", "questions"]);
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.locator(".run-board").getByText("Demo data", { exact: true })).toBeVisible();
  await expect(page.getByText("Gate + project + provider", { exact: true })).toBeVisible();
  await expect(page.locator(".deployment-status")).toContainText("Provider registered; no capsule, quote, purchase or outcome yet.");
  expect(await page.locator('a[href="#"]').count()).toBe(0);
  const broken = await page.locator('a[href^="#"]').evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).hash).filter(hash => !document.getElementById(decodeURIComponent(hash.slice(1)))));
  expect(broken).toEqual([]);
});

test("D-05 simulator adversarial controls and no signing requests", async ({ page }) => {
  await page.goto("/gate");
  const writes: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`); });
  const cases = [
    ["Alter recipient", "QUOTE_TERMS_MISMATCH"], ["Over budget", "INSUFFICIENT_AVAILABLE_BUDGET"],
    ["Stale project", "STALE_PROJECT_REVISION"], ["Replay request", "REQUEST_REPLAY"],
    ["Duplicate resource", "DUPLICATE_RESOURCE"], ["Revoked capsule", "CAPSULE_INACTIVE"],
    ["Expired quote", "QUOTE_EXPIRED"], ["Unregistered vendor", "UNKNOWN_PROVIDER"], ["Cancelled project", "PROJECT_INACTIVE"],
    ["Concurrent request", "INSUFFICIENT_AVAILABLE_BUDGET"],
  ];
  for (const [name, reason] of cases) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".reason-codes")).toContainText(reason);
    await expect(page.getByText("The latch stays closed.", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Hidden term", exact: true }).click();
  await expect(page.locator(".quote-costs")).toContainText("2.40");
  await expect(page.locator(".reason-codes")).toContainText("INSUFFICIENT_COMMITMENT_BUDGET");
  await page.getByLabel("Hypothetical capsule allocation").fill("1.5");
  await expect(page.locator(".decision-announcement")).toContainText("0.80 NEAR available to commit");
  await page.getByLabel("Hypothetical capsule allocation").fill("4");
  await expect(page.getByText("The owner decides.", { exact: true })).toBeVisible();
  await expect(page.locator(".decision-announcement")).toContainText("holds no money");
  await page.getByRole("button", { name: "Reset simulation", exact: true }).click();
  await expect(page.getByText("Inside the boundary.", { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});

test("D-12 input error, unknown callback and empty filter stay honest", async ({ page }) => {
  await page.getByLabel("Hypothetical capsule allocation").fill("1e3");
  await expect(page.locator("#budget-error")).toContainText("Enter a positive NEAR amount");
  await expect(page.getByText("Check the allocation", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Hypothetical capsule allocation")).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Reset simulation", exact: true }).click();
  await page.getByLabel("Filter purchases").selectOption("SETTLEMENT_FAILED");
  await expect(page.getByText("No failed settlements in this demo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show all requests", exact: true }).click();
  await page.getByRole("button", { name: "Inspect Website hosting", exact: true }).filter({ visible: true }).click();
  await expect(page.locator("#board-inspector")).toContainText("Callback outcome not observed");
  await expect(page.locator("#board-inspector")).toContainText("Not checked");
  await page.getByRole("button", { name: "Close detail", exact: true }).click();
  await expect(page.locator("#board-inspector")).toBeEmpty();
});

test("D-09 keyboard menu, tab arrows and visible focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  expect(await page.getByRole("link", { name: "Skip to content" }).evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe("none");
  await page.locator(".mobile-menu summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".mobile-menu")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.locator(".mobile-menu")).not.toHaveAttribute("open");
  await expect(page.locator(".mobile-menu summary")).toBeFocused();
  await page.getByRole("tab", { name: "Settled purchase", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Pending payment", exact: true })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Pending payment", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Reservation retained; callback outcome unknown");
  await page.keyboard.press("End");
  await expect(page.getByRole("tabpanel")).toContainText("No transfer or reservation for this denied request");
});

test("P-19 selected disclosure and local JSON export", async ({ page }) => {
  await expect(page.getByText("Nothing selected to share.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Printable client report" })).toBeDisabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download selected demo JSON" }).click();
  const download = await downloadPromise;
  await expect(page.getByRole("status").filter({ hasText: "Demo JSON downloaded locally" })).toBeVisible();
  expect(download.suggestedFilename()).toBe("runlatch-demo-report.json");
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Expected a local download stream");
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(report.financials).toBeNull(); expect(report.expenses).toEqual([]);
  await page.getByRole("checkbox", { name: /Budget & commitments/u }).check();
  await page.getByRole("checkbox", { name: /Purchase details/u }).check();
  await page.getByRole("checkbox", { name: /Outcome evidence/u }).check();
  await expect(page.locator(".report-expenses")).toContainText("human acceptance not recorded");
  await expect(page.locator(".report-output")).toContainText("Denied proposals do not add commitments.");
  await expect(page.getByRole("button", { name: "Printable client report" })).toBeEnabled();
  await page.getByRole("button", { name: "Printable client report" }).click();
  const sheet = page.getByRole("dialog", { name: "Printable client report preview" });
  await expect(sheet).toContainText("BROWSER_FIXTURE · not a contract record");
  await expect(sheet).toContainText("Settled");
  await expect(sheet).toContainText("human acceptance not recorded");
  await expect(sheet).toContainText("Full minimum commitment (NEAR)");
  await expect(sheet).toContainText("2.40");
  await expect(sheet.getByRole("heading", { name: "Automated Booking Website" })).toBeFocused();
  await expect(sheet).toContainText("No actual owner approval, public transaction, supplier event, client acceptance or share link");
  await sheet.getByRole("button", { name: "Close print preview" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Printable client report", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Printable client report", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Printable client report", exact: true })).toBeFocused();
});

test("P-19 printable report reflows, isolates print output and passes keyboard/contrast checks", async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("checkbox", { name: /Budget & commitments/u }).check();
  const trigger = page.getByRole("button", { name: "Printable client report", exact: true });
  const sheet = page.getByRole("dialog", { name: "Printable client report preview" });
  await trigger.click();
  await expect(sheet).toContainText("Purchase details were not selected for disclosure.");
  await expect(sheet).not.toContainText("Store booking requests");
  await page.keyboard.press("Escape");
  await page.getByRole("checkbox", { name: /Purchase details/u }).check();
  await page.getByRole("checkbox", { name: /Outcome evidence/u }).check();
  for (const width of [1440, 390]) for (const theme of ["dark", "light"]) {
    await page.setViewportSize({ width, height: 844 });
    const dark = await page.locator("html").evaluate(node => node.classList.contains("dark"));
    if (dark !== (theme === "dark")) await page.getByRole("button", { name: `Switch to ${theme} theme`, exact: true }).click();
    await trigger.click();
    expect(await sheet.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(sheet).toContainText("Store booking requests");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      // Native dialogs may tab through browser chrome (activeElement becomes body),
      // but must never focus an inert control in the underlying page.
      expect(await sheet.evaluate(node => node.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
    }
    await page.emulateMedia({ media: "print" });
    await expect(sheet.getByRole("button", { name: "Print this report" })).toBeHidden();
    await expect(page.locator("main")).toBeHidden();
    await expect(sheet.getByRole("heading", { name: "Automated Booking Website" })).toBeVisible();
    await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
});

test("D-18 static dither and reduced motion, no hidden animation or storage", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator('[data-dither="hero"]')).toHaveAttribute("data-state", "static");
  const state = () => page.evaluate(() => ({
    canvases: document.querySelectorAll("canvas").length,
    animations: document.getAnimations().filter(animation => animation.playState === "running").length,
    scroll: getComputedStyle(document.documentElement).scrollBehavior,
    motion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    storage: localStorage.length + sessionStorage.length,
  }));
  await expect.poll(state).toEqual({ canvases: 1, animations: 0, scroll: "auto", motion: true, storage: 0 });
  await expect(page.locator('[data-dither="hero"]')).toHaveAttribute("data-state", "static");
  expect(await page.locator("[data-dither]").count()).toBeGreaterThanOrEqual(4);
});

test("D-16 light/dark settings, texture reduction and route continuity", async ({ page }) => {
  await expect(page.locator("html")).toHaveClass(/dark/u);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(0, 0, 0)");
  await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/u);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(247, 247, 242)");
  await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/u);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(0, 0, 0)");
  await page.getByRole("button", { name: "Textures on", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-texture", "off");
  await expect(page.locator(".metrics")).toContainText("2.30");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(results.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.getByRole("link", { name: "Open demo workspace", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/u);
  await expect(page.locator("html")).toHaveAttribute("data-texture", "off");
  await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/u);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test("D-19 technology strip pauses for focus/offscreen/reduced motion and has real links", async ({ page }) => {
  const strip = page.locator(".build-strip");
  await strip.scrollIntoViewIfNeeded();
  await expect(strip).toHaveAttribute("data-state", "running");
  const links = strip.locator('.build-strip-group:not([aria-hidden="true"]) a');
  expect(await links.count()).toBe(6);
  expect(await links.locator("img").count()).toBe(5);
  await expect(links.first()).toContainText("NEAR");
  await expect(links.first().locator("img")).toHaveCount(0);
  const names = await links.evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, href: (node as HTMLAnchorElement).href })));
  expect(names.map(item => new URL(item.href).protocol)).toEqual(Array(6).fill("https:"));
  await links.first().focus();
  await expect(strip).toHaveAttribute("data-state", "paused");
  await expect(strip).toHaveAttribute("data-manual-pause", "true");
  await page.locator("#hero-heading").scrollIntoViewIfNeeded();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await expect(strip).toHaveAttribute("data-state", "paused");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await strip.scrollIntoViewIfNeeded();
  await expect(strip).toHaveAttribute("data-state", "static");
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
});

test("D-19 animated hero genuinely renders, pauses, respects reduction and survives context loss", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const shader = page.locator('[data-dither="hero"]');
  await expect(shader).toHaveAttribute("data-state", "running");
  await expect(shader.locator("canvas")).toHaveCSS("opacity", "1");
  const first = await shader.screenshot();
  await page.evaluate(() => new Promise<void>(resolve => { let frames = 0; const tick = () => { frames += 1; if (frames >= 40) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
  const second = await shader.screenshot();
  expect(Buffer.compare(first, second)).not.toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(shader).toHaveAttribute("data-state", "static");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator("#proof-heading").scrollIntoViewIfNeeded();
  await expect(shader).toHaveAttribute("data-state", /paused|fallback/u);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(shader).toHaveAttribute("data-state", "running");
  const supported = await shader.locator("canvas").evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext(); return true;
  });
  expect(supported).toBe(true);
  await expect(shader).toHaveAttribute("data-state", "fallback");
  await expect(shader.locator("[data-dither-fallback]")).toHaveCSS("opacity", "1");
  await expect(page.locator("h1")).toBeVisible();
});

for (const width of [390, 1440]) test(`D-10/D-11 accessibility ${width}px including open trace and errors`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.getByRole("button", { name: "Alter recipient", exact: true }).click();
  await expect(page.locator(".reason-codes")).toContainText("QUOTE_TERMS_MISMATCH");
  await page.locator(".trace > summary").first().click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  await mkdir(".local/ui", { recursive: true });
  await writeFile(`.local/ui/axe-${width}.json`, JSON.stringify({ violations: results.violations, incomplete: results.incomplete.map(item => ({ id: item.id, nodes: item.nodes.length })), passes: results.passes.length }, null, 2));
  expect(results.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) }))).toEqual([]);
});

test("D-04 functional documentation/demo routes and error page", async ({ page }) => {
  for (const route of ["/docs", "/demo", "/gate", "/setup"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    const broken = await page.locator('a[href^="#"]').evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).hash).filter(hash => !document.getElementById(decodeURIComponent(hash.slice(1)))));
    expect(broken).toEqual([]);
  }
  const response = await page.goto("/no-such-page"); expect(response?.status()).toBe(404);
  await page.getByRole("link", { name: "Return to RunLatch" }).click();
  await expect(page.locator("h1")).toContainText("Your agents can run.");
});

test("D-04 primary CTAs open separate Gate/demo application pages", async ({ page }) => {
  await expect(page.locator(".hero .hero-actions").getByRole("link", { name: "Try the Gate", exact: true })).toHaveAttribute("href", "/gate");
  await expect(page.getByRole("link", { name: "Inspect a project", exact: true })).toHaveAttribute("href", "/demo");
  await page.locator(".hero .hero-actions").getByRole("link", { name: "Try the Gate", exact: true }).click();
  await expect(page).toHaveURL(/\/gate$/u);
  await expect(page.getByRole("heading", { name: "Test the spending boundary.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Alter recipient", exact: true }).click();
  await expect(page.locator(".reason-codes")).toContainText("QUOTE_TERMS_MISMATCH");
  await page.getByRole("link", { name: "Inspect a project", exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/demo$/u);
  await expect(page.getByRole("button", { name: "Evaluate demo quote", exact: true })).toBeVisible();
});

test("D-04 local demo walkthrough success/failure/unknown retains exact accounting", async ({ page }) => {
  await page.goto("/demo");
  const walkthrough = page.locator(".demo-walkthrough");
  for (const [callback, label, spent, reserved] of [["success", "Simulated settled payment", "0.50", "0.00"], ["failure", "Simulated confirmed transfer failure", "0.00", "0.00"], ["unknown", "Unproven callback · reservation retained", "0.00", "0.50"]]) {
    await walkthrough.getByRole("button", { name: "Evaluate demo quote", exact: true }).click();
    await expect(walkthrough).toContainText("Eligible in simulation");
    await walkthrough.getByRole("button", { name: "Preview reservation", exact: true }).click();
    await walkthrough.getByLabel("Native callback fixture").selectOption(callback);
    await walkthrough.getByRole("button", { name: "Apply callback fixture", exact: true }).click();
    await expect(walkthrough).toContainText(label);
    await expect(walkthrough.locator(".walkthrough-metrics > div").nth(1)).toContainText(spent);
    await expect(walkthrough.locator(".walkthrough-metrics > div").nth(2)).toContainText(reserved);
    await walkthrough.getByRole("button", { name: "Start a new fixture", exact: true }).click();
  }
});

test("D-04 demo tampering/recurring review cannot advance into reservations", async ({ page }) => {
  await page.goto("/demo"); const walkthrough = page.locator(".demo-walkthrough");
  await walkthrough.getByLabel("Purchase scenario").selectOption("tamper");
  await walkthrough.getByRole("button", { name: "Evaluate demo quote", exact: true }).click();
  await expect(walkthrough).toContainText("QUOTE_TERMS_MISMATCH");
  await expect(walkthrough.getByRole("button", { name: "Preview reservation", exact: true })).toHaveCount(0);
  await walkthrough.getByRole("button", { name: "Start a new fixture", exact: true }).click();
  await walkthrough.getByLabel("Purchase scenario").selectOption("recurring");
  await walkthrough.getByRole("button", { name: "Evaluate demo quote", exact: true }).click();
  await expect(walkthrough).toContainText("Owner approval required · no hold");
  await expect(walkthrough.getByRole("button", { name: "Preview reservation", exact: true })).toHaveCount(0);
});

test("D-04 Built with keeps verified artwork and the text-only NEAR reference", async ({ page }) => {
  const group = page.locator('.build-strip-group:not([aria-hidden="true"])');
  expect(await group.locator("a img").count()).toBe(5);
  await expect(group.getByRole("link", { name: "NEAR (opens in a new tab)", exact: true }).locator("img")).toHaveCount(0);
  expect(await group.locator("small").count()).toBe(0);
  expect(await group.locator("strong").allTextContents()).toEqual(["NEAR", "Rust", "Next.js", "React", "Tailwind CSS", "dithercn"]);
});

test("Publication: Docs omit personal paths and footer keeps truthful deployment limits", async ({ page }) => {
  await page.goto("/docs");
  await expect(page.locator("main")).not.toContainText("/mnt/c/Users/");
  await expect(page.locator("main")).not.toContainText("C:\\Users\\");
  await expect(page.locator("footer")).toContainText("Testnet setup exists; no public purchase or outcome yet");
  await expect(page.locator("footer")).toContainText("Private source repository");
  await expect(page.locator("#credits")).toContainText("its unverified logo is not served");
  const artwork = await page.request.get("/marks/near.svg");
  expect(artwork.status()).toBe(404);
});

test("Motion brief: bounded story scroll progression and manual keyboard selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const visual = page.locator(".story-visual");
  expect(await visual.evaluate(node => getComputedStyle(node).position)).toBe("sticky");
  for (const index of [0, 2, 4]) {
    await page.locator(`[data-step="${index}"]`).evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect(visual).toHaveAttribute("data-active-step", `${index}`);
  }
  await page.getByRole("button", { name: "Story step 2: Pin the commercial terms.", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(visual).toHaveAttribute("data-active-step", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(visual).toHaveCSS("position", "static");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(visual).toHaveCSS("position", "static");
  await expect(page.locator(".story-steps > li")).toHaveCount(5);
});

test("Motion brief: full commitment and exact available authority are separate", async ({ page }) => {
  const section = page.locator("#commitment");
  await section.getByRole("button", { name: "12-month quote", exact: true }).click();
  await expect(section.locator(".commitment-totals")).toContainText("2.40");
  await expect(section.locator(".term-legend")).toContainText("2.20 NEAR");
  await expect(section.locator(".commitment-decision")).toContainText("exceeds available authority");
  await expect(section.locator(".capsule-balances")).toContainText("2.30 NEAR");
  await section.getByLabel("Hypothetical allocation", { exact: true }).selectOption("4");
  await expect(section.locator(".commitment-decision")).toContainText("exact owner approval still required");
  await expect(section.locator(".capsule-balances")).toContainText("3.30 NEAR");
  await expect(section.locator(".budget-track")).toHaveAttribute("aria-label", /Reserved: 0.20 NEAR/u);
  await section.getByRole("button", { name: "One-time quote", exact: true }).click();
  await expect(section.locator(".commitment-totals")).not.toContainText("2.40");
  await expect(section.locator(".term-legend")).toContainText("No future periods");
});

test("Motion brief: lifecycle and evidence inspector never imply delivery or settlement", async ({ page }) => {
  const lifecycle = page.locator("#lifecycle");
  await lifecycle.getByRole("button", { name: "5 Reconcile", exact: true }).click();
  await expect(lifecycle.locator(".lifecycle-explanation")).toContainText("Unknown or unproven callbacks retain the hold");
  await lifecycle.getByRole("button", { name: "8 Accept", exact: true }).click();
  await expect(lifecycle.locator(".lifecycle-explanation")).toContainText("Neither settlement nor an objective check implies");
  const receipt = page.locator(".receipt-example");
  await receipt.getByRole("button", { name: "Payment", exact: true }).click();
  await expect(receipt.locator(".evidence-detail")).toContainText("no public chain observation");
  await receipt.getByRole("button", { name: "Provider evidence", exact: true }).click();
  await expect(receipt.locator(".evidence-detail")).toContainText("not an external provider");
  await receipt.getByRole("button", { name: "Validation", exact: true }).click();
  await expect(receipt.locator(".evidence-detail")).toContainText("Not recorded");
  await page.locator(".faq-list summary").first().click();
  await expect(page.locator(".faq-list details").first()).toContainText("cannot activate policy or override a hard denial");
});

test("D-17 receipt texture never overlaps semantic text in either theme", async ({ page }) => {
  for (const width of [1440, 1024, 768, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["dark", "light"]) {
      const dark = await page.locator("html").evaluate(node => node.classList.contains("dark"));
      if (dark !== (theme === "dark")) await page.getByRole("button", { name: dark ? "Switch to light theme" : "Switch to dark theme", exact: true }).click();
      const heading = page.locator(".receipt-heading");
      await expect(heading.locator(".demo-tag")).toHaveText("Seeded example");
      await expect(heading.locator(".receipt-seal")).toHaveAttribute("aria-hidden", "true");
      await expect(heading.locator(".receipt-seal")).toHaveCSS("pointer-events", "none");
      const overlaps = await heading.evaluate(node => {
        const seal = node.querySelector(".receipt-seal")!.getBoundingClientRect();
        return [...node.querySelectorAll(".demo-tag, .quiet, h3, code")].some(element => {
          const text = element.getBoundingClientRect();
          return seal.left < text.right && seal.right > text.left && seal.top < text.bottom && seal.bottom > text.top;
        });
      });
      expect(overlaps, `receipt seal at ${width}px in ${theme}`).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("Review: centred775px hero keeps header action and crisp selectable text", async ({ page }) => {
  await page.setViewportSize({ width: 775, height: 700 });
  const hero = page.locator(".hero-copy");
  await expect(hero).toHaveCSS("text-align", "center");
  const box = await hero.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.x + box!.width / 2 - 775 / 2)).toBeLessThan(2);
  await expect(page.locator("header .nav-cta")).toBeVisible();
  await expect(page.locator(".mobile-menu summary")).toBeVisible();
  await expect(page.locator("#hero-heading .heading-line")).toHaveCount(2);
  await expect(page.locator(".hero-visual")).toHaveCSS("border-top-width", "0px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Review: heading ink follows down and up scroll without fading out text", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const heading = page.locator("#problem-heading");
  const position = async (fraction: number) => heading.evaluate((node, value) => window.scrollTo({ top: scrollY + node.getBoundingClientRect().top - innerHeight * value, behavior: "instant" }), fraction);
  await position(.8);
  await expect.poll(() => heading.evaluate(node => Number((node as HTMLElement).dataset.inkProgress))).toBeLessThan(.4);
  const enteringColor = await heading.locator(".heading-line-text").first().evaluate(node => getComputedStyle(node).color);
  await position(.45);
  await expect.poll(() => heading.evaluate(node => Number((node as HTMLElement).dataset.inkProgress))).toBe(1);
  const clearColor = await heading.locator(".heading-line-text").first().evaluate(node => getComputedStyle(node).color);
  expect(clearColor).not.toBe(enteringColor);
  await position(.8);
  await expect.poll(() => heading.evaluate(node => Number((node as HTMLElement).dataset.inkProgress))).toBeLessThan(.4);
  await expect(heading.locator(".heading-line-text").first()).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => heading.evaluate(node => Number((node as HTMLElement).dataset.inkProgress))).toBe(1);
});

test("Review: interactive dither responds to pointer and keyboard, never grants authority", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) writes.push(request.url()); });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const frame = page.locator(".animated-latch-frame");
  const range = page.getByRole("slider", { name: "Explore the passage", exact: true });
  const ledger = await page.locator(".metrics").first().textContent();
  await range.focus(); await page.keyboard.press("Home");
  await expect(range).toHaveAttribute("aria-valuetext", "Agent request");
  await page.keyboard.press("End");
  await expect(range).toHaveAttribute("aria-valuetext", "Outcome Receipt");
  await page.getByRole("button", { name: "Pause illustration", exact: true }).click();
  await expect(page.locator('[data-dither="hero"]')).toHaveAttribute("data-state", "static");
  const before = await frame.getAttribute("data-focus-x");
  const box = await frame.boundingBox();
  if (!box) throw new Error("Expected the bounded illustration frame");
  await frame.hover({ position: { x: box.width * .8, y: box.height * .4 } });
  await expect(frame).toHaveAttribute("data-focus-x", before!);
  await page.getByRole("button", { name: "Play illustration", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause illustration", exact: true })).toBeVisible();
  // Locator actionability waits for a stable, visible target after controls scroll.
  // Raw viewport coordinates cached before Play can miss the frame during layout.
  await frame.hover({ position: { x: box.width * .8, y: box.height * .4 } });
  await expect.poll(async () => Number(await frame.getAttribute("data-focus-x"))).toBeCloseTo(.8, 2);
  expect(await page.locator(".metrics").first().textContent()).toBe(ledger);
  expect(writes).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Motion reduced", exact: true })).toBeDisabled();
});

test("Review: budget follows scroll in both directions without time or amount animation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/");
  const partition = page.locator(".run-board .budget-partition");
  const bar = partition.locator(".budget-track");
  const amounts = await bar.getAttribute("aria-label");
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>window.scrollTo({top:150,behavior:"instant"}));
  await expect(page.locator(".header-inner")).toHaveCSS("min-height","68px");
  const widths = await bar.locator(".budget-segment").evaluateAll(nodes => nodes.map(n => (n as HTMLElement).style.width));
  const position = async (fraction: number) => partition.evaluate((node,value)=>window.scrollTo({top:scrollY+node.getBoundingClientRect().top-innerHeight*value,behavior:"instant"}),fraction);
  await position(.85);
  await expect.poll(()=>partition.evaluate(n=>Number((n as HTMLElement).dataset.budgetProgress))).toBeCloseTo(.1538,2);
  await position(.60);
  await expect.poll(()=>partition.evaluate(n=>Number((n as HTMLElement).dataset.budgetProgress))).toBeCloseTo(.5385,2);
  const middle = await bar.evaluate(n=>getComputedStyle(n).clipPath);
  await page.evaluate(()=>new Promise<void>(resolve=>{let frames=0;const tick=()=>{if(++frames===20)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
  expect(await bar.evaluate(n=>getComputedStyle(n).clipPath)).toBe(middle);
  await position(.30);
  await expect.poll(()=>partition.evaluate(n=>Number((n as HTMLElement).dataset.budgetProgress))).toBe(1);
  await position(.85);
  await expect.poll(()=>partition.evaluate(n=>Number((n as HTMLElement).dataset.budgetProgress))).toBeCloseTo(.1538,2);
  expect(await bar.evaluate(n=>n.getAnimations().length)).toBe(0);
  expect(await bar.locator(".budget-segment").evaluateAll(nodes=>nodes.map(n=>(n as HTMLElement).style.width))).toEqual(widths);
  await expect(bar).toHaveAttribute("aria-label", amounts!);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(bar).toHaveCSS("clip-path", "none");
});

test("Review: Gate has no repeated closing pitch and footer dither is integrated", async ({ page }) => {
  await expect(page.locator(".closing-dither")).toHaveCSS("position", "static");
  await expect(page.locator(".closing-dither")).toHaveCSS("clip-path", "none");
  await expect(page.locator(".closing-dither svg")).toHaveCount(1);
  await page.goto("/gate");
  await expect(page.locator(".footer-closing")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Try the Gate", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "A preview is not authority.", exact: true })).toBeVisible();
});

test("Motion brief: /gate semantic heading order and active navigation", async ({ page }) => {
  await page.goto("/gate");
  await expect(page.getByText("Inside the boundary.", { exact: true })).toBeVisible();
  await expect(page.locator(".desktop-nav").getByRole("link", { name: "The Gate", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".workbench-heading h2")).toContainText("Client Work Capsule");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(results.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
});

test("Full audit: repeated matrix removed, legacy deep link and relocated detail retained", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#capabilities")).toHaveCount(1);
  await expect(page.locator(".capability-table")).toHaveCount(0);
  await page.goto("/docs#capabilities");
  await expect(page.getByRole("heading",{name:"What an amount cap does not express",exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Full audit: single mobile affordance and new-tab Built with links", async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  const menu=page.locator(".mobile-menu summary");
  await expect(menu).toHaveAttribute("aria-label","Navigation menu");
  expect((await menu.textContent())?.trim()).toBe("");
  await expect(menu).toHaveCSS("width","44px");
  const links=page.locator('.build-strip-group:not([aria-hidden="true"]) a');
  for(const link of await links.all()) {await expect(link).toHaveAttribute("target","_blank");await expect(link).toHaveAttribute("rel",/noopener.*noreferrer/u);}
});

test("Full audit: shared proposal state, uncapped denial and linked receipt selection", async ({page})=>{
  await page.goto("/gate");
  await page.getByRole("button",{name:"Uncapped exposure",exact:true}).click();
  await expect(page.locator(".reason-codes")).toContainText("UNBOUNDED_COMMITMENT");
  await expect(page.locator(".quote-costs")).toContainText("Unknown");
  await page.getByLabel("Hypothetical capsule allocation").fill("9");
  await expect(page.locator(".reason-codes")).toContainText("UNBOUNDED_COMMITMENT");
  await page.goto("/");
  await page.getByRole("button",{name:"Alter recipient",exact:true}).click();
  await expect(page.locator(".animated-latch-frame")).toHaveAttribute("data-preview-decision","DENIED");
  await page.getByRole("button",{name:"Reset simulation",exact:true}).click();
  await page.locator("#commitment").getByRole("button",{name:"12-month quote",exact:true}).click();
  await expect(page.locator("#sim-quote")).toHaveValue("2");
  await page.locator("#commitment").getByLabel("Hypothetical allocation",{exact:true}).selectOption("4");
  await expect(page.locator(".animated-latch-frame")).toHaveAttribute("data-preview-decision","APPROVAL_REQUIRED");
  await page.getByRole("button",{name:"Pending example",exact:true}).click();
  await expect(page.locator(".receipt-example")).toHaveAttribute("data-record","purchase-host-demo-01");
  await page.getByRole("tab",{name:"Denied request",exact:true}).click();
  await expect(page.locator(".purchase-lifecycle")).toHaveAttribute("data-record","purchase-term-demo-01");
  await expect(page.locator(".lifecycle-record")).toContainText("Not evidenced / not checked");
});

test("Full audit: 200-percent-equivalent reflow and actionable focus stays visible", async ({browser}, testInfo)=>{
  // 1280×900 at 200% browser zoom gives a 640×450 CSS viewport.
  // This checks equivalent reflow/density, not desktop OS zoom controls.
  const context=await browser.newContext({viewport:{width:640,height:450},deviceScaleFactor:2});
  const page=await context.newPage(); await page.goto(new URL("/gate", testInfo.project.use.baseURL).href);
  await expect(page.getByText("Inside the boundary.",{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const button=page.getByRole("button",{name:"Alter recipient",exact:true});
  await button.focus();
  await expect(button).toBeFocused();
  await expect.poll(async()=>{const bounds=await button.boundingBox();return bounds?bounds.y+bounds.height:Infinity;}).toBeLessThanOrEqual(450);
  const bounds=await button.boundingBox(); expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThan(64);
  await page.keyboard.press("Enter");
  await expect(page.locator(".reason-codes")).toContainText("QUOTE_TERMS_MISMATCH");
  await context.close();
});

test("Full audit: hover, press, focus and disabled states retain readable selected controls",async({page})=>{
  const primary=page.locator(".hero .button").first();
  const before=await primary.evaluate(n=>getComputedStyle(n).boxShadow);
  await primary.hover();
  await expect.poll(()=>primary.evaluate(n=>getComputedStyle(n).boxShadow)).not.toBe(before);
  await primary.focus();
  expect(await primary.evaluate(n=>getComputedStyle(n).outlineStyle)).toBe("solid");
  // Scrolling to sticky controls can legitimately change the selected row.
  // Test the real current selection, not a step that the scroll observer replaced.
  await page.locator(".story-controls").scrollIntoViewIfNeeded();
  const selected=page.locator('.story-controls button[aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  await selected.hover();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(selected).toHaveCSS("background-color", "rgb(198, 243, 107)");
  await page.emulateMedia({reducedMotion:"reduce"});
  const disabled=page.getByRole("button",{name:"Motion reduced",exact:true});
  await expect(disabled).toBeDisabled(); await expect(disabled).toHaveCSS("opacity","1");
});

test("D-08/D-23 screenshots, clean console and measured load", async ({ page }) => {
  await mkdir(".local/ui", { recursive: true });
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const origin = new URL(page.url()).origin;
  page.on("request", request => { if (/^https?:/u.test(request.url()) && new URL(request.url()).origin !== origin) external.push(request.url()); });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/"); await page.evaluate(() => document.fonts.ready);
    if (await page.locator("html").evaluate(node => node.classList.contains("dark"))) await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.effect?.getTiming().iterations === Infinity || animation.playState !== "running"));
    await expect(page.getByText("Inside the boundary.", { exact: true })).toBeVisible();
    await page.screenshot({ path: `.local/ui/landing-${width}.png`, fullPage: true });
    await page.screenshot({ path: `.local/ui/hero-${width}.png` });
    await page.locator(".run-board").screenshot({ path: `.local/ui/board-${width}.png` });
    await page.getByRole("button", { name: "Alter recipient", exact: true }).click();
    await expect(page.locator(".reason-codes")).toContainText("QUOTE_TERMS_MISMATCH");
    await page.locator(".simulator-workbench").screenshot({ path: `.local/ui/simulator-${width}.png` });
    await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/u);
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.effect?.getTiming().iterations === Infinity || animation.playState !== "running"));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `.local/ui/hero-dark-${width}.png` });
    await page.screenshot({ path: `.local/ui/landing-dark-${width}.png`, fullPage: true });
    await page.locator("footer").screenshot({ path: `.local/ui/footer-dark-${width}.png` });
    await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
  }
  expect(errors).toEqual([]); expect(external).toEqual([]);
  const performanceData = await page.evaluate(() => ({ navigation: performance.getEntriesByType("navigation").map(entry => entry.toJSON()), resources: performance.getEntriesByType("resource").map(entry => ({ name: entry.name, duration: entry.duration, transferSize: (entry as PerformanceResourceTiming).transferSize })), fontStatus: document.fonts.status, canvases: document.querySelectorAll("canvas").length }));
  await writeFile(".local/ui/browser-performance.json", JSON.stringify(performanceData, null, 2));
});

test("D-18 no-JavaScript fallback retains semantic page and static dither", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto(new URL("/", testInfo.project.use.baseURL).href);
  await expect(page.locator("#hero-heading")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("html")).toHaveClass(/dark/u);
  await expect(page.locator("#hero-heading")).toContainText("Your agents can run.");
  await expect(page.locator("noscript .notice")).toBeVisible();
  await expect(page.locator("noscript .notice")).toContainText("JavaScript is required for the interactive simulator.");
  expect(await page.locator('[data-dither="hero"] svg pattern').count()).toBeGreaterThan(0);
  await page.screenshot({ path: ".local/ui/no-javascript-mobile.png" }); await context.close();
});

test("Motion brief: WebGL unavailable retains composed dark-first SVG and semantics", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === "webgl" || type === "experimental-webgl") return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  const page = await context.newPage();
  await page.goto(new URL("/", testInfo.project.use.baseURL).href);
  await expect(page.locator("html")).toHaveClass(/dark/u);
  const shader = page.locator('[data-dither="hero"]');
  await expect(shader).toHaveAttribute("data-state", "fallback");
  await expect(shader.locator("[data-dither-fallback]")).toHaveCSS("opacity", "1");
  await expect(shader.locator("svg")).toBeVisible();
  await expect(page.getByText("Inside the boundary.", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".local/ui/webgl-unavailable-dark-mobile.png" });
  await context.close();
});
