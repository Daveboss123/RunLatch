/** Synthetic RPC shape fixtures, never recorded testnet evidence. No signing key. */
import { commercialQuoteHash } from "../../../src/lib/purchasing/hashing.ts";
import { parsePurchase, parseQuote } from "../../../src/lib/near/records.ts";
import { observationFixture } from "./observation.ts";
import { parsePurchaseObservationIntent, type EvidenceContext } from "../../../src/lib/near/testnet-evidence.ts";

export const target = { network: "testnet", rpc_url: "https://rpc.testnet.near.org/", contract_id: "contract.testnet",
  operator_id: "owner.testnet", expected_code_hash: "2".repeat(32) };
export const refs = { tx: "2".repeat(32), initial: "3".repeat(32), transfer: "4".repeat(32), callback: "5".repeat(32),
  initialBlock: "6".repeat(32), transferBlock: "7".repeat(32), callbackBlock: "8".repeat(32), finalBlock: "9".repeat(32), data: "A".repeat(32) };
export const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
export function functionCall(method: string, args: unknown, deposit = "0", gas = "100000000000000") {
  return { FunctionCall: { method_name: method, args: encode(args), deposit, gas: Number(gas) } };
}
export async function evidenceFixture(state = "SETTLED", approval = false, price = "50") {
  const local = await observationFixture(state), p = local.snapshots[0].purchases[0], q = local.quotes[0];
  q.terms = { ...q.terms, publisher_id: "publisher.testnet", input: { ...q.terms.input, recipient_id: "publisher.testnet", price } };
  p.canonical_quote = q.terms;
  p.reserved_amount = state === "SETTLEMENT_PENDING" ? price : "0";
  q.quote_hash = await commercialQuoteHash(q.terms, "testnet", target.contract_id);
  p.proposal.expected_quote_hash = q.quote_hash;
  const purchase = parsePurchase({ ...p, approved_by: approval ? "owner.testnet" : null });
  const intent = parsePurchaseObservationIntent({ transaction_hash: refs.tx, sender_id: approval ? "owner.testnet" : "agent.testnet",
    public_key: `ed25519:${"1".repeat(32)}`, method: approval ? "approve_purchase" : "submit_purchase", gas: "100000000000000", proposal: p.proposal,
    expected_request_hash: approval ? p.request_hash : null });
  const args = approval ? { capsule_id: "work", request_id: "database", expected_request_hash: p.request_hash } : { proposal: p.proposal };
  const project = { ...local.snapshots[0].project, owner_id: "owner.testnet" };
  const capsule = { ...local.snapshots[0].capsule, owner_id: "owner.testnet", created_at_ns: "1", policy_schema_version: 2,
    policy: { ...local.snapshots[0].capsule.policy, agent_id: "agent.testnet", agent_public_key: intent.public_key } };
  const snapshot = { ...local.snapshots[0], capsule, project, purchases: [purchase] };
  const quote = await parseQuote(q, target.contract_id, [{ ...local.providers[0], publisher_id: "publisher.testnet", recipient_id: "publisher.testnet" }]);
  const context: { -readonly [K in keyof EvidenceContext]: EvidenceContext[K] } = { contract_id: target.contract_id, operator_id: target.operator_id,
    block: { hash: refs.finalBlock, height: 30, timestamp_ns: "30" }, capsule, purchase, quote,
    outcome_blocks: Object.fromEntries([[refs.initialBlock, 10, "10"], [refs.transferBlock, 15, "15"], [refs.callbackBlock, 20, "20"]]
      .map(([hash, height, timestamp_ns]) => [hash, { hash: String(hash), height: Number(height), timestamp_ns: String(timestamp_ns) }])) };
  const reply = { decision: p.decision, reason_codes: p.reason_codes, transfer_scheduled: false, source: "CONTRACT_EXECUTION_RECORD", request: purchase };
  const paid = ["SETTLED", "SETTLEMENT_FAILED", "SETTLEMENT_PENDING"].includes(state);
  const outcome = (id: string, executor_id: string, block_hash: string, status: object, receipt_ids: string[] = []) => ({ id, block_hash, outcome: { executor_id, status, receipt_ids } });
  const actionReceipt = (receipt_id: string, predecessor_id: string, receiver_id: string, actions: object[], input_data_ids: string[] = [], output_data_receivers: object[] = []) =>
    ({ receipt_id, predecessor_id, receiver_id, receipt: { Action: { signer_id: intent.sender_id, signer_public_key: intent.public_key,
      actions, input_data_ids, output_data_receivers } } });
  const raw = { final_execution_status: "FINAL", status: (state === "SETTLEMENT_PENDING" ? { Failure: { untrusted: "provider-error" } } : { SuccessValue: encode(reply) }) as unknown,
    transaction: { hash: refs.tx, signer_id: intent.sender_id, public_key: intent.public_key, receiver_id: target.contract_id,
      actions: [functionCall(intent.method, args, approval ? "1" : "0")] },
    transaction_outcome: outcome(refs.tx, intent.sender_id, refs.initialBlock, { SuccessReceiptId: refs.initial }, [refs.initial]),
    receipts_outcome: [outcome(refs.initial, target.contract_id, refs.initialBlock, paid ? { SuccessReceiptId: refs.callback } : { SuccessValue: encode(reply) }, paid ? [refs.transfer, refs.callback] : []),
      ...(paid ? [outcome(refs.transfer, "publisher.testnet", refs.transferBlock, state === "SETTLEMENT_FAILED" ? { Failure: { untrusted: "provider-error" } } : { SuccessValue: "" }),
        outcome(refs.callback, target.contract_id, refs.callbackBlock, state === "SETTLEMENT_PENDING" ? { Failure: { untrusted: "provider-error" } } : { SuccessValue: encode(reply) })] : [])],
    receipts: [actionReceipt(refs.initial, intent.sender_id, target.contract_id, [functionCall(intent.method, args, approval ? "1" : "0")]),
      ...(paid ? [actionReceipt(refs.transfer, target.contract_id, "publisher.testnet", [{ Transfer: { deposit: price } }], [], [{ data_id: refs.data, receiver_id: target.contract_id }]),
        actionReceipt(refs.callback, target.contract_id, target.contract_id, [functionCall("resolve_purchase", { purchase_key: "work:database" }, "0", "25000000000000")], [refs.data])] : [])] };
  return { intent, context, raw, reply, snapshot, provider: { ...local.providers[0], publisher_id: "publisher.testnet", recipient_id: "publisher.testnet" }, quote: q };
}

