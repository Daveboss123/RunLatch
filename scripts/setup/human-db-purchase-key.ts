/** Exact human-terminal run approval -> restricted-only WinCred key -> opaque in-memory handle. */
import { DEMO_PURCHASE_ANSWER, DEMO_PURCHASE_SCOPE, DEMO_PURCHASE_TARGET } from "../near/demo-purchase-scope.ts";
import { assertIssuedDemoDbPurchase, type DemoDbPurchaseReview } from "../near/demo-purchase-flow.ts";
import { consumeRestrictedProcessKey } from "../near/restricted-process-key.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import type { RestrictedAgentScope } from "../../src/lib/near/agent-access.ts";
import { importGeneratedHumanRecord } from "./human-demo-signer.ts";
import { readHumanRestrictedAgentCredential } from "./human-credential-store.ts";

const approvals = new WeakMap<object, { review: DemoDbPurchaseReview; hash: string; used: boolean }>();
function hash(review: DemoDbPurchaseReview) { return canonicalReviewContent({ review_hash: review.review.review_hash, costs: review.costs,
  call: review.review.call, exposure: review.review.exposure }); }
export function admitHumanDbPurchaseKey(review: DemoDbPurchaseReview, answer: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || answer !== DEMO_PURCHASE_ANSWER) throw Error("HUMAN_EXACT_DB_PURCHASE_APPROVAL_REQUIRED");
  assertIssuedDemoDbPurchase(review);
  if (review.review.transport_source !== "EXPLICIT_TESTNET_HTTP_READBACK") throw Error("HUMAN_PUBLIC_DB_REVIEW_REQUIRED");
  const token = Object.freeze({}); approvals.set(token, { review, hash: hash(review), used: false }); return token;
}
/** Generated in-memory test records only. No credential read; no key/string/DER is returned. */
export function importGeneratedRestrictedDbKey(blob: Buffer, scope: RestrictedAgentScope) {
  const key = importGeneratedHumanRecord(blob, scope.public_key, scope.agent_id);
  const der = key.export({ format: "der", type: "pkcs8" });
  const slot: Record<string, unknown> = { RUNLATCH_AGENT_PRIVATE_KEY: der.toString("base64url") };
  try { return consumeRestrictedProcessKey(DEMO_PURCHASE_TARGET, scope, slot); }
  finally { der.fill(0); Reflect.deleteProperty(slot, "RUNLATCH_AGENT_PRIVATE_KEY"); }
}
export function loadHumanDbPurchaseKey(review: DemoDbPurchaseReview, token: object) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error("HUMAN_EXACT_DB_PURCHASE_APPROVAL_REQUIRED");
  const approval = approvals.get(token); assertIssuedDemoDbPurchase(review);
  if (!approval || approval.used || approval.review !== review || approval.hash !== hash(review)) throw Error("HUMAN_EXACT_DB_PURCHASE_APPROVAL_REQUIRED");
  approval.used = true; // Store/import failure cannot authorize a second load or fallback.
  const blob = readHumanRestrictedAgentCredential();
  try { return importGeneratedRestrictedDbKey(blob, DEMO_PURCHASE_SCOPE); }
  finally { blob.fill(0); }
}
