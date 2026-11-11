/** Read-only browser workflow. No wallet, consent issuance, signer, agent key or writes. */
import type { createTestnetReader } from "./testnet-rpc.ts";
import { confirmFreshSetupReview, parseSetupAction, type SetupReview } from "./setup-review.ts";
import { confirmFreshOwnerReview, parseOwnerAction, type OwnerArtifact, type OwnerReview } from "./owner-review.ts";
import { confirmFreshPurchaseReview, parsePurchaseAction, type PurchaseReview } from "./action-review.ts";
import { canonicalReviewContent } from "./review-content.ts";
import { fail, object, parseBoundedJson } from "./records.ts";

import { HUMAN_WORKSPACE_METHODS } from "./human-methods.ts";
export { HUMAN_WORKSPACE_METHODS, type HumanWorkspaceMethod } from "./human-methods.ts";
type Reader = Pick<ReturnType<typeof createTestnetReader>, "readSetupReview" | "readOwnerReview" | "readPurchaseReview">;
export type HumanWorkspaceReview = { readonly kind: "setup"; readonly review: SetupReview }
  | { readonly kind: "owner"; readonly review: OwnerReview } | { readonly kind: "approval"; readonly review: PurchaseReview };

export function parseHumanWorkspaceAction(input: unknown) {
  const value = object(parseBoundedJson(canonicalReviewContent(input), 16_384));
  if (!(HUMAN_WORKSPACE_METHODS as readonly unknown[]).includes(value.method)) return fail("HUMAN_WORKSPACE_METHOD_NOT_ADMITTED");
  if (["create_project", "create_capsule", "register_provider", "publish_quote"].includes(String(value.method))) {
    return Object.freeze({ kind: "setup" as const, action: parseSetupAction(value) });
  }
  if (value.method === "approve_purchase") return Object.freeze({ kind: "approval" as const, action: parsePurchaseAction(value) });
  return Object.freeze({ kind: "owner" as const, action: parseOwnerAction(value) });
}
export async function readHumanWorkspaceReview(reader: Reader, input: unknown, evidence?: OwnerArtifact, signal?: AbortSignal): Promise<HumanWorkspaceReview> {
  const parsed = parseHumanWorkspaceAction(input);
  if (signal?.aborted) return fail("WORKSPACE_READ_CANCELLED");
  if (parsed.action.method !== "record_task_check" && evidence !== undefined) return fail("UNEXPECTED_OWNER_ARTIFACT");
  if (parsed.kind === "setup") return Object.freeze({ kind: "setup", review: await reader.readSetupReview(parsed.action, signal) });
  if (parsed.kind === "approval") return Object.freeze({ kind: "approval", review: await reader.readPurchaseReview(parsed.action, null, signal) });
  return Object.freeze({ kind: "owner", review: await reader.readOwnerReview(parsed.action, evidence, signal) });
}
/** Fresh exact-content match for one external wallet prompt; still not a signature or settlement fact. */
export function confirmFreshHumanWorkspaceReview(original: HumanWorkspaceReview, fresh: HumanWorkspaceReview) {
  if (original.kind !== fresh.kind) return fail("HUMAN_WORKSPACE_REVIEW_KIND_CHANGED");
  const confirmation = { review_hash: original.review.review_hash, consent: true };
  if (original.kind === "setup" && fresh.kind === "setup") return confirmFreshSetupReview(original.review, fresh.review, confirmation);
  if (original.kind === "owner" && fresh.kind === "owner") return confirmFreshOwnerReview(original.review, fresh.review, confirmation);
  if (original.kind === "approval" && fresh.kind === "approval") return confirmFreshPurchaseReview(original.review, fresh.review, confirmation);
  return fail("HUMAN_WORKSPACE_REVIEW_KIND_CHANGED");
}
/** Human-triggered export, not a confirmation/token accepted by a signer. Artifacts are never included. */
export function exportHumanWorkspaceReview(value: HumanWorkspaceReview): string {
  const text = JSON.stringify({ source: "EXPORTED_UNSIGNED_HUMAN_REVIEW_NOT_SIGNING_CONSENT", kind: value.kind,
    review: value.review, signing_enabled: false, grants_payment_authority: false }, null, 2);
  if (new TextEncoder().encode(text).byteLength > 1_048_576) return fail("WORKSPACE_EXPORT_SIZE_LIMIT");
  return text;
}
