import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildProjectReport } from "../../src/lib/reporting/project.ts";
import { commercialQuoteHash, type CanonicalQuoteTerms } from "../../src/lib/purchasing/hashing.ts";
const golden = JSON.parse(readFileSync(new URL("../../fixtures/hashes/quote-v2.json", import.meta.url), "utf8"));
const disclosure = { project_id: "client-work", budget: true, expenses: true, evidence: true };
async function input() {
  const terms: CanonicalQuoteTerms = golden.terms;
  const quoteHash = await commercialQuoteHash(terms, "testnet", "contract.testnet");
  const snapshot = { project: { input: { project_id: "client-work", budget_ceiling: "300" }, revision: "1", allocated_authority: "300", capsule_ids: ["work"] },
    capsule: { capsule_id: "work", policy: { project_id: "client-work", project_revision: "1", budget: "300" }, policy_hash: "03".repeat(32),
      allocated: "300", spent: "20", reserved: "0", committed_future: "220", returned: "0", request_ids: ["purchase"], owner_refund: null,
      private_system_prompt: "SECRET_CANARY_DO_NOT_EXPORT", agent_public_key: "SECRET_CANARY_KEY" },
    purchases: [{ proposal: { capsule_id: "work", project_id: "client-work", request_id: "purchase", expected_quote_hash: quoteHash },
      canonical_quote: terms, decision: "APPROVED", status: "SETTLED", reserved_amount: "0", committed_future_amount: "220" }],
    provisioning: [{ request_id: "purchase", records: [{ input: { status: "FAILED", trust_class: "DEMO_FIXTURE" } }] }],
    task_check: null, outcome: null, human_acceptance: null, evidence_snapshot_hash: "04".repeat(32) };
  return { source: "SIMULATED", contract_id: "contract.testnet", network_tag: "testnet", block_hash: "1".repeat(32), project_id: "client-work", snapshots: [snapshot] };
}
test("P-19: selected report uses canonical money and separate fixture evidence", async () => {
  const report = await buildProjectReport(JSON.stringify(await input()), disclosure);
  assert.equal(report.read_only, true); assert.equal(report.source, "SIMULATED");
  assert.equal(report.financials?.available_now, "280"); assert.equal(report.financials?.available_to_commit, "60");
  assert.equal(report.financials?.committed_future, "220");
  assert.equal(report.expenses[0].payment_status, "SETTLED"); assert.equal(report.coverage.complete_project, true);
  assert(!JSON.stringify(report).includes("SECRET_CANARY")); assert(!JSON.stringify(report).includes("provider.testnet"));
});
test("P-19: imported provenance is not independent testnet proof", async () => {
  for (const source of ["SIMULATED", "LOCAL_NEAR_SANDBOX_OBSERVATION", "NEAR_TESTNET_OBSERVATION"]) {
    const value = await input(); value.source = source;
    const report = await buildProjectReport(JSON.stringify(value), disclosure);
    assert.equal(report.execution.independently_verified, false);
    assert.equal(report.execution.grants_payment_authority, false);
    assert.equal(report.verification, "DERIVED_CANONICAL_INPUT_NOT_INDEPENDENT_CHAIN_PROOF");
    assert(!JSON.stringify(report).includes("SECRET_CANARY"));
  }
});
test("P-19: budget/expense/evidence disclosure is explicit, default data cannot leak", async () => {
  const report = await buildProjectReport(JSON.stringify(await input()), { ...disclosure, budget: false, expenses: false, evidence: false });
  assert.equal(report.financials, null); assert.deepEqual(report.expenses, []); assert.equal(report.evidence_scope, "NOT_DISCLOSED");
  const filtered = await buildProjectReport(JSON.stringify(await input()), { ...disclosure, evidence: false });
  assert(!JSON.stringify(filtered.expenses).includes("provisioning"));
});
test("P-19: cross-project, duplicate, incomplete and inconsistent snapshot rejection", async () => {
  const first = await input();
  await assert.rejects(buildProjectReport(JSON.stringify(first), { ...disclosure, project_id: "other" }), /SCOPE_MISMATCH/u);
  await assert.rejects(buildProjectReport(JSON.stringify({ ...first, snapshots: [first.snapshots[0], first.snapshots[0]] }), disclosure), /DUPLICATE_CAPSULE/u);
  const missing = await input(); missing.snapshots[0].purchases = [];
  await assert.rejects(buildProjectReport(JSON.stringify(missing), disclosure), /INCOMPLETE_PURCHASE/u);
  const ledger = await input(); ledger.snapshots[0].capsule.spent = "21";
  await assert.rejects(buildProjectReport(JSON.stringify(ledger), disclosure), /OPERATION_SUM_MISMATCH/u);
});
test("P-19: altered settled quote cannot generate a matching canonical expense", async () => {
  const value = await input(); value.snapshots[0].purchases[0].proposal.expected_quote_hash = "00".repeat(32);
  await assert.rejects(buildProjectReport(JSON.stringify(value), disclosure), /QUOTE_HASH_MISMATCH/u);
});
test("P-19/T-08: malformed/oversized input and coercible source labels rejected", async () => {
  await assert.rejects(buildProjectReport("<script>", disclosure), /INVALID_REPORT_JSON/u);
  await assert.rejects(buildProjectReport(" ".repeat(1048577), disclosure), /INPUT_LIMIT/u);
  const value = await input();
  await assert.rejects(buildProjectReport(JSON.stringify({ ...value, source: ["SIMULATED"] }), disclosure), /INVALID_RECORD_STATUS/u);
});

