import { integerAmount } from "../purchasing/commitment.ts";

/** Purchasing terms only. Not a deployable Rust Policy or payment authority. */
export interface PolicyTerms {
  readonly project_id: string;
  readonly project_revision: string;
  readonly budget: string;
  readonly per_purchase_limit: string;
  readonly per_commitment_limit: string;
  readonly recurring_policy: "FORBIDDEN" | "REQUIRE_APPROVAL";
  readonly allowed_provider_ids: readonly string[];
  readonly allowed_service_ids: readonly string[];
  readonly allowed_categories: readonly string[];
  readonly max_quantity: number;
  readonly approval_threshold: string | null;
  readonly expires_at_ns: string;
}
export interface ProviderRecord {
  readonly id: string;
  readonly recipient: string;
  readonly active: boolean;
  readonly services: readonly string[];
  readonly categories: readonly string[];
}
export interface PolicyContext {
  readonly project_id: string;
  readonly project_revision: string;
  readonly project_active: boolean;
  readonly budget_ceiling: string;
  readonly allocated_authority: string;
  readonly now_ns: string;
  readonly project_expires_at_ns: string;
  readonly providers: readonly ProviderRecord[];
}
export interface PolicyIssue { readonly code: string; readonly field: string; readonly message: string }
export type PolicyValidation = { readonly ok: true; readonly policy: PolicyTerms; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly PolicyIssue[] };
export const MAX_POLICY_JSON = 8192;
export const POLICY_FIELDS = ["project_id", "project_revision", "budget", "per_purchase_limit", "per_commitment_limit",
  "recurring_policy", "allowed_provider_ids", "allowed_service_ids", "allowed_categories", "max_quantity",
  "approval_threshold", "expires_at_ns"] as const;
