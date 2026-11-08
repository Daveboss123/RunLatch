/** Trusted operator's exact run confirmation, not authentication or contract purchasing authority.
 * No network/secret/signature. Never construct this from agent/provider output or broad chat consent.
 */
import { confirmFreshPurchaseReview, type PurchaseReview } from "../../src/lib/near/action-review.ts";
import { parseRestrictedAgentScope } from "../../src/lib/near/agent-access.ts";
import { canonicalReviewContent as canonical } from "../../src/lib/near/review-content.ts";
import { fail, id, object, parseBoundedJson } from "../../src/lib/near/records.ts";

const issued = new WeakSet<object>();
export function confirmTestnetAgentRun(review: PurchaseReview, input: unknown, injectedTestNamespace?: string) {
  const c = object(parseBoundedJson(canonical(input), 16_384), ["authorization", "consent", "review_hash", "target", "scope", "call", "exposure", "calls"]);
  if (c.authorization !== "HUMAN_APPROVED_EXACT_TESTNET_AGENT_CALL" || c.calls !== 1) return fail("EXACT_TESTNET_RUN_CONSENT_REQUIRED");
  confirmFreshPurchaseReview(review, review, { consent: c.consent, review_hash: c.review_hash });
  if (review.action.method !== "submit_purchase" || review.call.attached_deposit !== "0" || !review.access || !review.financials) return fail("RESTRICTED_TESTNET_SUBMIT_REQUIRED");
  const scope = parseRestrictedAgentScope(c.scope, review.target), access = review.access;
  if (canonical(c.target) !== canonical(review.target) || canonical(c.call) !== canonical(review.call)
    || canonical(c.exposure) !== canonical(review.exposure) || scope.agent_id !== review.action.signer_id
    || scope.public_key !== review.action.public_key || scope.recovery_public_key !== access.recovery_public_key
    || scope.max_allowance !== access.allowance_cap) return fail("TESTNET_RUN_SCOPE_MISMATCH");
  if (injectedTestNamespace !== undefined && review.transport_source !== "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE") return fail("PUBLIC_RUN_NAMESPACE_FIXED");
  const namespace = injectedTestNamespace === undefined ? "working-mvp" : id(injectedTestNamespace);
  const admission = Object.freeze({ source: "EXACT_TESTNET_AGENT_RUN_CONFIRMATION" as const, review, scope, namespace,
    confirmation: Object.freeze({ consent: true, review_hash: review.review_hash }), calls: 1 as const,
    grants_payment_authority: false as const,
    limitation: "Trusted operator confirmation only, not proof of human identity/consent, key installation, Gate approval or settlement. One exact call; no admin/owner fallback." });
  issued.add(admission); return admission;
}
export type TestnetRunAdmission = ReturnType<typeof confirmTestnetAgentRun>;
export function assertTestnetRunAdmission(value: TestnetRunAdmission) {
  if (!issued.has(value)) return fail("UNISSUED_TESTNET_RUN_CONFIRMATION");
}
/** Shared mechanics retain local refusal unless a separately issued exact run confirmation is supplied. */
export function assertRunnerReview(review: PurchaseReview, admission: TestnetRunAdmission | undefined, localCode: string) {
  if (admission === undefined) {
    if (review.transport_source !== "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" || review.action.method !== "submit_purchase"
      || !review.access || !review.financials) return fail(localCode);
  } else {
    assertTestnetRunAdmission(admission);
    confirmFreshPurchaseReview(admission.review, review, admission.confirmation);
    if (review.action.method !== "submit_purchase" || !review.access || !review.financials) return fail("RESTRICTED_TESTNET_SUBMIT_REQUIRED");
  }
}
export function assertRunnerNamespace(namespace: string, admission?: TestnetRunAdmission) {
  if (admission) { assertTestnetRunAdmission(admission); if (namespace !== admission.namespace) return fail("TESTNET_RUN_NAMESPACE_MISMATCH"); }
}
export function assertRunnerTransport(transport: typeof fetch, admission?: TestnetRunAdmission) {
  if (admission) assertTestnetRunAdmission(admission);
  if (typeof transport !== "function" || (admission?.review.transport_source !== "EXPLICIT_TESTNET_HTTP_READBACK" && transport === globalThis.fetch)) return fail("LOCAL_INJECTED_TRANSPORT_REQUIRED");
  // Public reads and writes must use the same credential-free native fetch path, not a substituted relay.
  if (admission?.review.transport_source === "EXPLICIT_TESTNET_HTTP_READBACK" && transport !== globalThis.fetch) return fail("PUBLIC_RUN_NATIVE_TRANSPORT_REQUIRED");
}
