import { integerAmount } from "../purchasing/commitment.ts";

/** Local preview of gate.rs view evaluation. Not contract storage/identity proof. */
export const RULES = [
  "AGENT_IDENTITY", "CAPSULE_ACTIVE", "CAPSULE_EXPIRY", "REQUEST_UNIQUE", "QUOTE_EXISTS", "QUOTE_HASH",
  "PROVIDER_REGISTERED", "PROVIDER_BINDING", "PROVIDER_ALLOWED", "PROVIDER_ACTIVE", "RECIPIENT_BOUND",
  "QUOTE_EXPIRY", "QUOTE_UNUSED", "NATIVE_ASSET", "SERVICE_ALLOWED", "CATEGORY_ALLOWED", "QUANTITY_ALLOWED",
  "RECURRING_POLICY", "POSITIVE_PRICE", "PURCHASE_LIMIT", "AVAILABLE_BUDGET", "PROJECT_BOUND", "PROJECT_ACTIVE",
  "PROJECT_REVISION", "PROJECT_EXPIRY", "COMMITMENT_BOUNDED", "RESOURCE_UNIQUE", "COMMITMENT_LIMIT", "COMMITMENT_BUDGET",
] as const;
export type Rule = typeof RULES[number];
export type Decision = "APPROVED" | "APPROVAL_REQUIRED" | "DENIED";
export type CheckState = "PASSED" | "FAILED" | "NOT_EVALUATED";
export interface GateQuote {
  provider_id: string; publisher_id: string; recipient_id: string;
  registered_publisher: string | null; registered_recipient: string | null;
  active: boolean; consumed: boolean; expires_at_ns: string; asset: string;
  service_id: string; category: string; quantity: number; recurring: boolean;
  price: string; future_commitment: string | null; canonical_hash: string;
}
export interface GateContext {
  agent: { bound_account: string; bound_key: string; predecessor: string; signer: string; signer_key: string };
  project: { bound: boolean; active: boolean; fresh: boolean; expires_at_ns: string };
  capsule: {
    state: "ACTIVE" | "PAUSED" | "REVOKED" | "COMPLETED" | "CLOSING" | "CLOSED";
    expires_at_ns: string; original_budget: string; allocated: string; spent: string; reserved: string;
    committed_future: string; returned: string; per_purchase_limit: string; per_commitment_limit: string;
    recurring_allowed: boolean; providers: readonly string[]; services: readonly string[]; categories: readonly string[];
    max_quantity: number; approval_threshold: string | null;
  };
  quote: GateQuote | null; expected_quote_hash: string;
  request_exists: boolean; resource_duplicate: boolean; now_ns: string;
}
export function evaluateGate(context: GateContext) {
  const checks: { rule: Rule; state: CheckState }[] = RULES.map(rule => ({ rule, state: "NOT_EVALUATED" }));
  const reasons: string[] = [];
  const record = (index: number, passed: boolean, reason: string) => {
    checks[index].state = passed ? "PASSED" : "FAILED";
    if (!passed) reasons.push(reason);
    return passed;
  };
  const finish = (decision: Decision = "DENIED") => Object.freeze({
    decision, checks: Object.freeze(checks.map(check => Object.freeze(check))), reasons: Object.freeze(reasons),
    source: "BROWSER_SIMULATION" as const, grants_payment_authority: false as const,
  });
  const a = context.agent, c = context.capsule, p = context.project;
  const now = integerAmount(context.now_ns);
  if (!record(0, a.predecessor === a.bound_account && a.signer === a.bound_account && a.signer_key === a.bound_key, "UNAUTHORIZED_AGENT")) return finish();
  if (!record(21, p.bound, "PROJECT_BINDING_MISMATCH") || !record(22, p.active, "PROJECT_INACTIVE")
    || !record(23, p.fresh, "STALE_PROJECT_REVISION") || !record(24, now < integerAmount(p.expires_at_ns), "PROJECT_EXPIRED")) return finish();
  if (!record(1, c.state === "ACTIVE", "CAPSULE_INACTIVE") || !record(2, now < integerAmount(c.expires_at_ns), "CAPSULE_EXPIRED")) return finish();
  if (!record(3, !context.request_exists, "REQUEST_REPLAY") || !record(4, context.quote !== null, "UNKNOWN_QUOTE")) return finish();
  const q = context.quote!;
  if (!record(5, context.expected_quote_hash === q.canonical_hash, "QUOTE_TERMS_MISMATCH")) return finish();
  if (!record(6, q.registered_publisher !== null && q.registered_recipient !== null, "UNKNOWN_PROVIDER")) return finish();
  record(7, q.registered_publisher === q.publisher_id, "PROVIDER_BINDING_MISMATCH");
  record(8, c.providers.includes(q.provider_id), "PROVIDER_NOT_ALLOWED");
  record(9, q.active, "PROVIDER_SUSPENDED");
  record(10, q.registered_recipient === q.recipient_id, "RECIPIENT_MISMATCH");
  record(11, now < integerAmount(q.expires_at_ns), "QUOTE_EXPIRED");
  record(12, !q.consumed, "QUOTE_CONSUMED");
  record(13, q.asset === "near-native", "UNSUPPORTED_ASSET");
  record(14, c.services.includes(q.service_id), "SERVICE_NOT_ALLOWED");
  record(15, c.categories.includes(q.category), "CATEGORY_NOT_ALLOWED");
  record(16, q.quantity > 0 && q.quantity <= c.max_quantity, "QUANTITY_LIMIT_EXCEEDED");
  record(17, !q.recurring || c.recurring_allowed, "RECURRING_FORBIDDEN");
  const price = integerAmount(q.price);
  record(18, price > 0n, "INVALID_QUOTE_AMOUNT");
  record(19, price <= integerAmount(c.per_purchase_limit), "PURCHASE_LIMIT_EXCEEDED");
  const max = (1n << 128n) - 1n;
  const candidate = q.future_commitment === null ? null : price + integerAmount(q.future_commitment);
  const total = candidate !== null && candidate <= max ? candidate : null;
  record(25, total !== null, "UNBOUNDED_COMMITMENT");
  record(26, !context.resource_duplicate, "DUPLICATE_RESOURCE");
  if (total !== null) record(27, total <= integerAmount(c.per_commitment_limit), "COMMITMENT_LIMIT_EXCEEDED");
  const allocated = integerAmount(c.allocated), spent = integerAmount(c.spent), reserved = integerAmount(c.reserved);
  const future = integerAmount(c.committed_future);
  const available = allocated - spent - reserved;
  const valid = allocated + integerAmount(c.returned) === integerAmount(c.original_budget) && available >= 0n && future <= available;
  if (!valid) record(20, false, "INVALID_BUDGET_STATE");
  else record(20, price <= available, "INSUFFICIENT_AVAILABLE_BUDGET");
  if (total !== null && valid) record(28, total <= available - future, "INSUFFICIENT_COMMITMENT_BUDGET");
  if (reasons.length) return finish();
  return finish(q.recurring || c.approval_threshold !== null && total !== null && total > integerAmount(c.approval_threshold) ? "APPROVAL_REQUIRED" : "APPROVED");
}

