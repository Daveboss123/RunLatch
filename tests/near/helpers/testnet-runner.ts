/** Generated ephemeral identities + bounded synthetic RPC only. Never public-chain evidence. */
import { randomUUID } from "node:crypto";
import { createTestnetReader } from "../../../src/lib/near/testnet-rpc.ts";
import { confirmTestnetAgentRun } from "../../../scripts/near/runner-admission.ts";
import { runRestrictedTestnetPurchase } from "../../../scripts/near/restricted-testnet-runner.ts";
import { injectedKeyFixture } from "./process-key.ts";
import { signedRunFixture } from "./signed-run.ts";
import { reconciliationFixture } from "./nonce-reconciliation.ts";
import { evidenceFixture } from "../../frontend/helpers/testnet-evidence.ts";
import type { LocalSignedIdentity } from "../../../scripts/near/local-nonce-reconciliation.ts";

export function runConsent(f: Awaited<ReturnType<typeof signedRunFixture>>) {
  return { authorization: "HUMAN_APPROVED_EXACT_TESTNET_AGENT_CALL", consent: true, review_hash: f.review.review_hash,
    target: f.target, scope: { agent_id: f.action.signer_id, public_key: f.action.public_key,
      recovery_public_key: f.review.access!.recovery_public_key, max_allowance: f.review.access!.allowance_cap },
    call: f.review.call, exposure: f.review.exposure, calls: 1 };
}
function reader(f: Awaited<ReturnType<typeof signedRunFixture>>, state: {
  block: typeof f.context.block; snapshot: unknown; quote: unknown; execution?: unknown;
  blocks?: Record<string, typeof f.context.block>; nonce: string;
}) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const transport: typeof fetch = async (url, init) => {
    if (url !== f.target.rpc_url || init?.credentials !== "omit" || init.redirect !== "error") throw Error("SYNTHETIC_RPC_SCOPE_MISMATCH");
    const r = JSON.parse(String(init.body)); calls.push(r); let result: unknown;
    if (r.method === "status") result = { chain_id: "testnet", sync_info: { syncing: false }, version: { version: "2.14.0" } };
    else if (r.method === "block") {
      const b = r.params.finality ? state.block : state.blocks![r.params.block_id];
      result = { header: { hash: b.hash, height: b.height, timestamp_nanosec: b.timestamp_ns } };
    } else if (r.method === "tx_status") result = state.execution;
    else if (r.method === "query") {
      const b = r.params.block_id === state.block.hash ? state.block : state.blocks![r.params.block_id];
      const pin = { block_hash: b.hash, block_height: b.height }, key = { ...f.data.key, nonce: Number(state.nonce) };
      if (r.params.request_type === "view_account") result = { ...pin, code_hash: f.target.expected_code_hash };
      else if (r.params.request_type === "view_access_key") result = { ...pin, ...key };
      else if (r.params.request_type === "view_access_key_list") result = { ...pin, keys: [{ public_key: f.action.public_key, access_key: key }, f.data.keys[1]] };
      else {
        const values: Record<string, unknown> = { get_operator: f.target.operator_id, get_schema_version: 2, get_network_tag: "testnet",
          get_storage_requirements: { project_credit: "8192", capsule_credit: "262144", provider_credit: "4096", quote_credit: "8192", scope: "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS" },
          get_capsule_report_snapshot: state.snapshot, get_project: (state.snapshot as { project: unknown }).project,
          get_provider: f.context.provider, get_quote: state.quote };
        if (!(r.params.method_name in values)) throw Error("UNEXPECTED_SYNTHETIC_VIEW");
        result = { ...pin, result: [...Buffer.from(JSON.stringify(values[r.params.method_name]))] };
      }
    } else throw Error("UNEXPECTED_SYNTHETIC_WRITE");
    return Response.json({ jsonrpc: "2.0", id: r.id, result });
  };
  return { reader: createTestnetReader(f.target, transport), calls, transport };
}
export function currentRunReader(f: Awaited<ReturnType<typeof signedRunFixture>>) {
  return reader(f, { block: f.context.block, snapshot: f.context.snapshot, quote: f.context.quote, nonce: f.context.access.nonce });
}
export async function priorRunReader(f: Awaited<ReturnType<typeof signedRunFixture>>, identity: LocalSignedIdentity, status = "SETTLED") {
  const r = await reconciliationFixture(f, identity, status), e = await evidenceFixture(status), c = r.input.context;
  const snapshot = { ...e.snapshot, capsule: { ...c.capsule as typeof e.snapshot.capsule, request_ids: [identity.transaction.args.proposal.request_id] },
    purchases: [c.purchase], provisioning: [{ request_id: identity.transaction.args.proposal.request_id, records: [] }] };
  return reader(f, { block: c.block, blocks: c.outcome_blocks, snapshot, quote: c.quote, execution: r.input.execution, nonce: identity.transaction.nonce });
}
export async function testnetRunFixture() {
  const key = injectedKeyFixture(), f = await signedRunFixture(key.signer), namespace = `testnet-run-${randomUUID()}`;
  const confirm = (data = f) => confirmTestnetAgentRun(data.review, runConsent(data), namespace);
  const read = currentRunReader(f); let sends = 0;
  const transport: typeof fetch = async (_url, init) => {
    sends++; const r = JSON.parse(String(init?.body));
    return Response.json({ jsonrpc: "2.0", id: r.id, result: { final_execution_status: "FINAL",
      transaction: { hash: r.id.replace("runlatch-local-broadcast-", "") }, status: { SuccessValue: "" } } });
  };
  const ports = { reader: read.reader, transport, testNowNs: () => BigInt(f.review.reviewed_at_ns) };
  return { key, f, namespace, read, confirm, ports, sends: () => sends,
    run: () => runRestrictedTestnetPurchase(confirm(), key.handle, ports) };
}
