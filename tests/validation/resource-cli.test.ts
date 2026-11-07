/** LOCAL CLI input tests, not actual payments/provider evidence. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join, basename } from "node:path";
import { test } from "node:test";

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 30000, maxBuffer: 1048576 });
}
test("P-17 CLI: missing fixture is ERROR/null with no delivery or acceptance claim", () => {
  const result = run("scripts/validation/validate-resource-output.ts", ["cli-no-fixture", "booking-db", "100", "missing"]);
  assert.equal(result.status, 2); const report = JSON.parse(result.stdout);
  assert.equal(report.status, "VALIDATION_ERROR"); assert.equal(report.artifact_hash, null);
  assert.equal(report.source, "LOCAL_FIXTURE_VALIDATOR");
});
test("T-08 CLI: traversal, extra arguments and malformed bindings refused before file use", () => {
  for (const args of [["../outside", "db", "100", "artifact"], ["id", "db", "1e10", "missing"], ["id", "db", "100", "missing", "pay"]]) {
    assert.equal(run("scripts/validation/validate-resource-output.ts", args).status, 3);
  }
  for (const args of [["../outside"], ["id", "--publish"], ["id", "--budget", "--budget"]]) {
    assert.equal(run("scripts/workflow/export-project-local.ts", args).status, 1);
  }
});
test("P-17 CLI: reads bounded fixture bytes and rejects oversized artifact", () => {
  const parent = join(process.cwd(), ".local", "projects"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "cli-resource-")), id = basename(directory), path = join(directory, "resource.json");
  try {
    writeFileSync(path, JSON.stringify({ fixture_version: 1, project_id: id, resource_key: "db", fixture_provider_id: "fixture",
      provisioning_status: "PROVISIONED", health_status: 200, https_fixture: true, route: "/health", health_body: "ok", observed_at_ns: "99" }));
    const pass = run("scripts/validation/validate-resource-output.ts", [id, "db", "100", "artifact"]);
    assert.equal(pass.status, 0); assert.equal(JSON.parse(pass.stdout).status, "VALIDATION_PASSED");
    writeFileSync(path, new Uint8Array(16385));
    assert.equal(run("scripts/validation/validate-resource-output.ts", [id, "db", "100", "artifact"]).status, 3);
  } finally { unlinkSync(path); rmdirSync(directory); }
});
test("P-19 CLI: refuses nonlocal claims and oversized input without exporting content", () => {
  const parent = join(process.cwd(), ".local", "projects"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "cli-report-")), id = basename(directory), path = join(directory, "canonical.json");
  try {
    writeFileSync(path, JSON.stringify({ source: "NEAR_TESTNET_OBSERVATION", private_prompt: "PRIVATE_CANARY" }));
    const result = run("scripts/workflow/export-project-local.ts", [id, "--budget", "--expenses", "--evidence"]);
    assert.equal(result.status, 1); assert(!result.stdout.includes("PRIVATE_CANARY"));
    writeFileSync(path, new Uint8Array(1048577));
    assert.equal(run("scripts/workflow/export-project-local.ts", [id]).status, 1);
  } finally { unlinkSync(path); rmdirSync(directory); }
});
