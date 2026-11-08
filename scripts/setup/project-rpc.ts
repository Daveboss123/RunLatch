/** Fixed first-project RPC scope, bounded reads and exactly one byte-send per instance. */
import { amount, count, object, parseBoundedJson, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { decodeBase58_32 } from "../near/base58.ts";
import { checkedPublicKey, parentAccount } from "./child-account-codec.ts";
import { deploymentArtifact, gateAccount } from "./deployment-codec.ts";
import { checkedDemoProject, encodeProjectTransaction, parseProjectTransaction, projectDeposit, projectGas, projectIds, verifyProjectSignature,
  type ProjectTransaction } from "./project-codec.ts";
import type { ChildTransport } from "./child-account-rpc.ts";

function base64(value: unknown, maximum: number) {
  if (typeof value !== "string" || value.length > Math.ceil(maximum / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw Error("PROJECT_BYTES_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || bytes.length > maximum) throw Error("PROJECT_BYTES_INVALID"); return bytes;
}
function projectRecord(input: unknown, tx: ProjectTransaction, expectedTime?: string) {
  const p = object(input, ["input", "owner_id", "revision", "status", "allocated_authority", "capsule_ids", "created_at_ns", "updated_at_ns"]);
  const terms = checkedDemoProject(p.input), created = time(p.created_at_ns), updated = time(p.updated_at_ns);
  if (canonicalReviewContent(terms) !== canonicalReviewContent(tx.args.project) || p.owner_id !== parentAccount
    || p.revision !== "1" || p.status !== "ACTIVE" || p.allocated_authority !== "0"
    || !Array.isArray(p.capsule_ids) || p.capsule_ids.length || created !== updated
    || expectedTime !== undefined && created !== expectedTime || BigInt(created) >= BigInt(terms.expires_at_ns)) throw Error("PROJECT_RECORD_UNPROVEN");
  return { input: terms, owner_id: parentAccount, revision: "1", status: "ACTIVE", allocated_authority: "0",
    capsule_ids: [] as string[], created_at_ns: created, updated_at_ns: updated };
}
export function projectRpc(transport: ChildTransport) {
  let id = 0, sent = false;
  async function call(method: string, params: unknown) {
    const requestId = `runlatch-project-${++id}`, signal = AbortSignal.timeout(20000);
    const body = JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params });
    if (Buffer.byteLength(body) > 8192) throw Error("PROJECT_RPC_LIMIT");
    const response = await transport("https://rpc.testnet.near.org/", { method: "POST", body, headers: { "Content-Type": "application/json" },
      redirect: "error", credentials: "omit", cache: "no-store", signal });
    if (!response.ok || !response.body) throw Error("PROJECT_RPC_UNAVAILABLE");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    const abort = () => { void reader.cancel().catch(() => undefined); }; signal.addEventListener("abort", abort, { once: true });
    try {
      for (;;) {
        if (signal.aborted) throw Error("PROJECT_RPC_UNAVAILABLE");
        const next = await reader.read(); if (next.done) break;
        size += next.value.length; if (size > 65536) throw Error("PROJECT_RPC_LIMIT"); chunks.push(next.value);
      }
    } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (signal.aborted) throw Error("PROJECT_RPC_UNAVAILABLE");
    const reply = object(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), 65536));
    if (reply.jsonrpc !== "2.0" || reply.id !== requestId || reply.error !== undefined) throw Error("PROJECT_RPC_UNAVAILABLE"); return object(reply.result);
  }
  async function block(hash?: string) {
    const h = object((await call("block", hash ? { block_id: hash } : { finality: "final" })).header);
    decodeBase58_32(h.hash); const height = count(h.height, Number.MAX_SAFE_INTEGER), timestamp = time(h.timestamp_nanosec);
    if (!height || hash && h.hash !== hash) throw Error("PROJECT_BLOCK_MISMATCH");
    return { hash: h.hash as string, height, timestamp_ns: timestamp };
  }
  async function query(account: string, request: Record<string, unknown>, b: Awaited<ReturnType<typeof block>>) {
    const r = await call("query", { ...request, account_id: account, block_id: b.hash });
    if (r.block_hash !== b.hash || r.block_height !== b.height) throw Error("PROJECT_BLOCK_MISMATCH"); return r;
  }
  async function view(method: "get_operator" | "get_schema_version" | "get_network_tag" | "get_storage_requirements" | "get_project" | "get_projects" | "get_capsules", b: Awaited<ReturnType<typeof block>>) {
    const args = method === "get_project" ? { project_id: projectIds.project_id }
      : ["get_projects", "get_capsules"].includes(method) ? { from_index: 0, limit: 2 } : {};
    const r = await query(gateAccount, { request_type: "call_function", method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") }, b);
    if (!Array.isArray(r.result) || r.result.length > 8192 || r.result.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw Error("PROJECT_VIEW_INVALID");
    return parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(r.result)), 8192);
  }
  async function account(account: string, key: string, b: Awaited<ReturnType<typeof block>>) {
    checkedPublicKey(key);
    const [state, list, direct] = await Promise.all([
      query(account, { request_type: "view_account" }, b), query(account, { request_type: "view_access_key_list" }, b),
      query(account, { request_type: "view_access_key", public_key: key }, b) ]);
    amount(state.amount); decodeBase58_32(state.code_hash);
    if (state.locked !== "0") throw Error("PROJECT_ACCOUNT_INVALID"); count(state.storage_usage, Number.MAX_SAFE_INTEGER);
    if (!Array.isArray(list.keys) || list.keys.length !== 1) throw Error("PROJECT_KEY_MISMATCH");
    const row = object(list.keys[0]), access = object(row.access_key);
    if (row.public_key !== key || access.permission !== "FullAccess" || direct.permission !== "FullAccess"
      || access.nonce !== direct.nonce) throw Error("PROJECT_KEY_MISMATCH");
    const nonce = count(access.nonce, Number.MAX_SAFE_INTEGER).toString();
    // Compare semantic account state across fresh final blocks, not RPC block metadata.
    return { state: { amount: amount(state.amount), locked: "0", storage_usage: count(state.storage_usage, Number.MAX_SAFE_INTEGER),
      code_hash: state.code_hash as string }, nonce };
  }
  return {
    async state(operatorKey: string, gateKey: string) {
      const status = await call("status", []);
      if (status.chain_id !== "testnet" || object(status.sync_info).syncing !== false) throw Error("PROJECT_TESTNET_REQUIRED");
      const b = await block();
      // Fixed read-only batches, maximum six concurrent RPC calls. Never mix block hashes.
      const [operator, gate] = await Promise.all([account(parentAccount, operatorKey, b), account(gateAccount, gateKey, b)]);
      if (operator.state.code_hash !== "11111111111111111111111111111111" || gate.state.code_hash !== deploymentArtifact.code_hash) throw Error("PROJECT_GATE_MISMATCH");
      const [owner, schema, network] = await Promise.all([view("get_operator", b), view("get_schema_version", b), view("get_network_tag", b)]);
      if (owner !== parentAccount || schema !== 2 || network !== "testnet") throw Error("PROJECT_GATE_MISMATCH");
      const [rawStorage, projects, capsules, project] = await Promise.all([
        view("get_storage_requirements", b), view("get_projects", b), view("get_capsules", b), view("get_project", b) ]);
      const storage = object(rawStorage, ["project_credit", "capsule_credit", "provider_credit", "quote_credit", "scope"]);
      if (storage.project_credit !== projectDeposit || storage.scope !== "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS") throw Error("PROJECT_STORAGE_REVIEW_REQUIRED");
      const credits = { project_credit: amount(storage.project_credit), capsule_credit: amount(storage.capsule_credit),
        provider_credit: amount(storage.provider_credit), quote_credit: amount(storage.quote_credit) };
      if (Object.values(credits).some(v => v === "0")) throw Error("PROJECT_STORAGE_REVIEW_REQUIRED");
      if (!Array.isArray(projects) || projects.length > 2 || !Array.isArray(capsules) || capsules.length) throw Error("PROJECT_SCOPE_ALREADY_ACTIVE");
      return { block: b, operator, gate, project, projects, storage: credits };
    },
    async fees(b: Awaited<ReturnType<typeof block>>, input: unknown) {
      const tx = parseProjectTransaction(input);
      const [config, gasPrice] = await Promise.all([call("EXPERIMENTAL_protocol_config", { block_id: b.hash }), call("gas_price", [b.hash])]);
      const runtime = object(config.runtime_config);
      if (count(config.protocol_version, Number.MAX_SAFE_INTEGER) < 88) throw Error("PROJECT_PROTOCOL_UNSUPPORTED");
      const costs = object(runtime.transaction_costs), actions = object(costs.action_creation_config);
      const entries = [[costs.action_receipt_creation_config, 1], [actions.function_call_cost, 1],
        [actions.function_call_cost_per_byte, Buffer.byteLength(tx.method) + Buffer.byteLength(JSON.stringify(tx.args))]] as const;
      let gas = 0n;
      for (const [value, multiplier] of entries) {
        const fee = object(value); for (const field of ["send_not_sir", "execution"]) gas += BigInt(count(fee[field], Number.MAX_SAFE_INTEGER)) * BigInt(multiplier);
      }
      const price = amount(gasPrice.gas_price), storagePrice = amount(runtime.storage_amount_per_byte);
      if (price === "0" || BigInt(storagePrice) * 8192n !== BigInt(projectDeposit)) throw Error("PROJECT_STORAGE_REVIEW_REQUIRED");
      const budget = (gas + BigInt(projectGas)) * BigInt(price);
      if (budget > 30000000000000000000000n) throw Error("PROJECT_GAS_REVIEW_REQUIRED");
      return { protocol_version: config.protocol_version, native_action_gas_estimate: gas.toString(), prepaid_gas: projectGas,
        gas_price_yocto: price, gas_budget_at_current_price_yocto: budget.toString(), storage_price_yocto_per_byte: storagePrice };
    },
    async send(input: unknown, bytes: Uint8Array) {
      const encoded = encodeProjectTransaction(input);
      if (sent || bytes.length !== encoded.unsigned_bytes.length + 65 || bytes.length > 4096
        || !Buffer.from(bytes.subarray(0, -65)).equals(Buffer.from(encoded.unsigned_bytes))) throw Error("PROJECT_SEND_REFUSED");
      if (!Buffer.from(verifyProjectSignature(input, bytes.slice(-64)).signed_bytes).equals(Buffer.from(bytes))) throw Error("PROJECT_SEND_REFUSED");
      sent = true; return call("send_tx", { signed_tx_base64: Buffer.from(bytes).toString("base64"), wait_until: "FINAL" });
    },
    transaction(hash: string) { decodeBase58_32(hash); return call("tx", { tx_hash: hash, sender_account_id: parentAccount, wait_until: "FINAL" }); },
    async proof(input: unknown, execution: ReturnType<typeof inspectProjectExecution>, gateKey: string) {
      const tx = parseProjectTransaction(input), historic = await block(execution.execution_block_hash);
      const oldAccount = await query(gateAccount, { request_type: "view_account" }, historic);
      if (oldAccount.code_hash !== deploymentArtifact.code_hash) throw Error("PROJECT_EXECUTION_CODE_UNPROVEN");
      const returned = projectRecord(execution.project, tx, historic.timestamp_ns);
      const current = await this.state(tx.public_key, gateKey);
      if (current.block.height < historic.height || current.operator.nonce !== tx.nonce || current.projects.length !== 1
        || canonicalReviewContent(projectRecord(current.project, tx, historic.timestamp_ns)) !== canonicalReviewContent(returned)
        || canonicalReviewContent(current.projects[0]) !== canonicalReviewContent(current.project)) throw Error("PROJECT_FINAL_STATE_UNPROVEN");
      return { status: "PROJECT_CREATION_OBSERVED", network: "testnet", contract_id: gateAccount, operator_id: parentAccount,
        public_key: tx.public_key, nonce: current.operator.nonce, code_hash: deploymentArtifact.code_hash, project: returned,
        storage_deposit_yoctoNEAR: projectDeposit, purchase_funding_yoctoNEAR: "0", purchase_executed: false,
        restricted_key_installed_by_this_call: false, block_hash: current.block.hash, block_height: current.block.height,
        execution_block_hash: historic.hash, execution_block_height: historic.height,
        operator_balance_yoctoNEAR: current.operator.state.amount, gate_balance_yoctoNEAR: current.gate.state.amount,
        gate_storage_usage_bytes: current.gate.state.storage_usage };
    },
  };
}
export function inspectProjectExecution(input: unknown, hash: string, raw: unknown) {
  const tx = parseProjectTransaction(input), result = object(raw), observed = object(result.transaction); decodeBase58_32(hash);
  if (encodeProjectTransaction(tx).transaction_hash !== hash || result.final_execution_status !== "FINAL" || observed.hash !== hash
    || observed.signer_id !== parentAccount || observed.receiver_id !== gateAccount || observed.public_key !== tx.public_key
    || !Number.isSafeInteger(observed.nonce) || String(observed.nonce) !== tx.nonce) throw Error("PROJECT_EXECUTION_UNPROVEN");
  if (!Array.isArray(observed.actions) || observed.actions.length !== 1) throw Error("PROJECT_ACTION_MISMATCH");
  const action = object(object(observed.actions[0], ["FunctionCall"]).FunctionCall, ["method_name", "args", "gas", "deposit"]);
  if (action.method_name !== tx.method || action.args !== Buffer.from(JSON.stringify(tx.args)).toString("base64")
    || action.gas !== Number(projectGas) || action.deposit !== projectDeposit) throw Error("PROJECT_ACTION_MISMATCH");
  const value = object(result.status, ["SuccessValue"]).SuccessValue;
  const project = projectRecord(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(base64(value, 4096)), 4096), tx);
  const initial = object(result.transaction_outcome), initialOutcome = object(initial.outcome), rootId = object(initialOutcome.status, ["SuccessReceiptId"]).SuccessReceiptId;
  decodeBase58_32(initial.block_hash); decodeBase58_32(rootId);
  if (initial.id !== hash || initialOutcome.executor_id !== parentAccount || !Array.isArray(initialOutcome.receipt_ids)
    || initialOutcome.receipt_ids.length !== 1 || initialOutcome.receipt_ids[0] !== rootId) throw Error("PROJECT_GRAPH_UNPROVEN");
  if (!Array.isArray(result.receipts_outcome) || result.receipts_outcome.length < 1 || result.receipts_outcome.length > 3) throw Error("PROJECT_GRAPH_UNPROVEN");
  const entries = result.receipts_outcome.map(v => object(v)), byId = new Map(entries.map(v => [v.id, v])), root = byId.get(rootId);
  if (!root || byId.size !== entries.length) throw Error("PROJECT_GRAPH_UNPROVEN");
  const rootOutcome = object(root.outcome);
  if (rootOutcome.executor_id !== gateAccount || object(rootOutcome.status, ["SuccessValue"]).SuccessValue !== value
    || !Array.isArray(rootOutcome.receipt_ids) || rootOutcome.receipt_ids.length !== entries.length - 1
    || new Set(rootOutcome.receipt_ids).size !== rootOutcome.receipt_ids.length) throw Error("PROJECT_GRAPH_UNPROVEN");
  let gas = 0n, tokens = 0n;
  for (const entry of [initial, ...entries]) {
    decodeBase58_32(entry.id); decodeBase58_32(entry.block_hash); const outcome = object(entry.outcome);
    gas += BigInt(count(outcome.gas_burnt, Number.MAX_SAFE_INTEGER)); tokens += BigInt(amount(outcome.tokens_burnt));
    if (entry !== initial && entry !== root && (!rootOutcome.receipt_ids.includes(entry.id) || outcome.executor_id !== parentAccount
      || object(outcome.status, ["SuccessValue"]).SuccessValue !== "" || !Array.isArray(outcome.receipt_ids) || outcome.receipt_ids.length)) throw Error("PROJECT_GRAPH_UNPROVEN");
  }
  return { status: "FINAL_PROJECT_ACTION_SUCCEEDED", transaction_hash: hash, project, execution_block_hash: root.block_hash as string,
    receipt_ids: entries.map(v => v.id), gas_burnt: gas.toString(), tokens_burnt_yoctoNEAR: tokens.toString() };
}
