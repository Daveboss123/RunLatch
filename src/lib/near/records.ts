/** Bounded contract DTOs. Parsing/hashes establish consistency, never chain truth or authority. */
import { integerAmount, type CommercialTerms } from "../purchasing/commitment.ts";
import { commercialQuoteHash, type CanonicalQuoteInput, type CanonicalQuoteTerms } from "../purchasing/hashing.ts";

export const PURCHASE_STATES = ["DENIED", "APPROVAL_PENDING", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED", "CANCELLED", "EXPIRED"] as const;
export type PurchaseState = typeof PURCHASE_STATES[number];
export interface Proposal {
  readonly project_id: string; readonly project_revision: string; readonly capsule_id: string;
  readonly request_id: string; readonly quote_id: string; readonly expected_quote_hash: string;
}
export interface Provider {
  readonly provider_id: string; readonly publisher_id: string; readonly recipient_id: string;
  readonly active: boolean; readonly quote_count: number;
}
export interface RegisteredQuote {
  readonly terms: CanonicalQuoteTerms; readonly quote_hash: string; readonly consumed: boolean;
  readonly consumed_by: string | null; readonly published_at_ns: string;
}
export interface Purchase {
  readonly proposal: Proposal; readonly request_hash: string; readonly policy_hash: string;
  readonly canonical_quote: CanonicalQuoteTerms | null; readonly decision: "APPROVED" | "APPROVAL_REQUIRED" | "DENIED";
  readonly checks: readonly { readonly rule: string; readonly state: "PASSED" | "FAILED" | "NOT_EVALUATED" }[];
  readonly reason_codes: readonly string[]; readonly status: PurchaseState;
  readonly reserved_amount: string; readonly committed_future_amount: string; readonly resource_fingerprint: string | null;
  readonly created_at_ns: string; readonly approval_expires_at_ns: string; readonly approved_by: string | null;
  readonly resolved_at_ns: string | null; readonly reconciliation_required: boolean;
}
export const fail = (code: string): never => { throw new Error(code); };
export function object(value: unknown, fields?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get || d.set)) return fail("INVALID_CONTRACT_OBJECT");
  const result = value as Record<string, unknown>;
  if (fields && (Object.keys(result).length !== fields.length || fields.some(k => !Object.hasOwn(result, k)))) return fail("INVALID_CONTRACT_FIELDS");
  return result;
}
export const id = (v: unknown): string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(v) ? v : fail("INVALID_CONTRACT_ID");
export const hash = (v: unknown): string => typeof v === "string" && /^[0-9a-f]{64}$/u.test(v) ? v : fail("INVALID_CONTRACT_HASH");
export const reference = (v: unknown): string => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(v) ? v : fail("INVALID_EXECUTION_REFERENCE");
export const account = (v: unknown): string => typeof v === "string" && /^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$/u.test(v) ? v : fail("INVALID_CONTRACT_ACCOUNT");
export const time = (v: unknown): string => typeof v === "string" && /^(0|[1-9][0-9]{0,19})$/u.test(v) && BigInt(v) < (1n << 64n) ? v : fail("INVALID_CONTRACT_TIME");
export const amount = (v: unknown): string => { integerAmount(v); return v as string; };
export const boolean = (v: unknown): boolean => typeof v === "boolean" ? v : fail("INVALID_CONTRACT_BOOLEAN");
export const count = (v: unknown, max: number): number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max ? v : fail("INVALID_CONTRACT_COUNT");
export const enumValue = <T extends string>(v: unknown, values: readonly T[]): T => typeof v === "string" && values.includes(v as T) ? v as T : fail("INVALID_CONTRACT_STATE");
export function list(v: unknown, max: number): unknown[] { return Array.isArray(v) && v.length <= max ? v : fail("CONTRACT_LIST_LIMIT"); }
const nullable = <T>(v: unknown, parse: (value: unknown) => T): T | null => v === null ? null : parse(v);

/** Detect repeated keys at each nesting level, including escaped spellings; bound depth before traversal. */
export function parseBoundedJson(text: string, max = 1_048_576): unknown {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > max) return fail("CONTRACT_INPUT_LIMIT");
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fail("INVALID_CONTRACT_JSON"); }
  const stack: { keys: Set<string> | null; key: boolean }[] = [];
  for (const token of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\],:]|[^\s{}\[\],:]+/gu)) {
    const t = token[0], top = stack.at(-1);
    if (t === "{" || t === "[") {
      if (stack.length >= 24) return fail("CONTRACT_JSON_DEPTH");
      stack.push({ keys: t === "{" ? new Set() : null, key: t === "{" });
    } else if (t === "}" || t === "]") stack.pop();
    else if (t === "," && top?.keys) top.key = true;
    else if (t.startsWith('"') && top?.keys && top.key) {
      const key: string = JSON.parse(t);
      if (top.keys.has(key)) return fail("DUPLICATE_CONTRACT_FIELD");
      top.keys.add(key); top.key = false;
    }
  }
  return value;
}

