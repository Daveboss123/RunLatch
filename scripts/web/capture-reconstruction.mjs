// Loopback-only production visual evidence. No signing, external data or credentials.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";

const output = ".local/ui/reconstruction";
const measureOnly = process.argv.includes("--measure-only");
const sections = ["board", "problem", "simulator", "commitment", "lifecycle", "receipts", "intelligence", "proof", "architecture", "questions"];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const settle = async page => page.waitForFunction(() => document.getAnimations().every(animation => animation.effect?.getTiming().iterations === Infinity || animation.playState !== "running"));
try {
  for (const width of measureOnly ? [1440] : [1440, 1280, 768, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, ...(!measureOnly && (width === 1440 || width === 390) ? { recordVideo: { dir: output, size: { width, height: width < 700 ? 844 : 1000 } } } : {}) });
    const page = await context.newPage();
    const errors = [], external = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:3000") && !request.url().startsWith("blob:")) external.push(request.url()); });
    await page.addInitScript(() => {
      window.__visualMeasurement = { draws: 0, cls: 0, lcp: 0, longTasks: [] };
      const original = WebGLRenderingContext.prototype.drawArrays;
      WebGLRenderingContext.prototype.drawArrays = function (...args) { window.__visualMeasurement.draws++; return original.apply(this, args); };
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__visualMeasurement.cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__visualMeasurement.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__visualMeasurement.longTasks.push(entry.duration); }).observe({ type: "longtask", buffered: true });
    });
    await page.goto("http://127.0.0.1:3000/");
    await page.waitForFunction(() => document.querySelector("[data-dither=hero]")?.dataset.state === "running");
    await page.evaluate(() => document.fonts.ready);
    const sample = await page.evaluate(async () => {
      window.scrollTo({ top: 0, behavior: "instant" });
      const start = performance.now(), before = window.__visualMeasurement.draws;
      await new Promise(resolve => { const frame = () => performance.now() - start >= 2000 ? resolve() : requestAnimationFrame(frame); requestAnimationFrame(frame); });
      return { ...window.__visualMeasurement, duration: performance.now() - start, sampleDraws: window.__visualMeasurement.draws - before, canvas: [...document.querySelectorAll("canvas")].map(canvas => ({ width: canvas.width, height: canvas.height })), resourceBytes: performance.getEntriesByType("resource").reduce((total, entry) => total + entry.transferSize, 0) };
    });
    if (measureOnly) {
      const measurement = { label: "Isolated headless loopback production sample; WebGL submissions, not GPU execution", width, sample, errors, external };
      await writeFile(`${output}/isolated-performance.json`, JSON.stringify(measurement, null, 2));
      console.log(JSON.stringify(measurement, null, 2));
      await context.close();
      continue;
    }
    await settle(page);
    await page.screenshot({ path: `${output}/hero-dark-${width}.png` });
    const boundaries = [];
    for (const id of sections) {
      await page.locator(`#${id}`).evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
      await settle(page);
      await page.screenshot({ path: `${output}/${id}-dark-${width}.png` });
      boundaries.push(await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, y: scrollY, header: document.querySelector("header").dataset.compact, theme: "dark" })));
    }
    await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => document.querySelector("[data-dither=hero]")?.dataset.state === "running");
    await settle(page);
    await page.screenshot({ path: `${output}/hero-light-${width}.png` });
    for (const id of sections) {
      await page.locator(`#${id}`).evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
      await settle(page);
      await page.screenshot({ path: `${output}/${id}-light-${width}.png` });
      boundaries.push(await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, y: scrollY, header: document.querySelector("header").dataset.compact })));
    }
    if (width > 900) {
      for (let index = 0; index < 5; index++) {
        await page.locator(`[data-step="${index}"]`).evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
        await page.waitForFunction(value => document.querySelector(".story-visual").dataset.activeStep === String(value), index);
        await settle(page);
        await page.screenshot({ path: `${output}/story-step-${index + 1}-${width}.png` });
      }
    } else await page.locator(".problem-story").screenshot({ path: `${output}/story-sequence-${width}.png` });
    await page.locator("#commitment").getByRole("button", { name: "12-month quote", exact: true }).click();
    await page.locator("#commitment").screenshot({ path: `${output}/commitment-term-${width}.png` });
    await page.locator("#commitment").getByLabel("Hypothetical allocation", { exact: true }).selectOption("4");
    await page.locator("#commitment").screenshot({ path: `${output}/commitment-review-${width}.png` });
    await page.getByRole("button", { name: "Hidden term", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".reason-codes")?.textContent.includes("INSUFFICIENT_COMMITMENT_BUDGET"));
    await page.locator(".simulator-workbench").screenshot({ path: `${output}/gate-denied-${width}.png` });
    await page.getByLabel("Hypothetical capsule allocation").fill("4");
    await page.waitForFunction(() => document.querySelector(".decision-announcement")?.textContent.includes("The owner decides."));
    await page.locator(".simulator-workbench").screenshot({ path: `${output}/gate-review-${width}.png` });
    await page.locator(".receipt-example").getByRole("button", { name: "Payment", exact: true }).click();
    await page.locator(".receipt-paper").screenshot({ path: `${output}/receipt-payment-${width}.png` });
    await page.locator("footer").evaluate(node => node.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.screenshot({ path: `${output}/footer-light-${width}.png` });
    await page.getByRole("button", { name: "Switch to dark theme", exact: true }).click();
    await settle(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => document.querySelector("[data-dither=hero]")?.dataset.state === "running");
    await settle(page);
    await page.screenshot({ path: `${output}/hero-dark-${width}.png` });
    await page.locator("#commitment").screenshot({ path: `${output}/commitment-dark-${width}.png` });
    await page.locator(".receipt-paper").screenshot({ path: `${output}/receipt-dark-${width}.png` });
    let accessibility = null;
    if (width === 1440 || width === 390) {
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
      accessibility = { violations: axe.violations, incomplete: axe.incomplete.map(item => ({ id: item.id, nodes: item.nodes.length })) };
      await writeFile(`${output}/axe-dark-${width}.json`, JSON.stringify(accessibility, null, 2));
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => document.querySelector("[data-dither=hero]")?.dataset.state === "static");
    await page.screenshot({ path: `${output}/hero-reduced-${width}.png` });
    const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, runningAnimations: document.getAnimations().filter(animation => animation.playState === "running").length, shader: document.querySelector("[data-dither=hero]").dataset.state, storage: localStorage.length + sessionStorage.length }));
    const video = page.video();
    await context.close();
    results.push({ width, sample, boundaries, state, errors, external, accessibilityViolations: accessibility?.violations.length ?? null, video: video ? await video.path() : null });
  }
  if (!measureOnly) await writeFile(`${output}/visual-qa.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map(item => ({ width: item.width, errors: item.errors, externalRequests: item.external.length, overflow: item.state.overflow || item.boundaries.some(boundary => boundary.overflow), accessibilityViolations: item.accessibilityViolations, reducedMotion: item.state, video: item.video })), null, 2));
  if (results.some(item => item.errors.length || item.external.length || item.state.overflow || item.boundaries.some(boundary => boundary.overflow) || item.accessibilityViolations > 0)) process.exitCode = 1;
} finally { await browser.close(); }
