/** Synthetic native owner-return graph, not a public transaction or signature. */
import { evidenceFixture, evidenceTransport, functionCall, refs, target, encode } from "./testnet-evidence.ts";
import { parseOwnerReturnIntent } from "../../../src/lib/near/owner-return-evidence.ts";

export async function ownerReturnFixture(state: "RETURNED" | "FAILED" | "PENDING" | "NONE" = "RETURNED", amount = "250") {
  const f = await evidenceFixture("SETTLED", false, state === "NONE" ? "300" : "50");
  const record = state === "NONE" ? null : { attempt: 1, amount, status: state, created_at_ns: "30", resolved_at_ns: state === "PENDING" ? null : "40", reconciliation_required: false };
  const capsule = f.snapshot.capsule;
  Object.assign(capsule, { status: state === "PENDING" ? "CLOSING" : state === "FAILED" ? "REVOKED" : "CLOSED",
    allocated: state === "RETURNED" ? "50" : "300", returned: state === "RETURNED" ? amount : "0", spent: state === "NONE" ? "300" : "50",
    reserved: state === "PENDING" ? amount : "0", refund_attempts: record ? 1 : 0, owner_refund: record });
  f.context.block = { hash: refs.finalBlock, height: 50, timestamp_ns: "50" };
  f.context.outcome_blocks = Object.fromEntries([[refs.initialBlock, 30], [refs.transferBlock, 35], [refs.callbackBlock, 40]].map(([hash, height]) => [String(hash), { hash: String(hash), height: Number(height), timestamp_ns: String(height) }]));
  const intent = parseOwnerReturnIntent({ transaction_hash: refs.tx, sender_id: target.operator_id, public_key: `ed25519:${"1".repeat(32)}`,
    gas: "100000000000000", capsule_id: "work", expected_attempt: record ? 1 : null });
  const reply = { record, transfer_scheduled: false, reason_code: state === "NONE" ? "NO_UNUSED_PURCHASE_FUNDS" : null, source: "CONTRACT_OWNER_REFUND" };
  f.raw.transaction.signer_id = intent.sender_id; f.raw.transaction.public_key = intent.public_key;
  f.raw.transaction.actions = [functionCall("close_capsule", { capsule_id: "work" }, "1")];
  f.raw.transaction_outcome.outcome.executor_id = intent.sender_id;
  f.raw.receipts_outcome = f.raw.receipts_outcome.map((o, i) => ({ ...o, outcome: { ...o.outcome, executor_id: i === 1 ? intent.sender_id : target.contract_id,
    status: i === 0 ? record ? { SuccessReceiptId: refs.callback } : { SuccessValue: encode(reply) }
      : i === 1 ? state === "FAILED" ? { Failure: { untrusted: "PRIVATE_CANARY" } } : { SuccessValue: "" }
      : state === "PENDING" ? { Failure: { untrusted: "PRIVATE_CANARY" } } : { SuccessValue: encode(reply) }, receipt_ids: i === 0 && !record ? [] : o.outcome.receipt_ids } }));
  f.raw.receipts = f.raw.receipts.map((r, i) => ({ ...r, predecessor_id: i === 0 ? intent.sender_id : target.contract_id,
    receiver_id: i === 1 ? intent.sender_id : target.contract_id, receipt: { Action: { ...r.receipt.Action, signer_id: intent.sender_id, signer_public_key: intent.public_key,
      actions: i === 0 ? [functionCall("close_capsule", { capsule_id: "work" }, "1")]
        : i === 1 ? [{ Transfer: { deposit: amount } }] : [functionCall("resolve_owner_refund", { capsule_id: "work", attempt: 1 }, "0", "25000000000000")] } } }));
  if (!record) { f.raw.receipts = f.raw.receipts.slice(0, 1); f.raw.receipts_outcome = f.raw.receipts_outcome.slice(0, 1); }
  f.raw.status = state === "PENDING" ? { Failure: { untrusted: "PRIVATE_CANARY" } } : { SuccessValue: encode(reply) };
  return { f, intent, record, context: { contract_id: target.contract_id, operator_id: target.operator_id, block: f.context.block,
    capsule, outcome_blocks: f.context.outcome_blocks }, raw: f.raw, snapshot: f.snapshot, transport: () => evidenceTransport(f) };
}
