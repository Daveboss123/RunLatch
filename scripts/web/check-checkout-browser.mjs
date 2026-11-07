/** Complete browser/status verification in a preserved local clone, without rerunning Sandbox. */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

if (process.argv.length !== 3) throw new Error("Specify the existing local clone directory");
const checkout = path.resolve(process.argv[2]);
const evidence = path.resolve(".local/release-hardening");
await mkdir(evidence, { recursive: true });
const results = [];
function run(label, executable, args) {
  const result = spawnSync(executable, args, { cwd: checkout, encoding: "utf8", timeout: 300_000, maxBuffer: 2_000_000 });
  results.push({ command: label, exit: result.status, error: result.error?.message ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
  if (result.status !== 0) throw new Error(`FOLLOWUP_FAILED:${label}`);
  return result.stdout;
}
let server, testedCommit, error = null;
try {
  testedCommit = run("existing clone commit", "git", ["rev-parse", "HEAD"]).trim();
  if (run("existing clone status before browser", "git", ["status", "--porcelain"]).trim()) throw new Error("CLONE_HAS_TRACKED_CHANGES");
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("LOOPBACK_PORT_UNAVAILABLE");
  const port = address.port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  await mkdir(path.join(checkout, ".local/release-hardening"), { recursive: true });
  await writeFile(path.join(checkout, ".local/release-hardening/followup-playwright.config.mjs"), `import original from '../../playwright.config.ts';\nexport default {...original,testDir:'../../tests/frontend/browser',use:{...original.use,baseURL:'http://127.0.0.1:${port}'}};\n`);
  server = spawn(process.execPath, [path.join(checkout, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: checkout, stdio: "ignore", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  let ready = false;
  const deadline = Date.now() + 30_000;
  while (!ready && Date.now() < deadline) {
    try { ready = (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).ok; }
    catch { /* Startup only; not a success mapping. */ }
    if (!ready) await setTimeout(100);
  }
  if (!ready) throw new Error("FOLLOWUP_SERVER_NOT_READY");
  run("existing clone browser tests", process.execPath, [path.join(checkout, "node_modules/@playwright/test/cli.js"), "test", "--config", ".local/release-hardening/followup-playwright.config.mjs"]);
  if (run("existing clone status after browser", "git", ["status", "--porcelain"]).trim()) throw new Error("BROWSER_CHANGED_TRACKED_SOURCE");
} catch (caught) { error = caught.message; process.exitCode = 1; }
finally {
  server?.kill();
  await writeFile(path.join(evidence, "checkout-browser-followup.json"), JSON.stringify({ label: "Browser/status follow-up in an existing preserved clone; no install or Sandbox rerun", checkout, testedCommit, error, results }, null, 2));
  console.log(JSON.stringify({ testedCommit, error, steps: results.map(result => ({ command: result.command, exit: result.exit, outputTail: result.stdout.slice(-300) })) }, null, 2));
}
