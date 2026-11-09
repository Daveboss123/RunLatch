import { calculateCommitment, budgetBreakdown } from "../purchasing/commitment.ts";
import type { CanonicalQuoteInput } from "../purchasing/hashing.ts";
import { parseNear } from "./money.ts";
import type { GateContext } from "./gate.ts";
import { BROWSER_EXECUTION } from "../execution.ts";

export const DEMO_DOMAIN = { network: "testnet", contract: "preview.runlatch.testnet" } as const;
export const DEMO_EXECUTION = BROWSER_EXECUTION;
// This contract name is a hash-domain fixture, never a deployed account/link.
export const DEMO_TIME = "1794052800000000000";
export const DEMO_EXPIRY = "1794139200000000000";
/** The demo is frozen at this historical clock; it is never presented as a live, still-valid quote. */
export const DEMO_CLOCK = Object.freeze({
  now_ns: DEMO_TIME, now_iso: "2026-11-07T12:00:00.000Z", expiry_ns: DEMO_EXPIRY, expiry_iso: "2026-11-08T12:00:00.000Z",
  label: "7 Nov 2026 12:00 UTC", expiry_label: "8 Nov 2026 12:00 UTC",
});
const quote = (id: string, provider: string, service: string, amount: string): CanonicalQuoteInput => ({
  quote_id: id, provider_id: provider, recipient_id: `${provider}.fixture.testnet`, service_id: service,
  category: "infrastructure", resource_key: `${service}-booking-01`, quantity: 1, price: parseNear(amount),
  asset: "near-native", recurring: false, expires_at_ns: DEMO_EXPIRY, previous_quote_id: null, commercial_terms: null,
});
export const QUOTES = [
  { label: "Database · one-time", input: quote("database-demo-01", "database", "database-instance", "0.5") },
  { label: "Hosting · one-time", input: quote("hosting-demo-01", "hosting", "hosting-instance", "0.2") },
  { label: "Hosting · 12-month term", input: {
    ...quote("hosting-term-demo-01", "hosting", "hosting-instance", "0.2"), recurring: true,
    commercial_terms: {
      billing_model: "FIXED_RECURRING", cadence: "MONTHLY", period_charge: parseNear("0.2"), required_periods: 12,
      mandatory_fees: "0", known_taxes: "0", setup_fees: "0", auto_renew: false,
      cancellation_terms_hash: "a".repeat(64), source_evidence_hash: "b".repeat(64),
      future_obligation_contingent_on_initial_payment: true,
    },
  } satisfies CanonicalQuoteInput },
  { label: "Database · expired fixture", input: { ...quote("database-expired-demo-01", "database", "database-instance", "0.5"), expires_at_ns: DEMO_TIME } },
  { label: "Hosting · uncapped fixture", input: { ...quote("hosting-uncapped-demo-01", "hosting", "hosting-instance", "0.2"), recurring: true, commercial_terms: null } },
  { label: "Database · concurrent request", input: quote("database-concurrent-demo-01", "database", "database-instance", "1.3") },
] as const;
export const DEMO_BUDGET = budgetBreakdown({ allocated: parseNear("3"), spent: parseNear("0.5"), reserved: parseNear("0.2"), committed_future: "0" });
export type Scenario = "valid" | "approval" | "tamper" | "over-budget" | "stale" | "revoked" | "replay" | "duplicate" | "recurring" | "expired" | "unregistered" | "cancelled" | "unbounded" | "concurrent";
export type ScenarioCategory = "Baseline" | "Identity & scope" | "Quote integrity" | "Budget & commitment" | "Lifecycle & replay";
export const SCENARIO_CATEGORIES: readonly ScenarioCategory[] = ["Baseline", "Identity & scope", "Quote integrity", "Budget & commitment", "Lifecycle & replay"];
export const SCENARIOS: readonly { id: Scenario; label: string; description: string; category: ScenarioCategory }[] = [
  { id: "valid", label: "Valid request", description: "A fresh database quote within this capsule's scope.", category: "Baseline" },
  { id: "approval", label: "Owner review", description: "An eligible fixed-term quote still requires exact human approval. Browser preview only; no wallet approval is performed.", category: "Baseline" },
  { id: "tamper", label: "Alter recipient", description: "Hash a changed quote copy. The registered quote stays untouched.", category: "Quote integrity" },
  { id: "over-budget", label: "Over budget", description: "Lower the hypothetical allocation; no real authority changes.", category: "Budget & commitment" },
  { id: "stale", label: "Stale project", description: "An owner revision has invalidated the original capsule reference.", category: "Lifecycle & replay" },
  { id: "recurring", label: "Hidden term", description: "0.20 due now is 2.40 over a fixed 12-month minimum term.", category: "Budget & commitment" },
  { id: "replay", label: "Replay request", description: "The same request already exists. The original is not overwritten.", category: "Lifecycle & replay" },
  { id: "duplicate", label: "Duplicate resource", description: "The exact project resource was already claimed by another request.", category: "Lifecycle & replay" },
  { id: "revoked", label: "Revoked capsule", description: "Revocation stops new authority; it does not recall pending transfers.", category: "Lifecycle & replay" },
  { id: "expired", label: "Expired quote", description: "Select a separate canonical fixture whose expiry equals the demo time. The valid quote is not edited.", category: "Quote integrity" },
  { id: "unregistered", label: "Unregistered vendor", description: "Simulate a missing provider registration; a known-looking quote cannot supply trusted registry identity.", category: "Identity & scope" },
  { id: "cancelled", label: "Cancelled project", description: "Owner-authenticated project status is inactive. Being inside the amount limit cannot authorize the purchase.", category: "Lifecycle & replay" },
  { id: "unbounded", label: "Uncapped exposure", description: "A recurring fixture has no finite supported term. Unknown commitment is not zero and cannot be approved.", category: "Budget & commitment" },
  { id: "concurrent", label: "Concurrent request", description: "Illustrative interleaving, not two browser submissions: two 1.30 NEAR requests each fit 2.30 alone. The first reserves 1.30; this later request sees only 1.00 and is denied. Rust tests enforce atomic reservation.", category: "Budget & commitment" },
];

