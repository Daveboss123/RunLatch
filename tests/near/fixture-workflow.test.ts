/** Connected slice with synthetic RPC records only. Test mutations are NOT contract execution. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureWorkflow } from "../../scripts/near/fixture-workflow.ts";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { object } from "../../src/lib/near/records.ts";
import { fixtureWorkflowRehearsal as run } from "./helpers/fixture-workflow.ts";
import { target } from "../frontend/helpers/testnet-evidence.ts";
const full = { budget: true, expenses: true, evidence: true };

test("connected fixture -> exact unsigned provisioning/check/acceptance -> selected receipt/report", async () => {
  const r = await run(), before = JSON.stringify(r.snapshot);
  const first = await r.workflow.reviewProvisioning();
  assert.equal(first.payment.payment_evidence, "SETTLED");
  assert.equal(first.payment.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE");
  assert.equal(first.review.action.method, "record_provisioning");
  assert.equal(first.fixture_check.status, "VALIDATION_PASSED"); assert.equal(first.fixture_invocations, 1);
  assert.equal(JSON.stringify(r.snapshot), before); // Coordinator does not apply even one owner action.
  assert.equal(first.review.signing_enabled, false); assert.equal(first.grants_payment_authority, false);
  if (first.review.action.method !== "record_provisioning") throw new Error("TEST_ACTION_MISMATCH");
  r.recordProvisioning(first.review.action.args.evidence);
  const checked = await r.workflow.reviewTaskCheck();
  assert.equal(checked.review.local_fixture_artifact_verified, true);
  assert.equal(checked.review.action.method, "record_task_check");
  r.recordCheck(first.fixture_check);
  const unaccepted = await r.workflow.readReceipt(full);
  assert.equal(unaccepted.receipt?.evidence?.human_acceptance, null);
  const accepted = await r.workflow.reviewAcceptance("ACCEPTED");
  assert.equal(accepted.review.action.method, "record_human_acceptance");
  assert.equal(r.snapshot.human_acceptance, null); // Choice is review content, never execution/consent.
  r.recordAcceptance("ACCEPTED");
  const outcome = await r.workflow.readReceipt(full);
  assert.equal(outcome.receipt?.settlement, "SETTLED"); assert.equal(outcome.receipt?.amount_due_now, "50");
  assert.equal(outcome.receipt?.evidence?.provisioning?.input.trust_class, "DEMO_FIXTURE");
  assert.equal(outcome.receipt?.evidence?.check?.artifact_verified_locally, true);
  assert.equal(outcome.receipt?.evidence?.human_acceptance?.decision, "ACCEPTED");
  assert.equal(outcome.receipt?.evidence?.human_acceptance?.current, true);
  assert.equal(outcome.report.financials?.spent, "50"); assert.equal(outcome.report.financials?.reserved, "0");
  assert.equal(outcome.report.financials?.available_to_commit, "250");
  assert.equal(outcome.signing_enabled, false); assert.equal(outcome.independently_verified, false);
  assert.ok(!JSON.stringify(outcome).includes("health_body"));
  assert.ok(r.transport.calls.every(c => ["status", "block", "query", "tx_status"].includes(c.method)));
  assert.ok(!JSON.stringify(r.transport.calls).includes("health_body"));
});

test("failed/missing fixture stays separate from SETTLED payment, explicit rejection and unchanged integer spend", async () => {
  for (const mode of ["FAILED", "MISSING"]) {
    const r = await run(mode), first = await r.workflow.reviewProvisioning();
    assert.equal(first.fixture_check.status, mode === "FAILED" ? "VALIDATION_FAILED" : "VALIDATION_ERROR");
    assert.equal(first.fixture_invocations, mode === "FAILED" ? 1 : 0);
    if (first.review.action.method !== "record_provisioning") throw new Error("TEST_ACTION_MISMATCH");
    assert.equal(first.review.action.args.evidence.status, mode === "FAILED" ? "FAILED" : "UNKNOWN");
    r.recordProvisioning(first.review.action.args.evidence);
    await r.workflow.reviewTaskCheck(); r.recordCheck(first.fixture_check);
    await r.workflow.reviewAcceptance("REJECTED"); r.recordAcceptance("REJECTED");
    const result = await r.workflow.readReceipt(full);
    assert.equal(result.receipt?.settlement, "SETTLED"); assert.equal(result.report.financials?.spent, "50");
    assert.equal(result.receipt?.evidence?.human_acceptance?.decision, "REJECTED");
    assert.equal(result.report.financials?.available_to_commit, "250");
  }
});

test("denied/approval-pending/failed/pending callback payment never invokes fixture or creates an owner review", async () => {
  for (const state of ["DENIED", "APPROVAL_PENDING", "SETTLEMENT_FAILED", "SETTLEMENT_PENDING"]) {
    const r = await run("PROVISIONED", state), original = JSON.stringify(r.snapshot);
    await assert.rejects(r.workflow.reviewProvisioning(), /FIXTURE_PAYMENT_NOT_SETTLED/u);
    await assert.rejects(r.workflow.reviewTaskCheck(), /FIXTURE_NOT_PREPARED/u);
    assert.equal(JSON.stringify(r.snapshot), original);
    assert.ok(!r.transport.calls.some(c => c.params.request_type === "view_access_key"));
  }
});

test("RPC timeout/unknown or missing private callback proof cannot produce fixture output from SETTLED ledger alone", async () => {
  const r = await run(); r.d.f.raw.receipts = r.d.f.raw.receipts.slice(0, 2);
  await assert.rejects(r.workflow.reviewProvisioning(), /FIXTURE_PAYMENT_NOT_SETTLED/u);
  const unavailable = createTestnetReader(target, async () => { throw new Error("PRIVATE_CANARY"); });
  await assert.rejects(createFixtureWorkflow(r.config, unavailable).reviewProvisioning(), /^Error: FIXTURE_PAYMENT_NOT_SETTLED$/u);
});

test("stage advancement requires exact recorded provisioning then exact contract outcome; no automatic acceptance", async () => {
  const r = await run(); await assert.rejects(r.workflow.reviewAcceptance("ACCEPTED"), /FIXTURE_NOT_PREPARED/u);
  const first = await r.workflow.reviewProvisioning();
  await assert.rejects(r.workflow.reviewTaskCheck(), /FIXTURE_PROVISIONING_NOT_RECORDED/u);
  await assert.rejects(r.workflow.reviewAcceptance("ACCEPTED"), /FIXTURE_PROVISIONING_NOT_RECORDED/u);
  if (first.review.action.method !== "record_provisioning") throw new Error("TEST_ACTION_MISMATCH");
  r.recordProvisioning(first.review.action.args.evidence);
  await assert.rejects(r.workflow.reviewAcceptance("ACCEPTED"), /FIXTURE_TASK_CHECK_NOT_RECORDED/u);
  assert.throws(() => r.workflow.reviewAcceptance(undefined), /INVALID_CONTRACT_STATE/u);
  r.recordCheck(first.fixture_check); object(r.snapshot.task_check).report = { ...first.fixture_check, evidence_hash: "00".repeat(32) };
  await assert.rejects(r.workflow.reviewAcceptance("ACCEPTED"), /FIXTURE_RECORDED_CHECK_MISMATCH/u);
});

test("read-only repeats reuse exact generated bytes and observed time, never regenerate a fixture on later reads", async () => {
  const r = await run(), first = await r.workflow.reviewProvisioning(), second = await r.workflow.reviewProvisioning();
  assert.deepEqual(second.fixture_check, first.fixture_check); assert.equal(second.fixture_invocations, 1);
  assert.notEqual(second.review, first.review);
  const competing = r.workflow.reviewProvisioning();
  await assert.rejects(r.workflow.reviewProvisioning(), /FIXTURE_WORKFLOW_BUSY/u); await competing;
});

test("explicit disclosure defaults no receipt/evidence/finances; partial export omits objective and human facts", async () => {
  const r = await run(); await r.workflow.reviewProvisioning();
  const none = await r.workflow.readReceipt({ budget: false, expenses: false, evidence: false });
  assert.equal(none.receipt, null); assert.equal(none.report.financials, null); assert.deepEqual(none.report.expenses, []);
  const expense = await r.workflow.readReceipt({ budget: false, expenses: true, evidence: false });
  assert.equal(expense.receipt?.evidence, null); assert.equal(expense.report.financials, null);
  assert.throws(() => r.workflow.readReceipt({}), /INVALID_CONTRACT_FIELDS/u);
  assert.throws(() => r.workflow.readReceipt({ budget: "yes", expenses: true, evidence: true }), /EXPLICIT_DISCLOSURE_REQUIRED/u);
});

test("configuration is exact/copied/bounded; no wrong owner/target/method/fixture mode/secret/arbitrary provider instruction", async () => {
  const r = await run();
  for (const config of [{ ...r.config, fixture_result: "LIVE_DATABASE" }, { ...r.config, secret: "PRIVATE_CANARY" },
    { ...r.config, owner: { ...r.config.owner, signer_id: "agent.testnet" } },
    { ...r.config, target: { ...target, contract_id: "other.testnet" } },
    { ...r.config, intent: { ...r.config.intent, method: "approve_purchase", expected_request_hash: "aa".repeat(32) } }]) {
    assert.throws(() => createFixtureWorkflow(config, r.reader));
  }
  let invoked = false;
  assert.throws(() => createFixtureWorkflow({ ...r.config, get owner() { invoked = true; return {}; } }, r.reader)); assert.equal(invoked, false);
  assert.equal(r.transport.calls.length, 0);
  r.config.fixture_result = "FAILED"; r.config.owner.signer_id = "agent.testnet";
  assert.equal((await r.workflow.reviewProvisioning()).fixture_check.status, "VALIDATION_PASSED");
});

test("revocation/stale project cannot restore purchasing; outcome review records existing settled facts only", async () => {
  const r = await run(); object(r.snapshot.capsule).status = "REVOKED"; object(r.snapshot.capsule).revoked_at_ns = "25";
  const first = await r.workflow.reviewProvisioning();
  assert.equal(first.review.signing_enabled, false); assert.equal(first.review.financials?.spent, "50");
  assert.equal(object(r.snapshot.capsule).status, "REVOKED");
});

test("later changed evidence marks owner acceptance stale rather than granting current client acceptance", async () => {
  const r = await run(), first = await r.workflow.reviewProvisioning();
  if (first.review.action.method !== "record_provisioning") throw new Error("TEST_ACTION_MISMATCH");
  r.recordProvisioning(first.review.action.args.evidence); r.recordCheck(first.fixture_check); r.recordAcceptance("ACCEPTED");
  const histories = r.snapshot.provisioning as { request_id: string; records: Record<string, unknown>[] }[];
  histories[0].records.push({ ...histories[0].records[0], record_hash: "dd".repeat(32),
    input: { ...first.review.action.args.evidence, status: "FAILED" } });
  r.snapshot.evidence_snapshot_hash = "cc".repeat(32);
  const result = await r.workflow.readReceipt(full);
  assert.equal(result.receipt?.evidence?.human_acceptance?.decision, "ACCEPTED");
  assert.equal(result.receipt?.evidence?.human_acceptance?.current, false);
  assert.equal(result.receipt?.evidence?.provisioning?.input.status, "FAILED");
  assert.equal(result.receipt?.evidence?.check?.report.status, "VALIDATION_PASSED");
  assert.equal(result.receipt?.settlement, "SETTLED");
});

test("changed recorded identity/source/time and task bytes cannot leak into a confident receipt", async () => {
  const r = await run(), first = await r.workflow.reviewProvisioning();
  if (first.review.action.method !== "record_provisioning") throw new Error("TEST_ACTION_MISMATCH");
  r.recordProvisioning(first.review.action.args.evidence); r.recordCheck(first.fixture_check); r.recordAcceptance("ACCEPTED");
  const original = JSON.stringify(r.snapshot);
  for (const change of [
    () => { object(r.snapshot.human_acceptance).accepted_by = "agent.testnet"; },
    () => { object(r.snapshot.human_acceptance).recorded_at_ns = "31"; },
    () => { object(r.snapshot.task_check).attested_by = "agent.testnet"; },
    () => { object(r.snapshot.task_check).report = { ...first.fixture_check, artifact_hash: "00".repeat(32) }; },
    () => { const h = r.snapshot.provisioning as { records: Record<string, unknown>[] }[]; h[0].records[0].source = "PROVIDER_SIGNED_EVENT"; },
  ]) {
    Object.assign(r.snapshot, JSON.parse(original)); change();
    await assert.rejects(r.workflow.readReceipt(full));
  }
});

test("different settled purchase/target/transport or stale second read fails joined review even with matching money", async () => {
  const r = await run();
  const otherPurchase = createFixtureWorkflow(r.config, { ...r.reader, observePurchase: async (...args) => {
    const p = await r.reader.observePurchase(...args);
    return { ...p, transaction_hash: "3".repeat(32) };
  } });
  await assert.rejects(otherPurchase.reviewProvisioning(), /FIXTURE_PAYMENT_IDENTITY_MISMATCH/u);
  for (const override of [
    { transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" as const },
    { reviewed_block: { hash: "2".repeat(32), height: 29, timestamp_ns: "29" } },
    { reviewed_block: { hash: "2".repeat(32), height: 30, timestamp_ns: "30" } },
  ]) {
    const joined = createFixtureWorkflow(r.config, { ...r.reader, readOwnerReview: async (...args) => ({ ...await r.reader.readOwnerReview(...args), ...override }) });
    await assert.rejects(joined.reviewProvisioning(), /FIXTURE_STALE_OR_MIXED_READBACK/u);
  }
});

test("cancelled reads stop without owner request and release only coordinator busy flag, never a money/key claim", async () => {
  const r = await run(), cancel = new AbortController(); cancel.abort();
  await assert.rejects(r.workflow.reviewProvisioning(cancel.signal), /FIXTURE_PAYMENT_NOT_SETTLED/u);
  assert.equal(r.transport.calls.length, 0);
  assert.equal((await r.workflow.reviewProvisioning()).fixture_invocations, 1);
  assert.equal(object(r.snapshot.capsule).spent, "50");
});
