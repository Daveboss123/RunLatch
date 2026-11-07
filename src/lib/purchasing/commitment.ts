/** Exact commercial-term preview. This never grants payment authority. */
export type BillingModel = "ONE_TIME" | "FIXED_RECURRING" | "UNKNOWN_EXPOSURE";
export interface CommercialTerms {
  readonly billing_model: BillingModel;
  readonly cadence: "ONCE" | "MONTHLY" | "ANNUAL";
  readonly period_charge: string;
  readonly required_periods: number;
  readonly mandatory_fees: string;
  readonly known_taxes: string;
  readonly setup_fees: string;
  readonly auto_renew: boolean;
  readonly cancellation_terms_hash: string;
  readonly source_evidence_hash: string;
  readonly future_obligation_contingent_on_initial_payment: boolean;
}
export interface CommitmentQuote {
  readonly price: string;
  readonly recurring: boolean;
  readonly commercial_terms: CommercialTerms | null;
}
const MAX = (1n << 128n) - 1n;
const fail = (code: string): never => { throw new Error(code); };
export function integerAmount(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,38})$/u.test(value)) return fail("INVALID_INTEGER_AMOUNT");
  const result = BigInt(value);
  if (result > MAX) return fail("INTEGER_AMOUNT_OVERFLOW");
  return result;
}
const sum = (...values: bigint[]) => {
  const result = values.reduce((a, b) => a + b, 0n);
  if (result > MAX) return fail("COMMITMENT_OVERFLOW");
  return result;
};

export function calculateCommitment(quote: CommitmentQuote) {
  const now = integerAmount(quote.price);
  if (now === 0n || typeof quote.recurring !== "boolean") return fail("INVALID_QUOTE_AMOUNT");
  const terms = quote.commercial_terms;
  if (terms === null) {
    return Object.freeze({ amount_due_now: now.toString(), known_minimum_commitment: quote.recurring ? null : now.toString(),
      committed_future: quote.recurring ? null : "0", bounded: !quote.recurring,
      reason_code: quote.recurring ? "UNBOUNDED_COMMITMENT" : null,
      calculation: "CANONICAL_ALL_INCLUSIVE_ONE_TIME_PRICE" as const, grants_payment_authority: false as const });
  }
  if (!terms || !["ONE_TIME", "FIXED_RECURRING", "UNKNOWN_EXPOSURE"].includes(terms.billing_model)
    || !["ONCE", "MONTHLY", "ANNUAL"].includes(terms.cadence)
    || typeof terms.auto_renew !== "boolean" || typeof terms.future_obligation_contingent_on_initial_payment !== "boolean"
    || typeof terms.cancellation_terms_hash !== "string" || !/^[0-9a-f]{64}$/u.test(terms.cancellation_terms_hash)
    || typeof terms.source_evidence_hash !== "string" || !/^[0-9a-f]{64}$/u.test(terms.source_evidence_hash)
    || !Number.isSafeInteger(terms.required_periods) || terms.required_periods < 1 || terms.required_periods > 120) return fail("INVALID_COMMERCIAL_TERMS");
  const periodic = integerAmount(terms.period_charge);
  const upfront = sum(integerAmount(terms.mandatory_fees), integerAmount(terms.known_taxes), integerAmount(terms.setup_fees));
  if (terms.billing_model === "UNKNOWN_EXPOSURE") {
    return Object.freeze({ amount_due_now: now.toString(), known_minimum_commitment: null, committed_future: null,
      bounded: false, reason_code: "UNBOUNDED_COMMITMENT", calculation: "UNKNOWN_EXPOSURE" as const, grants_payment_authority: false as const });
  }
  const recurring = terms.billing_model === "FIXED_RECURRING";
  if (quote.recurring !== recurring || recurring && terms.cadence === "ONCE"
    || !recurring && (terms.cadence !== "ONCE" || terms.required_periods !== 1)
    || periodic === 0n || sum(periodic, upfront) !== now) return fail("COMMERCIAL_AMOUNT_MISMATCH");
  const total = sum(periodic * BigInt(terms.required_periods), upfront);
  const bounded = !terms.auto_renew && terms.future_obligation_contingent_on_initial_payment;
  return Object.freeze({ amount_due_now: now.toString(), known_minimum_commitment: total.toString(),
    committed_future: bounded ? (total - now).toString() : null, bounded,
    reason_code: bounded ? null : "UNBOUNDED_COMMITMENT", calculation: "FIXED_TERM_PLUS_UPFRONT_CHARGES" as const,
    grants_payment_authority: false as const });
}

/** All balances are canonical input observations, not verified by this reducer. */
export function budgetBreakdown(input: { allocated: string; spent: string; reserved: string; committed_future: string }) {
  const allocated = integerAmount(input.allocated), spent = integerAmount(input.spent), reserved = integerAmount(input.reserved);
  const future = integerAmount(input.committed_future);
  if (sum(spent, reserved, future) > allocated) return fail("INVALID_BUDGET_STATE");
  return Object.freeze({ ...input, available_now: (allocated - spent - reserved).toString(),
    available_to_commit: (allocated - spent - reserved - future).toString() });
}
