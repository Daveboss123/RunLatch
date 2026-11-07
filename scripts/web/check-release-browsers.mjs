/** Read-only local checks in installed branded browsers; never submits/signs. */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import assert from "node:assert/strict";

const results = [];
await mkdir(".local/release-hardening", { recursive: true });
for (const channel of ["msedge", "chrome"]) {
  const profile = await mkdtemp(path.resolve(`.local/release-hardening/${channel}-isolated-profile-`));
  const executable = channel === "msedge" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  // Own empty profile only, loopback CDP, normal browser security. Connecting
  // with noDefaults avoids Playwright's per-session always-focused override.
  const process = spawn(executable, [`--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  let browser;
  try {
    let port;
    const deadline = Date.now() + 15_000;
    while (!port && Date.now() < deadline) {
      try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; }
      catch (error) { if (error.code !== "ENOENT") throw error; await setTimeout(100); }
    }
    if (!port) throw new Error("ISOLATED_BROWSER_START_TIMEOUT");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    const context = browser.contexts()[0];
    assert.ok(context);
    const page = await context.newPage();
    await page.setViewportSize({ width: 1364, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const errors = [], external = [], browserInternal = [];
    page.on("pageerror", error => errors.push(error.message));
    context.on("request", request => {
      const url = new URL(request.url());
      if (["http:", "https:"].includes(url.protocol)) {
        if (url.origin !== "http://127.0.0.1:3000") external.push(request.url());
      } else browserInternal.push(request.url());
    });
    const cover = await context.newPage();
    await page.bringToFront();
    await page.goto("http://127.0.0.1:3000/");
    const hero = page.locator('[data-dither="hero"]');
    await hero.waitFor();
    await page.waitForFunction(() => document.visibilityState === "visible" && document.querySelector('[data-dither="hero"]')?.getAttribute("data-state") === "running");
    const visibilityEvents = [];
    async function hideAndRestore(selector) {
      await cover.bringToFront();
      visibilityEvents.push(await page.evaluate(selector => ({ visibility: document.visibilityState, state: document.querySelector(selector)?.getAttribute("data-state") }), selector));
      await page.waitForFunction(selector => document.visibilityState === "hidden" && document.querySelector(selector)?.getAttribute("data-state") === "paused", selector, { timeout: 10_000 });
      const hidden = await page.evaluate(selector => ({ visibility: document.visibilityState, state: document.querySelector(selector)?.getAttribute("data-state") }), selector);
      await page.bringToFront();
      await page.waitForFunction(selector => document.visibilityState === "visible" && document.querySelector(selector)?.getAttribute("data-state") === "running", selector);
      return { hidden, restored: await page.evaluate(selector => ({ visibility: document.visibilityState, state: document.querySelector(selector)?.getAttribute("data-state") }), selector) };
    }
    let heroVisibility, stripVisibility;
    try { heroVisibility = await hideAndRestore('[data-dither="hero"]'); }
    catch (error) { heroVisibility = { unverified: error.message, observations: [...visibilityEvents] }; await page.bringToFront(); }
    await page.locator(".build-strip").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector(".build-strip")?.getAttribute("data-state") === "running");
    try { stripVisibility = await hideAndRestore(".build-strip"); }
    catch (error) { stripVisibility = { unverified: error.message, observations: [...visibilityEvents] }; await page.bringToFront(); }
    await mkdir(".local/release-hardening", { recursive: true });
    await writeFile(`.local/release-hardening/${channel}-visibility.json`, JSON.stringify({ channel, version: browser.version(), heroVisibility, stripVisibility }, null, 2));
    assert.equal(heroVisibility.hidden?.visibility, "hidden", "Actual hero hidden state required");
    assert.equal(stripVisibility.hidden?.visibility, "hidden", "Actual strip hidden state required");
    const routes = [];
    for (const route of ["/", "/gate", "/demo", "/docs"]) {
      await page.goto(`http://127.0.0.1:3000${route}`);
      await page.locator("h1").waitFor();
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `${channel}:${route}:overflow`);
      assert.equal(axe.violations.length, 0, `${channel}:${route}:axe`);
      routes.push({ route, axeViolations: axe.violations.length, overflow });
    }
    // Keyboard injection uses an isolated automated context. This is separate
    // from the genuine noDefaults visibility evidence, and is not manual AT.
    const automatedContext = await browser.newContext({ viewport: { width: 1364, height: 900 } });
    const keyboardPage = await automatedContext.newPage();
    await keyboardPage.goto("http://127.0.0.1:3000/");
    await keyboardPage.locator('[data-dither="hero"]').waitFor();
    await keyboardPage.keyboard.press("Tab");
    assert.equal(await keyboardPage.getByRole("link", { name: "Skip to content" }).evaluate(node => node === document.activeElement), true);
    await keyboardPage.keyboard.press("Enter");
    await keyboardPage.waitForFunction(() => location.hash === "#main");
    // A non-focusable main changes the browser's sequential navigation start,
    // not necessarily document.activeElement. Test actual next-Tab behaviour.
    await keyboardPage.keyboard.press("Tab");
    assert.equal(await keyboardPage.evaluate(() => !!document.activeElement?.closest("main")), true);
    await keyboardPage.emulateMedia({ reducedMotion: "reduce" });
    await keyboardPage.waitForFunction(() => ["paused", "static"].includes(document.querySelector('[data-dither="hero"]')?.getAttribute("data-state") ?? ""));
    assert.equal(await keyboardPage.locator(".build-strip").getAttribute("data-state"), "static");
    await writeFile(`.local/release-hardening/${channel}-channel-diagnostic.json`, JSON.stringify({ errors, external, browserInternal, routes }, null, 2));
    assert.equal(errors.length, 0);
    assert.equal(external.length, 0);
    results.push({ channel, version: browser.version(), heroVisibility, stripVisibility, routes, keyboardSkip: "PASS (automated context)", reducedMotion: "PASS", errors, externalHttpRequests: external, browserInternalRequests: browserInternal });
    await automatedContext.close();
  } finally {
    if (browser) {
      const session = await browser.newBrowserCDPSession();
      await session.send("Browser.close").catch(() => undefined);
      await browser.close();
    }
    process.kill();
  }
}
await mkdir(".local/release-hardening", { recursive: true });
await writeFile(".local/release-hardening/branded-browsers.json", JSON.stringify({ label: "Installed Windows headed Chromium channels; real Page Visibility API, automated keyboard/axe, not Safari, physical mobile or screen-reader evidence", results }, null, 2));
console.log(JSON.stringify(results, null, 2));