export function evidenceTransport(f: Awaited<ReturnType<typeof evidenceFixture>>, version = "2.14.0-rc.5",
  change?: (method: string, params: Record<string, unknown>, result: unknown) => unknown) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const transport: typeof fetch = async (_url, options) => {
    const r = JSON.parse(String(options?.body)); calls.push(r); let result: unknown;
    if (r.method === "status") result = { chain_id: "testnet", sync_info: { syncing: false }, version: { version } };
    else if (r.method === "tx_status" || r.method === "EXPERIMENTAL_tx_status") result = f.raw;
    else if (r.method === "block") {
      const b = r.params.finality ? f.context.block : f.context.outcome_blocks[r.params.block_id];
      result = { header: { hash: b.hash, height: b.height, timestamp_nanosec: b.timestamp_ns } };
    } else if (r.method === "query") {
      const values: Record<string, unknown> = { get_operator: target.operator_id, get_schema_version: 2, get_network_tag: "testnet",
        get_storage_requirements: { project_credit: "8192", capsule_credit: "262144", provider_credit: "4096", quote_credit: "8192", scope: "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS" },
        get_capsule_report_snapshot: f.snapshot, get_project: f.snapshot.project, get_provider: f.provider, get_quote: f.quote };
      const block = r.params.block_id === refs.finalBlock ? f.context.block : f.context.outcome_blocks[r.params.block_id];
      result = { block_hash: block.hash, block_height: block.height, ...(r.params.request_type === "view_account" ? { code_hash: target.expected_code_hash }
        : { result: [...Buffer.from(JSON.stringify(values[r.params.method_name]))] }) };
    } else throw new Error("UNEXPECTED_WRITE_OR_DISPATCH");
    const envelope = change?.(r.method, r.params, result) ?? { result };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, ...envelope as object }), { headers: { "content-type": "application/json" } });
  };
  return { transport, calls };
}
