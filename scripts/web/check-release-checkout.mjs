/** Reproduce the committed local tree, not an allowlisted source copy. */
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { setTimeout } from "node:timers/promises";

if (process.platform !== "win32") throw new Error("This runner documents the approved Windows/Ubuntu host; use README commands on other hosts");
const source = process.cwd();
const checkout = await mkdtemp(path.join(os.homedir(), "AppData/Local/Temp/opencode/runlatch-git-checkout-"));
const evidence = path.join(source, ".local/release-hardening");
await mkdir(evidence, { recursive: true });
const results = [];
function run(label, command, args, timeout = 300_000) {
  const result = spawnSync(command, args, { cwd: checkout, encoding: "utf8", timeout, maxBuffer: 4_000_000 });
  const record = { command: label, exit: result.status, error: result.error?.message ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  results.push(record);
  console.log(`${label}: exit ${result.status}`);
  if (result.status !== 0) throw new Error(`CHECKOUT_STEP_FAILED:${label}`);
  return record.stdout;
}
const npm = command => run(`npm.cmd ${command}`, "cmd.exe", ["/d", "/s", "/c", `npm.cmd ${command}`]);
let server;
let testedCommit, trackedFiles, finalStatus, error = null;
try {
  run("local git clone --no-hardlinks", "git", ["clone", "--no-hardlinks", "--quiet", source, checkout]);
  testedCommit = run("git rev-parse HEAD", "git", ["rev-parse", "HEAD"]).trim();
  trackedFiles = run("git ls-files -z", "git", ["ls-files", "-z"]).split("\0").filter(Boolean).length;
  run("remove clone's local origin (not source remotes)", "git", ["remote", "remove", "origin"]);
  for (const folder of [".local", ".tools", "node_modules", ".next", ".env", ".near-credentials"]) {
    try { await access(path.join(checkout, folder)); throw new Error(`PRIVATE_OR_GENERATED_SOURCE_COPIED:${folder}`); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  for (const file of ["package-lock.json", "contracts/runlatch/Cargo.lock", "scripts/sandbox/Cargo.lock"]) {
    if (!(await readFile(path.join(checkout, file))).equals(await readFile(path.join(source, file)))) throw new Error("SOURCE_LOCK_DIFFERS_FROM_COMMIT");
  }
  npm("ci --no-fund");
  npm("run typecheck");
  npm("run lint");
  npm("test");
  npm("run test:frontend");
  npm("run test:preview-parity");
  npm("run build");
  npm("audit --json");
  run("source/privacy candidate scan in clone", process.execPath, ["scripts/web/check-release-source.mjs"]);
  const linuxRoot = checkout.replace(/^([A-Z]):/u, (_, drive) => `/mnt/${drive.toLowerCase()}`).replaceAll("\\", "/");
  const wsl = (script, args = [], timeout = 300_000) => run(`LOCAL Ubuntu: ${script} ${args.join(" ")}`.trim(), "wsl.exe", ["--distribution", "Ubuntu-24.04", "--user", "runlatch", "--exec", "sh", `${linuxRoot}/${script}`, ...args], timeout);
  wsl("scripts/setup/test-contract-linux.sh");
  // Shared reviewed host tool/registry/target caches are reused. This is not a
  // fresh OS/toolchain installation or a new public-network deployment.
  wsl("scripts/setup/build-sandbox-artifacts-linux.sh", [], 600_000);
  npm("run prepare:sandbox-reports");
  wsl("scripts/setup/test-sandbox-linux.sh", ["all"], 600_000);
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("LOOPBACK_PORT_UNAVAILABLE");
  const port = address.port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  await mkdir(path.join(checkout, ".local/release-hardening"), { recursive: true });
  await writeFile(path.join(checkout, ".local/release-hardening/checkout-playwright.config.mjs"), `import original from '../../playwright.config.ts';\nexport default {...original, testDir: '../../tests/frontend/browser', use: {...original.use, baseURL: 'http://127.0.0.1:${port}'}};\n`);
  const fd = openSync(path.join(evidence, "checkout-server.log"), "w");
  server = spawn(process.execPath, [path.join(checkout, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: checkout, stdio: ["ignore", fd, fd], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
  closeSync(fd);
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    try { ready = (await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) })).ok; }
    catch { /* Server startup only; failure below is not mapped to success. */ }
    if (!ready) await setTimeout(100);
  }
  if (!ready) throw new Error("CHECKOUT_SERVER_NOT_READY");
  npm("run test:browser -- --config .local/release-hardening/checkout-playwright.config.mjs");
  finalStatus = run("git status --porcelain after reproduction", "git", ["status", "--porcelain"]);
  if (finalStatus.trim()) throw new Error("REPRODUCTION_CHANGED_TRACKED_SOURCE");
} catch (caught) { error = caught.message; process.exitCode = 1; }
finally {
  server?.kill();
  const result = { label: "Actual local Git clone and fresh npm install/build/tests; approved Ubuntu with shared tool/registry/target caches, not a virgin environment or public testnet", checkout, testedCommit, trackedFiles, finalStatus, error, results };
  await writeFile(path.join(evidence, "clean-checkout.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ checkout, testedCommit, trackedFiles, commands: results.length, error }, null, 2));
}
