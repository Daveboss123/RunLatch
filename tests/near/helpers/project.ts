/** Generated in-memory test keys and synthetic RPC only; no credential reader/network. */
import { createHash, sign } from "node:crypto";
import { prepareGeneratedDemoKey, demoKeyRoles } from "../../../scripts/setup/human-demo-keys.ts";
import { importGeneratedHumanRecord } from "../../../scripts/setup/human-demo-signer.ts";
import { parentAccount } from "../../../scripts/setup/child-account-codec.ts";
import { deploymentArtifact, gateAccount } from "../../../scripts/setup/deployment-codec.ts";
import { encodeProjectTransaction, projectDeposit, projectGas, verifyProjectSignature, type ProjectTransaction } from "../../../scripts/setup/project-codec.ts";
import { encodeBase58_32 } from "../../../scripts/near/base58.ts";
export function initialProjectRecord(tx: ProjectTransaction, now: string) {
  return { input: tx.args.project, owner_id: parentAccount, revision: "1", status: "ACTIVE", allocated_authority: "0",
    capsule_ids: [] as string[], created_at_ns: now, updated_at_ns: now };
}
export function finalProjectResponse(tx: ProjectTransaction, hash: string, blockHash: string, now: string) {
  const receipt = encodeBase58_32(Buffer.alloc(32, 22)), refund = encodeBase58_32(Buffer.alloc(32, 23));
  const value = Buffer.from(JSON.stringify(initialProjectRecord(tx, now))).toString("base64");
  return { final_execution_status: "FINAL", status: { SuccessValue: value },
    transaction: { hash, signer_id: parentAccount, receiver_id: gateAccount, public_key: tx.public_key, nonce: Number(tx.nonce),
      actions: [{ FunctionCall: { method_name: "create_project", args: Buffer.from(JSON.stringify(tx.args)).toString("base64"), gas: Number(projectGas), deposit: projectDeposit } }] },
    transaction_outcome: { id: hash, block_hash: blockHash, outcome: { executor_id: parentAccount,
      receipt_ids: [receipt], status: { SuccessReceiptId: receipt }, gas_burnt: 1, tokens_burnt: "100000000" } },
    receipts_outcome: [{ id: receipt, block_hash: blockHash, outcome: { executor_id: gateAccount,
      receipt_ids: [refund], status: { SuccessValue: value }, gas_burnt: 2, tokens_burnt: "200000000" } },
    { id: refund, block_hash: blockHash, outcome: { executor_id: parentAccount,
      receipt_ids: [] as string[], status: { SuccessValue: "" }, gas_burnt: 0, tokens_burnt: "0" } }] };
}
export function projectFixture() {
  const generated = prepareGeneratedDemoKey(demoKeyRoles[0]), publicKey = generated.publicRecord.public_key;
  const blob = Buffer.from(generated.input.toString("utf8"), "utf16le");
  const key = importGeneratedHumanRecord(blob, publicKey, parentAccount); blob.fill(0); generated.input.fill(0);
  const generatedGate = prepareGeneratedDemoKey(demoKeyRoles[1]), gateKey = generatedGate.publicRecord.public_key; generatedGate.input.fill(0);
  const hash = encodeBase58_32(Buffer.alloc(32, 20)), now = "1794161000000000000";
  let signatures = 0, sends = 0, signedTx: ProjectTransaction | null = null;
  const state = { mainnet: false, syncing: false, badKey: false, badNonce: false, badCode: false, badSchema: false,
    badStorage: false, hasCapsule: false, hasProject: false, badFinal: false, failSend: false, badRecord: false,
    badHistorical: false, feeChanged: false, balance: "5000000000000000000000000", nonce: 100,
    created: false, get sends() { return sends; }, get signatures() { return signatures; } };
  function signer(tx: ProjectTransaction) {
    signatures++; signedTx = tx;
    return verifyProjectSignature(tx, sign(null, createHash("sha256").update(encodeProjectTransaction(tx).unsigned_bytes).digest(), key)).signed_bytes;
  }
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  const transport = async (url: string, input: RequestInit) => {
    if (url !== "https://rpc.testnet.near.org/" || input.redirect !== "error" || input.credentials !== "omit") throw Error("UNEXPECTED_TRANSPORT");
    const request = JSON.parse(String(input.body)); requests.push(request); let result: unknown;
    if (request.method === "status") result = { chain_id: state.mainnet ? "mainnet" : "testnet", sync_info: { syncing: state.syncing }, version: { version: "2.14.0" } };
    else if (request.method === "block") result = { header: { hash, height: 1000, timestamp_nanosec: now } };
    else if (request.method === "gas_price") result = { gas_price: state.feeChanged ? "110000000" : "100000000" };
    else if (request.method === "EXPERIMENTAL_protocol_config") {
      const fee = { send_not_sir: 100000, execution: 100000 };
      result = { protocol_version: 88, runtime_config: { storage_amount_per_byte: "10000000000000000000",
        transaction_costs: { action_receipt_creation_config: fee, action_creation_config: { function_call_cost: fee, function_call_cost_per_byte: fee } } } };
    } else if (request.method === "query") {
      const p = request.params, isOperator = p.account_id === parentAccount;
      if (![parentAccount, gateAccount].includes(p.account_id) || p.block_id !== hash) throw Error("UNEXPECTED_QUERY");
      const access = { permission: state.badKey ? "InvalidPermission" : "FullAccess", nonce: state.badNonce ? Number.MAX_SAFE_INTEGER + 1 : isOperator ? state.nonce : 10 };
      const common = { block_hash: hash, block_height: 1000 };
      switch (p.request_type) {
        case "view_account": result = { ...common, amount: isOperator ? state.balance : "4500000000000000000000000", locked: "0", storage_usage: isOperator ? 182 : 416245,
          code_hash: isOperator ? "11111111111111111111111111111111" : state.badCode || state.created && state.badHistorical ? hash : deploymentArtifact.code_hash }; break;
        case "view_access_key_list": result = { ...common, keys: [{ public_key: isOperator ? publicKey : gateKey, access_key: access }] }; break;
        case "view_access_key": result = { ...common, ...access }; break;
        case "call_function": {
          if (isOperator) throw Error("UNEXPECTED_VIEW");
          const record = signedTx ? initialProjectRecord(signedTx, now) : {};
          if (state.badRecord) (record as Record<string, unknown>).allocated_authority = "1";
          const values: Record<string, unknown> = { get_operator: parentAccount, get_schema_version: state.badSchema ? 1 : 2, get_network_tag: "testnet",
            get_storage_requirements: { project_credit: state.badStorage ? "1" : projectDeposit, capsule_credit: "2621440000000000000000000",
              provider_credit: "40960000000000000000000", quote_credit: projectDeposit, scope: "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS" },
            get_project: state.created || state.hasProject ? record : null, get_projects: state.created || state.hasProject ? [record] : [],
            get_capsules: state.hasCapsule ? [{}] : [] };
          if (!Object.hasOwn(values, p.method_name)) throw Error("UNEXPECTED_VIEW");
          result = { ...common, result: [...Buffer.from(JSON.stringify(values[p.method_name]))] }; break;
        }
        default: throw Error("UNEXPECTED_QUERY");
      }
    } else if (request.method === "send_tx" || request.method === "tx") {
      if (request.method === "send_tx") { sends++; if (state.failSend) throw Error("UNTRUSTED_ERROR_NOT_LOGGED"); }
      if (!signedTx || request.params.wait_until !== "FINAL") throw Error("UNEXPECTED_SEND");
      state.created = true; state.nonce = Number(signedTx.nonce);
      result = finalProjectResponse(signedTx, encodeProjectTransaction(signedTx).transaction_hash, hash, now);
      if (state.badFinal) (result as Record<string, unknown>).final_execution_status = "EXECUTED";
    } else throw Error("UNEXPECTED_METHOD");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { headers: { "Content-Type": "application/json" } });
  };
  return { publicKey, gateKey, hash, now, state, signer, transport, requests };
}
