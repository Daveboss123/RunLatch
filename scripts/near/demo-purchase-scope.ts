/** Fixed public ONE-call scope approved by the human11November. Not a signer or contract authority. */
import { parsePurchaseAction, type PurchaseReview } from "../../src/lib/near/action-review.ts";
import { canonicalReviewContent as canonical } from "../../src/lib/near/review-content.ts";
import { parsePurchaseObservationIntent } from "../../src/lib/near/testnet-evidence.ts";
import { DEMO_AGENT_SCOPE, DEMO_CAPSULE_ACTION, DEMO_QUOTE_ACTION, RUNLATCH_TESTNET_TARGET } from "../../src/lib/near/demo-operations.ts";

export const DEMO_PURCHASE_TARGET = RUNLATCH_TESTNET_TARGET;
export const DEMO_PURCHASE_SCOPE = DEMO_AGENT_SCOPE;
export const DEMO_PURCHASE_POLICY_HASH = "f5e891042ba5cbf5ef0d0ba3b4516d5f28c53eecea7f1b8ecebae1f002934535";
export const DEMO_INSTALLED_AGENT_NONCE = "277138475000000";
export const DEMO_PURCHASE_ACTION = parsePurchaseAction({ method: "submit_purchase", signer_id: DEMO_AGENT_SCOPE.agent_id,
  public_key: DEMO_AGENT_SCOPE.public_key, gas: "100000000000000", proposal: { project_id: "project_demo_1110", project_revision: "1",
    capsule_id: "capsule_demo_1110", request_id: "db_purchase_demo_1111", quote_id: "db_quote_demo_1110",
    expected_quote_hash: "ae846302dbae490ba2352bbce89162821b8882a9c237903f97692ad9007231a3" }, expected_request_hash: null });
export const DEMO_PURCHASE_ANSWER = "BUY ONE DATABASE QUOTE db_quote_demo_1110 FOR 0.05 TESTNET NEAR FROM capsule_demo_1110 USING RESTRICTED AGENT KEY";

export function assertDemoPurchaseReview(review: PurchaseReview) {
  if (canonical(review.target) !== canonical(DEMO_PURCHASE_TARGET) || canonical(review.action) !== canonical(DEMO_PURCHASE_ACTION)
    || review.call.receiver_id !== DEMO_PURCHASE_TARGET.contract_id || review.call.attached_deposit !== "0"
    || review.policy_hash !== DEMO_PURCHASE_POLICY_HASH || canonical(review.canonical_quote.terms.input) !== canonical(DEMO_QUOTE_ACTION.args.quote)
    || review.canonical_quote.terms.publisher_id !== DEMO_QUOTE_ACTION.signer_id || review.canonical_quote.consumed
    || !review.access || review.access.public_key !== DEMO_AGENT_SCOPE.public_key || review.access.nonce !== DEMO_INSTALLED_AGENT_NONCE
    || review.access.allowance !== DEMO_AGENT_SCOPE.max_allowance || review.access.allowance_cap !== DEMO_AGENT_SCOPE.max_allowance
    || review.access.recovery_public_key !== DEMO_AGENT_SCOPE.recovery_public_key || !review.access.recovery_access_observed)
    throw Error("DEMO_PURCHASE_SCOPE_OR_UNUSED_KEY_MISMATCH");
  const f = review.financials;
  if (!f || f.allocated !== DEMO_CAPSULE_ACTION.args.policy.budget || f.original_budget !== f.allocated
    || f.spent !== "0" || f.reserved !== "0" || f.committed_future !== "0" || f.returned !== "0"
    || f.available_now !== f.allocated || f.available_to_commit !== f.allocated
    || review.exposure.recipient_id !== DEMO_QUOTE_ACTION.args.quote.recipient_id
    || review.exposure.amount_due_now !== DEMO_QUOTE_ACTION.args.quote.price
    || review.exposure.total_commitment !== review.exposure.amount_due_now || review.exposure.future_commitment !== "0")
    throw Error("DEMO_PURCHASE_FUNDING_OR_EXPOSURE_MISMATCH");
}
export function assertDemoPurchaseIntent(value: unknown) {
  const intent = parsePurchaseObservationIntent(value);
  if (intent.sender_id !== DEMO_PURCHASE_ACTION.signer_id || intent.public_key !== DEMO_PURCHASE_ACTION.public_key
    || intent.method !== "submit_purchase" || intent.gas !== DEMO_PURCHASE_ACTION.gas || intent.expected_request_hash !== null
    || canonical(intent.proposal) !== canonical(DEMO_PURCHASE_ACTION.proposal)) throw Error("DEMO_PURCHASE_IDENTITY_SCOPE_MISMATCH");
  return intent;
}