export function parseProposal(v: unknown): Proposal {
  const p = object(v, ["project_id", "project_revision", "capsule_id", "request_id", "quote_id", "expected_quote_hash"]);
  return Object.freeze({ project_id: id(p.project_id), project_revision: time(p.project_revision), capsule_id: id(p.capsule_id),
    request_id: id(p.request_id), quote_id: id(p.quote_id), expected_quote_hash: hash(p.expected_quote_hash) });
}
export function parseProvider(v: unknown): Provider {
  const p = object(v, ["provider_id", "publisher_id", "recipient_id", "active", "quote_count"]);
  return Object.freeze({ provider_id: id(p.provider_id), publisher_id: account(p.publisher_id), recipient_id: account(p.recipient_id),
    active: boolean(p.active), quote_count: count(p.quote_count, 32) });
}
export function parseQuoteTerms(v: unknown): CanonicalQuoteTerms {
  const t = object(v, ["input", "publisher_id", "schema_version"]);
  if (t.schema_version !== 2) return fail("UNSUPPORTED_CONTRACT_SCHEMA");
  const q = object(t.input, ["quote_id", "provider_id", "recipient_id", "service_id", "category", "resource_key", "quantity", "price", "asset", "recurring", "expires_at_ns", "previous_quote_id", "commercial_terms"]);
  let commercial: CommercialTerms | null = null;
  if (q.commercial_terms !== null) {
    const c = object(q.commercial_terms, ["billing_model", "cadence", "period_charge", "required_periods", "mandatory_fees", "known_taxes", "setup_fees", "auto_renew", "cancellation_terms_hash", "source_evidence_hash", "future_obligation_contingent_on_initial_payment"]);
    commercial = Object.freeze({ billing_model: enumValue(c.billing_model, ["ONE_TIME", "FIXED_RECURRING", "UNKNOWN_EXPOSURE"]),
      cadence: enumValue(c.cadence, ["ONCE", "MONTHLY", "ANNUAL"]), period_charge: amount(c.period_charge), required_periods: count(c.required_periods, 120),
      mandatory_fees: amount(c.mandatory_fees), known_taxes: amount(c.known_taxes), setup_fees: amount(c.setup_fees), auto_renew: boolean(c.auto_renew),
      cancellation_terms_hash: hash(c.cancellation_terms_hash), source_evidence_hash: hash(c.source_evidence_hash),
      future_obligation_contingent_on_initial_payment: boolean(c.future_obligation_contingent_on_initial_payment) });
  }
  const input: CanonicalQuoteInput = Object.freeze({ quote_id: id(q.quote_id), provider_id: id(q.provider_id), recipient_id: account(q.recipient_id),
    service_id: id(q.service_id), category: id(q.category), resource_key: id(q.resource_key), quantity: count(q.quantity, 50), price: amount(q.price),
    asset: enumValue(q.asset, ["near-native"]), recurring: boolean(q.recurring), expires_at_ns: time(q.expires_at_ns),
    previous_quote_id: nullable(q.previous_quote_id, id), commercial_terms: commercial });
  return Object.freeze({ input, publisher_id: account(t.publisher_id), schema_version: 2 });
}
export async function parseQuote(v: unknown, contract: string, providers: readonly Provider[]): Promise<RegisteredQuote> {
  const q = object(v, ["terms", "quote_hash", "consumed", "consumed_by", "published_at_ns"]);
  const terms = parseQuoteTerms(q.terms), digest = hash(q.quote_hash);
  const provider = providers.find(p => p.provider_id === terms.input.provider_id);
  if (!provider || provider.publisher_id !== terms.publisher_id || provider.recipient_id !== terms.input.recipient_id) return fail("CANONICAL_PROVIDER_BINDING_MISMATCH");
  if (await commercialQuoteHash(terms, "testnet", account(contract)) !== digest) return fail("CANONICAL_QUOTE_HASH_MISMATCH");
  const consumed = boolean(q.consumed), consumedBy = nullable(q.consumed_by, v => {
    if (typeof v !== "string" || !/^[A-Za-z0-9_-]{1,64}:[A-Za-z0-9_-]{1,64}$/u.test(v)) return fail("INVALID_CONSUMPTION_BINDING");
    return v;
  });
  if (consumed !== (consumedBy !== null)) return fail("INVALID_CONSUMPTION_BINDING");
  return Object.freeze({ terms, quote_hash: digest, consumed, consumed_by: consumedBy, published_at_ns: time(q.published_at_ns) });
}
export function parsePurchase(v: unknown): Purchase {
  const p = object(v, ["proposal", "request_hash", "policy_hash", "canonical_quote", "decision", "checks", "reason_codes", "status", "reserved_amount", "committed_future_amount", "resource_fingerprint", "created_at_ns", "approval_expires_at_ns", "approved_by", "resolved_at_ns", "reconciliation_required"]);
  return Object.freeze({ proposal: parseProposal(p.proposal), request_hash: hash(p.request_hash), policy_hash: hash(p.policy_hash),
    canonical_quote: nullable(p.canonical_quote, parseQuoteTerms), decision: enumValue(p.decision, ["APPROVED", "APPROVAL_REQUIRED", "DENIED"]),
    checks: Object.freeze(list(p.checks, 29).map(v => { const c = object(v, ["rule", "state"]); return Object.freeze({ rule: id(c.rule), state: enumValue(c.state, ["PASSED", "FAILED", "NOT_EVALUATED"]) }); })),
    reason_codes: Object.freeze(list(p.reason_codes, 32).map(id)), status: enumValue(p.status, PURCHASE_STATES),
    reserved_amount: amount(p.reserved_amount), committed_future_amount: amount(p.committed_future_amount), resource_fingerprint: nullable(p.resource_fingerprint, hash),
    created_at_ns: time(p.created_at_ns), approval_expires_at_ns: time(p.approval_expires_at_ns), approved_by: nullable(p.approved_by, account),
    resolved_at_ns: nullable(p.resolved_at_ns, time), reconciliation_required: boolean(p.reconciliation_required) });
}

/** A draft envelope only. No receiver/amount/key or payment authority can be supplied by an agent. */
export function proposalFromQuote(projectId: string, revision: string, capsuleId: string, requestId: string, quote: RegisteredQuote): Proposal {
  return parseProposal({ project_id: projectId, project_revision: revision, capsule_id: capsuleId, request_id: requestId,
    quote_id: quote.terms.input.quote_id, expected_quote_hash: quote.quote_hash });
}
