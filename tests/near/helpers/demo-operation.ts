/** Synthetic fixed-block RPC, generated in-memory signer. No WinCred, wallet or network. */
import { createHash, sign } from "node:crypto";
import { demoKeyRoles, prepareGeneratedDemoKey } from "../../../scripts/setup/human-demo-keys.ts";
import { importGeneratedHumanRecord } from "../../../scripts/setup/human-demo-signer.ts";
import { encodeDemoTransaction, verifyDemoSignature, type DemoKind, type ParsedDemoTransaction } from "../../../scripts/setup/demo-operation-codec.ts";
import { DEMO_AGENT_SCOPE, DEMO_CAPSULE_ACTION, DEMO_PROJECT_ACTION, DEMO_QUOTE_ACTION, RUNLATCH_TESTNET_TARGET as target } from "../../../src/lib/near/demo-operations.ts";
import { commercialQuoteHash } from "../../../src/lib/purchasing/hashing.ts";
import { encodeBase58_32 } from "../../../scripts/near/base58.ts";

export async function demoFixture(kind: DemoKind) {
  const role = demoKeyRoles[["project", "capsule"].includes(kind) ? 0 : kind === "quote" ? 2 : 3], generated = prepareGeneratedDemoKey(role);
  const publicKey = generated.publicRecord.public_key, blob = Buffer.from(generated.input.toString("utf8"), "utf16le");
  const key = importGeneratedHumanRecord(blob, publicKey, role.account_id); blob.fill(0); generated.input.fill(0);
  const blockHash = encodeBase58_32(Buffer.alloc(32, 9)), root = encodeBase58_32(Buffer.alloc(32, 10)), refund = encodeBase58_32(Buffer.alloc(32, 11));
  let sends = 0, signatures = 0, sentTx: ParsedDemoTransaction | null = null;
  const project = { input: DEMO_PROJECT_ACTION.args.project, owner_id: target.operator_id, revision: "1", status: "ACTIVE",
    allocated_authority: "0", capsule_ids: [] as string[], created_at_ns: "1794250000000000000", updated_at_ns: "1794250000000000000" };
  const capsule = { capsule_id: DEMO_CAPSULE_ACTION.args.capsule_id, owner_id: target.operator_id, policy: DEMO_CAPSULE_ACTION.args.policy,
    policy_hash: "0".repeat(64), policy_schema_version: 2, status: "ACTIVE", allocated: DEMO_CAPSULE_ACTION.args.policy.budget,
    spent: "0", reserved: "0", committed_future: "0", returned: "0", storage_credit: DEMO_CAPSULE_ACTION.args.storage_credit,
    created_at_ns: "1794250000000000000", revoked_at_ns: null, request_ids: [] as string[], owner_refund: null, refund_attempts: 0 };
  const quote = { terms: { input: DEMO_QUOTE_ACTION.args.quote, publisher_id: DEMO_QUOTE_ACTION.signer_id, schema_version: 2 as const },
    quote_hash: await commercialQuoteHash({ input: DEMO_QUOTE_ACTION.args.quote, publisher_id: DEMO_QUOTE_ACTION.signer_id, schema_version: 2 }, "testnet", target.contract_id),
    consumed: false, consumed_by: null, published_at_ns: "1794250000000000000" };
  const state = { nonce: 100, amount: "9000000000000000000000000", now: "1794250000000000000", project, capsule, quote,
    installed_nonce: 999_000_000,
    chain: "testnet", syncing: false, badCode: false, badHistorical: false, badKey: false, feeChanged: false, failSend: false, badFinal: false,
    badStorage: false, extraKey: false, hasProject: kind !== "project", hasCapsule: ["quote", "agent-key"].includes(kind), hasQuote: kind === "agent-key", installed: false,
    get sends() { return sends; }, get signatures() { return signatures; } };
  if (state.hasCapsule) { project.allocated_authority = capsule.allocated; project.capsule_ids.push(capsule.capsule_id); }
  function signer(tx: ParsedDemoTransaction) {
    signatures++;
    return verifyDemoSignature(tx, sign(null, createHash("sha256").update(encodeDemoTransaction(tx).unsigned_bytes).digest(), key)).signed_bytes;
  }
  function final(tx: ParsedDemoTransaction) {
    const value = tx.kind === "agent-key" ? "" : Buffer.from(JSON.stringify(tx.kind === "project" ? project : tx.kind === "capsule" ? capsule : quote)).toString("base64");
    const action = tx.kind === "agent-key" ? { AddKey: { public_key: DEMO_AGENT_SCOPE.public_key, access_key: { nonce: 0, permission: {
      FunctionCall: { allowance: DEMO_AGENT_SCOPE.max_allowance, receiver_id: target.contract_id, method_names: ["submit_purchase"] } } } } }
      : { FunctionCall: { method_name: tx.method, args: Buffer.from(JSON.stringify(tx.args)).toString("base64"), gas: Number(tx.gas), deposit: tx.deposit } };
    const txHash = encodeDemoTransaction(tx).transaction_hash;
    return { final_execution_status: state.badFinal ? "EXECUTED" : "FINAL", status: { SuccessValue: value },
      transaction: { hash: txHash, signer_id: tx.signer_id, receiver_id: tx.receiver_id, public_key: tx.public_key, nonce: Number(tx.nonce), actions: [action] },
      transaction_outcome: { id: txHash, block_hash: blockHash, outcome: { executor_id: tx.signer_id, receipt_ids: [root],
        status: { SuccessReceiptId: root }, gas_burnt: 1, tokens_burnt: "1" } },
      receipts_outcome: [{ id: root, block_hash: blockHash, outcome: { executor_id: tx.receiver_id, receipt_ids: [refund],
        status: { SuccessValue: value }, gas_burnt: 2, tokens_burnt: "2" } },
      { id: refund, block_hash: blockHash, outcome: { executor_id: tx.signer_id, receipt_ids: [] as string[],
        status: { SuccessValue: "" }, gas_burnt: 0, tokens_burnt: "0" } }] };
  }
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  const transport = async (url: string, input: RequestInit) => {
    if (url !== target.rpc_url || input.redirect !== "error" || input.credentials !== "omit") throw Error("UNEXPECTED_TRANSPORT");
    const req = JSON.parse(String(input.body)); requests.push(req); let result: unknown;
    if (req.method === "status") result = { chain_id: state.chain, sync_info: { syncing: state.syncing } };
    else if (req.method === "block") result = { header: { hash: blockHash, height: 1000, timestamp_nanosec: state.now } };
    else if (req.method === "gas_price") result = { gas_price: state.feeChanged ? "110000000" : "100000000" };
    else if (req.method === "EXPERIMENTAL_protocol_config") {
      const fee = { execution: 100000, send_sir: 100000, send_not_sir: 100000 };
      result = { protocol_version: 88, runtime_config: { storage_amount_per_byte: "10000000000000000000",
        transaction_costs: { action_receipt_creation_config: fee, action_creation_config: { function_call_cost: fee, function_call_cost_per_byte: fee,
          add_key_cost: { full_access_cost: fee, function_call_cost: fee, function_call_cost_per_byte: fee } } } } };
    } else if (req.method === "query") {
      const p = req.params, common = { block_hash: blockHash, block_height: 1000 };
      if (p.block_id !== blockHash) throw Error("UNEXPECTED_BLOCK");
      const access = { nonce: state.nonce, permission: state.badKey ? "InvalidPermission" : "FullAccess" };
      if (p.request_type === "view_account") result = { ...common, amount: state.amount, locked: "0", storage_usage: 182,
        code_hash: p.account_id === target.contract_id ? state.badCode || sentTx && state.badHistorical ? blockHash : target.expected_code_hash : "11111111111111111111111111111111" };
      else if (p.request_type === "view_access_key") result = { ...common, ...access };
      else if (p.request_type === "view_access_key_list") {
        const rows: unknown[] = [{ public_key: publicKey, access_key: access }];
        if (state.installed) rows.push({ public_key: DEMO_AGENT_SCOPE.public_key, access_key: { nonce: state.installed_nonce, permission: { FunctionCall: {
          allowance: DEMO_AGENT_SCOPE.max_allowance, receiver_id: target.contract_id, method_names: ["submit_purchase"] } } } });
        if (state.extraKey) rows.push({ public_key: DEMO_AGENT_SCOPE.public_key, access_key: access });
        result = { ...common, keys: rows };
      } else if (p.request_type === "call_function") {
        const values: Record<string, unknown> = { get_operator: target.operator_id, get_schema_version: 2, get_network_tag: "testnet",
          get_storage_requirements: { project_credit: "81920000000000000000000", capsule_credit: state.badStorage ? "1" : DEMO_CAPSULE_ACTION.args.storage_credit,
            provider_credit: "40960000000000000000000", quote_credit: "81920000000000000000000", scope: "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS" },
          get_project: state.hasProject ? project : null, get_capsule: state.hasCapsule ? capsule : null, get_quote: state.hasQuote ? quote : null,
          get_provider: { provider_id: "db_demo_1108", publisher_id: DEMO_QUOTE_ACTION.signer_id, recipient_id: DEMO_QUOTE_ACTION.args.quote.recipient_id,
            active: true, quote_count: state.hasQuote ? 1 : 0 } };
        if (!Object.hasOwn(values, p.method_name)) throw Error("UNEXPECTED_VIEW");
        result = { ...common, result: [...Buffer.from(JSON.stringify(values[p.method_name]))] };
      } else throw Error("UNEXPECTED_QUERY");
    } else if (req.method === "send_tx" || req.method === "tx") {
      if (req.method === "send_tx") {
        sends++; if (state.failSend) throw Error("UNTRUSTED_FAILURE");
        // The signer captures this exact object in the test's execute port below; no decoder substitution.
        if (!sentTx) throw Error("MISSING_TEST_TRANSACTION");
        state.nonce = Number(sentTx.nonce);
        if (kind === "project") state.hasProject = true;
        if (kind === "capsule") { state.hasCapsule = true; project.allocated_authority = capsule.allocated; project.capsule_ids.push(capsule.capsule_id); }
        if (kind === "quote") state.hasQuote = true;
        if (kind === "agent-key") state.installed = true;
      }
      if (!sentTx) throw Error("MISSING_TEST_TRANSACTION"); result = final(sentTx);
    } else throw Error("UNEXPECTED_METHOD");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }));
  };
  return { publicKey, state, requests, blockHash, final, transport, signer: (tx: ParsedDemoTransaction) => { sentTx = tx; return signer(tx); } };
}