test("P-19: resource check never silently marks an unrelated purchase as checked", async () => {
  const value = await input();
  const snapshot = value.snapshots[0];
  snapshot.capsule.request_ids.push("other-request");
  snapshot.purchases.push({ ...snapshot.purchases[0], proposal: { ...snapshot.purchases[0].proposal, request_id: "other-request" },
    decision: "DENIED", status: "DENIED", committed_future_amount: "0" });
  snapshot.provisioning.push({ request_id: "other-request", records: [] });
  const check = { capsule_id: "work", request_id: "purchase", policy_hash: snapshot.capsule.policy_hash,
    outcome_hash: "05".repeat(32), report: { status: "VALIDATION_PASSED" } };
  const serialized = JSON.stringify({ ...value, snapshots: [{ ...snapshot, task_check: check }] });
  const report = await buildProjectReport(serialized, disclosure);
  assert.equal(report.expenses[0].task_check_status, "VALIDATION_PASSED");
  assert.equal(report.expenses[1].task_check_status, "NOT_CHECKED");
  assert.equal(report.expenses[1].human_acceptance, "NOT_RECORDED");
});

test("P-19: complete report must account for all original allocation; orphan checks rejected", async () => {
  const allocation = await input(); allocation.snapshots[0].project.allocated_authority = "301";
  allocation.snapshots[0].project.input.budget_ceiling = "301";
  await assert.rejects(buildProjectReport(JSON.stringify(allocation), disclosure), /INCOMPLETE_PROJECT_ALLOCATION/u);
  const value = await input(), snapshot = value.snapshots[0];
  const orphan = { ...snapshot, task_check: { capsule_id: "work", request_id: "missing", policy_hash: snapshot.capsule.policy_hash, report: { status: "VALIDATION_PASSED" } } };
  await assert.rejects(buildProjectReport(JSON.stringify({ ...value, snapshots: [orphan] }), disclosure), /TASK_OUTCOME_BINDING_MISMATCH/u);
});

test("P-19: inconsistent decision/payment and project index cannot masquerade as complete", async () => {
  const value = await input(); value.snapshots[0].purchases[0].decision = "DENIED";
  await assert.rejects(buildProjectReport(JSON.stringify(value), disclosure), /DECISION_PAYMENT_MISMATCH/u);
  const index = await input(); index.snapshots[0].project.capsule_ids.push("work");
  await assert.rejects(buildProjectReport(JSON.stringify(index), disclosure), /DUPLICATE_PROJECT_INDEX/u);
});
