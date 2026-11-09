/** Synthetic RPC and generated in-memory identity only. Never invokes human signer/store. */
import { createHash, sign } from "node:crypto";
import { prepareGeneratedDemoKey, demoKeyRoles } from "../../../scripts/setup/human-demo-keys.ts";
import { importGeneratedHumanRecord } from "../../../scripts/setup/human-demo-signer.ts";
import { parentAccount } from "../../../scripts/setup/child-account-codec.ts";
import { deploymentArtifact, gateAccount } from "../../../scripts/setup/deployment-codec.ts";
import { projectCriteriaHash, projectIds, projectCeiling, projectDeposit } from "../../../scripts/setup/project-codec.ts";
import { encodeProviderTransaction, providerDeposit, providerGas, providerTerms, verifyProviderSignature, type ProviderTransaction } from "../../../scripts/setup/provider-codec.ts";
import { encodeBase58_32 } from "../../../scripts/near/base58.ts";
export function providerProject() {
  return { input: { ...projectIds, budget_ceiling: projectCeiling, expires_at_ns: "1794335720864706128", outcome_definition_hash: projectCriteriaHash },
    owner_id: parentAccount, revision: "1", status: "ACTIVE", allocated_authority: "0", capsule_ids: [] as string[],
    created_at_ns: "1794162977277689269", updated_at_ns: "1794162977277689269" };
}
export function providerRecord() { return { ...providerTerms, active: true, quote_count: 0 }; }
export function finalProviderResponse(tx: ProviderTransaction, hash: string, blockHash: string) {
  const receipt = encodeBase58_32(Buffer.alloc(32, 24)), refund = encodeBase58_32(Buffer.alloc(32, 25));
  const value = Buffer.from(JSON.stringify(providerRecord())).toString("base64");
  return { final_execution_status: "FINAL", status: { SuccessValue: value },
    transaction: { hash, signer_id: parentAccount, receiver_id: gateAccount, public_key: tx.public_key, nonce: Number(tx.nonce),
      actions: [{ FunctionCall: { method_name: tx.method, args: Buffer.from(JSON.stringify(tx.args)).toString("base64"), gas: Number(providerGas), deposit: providerDeposit } }] },
    transaction_outcome: { id: hash, block_hash: blockHash, outcome: { executor_id: parentAccount,
      receipt_ids: [receipt], status: { SuccessReceiptId: receipt }, gas_burnt: 1, tokens_burnt: "100000000" } },
    receipts_outcome: [{ id: receipt, block_hash: blockHash, outcome: { executor_id: gateAccount,
      receipt_ids: [refund], status: { SuccessValue: value }, gas_burnt: 2, tokens_burnt: "200000000" } },
    { id: refund, block_hash: blockHash, outcome: { executor_id: parentAccount, receipt_ids: [] as string[], status: { SuccessValue: "" }, gas_burnt: 0, tokens_burnt: "0" } }] };
}
export function providerFixture() {
  const generated = prepareGeneratedDemoKey(demoKeyRoles[0]), publicKey = generated.publicRecord.public_key;
  const blob = Buffer.from(generated.input.toString("utf8"), "utf16le"), key = importGeneratedHumanRecord(blob, publicKey, parentAccount);
  blob.fill(0); generated.input.fill(0);
  const gate = prepareGeneratedDemoKey(demoKeyRoles[1]), gateKey = gate.publicRecord.public_key; gate.input.fill(0);
  const db = prepareGeneratedDemoKey(demoKeyRoles[2]), databaseKey = db.publicRecord.public_key; db.input.fill(0);
  const hash = encodeBase58_32(Buffer.alloc(32, 21)); let signedTx: ProviderTransaction | null = null, sends = 0, signatures = 0;
  const state = { mainnet: false, syncing: false, badKey: false, badNonce: false, badCode: false, badSchema: false, badStorage: false,
    hasCapsule: false, project: providerProject(), hasProvider: false, badDatabaseKey: false, badDatabaseCode: false, badFinal: false,
    failSend: false, badRecord: false, badHistorical: false, feeChanged: false, created: false,
    balance: "5000000000000000000000000", nonce: 100, databaseNonce: 10, databaseBalance: "300000000000000000000000",
    now: "1794250000000000000", get sends() { return sends; }, get signatures() { return signatures; } };
  function signer(tx: ProviderTransaction) {
    signatures++; signedTx = tx;
    return verifyProviderSignature(tx, sign(null, createHash("sha256").update(encodeProviderTransaction(tx).unsigned_bytes).digest(), key)).signed_bytes;
  }
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  const transport = async (url: string, input: RequestInit) => {
    if (url !== "https://test.rpc.fastnear.com/" || input.redirect !== "error" || input.credentials !== "omit") throw Error("UNEXPECTED_TRANSPORT");
    const request = JSON.parse(String(input.body)); requests.push(request); let result: unknown;
    if (request.method === "status") result = { chain_id: state.mainnet ? "mainnet" : "testnet", sync_info: { syncing: state.syncing } };
    else if (request.method === "block") result = { header: { hash, height: 1000, timestamp_nanosec: state.now } };
    else if (request.method === "gas_price") result = { gas_price: state.feeChanged ? "110000000" : "100000000" };
    else if (request.method === "EXPERIMENTAL_protocol_config") {
      const fee = { send_not_sir: 100000, execution: 100000 };
      result = { protocol_version: 88, runtime_config: { storage_amount_per_byte: "10000000000000000000",
        transaction_costs: { action_receipt_creation_config: fee, action_creation_config: { function_call_cost: fee, function_call_cost_per_byte: fee } } } };
    } else if (request.method === "query") {
      const p = request.params, operator = p.account_id === parentAccount, database = p.account_id === providerTerms.publisher_id;
      if (![parentAccount, gateAccount, providerTerms.publisher_id].includes(p.account_id) || p.block_id !== hash) throw Error("UNEXPECTED_QUERY");
      const access = { permission: state.badKey || database && state.badDatabaseKey ? "InvalidPermission" : "FullAccess",
        nonce: state.badNonce ? Number.MAX_SAFE_INTEGER + 1 : operator ? state.nonce : database ? state.databaseNonce : 10 };
      const common = { block_hash: hash, block_height: 1000 };
      switch (p.request_type) {
        case "view_account": result = { ...common, amount: operator ? state.balance : database ? state.databaseBalance : "4578721041216491200000000",
          locked: "0", storage_usage: operator || database ? 182 : 416553,
          code_hash: database && state.badDatabaseCode || !operator && !database && (state.badCode || state.created && state.badHistorical) ? hash
            : operator || database ? "11111111111111111111111111111111" : deploymentArtifact.code_hash }; break;
        case "view_access_key_list": result = { ...common, keys: [{ public_key: operator ? publicKey : database ? databaseKey : gateKey, access_key: access }] }; break;
        case "view_access_key": result = { ...common, ...access }; break;
        case "call_function": {
          if (operator || database) throw Error("UNEXPECTED_VIEW");
          const provider = providerRecord(); if (state.badRecord) provider.quote_count = 1;
          const values: Record<string, unknown> = { get_operator: parentAccount, get_schema_version: state.badSchema ? 1 : 2, get_network_tag: "testnet",
            get_storage_requirements: { project_credit: projectDeposit, capsule_credit: "2621440000000000000000000", provider_credit: state.badStorage ? "1" : providerDeposit,
              quote_credit: projectDeposit, scope: "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS" }, get_project: state.project,
            get_projects: [state.project], get_capsules: state.hasCapsule ? [{}] : [], get_provider: state.created || state.hasProvider ? provider : null };
          if (!Object.hasOwn(values, p.method_name)) throw Error("UNEXPECTED_VIEW"); result = { ...common, result: [...Buffer.from(JSON.stringify(values[p.method_name]))] }; break;
        }
        default: throw Error("UNEXPECTED_QUERY");
      }
    } else if (request.method === "send_tx" || request.method === "tx") {
      if (request.method === "send_tx") { sends++; if (state.failSend) throw Error("UNTRUSTED_ERROR_NOT_LOGGED"); }
      if (!signedTx || request.params.wait_until !== "FINAL") throw Error("UNEXPECTED_SEND");
      state.created = true; state.nonce = Number(signedTx.nonce);
      result = finalProviderResponse(signedTx, encodeProviderTransaction(signedTx).transaction_hash, hash);
      if (state.badFinal) (result as Record<string, unknown>).final_execution_status = "EXECUTED";
    } else throw Error("UNEXPECTED_METHOD");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { headers: { "Content-Type": "application/json" } });
  };
  return { publicKey, gateKey, databaseKey, hash, state, signer, transport, requests };
}
