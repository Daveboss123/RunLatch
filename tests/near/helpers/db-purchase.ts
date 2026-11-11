/** Synthetic RPC only, public fixed demo identities; never contains a real private key or on-chain proof. */
import { DEMO_AGENT_SCOPE, DEMO_CAPSULE_ACTION, DEMO_PROJECT_ACTION, DEMO_QUOTE_ACTION, RUNLATCH_TESTNET_TARGET as target } from "../../../src/lib/near/demo-operations.ts";
import { DEMO_INSTALLED_AGENT_NONCE, DEMO_PURCHASE_POLICY_HASH } from "../../../scripts/near/demo-purchase-scope.ts";
import { commercialQuoteHash } from "../../../src/lib/purchasing/hashing.ts";
import { encodeBase58_32 } from "../../../scripts/near/base58.ts";

export async function dbPurchaseFixture() {
  const hash = encodeBase58_32(Buffer.alloc(32, 15)), now = "1794355651449660122", height = 277139184;
  const project = { input: DEMO_PROJECT_ACTION.args.project, owner_id: target.operator_id, revision: "1", status: "ACTIVE",
    allocated_authority: "300000000000000000000000", capsule_ids: [DEMO_CAPSULE_ACTION.args.capsule_id], created_at_ns: "1794352812646172217", updated_at_ns: "1794352812646172217" };
  const capsule = { capsule_id: DEMO_CAPSULE_ACTION.args.capsule_id, owner_id: target.operator_id, policy: DEMO_CAPSULE_ACTION.args.policy,
    policy_hash: DEMO_PURCHASE_POLICY_HASH, policy_schema_version: 2, status: "ACTIVE", allocated: "300000000000000000000000", spent: "0", reserved: "0",
    committed_future: "0", returned: "0", storage_credit: DEMO_CAPSULE_ACTION.args.storage_credit, created_at_ns: "1794353072764692226",
    revoked_at_ns: null, request_ids: [] as string[], owner_refund: null, refund_attempts: 0 };
  const quote = { terms: { input: DEMO_QUOTE_ACTION.args.quote, publisher_id: DEMO_QUOTE_ACTION.signer_id, schema_version: 2 as const },
    quote_hash: await commercialQuoteHash({ input: DEMO_QUOTE_ACTION.args.quote, publisher_id: DEMO_QUOTE_ACTION.signer_id, schema_version: 2 }, "testnet", target.contract_id),
    consumed: false, consumed_by: null, published_at_ns: "1794353798014243644" };
  const provider = { provider_id: "db_demo_1108", publisher_id: DEMO_QUOTE_ACTION.signer_id, recipient_id: DEMO_QUOTE_ACTION.args.quote.recipient_id, active: true, quote_count: 1 };
  const state = { project, capsule, quote, provider, amount: "99900000000000000000000", gas_price: "100000000", nonce: Number(DEMO_INSTALLED_AGENT_NONCE),
    allowance: DEMO_AGENT_SCOPE.max_allowance, mainnet: false, extraKey: false, badBlock: false, badProtocol: false, storage_usage: 340 };
  const snapshot = { project, capsule, purchases: [], provisioning: [], outcome: null, task_check: null, human_acceptance: null, evidence_snapshot_hash: "00".repeat(32) };
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  const transport: typeof fetch = async (url, input) => {
    if (url !== target.rpc_url || input?.redirect !== "error" || input.credentials !== "omit") throw Error("UNEXPECTED_TEST_TRANSPORT");
    const req = JSON.parse(String(input.body)); requests.push(req); let result: unknown;
    const permission = { FunctionCall: { allowance: state.allowance, receiver_id: target.contract_id, method_names: ["submit_purchase"] } };
    const keys: unknown[] = [{ public_key: DEMO_AGENT_SCOPE.public_key, access_key: { nonce: state.nonce, permission } },
      { public_key: DEMO_AGENT_SCOPE.recovery_public_key, access_key: { nonce: 276806960000001, permission: "FullAccess" } }];
    if (state.extraKey) keys.push({ public_key: DEMO_PROJECT_ACTION.public_key, access_key: { nonce: 1, permission: "FullAccess" } });
    if (req.method === "status") result = { chain_id: state.mainnet ? "mainnet" : "testnet", sync_info: { syncing: false }, version: { version: "2.14.0" } };
    else if (req.method === "block") result = { header: { hash, height, timestamp_nanosec: now } };
    else if (req.method === "gas_price") result = { gas_price: state.gas_price };
    else if (req.method === "EXPERIMENTAL_protocol_config") {
      const fee = { execution: 100000, send_not_sir: 100000, send_sir: 100000 };
      result = { chain_id: state.badProtocol ? "mainnet" : "testnet", protocol_version: 88,
        runtime_config: { storage_amount_per_byte: "10000000000000000000", transaction_costs: { action_receipt_creation_config: fee,
          action_creation_config: { function_call_cost: fee, function_call_cost_per_byte: fee } } } };
    } else if (req.method === "query") {
      const p = req.params; if (p.block_id !== hash) throw Error("UNEXPECTED_TEST_BLOCK");
      let value: unknown;
      if (p.request_type === "view_account") value = { amount: state.amount, locked: "0", storage_usage: state.storage_usage,
        code_hash: p.account_id === target.contract_id ? target.expected_code_hash : "11111111111111111111111111111111" };
      else if (p.request_type === "view_access_key") value = { nonce: state.nonce, permission };
      else if (p.request_type === "view_access_key_list") value = { keys };
      else if (p.request_type === "call_function") {
        const values: Record<string, unknown> = { get_operator: target.operator_id, get_schema_version: 2, get_network_tag: "testnet",
          get_storage_requirements: { project_credit: "81920000000000000000000", capsule_credit: DEMO_CAPSULE_ACTION.args.storage_credit,
            provider_credit: "40960000000000000000000", quote_credit: "81920000000000000000000", scope: "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS" },
          get_project: project, get_capsule_report_snapshot: snapshot, get_provider: provider, get_quote: quote };
        if (!Object.hasOwn(values, p.method_name)) throw Error("UNEXPECTED_TEST_VIEW"); value = { result: [...Buffer.from(JSON.stringify(values[p.method_name]))] };
      } else throw Error("UNEXPECTED_TEST_QUERY");
      result = { ...(value as object), block_hash: hash, block_height: state.badBlock ? height + 1 : height };
    } else throw Error("TEST_WRITE_MUST_NOT_RUN");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), { headers: { "content-type": "application/json" } });
  };
  return { transport, state, requests, hash, snapshot };
}
