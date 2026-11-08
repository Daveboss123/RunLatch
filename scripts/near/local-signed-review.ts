/** Exact local byte/review binding. Serializer checks only, never a second Gate or signing consent. */
import type { PurchaseReview } from "../../src/lib/near/action-review.ts";
import { confirmFreshPurchaseReview } from "../../src/lib/near/action-review.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { fail, time } from "../../src/lib/near/records.ts";
import type { inspectSignedAgentEnvelope } from "./signature-envelope.ts";
import { assertRunnerReview, type TestnetRunAdmission } from "./runner-admission.ts";

export function assertLocalSignedReview(review: PurchaseReview, signed: ReturnType<typeof inspectSignedAgentEnvelope>) {
  return assertSignedReview(review, signed);
}
export function assertSignedReview(review: PurchaseReview, signed: ReturnType<typeof inspectSignedAgentEnvelope>, admission?: TestnetRunAdmission) {
  assertRunnerReview(review, admission, "PUBLIC_BROADCAST_NOT_ADMITTED");
  // Requires an actual issued review object, not provider JSON or a clone.
  confirmFreshPurchaseReview(review, review, { consent: true, review_hash: review.review_hash });
  const { nonce, block_hash: blockHash, ...call } = signed.transaction;
  if (canonicalReviewContent(call) !== canonicalReviewContent(review.call) || blockHash !== review.reviewed_block.hash
    || nonce !== time((BigInt(time(review.access!.nonce)) + 1n).toString())) return fail("LOCAL_SIGNED_REVIEW_MISMATCH");
}
