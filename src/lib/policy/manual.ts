import { parseNear, formatNear } from "../preview/money.ts";
import { validatePolicy, type PolicyContext, type PolicyTerms, type PolicyValidation } from "./schema.ts";

export interface ManualTerms {
  budget: string; per_purchase_limit: string; per_commitment_limit: string;
  recurring_policy: PolicyTerms["recurring_policy"];
  allowed_provider_ids: string[]; allowed_service_ids: string[]; allowed_categories: string[];
  max_quantity: string; approval_threshold: string; expires_at_ns: string;
}
export function toManual(policy: PolicyTerms): ManualTerms {
  return { ...policy, budget: formatNear(policy.budget), per_purchase_limit: formatNear(policy.per_purchase_limit),
    per_commitment_limit: formatNear(policy.per_commitment_limit), approval_threshold: policy.approval_threshold === null ? "" : formatNear(policy.approval_threshold),
    max_quantity: String(policy.max_quantity), allowed_provider_ids: [...policy.allowed_provider_ids],
    allowed_service_ids: [...policy.allowed_service_ids], allowed_categories: [...policy.allowed_categories] };
}
export function validateManual(form: ManualTerms, context: PolicyContext): PolicyValidation {
  const money: Record<string, unknown> = {};
  for (const field of ["budget", "per_purchase_limit", "per_commitment_limit", "approval_threshold"] as const) {
    try { money[field] = field === "approval_threshold" && form[field] === "" ? null : parseNear(form[field]); }
    catch { return { ok: false, issues: [{ code: "INVALID_AMOUNT", field, message: "Enter an exact non-negative native NEAR amount, with at most 24 decimal places." }] }; }
  }
  return validatePolicy({ ...form, ...money, project_id: context.project_id, project_revision: context.project_revision,
    max_quantity: /^[1-9][0-9]?$/u.test(form.max_quantity) ? Number(form.max_quantity) : null }, context);
}
