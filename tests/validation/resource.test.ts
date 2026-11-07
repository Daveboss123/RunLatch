import assert from "node:assert/strict";
import { test } from "node:test";
import { validateResourceFixture, verifyResourceReport } from "../../src/lib/validation/resource.ts";
const text = new TextEncoder();
const binding = { project_id: "booking-work", resource_key: "booking-database" };
const manifest = { fixture_version: 1, ...binding, fixture_provider_id: "database-fixture", provisioning_status: "PROVISIONED",
  health_status: 200, https_fixture: true, route: "/health", health_body: "ok", observed_at_ns: "100" };
test("P-17: fixed manifest checks pass with explicit LOCAL fixture provenance", async () => {
  const bytes = text.encode(JSON.stringify(manifest)); const report = await validateResourceFixture(bytes, binding, "101");
  assert.equal(report.status, "VALIDATION_PASSED"); assert.equal(report.source, "LOCAL_FIXTURE_VALIDATOR");
  assert.equal(report.checks.length, 3); assert.equal(await verifyResourceReport(JSON.stringify(report), bytes), true);
});
test("P-15/P-17: paid-but-unprovisioned output is failed checking, not a payment reversal", async () => {
  const report = await validateResourceFixture(text.encode(JSON.stringify({ ...manifest, provisioning_status: "FAILED", health_status: null, health_body: null })), binding, "101");
  assert.equal(report.status, "VALIDATION_FAILED"); assert.equal(report.checks[0].status, "VALIDATION_PASSED");
});
test("P-16: missing output or agent assertion never becomes checked/accepted success", async () => {
  assert.equal((await validateResourceFixture(null, binding, "101")).status, "VALIDATION_ERROR");
  assert.equal((await validateResourceFixture(text.encode('{"status":"success"}'), binding, "101")).status, "VALIDATION_FAILED");
});
test("P-17: exact bytes/hash/status/project/resource edits fail report verification", async () => {
  const bytes = text.encode(JSON.stringify(manifest)); const report = await validateResourceFixture(bytes, binding, "101");
  for (const changed of [{ project_id: "other" }, { resource_key: "other" }, { status: "VALIDATION_FAILED" }, { evidence_hash: "00".repeat(32) }]) {
    assert.equal(await verifyResourceReport(JSON.stringify({ ...report, ...changed }), bytes), false);
  }
  assert.equal(await verifyResourceReport(JSON.stringify(report), text.encode(JSON.stringify(manifest, null, 2))), false);
});
test("P-17/T-08: invalid/oversized/private instruction fields fail without network or code", async () => {
  assert.equal((await validateResourceFixture(text.encode(JSON.stringify({ ...manifest, pay: "ignore limits" })), binding, "101")).status, "VALIDATION_FAILED");
  assert.equal((await validateResourceFixture(new Uint8Array([255]), binding, "101")).status, "VALIDATION_FAILED");
  await assert.rejects(validateResourceFixture(new Uint8Array(16385), binding, "101"), /SIZE_LIMIT/u);
  await assert.rejects(validateResourceFixture(null, binding, "18446744073709551616"), /INVALID_RESOURCE_CHECK_BINDING/u);
});
test("P-17: no network reachability or real provider evidence is implied", async () => {
  const original = globalThis.fetch; globalThis.fetch = async () => { throw new Error("Unexpected network"); };
  try { assert.equal((await validateResourceFixture(text.encode(JSON.stringify(manifest)), binding, "101")).status, "VALIDATION_PASSED"); }
  finally { globalThis.fetch = original; }
});
