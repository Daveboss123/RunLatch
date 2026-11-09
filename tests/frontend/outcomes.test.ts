import assert from "node:assert/strict";
import { test } from "node:test";
import { importOutcomeObservation, summarizeOutcomes } from "../../src/lib/intelligence/receipts.ts";
import { commercialQuoteHash } from "../../src/lib/purchasing/hashing.ts";
import { outcomeFixture } from "./helpers/outcomes.ts";
import { illustrativeOutcomes } from "../../src/lib/intelligence/examples.ts";
const load = (v: unknown) => importOutcomeObservation(JSON.stringify(v));

test("receipt separates authorization, submission, settlement, completion, checks and acceptance", async () => {
  const b = await load(await outcomeFixture()), r = b.receipts[0];
  assert.equal(r.authorization, "APPROVED"); assert.equal(r.transfer_submission, "TRANSFER_RECEIPT_RECORDED");
  assert.equal(r.settlement, "SETTLED"); assert.equal(r.completion, "FINAL_TASK_REPORT_RECORDED");
  assert.equal(r.validation?.status, "VALIDATION_PASSED"); assert.equal(r.acceptance, "NOT_RECORDED");
  assert.equal(r.provisioning, "NOT_EVIDENCED"); assert.equal(r.policy_version, 2);
  assert.equal(r.settlement_reference, "4".repeat(32)); assert.equal(r.callback_reference, "5".repeat(32));
  assert.equal(r.validation?.validator_version, "1.0.0"); assert.equal(r.validation?.recorded_at_ns, "23");
  assert.equal(b.independently_verified, false);
});
test("all purchase states map without timer-generated success", async () => {
  for (const state of ["DENIED", "APPROVAL_PENDING", "CANCELLED", "EXPIRED", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"]) {
    const b = await load(await outcomeFixture(state, null)), r = b.receipts[0];
    assert.equal(r.settlement, ["SETTLED", "SETTLEMENT_FAILED", "SETTLEMENT_PENDING"].includes(state) ? state : "NOT_ATTEMPTED");
    assert.equal(r.validation, null); assert.equal(r.completion, "NO_FINAL_TASK_REPORT");
    assert.equal(r.transfer_submission, ["SETTLED", "SETTLEMENT_FAILED", "SETTLEMENT_PENDING"].includes(state) ? "TRANSFER_RECEIPT_RECORDED" : "NOT_SUBMITTED");
  }
});
test("failed validation keeps settled spend; missing artifact is validation error", async () => {
  for (const status of ["VALIDATION_FAILED", "VALIDATION_ERROR"] as const) {
    const b = await load(await outcomeFixture("SETTLED", status));
    assert.equal(b.receipts[0].settlement, "SETTLED"); assert.equal(b.receipts[0].validation?.status, status);
    const c = summarizeOutcomes([b]).costs.cohorts[0];
    assert.equal(c.failed_run_cost, "50"); assert.equal(c.cost_per_success, null);
  }
});
test("reported paid pass without successful callback is excluded, not proven spend", async () => {
  const raw = await outcomeFixture(); raw.attempts[0].callback = null;
  const b = await load(raw), result = summarizeOutcomes([b]);
  assert.equal(b.receipts[0].settlement, "SETTLEMENT_UNVERIFIED"); assert.equal(b.receipts[0].settlement_reference, null);
  assert.equal(b.runs[0].ledger_spend, "50"); assert.equal(b.runs[0].evidenced_spend, "0");
  assert.equal(result.costs.cohorts.length, 0); assert.equal(result.excluded[0].reason, "SETTLEMENT_UNVERIFIED"); assert.deepEqual(result.provider_spend, []);
});
test("failed native transfer plus failed task yields zero failed-run purchase cost", async () => {
  const b = await load(await outcomeFixture("SETTLEMENT_FAILED", "VALIDATION_FAILED"));
  assert.equal(b.receipts[0].settlement, "SETTLEMENT_FAILED"); assert.equal(summarizeOutcomes([b]).costs.cohorts[0].failed_run_cost, "0");
});
test("finished capsule without report does not become completed success", async () => {
  const raw = await outcomeFixture("SETTLED", null); raw.snapshots[0].capsule.status = "COMPLETED";
  const result = summarizeOutcomes([await load(raw)]);
  assert.equal(result.costs.cohorts.length, 0); assert.equal(result.excluded[0].reason, "UNATTESTED");
  assert.deepEqual(result.provider_spend, [{ contract_id: "contract.sandbox", provider_id: "database-fixture", spent: "50" }]);
});
test("exact duplicate observations and replay do not duplicate spend or blocked reasons", async () => {
  const raw = await outcomeFixture(); raw.attempts.push({ ...raw.attempts[0], transaction_id: "6".repeat(32), initial: { receipt_id: "7".repeat(32), succeeded: true }, transfer: null, callback: null,
    response: { ...raw.attempts[0].response, decision: "DENIED", source: "CONTRACT_REJECTED_ATTEMPT", reason_codes: ["REQUEST_REPLAY", "REQUEST_REPLAY"] } });
  const b = await load(raw), result = summarizeOutcomes([b, b]);
  assert.equal(result.sample_count, 1); assert.equal(result.duplicate_count, 1); assert.equal(result.receipts.length, 1);
  assert.deepEqual(result.blocked_reasons, [{ reason: "REQUEST_REPLAY", count: 1 }]); assert.equal(result.provider_spend[0].spent, "50");
  assert.equal(result.ledger?.spent, "50"); assert.equal(result.ledger?.observation_count, 1);
});
test("conflicting snapshots rejected, time selection excludes without mutating source", async () => {
  const pass = await load(await outcomeFixture()), fail = await load(await outcomeFixture("SETTLED", "VALIDATION_FAILED"));
  assert.throws(() => summarizeOutcomes([pass, fail]), /CONFLICTING_OUTCOME_SNAPSHOTS/u);
  assert.equal(summarizeOutcomes([pass], { from: "24", to: "30" }).sample_count, 0);
  assert.equal(summarizeOutcomes([pass], { from: "24", to: "30" }).ledger?.spent, "50");
  assert.equal(summarizeOutcomes([]).ledger, null);
  assert.equal(summarizeOutcomes([pass]).time_range_ns?.first, "23");
  assert.throws(() => summarizeOutcomes([pass], { from: "30", to: "1" }), /INVALID_OUTCOME_RANGE/u);
  assert.throws(() => summarizeOutcomes(Array.from({ length: 17 }, () => pass)), /OUTCOME_BUNDLE_LIMIT/u);
});
test("quote delta unavailable until a real comparable canonical prior record is selected", async () => {
  const raw = await outcomeFixture(); assert.equal(summarizeOutcomes([await load(raw)]).quote_changes[0].delta_yocto, null);
  const terms = { ...raw.quotes[0].terms, input: { ...raw.quotes[0].terms.input, quote_id: "prior", price: "40" } };
  raw.quotes[0].terms = { ...raw.quotes[0].terms, input: { ...raw.quotes[0].terms.input, previous_quote_id: "prior" } };
  raw.snapshots[0].purchases[0].canonical_quote = raw.quotes[0].terms;
  raw.quotes[0].quote_hash = await commercialQuoteHash(raw.quotes[0].terms, "testnet", raw.contract_id);
  const p = raw.snapshots[0].purchases[0]; p.proposal.expected_quote_hash = raw.quotes[0].quote_hash;
  raw.quotes.push({ terms, quote_hash: await commercialQuoteHash(terms, "testnet", raw.contract_id), consumed: false, consumed_by: null, published_at_ns: "0" });
  raw.providers[0].quote_count = 2;
  let result = summarizeOutcomes([await load(raw)]); assert.equal(result.quote_changes[0].delta_yocto, "10");
  terms.input.quantity = 2; raw.quotes[1].quote_hash = await commercialQuoteHash(terms, "testnet", raw.contract_id);
  result = summarizeOutcomes([await load(raw)]); assert.equal(result.quote_changes[0].unavailable_reason, "NONCOMPARABLE_TERMS");
});
test("owner, request, version and future timestamps fail closed", async () => {
  for (const modify of [
    (b: Awaited<ReturnType<typeof outcomeFixture>>) => { b.snapshots[0].task_check!.attested_by = "intruder.sandbox"; },
    (b: Awaited<ReturnType<typeof outcomeFixture>>) => { b.snapshots[0].task_check!.request_hash = "08".repeat(32); },
    (b: Awaited<ReturnType<typeof outcomeFixture>>) => { b.snapshots[0].task_check!.recorded_at_ns = "31"; },
    (b: Awaited<ReturnType<typeof outcomeFixture>>) => { b.snapshots[0].capsule.policy_schema_version = 3; },
  ]) { const b = await outcomeFixture(); modify(b); await assert.rejects(load(b)); }
});
test("owner acceptance is separate and stale evidence never appears current", async () => {
  const raw = await outcomeFixture(); raw.snapshots[0].human_acceptance = { capsule_id: "work", outcome_hash: "07".repeat(32), evidence_snapshot_hash: "09".repeat(32), decision: "ACCEPTED", accepted_by: "operator.sandbox", recorded_at_ns: "24", acceptance_hash: "10".repeat(32) };
  const b = await load(raw); assert.equal(b.receipts[0].acceptance, "ACCEPTED"); assert.equal(b.receipts[0].acceptance_current, false);
  raw.snapshots[0].human_acceptance.accepted_by = "intruder.sandbox"; await assert.rejects(load(raw), /ACCEPTANCE_OWNER_BINDING_MISMATCH/u);
});
test("illustrative cohorts are SIMULATED, failure-inclusive and respond to selected records", async () => {
  const bundles = await illustrativeOutcomes();
  const all = summarizeOutcomes(bundles), passOnly = summarizeOutcomes(bundles.slice(0, 1)), failed = summarizeOutcomes(bundles.slice(1));
  assert.equal(all.costs.cohorts[0].key[0], "SIMULATED"); assert.equal(all.costs.cohorts[0].cost_per_success?.numerator, "100");
  assert.equal(passOnly.costs.cohorts[0].cost_per_success?.numerator, "50"); assert.equal(failed.costs.cohorts[0].cost_per_success, null);
  assert.equal(all.costs.cohorts[0].failed_run_cost, "50"); assert.equal(all.sample_count, 3);
});
test("changing the canonical amount changes exact costs, not a presentation constant", async () => {
  const raw = await outcomeFixture(), p = raw.snapshots[0].purchases[0];
  raw.quotes[0].terms = { ...raw.quotes[0].terms, input: { ...raw.quotes[0].terms.input, price: "9007199254740993" } };
  raw.quotes[0].quote_hash = await commercialQuoteHash(raw.quotes[0].terms, "testnet", raw.contract_id);
  p.canonical_quote = raw.quotes[0].terms; p.proposal.expected_quote_hash = raw.quotes[0].quote_hash;
  raw.snapshots[0].capsule.spent = raw.attempts[0].transfer!.amount = "9007199254740993";
  raw.snapshots[0].capsule.allocated = raw.snapshots[0].capsule.policy.budget = raw.snapshots[0].project.allocated_authority = raw.snapshots[0].project.input.budget_ceiling = "9007199254740994";
  const result = summarizeOutcomes([await load(raw)]);
  assert.equal(result.provider_spend[0].spent, "9007199254740993"); assert.equal(result.costs.cohorts[0].cost_per_success?.floor_yocto, "9007199254740993");
  assert.equal(result.ledger?.spent, "9007199254740993"); assert.equal(result.ledger?.allocated, "9007199254740994");
});
test("ledger pending counts stay snapshot-scoped after time filtering and deduplication", async () => {
  const b = await load(await outcomeFixture("SETTLEMENT_PENDING", null));
  const summary = summarizeOutcomes([b, b], { from: "31", to: "40" });
  assert.equal(summary.receipts.length, 0); assert.equal(summary.duplicate_count, 1);
  assert.equal(summary.ledger?.reserved, "50"); assert.equal(summary.ledger?.spent, "0");
  assert.equal(summary.ledger?.pending_settlement_receipts, 1); assert.equal(summary.ledger?.observation_count, 1);
  const unproven = await outcomeFixture(); unproven.attempts[0].callback = null;
  const ledger = summarizeOutcomes([await load(unproven)]).ledger;
  assert.equal(ledger?.pending_settlement_receipts, 1); assert.equal(ledger?.spent, "50");
});
test("contradictory result, substituted criteria/version, duplicate checks and future quote fail closed", async () => {
  const raw = await outcomeFixture("SETTLED", "VALIDATION_FAILED");
  const value = JSON.parse(JSON.stringify(raw)); value.snapshots[0].task_check.report.status = "VALIDATION_PASSED";
  await assert.rejects(load(value), /INCONSISTENT_TASK_CHECK_RESULT/u);
  for (const [key, replacement] of [["criteria_hash", "09".repeat(32)], ["validator_version", "2.0.0"], ["validator_id", "untrusted-model"]]) {
    const v = JSON.parse(JSON.stringify(await outcomeFixture())); v.snapshots[0].task_check.report[key] = replacement;
    await assert.rejects(load(v), /UNSUPPORTED_OUTCOME_CRITERIA/u);
  }
  const duplicate = JSON.parse(JSON.stringify(await outcomeFixture())); duplicate.snapshots[0].task_check.report.checks[1].check_id = "MANIFEST_BINDING";
  await assert.rejects(load(duplicate), /INVALID_OBJECTIVE_CHECKS/u);
  const future = await outcomeFixture(); future.quotes[0].published_at_ns = "31"; await assert.rejects(load(future), /OUTCOME_TIME_MISMATCH/u);
});
test("resource-check and acceptance scope never silently applies to another purchase", async () => {
  const raw = await outcomeFixture(), s = raw.snapshots[0], p = s.purchases[0];
  s.purchases.push({ ...p, proposal: { ...p.proposal, request_id: "other" }, request_hash: "0c".repeat(32), status: "DENIED", decision: "DENIED", resolved_at_ns: null });
  s.capsule.request_ids.push("other"); s.provisioning.push({ request_id: "other", records: [] });
  const result = await load(raw);
  assert.equal(result.receipts[0].validation?.request_id, "database"); assert.equal(result.receipts[1].validation, null);
  assert.equal(result.receipts[1].acceptance, "NOT_RECORDED"); assert.equal(result.receipts[1].completion, "FINAL_TASK_REPORT_RECORDED");
});
test("pending money cannot coexist with a canonical final task outcome", async () => {
  const raw = await outcomeFixture("SETTLEMENT_PENDING", "VALIDATION_FAILED");
  await assert.rejects(load(raw), /PENDING_SETTLEMENT_BLOCKS_OUTCOME/u);
});
test("same provider ID in different contract namespaces is not silently merged", async () => {
  const first = await load(await outcomeFixture()), raw = await outcomeFixture(); raw.contract_id = "other.sandbox";
  raw.quotes[0].quote_hash = await commercialQuoteHash(raw.quotes[0].terms, "testnet", raw.contract_id);
  raw.snapshots[0].purchases[0].proposal.expected_quote_hash = raw.quotes[0].quote_hash;
  const s = summarizeOutcomes([first, await load(raw)]);
  assert.equal(s.sample_count, 2); assert.equal(s.provider_spend.length, 2); assert.equal(s.costs.cohorts.length, 2);
  assert.deepEqual(s.provider_spend.map(p => p.contract_id), ["contract.sandbox", "other.sandbox"]);
});
