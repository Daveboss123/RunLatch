import { parseNear } from "../preview/money.ts";
import { validatePolicy, type PolicyContext, type PolicyIssue, type PolicyValidation } from "./schema.ts";

export const MAX_INSTRUCTIONS = 4096;
export const SAMPLE_INSTRUCTIONS = "Budget 3 NEAR. Per purchase 1 NEAR. Per commitment 3 NEAR. Providers database, hosting. Services database-instance, hosting-instance. Categories infrastructure. Max quantity 1. Recurring forbidden. Owner approval above 0.6 NEAR. Expires 1794139200000000000 ns.";
interface Clause { pattern: RegExp; field: string; convert: (value: string) => unknown }
const clauses: readonly Clause[] = [
  { pattern: /^budget (\d+(?:\.\d+)?) NEAR$/iu, field: "budget", convert: parseNear },
  { pattern: /^per purchase (\d+(?:\.\d+)?) NEAR$/iu, field: "per_purchase_limit", convert: parseNear },
  { pattern: /^per commitment (\d+(?:\.\d+)?) NEAR$/iu, field: "per_commitment_limit", convert: parseNear },
  ...[["providers", "allowed_provider_ids"], ["services", "allowed_service_ids"], ["categories", "allowed_categories"]].map(([name, field]) => ({ pattern: new RegExp(`^${name} (.+)$`, "iu"), field, convert: (value: string) => value.split(",").map(id => id.trim()) })),
  { pattern: /^max quantity (\d{1,2})$/iu, field: "max_quantity", convert: value => Number(value) },
  { pattern: /^recurring (forbidden|requires owner approval)$/iu, field: "recurring_policy", convert: value => value.toLowerCase() === "forbidden" ? "FORBIDDEN" : "REQUIRE_APPROVAL" },
  { pattern: /^owner approval above (\d+(?:\.\d+)?) NEAR$/iu, field: "approval_threshold", convert: parseNear },
  { pattern: /^owner approval (disabled)$/iu, field: "approval_threshold", convert: () => null },
  { pattern: /^expires (\d{1,20}) ns$/iu, field: "expires_at_ns", convert: value => value },
];

/** A small explicit grammar, not an LLM and not unrestricted natural-language understanding. */
export function compileInstructions(text: string, context: PolicyContext): PolicyValidation {
  if (new TextEncoder().encode(text).length > MAX_INSTRUCTIONS) return { ok: false, issues: [{ code: "INSTRUCTIONS_TOO_LARGE", field: "instructions", message: "Keep instructions within 4 KiB." }] };
  const draft: Record<string, unknown> = { project_id: context.project_id, project_revision: context.project_revision };
  const issues: PolicyIssue[] = [];
  // A decimal point belongs to money. Only sentence-ending periods/newlines split clauses.
  const parts = text.split(/(?:\.(?=\s|$)|[\n;])/u).map(part => part.trim()).filter(Boolean);
  if (parts.length > 24) return { ok: false, issues: [{ code: "TOO_MANY_CLAUSES", field: "instructions", message: "Use at most 24 instruction clauses." }] };
  for (const part of parts) {
    const clause = clauses.find(candidate => candidate.pattern.test(part));
    if (!clause) { issues.push({ code: "AMBIGUOUS_INSTRUCTION", field: "instructions", message: `Not interpreted: “${part.slice(0, 120)}”. Use the example wording or the manual form; no condition is ignored.` }); continue; }
    const match = clause.pattern.exec(part)!;
    try {
      const value = clause.convert(match[1]);
      if (Object.hasOwn(draft, clause.field)) issues.push({ code: "CONFLICTING_INSTRUCTIONS", field: "instructions", message: `Specify ${clause.field} once. Multiple instructions are not silently merged or overridden.` });
      else draft[clause.field] = value;
    } catch { issues.push({ code: "INVALID_INSTRUCTION_AMOUNT", field: "instructions", message: "A stated amount is outside exact native NEAR bounds." }); }
  }
  const validation = validatePolicy(draft, context);
  if (issues.length || !validation.ok) return { ok: false, issues: [...issues, ...validation.issues].slice(0, 32) };
  return validation;
}

/** Optional integration seam. A reviewed caller supplies drafting only, never tools or activation. */
export interface PolicyDraftAdapter {
  readonly label: string;
  draft(instructions: string, context: PolicyContext, signal: AbortSignal): Promise<string>;
}
export async function draftWithAdapter(adapter: PolicyDraftAdapter, instructions: string, context: PolicyContext, signal: AbortSignal): Promise<PolicyValidation> {
  if (new TextEncoder().encode(instructions).length > MAX_INSTRUCTIONS) return { ok: false, issues: [{ code: "INSTRUCTIONS_TOO_LARGE", field: "instructions", message: "Keep instructions within 4 KiB." }] };
  const { parsePolicyJson } = await import("./schema.ts");
  try {
    signal.throwIfAborted();
    const json = await adapter.draft(instructions, context, signal);
    signal.throwIfAborted();
    return parsePolicyJson(json, context);
  } catch { return { ok: false, issues: [{ code: "DRAFT_ADAPTER_FAILED", field: "instructions", message: "Drafting failed or was cancelled. No approval was created; use the local sample or manual form." }] }; }
}