const listFields = ["allowed_provider_ids", "allowed_service_ids", "allowed_categories"] as const;
const moneyFields = ["budget", "per_purchase_limit", "per_commitment_limit", "approval_threshold"] as const;
const uint64 = (v: unknown): v is string => typeof v === "string" && /^(0|[1-9][0-9]{0,19})$/u.test(v) && BigInt(v) <= (1n << 64n) - 1n;
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Unknown fields (including substituted recipients and AI decisions) fail closed. */
export function validatePolicy(value: unknown, context: PolicyContext): PolicyValidation {
  const issues: PolicyIssue[] = [];
  const add = (code: string, field: string, message: string) => issues.push({ code, field, message });
  if (!object(value)) return { ok: false, issues: [{ code: "INVALID_POLICY_OBJECT", field: "json", message: "Enter one policy JSON object, not an array or a primitive." }] };
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.values(Object.getOwnPropertyDescriptors(value)).some(descriptor => descriptor.get || descriptor.set)) {
    return { ok: false, issues: [{ code: "INVALID_POLICY_OBJECT", field: "json", message: "Use plain JSON data, not class instances or property accessors." }] };
  }
  for (const key of Object.keys(value)) if (!POLICY_FIELDS.some(field => field === key)) add("UNKNOWN_FIELD", "json", `Remove unsupported field ${key.slice(0, 64)}. Drafts cannot set recipients or authorization outcomes.`);
  for (const field of POLICY_FIELDS) if (!Object.hasOwn(value, field)) add("MISSING_FIELD", field, `Specify ${field}; no missing limit or condition is inferred.`);
  if (value.project_id !== context.project_id) add("PROJECT_MISMATCH", "project_id", "Use the selected project. A draft cannot change project authority.");
  if (!uint64(value.project_revision) || value.project_revision !== context.project_revision) add("STALE_PROJECT_REVISION", "project_revision", "Use the current owner-reviewed project revision.");
  if (!context.project_active) add("PROJECT_INACTIVE", "project_id", "The selected project has no active authority.");
  for (const field of moneyFields) {
    if (field === "approval_threshold" && value[field] === null) continue;
    try {
      const amount = integerAmount(value[field]);
      if (field !== "approval_threshold" && amount === 0n) add("ZERO_LIMIT", field, "This spending limit must be greater than zero.");
    } catch { add("INVALID_AMOUNT", field, "Use a bounded integer yoctoNEAR decimal string, not a number, fraction or negative amount."); }
  }
  if (value.recurring_policy !== "FORBIDDEN" && value.recurring_policy !== "REQUIRE_APPROVAL") add("INVALID_RECURRING_POLICY", "recurring_policy", "Either forbid recurring purchases or require exact owner approval of bounded terms.");
  for (const field of listFields) {
    const list = value[field];
    const maximum = field === "allowed_provider_ids" ? 3 : 4;
    if (!Array.isArray(list) || list.length < 1 || list.length > maximum || list.some(item => typeof item !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/u.test(item))) {
      add("INVALID_SCOPE", field, `Select 1–${maximum} explicit, bounded IDs. Wildcards are not supported.`);
    } else if (new Set(list).size !== list.length) add("DUPLICATE_SCOPE", field, "List each allowed ID once.");
  }
  if (!Number.isSafeInteger(value.max_quantity) || (value.max_quantity as number) < 1 || (value.max_quantity as number) > 50) add("INVALID_QUANTITY", "max_quantity", "Set a whole-number quantity from 1 to 50.");
  if (!uint64(value.expires_at_ns)) add("INVALID_EXPIRY", "expires_at_ns", "Use a bounded integer nanosecond timestamp string.");
  if (issues.length) return { ok: false, issues: issues.slice(0, 32) };
  // Shape checks above precede this narrowing; copy/freeze prevents draft mutation.
  const policy = value as unknown as PolicyTerms;
  const budget = integerAmount(policy.budget), purchase = integerAmount(policy.per_purchase_limit), commitment = integerAmount(policy.per_commitment_limit);
  if (purchase > budget) add("CONFLICTING_LIMITS", "per_purchase_limit", "The per-purchase limit cannot exceed the total allocation.");
  if (commitment > budget) add("CONFLICTING_LIMITS", "per_commitment_limit", "The full-commitment limit cannot exceed the total allocation.");
  if (purchase > commitment) add("CONFLICTING_LIMITS", "per_purchase_limit", "In this editor, the immediate-payment limit cannot exceed the full-commitment limit. This is a conservative drafting rule.");
  if (policy.approval_threshold !== null && integerAmount(policy.approval_threshold) > commitment) add("CONFLICTING_LIMITS", "approval_threshold", "The owner-approval threshold cannot exceed the full-commitment limit.");
  if (integerAmount(context.allocated_authority) + budget > integerAmount(context.budget_ceiling)) add("PROJECT_ALLOCATION_EXCEEDED", "budget", "Existing allocations plus this new allocation exceed the project ceiling.");
  if (BigInt(policy.expires_at_ns) <= BigInt(context.now_ns)) add("POLICY_EXPIRED", "expires_at_ns", "Choose an expiry after the current context time.");
  if (BigInt(policy.expires_at_ns) > BigInt(context.project_expires_at_ns)) add("EXCEEDS_PROJECT_EXPIRY", "expires_at_ns", "The policy cannot outlive the project.");
  const selected = context.providers.filter(provider => policy.allowed_provider_ids.includes(provider.id));
  for (const id of policy.allowed_provider_ids) {
    const provider = context.providers.find(item => item.id === id);
    if (!provider) add("UNKNOWN_PROVIDER", "allowed_provider_ids", `Provider ${id} is not in the trusted context registry. No recipient is invented.`);
    else if (!provider.active) add("PROVIDER_SUSPENDED", "allowed_provider_ids", `Provider ${id} is inactive.`);
    else if (!provider.services.some(service => policy.allowed_service_ids.includes(service)) || !provider.categories.some(category => policy.allowed_categories.includes(category))) add("CONFLICTING_SCOPE", "allowed_provider_ids", `Provider ${id} has no service/category overlap with this policy.`);
  }
  for (const id of policy.allowed_service_ids) if (!selected.some(provider => provider.services.includes(id))) add("UNKNOWN_SERVICE", "allowed_service_ids", `Service ${id} is not offered by any selected fixture provider.`);
  for (const id of policy.allowed_categories) if (!selected.some(provider => provider.categories.includes(id))) add("UNKNOWN_CATEGORY", "allowed_categories", `Category ${id} is not present in the selected registry context.`);
  if (issues.length) return { ok: false, issues };
  const copy: PolicyTerms = Object.freeze({ ...policy, ...Object.fromEntries(listFields.map(field => [field, Object.freeze([...policy[field]])])) });
  return { ok: true, policy: copy, issues: [] };
}

export function parsePolicyJson(text: string, context: PolicyContext): PolicyValidation {
  if (new TextEncoder().encode(text).length > MAX_POLICY_JSON) return { ok: false, issues: [{ code: "POLICY_TOO_LARGE", field: "json", message: "Keep policy JSON within 8 KiB." }] };
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { return { ok: false, issues: [{ code: "MALFORMED_JSON", field: "json", message: "The JSON is malformed. Use one object with quoted field names and no trailing commas." }] }; }
  // JSON.parse otherwise silently keeps the last repeated key, hiding contradictory rules.
  const keys = new Set<string>();
  for (const match of text.matchAll(/"(?:[^"\\]|\\.)*"/gu)) {
    if (!/^\s*:/u.test(text.slice(match.index + match[0].length))) continue;
    const key: string = JSON.parse(match[0]);
    if (keys.has(key)) return { ok: false, issues: [{ code: "DUPLICATE_JSON_FIELD", field: "json", message: "A JSON field appears more than once. Remove repeated fields instead of relying on last-value precedence." }] };
    keys.add(key);
  }
  return validatePolicy(value, context);
}

/** Stable review content, deliberately NOT runlatch.policy.v2 Borsh hashing. */
export function canonicalPolicy(policy: PolicyTerms): string {
  return JSON.stringify(Object.fromEntries(POLICY_FIELDS.map(field => [field, policy[field]])));
}
