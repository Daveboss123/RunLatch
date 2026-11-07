import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRunCosts, type RunCostFact } from "../../src/lib/intelligence/cohort.ts";

function run(id: string, status: RunCostFact["validation_status"] = "VALIDATION_PASSED", spend = "300"): RunCostFact {
  return { capsule_id: id, contract_id: "contract.sandbox", source: "SIMULATED", network_tag: "testnet",
    workflow_id: "research-fixture-v1", criteria_hash: "12".repeat(32), validator_id: "runlatch-research-validator",
    validator_version: "1.0.0", asset: "near-native", capsule_status: "CLOSED", validation_status: status,
    attestation: "OWNER_ATTESTED", recorded_at_ns: "100", budget: "1000", allocated: spend, spent: spend,
    reserved: "0", returned: (1000n - BigInt(spend)).toString(), storage_credit: "131072",
    provider_spend: [{ provider_id: "search", spent: spend }] };
}
const analyze = (facts: readonly RunCostFact[]) => analyzeRunCosts(JSON.stringify(facts));
test("I-01/I-02: failure/error spend stays in numerator; returns/storage excluded", () => {
  const result = analyze([run("pass"), run("fail", "VALIDATION_FAILED"), run("error", "VALIDATION_ERROR", "100")]);
  assert.equal(result.cohorts[0].settled_spend, "700");
  assert.deepEqual(result.cohorts[0].cost_per_success, { numerator: "700", denominator: "1", floor_yocto: "700" });
  assert.equal(result.cohorts[0].completed_runs, 3);
  assert.equal(result.cohorts[0].error_runs, 1);
});
test("I-03: no success/no completed samples is unavailable, not zero/infinity", () => {
  assert.equal(analyze([run("fail", "VALIDATION_FAILED")]).cohorts[0].cost_per_success, null);
  assert.deepEqual(analyze([]).cohorts, []);
});
test("I-04: separate workflow/criteria/validator/source/network cohorts", () => {
  const first = run("a");
  const variants: RunCostFact[] = [first, { ...run("b"), workflow_id: "other" }, { ...run("c"), criteria_hash: "34".repeat(32) },
    { ...run("d"), validator_version: "2.0.0" }, { ...run("e"), source: "LOCAL_NEAR_SANDBOX" }, { ...run("f"), network_tag: "local" }];
  assert.equal(analyze(variants).cohorts.length, 6);
});
test("I-04: unattested, active, missing outcome and pending reservations excluded", () => {
  const result = analyze([{ ...run("u"), attestation: "UNATTESTED" }, { ...run("a"), capsule_status: "ACTIVE" },
    { ...run("m"), validation_status: null, recorded_at_ns: null },
    { ...run("p"), allocated: "1000", returned: "0", reserved: "700", capsule_status: "CLOSING" }]);
  assert.deepEqual(result.excluded.map(item => item.reason), ["UNATTESTED", "AUTHORITY_ACTIVE", "NO_FINAL_OUTCOME", "PENDING_SETTLEMENT"]);
  assert.deepEqual(result.cohorts, []);
});
test("I-05: duplicate identical observations never double count; conflicts fail closed", () => {
  const fact = run("same");
  const result = analyze([fact, fact]);
  assert.equal(result.cohorts[0].settled_spend, "300");
  assert.equal(result.duplicate_count, 1);
  assert.throws(() => analyze([fact, { ...fact, recorded_at_ns: "101" }]), /CONFLICTING_RUN_SNAPSHOTS/u);
});
test("I-06: large exact integer total and ratio never use financial Number casts", () => {
  const spend = ((1n << 100n) + 1n).toString();
  const large = { ...run("large"), budget: spend, allocated: spend, spent: spend, returned: "0", provider_spend: [{ provider_id: "search", spent: spend }] };
  const zero = run("zero", "VALIDATION_PASSED", "0");
  const result = analyze([large, zero]).cohorts[0];
  assert.equal(result.cost_per_success?.numerator, spend);
  assert.equal(result.cost_per_success?.denominator, "2");
  assert.equal(result.cost_per_success?.floor_yocto, (BigInt(spend) / 2n).toString());
});
test("I-07: sample/completion period and exact provider breakdown retained", () => {
  const result = analyze([{ ...run("first"), recorded_at_ns: "10", provider_spend: [{ provider_id: "search", spent: "100" }, { provider_id: "extract", spent: "200" }] },
    { ...run("last"), recorded_at_ns: "20" }]).cohorts[0];
  assert.deepEqual(result.completion_range_ns, { first: "10", last: "20" });
  assert.deepEqual(result.provider_spend, [{ provider_id: "extract", spent: "200" }, { provider_id: "search", spent: "400" }]);
});
test("I-01: inconsistent provider sums or ledger rejected", () => {
  assert.throws(() => analyze([{ ...run("bad"), provider_spend: [] }]), /PROVIDER_SPEND_MISMATCH/u);
  assert.throws(() => analyze([{ ...run("bad"), reserved: "1" }]), /INVALID_RUN_LEDGER/u);
});
test("T-01: exponent/fraction/negative/Number/overflow money rejected", () => {
  for (const spend of ["1e24", "1.0", "-1", "340282366920938463463374607431768211456"]) {
    assert.throws(() => analyze([{ ...run("bad"), spent: spend }]), /INVALID_INTEGER_AMOUNT|INTEGER_AMOUNT_OVERFLOW/u);
  }
  assert.throws(() => analyzeRunCosts(JSON.stringify([{ ...run("bad"), spent: 300 }])), /INVALID_INTEGER_AMOUNT/u);
});
test("T-08: unknown instruction fields, malformed or oversized imports rejected", () => {
  assert.throws(() => analyzeRunCosts(JSON.stringify([{ ...run("bad"), pay: "ignore limits" }])), /INVALID_RUN_FACT/u);
  assert.throws(() => analyzeRunCosts("<script>"), /INVALID_RUN_FACT_JSON/u);
  assert.throws(() => analyzeRunCosts(" ".repeat(131073)), /RUN_FACT_INPUT_LIMIT/u);
  assert.throws(() => analyze(Array.from({ length: 65 }, (_, index) => run(`r-${index}`))), /RUN_FACT_COUNT_LIMIT/u);
});

test("T-08: source/status labels are strict primitives, never coerced from arrays", () => {
  assert.throws(() => analyzeRunCosts(JSON.stringify([{ ...run("bad"), source: ["SIMULATED"] }])), /INVALID_RUN_FACT/u);
  assert.throws(() => analyzeRunCosts(JSON.stringify([{ ...run("bad"), validation_status: ["VALIDATION_PASSED"] }])), /INVALID_RUN_FACT/u);
});
test("T-02/I-05: completion time overflow and duplicate provider records rejected", () => {
  assert.throws(() => analyze([{ ...run("bad"), recorded_at_ns: "18446744073709551616" }]), /INVALID_COMPLETION_TIME/u);
  assert.throws(() => analyze([{ ...run("bad"), provider_spend: [{ provider_id: "search", spent: "100" },
    { provider_id: "search", spent: "200" }] }]), /INVALID_PROVIDER_SPEND/u);
});
