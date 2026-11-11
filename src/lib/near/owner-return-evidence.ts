/** Native owner-return evidence only. Never a refund setter, retry, release or purchase outcome. */
import { account, amount, boolean, count, enumValue, fail, id, list, object, parseBoundedJson, reference, time } from "./records.ts";
import { canonicalEvidence as canonical, executionOutcome, executionReceipt, executionStatus, inspectFunctionCall, publicKey } from "./testnet-evidence.ts";
import type { FinalBlock } from "./testnet-target.ts";

export function parseOwnerReturnIntent(input: unknown) {
  const v = object(input, ["transaction_hash", "sender_id", "public_key", "gas", "capsule_id", "expected_attempt"]);
  const gas = time(v.gas); if (gas === "0" || BigInt(gas) > 300_000_000_000_000n) return fail("OWNER_RETURN_GAS_INVALID");
  const attempt = v.expected_attempt === null ? null : count(v.expected_attempt, 0xffff_ffff);
  if (attempt === 0) return fail("OWNER_RETURN_ATTEMPT_INVALID");
  return Object.freeze({ transaction_hash: reference(v.transaction_hash), sender_id: account(v.sender_id), public_key: publicKey(v.public_key),
    gas, capsule_id: id(v.capsule_id), expected_attempt: attempt });
}
export type OwnerReturnIntent = ReturnType<typeof parseOwnerReturnIntent>;
export function parseOwnerReturnRecord(input: unknown) {
  const r = object(input, ["attempt", "amount", "status", "created_at_ns", "resolved_at_ns", "reconciliation_required"]);
  const attempt = count(r.attempt, 0xffff_ffff), value = amount(r.amount), state = enumValue(r.status, ["PENDING", "RETURNED", "FAILED"]);
  const created = time(r.created_at_ns), resolved = r.resolved_at_ns === null ? null : time(r.resolved_at_ns);
  if (!attempt || value === "0" || (state === "PENDING") !== (resolved === null) || resolved !== null && BigInt(resolved) < BigInt(created)) return fail("OWNER_RETURN_RECORD_INVALID");
  return Object.freeze({ attempt, amount: value, status: state, created_at_ns: created, resolved_at_ns: resolved, reconciliation_required: boolean(r.reconciliation_required) });
}
export function unverifiedOwnerReturn(intent: OwnerReturnIntent, limitation: string) {
  return Object.freeze({ ...intent, submission: "UNAVAILABLE" as "UNAVAILABLE" | "NOT_FINAL" | "FINAL",
    owner_return_evidence: "RETURN_UNVERIFIED" as "RETURN_UNVERIFIED" | "NOT_ATTEMPTED" | "RETURNED" | "RETURN_FAILED",
    initial_receipt_id: null as string | null, transfer_receipt_id: null as string | null, callback_receipt_id: null as string | null,
    transfer_succeeded: null as boolean | null, callback_succeeded: null as boolean | null, amount: null as string | null,
    record: null as ReturnType<typeof parseOwnerReturnRecord> | null, limitation, independently_verified: false as const, grants_payment_authority: false as const });
}
interface Context { readonly contract_id: string; readonly operator_id: string; readonly block: FinalBlock; readonly capsule: unknown;
  readonly outcome_blocks: Readonly<Record<string, FinalBlock>> }
