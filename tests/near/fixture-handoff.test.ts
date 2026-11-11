import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureWorkflow } from "../../src/lib/near/fixture-workflow.ts";
import { fixtureWorkflowRehearsal } from "./helpers/fixture-workflow.ts";

test("registered public DB provider terms work without replacing the canonical quote or fixture trust", async () => {
  const r = await fixtureWorkflowRehearsal("PROVISIONED", "SETTLED", "db_demo_1108");
  const value = await r.workflow.reviewProvisioning();
  assert.equal(value.payment.final_record?.canonical_quote?.input.provider_id, "db_demo_1108");
  assert.equal(value.review.action.method, "record_provisioning");
  assert.equal(value.fixture_trust_class, "DEMO_FIXTURE");
});

test("exact artifact can be exported and restored after coordinator restart; altered bytes cannot advance", async () => {
  const r = await fixtureWorkflowRehearsal(), prepared = await r.workflow.reviewProvisioning();
  if (prepared.review.action.method !== "record_provisioning") throw Error("EXPECTED_PROVISIONING");
  r.recordProvisioning(prepared.review.action.args.evidence);
  const bytes = r.workflow.artifactCopy(); assert.ok(bytes);
  const restored = createFixtureWorkflow(r.config, r.reader), value = await restored.restoreArtifact(bytes);
  assert.equal(value.fixture_check.artifact_hash, prepared.fixture_check.artifact_hash);
  assert.equal((await restored.reviewTaskCheck()).review.action.method, "record_task_check");
  const bad = new Uint8Array(bytes); bad[bad.length - 2] ^= 1;
  await assert.rejects(createFixtureWorkflow(r.config, r.reader).restoreArtifact(bad), /RESTORE_HASH/u);
  assert.equal(r.workflow.artifactCopy()![0], bytes[0]);
});

test("missing-artifact restoration is explicit and cannot become a passing check or acceptance", async () => {
  const r = await fixtureWorkflowRehearsal("MISSING"), prepared = await r.workflow.reviewProvisioning();
  if (prepared.review.action.method !== "record_provisioning") throw Error("EXPECTED_PROVISIONING");
  r.recordProvisioning(prepared.review.action.args.evidence);
  const restored = createFixtureWorkflow(r.config, r.reader), value = await restored.restoreArtifact(null);
  assert.equal(value.fixture_check.status, "VALIDATION_ERROR"); assert.equal(restored.artifactCopy(), null);
  await assert.rejects(restored.reviewAcceptance("ACCEPTED"), /TASK_CHECK_NOT_RECORDED/u);
});

test("unresolved payment still stops before fixture generation, restoration or owner review", async () => {
  const r = await fixtureWorkflowRehearsal("PROVISIONED", "SETTLEMENT_PENDING");
  await assert.rejects(r.workflow.reviewProvisioning(), /PAYMENT_NOT_SETTLED/u);
  await assert.rejects(r.workflow.restoreArtifact(null), /PAYMENT_NOT_SETTLED/u);
  assert.throws(() => r.workflow.artifactCopy(), /NOT_PREPARED/u);
});
