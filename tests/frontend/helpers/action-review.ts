/** Synthetic unsigned/restricted-access fixtures only; no signing secret or real accounts. */
import { commercialQuoteHash } from "../../../src/lib/purchasing/hashing.ts";
import { parsePurchaseAction } from "../../../src/lib/near/action-review.ts";
import { evidenceFixture, evidenceTransport, refs, target } from "./testnet-evidence.ts";

export const scope = { agent_id: "agent.testnet", public_key: `ed25519:${"1".repeat(32)}`,
  recovery_public_key: `ed25519:${"2".repeat(44)}`, max_allowance: "250000000000000000000000" };
export function keyFixture(allowance = scope.max_allowance) {
  const key = { nonce: 7, permission: { FunctionCall: { allowance, receiver_id: target.contract_id, method_names: ["submit_purchase"] } } };
  return { key, keys: [{ public_key: scope.public_key, access_key: key },
    { public_key: scope.recovery_public_key, access_key: { nonce: 1, permission: "FullAccess" } }] };
}
export async function reviewFixture(approval = false) {
  const f = await evidenceFixture("APPROVAL_PENDING");
  f.quote.terms = { ...f.quote.terms, input: { ...f.quote.terms.input, expires_at_ns: "100000000030" } };
  f.quote.quote_hash = await commercialQuoteHash(f.quote.terms, "testnet", target.contract_id);
  const proposal = { ...f.intent.proposal, expected_quote_hash: f.quote.quote_hash };
  const record = { ...f.snapshot.purchases[0], proposal, canonical_quote: f.quote.terms, approval_expires_at_ns: "90000000030" };
  const snapshot = { ...f.snapshot, project: { ...f.snapshot.project,
    input: { ...f.snapshot.project.input, expires_at_ns: "120000000030" } },
  capsule: { ...f.snapshot.capsule, policy: { ...f.snapshot.capsule.policy, expires_at_ns: "120000000030" }, request_ids: approval ? ["database"] : [] },
  purchases: approval ? [record] : [], provisioning: approval ? f.snapshot.provisioning : [] };
  f.snapshot = snapshot;
  const action = parsePurchaseAction({ method: approval ? "approve_purchase" : "submit_purchase", signer_id: approval ? target.operator_id : scope.agent_id,
    public_key: scope.public_key, gas: "100000000000000", proposal, expected_request_hash: approval ? record.request_hash : null });
  return { f, action, ...keyFixture() };
}
export function reviewTransport(data: Awaited<ReturnType<typeof reviewFixture>>,
  change?: (method: string, params: Record<string, unknown>, result: unknown) => unknown) {
  const base = evidenceTransport(data.f), calls: { method: string; params: Record<string, unknown> }[] = [];
  const transport: typeof fetch = async (url, options) => {
    const r = JSON.parse(String(options?.body)); calls.push(r);
    let result: unknown;
    if (r.method === "query" && r.params.request_type === "view_access_key") result = { ...data.key, block_hash: refs.finalBlock, block_height: 30 };
    else if (r.method === "query" && r.params.request_type === "view_access_key_list") result = { keys: data.keys, block_hash: refs.finalBlock, block_height: 30 };
    else result = (await (await base.transport(url, options)).json()).result;
    const envelope = change?.(r.method, r.params, result) ?? { result };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, ...envelope as object }), { headers: { "content-type": "application/json" } });
  };
  return { transport, calls };
}
