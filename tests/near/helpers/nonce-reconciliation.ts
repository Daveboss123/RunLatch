/** Generated LOCAL receipts/access-query shapes. Never recorded or submitted network transactions. */
import { evidenceFixture, encode, functionCall } from "../../frontend/helpers/testnet-evidence.ts";
import { scope } from "../../frontend/helpers/action-review.ts";
import { signedRunFixture } from "./signed-run.ts";
import { inspectSignedAgentEnvelope } from "../../../scripts/near/signature-envelope.ts";
import { reconcileLocalAgentNonce, parseLocalSignedIdentity, type LocalSignedIdentity } from "../../../scripts/near/local-nonce-reconciliation.ts";
import { preparePurchaseReview } from "../../../src/lib/near/action-review.ts";
import { commercialQuoteHash } from "../../../src/lib/purchasing/hashing.ts";
import { encodeBase58_32 } from "../../../scripts/near/base58.ts";
import type { EvidenceContext } from "../../../src/lib/near/testnet-evidence.ts";

export async function reconciliationFixture(f: Awaited<ReturnType<typeof signedRunFixture>>, identity?: LocalSignedIdentity, state = "SETTLED") {
  const signed = identity ?? inspectSignedAgentEnvelope(f.signer.signReview(f.review, f.review, f.confirmation, BigInt(f.review.reviewed_at_ns)).signed_bytes);
  identity = parseLocalSignedIdentity({ transaction_hash: signed.transaction_hash, transaction: signed.transaction });
  const e = await evidenceFixture(state), tx = identity.transaction, raw = structuredClone(e.raw);
  const quote = { ...e.context.quote!, terms: f.review.canonical_quote.terms, quote_hash: tx.args.proposal.expected_quote_hash,
    consumed_by: ["SETTLED", "SETTLEMENT_FAILED", "SETTLEMENT_PENDING"].includes(state) ? `${tx.args.proposal.capsule_id}:${tx.args.proposal.request_id}` : null };
  const initialHeight = f.review.reviewed_block.height + 1;
  const purchase = { ...e.context.purchase!, proposal: tx.args.proposal, canonical_quote: quote.terms, created_at_ns: String(initialHeight),
    resolved_at_ns: ["SETTLED", "SETTLEMENT_FAILED"].includes(state) ? String(initialHeight + 2) : null };
  const capsule = { ...e.snapshot.capsule, policy: { ...e.snapshot.capsule.policy, agent_public_key: tx.public_key } };
  const block = { hash: encodeBase58_32(new Uint8Array(32).fill(initialHeight + 9)), height: initialHeight + 9, timestamp_ns: String(initialHeight + 9) };
  const context: { -readonly [K in keyof EvidenceContext]: EvidenceContext[K] } = { ...e.context, block, purchase, quote, capsule, outcome_blocks: Object.fromEntries(Object.values(e.context.outcome_blocks)
    .map((b, i) => [b.hash, { ...b, height: initialHeight + i, timestamp_ns: String(initialHeight + i) }])) };
  raw.transaction = { ...raw.transaction, hash: identity.transaction_hash, public_key: tx.public_key, actions: [functionCall(tx.method, tx.args)] };
  const execution = { ...raw, transaction: { ...raw.transaction, nonce: Number(tx.nonce) } };
  execution.transaction_outcome.id = identity.transaction_hash;
  for (const receipt of execution.receipts) receipt.receipt.Action.signer_public_key = tx.public_key;
  execution.receipts[0].receipt.Action.actions = [functionCall(tx.method, tx.args)];
  if (execution.receipts[2]) execution.receipts[2].receipt.Action.actions = [functionCall("resolve_purchase", { purchase_key: `${tx.args.proposal.capsule_id}:${tx.args.proposal.request_id}` }, "0", "25000000000000")];
  const reply = { ...e.reply, request: purchase }, value = { SuccessValue: encode(reply) };
  if (state !== "SETTLEMENT_PENDING") {
    execution.status = value;
    execution.receipts_outcome.at(-1)!.outcome.status = value;
  }
  const key = { ...f.data.key, nonce: Number(tx.nonce) };
  const input = { source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" as const, target: f.target, identity, execution, context,
    scope: { ...scope, public_key: tx.public_key }, key_query: { ...key, block_hash: block.hash, block_height: block.height },
    key_list_query: { keys: [{ public_key: tx.public_key, access_key: key }, f.data.keys[1]], block_hash: block.hash, block_height: block.height } };
  return { input, reconcile: () => reconcileLocalAgentNonce(input), identity };
}
export async function nextRunFixture(f: Awaited<ReturnType<typeof signedRunFixture>>, nonce: string, requestId = "hosting") {
  const next = await signedRunFixture(f.signer, requestId);
  const quote = { ...next.context.quote, terms: { ...next.context.quote.terms,
    input: { ...next.context.quote.terms.input, quote_id: `${requestId}-quote`, resource_key: `${requestId}-resource` } } };
  quote.quote_hash = await commercialQuoteHash(quote.terms, "testnet", next.target.contract_id);
  const action = { ...next.action, proposal: { ...next.action.proposal, quote_id: quote.terms.input.quote_id, expected_quote_hash: quote.quote_hash } };
  const context = { ...next.context, quote, access: { ...next.context.access, nonce },
    block: { hash: encodeBase58_32(new Uint8Array(32).fill(f.review.reviewed_block.height + 10)),
      height: f.review.reviewed_block.height + 10, timestamp_ns: String(f.review.reviewed_block.height + 10) } };
  const review = await preparePurchaseReview(next.target, action, context);
  return { ...next, action, context, review, confirmation: { consent: true, review_hash: review.review_hash } };
}
