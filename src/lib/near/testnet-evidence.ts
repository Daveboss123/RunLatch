/** RPC-evidence consistency only: no light client, signer, policy engine or settlement setter. */
import { calculateCommitment } from "../purchasing/commitment.ts";
import { account, amount, boolean, count, enumValue, fail, hash, id, list, object, parseBoundedJson,
  parseProposal, parsePurchase, reference, time, type Proposal, type Purchase, type RegisteredQuote } from "./records.ts";

export interface PurchaseObservationIntent {
  readonly transaction_hash: string; readonly sender_id: string; readonly public_key: string;
  readonly method: "submit_purchase" | "approve_purchase"; readonly gas: string;
  readonly proposal: Proposal; readonly expected_request_hash: string | null;
}
export function publicKey(value: unknown): string {
  if (typeof value !== "string" || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(value)) return fail("INVALID_OBSERVATION_PUBLIC_KEY");
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", encoded = value.slice(8);
  let n = 0n;
  for (const c of encoded) n = n * 58n + BigInt(alphabet.indexOf(c));
  let bytes = 0;
  while (n > 0n) { bytes++; n >>= 8n; }
  if (bytes + (encoded.match(/^1*/u)?.[0].length ?? 0) !== 32) return fail("INVALID_OBSERVATION_PUBLIC_KEY");
  return value;
}
export function parsePurchaseObservationIntent(value: unknown): PurchaseObservationIntent {
  const v = object(value, ["transaction_hash", "sender_id", "public_key", "method", "gas", "proposal", "expected_request_hash"]);
  const method = enumValue(v.method, ["submit_purchase", "approve_purchase"]), gas = time(v.gas);
  if (BigInt(gas) === 0n || BigInt(gas) > 300_000_000_000_000n) return fail("INVALID_OBSERVATION_GAS");
  if (method === "submit_purchase" ? v.expected_request_hash !== null : v.expected_request_hash === null) return fail("INVALID_OBSERVATION_APPROVAL_BINDING");
  return Object.freeze({ transaction_hash: reference(v.transaction_hash), sender_id: account(v.sender_id), public_key: publicKey(v.public_key), method, gas,
    proposal: parseProposal(v.proposal), expected_request_hash: v.expected_request_hash === null ? null : hash(v.expected_request_hash) });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(object(value)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function equal(a: unknown, b: unknown, code: string) { if (canonical(a) !== canonical(b)) return fail(code); }
function decode(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 || value.length % 4 !== 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return fail("INVALID_EXECUTION_BASE64");
  try {
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    if (bytes.length > max) return fail("EXECUTION_VALUE_LIMIT");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch { return fail("INVALID_EXECUTION_ENCODING"); }
}
type Status = { kind: "VALUE"; value: string } | { kind: "RECEIPT"; receipt_id: string } | { kind: "FAILURE" } | { kind: "UNKNOWN" };
function status(value: unknown): Status {
  if (value === "Unknown") return { kind: "UNKNOWN" };
  const s = object(value), fields = Object.keys(s);
  if (fields.length !== 1) return fail("INVALID_EXECUTION_STATUS");
  if (Object.hasOwn(s, "SuccessValue")) return { kind: "VALUE", value: decode(s.SuccessValue, 65_536) };
  if (Object.hasOwn(s, "SuccessReceiptId")) return { kind: "RECEIPT", receipt_id: reference(s.SuccessReceiptId) };
  // Provider failure details are deliberately neither interpreted nor returned.
  if (Object.hasOwn(s, "Failure")) return { kind: "FAILURE" };
  return fail("INVALID_EXECUTION_STATUS");
}
export function observationArgs(intent: PurchaseObservationIntent) {
  return intent.method === "submit_purchase" ? { proposal: intent.proposal }
    : { capsule_id: intent.proposal.capsule_id, request_id: intent.proposal.request_id, expected_request_hash: intent.expected_request_hash };
}
function call(value: unknown, method: string, args: unknown, deposit: string, gas: string) {
  const action = object(value, ["FunctionCall"]), c = object(action.FunctionCall, ["method_name", "args", "deposit", "gas"]);
  if (c.method_name !== method || amount(c.deposit) !== deposit || String(count(c.gas, 300_000_000_000_000)) !== gas) return fail("TRANSACTION_ACTION_MISMATCH");
  equal(parseBoundedJson(decode(c.args, 4096), 4096), args, "TRANSACTION_ARGUMENT_MISMATCH");
}
interface Outcome { readonly id: string; readonly block_hash: string; readonly executor: string; readonly children: readonly string[]; readonly status: Status }
function outcome(value: unknown): Outcome {
  const o = object(value), body = object(o.outcome), children = list(body.receipt_ids, 32).map(reference);
  if (new Set(children).size !== children.length) return fail("DUPLICATE_OUTCOME_CHILD");
  return { id: reference(o.id), block_hash: reference(o.block_hash), executor: account(body.executor_id), children, status: status(body.status) };
}
interface Receipt { readonly id: string; readonly predecessor: string; readonly receiver: string; readonly action: Record<string, unknown> }
function receipt(value: unknown): Receipt {
  const r = object(value), body = object(r.receipt, ["Action"]), a = object(body.Action);
  list(a.actions, 8); list(a.input_data_ids, 8); list(a.output_data_receivers, 8);
  return { id: reference(r.receipt_id), predecessor: account(r.predecessor_id), receiver: account(r.receiver_id), action: a };
}
function response(value: string) {
  const r = object(parseBoundedJson(value, 65_536), ["decision", "reason_codes", "transfer_scheduled", "source", "request"]);
  const decision = enumValue(r.decision, ["APPROVED", "APPROVAL_REQUIRED", "DENIED"]), reasons = Object.freeze(list(r.reason_codes, 32).map(id));
  const source = enumValue(r.source, ["CONTRACT_EXECUTION_RECORD", "CONTRACT_REJECTED_ATTEMPT"]);
  const scheduled = boolean(r.transfer_scheduled), record = r.request === null ? null : parsePurchase(r.request);
  if (source === "CONTRACT_REJECTED_ATTEMPT" && (decision !== "DENIED" || scheduled)) return fail("INVALID_REJECTED_ATTEMPT");
  if (source === "CONTRACT_EXECUTION_RECORD") {
    if (!record || decision !== record.decision) return fail("EXECUTION_RECORD_MISMATCH");
    equal(reasons, record.reason_codes, "EXECUTION_RECORD_MISMATCH");
  }
  return { decision, reason_codes: reasons, source, transfer_scheduled: scheduled, record };
}
function immutable(record: Purchase) {
  return { proposal: record.proposal, request_hash: record.request_hash, policy_hash: record.policy_hash, canonical_quote: record.canonical_quote,
    created_at_ns: record.created_at_ns, approval_expires_at_ns: record.approval_expires_at_ns };
}
export interface EvidenceContext {
  readonly contract_id: string; readonly operator_id: string; readonly block: { readonly hash: string; readonly height: number; readonly timestamp_ns: string };
  readonly capsule: unknown; readonly purchase: Purchase | null; readonly quote: RegisteredQuote | null;
  readonly outcome_blocks: Readonly<Record<string, { readonly hash: string; readonly height: number; readonly timestamp_ns: string }>>;
}
export function unverifiedPurchase(intent: PurchaseObservationIntent, reason: string) {
  return Object.freeze({ transaction_hash: intent.transaction_hash, proposal: intent.proposal,
    submission: "UNAVAILABLE" as "UNAVAILABLE" | "NOT_FINAL" | "FINAL", payment_evidence: "SETTLEMENT_UNVERIFIED" as "SETTLEMENT_UNVERIFIED" | "NOT_ATTEMPTED" | "SETTLED" | "SETTLEMENT_FAILED",
    actual_decision: null as Purchase["decision"] | null, reason_codes: Object.freeze([]) as readonly string[],
    record_source: null as "CONTRACT_EXECUTION_RECORD" | "CONTRACT_REJECTED_ATTEMPT" | "TRANSACTION_EXECUTION_FAILURE" | null,
    initial_receipt_id: null as string | null, transfer_receipt_id: null as string | null, callback_receipt_id: null as string | null,
    transfer_succeeded: null as boolean | null, callback_succeeded: null as boolean | null,
    final_record: null as Purchase | null, limitation: reason, grants_payment_authority: false as const, independently_verified: false as const });
}

/** Pure validation is never chain evidence by itself. The reader supplies only pinned RPC records. */
export function inspectPurchaseEvidence(intent: PurchaseObservationIntent, raw: unknown, context: EvidenceContext) {
  const result = object(raw), tx = object(result.transaction), capsule = object(context.capsule), policy = object(capsule.policy);
  const unknown = { ...unverifiedPurchase(intent, "INCOMPLETE_TRANSACTION_TRANSFER_CALLBACK_EVIDENCE"), final_record: context.purchase };
  if (tx.hash !== intent.transaction_hash || tx.signer_id !== intent.sender_id || tx.public_key !== intent.public_key || tx.receiver_id !== context.contract_id
    || intent.sender_id === context.contract_id || capsule.capsule_id !== intent.proposal.capsule_id || capsule.owner_id !== context.operator_id
    || policy.project_id !== intent.proposal.project_id) return fail("TRANSACTION_IDENTITY_MISMATCH");
  const actions = list(tx.actions, 1);
  if (actions.length !== 1) return fail("TRANSACTION_ACTION_MISMATCH");
  call(actions[0], intent.method, observationArgs(intent), intent.method === "submit_purchase" ? "0" : "1", intent.gas);
  if (enumValue(result.final_execution_status, ["NONE", "INCLUDED", "EXECUTED_OPTIMISTIC", "INCLUDED_FINAL", "EXECUTED", "FINAL"]) !== "FINAL") return Object.freeze({ ...unknown, submission: "NOT_FINAL" as const });
  const txOutcome = outcome(result.transaction_outcome);
  if (txOutcome.id !== intent.transaction_hash || txOutcome.executor !== intent.sender_id || txOutcome.status.kind !== "RECEIPT"
    || txOutcome.children.length !== 1 || txOutcome.children[0] !== txOutcome.status.receipt_id) return fail("TRANSACTION_ROOT_MISMATCH");
  const outcomes = list(result.receipts_outcome, 32).map(outcome), receipts = list(result.receipts ?? [], 32).map(receipt);
  if (new Set(outcomes.map(o => o.id)).size !== outcomes.length || new Set(receipts.map(r => r.id)).size !== receipts.length
    || outcomes.some(o => o.id === intent.transaction_hash)) return fail("DUPLICATE_EXECUTION_RECEIPT");
  const byId = new Map(outcomes.map(o => [o.id, o])), byReceipt = new Map(receipts.map(r => [r.id, r]));
  const initial = byId.get(txOutcome.status.receipt_id), initialReceipt = byReceipt.get(txOutcome.status.receipt_id);
  if (!initial || !initialReceipt) return Object.freeze({ ...unknown, submission: "FINAL" as const });
  // Every reported outcome must be reachable, and every emitted action receipt must be present.
  const visited = new Set<string>(), pending = [initial.id];
  while (pending.length) {
    const next = pending.pop()!;
    if (visited.has(next)) return fail("CYCLIC_OR_SHARED_RECEIPT_GRAPH");
    visited.add(next);
    const o = byId.get(next), r = byReceipt.get(next);
    if (!o || !r) return Object.freeze({ ...unknown, submission: "FINAL" as const });
    if (o.executor !== r.receiver) return fail("RECEIPT_EXECUTOR_MISMATCH");
    pending.push(...o.children);
  }
  if (outcomes.some(o => !visited.has(o.id)) || receipts.some(r => !visited.has(r.id))) return fail("ORPHAN_EXECUTION_RECEIPT");
  if (receipts.some(r => r.id !== initial.id && r.predecessor !== context.contract_id && r.predecessor !== "system")) return fail("RECEIPT_PREDECESSOR_MISMATCH");
  for (const o of [txOutcome, ...outcomes]) {
    const block = context.outcome_blocks[o.block_hash];
    if (!block) return Object.freeze({ ...unknown, submission: "FINAL" as const });
    if (block.hash !== o.block_hash || block.height > context.block.height || BigInt(time(block.timestamp_ns)) > BigInt(context.block.timestamp_ns)) return fail("STALE_SETTLEMENT_READBACK");
  }
  if (initialReceipt.predecessor !== intent.sender_id || initialReceipt.receiver !== context.contract_id
    || initialReceipt.action.signer_id !== intent.sender_id || initialReceipt.action.signer_public_key !== intent.public_key
    || list(initialReceipt.action.input_data_ids, 8).length !== 0) return fail("INITIATING_RECEIPT_MISMATCH");
  const initialActions = list(initialReceipt.action.actions, 1);
  if (initialActions.length !== 1) return fail("INITIATING_RECEIPT_MISMATCH");
  call(initialActions[0], intent.method, observationArgs(intent), intent.method === "submit_purchase" ? "0" : "1", intent.gas);
  const base = { ...unknown, submission: "FINAL" as const, initial_receipt_id: initial.id };
  const emitted = receipts.filter(r => r.predecessor === context.contract_id);
  if (initial.status.kind === "FAILURE") {
    if (emitted.length || status(result.status).kind !== "FAILURE") return fail("FAILED_INITIATOR_HAS_PAYMENT");
    return Object.freeze({ ...base, payment_evidence: "NOT_ATTEMPTED" as const, record_source: "TRANSACTION_EXECUTION_FAILURE" as const,
      limitation: "Initiating contract execution failed/rolled back; no surviving denial is inferred. Any original request remains separate." });
  }
  // A wrong account/key can produce an actual rolled-back failure above, never a successful Gate result.
  if (intent.method === "submit_purchase") {
    if (intent.sender_id !== policy.agent_id || intent.public_key !== policy.agent_public_key) return fail("TRANSACTION_AGENT_BINDING_MISMATCH");
  } else if (intent.sender_id !== context.operator_id) return fail("TRANSACTION_OWNER_BINDING_MISMATCH");
  function bindRecord(record: Purchase | null) {
    if (!record || !context.purchase || record.proposal.capsule_id !== intent.proposal.capsule_id || record.proposal.request_id !== intent.proposal.request_id
      || record.policy_hash !== capsule.policy_hash) return fail("EXECUTION_REQUEST_BINDING_MISMATCH");
    equal(immutable(record), immutable(context.purchase), "EXECUTION_REQUEST_BINDING_MISMATCH");
    if (record.approved_by !== null && record.approved_by !== context.operator_id) return fail("EXECUTION_APPROVER_MISMATCH");
    return record;
  }
  if (initial.status.kind === "VALUE") {
    if (emitted.length) return fail("NO_PAYMENT_RESULT_HAS_TRANSFER");
    const r = response(initial.status.value), overall = status(result.status);
    if (overall.kind !== "VALUE") return fail("FINAL_RETURN_MISMATCH");
    equal(overall.value, initial.status.value, "FINAL_RETURN_MISMATCH");
    const record = bindRecord(r.record);
    if (r.transfer_scheduled) return fail("NO_PAYMENT_RESULT_HAS_TRANSFER");
    if (r.source === "CONTRACT_EXECUTION_RECORD") {
      equal(record.proposal, intent.proposal, "EXECUTION_REQUEST_BINDING_MISMATCH");
      if (intent.method === "submit_purchase" && record.created_at_ns !== context.outcome_blocks[initial.block_hash].timestamp_ns
        || intent.method === "approve_purchase" && record.request_hash !== intent.expected_request_hash) return fail("EXECUTION_REQUEST_BINDING_MISMATCH");
      if (r.decision === "APPROVED") return fail("APPROVED_WITHOUT_TRANSFER");
    }
    return Object.freeze({ ...base, payment_evidence: "NOT_ATTEMPTED" as const, actual_decision: r.decision, reason_codes: r.reason_codes,
      record_source: r.source, limitation: "This finalized attempt scheduled no purchase transfer; an original request may have separate payment evidence." });
  }
  if (initial.status.kind !== "RECEIPT") return Object.freeze(base);
  const transfer = emitted.filter(r => list(r.action.actions, 8).some(a => Object.hasOwn(object(a), "Transfer")));
  const callback = emitted.filter(r => list(r.action.actions, 8).some(a => Object.hasOwn(object(a), "FunctionCall")));
  if (transfer.length !== 1 || callback.length !== 1 || emitted.length !== 2) return fail("UNEXPECTED_PURCHASE_RECEIPT_ACTIONS");
  const t = transfer[0], cb = callback[0], to = byId.get(t.id)!, co = byId.get(cb.id)!;
  if ([t, cb].some(r => r.action.signer_id !== intent.sender_id || r.action.signer_public_key !== intent.public_key)) return fail("PURCHASE_RECEIPT_SIGNER_MISMATCH");
  const q = context.quote, p = context.purchase;
  if (!p || !q || initial.status.receipt_id !== cb.id || !initial.children.includes(t.id) || !initial.children.includes(cb.id)
    || p.decision !== "APPROVED" || p.proposal.expected_quote_hash !== q.quote_hash || !q.consumed
    || q.consumed_by !== `${p.proposal.capsule_id}:${p.proposal.request_id}` || p.policy_hash !== capsule.policy_hash) return fail("PAYMENT_REQUEST_BINDING_MISMATCH");
  equal(p.proposal, intent.proposal, "PAYMENT_REQUEST_BINDING_MISMATCH");
  equal(p.canonical_quote, q.terms, "PAYMENT_QUOTE_BINDING_MISMATCH");
  if (intent.method === "approve_purchase" && (p.request_hash !== intent.expected_request_hash || p.approved_by !== context.operator_id)) return fail("PAYMENT_APPROVAL_BINDING_MISMATCH");
  const ta = list(t.action.actions, 1), ca = list(cb.action.actions, 1);
  if (ta.length !== 1 || ca.length !== 1 || t.receiver !== q.terms.input.recipient_id || cb.receiver !== context.contract_id) return fail("TRANSFER_CANONICAL_BINDING_MISMATCH");
  const transferAction = object(object(ta[0], ["Transfer"]).Transfer, ["deposit"]);
  if (amount(transferAction.deposit) !== q.terms.input.price || list(t.action.input_data_ids, 8).length !== 0) return fail("TRANSFER_CANONICAL_BINDING_MISMATCH");
  call(ca[0], "resolve_purchase", { purchase_key: `${p.proposal.capsule_id}:${p.proposal.request_id}` }, "0", "25000000000000");
  const inputs = list(cb.action.input_data_ids, 1).map(reference), outputs = list(t.action.output_data_receivers, 1).map(v => object(v, ["data_id", "receiver_id"]));
  if (inputs.length !== 1 || outputs.length !== 1 || inputs[0] !== reference(outputs[0].data_id) || outputs[0].receiver_id !== context.contract_id
    || list(cb.action.output_data_receivers, 8).length !== 0) return fail("CALLBACK_DEPENDENCY_MISMATCH");
  const initialBlock = context.outcome_blocks[initial.block_hash], callbackBlock = context.outcome_blocks[co.block_hash], transferBlock = context.outcome_blocks[to.block_hash];
  if (transferBlock.height < initialBlock.height || callbackBlock.height < transferBlock.height
    || BigInt(transferBlock.timestamp_ns) < BigInt(initialBlock.timestamp_ns) || BigInt(callbackBlock.timestamp_ns) < BigInt(transferBlock.timestamp_ns)
    || intent.method === "submit_purchase" && p.created_at_ns !== initialBlock.timestamp_ns
    || BigInt(p.created_at_ns) > BigInt(initialBlock.timestamp_ns)) return fail("EXECUTION_RECORD_TIME_MISMATCH");
  const state = { ...base, transfer_receipt_id: t.id, callback_receipt_id: cb.id,
    transfer_succeeded: to.status.kind === "VALUE" ? true : to.status.kind === "FAILURE" ? false : null,
    callback_succeeded: co.status.kind === "VALUE" ? true : co.status.kind === "FAILURE" ? false : null };
  if (to.status.kind === "VALUE" && to.status.value !== "") return fail("NATIVE_TRANSFER_RETURN_MISMATCH");
  if (co.status.kind !== "VALUE") {
    const exposure = calculateCommitment(q.terms.input);
    if (p.status !== "SETTLEMENT_PENDING" || p.resolved_at_ns !== null || p.reserved_amount !== q.terms.input.price
      || p.committed_future_amount !== exposure.committed_future) return fail("UNPROVEN_CALLBACK_RELEASED_FUNDS");
    return Object.freeze({ ...state, limitation: "Transfer/callback unresolved or callback failed; reservation stays quarantined. Never resend or release on timeout." });
  }
  const r = response(co.status.value), record = bindRecord(r.record), overall = status(result.status);
  if (r.source !== "CONTRACT_EXECUTION_RECORD" || r.transfer_scheduled || r.decision !== "APPROVED" || overall.kind !== "VALUE") return fail("CALLBACK_RETURN_MISMATCH");
  equal(overall.value, co.status.value, "CALLBACK_RETURN_MISMATCH"); equal(record, p, "CALLBACK_FINAL_RECORD_MISMATCH");
  if (record.status === "SETTLEMENT_PENDING" && record.reconciliation_required) {
    const exposure = calculateCommitment(q.terms.input);
    if (record.reserved_amount !== q.terms.input.price || record.resolved_at_ns !== null || record.committed_future_amount !== exposure.committed_future) return fail("UNPROVEN_CALLBACK_RELEASED_FUNDS");
    return Object.freeze(state);
  }
  if (to.status.kind !== "VALUE" && to.status.kind !== "FAILURE") return Object.freeze(state);
  const expected = to.status.kind === "VALUE" ? "SETTLED" : "SETTLEMENT_FAILED";
  const exposure = calculateCommitment(q.terms.input);
  if (p.status !== expected || p.reserved_amount !== "0" || p.reconciliation_required || p.resolved_at_ns !== callbackBlock.timestamp_ns
    || p.committed_future_amount !== (expected === "SETTLED" ? exposure.committed_future : "0")) return fail("SETTLEMENT_OUTCOME_MISMATCH");
  return Object.freeze({ ...state, payment_evidence: expected, actual_decision: r.decision, reason_codes: r.reason_codes, record_source: r.source,
    limitation: "Finalized RPC-reported native-transfer/private-callback/actions match the pinned record. Not a light-client proof or provider-delivery guarantee." });
}
