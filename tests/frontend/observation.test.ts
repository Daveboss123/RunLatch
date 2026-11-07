import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalReview, importLocalObservation } from "../../src/lib/near/observation.ts";
import { parseBoundedJson, parseProposal, proposalFromQuote } from "../../src/lib/near/records.ts";
import { observationFixture } from "./helpers/observation.ts";

test("R-01/R-10: consistent imported outcomes stay LOCAL, unverified and non-authorizing", async () => {
  const o = await importLocalObservation(JSON.stringify(await observationFixture()));
  assert.equal(o.independently_verified, false); assert.equal(o.grants_payment_authority, false); assert.equal(o.public_testnet, false);
  assert.equal(o.purchases[0].payment_evidence, "SETTLED");
  assert.deepEqual(o.purchases[0].milestones, ["REQUESTED", "AUTHORIZED", "RESERVED", "SETTLEMENT_PENDING"]);
  assert("provisioning_status" in o.report.expenses[0]);
  assert.equal(o.report.expenses[0].provisioning_status, "NOT_EVIDENCED");
  assert("human_acceptance" in o.report.expenses[0]);
  assert.equal(o.report.expenses[0].human_acceptance, "NOT_RECORDED");
  assert.deepEqual(proposalFromQuote("client-work", "1", "work", "draft", o.quotes[0]), { project_id: "client-work", project_revision: "1", capsule_id: "work", request_id: "draft", quote_id: "database-quote", expected_quote_hash: o.quotes[0].quote_hash });
});
test("G-04: recipient tampering cannot change canonical quotes, transfer routing or proposal fields", async () => {
  const o = await observationFixture(); o.quotes[0].terms = { ...o.quotes[0].terms, input: { ...o.quotes[0].terms.input, recipient_id: "intruder.sandbox" } };
  await assert.rejects(importLocalObservation(JSON.stringify(o)), /PROVIDER_BINDING/u);
  const t = await observationFixture(); t.attempts[0].transfer!.receiver = "intruder.sandbox";
  await assert.rejects(importLocalObservation(JSON.stringify(t)), /TRANSFER_CANONICAL_BINDING/u);
  assert.throws(() => parseProposal({ ...(t.attempts[0].proposal), recipient_id: "intruder.sandbox" }), /FIELDS/u);
});
test("Q-06: expired quote/pending approval never enables signing or releases funds", async () => {
  const value = await observationFixture("APPROVAL_PENDING"); value.observed_at_ns = "1000";
  const o = await importLocalObservation(JSON.stringify(value));
  assert.equal(o.report.financials?.reserved, "0");
  assert.throws(() => approvalReview(o, "work", "database", value.snapshots[0].purchases[0].request_hash), /APPROVAL_EXPIRED/u);
});
test("G-11/R-04: replay denial references original settlement without overwriting or double counting", async () => {
  const value = await observationFixture();
  value.attempts.push({ ...value.attempts[0], transaction_id: "6".repeat(32), initial: { receipt_id: "7".repeat(32), succeeded: true }, transfer: null, callback: null,
    response: { ...value.attempts[0].response, decision: "DENIED", reason_codes: ["REQUEST_REPLAY"], source: "CONTRACT_REJECTED_ATTEMPT" } });
  const o = await importLocalObservation(JSON.stringify(value));
  assert.equal(o.attempts[1].decision, "DENIED"); assert.equal(o.purchases[0].record.status, "SETTLED"); assert.equal(o.report.financials?.spent, "50");
  await assert.rejects(importLocalObservation(JSON.stringify({ ...value, attempts: [value.attempts[0], value.attempts[0]] })), /DUPLICATE_ATTEMPT/u);
});
test("G-09: cumulative overspend/inconsistent reservation totals reject rather than show fabricated balances", async () => {
  const value = await observationFixture("SETTLEMENT_PENDING"); value.snapshots[0].capsule.spent = "280";
  await assert.rejects(importLocalObservation(JSON.stringify(value)), /INVALID_BUDGET_STATE/u);
  const mismatch = await observationFixture(); mismatch.snapshots[0].capsule.spent = "51";
  await assert.rejects(importLocalObservation(JSON.stringify(mismatch)), /OPERATION_SUM_MISMATCH/u);
});
test("C-08/S-08: revoked capsule prevents review but does not erase a resolved outgoing payment", async () => {
  const value = await observationFixture(); value.snapshots[0].capsule.status = "REVOKED";
  const o = await importLocalObservation(JSON.stringify(value));
  assert.equal(o.capsules[0].status, "REVOKED"); assert.equal(o.purchases[0].payment_evidence, "SETTLED"); assert.equal(o.report.financials?.spent, "50");
  const pending = await observationFixture("APPROVAL_PENDING"); pending.snapshots[0].capsule.status = "REVOKED";
  const p = await importLocalObservation(JSON.stringify(pending));
  assert.throws(() => approvalReview(p, "work", "database", pending.snapshots[0].purchases[0].request_hash), /REVOKED/u);
});
test("A-04: exact approval review is hash-bound and never a connected wallet transaction", async () => {
  const value = await observationFixture("APPROVAL_PENDING"), o = await importLocalObservation(JSON.stringify(value));
  assert.throws(() => approvalReview(o, "work", "database", "00".repeat(32)), /BINDING_MISMATCH/u);
  const review = approvalReview(o, "work", "database", value.snapshots[0].purchases[0].request_hash);
  assert.equal(review.deposit_yocto, "1"); assert.equal(review.signing_enabled, false); assert.equal(review.canonical_recipient, "publisher.sandbox");
  const changed = await observationFixture("APPROVAL_PENDING"); changed.snapshots[0].project.revision = "2";
  const stale = await importLocalObservation(JSON.stringify(changed));
  assert.throws(() => approvalReview(stale, "work", "database", changed.snapshots[0].purchases[0].request_hash), /STALE/u);
});
test("S-04: confirmed initial-transfer failure stays distinct from callback failure and spends zero", async () => {
  const o = await importLocalObservation(JSON.stringify(await observationFixture("SETTLEMENT_FAILED")));
  assert.equal(o.purchases[0].payment_evidence, "SETTLEMENT_FAILED"); assert.equal(o.report.financials?.spent, "0"); assert.equal(o.report.financials?.reserved, "0");
  const falseSuccess = await observationFixture("SETTLEMENT_FAILED"); falseSuccess.attempts[0].transfer!.succeeded = true;
  await assert.rejects(importLocalObservation(JSON.stringify(falseSuccess)), /OUTCOME_MISMATCH/u);
});
test("S-06/R-03: missing/unproven callback cannot turn a hash or finality string into confirmed settlement", async () => {
  const value = await observationFixture(); value.attempts[0].callback = null;
  const o = await importLocalObservation(JSON.stringify(value)); assert.equal(o.purchases[0].payment_evidence, "SETTLEMENT_UNVERIFIED");
  const pending = await observationFixture("SETTLEMENT_PENDING"); pending.snapshots[0].purchases[0].reconciliation_required = true;
  const p = await importLocalObservation(JSON.stringify(pending)); assert.equal(p.report.financials?.reserved, "50");
  assert.equal(p.purchases[0].payment_evidence, "SETTLEMENT_PENDING");
  pending.attempts[0].finality = "INCLUDED_FINAL";
  await assert.rejects(importLocalObservation(JSON.stringify(pending)), /UNFINALIZED/u);
});
test("A-08: rejection, cancellation and stored expiry have no reservation to release", async () => {
  for (const state of ["DENIED", "CANCELLED", "EXPIRED"]) {
    const o = await importLocalObservation(JSON.stringify(await observationFixture(state)));
    assert.equal(o.purchases[0].record.status, state); assert.equal(o.purchases[0].payment_evidence, "NOT_ATTEMPTED"); assert.equal(o.report.financials?.reserved, "0");
  }
});
test("T-08/T-09: nested duplicates, excess depth, mainnet/testnet claims and oversized files fail closed", async () => {
  assert.throws(() => parseBoundedJson('{"p":{"a":1,"\\u0061":2}}'), /DUPLICATE/u);
  assert.throws(() => parseBoundedJson("[".repeat(25) + "0" + "]".repeat(25)), /DEPTH/u);
  assert.throws(() => parseBoundedJson(" ".repeat(1048577)), /INPUT_LIMIT/u);
  const v = await observationFixture(); v.public_testnet = true;
  await assert.rejects(importLocalObservation(JSON.stringify(v)), /LOCAL_OBSERVATION/u);
  v.public_testnet = false; v.network_tag = "mainnet";
  await assert.rejects(importLocalObservation(JSON.stringify(v)), /LOCAL_OBSERVATION/u);
});

test("R-03: receipt identities and exact proposal bindings cannot be reused as settlement proof", async () => {
  const altered = await observationFixture();
  altered.attempts[0].proposal = { ...altered.attempts[0].proposal, quote_id: "different-quote" };
  altered.attempts[0].response.request = { ...altered.attempts[0].response.request, proposal: altered.attempts[0].proposal };
  await assert.rejects(importLocalObservation(JSON.stringify(altered)), /ATTEMPT_BINDING_MISMATCH/u);
  const reused = await observationFixture();
  reused.attempts.push({ ...reused.attempts[0], transaction_id: "6".repeat(32), transfer: null, callback: null,
    response: { ...reused.attempts[0].response, decision: "DENIED", source: "CONTRACT_REJECTED_ATTEMPT" } });
  await assert.rejects(importLocalObservation(JSON.stringify(reused)), /DUPLICATE_EXECUTION_RECEIPT/u);
});

test("R-03: a future record cannot be presented as captured at an earlier block", async () => {
  const value = await observationFixture(); value.observed_at_ns = "15";
  await assert.rejects(importLocalObservation(JSON.stringify(value)), /OBSERVATION_TIME_MISMATCH/u);
});
