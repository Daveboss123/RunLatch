/** Fixed testnet deployment/readback scope. No arbitrary method, receiver or retry surface. */
import { amount, object, parseBoundedJson } from "../../src/lib/near/records.ts";
import { decodeBase58_32 } from "../near/base58.ts";
import { checkedPublicKey } from "./child-account-codec.ts";
import { checkedDeploymentCode, deploymentArtifact, gateAccount, initArgs, initGas,
  parseDeploymentTransaction, type DeploymentTransaction } from "./deployment-codec.ts";
import type { ChildTransport } from "./child-account-rpc.ts";
export function deploymentRpc(transport: ChildTransport) {
  let id = 0;
  async function call(method: string, params: unknown) {
    const requestId = `runlatch-deployment-${++id}`, signal = AbortSignal.timeout(20000);
    const body = JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params });
    if (Buffer.byteLength(body) > 600000) throw Error("DEPLOYMENT_RPC_LIMIT");
    const response = await transport("https://rpc.testnet.near.org/", { method: "POST", body,
      headers: { "Content-Type": "application/json" }, redirect: "error", credentials: "omit", cache: "no-store", signal });
    if (!response.ok || !response.body) throw Error("DEPLOYMENT_RPC_UNAVAILABLE");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    const abort = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      for (;;) {
        if (signal.aborted) throw Error("DEPLOYMENT_RPC_UNAVAILABLE");
        const next = await reader.read(); if (next.done) break;
        size += next.value.length; if (size > 1048576) throw Error("DEPLOYMENT_RPC_LIMIT"); chunks.push(next.value);
      }
    } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (signal.aborted) throw Error("DEPLOYMENT_RPC_UNAVAILABLE");
    const reply = object(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
    if (reply.jsonrpc !== "2.0" || reply.id !== requestId || reply.error !== undefined) throw Error("DEPLOYMENT_RPC_UNAVAILABLE");
    return object(reply.result);
  }
  async function query(request: Record<string, unknown>, blockHash: string) {
    const reply = await call("query", { ...request, account_id: gateAccount, block_id: blockHash });
    if (reply.block_hash !== blockHash) throw Error("DEPLOYMENT_BLOCK_MISMATCH"); return reply;
  }
  function base64(value: unknown, max: number) {
    if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw Error("DEPLOYMENT_BYTES_INVALID");
    const bytes = Buffer.from(value, "base64"); if (bytes.toString("base64") !== value || bytes.length > max) throw Error("DEPLOYMENT_BYTES_INVALID"); return bytes;
  }
  async function view(method: string, block: string) {
    const reply = await query({ request_type: "call_function", method_name: method, args_base64: "e30=" }, block);
    if (!Array.isArray(reply.result) || reply.result.length > 4096
      || reply.result.some(b => !Number.isInteger(b) || b < 0 || b > 255)) throw Error("DEPLOYMENT_VIEW_INVALID");
    return parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(reply.result)), 4096);
  }
  return {
    async state(publicKey: string) {
      checkedPublicKey(publicKey);
      const status = await call("status", []);
      if (status.chain_id !== "testnet" || object(status.sync_info).syncing !== false) throw Error("DEPLOYMENT_TESTNET_REQUIRED");
      const header = object((await call("block", { finality: "final" })).header);
      decodeBase58_32(header.hash);
      if (!Number.isSafeInteger(header.height) || (header.height as number) < 1) throw Error("DEPLOYMENT_BLOCK_MISMATCH");
      const block = header.hash as string, account = await query({ request_type: "view_account" }, block);
      amount(account.amount); if (account.locked !== "0" || !Number.isSafeInteger(account.storage_usage)
        || (account.storage_usage as number) < 0) throw Error("DEPLOYMENT_ACCOUNT_INVALID");
      decodeBase58_32(account.code_hash);
      const list = await query({ request_type: "view_access_key_list" }, block);
      if (!Array.isArray(list.keys) || list.keys.length !== 1) throw Error("DEPLOYMENT_KEY_MISMATCH");
      const key = object(list.keys[0]), access = object(key.access_key);
      const direct = await query({ request_type: "view_access_key", public_key: publicKey }, block);
      if (key.public_key !== publicKey || access.permission !== "FullAccess" || direct.permission !== "FullAccess"
        || !Number.isSafeInteger(access.nonce) || (access.nonce as number) < 0 || access.nonce !== direct.nonce) throw Error("DEPLOYMENT_KEY_MISMATCH");
      return { block_hash: block, block_height: header.height as number, account, nonce: String(access.nonce) };
    },
    async requireEmpty(block: string) {
      const state = await query({ request_type: "view_state", prefix_base64: "", include_proof: false }, block);
      if (!Array.isArray(state.values) || state.values.length !== 0) throw Error("DEPLOYMENT_EXISTING_STATE");
    },
    async fees(block: string) {
      const config = await call("EXPERIMENTAL_protocol_config", { block_id: block }), runtime = object(config.runtime_config);
      if (!Number.isSafeInteger(config.protocol_version) || (config.protocol_version as number) < 88) throw Error("DEPLOYMENT_PROTOCOL_UNSUPPORTED");
      const costs = object(runtime.transaction_costs), actions = object(costs.action_creation_config);
      const entries = [[costs.action_receipt_creation_config, 1], [actions.deploy_contract_cost, 1],
        [actions.deploy_contract_cost_per_byte, deploymentArtifact.bytes], [actions.function_call_cost, 1],
        [actions.function_call_cost_per_byte, Buffer.byteLength("init") + Buffer.byteLength(initArgs)]] as const;
      let gas = 0n;
      for (const [value, multiplier] of entries) {
        const fee = object(value);
        for (const field of ["send_sir", "execution"]) {
          if (!Number.isSafeInteger(fee[field]) || (fee[field] as number) < 0) throw Error("DEPLOYMENT_FEE_INVALID");
          gas += BigInt(fee[field] as number) * BigInt(multiplier);
        }
      }
      const price = amount((await call("gas_price", [block])).gas_price), storagePrice = amount(runtime.storage_amount_per_byte);
      if (price === "0" || storagePrice === "0") throw Error("DEPLOYMENT_FEE_INVALID");
      const budget = (gas + BigInt(initGas)) * BigInt(price);
      if (budget > 30000000000000000000000n) throw Error("DEPLOYMENT_FEE_REVIEW_REQUIRED");
      return { protocol_version: config.protocol_version, native_action_gas_estimate: gas.toString(), init_prepaid_gas: initGas,
        gas_price_yocto: price, gas_budget_at_current_price_yocto: budget.toString(), storage_price_yocto_per_byte: storagePrice,
        code_storage_yocto: (BigInt(deploymentArtifact.bytes) * BigInt(storagePrice)).toString(),
        init_storage_cushion_yocto: (8192n * BigInt(storagePrice)).toString(),
        limitation: "Current self-receiver send_sir+execution fees and100Tgas at current price; not final fee guarantee. Code storage is collateral, not spent purchase funds;8192bytes is a conservative init cushion, not measured state." };
    },
    async send(bytes: Uint8Array) {
      if (bytes.length > 416500) throw Error("DEPLOYMENT_BYTES_INVALID");
      return call("send_tx", { signed_tx_base64: Buffer.from(bytes).toString("base64"), wait_until: "FINAL" });
    },
    async transaction(hash: string) {
      decodeBase58_32(hash); return call("tx", { tx_hash: hash, sender_account_id: gateAccount, wait_until: "FINAL" });
    },
    async proof(tx: DeploymentTransaction, minimumHeight: number) {
      const state = await this.state(tx.public_key);
      if (state.block_height < minimumHeight || state.nonce !== tx.nonce || state.account.code_hash !== deploymentArtifact.code_hash) throw Error("DEPLOYMENT_STATE_UNPROVEN");
      const code = await query({ request_type: "view_code" }, state.block_hash);
      checkedDeploymentCode(base64(code.code_base64, deploymentArtifact.bytes));
      const operator = await view("get_operator", state.block_hash), schema = await view("get_schema_version", state.block_hash), network = await view("get_network_tag", state.block_hash);
      if (operator !== JSON.parse(initArgs).operator_id || schema !== 2 || network !== "testnet") throw Error("DEPLOYMENT_INIT_UNPROVEN");
      return { status: "GATE_DEPLOYMENT_AND_INIT_OBSERVED", account_id: gateAccount, public_key: tx.public_key,
        code_hash: deploymentArtifact.code_hash, code_sha256: deploymentArtifact.sha256, code_bytes: deploymentArtifact.bytes,
        operator_id: operator, schema_version: schema, network, nonce: state.nonce,
        balance_yoctoNEAR: state.account.amount, storage_usage_bytes: state.account.storage_usage,
        block_hash: state.block_hash, block_height: state.block_height };
    },
  };
}
export function inspectDeploymentExecution(txInput: unknown, hash: string, raw: unknown) {
  const tx = parseDeploymentTransaction(txInput), result = object(raw), observed = object(result.transaction);
  decodeBase58_32(hash);
  if (result.final_execution_status !== "FINAL" || observed.hash !== hash || observed.signer_id !== gateAccount
    || observed.receiver_id !== gateAccount || observed.public_key !== tx.public_key
    || !Number.isSafeInteger(observed.nonce) || String(observed.nonce) !== tx.nonce) throw Error("DEPLOYMENT_EXECUTION_UNPROVEN");
  if (!Array.isArray(observed.actions) || observed.actions.length !== 2) throw Error("DEPLOYMENT_ACTION_MISMATCH");
  // nearcore ActionView intentionally returns the SHA256 digest as base64, NOT the full deployed code.
  const deploy = object(object(observed.actions[0], ["DeployContract"]).DeployContract, ["code"]);
  if (deploy.code !== Buffer.from(deploymentArtifact.sha256, "hex").toString("base64")) throw Error("DEPLOYMENT_CODE_MISMATCH");
  const init = object(object(observed.actions[1], ["FunctionCall"]).FunctionCall, ["method_name", "args", "gas", "deposit"]);
  if (init.method_name !== "init" || init.args !== Buffer.from(initArgs).toString("base64")
    || init.gas !== Number(initGas) || init.deposit !== "0") throw Error("DEPLOYMENT_ACTION_MISMATCH");
  if (object(result.status, ["SuccessValue"]).SuccessValue !== "") throw Error("DEPLOYMENT_EXECUTION_FAILED_OR_UNKNOWN");
  const initial = object(result.transaction_outcome), initialOutcome = object(initial.outcome);
  const rootId = object(initialOutcome.status, ["SuccessReceiptId"]).SuccessReceiptId;
  decodeBase58_32(initial.block_hash); decodeBase58_32(rootId);
  if (initial.id !== hash || initialOutcome.executor_id !== gateAccount || !Array.isArray(initialOutcome.receipt_ids)
    || initialOutcome.receipt_ids.length !== 1 || initialOutcome.receipt_ids[0] !== rootId) throw Error("DEPLOYMENT_GRAPH_UNPROVEN");
  if (!Array.isArray(result.receipts_outcome) || result.receipts_outcome.length < 1 || result.receipts_outcome.length > 16) throw Error("DEPLOYMENT_GRAPH_UNPROVEN");
  const entries = result.receipts_outcome.map(value => object(value)), byId = new Map(entries.map(entry => [entry.id, entry]));
  if (byId.size !== entries.length) throw Error("DEPLOYMENT_GRAPH_UNPROVEN");
  const reached = new Set<unknown>(), pending: unknown[] = [rootId]; let gasBurnt = 0n, tokensBurnt = 0n;
  for (const entry of [initial, ...entries]) {
    const outcome = object(entry.outcome);
    if (!Number.isSafeInteger(outcome.gas_burnt) || (outcome.gas_burnt as number) < 0) throw Error("DEPLOYMENT_COST_UNPROVEN");
    gasBurnt += BigInt(outcome.gas_burnt as number); tokensBurnt += BigInt(amount(outcome.tokens_burnt));
  }
  while (pending.length) {
    const id = pending.pop(); if (reached.has(id)) throw Error("DEPLOYMENT_GRAPH_UNPROVEN"); reached.add(id);
    const entry = byId.get(id); if (!entry) throw Error("DEPLOYMENT_GRAPH_UNPROVEN");
    decodeBase58_32(entry.id); decodeBase58_32(entry.block_hash);
    const outcome = object(entry.outcome);
    if (outcome.executor_id !== gateAccount || object(outcome.status, ["SuccessValue"]).SuccessValue !== ""
      || !Array.isArray(outcome.receipt_ids) || outcome.receipt_ids.length > 16) throw Error("DEPLOYMENT_EXECUTION_FAILED_OR_UNKNOWN");
    pending.push(...outcome.receipt_ids);
  }
  if (reached.size !== entries.length) throw Error("DEPLOYMENT_GRAPH_UNPROVEN");
  return { status: "FINAL_DEPLOYMENT_ACTIONS_SUCCEEDED", transaction_hash: hash,
    receipt_ids: entries.map(entry => entry.id), gas_burnt: gasBurnt.toString(), tokens_burnt_yoctoNEAR: tokensBurnt.toString() };
}
