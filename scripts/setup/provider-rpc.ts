/** Fixed database registration views and one-send; exact Gate/project checks, no RPC fallback. */
import { amount, count, object, parseBoundedJson, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { decodeBase58_32 } from "../near/base58.ts";
import { checkedPublicKey, parentAccount } from "./child-account-codec.ts";
import { deploymentArtifact, gateAccount } from "./deployment-codec.ts";
import { projectDeposit, projectIds } from "./project-codec.ts";
import { checkedDatabaseProvider, checkedProviderProject, encodeProviderTransaction, parseProviderTransaction,
  providerDeposit, providerGas, providerTerms, providerTarget, verifyProviderSignature } from "./provider-codec.ts";
import type { ChildTransport } from "./child-account-rpc.ts";
type Block = { hash: string; height: number; timestamp_ns: string };
function transportReason(error: unknown) {
  // Only fixed native error codes are public. Never print URLs, bodies, stacks or arbitrary messages.
  const allowed = new Set(["ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
    "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"]);
  if (error instanceof Error) {
    const cause = Object.getOwnPropertyDescriptor(error, "cause")?.value;
    const source = cause && typeof cause === "object" ? cause : error;
    const code: unknown = Object.getOwnPropertyDescriptor(source, "code")?.value;
    if (typeof code === "string" && allowed.has(code)) return code;
    if (error.name === "AbortError" || error.name === "TimeoutError") return "TIMEOUT";
  }
  return "UNAVAILABLE";
}

export function providerRpc(transport: ChildTransport) {
  let id = 0, sent = false;
  async function call(method: string, params: unknown) {
    if (++id > 48) throw Error("PROVIDER_RPC_LIMIT");
    const requestId = `runlatch-provider-${id}`, signal = AbortSignal.timeout(20000);
    const body = JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params });
    if (Buffer.byteLength(body) > 8192) throw Error("PROVIDER_RPC_LIMIT");
    let response: Response;
    try {
      response = await transport(providerTarget.rpc_url, { method: "POST", body, headers: { "Content-Type": "application/json" },
        redirect: "error", credentials: "omit", cache: "no-store", signal });
    } catch (error) { throw Error(`PROVIDER_RPC_TRANSPORT_${transportReason(error)}`); }
    if (!response.ok) throw Error(`PROVIDER_RPC_HTTP_${response.status}`);
    if (!response.body) throw Error("PROVIDER_RPC_UNAVAILABLE");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    const abort = () => { void reader.cancel().catch(() => undefined); }; signal.addEventListener("abort", abort, { once: true });
    try {
      for (;;) {
        if (signal.aborted) throw Error("PROVIDER_RPC_UNAVAILABLE");
        const next = await reader.read(); if (next.done) break;
        size += next.value.length; if (size > 65536) throw Error("PROVIDER_RPC_LIMIT"); chunks.push(next.value);
      }
    } catch (error) {
      if (error instanceof Error && ["PROVIDER_RPC_UNAVAILABLE", "PROVIDER_RPC_LIMIT"].includes(error.message)) throw error;
      throw Error("PROVIDER_RPC_RESPONSE_READ_FAILED");
    } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (signal.aborted) throw Error("PROVIDER_RPC_UNAVAILABLE");
    const reply = object(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), 65536));
    if (reply.jsonrpc !== "2.0" || reply.id !== requestId || reply.error !== undefined) throw Error("PROVIDER_RPC_UNAVAILABLE"); return object(reply.result);
  }
  async function query(account: string, request: Record<string, unknown>, b: Block) {
    const r = await call("query", { ...request, account_id: account, block_id: b.hash });
    if (r.block_hash !== b.hash || r.block_height !== b.height) throw Error("PROVIDER_BLOCK_MISMATCH"); return r;
  }
  async function block(hash?: string): Promise<Block> {
    const h = object((await call("block", hash ? { block_id: hash } : { finality: "final" })).header);
    decodeBase58_32(h.hash); const height = count(h.height, Number.MAX_SAFE_INTEGER), timestamp = time(h.timestamp_nanosec);
    if (!height || hash && h.hash !== hash) throw Error("PROVIDER_BLOCK_MISMATCH");
    return { hash: h.hash as string, height, timestamp_ns: timestamp };
  }
  async function account(accountId: string, publicKey: string, b: Block) {
    checkedPublicKey(publicKey);
    const [state, list, direct] = await Promise.all([query(accountId, { request_type: "view_account" }, b),
      query(accountId, { request_type: "view_access_key_list" }, b), query(accountId, { request_type: "view_access_key", public_key: publicKey }, b)]);
    decodeBase58_32(state.code_hash);
    if (state.locked !== "0" || !Array.isArray(list.keys) || list.keys.length !== 1) throw Error("PROVIDER_ACCOUNT_OR_KEY_CHANGED");
    const row = object(list.keys[0]), key = object(row.access_key);
    if (row.public_key !== publicKey || key.permission !== "FullAccess" || direct.permission !== "FullAccess" || key.nonce !== direct.nonce) throw Error("PROVIDER_ACCOUNT_OR_KEY_CHANGED");
    return { state: { amount: amount(state.amount), locked: "0", storage_usage: count(state.storage_usage, Number.MAX_SAFE_INTEGER),
      code_hash: state.code_hash as string }, nonce: count(key.nonce, Number.MAX_SAFE_INTEGER).toString() };
  }
  async function view(method: "get_operator" | "get_schema_version" | "get_network_tag" | "get_storage_requirements" | "get_project" | "get_projects" | "get_capsules", b: Block) {
    const args = method === "get_project" ? { project_id: projectIds.project_id }
      : ["get_projects", "get_capsules"].includes(method) ? { from_index: 0, limit: 2 } : {};
    const r = await query(gateAccount, { request_type: "call_function", method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") }, b);
    if (!Array.isArray(r.result) || r.result.length > 8192 || r.result.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw Error("PROVIDER_VIEW_INVALID");
    return parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(r.result)), 8192);
  }
  async function database(publicKey: string, b: Block) {
    checkedPublicKey(publicKey);
    const [state, list, direct] = await Promise.all([
      query(providerTerms.publisher_id, { request_type: "view_account" }, b),
      query(providerTerms.publisher_id, { request_type: "view_access_key_list" }, b),
      query(providerTerms.publisher_id, { request_type: "view_access_key", public_key: publicKey }, b) ]);
    if (state.locked !== "0" || state.code_hash !== "11111111111111111111111111111111"
      || !Array.isArray(list.keys) || list.keys.length !== 1) throw Error("PROVIDER_DATABASE_ACCOUNT_CHANGED");
    const row = object(list.keys[0]), key = object(row.access_key);
    if (row.public_key !== publicKey || key.permission !== "FullAccess" || direct.permission !== "FullAccess"
      || key.nonce !== direct.nonce) throw Error("PROVIDER_DATABASE_KEY_CHANGED");
    return Object.freeze({ public_key: publicKey, nonce: count(key.nonce, Number.MAX_SAFE_INTEGER).toString(),
      amount: amount(state.amount), locked: "0", storage_usage: count(state.storage_usage, Number.MAX_SAFE_INTEGER), code_hash: state.code_hash });
  }
  async function record(b: Block) {
    const r = await query(gateAccount, { request_type: "call_function", method_name: "get_provider",
      args_base64: Buffer.from(JSON.stringify({ provider_id: providerTerms.provider_id })).toString("base64") }, b);
    if (!Array.isArray(r.result) || r.result.length > 4096 || r.result.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw Error("PROVIDER_VIEW_INVALID");
    const value = parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(r.result)), 4096);
    return value === null ? null : checkedDatabaseProvider(value);
  }
  return {
    async state(operatorKey: string, gateKey: string, databaseKey: string) {
      const status = await call("status", []);
      if (status.chain_id !== "testnet" || object(status.sync_info).syncing !== false) throw Error("PROVIDER_TESTNET_REQUIRED");
      const b = await block();
      // One fixed preflight, same finalized block throughout, maximum six concurrent queries.
      const [operator, gate] = await Promise.all([account(parentAccount, operatorKey, b), account(gateAccount, gateKey, b)]);
      if (operator.state.code_hash !== "11111111111111111111111111111111" || gate.state.code_hash !== deploymentArtifact.code_hash) throw Error("PROVIDER_GATE_CHANGED");
      const [db, owner, schema, network] = await Promise.all([database(databaseKey, b), view("get_operator", b), view("get_schema_version", b), view("get_network_tag", b)]);
      if (owner !== parentAccount || schema !== 2 || network !== "testnet") throw Error("PROVIDER_GATE_CHANGED");
      const [rawStorage, projects, capsules, rawProject, provider] = await Promise.all([view("get_storage_requirements", b),
        view("get_projects", b), view("get_capsules", b), view("get_project", b), record(b)]);
      const raw = object(rawStorage, ["project_credit", "capsule_credit", "provider_credit", "quote_credit", "scope"]);
      const storage = { project_credit: amount(raw.project_credit), capsule_credit: amount(raw.capsule_credit),
        provider_credit: amount(raw.provider_credit), quote_credit: amount(raw.quote_credit) };
      if (storage.project_credit !== projectDeposit || storage.provider_credit !== providerDeposit || Object.values(storage).some(v => v === "0")
        || raw.scope !== "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS") throw Error("PROVIDER_STORAGE_REVIEW_REQUIRED");
      const project = checkedProviderProject(rawProject, b.timestamp_ns);
      if (!Array.isArray(projects) || projects.length !== 1 || canonicalReviewContent(projects[0]) !== canonicalReviewContent(project)
        || !Array.isArray(capsules) || capsules.length) throw Error("PROVIDER_PROJECT_AUTHORITY_CHANGED");
      return { block: b, operator, gate, project, storage, database: db, provider };
    },
    async fees(b: Block, input: unknown) {
      const tx = parseProviderTransaction(input);
      const [config, gasPrice] = await Promise.all([call("EXPERIMENTAL_protocol_config", { block_id: b.hash }), call("gas_price", [b.hash])]);
      const runtime = object(config.runtime_config);
      if (count(config.protocol_version, Number.MAX_SAFE_INTEGER) < 88) throw Error("PROVIDER_PROTOCOL_UNSUPPORTED");
      const costs = object(runtime.transaction_costs), actions = object(costs.action_creation_config);
      const entries = [[costs.action_receipt_creation_config, 1], [actions.function_call_cost, 1],
        [actions.function_call_cost_per_byte, Buffer.byteLength(tx.method) + Buffer.byteLength(JSON.stringify(tx.args))]] as const;
      let gas = 0n;
      for (const [value, multiplier] of entries) {
        const fee = object(value); for (const field of ["send_not_sir", "execution"]) gas += BigInt(count(fee[field], Number.MAX_SAFE_INTEGER)) * BigInt(multiplier);
      }
      const price = amount(gasPrice.gas_price), storagePrice = amount(runtime.storage_amount_per_byte);
      if (price === "0" || BigInt(storagePrice) * 4096n !== BigInt(providerDeposit)) throw Error("PROVIDER_STORAGE_REVIEW_REQUIRED");
      const budget = (gas + BigInt(providerGas)) * BigInt(price);
      if (budget > 30000000000000000000000n) throw Error("PROVIDER_GAS_REVIEW_REQUIRED");
      return { protocol_version: config.protocol_version, native_action_gas_estimate: gas.toString(), prepaid_gas: providerGas,
        gas_price_yocto: price, gas_budget_at_current_price_yocto: budget.toString(), storage_price_yocto_per_byte: storagePrice };
    },
    async send(input: unknown, bytes: Uint8Array) {
      const encoded = encodeProviderTransaction(input);
      if (sent || bytes.length !== encoded.unsigned_bytes.length + 65 || bytes.length > 4096
        || !Buffer.from(bytes.subarray(0, -65)).equals(Buffer.from(encoded.unsigned_bytes))) throw Error("PROVIDER_SEND_REFUSED");
      if (!Buffer.from(verifyProviderSignature(input, bytes.slice(-64)).signed_bytes).equals(Buffer.from(bytes))) throw Error("PROVIDER_SEND_REFUSED");
      sent = true; return call("send_tx", { signed_tx_base64: Buffer.from(bytes).toString("base64"), wait_until: "FINAL" });
    },
    transaction(hash: string) { decodeBase58_32(hash); return call("tx", { tx_hash: hash, sender_account_id: parentAccount, wait_until: "FINAL" }); },
    async proof(input: unknown, execution: ReturnType<typeof inspectProviderExecution>, gateKey: string, databaseKey: string, expectedDatabase: string) {
      const tx = parseProviderTransaction(input), historic = await block(execution.execution_block_hash);
      const old = await query(gateAccount, { request_type: "view_account" }, historic);
      if (old.code_hash !== deploymentArtifact.code_hash) throw Error("PROVIDER_EXECUTION_CODE_UNPROVEN");
      const current = await this.state(tx.public_key, gateKey, databaseKey);
      checkedProviderProject(current.project, historic.timestamp_ns);
      if (current.block.height < historic.height || current.operator.nonce !== tx.nonce || current.provider === null
        || canonicalReviewContent(current.provider) !== canonicalReviewContent(execution.provider)
        || canonicalReviewContent(current.database) !== expectedDatabase) throw Error("PROVIDER_FINAL_STATE_UNPROVEN");
      return { status: "PROVIDER_REGISTRATION_OBSERVED", network: "testnet", contract_id: gateAccount, operator_id: parentAccount,
        public_key: tx.public_key, nonce: current.operator.nonce, code_hash: deploymentArtifact.code_hash, provider: current.provider, project: current.project,
        storage_deposit_yoctoNEAR: providerDeposit, purchase_funding_yoctoNEAR: "0", purchase_executed: false, quote_published_by_this_call: false,
        restricted_key_installed_by_this_call: false, block_hash: current.block.hash, block_height: current.block.height,
        execution_block_hash: historic.hash, execution_block_height: historic.height, database: current.database,
        operator_balance_yoctoNEAR: current.operator.state.amount, gate_balance_yoctoNEAR: current.gate.state.amount,
        gate_storage_usage_bytes: current.gate.state.storage_usage };
    },
  };
}
export function inspectProviderExecution(input: unknown, hash: string, raw: unknown) {
  const tx = parseProviderTransaction(input), result = object(raw), observed = object(result.transaction); decodeBase58_32(hash);
  if (encodeProviderTransaction(tx).transaction_hash !== hash || result.final_execution_status !== "FINAL" || observed.hash !== hash
    || observed.signer_id !== parentAccount || observed.receiver_id !== gateAccount || observed.public_key !== tx.public_key
    || !Number.isSafeInteger(observed.nonce) || String(observed.nonce) !== tx.nonce) throw Error("PROVIDER_EXECUTION_UNPROVEN");
  if (!Array.isArray(observed.actions) || observed.actions.length !== 1) throw Error("PROVIDER_ACTION_MISMATCH");
  const action = object(object(observed.actions[0], ["FunctionCall"]).FunctionCall, ["method_name", "args", "gas", "deposit"]);
  if (action.method_name !== tx.method || action.args !== Buffer.from(JSON.stringify(tx.args)).toString("base64")
    || action.gas !== Number(providerGas) || action.deposit !== providerDeposit) throw Error("PROVIDER_ACTION_MISMATCH");
  const value = object(result.status, ["SuccessValue"]).SuccessValue;
  if (typeof value !== "string" || value.length > 4096 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)
    || Buffer.from(value, "base64").toString("base64") !== value) throw Error("PROVIDER_RETURN_INVALID");
  const provider = checkedDatabaseProvider(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(value, "base64")), 4096));
  const initial = object(result.transaction_outcome), initialOutcome = object(initial.outcome), rootId = object(initialOutcome.status, ["SuccessReceiptId"]).SuccessReceiptId;
  decodeBase58_32(initial.block_hash); decodeBase58_32(rootId);
  if (initial.id !== hash || initialOutcome.executor_id !== parentAccount || !Array.isArray(initialOutcome.receipt_ids)
    || initialOutcome.receipt_ids.length !== 1 || initialOutcome.receipt_ids[0] !== rootId) throw Error("PROVIDER_GRAPH_UNPROVEN");
  if (!Array.isArray(result.receipts_outcome) || result.receipts_outcome.length < 1 || result.receipts_outcome.length > 3) throw Error("PROVIDER_GRAPH_UNPROVEN");
  const entries = result.receipts_outcome.map(v => object(v)), byId = new Map(entries.map(v => [v.id, v])), root = byId.get(rootId);
  if (!root || byId.size !== entries.length) throw Error("PROVIDER_GRAPH_UNPROVEN");
  const rootOutcome = object(root.outcome);
  if (rootOutcome.executor_id !== gateAccount || object(rootOutcome.status, ["SuccessValue"]).SuccessValue !== value
    || !Array.isArray(rootOutcome.receipt_ids) || rootOutcome.receipt_ids.length !== entries.length - 1
    || new Set(rootOutcome.receipt_ids).size !== rootOutcome.receipt_ids.length) throw Error("PROVIDER_GRAPH_UNPROVEN");
  let gas = 0n, tokens = 0n;
  for (const entry of [initial, ...entries]) {
    decodeBase58_32(entry.id); decodeBase58_32(entry.block_hash); const outcome = object(entry.outcome);
    gas += BigInt(count(outcome.gas_burnt, Number.MAX_SAFE_INTEGER)); tokens += BigInt(amount(outcome.tokens_burnt));
    if (entry !== initial && entry !== root && (!rootOutcome.receipt_ids.includes(entry.id) || outcome.executor_id !== parentAccount
      || object(outcome.status, ["SuccessValue"]).SuccessValue !== "" || !Array.isArray(outcome.receipt_ids) || outcome.receipt_ids.length)) throw Error("PROVIDER_GRAPH_UNPROVEN");
  }
  return { status: "FINAL_PROVIDER_ACTION_SUCCEEDED", transaction_hash: hash, provider, execution_block_hash: root.block_hash as string,
    receipt_ids: entries.map(v => v.id), gas_burnt: gas.toString(), tokens_burnt_yoctoNEAR: amount(tokens.toString()) };
}