/** One source for controls, preview initial inputs and expectation tests. */
export const SCENARIO_PRESETS: Record<Scenario, { quote_index: number; allocation: string; expected: "APPROVED" | "APPROVAL_REQUIRED" | "DENIED"; reason: string | null }> = {
  valid: {quote_index:0,allocation:"3",expected:"APPROVED",reason:null},
  approval: {quote_index:2,allocation:"4",expected:"APPROVAL_REQUIRED",reason:null},
  tamper: {quote_index:0,allocation:"3",expected:"DENIED",reason:"QUOTE_TERMS_MISMATCH"},
  "over-budget": {quote_index:0,allocation:"0.8",expected:"DENIED",reason:"INSUFFICIENT_AVAILABLE_BUDGET"},
  stale: {quote_index:0,allocation:"3",expected:"DENIED",reason:"STALE_PROJECT_REVISION"},
  revoked: {quote_index:0,allocation:"3",expected:"DENIED",reason:"CAPSULE_INACTIVE"},
  replay: {quote_index:0,allocation:"3",expected:"DENIED",reason:"REQUEST_REPLAY"},
  duplicate: {quote_index:0,allocation:"3",expected:"DENIED",reason:"DUPLICATE_RESOURCE"},
  recurring: {quote_index:2,allocation:"3",expected:"DENIED",reason:"INSUFFICIENT_COMMITMENT_BUDGET"},
  expired: {quote_index:3,allocation:"3",expected:"DENIED",reason:"QUOTE_EXPIRED"},
  unregistered: {quote_index:0,allocation:"3",expected:"DENIED",reason:"UNKNOWN_PROVIDER"},
  cancelled: {quote_index:0,allocation:"3",expected:"DENIED",reason:"PROJECT_INACTIVE"},
  unbounded: {quote_index:4,allocation:"3",expected:"DENIED",reason:"UNBOUNDED_COMMITMENT"},
  concurrent: {quote_index:5,allocation:"3",expected:"DENIED",reason:"INSUFFICIENT_AVAILABLE_BUDGET"},
};

export function demoContext(input: CanonicalQuoteInput, hash: string, budget: string, scenario: Scenario): GateContext {
  const commitment = calculateCommitment(input);
  const allocated = parseNear(budget);
  return {
    agent: { bound_account: "agent.fixture.testnet", bound_key: "public-fixture-key", predecessor: "agent.fixture.testnet", signer: "agent.fixture.testnet", signer_key: "public-fixture-key" },
    project: { bound: true, active: scenario !== "cancelled", fresh: scenario !== "stale", expires_at_ns: DEMO_EXPIRY },
    capsule: {
      state: scenario === "revoked" ? "REVOKED" : "ACTIVE", expires_at_ns: DEMO_EXPIRY,
      original_budget: allocated, allocated, spent: parseNear("0.5"),
      reserved: scenario === "concurrent" ? parseNear("1.5") : parseNear("0.2"), committed_future: "0", returned: "0",
      per_purchase_limit: parseNear(scenario === "concurrent" ? "1.3" : "1"), per_commitment_limit: parseNear("3"), recurring_allowed: true,
      providers: ["database", "hosting"], services: ["database-instance", "hosting-instance"], categories: ["infrastructure"],
      max_quantity: 1, approval_threshold: scenario === "concurrent" ? null : parseNear("0.6"),
    },
    quote: {
      provider_id: input.provider_id, publisher_id: input.recipient_id, recipient_id: input.recipient_id,
      registered_publisher: scenario === "unregistered" ? null : input.recipient_id, registered_recipient: scenario === "unregistered" ? null : input.recipient_id, active: true, consumed: false,
      expires_at_ns: input.expires_at_ns, asset: input.asset, service_id: input.service_id, category: input.category,
      quantity: input.quantity, recurring: input.recurring, price: input.price, future_commitment: commitment.committed_future, canonical_hash: hash,
    },
    expected_quote_hash: hash, request_exists: scenario === "replay", resource_duplicate: scenario === "duplicate", now_ns: DEMO_TIME,
  };
}
