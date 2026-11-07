import { canonicalPolicy, parsePolicyJson, type PolicyContext, type PolicyTerms, type PolicyValidation } from "./schema.ts";

export interface ReviewedVersion {
  readonly version: number;
  readonly policy: PolicyTerms;
  readonly canonical_content: string;
  readonly status: "OWNER_REVIEWED_LOCAL_DEMO";
  readonly grants_payment_authority: false;
}
export interface PolicyEditorState {
  readonly epoch: number;
  readonly review: { readonly epoch: number; readonly context_content: string; readonly result: PolicyValidation } | null;
  readonly versions: readonly ReviewedVersion[];
  readonly active_version: number | null;
}
export const initialPolicyState: PolicyEditorState = Object.freeze({ epoch: 0, review: null, versions: Object.freeze([]), active_version: null });
export function invalidateReview(state: PolicyEditorState): PolicyEditorState { return { ...state, epoch: state.epoch + 1, review: null }; }
function contextContent(context: PolicyContext): string {
  // Recipients/registry identity are part of what the owner reviewed. Clock is rechecked separately.
  return JSON.stringify({ project_id: context.project_id, project_revision: context.project_revision,
    project_active: context.project_active, budget_ceiling: context.budget_ceiling, allocated_authority: context.allocated_authority,
    project_expires_at_ns: context.project_expires_at_ns, providers: context.providers.map(provider => ({ id: provider.id,
      recipient: provider.recipient, active: provider.active, services: provider.services, categories: provider.categories })) });
}
export function setPolicyReview(state: PolicyEditorState, result: PolicyValidation, context: PolicyContext): PolicyEditorState {
  return { ...state, review: { epoch: state.epoch, context_content: contextContent(context), result } };
}
/** Explicit review only. A local checkbox is not authenticated contract activation. */
export function approveLocalVersion(state: PolicyEditorState, expectedEpoch: number, consent: boolean, context: PolicyContext): PolicyEditorState {
  if (!consent) throw new Error("OWNER_APPROVAL_REQUIRED");
  if (!state.review?.result.ok || expectedEpoch !== state.epoch || state.review.epoch !== state.epoch) throw new Error("STALE_OR_INVALID_REVIEW");
  const content = canonicalPolicy(state.review.result.policy);
  const rechecked = parsePolicyJson(content, context);
  if (!rechecked.ok) throw new Error("CURRENT_CONTEXT_INVALID");
  if (state.review.context_content !== contextContent(context)) throw new Error("REVIEW_CONTEXT_CHANGED");
  if (state.versions.some(version => version.canonical_content === content)) throw new Error("POLICY_VERSION_ALREADY_APPROVED");
  if (state.versions.length >= 8) throw new Error("LOCAL_VERSION_LIMIT");
  const version: ReviewedVersion = Object.freeze({ version: state.versions.length + 1, policy: rechecked.policy,
    canonical_content: content, status: "OWNER_REVIEWED_LOCAL_DEMO", grants_payment_authority: false });
  return { ...invalidateReview(state), versions: Object.freeze([...state.versions, version]), active_version: version.version };
}
