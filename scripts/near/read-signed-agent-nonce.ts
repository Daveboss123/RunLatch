/** Node-only identity-bound readback. No signer, secret, CLI/default reader, journal write or send. */
import { assertIssuedAgentNonceReadback, type createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { parseTestnetTarget } from "../../src/lib/near/testnet-target.ts";
import { parseRestrictedAgentScope } from "../../src/lib/near/agent-access.ts";
import { parsePurchaseObservationIntent } from "../../src/lib/near/testnet-evidence.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { fail } from "../../src/lib/near/records.ts";
import { localIdentityHash, parseLocalSignedIdentity } from "./local-nonce-reconciliation.ts";

type Reader = Pick<ReturnType<typeof createTestnetReader>, "target" | "reconcileAgentNonce">;
const issued = new WeakSet<object>();
export async function readSignedAgentNonce(reader: Reader, inputIdentity: unknown, inputScope: unknown, signal?: AbortSignal) {
  // Reuse the Rust-parity V0 codec/hash parser: arbitrary hashes/status claims are not identities.
  const target = parseTestnetTarget(reader.target), identity = parseLocalSignedIdentity(inputIdentity), tx = identity.transaction;
  const scope = parseRestrictedAgentScope(inputScope, target);
  if (tx.receiver_id !== target.contract_id || tx.signer_id !== scope.agent_id || tx.public_key !== scope.public_key) return fail("RECONCILIATION_SCOPE_MISMATCH");
  const intent = parsePurchaseObservationIntent({ transaction_hash: identity.transaction_hash, sender_id: tx.signer_id, public_key: tx.public_key,
    method: tx.method, gas: tx.gas, proposal: tx.args.proposal, expected_request_hash: null });
  const observed = await reader.reconcileAgentNonce({ intent, scope, nonce: tx.nonce }, signal);
  assertIssuedAgentNonceReadback(observed);
  if (canonicalReviewContent(observed.target) !== canonicalReviewContent(target) || canonicalReviewContent(observed.intent) !== canonicalReviewContent(intent)
    || observed.nonce !== tx.nonce) return fail("RECONCILIATION_READBACK_IDENTITY_MISMATCH");
  const result = Object.freeze({ ...observed, identity, identity_hash: localIdentityHash(identity) });
  issued.add(result);
  return result;
}
export type SignedAgentNonceReadback = Awaited<ReturnType<typeof readSignedAgentNonce>>;
export function assertIssuedSignedAgentNonce(value: SignedAgentNonceReadback) {
  if (!issued.has(value)) return fail("UNISSUED_SIGNED_AGENT_NONCE");
}
