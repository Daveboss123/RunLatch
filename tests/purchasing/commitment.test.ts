import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateCommitment, budgetBreakdown, integerAmount, type CommercialTerms } from "../../src/lib/purchasing/commitment.ts";

const terms: CommercialTerms = { billing_model: "FIXED_RECURRING", cadence: "MONTHLY", period_charge: "20", required_periods: 12,
  mandatory_fees: "0", known_taxes: "0", setup_fees: "0", auto_renew: false, cancellation_terms_hash: "03".repeat(32),
  source_evidence_hash: "04".repeat(32), future_obligation_contingent_on_initial_payment: true };
test("P-06: 20 now is a240 known minimum obligation, not a20 purchase", () => {
  const result = calculateCommitment({ price: "20", recurring: true, commercial_terms: terms });
  assert.equal(result.amount_due_now, "20"); assert.equal(result.known_minimum_commitment, "240");
  assert.equal(result.committed_future, "220"); assert.equal(result.bounded, true); assert.equal(result.grants_payment_authority, false);
});
test("P-06: mandatory fees/taxes/setup are counted once, all due upfront", () => {
  const result = calculateCommitment({ price: "29", recurring: true, commercial_terms: { ...terms, mandatory_fees: "2", known_taxes: "3", setup_fees: "4" } });
  assert.equal(result.known_minimum_commitment, "249"); assert.equal(result.committed_future, "220");
});
test("P-08: indefinite renewal and non-contingent obligations are not finitely authorised", () => {
  for (const changed of [{ auto_renew: true }, { future_obligation_contingent_on_initial_payment: false }]) {
    const result = calculateCommitment({ price: "20", recurring: true, commercial_terms: { ...terms, ...changed } });
    assert.equal(result.known_minimum_commitment, "240"); assert.equal(result.bounded, false); assert.equal(result.committed_future, null);
  }
  assert.equal(calculateCommitment({ price: "20", recurring: true, commercial_terms: null }).bounded, false);
  assert.equal(calculateCommitment({ price: "20", recurring: true, commercial_terms: { ...terms, billing_model: "UNKNOWN_EXPOSURE" } }).known_minimum_commitment, null);
});
test("P-09: immediate available includes future collateral; commitment authority does not", () => {
  assert.deepEqual(budgetBreakdown({ allocated: "300", spent: "20", reserved: "0", committed_future: "220" }),
    { allocated: "300", spent: "20", reserved: "0", committed_future: "220", available_now: "280", available_to_commit: "60" });
  assert.throws(() => budgetBreakdown({ allocated: "300", spent: "81", reserved: "0", committed_future: "220" }), /INVALID_BUDGET_STATE/u);
});
test("P-06/T-01: exact large amounts, overflow and invalid monetary representations", () => {
  const amount = (1n << 100n).toString();
  assert.equal(calculateCommitment({ price: amount, recurring: false, commercial_terms: null }).known_minimum_commitment, amount);
  assert.throws(() => calculateCommitment({ price: ((1n << 128n) - 1n).toString(), recurring: true,
    commercial_terms: { ...terms, period_charge: ((1n << 128n) - 1n).toString() } }), /COMMITMENT_OVERFLOW/u);
  for (const bad of [20, "-1", "01", "1e24", "1.0", "340282366920938463463374607431768211456"]) assert.throws(() => integerAmount(bad));
});
test("P-08: price/cadence/period/hash mismatches cannot become acceptable terms", () => {
  for (const changed of [{ required_periods: 0 }, { required_periods: 121 }, { required_periods: 12.5 }, { cadence: "ONCE" as const },
    { period_charge: "19" }, { cancellation_terms_hash: "invalid" }]) {
    assert.throws(() => calculateCommitment({ price: "20", recurring: true, commercial_terms: { ...terms, ...changed } }));
  }
});
test("P-06: all-inclusive one-time quote and explicit one-time terms agree", () => {
  const one = { ...terms, billing_model: "ONE_TIME" as const, cadence: "ONCE" as const, required_periods: 1 };
  assert.equal(calculateCommitment({ price: "20", recurring: false, commercial_terms: one }).committed_future, "0");
  assert.equal(calculateCommitment({ price: "20", recurring: false, commercial_terms: null }).known_minimum_commitment, "20");
});
