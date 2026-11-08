/** LOCAL injected-read reconciliation only. No transport, nonce retry, signing or fund release.
 * Reuses the existing transfer/callback inspector; RPC-shaped data is not a light-client proof.
 */
import { createHash } from "node:crypto";
import { assertTerminalPurchaseEvidence, inspectPurchaseEvidence, parsePurchaseObservationIntent, type EvidenceContext } from "../../src/lib/near/testnet-evidence.ts";
import { inspectRestrictedAccess, parseRestrictedAgentScope } from "../../src/lib/near/agent-access.ts";
import { count, fail, object, parseBoundedJson, time } from "../../src/lib/near/records.ts";
import { parseTestnetTarget } from "../../src/lib/near/testnet-target.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { encodeUnsignedAgentTransaction } from "./transaction-codec.ts";

const issued = new WeakSet<object>();
export function localIdentityHash(value: unknown) {
  return createHash("sha256").update(canonicalReviewContent(value)).digest("hex");
}
export function parseLocalSignedIdentity(input: unknown) {
  const value = object(parseBoundedJson(canonicalReviewContent(input), 16_384), ["transaction_hash", "transaction"]);
  const encoded = encodeUnsignedAgentTransaction(value.transaction);
  if (value.transaction_hash !== encoded.transaction_hash) return fail("RECONCILIATION_IDENTITY_HASH_MISMATCH");
  return Object.freeze({ transaction_hash: encoded.transaction_hash, transaction: encoded.transaction });
}
export type LocalSignedIdentity = ReturnType<typeof parseLocalSignedIdentity>;

/** Trusted local tests supply the raw receipt and SAME final-block access query envelopes.
 * Never pass provider/model status strings as a substitute for these records.
 */
export function reconcileLocalAgentNonce(input: {
  readonly source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE";
  readonly target: unknown; readonly identity: unknown; readonly execution: unknown; readonly context: EvidenceContext;
  readonly scope: unknown; readonly key_query: unknown; readonly key_list_query: unknown;
}) {
  if (input.source !== "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE") return fail("PUBLIC_NONCE_RECONCILIATION_NOT_ADMITTED");
  const target = parseTestnetTarget(input.target), identity = parseLocalSignedIdentity(input.identity), tx = identity.transaction;
  const scope = parseRestrictedAgentScope(input.scope, target), context = input.context;
  if (target.contract_id !== context.contract_id || target.operator_id !== context.operator_id || tx.receiver_id !== target.contract_id
    || tx.signer_id !== scope.agent_id || tx.public_key !== scope.public_key) return fail("RECONCILIATION_SCOPE_MISMATCH");
  const intent = parsePurchaseObservationIntent({ transaction_hash: identity.transaction_hash, sender_id: tx.signer_id, public_key: tx.public_key,
    method: tx.method, gas: tx.gas, proposal: tx.args.proposal, expected_request_hash: null });
  // All call/receipt/canonical transfer/private callback/record checks stay in the existing inspector.
  const evidence = inspectPurchaseEvidence(intent, input.execution, context);
  if (evidence.submission !== "FINAL") return fail("PRIOR_TRANSACTION_NOT_FINAL");
  const observedTx = object(object(input.execution).transaction);
  // NEAR SignedTransactionView reports a numeric nonce; unsafe JSON numbers are refused, never repaired.
  if (count(observedTx.nonce, Number.MAX_SAFE_INTEGER).toString() !== tx.nonce) return fail("PRIOR_TRANSACTION_NONCE_MISMATCH");
  assertTerminalPurchaseEvidence(evidence);
  const block = Object.freeze({ hash: context.block.hash, height: count(context.block.height, Number.MAX_SAFE_INTEGER), timestamp_ns: time(context.block.timestamp_ns) });
  function query(value: unknown) {
    const q = object(value);
    if (q.block_hash !== block.hash || count(q.block_height, Number.MAX_SAFE_INTEGER) !== block.height) return fail("MIXED_RECONCILIATION_BLOCKS");
    return q;
  }
  const key = query(input.key_query), keys = query(input.key_list_query);
  if (keys.next_key !== undefined && keys.next_key !== null) return fail("AGENT_ACCESS_KEY_LIST_INCOMPLETE");
  const access = inspectRestrictedAccess(scope, target, { nonce: key.nonce, permission: key.permission }, keys);
  // Higher nonce is NOT evidence of THIS transaction or permission to skip an unknown attempt.
  if (access.nonce !== tx.nonce) return fail("FINALIZED_KEY_NONCE_DIVERGED");
  const result = Object.freeze({ source: input.source, target, identity, identity_hash: localIdentityHash(identity), block, access,
    payment_evidence: evidence.payment_evidence, record_source: evidence.record_source, actual_decision: evidence.actual_decision,
    initial_receipt_id: evidence.initial_receipt_id, transfer_receipt_id: evidence.transfer_receipt_id, callback_receipt_id: evidence.callback_receipt_id,
    grants_payment_authority: false as const, public_execution: false as const,
    limitation: "Local injected RPC-shaped reconciliation only; no HTTP adapter or historical code verification here. Finalized nonce is not provisioning, human consent or release/resend authority." });
  issued.add(result);
  return result;
}
export type LocalNonceReconciliation = ReturnType<typeof reconcileLocalAgentNonce>;
export function assertIssuedLocalReconciliation(value: LocalNonceReconciliation) {
  if (!issued.has(value)) return fail("UNISSUED_NONCE_RECONCILIATION");
}
