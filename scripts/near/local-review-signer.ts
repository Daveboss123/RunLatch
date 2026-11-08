/** Shared LOCAL exact-review signing implementation. No raw-message signer, secret export or network.
 * Trusted Node callers supply KeyObjects; this is not a sandbox against malicious same-process code.
 */
import { createHash, sign, type KeyObject } from "node:crypto";
import { Buffer } from "node:buffer";
import { confirmFreshPurchaseReview, type PurchaseReview } from "../../src/lib/near/action-review.ts";
import { fail, time } from "../../src/lib/near/records.ts";
import { parsePurchaseObservationIntent } from "../../src/lib/near/testnet-evidence.ts";
import { encodeUnsignedAgentTransaction } from "./transaction-codec.ts";
import { inspectSignedAgentEnvelope, verifyAgentSignature } from "./signature-envelope.ts";

export function createLocalReviewSigner(publicKey: string, getPrivateKey: () => KeyObject,
  assertBinding: (review: PurchaseReview) => void = () => {}) {
  const consumed = new Set<string>();
  return Object.freeze({
    signReview(original: PurchaseReview, fresh: PurchaseReview, confirmation: unknown, nowNs: bigint, signal?: AbortSignal) {
      if (original.transport_source !== "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" || fresh.transport_source !== original.transport_source
        || original.action.method !== "submit_purchase" || fresh.action.method !== "submit_purchase") return fail("PUBLIC_SIGNING_NOT_ADMITTED");
      confirmFreshPurchaseReview(original, fresh, confirmation);
      if (signal?.aborted) return fail("LOCAL_SIGNING_CANCELLED");
      if (typeof nowNs !== "bigint" || nowNs < BigInt(fresh.reviewed_at_ns) || nowNs >= BigInt(original.expires_at_ns)
        || nowNs >= BigInt(fresh.expires_at_ns)) return fail("LOCAL_SIGNING_REVIEW_EXPIRED");
      if (!fresh.access || !fresh.financials || fresh.action.public_key !== publicKey || fresh.access.public_key !== publicKey
        || fresh.access.agent_id !== fresh.action.signer_id || fresh.access.receiver_id !== fresh.target.contract_id
        || fresh.access.method_names.length !== 1 || fresh.access.method_names[0] !== "submit_purchase"
        || !fresh.access.recovery_access_observed || BigInt(fresh.access.allowance) <= 0n
        || BigInt(fresh.access.allowance) > BigInt(fresh.access.allowance_cap)) return fail("LOCAL_SIGNING_KEY_REVIEW_MISMATCH");
      assertBinding(fresh);
      const privateKey = getPrivateKey(); // A disposed handle fails before consuming any new request.
      const nonce = time((BigInt(time(fresh.access.nonce)) + 1n).toString());
      const unsigned = encodeUnsignedAgentTransaction({ ...fresh.call, nonce, block_hash: fresh.reviewed_block.hash });
      const requestKey = JSON.stringify([fresh.target.contract_id, fresh.action.proposal.capsule_id, fresh.action.proposal.request_id]);
      if (consumed.has(requestKey)) return fail("LOCAL_SIGNATURE_ALREADY_PREPARED");
      consumed.add(requestKey); // Fail closed even if a following local crypto/verification step throws.
      let signature: Buffer;
      try { signature = sign(null, createHash("sha256").update(unsigned.unsigned_bytes).digest(), privateKey); }
      catch { return fail("LOCAL_SIGNING_FAILED"); }
      const signed = verifyAgentSignature(unsigned.transaction, signature), bytes = signed.signed_bytes;
      const checked = inspectSignedAgentEnvelope(bytes);
      if (checked.transaction_hash !== unsigned.transaction_hash) return fail("LOCAL_SIGNING_IDENTITY_MISMATCH");
      const intent = parsePurchaseObservationIntent({ transaction_hash: checked.transaction_hash, sender_id: fresh.action.signer_id,
        public_key: publicKey, method: "submit_purchase", gas: fresh.action.gas, proposal: fresh.action.proposal, expected_request_hash: null });
      return Object.freeze({ source: "LOCAL_SIGNATURE_PREPARED_NOT_SUBMITTED" as const, intent, review_hash: fresh.review_hash,
        get signed_bytes(): Uint8Array { return new Uint8Array(bytes); }, signature_verified: true as const,
        public_execution: false as const, payment_evidence: "NOT_OBSERVED" as const, grants_payment_authority: false as const });
    },
  });
}
export type LocalReviewSigner = ReturnType<typeof createLocalReviewSigner>;
