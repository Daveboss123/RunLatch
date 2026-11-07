import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { prepareValidationAttestation, MAX_ATTESTATION_REPORT_BYTES } from "../../src/lib/validation/attestation.ts";
import { researchCriteriaHash, validateResearchArtifact } from "../../src/lib/validation/research.ts";

const policyHash = "12".repeat(32); // LOCAL binding fixture, not a chain policy.
const artifact = readFileSync(new URL("../../fixtures/research/valid-demo.json", import.meta.url));
const prepare = async (serialized: string) => prepareValidationAttestation(serialized, "capsule-fixture", policyHash, await researchCriteriaHash());

test("V-06/R-07: matching PASS report produces exact unsubmitted owner-review payload", async () => {
  const report = await validateResearchArtifact(artifact);
  const prepared = await prepare(JSON.stringify(report));
  assert.equal(prepared.capsule_id, "capsule-fixture");
  assert.equal(prepared.expected_policy_hash, policyHash);
  assert.equal(prepared.report.evidence_hash, report.evidence_hash);
  assert.equal(prepared.report.artifact_hash, report.artifact_hash);
  assert.equal(prepared.report.status, "VALIDATION_PASSED");
  assert.equal(prepared.attestation, "UNATTESTED");
  assert.equal(prepared.requires_owner_signature, true);
  assert.equal(prepared.grants_payment_authority, false);
  assert.deepEqual(prepared.report.reason_codes, []);
});
test("R-08: failed validation is not a payment reversal instruction", async () => {
  const report = await validateResearchArtifact(new TextEncoder().encode('{"topic":"demo","sources":[]}'));
  const prepared = await prepare(JSON.stringify(report));
  assert.equal(prepared.report.status, "VALIDATION_FAILED");
  assert.deepEqual(prepared.report.reason_codes, ["TOO_FEW_SOURCES"]);
  for (const forbidden of ["recipient_id", "price", "settled", "refund", "owner_id"]) assert(!(forbidden in prepared.report));
});
test("V-10: unavailable artifact remains ERROR/null, never fabricated evidence", async () => {
  const report = await validateResearchArtifact(null);
  const prepared = await prepare(JSON.stringify(report));
  assert.equal(prepared.report.status, "VALIDATION_ERROR");
  assert.equal(prepared.report.artifact_hash, null);
  assert.equal(prepared.report.artifact_bytes, null);
  assert.deepEqual(prepared.report.reason_codes, ["ARTIFACT_UNAVAILABLE"]);
});
for (const id of ["", "a:b", "x".repeat(65), "<script>"]) {
  test(`V-06: invalid capsule binding ${JSON.stringify(id)} rejected`, async () => {
    await assert.rejects(prepareValidationAttestation("{}", id, policyHash, policyHash), /INVALID_CAPSULE_ID/u);
  });
}
test("V-06: wrong criteria binding and malformed policy hash rejected", async () => {
  const report = JSON.stringify(await validateResearchArtifact(artifact));
  await assert.rejects(prepareValidationAttestation(report, "capsule", policyHash, "34".repeat(32)), /REPORT_CRITERIA_MISMATCH/u);
  await assert.rejects(prepareValidationAttestation(report, "capsule", "not-a-hash", policyHash), /INVALID_ATTESTATION_BINDING/u);
});
test("V-05: tampered report or fake attestation cannot become signing payload", async () => {
  const report = await validateResearchArtifact(artifact);
  await assert.rejects(prepare(JSON.stringify({ ...report, evidence_hash: "00".repeat(32) })), /INVALID_REPORT_INTEGRITY/u);
  await assert.rejects(prepare(JSON.stringify({ ...report, attestation: "OWNER_ATTESTED" })), /INVALID_REPORT_INTEGRITY/u);
});
test("T-08: malformed/oversized serialized input rejected without echoing contents", async () => {
  await assert.rejects(prepare("<script>private-like fixture</script>"), { message: "INVALID_REPORT_JSON" });
  await assert.rejects(prepare(" ".repeat(MAX_ATTESTATION_REPORT_BYTES + 1)), { message: "REPORT_SIZE_LIMIT" });
  await assert.rejects(prepare("😀".repeat(MAX_ATTESTATION_REPORT_BYTES / 3)), { message: "REPORT_SIZE_LIMIT" });
});
test("V-06: summary and nested arrays/metrics are immutable snapshots", async () => {
  const report = await validateResearchArtifact(artifact);
  const prepared = await prepare(JSON.stringify(report));
  assert.equal(Reflect.set(prepared, "capsule_id", "other"), false);
  assert.equal(prepared.capsule_id, "capsule-fixture");
  assert(Object.isFrozen(prepared.report));
  assert(Object.isFrozen(prepared.report.metrics));
  assert(Object.isFrozen(prepared.report.reason_codes));
});