export const RULE_LABELS: Record<Rule, string> = {
  AGENT_IDENTITY: "Bound agent account and key", CAPSULE_ACTIVE: "Active capsule", CAPSULE_EXPIRY: "Capsule within expiry",
  REQUEST_UNIQUE: "Unique request", QUOTE_EXISTS: "Canonical quote exists", QUOTE_HASH: "Exact quote hash",
  PROVIDER_REGISTERED: "Registered provider", PROVIDER_BINDING: "Bound publisher", PROVIDER_ALLOWED: "Allowed provider",
  PROVIDER_ACTIVE: "Active provider", RECIPIENT_BOUND: "Pinned recipient", QUOTE_EXPIRY: "Quote within expiry", QUOTE_UNUSED: "Unused quote",
  NATIVE_ASSET: "Native NEAR only", SERVICE_ALLOWED: "Allowed service", CATEGORY_ALLOWED: "Allowed category", QUANTITY_ALLOWED: "Quantity within scope",
  RECURRING_POLICY: "Recurring policy permits review", POSITIVE_PRICE: "Positive canonical price", PURCHASE_LIMIT: "Immediate purchase cap",
  AVAILABLE_BUDGET: "Available immediate funds", PROJECT_BOUND: "Correct project", PROJECT_ACTIVE: "Active project",
  PROJECT_REVISION: "Current project revision", PROJECT_EXPIRY: "Project within expiry", COMMITMENT_BOUNDED: "Bounded full commitment",
  RESOURCE_UNIQUE: "Unique project resource", COMMITMENT_LIMIT: "Full commitment cap", COMMITMENT_BUDGET: "Available commitment authority",
};