function equal(a: unknown, b: unknown, code: string) { if (canonical(a) !== canonical(b)) return fail(code); }
function refundResponse(value: string) {
  const r = object(parseBoundedJson(value, 16384), ["record", "transfer_scheduled", "reason_code", "source"]);
  if (r.source !== "CONTRACT_OWNER_REFUND" || r.transfer_scheduled !== false) return fail("OWNER_RETURN_RESPONSE_INVALID");
  const reason = r.reason_code === null ? null : enumValue(r.reason_code, ["CAPSULE_ALREADY_CLOSING_OR_CLOSED", "NO_UNUSED_PURCHASE_FUNDS", "REFUND_RECONCILIATION_REQUIRED", "REFUND_NOT_PENDING"]);
  return { record: r.record === null ? null : parseOwnerReturnRecord(r.record), reason_code: reason };
}
export function inspectOwnerReturnEvidence(intent: OwnerReturnIntent, input: unknown, context: Context) {
  const raw = object(input), tx = object(raw.transaction), c = object(context.capsule), policy = object(c.policy);
  if (intent.sender_id !== context.operator_id || c.owner_id !== context.operator_id || c.capsule_id !== intent.capsule_id
    || tx.hash !== intent.transaction_hash || tx.signer_id !== intent.sender_id || tx.public_key !== intent.public_key || tx.receiver_id !== context.contract_id) return fail("OWNER_RETURN_IDENTITY_MISMATCH");
  const actions = list(tx.actions, 1); if (actions.length !== 1) return fail("OWNER_RETURN_ACTION_MISMATCH");
  inspectFunctionCall(actions[0], "close_capsule", { capsule_id: intent.capsule_id }, "1", intent.gas);
  const a = BigInt(amount(c.allocated)), s = BigInt(amount(c.spent)), r = BigInt(amount(c.reserved)), future = BigInt(amount(c.committed_future)), returned = BigInt(amount(c.returned));
  if (s + r + future > a || a + returned !== BigInt(amount(policy.budget))) return fail("OWNER_RETURN_LEDGER_INVALID");
  const state = enumValue(c.status, ["ACTIVE", "PAUSED", "REVOKED", "COMPLETED", "CLOSING", "CLOSED"]);
  const record = c.owner_refund === null ? null : parseOwnerReturnRecord(c.owner_refund);
  if (record && record.attempt !== count(c.refund_attempts, 0xffff_ffff)) return fail("OWNER_RETURN_ATTEMPT_MISMATCH");
  const base = { ...unverifiedOwnerReturn(intent, "INCOMPLETE_OWNER_TRANSFER_CALLBACK_EVIDENCE"), record };
  if (enumValue(raw.final_execution_status, ["NONE", "INCLUDED", "EXECUTED_OPTIMISTIC", "INCLUDED_FINAL", "EXECUTED", "FINAL"]) !== "FINAL") return Object.freeze({ ...base, submission: "NOT_FINAL" as const });
  const root = executionOutcome(raw.transaction_outcome);
  if (root.id !== intent.transaction_hash || root.executor !== intent.sender_id || root.status.kind !== "RECEIPT" || root.children.length !== 1 || root.children[0] !== root.status.receipt_id) return fail("OWNER_RETURN_ROOT_MISMATCH");
  const outcomes = list(raw.receipts_outcome, 32).map(executionOutcome), receipts = list(raw.receipts ?? [], 32).map(executionReceipt);
  if (new Set(outcomes.map(o => o.id)).size !== outcomes.length || new Set(receipts.map(o => o.id)).size !== receipts.length || outcomes.some(o => o.id === root.id)) return fail("OWNER_RETURN_DUPLICATE_RECEIPT");
  const byId = new Map(outcomes.map(o => [o.id, o])), byReceipt = new Map(receipts.map(o => [o.id, o]));
  const initial = byId.get(root.children[0]), ir = byReceipt.get(root.children[0]);
  const unknown = { ...base, submission: "FINAL" as const };
  if (!initial || !ir) return Object.freeze(unknown);
  const visited = new Set<string>(), queue = [initial.id];
  while (queue.length) {
    const key = queue.pop()!; if (visited.has(key)) return fail("OWNER_RETURN_GRAPH_INVALID"); visited.add(key);
    const o = byId.get(key), receipt = byReceipt.get(key); if (!o || !receipt) return Object.freeze(unknown);
    if (o.executor !== receipt.receiver || key !== initial.id && ![context.contract_id, "system"].includes(receipt.predecessor)) return fail("OWNER_RETURN_GRAPH_INVALID");
    queue.push(...o.children);
  }
  if (outcomes.some(o => !visited.has(o.id)) || receipts.some(o => !visited.has(o.id))) return fail("OWNER_RETURN_ORPHAN_RECEIPT");
  for (const gasRefund of receipts.filter(o => o.predecessor === "system")) {
    const actions = list(gasRefund.action.actions, 1);
    if (gasRefund.receiver !== intent.sender_id || actions.length !== 1 || list(gasRefund.action.input_data_ids, 8).length || list(gasRefund.action.output_data_receivers, 8).length) return fail("OWNER_RETURN_SYSTEM_RECEIPT_MISMATCH");
    amount(object(object(actions[0], ["Transfer"]).Transfer, ["deposit"]).deposit);
  }
  for (const o of [root, ...outcomes]) {
    const b = context.outcome_blocks[o.block_hash]; if (!b) return Object.freeze(unknown);
    if (b.hash !== o.block_hash || b.height > context.block.height || BigInt(time(b.timestamp_ns)) > BigInt(context.block.timestamp_ns)) return fail("OWNER_RETURN_STALE_BLOCK");
  }
  if (ir.predecessor !== intent.sender_id || ir.receiver !== context.contract_id || ir.action.signer_id !== intent.sender_id || ir.action.signer_public_key !== intent.public_key || list(ir.action.input_data_ids, 8).length) return fail("OWNER_RETURN_INITIATOR_MISMATCH");
  const ia = list(ir.action.actions, 1); if (ia.length !== 1) return fail("OWNER_RETURN_INITIATOR_MISMATCH");
  inspectFunctionCall(ia[0], "close_capsule", { capsule_id: intent.capsule_id }, "1", intent.gas);
  const started = { ...unknown, initial_receipt_id: initial.id }, emitted = receipts.filter(o => o.predecessor === context.contract_id), overall = executionStatus(raw.status);
  if (initial.status.kind === "FAILURE") {
    if (emitted.length || overall.kind !== "FAILURE") return fail("OWNER_RETURN_FAILED_CALL_EMITTED_TRANSFER");
    return Object.freeze({ ...started, owner_return_evidence: "NOT_ATTEMPTED" as const, limitation: "This close call rolled back; no owner return was scheduled. Existing operations remain separate." });
  }
  if (initial.status.kind === "VALUE") {
    if (emitted.length || overall.kind !== "VALUE") return fail("OWNER_RETURN_NO_TRANSFER_MISMATCH"); equal(overall.value, initial.status.value, "OWNER_RETURN_FINAL_VALUE_MISMATCH");
    const reply = refundResponse(initial.status.value); equal(reply.record, record, "OWNER_RETURN_FINAL_RECORD_MISMATCH");
    if (reply.reason_code === "NO_UNUSED_PURCHASE_FUNDS" ? intent.expected_attempt !== null || record !== null || state !== "CLOSED" || r !== 0n || a - s - future !== 0n
      : reply.reason_code !== "CAPSULE_ALREADY_CLOSING_OR_CLOSED" || !["CLOSED", "CLOSING"].includes(state)) return fail("OWNER_RETURN_NO_TRANSFER_MISMATCH");
    return Object.freeze({ ...started, owner_return_evidence: "NOT_ATTEMPTED" as const, limitation: "This finalized call scheduled no new return. An earlier return, if present, needs its own identity-bound evidence." });
  }
  if (initial.status.kind !== "RECEIPT") return Object.freeze(started);
  const transfers = emitted.filter(o => list(o.action.actions, 8).some(a => Object.hasOwn(object(a), "Transfer")));
  const callbacks = emitted.filter(o => list(o.action.actions, 8).some(a => Object.hasOwn(object(a), "FunctionCall")));
  if (!record || intent.expected_attempt !== record.attempt || transfers.length !== 1 || callbacks.length !== 1 || emitted.length !== 2) return fail("OWNER_RETURN_TRANSFER_SCOPE_MISMATCH");
  const t = transfers[0], cb = callbacks[0], to = byId.get(t.id)!, co = byId.get(cb.id)!;
  if (initial.status.receipt_id !== cb.id || !initial.children.includes(t.id) || !initial.children.includes(cb.id) || t.receiver !== c.owner_id || cb.receiver !== context.contract_id
    || [t, cb].some(o => o.action.signer_id !== intent.sender_id || o.action.signer_public_key !== intent.public_key)) return fail("OWNER_RETURN_TRANSFER_SCOPE_MISMATCH");
  const ta = list(t.action.actions, 1), ca = list(cb.action.actions, 1);
  if (ta.length !== 1 || ca.length !== 1 || list(t.action.input_data_ids, 8).length || amount(object(object(ta[0], ["Transfer"]).Transfer, ["deposit"]).deposit) !== record.amount) return fail("OWNER_RETURN_AMOUNT_MISMATCH");
  inspectFunctionCall(ca[0], "resolve_owner_refund", { capsule_id: intent.capsule_id, attempt: record.attempt }, "0", "25000000000000");
  const inputs = list(cb.action.input_data_ids, 1).map(reference), outputs = list(t.action.output_data_receivers, 1).map(v => object(v, ["data_id", "receiver_id"]));
  if (inputs.length !== 1 || outputs.length !== 1 || inputs[0] !== reference(outputs[0].data_id) || outputs[0].receiver_id !== context.contract_id || list(cb.action.output_data_receivers, 8).length) return fail("OWNER_RETURN_DEPENDENCY_MISMATCH");
  const ib = context.outcome_blocks[initial.block_hash], tb = context.outcome_blocks[to.block_hash], cbBlock = context.outcome_blocks[co.block_hash];
  if (tb.height < ib.height || cbBlock.height < tb.height || BigInt(tb.timestamp_ns) < BigInt(ib.timestamp_ns) || BigInt(cbBlock.timestamp_ns) < BigInt(tb.timestamp_ns) || record.created_at_ns !== ib.timestamp_ns) return fail("OWNER_RETURN_TIME_MISMATCH");
  const evidence = { ...started, amount: record.amount, transfer_receipt_id: t.id, callback_receipt_id: cb.id,
    transfer_succeeded: to.status.kind === "VALUE" ? true : to.status.kind === "FAILURE" ? false : null,
    callback_succeeded: co.status.kind === "VALUE" ? true : co.status.kind === "FAILURE" ? false : null };
  if (to.status.kind === "VALUE" && to.status.value !== "") return fail("OWNER_RETURN_NATIVE_VALUE_MISMATCH");
  const pending = () => { if (state !== "CLOSING" || record.status !== "PENDING" || record.resolved_at_ns !== null || r !== BigInt(record.amount)) return fail("OWNER_RETURN_UNPROVEN_RELEASE"); return Object.freeze(evidence); };
  if (co.status.kind !== "VALUE") return pending();
  const reply = refundResponse(co.status.value); equal(reply.record, record, "OWNER_RETURN_FINAL_RECORD_MISMATCH");
  if (overall.kind !== "VALUE") return fail("OWNER_RETURN_FINAL_VALUE_MISMATCH"); equal(overall.value, co.status.value, "OWNER_RETURN_FINAL_VALUE_MISMATCH");
  if (reply.reason_code === "REFUND_RECONCILIATION_REQUIRED") { if (!record.reconciliation_required) return fail("OWNER_RETURN_UNPROVEN_RELEASE"); return pending(); }
  if (reply.reason_code !== null || record.reconciliation_required || record.resolved_at_ns !== cbBlock.timestamp_ns || r !== 0n) return fail("OWNER_RETURN_RESOLUTION_MISMATCH");
  if (to.status.kind === "VALUE" && record.status === "RETURNED" && state === "CLOSED" && returned >= BigInt(record.amount) && a === s + future) return Object.freeze({ ...evidence, owner_return_evidence: "RETURNED" as const, limitation: "RPC-reported native owner transfer and successful private refund callback. Purchase spend, future commitments and history storage are separate; not a light-client proof." });
  if (to.status.kind === "FAILURE" && record.status === "FAILED" && state === "REVOKED" && a - s - future === BigInt(record.amount)) return Object.freeze({ ...evidence, owner_return_evidence: "RETURN_FAILED" as const, limitation: "Confirmed failed owner transfer and matching private callback. No return was counted; no automatic retry or purchase-reservation release is authorized." });
  return fail("OWNER_RETURN_RESOLUTION_MISMATCH");
}
