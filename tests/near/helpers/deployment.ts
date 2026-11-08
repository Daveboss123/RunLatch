/** Offline synthetic RPC, generated KeyObjects only. No real store or public request. */
import { createHash, sign } from "node:crypto";
import { prepareGeneratedDemoKey, demoKeyRoles } from "../../../scripts/setup/human-demo-keys.ts";
import { importGeneratedHumanRecord } from "../../../scripts/setup/human-demo-signer.ts";
import { deploymentArtifact, encodeDeploymentTransaction, gateAccount, initArgs, initGas,
  verifyDeploymentSignature, type DeploymentTransaction } from "../../../scripts/setup/deployment-codec.ts";
import { encodeBase58_32 } from "../../../scripts/near/base58.ts";
export function finalDeploymentResponse(tx: DeploymentTransaction, hash: string, blockHash: string) {
  const receipt = encodeBase58_32(Buffer.alloc(32, 22));
  return { final_execution_status: "FINAL", status: { SuccessValue: "" },
    transaction: { hash, signer_id: gateAccount, receiver_id: gateAccount, public_key: tx.public_key, nonce: Number(tx.nonce),
      actions: [{ DeployContract: { code: Buffer.from(deploymentArtifact.sha256, "hex").toString("base64") } },
        { FunctionCall: { method_name: "init", args: Buffer.from(initArgs).toString("base64"), gas: Number(initGas), deposit: "0" } }] },
    transaction_outcome: { id: hash, block_hash: blockHash, outcome: { executor_id: gateAccount,
      receipt_ids: [receipt], status: { SuccessReceiptId: receipt }, gas_burnt: 1, tokens_burnt: "100000000" } },
    receipts_outcome: [{ id: receipt, block_hash: blockHash, outcome: { executor_id: gateAccount,
      receipt_ids: [] as string[], status: { SuccessValue: "" }, gas_burnt: 2, tokens_burnt: "200000000" } }] };
}
export function deploymentFixture(code: Uint8Array) {
  const generated = prepareGeneratedDemoKey(demoKeyRoles[1]), publicKey = generated.publicRecord.public_key;
  const blob = Buffer.from(generated.input.toString("utf8"), "utf16le");
  const key = importGeneratedHumanRecord(blob, publicKey, gateAccount); blob.fill(0); generated.input.fill(0);
  const hash = encodeBase58_32(Buffer.alloc(32, 20)); let signatures = 0, sends = 0, signedTx: DeploymentTransaction | null = null;
  const state = { mainnet: false, syncing: false, badKey: false, badNonce: false, stateExists: false,
    deployed: false, badFinal: false, failSend: false, wrongInit: false, badCode: false, balance: "4500000000000000000000000",
    nonce: 100, get sends() { return sends; }, get signatures() { return signatures; } };
  function signer(tx: DeploymentTransaction, wasm: Uint8Array) {
    signatures++; signedTx = tx;
    return verifyDeploymentSignature(tx, wasm, sign(null, createHash("sha256").update(encodeDeploymentTransaction(tx, wasm).unsigned_bytes).digest(), key)).signed_bytes;
  }
  const transport = async (url: string, input: RequestInit) => {
    if (url !== "https://rpc.testnet.near.org/" || input.redirect !== "error" || input.credentials !== "omit") throw Error("UNEXPECTED_TRANSPORT");
    const request = JSON.parse(String(input.body)); let result: unknown;
    if (request.method === "status") result = { chain_id: state.mainnet ? "mainnet" : "testnet", sync_info: { syncing: state.syncing } };
    else if (request.method === "block") result = { header: { hash, height: 1000 } };
    else if (request.method === "gas_price") result = { gas_price: "100000000" };
    else if (request.method === "EXPERIMENTAL_protocol_config") {
      const fee = { send_sir: 100000, execution: 100000 };
      result = { protocol_version: 88, runtime_config: { storage_amount_per_byte: "10000000000000000000",
        transaction_costs: { action_receipt_creation_config: fee, action_creation_config: { deploy_contract_cost: fee,
          deploy_contract_cost_per_byte: fee, function_call_cost: fee, function_call_cost_per_byte: fee } } } };
    } else if (request.method === "query") {
      if (request.params.account_id !== gateAccount || request.params.block_id !== hash) throw Error("UNEXPECTED_QUERY");
      const access = { permission: state.badKey ? "InvalidPermission" : "FullAccess", nonce: state.badNonce ? Number.MAX_SAFE_INTEGER + 1 : state.nonce };
      switch (request.params.request_type) {
        case "view_account": result = { block_hash: hash, amount: state.balance, locked: "0", storage_usage: state.deployed ? 416400 : 100,
          code_hash: state.deployed ? deploymentArtifact.code_hash : "11111111111111111111111111111111" }; break;
        case "view_access_key_list": result = { block_hash: hash, keys: [{ public_key: publicKey, access_key: access }] }; break;
        case "view_access_key": result = { block_hash: hash, ...access }; break;
        case "view_state": result = { block_hash: hash, values: state.stateExists ? [{ key: "U1RBVEU=", value: "AA==" }] : [] }; break;
        case "view_code": result = { block_hash: hash, code_base64: state.badCode ? "AA==" : Buffer.from(code).toString("base64") }; break;
        case "call_function": {
          const values: Record<string, unknown> = { get_operator: JSON.parse(initArgs).operator_id, get_schema_version: state.wrongInit ? 1 : 2, get_network_tag: "testnet" };
          if (!Object.hasOwn(values, request.params.method_name)) throw Error("UNEXPECTED_VIEW");
          result = { block_hash: hash, result: [...Buffer.from(JSON.stringify(values[request.params.method_name]))] }; break;
        }
        default: throw Error("UNEXPECTED_QUERY");
      }
    } else if (request.method === "send_tx") {
      sends++; if (state.failSend) throw Error("UNTRUSTED_ERROR_NOT_LOGGED");
      if (!signedTx || request.params.wait_until !== "FINAL") throw Error("UNEXPECTED_SEND");
      state.deployed = true; state.nonce = Number(signedTx.nonce);
      result = finalDeploymentResponse(signedTx, encodeDeploymentTransaction(signedTx, code).transaction_hash, hash);
      if (state.badFinal) (result as Record<string, unknown>).final_execution_status = "EXECUTED";
    } else throw Error("UNEXPECTED_METHOD");
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
  };
  return { publicKey, hash, state, signer, transport };
}
