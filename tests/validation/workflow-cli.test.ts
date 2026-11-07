import assert from "node:assert/strict";
import { mkdir, writeFile, unlink, rmdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import { MAX_ARTIFACT_BYTES } from "../../src/lib/validation/research.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const script = "scripts/validation/validate-workflow-output.ts";
const hash = "12".repeat(32); // LOCAL binding fixture, not a chain policy.
function run(args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8",
    timeout: 15000, maxBuffer: 16384, env: { ...process.env, RUNLATCH_AGENT_PRIVATE_KEY: "CANARY_NOT_A_KEY" } });
  assert.equal(result.error, undefined);
  assert(!result.stdout.includes("CANARY_NOT_A_KEY"));
  return result;
}
async function withArtifact(bytes: Uint8Array, check: (id: string) => void) {
  const id = `cli-${randomUUID()}`;
  const parent = join(root, ".local", "workflows");
  await mkdir(parent, { recursive: true });
  const directory = join(parent, id);
  await mkdir(directory);
  const path = join(directory, "research.json");
  await writeFile(path, bytes);
  try { check(id); } finally { await unlink(path); await rmdir(directory); }
}
test("V-07/V-08: produced valid fixture is validated without credentials/signing", async () => {
  await withArtifact(await readFile(new URL("../../fixtures/research/valid-demo.json", import.meta.url)), id => {
    const result = run([id, hash, "artifact"]);
    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.capsule_id, id);
    assert.equal(payload.expected_policy_hash, hash);
    assert.equal(payload.report.status, "VALIDATION_PASSED");
    assert.equal(payload.report.metrics.record_count, 20);
    assert.equal(payload.requires_owner_signature, true);
    assert.equal(payload.attestation, "UNATTESTED");
    assert.equal(payload.grants_payment_authority, false);
  });
});
test("R-08: incomplete paid-output fixture remains failed validation", async () => {
  await withArtifact(await readFile(new URL("../../fixtures/research/invalid-demo.json", import.meta.url)), id => {
    const result = run([id, hash, "artifact"]);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.report.status, "VALIDATION_FAILED");
    assert(payload.report.reason_codes.includes("TOO_FEW_SOURCES"));
    assert(!("refund" in payload));
  });
});
test("V-10: explicit missing output is ERROR/null, not a pretend service result", () => {
  const result = run([`missing-${randomUUID()}`, hash, "missing"]);
  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.report.status, "VALIDATION_ERROR");
  assert.equal(payload.report.artifact_hash, null);
  assert.equal(payload.report.artifact_bytes, null);
});
test("T-08: path traversal/bad bindings/unknown mode fail before input reads", () => {
  for (const args of [["../../private", hash, "artifact"], ["run", "bad", "artifact"], ["run", hash, "execute"], []]) {
    const result = run(args);
    assert.equal(result.status, 3);
    assert.equal(JSON.parse(result.stdout).code, "INVALID_WORKFLOW_VALIDATION_BINDING");
  }
});
test("V-04/T-08: oversized workflow artifact is refused without content hash", async () => {
  await withArtifact(new Uint8Array(MAX_ARTIFACT_BYTES + 1), id => {
    const result = run([id, hash, "artifact"]);
    assert.equal(result.status, 3);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.code, "WORKFLOW_ARTIFACT_SIZE_LIMIT");
    assert(!("report" in payload));
  });
});
