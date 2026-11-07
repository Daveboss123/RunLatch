import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { evaluateGate } from "../../src/lib/preview/gate.ts";
import { parityContext } from "../../src/lib/preview/parity.ts";

const root = process.cwd();
const script = process.platform === "win32" ? root.replace(/^([A-Z]):/u, (_, drive: string) => `/mnt/${drive.toLowerCase()}`).replaceAll("\\", "/") + "/scripts/web/check-preview-parity-linux.sh" : root + "/scripts/web/check-preview-parity-linux.sh";
const command = process.platform === "win32" ? "wsl" : "sh";
const args = process.platform === "win32" ? ["--distribution", "Ubuntu-24.04", "--user", "runlatch", "--exec", "sh", script] : [script];
const { stdout, stderr } = await promisify(execFile)(command, args, { timeout: 60_000, maxBuffer: 128 * 1024 });
if (stderr.trim()) throw new Error(stderr);
const rust: { id: string; decision: string; reasons: string[]; checks: unknown[] }[] = JSON.parse(stdout);
const fixtures: { id: string; decision: string; reasons: string[] }[] = JSON.parse(await readFile("fixtures/preview/gate-cases.json", "utf8"));
assert.deepEqual(rust.map(({ id, decision, reasons }) => ({ id, decision, reasons })), fixtures);
for (const record of rust) {
  const preview = evaluateGate(parityContext(record.id));
  assert.deepEqual({ decision: preview.decision, reasons: preview.reasons, checks: preview.checks }, { decision: record.decision, reasons: record.reasons, checks: record.checks });
  assert.equal(preview.grants_payment_authority, false);
}
console.log(`PASS: ${rust.length} actual Rust Gate / TypeScript preview vectors, all29 check states and ordered reasons match. LOCAL logic, not Sandbox/payment evidence.`);
