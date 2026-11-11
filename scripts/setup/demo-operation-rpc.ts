/** Fixed demo-operation RPC scope: bounded reads, one byte-send per instance, no fallback or generic dispatcher. */
import { amount, count, hash, object, parseBoundedJson, parseProvider, parseQuote, time } from "../../src/lib/near/records.ts";
import { canonicalReviewContent } from "../../src/lib/near/review-content.ts";
import { DEMO_AGENT_SCOPE, DEMO_CAPSULE_ACTION, DEMO_PROJECT_ACTION, DEMO_PROJECT_ID, DEMO_QUOTE_ACTION, RUNLATCH_TESTNET_TARGET } from "../../src/lib/near/demo-operations.ts";
import { parseProjectInput } from "../../src/lib/near/setup-review.ts";
import { decodeBase58_32 } from "../near/base58.ts";
import { checkedPublicKey } from "./child-account-codec.ts";
import { deploymentArtifact, gateAccount } from "./deployment-codec.ts";
import { demoGas, demoQuoteDeposit, demoSetupAction, encodeDemoTransaction, parseDemoTransaction, verifyDemoSignature, type DemoKind,
  type DemoTransaction } from "./demo-operation-codec.ts";
import type { ChildTransport } from "./child-account-rpc.ts";
type Block = { hash: string; height: number; timestamp_ns: string };
/** nearcore regular-key initialization, not the AddKey action's serialized input nonce. */
export function initialRegularKeyNonce(executionHeight: number) {
  const height = count(executionHeight, Number.MAX_SAFE_INTEGER);
  if (height < 1) throw Error("DEMO_KEY_EXECUTION_HEIGHT_INVALID");
  return time(((BigInt(height) - 1n) * 1_000_000n).toString());
}
function base64(value: unknown, maximum: number) {
  if (typeof value !== "string" || value.length > Math.ceil(maximum / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw Error("DEMO_BYTES_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || bytes.length > maximum) throw Error("DEMO_BYTES_INVALID"); return bytes;
}
function policy(value: unknown) {
  const p = object(value, ["project_id", "project_revision", "task_id", "workflow_id", "agent_id", "agent_public_key", "budget",
    "per_purchase_limit", "per_commitment_limit", "recurring_policy", "allowed_provider_ids", "allowed_service_ids", "allowed_categories",
    "max_quantity", "approval_threshold", "expires_at_ns", "validation_spec_hash"]);
  return p;
}
function capsuleRecord(value: unknown, tx: { kind: string; args: Readonly<Record<string, unknown>> }) {
  if (tx.kind !== "capsule") throw Error("DEMO_RECORD_MISMATCH");
  const c = object(value, ["capsule_id", "owner_id", "policy", "policy_hash", "policy_schema_version", "status", "allocated", "spent", "reserved",
    "committed_future", "returned", "storage_credit", "created_at_ns", "revoked_at_ns", "request_ids", "owner_refund", "refund_attempts"]);
  const args = object(tx.args, ["capsule_id", "policy", "storage_credit"]);
  if (c.capsule_id !== args.capsule_id || c.owner_id !== RUNLATCH_TESTNET_TARGET.operator_id || c.policy_schema_version !== 2 || c.status !== "ACTIVE"
    || canonicalReviewContent(policy(c.policy)) !== canonicalReviewContent(args.policy) || c.allocated !== (args.policy as { budget: string }).budget
    || c.spent !== "0" || c.reserved !== "0" || c.committed_future !== "0" || c.returned !== "0" || c.storage_credit !== args.storage_credit
    || c.revoked_at_ns !== null || !Array.isArray(c.request_ids) || c.request_ids.length || c.owner_refund !== null || c.refund_attempts !== 0)
    throw Error("DEMO_RECORD_MISMATCH");
  return { capsule_id: c.capsule_id, owner_id: c.owner_id, policy: c.policy, policy_hash: hash(c.policy_hash), policy_schema_version: c.policy_schema_version,
    status: c.status, allocated: c.allocated, spent: c.spent, reserved: c.reserved, committed_future: c.committed_future, returned: c.returned,
    storage_credit: c.storage_credit, created_at_ns: time(c.created_at_ns), revoked_at_ns: null, request_ids: [] as string[], owner_refund: null,
    refund_attempts: 0 };
}
function quoteRecord(value: unknown, tx: DemoTransaction) {
  if (tx.kind !== "quote") throw Error("DEMO_RECORD_MISMATCH");
  const q = object(value, ["terms", "quote_hash", "consumed", "consumed_by", "published_at_ns"]);
  const terms = object(q.terms, ["input", "publisher_id", "schema_version"]), args = object(tx.args, ["quote"]);
  if (canonicalReviewContent(terms.input) !== canonicalReviewContent(args.quote) || terms.publisher_id !== tx.signer_id || terms.schema_version !== 2
    || q.consumed !== false || q.consumed_by !== null) throw Error("DEMO_RECORD_MISMATCH");
  return { terms: { input: object(terms.input), publisher_id: terms.publisher_id, schema_version: terms.schema_version }, quote_hash: hash(q.quote_hash),
    consumed: false, consumed_by: null, published_at_ns: time(q.published_at_ns) };
}
function projectRecord(value: unknown, funded: boolean) {
  const p = object(value, ["input", "owner_id", "revision", "status", "allocated_authority", "capsule_ids", "created_at_ns", "updated_at_ns"]);
  const input = parseProjectInput(p.input), created = time(p.created_at_ns);
  if (p.owner_id !== RUNLATCH_TESTNET_TARGET.operator_id || p.revision !== "1" || p.status !== "ACTIVE"
    || canonicalReviewContent(input) !== canonicalReviewContent(DEMO_PROJECT_ACTION.args.project) || p.updated_at_ns !== created
    || BigInt(created) >= BigInt(input.expires_at_ns)
    || p.allocated_authority !== (funded ? DEMO_CAPSULE_ACTION.args.policy.budget : "0")
    || canonicalReviewContent(p.capsule_ids) !== canonicalReviewContent(funded ? [DEMO_CAPSULE_ACTION.args.capsule_id] : [])) throw Error("DEMO_PROJECT_CHANGED");
  return { input, owner_id: p.owner_id, revision: p.revision, status: p.status, allocated_authority: p.allocated_authority,
    capsule_ids: p.capsule_ids, created_at_ns: p.created_at_ns, updated_at_ns: p.updated_at_ns };
}
export function demoRpc(transport: ChildTransport) {
  let id = 0, sent = false;
  const deadline = AbortSignal.timeout(60000);
  async function call(method: string, params: unknown) {
    if (++id > 48) throw Error("DEMO_RPC_LIMIT");
    if (deadline.aborted) throw Error("DEMO_RPC_DEADLINE");
    const requestId = `runlatch-demo-${id}`, signal = AbortSignal.any([deadline, AbortSignal.timeout(15000)]);
    const body = JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params });
    if (Buffer.byteLength(body) > 8192) throw Error("DEMO_RPC_LIMIT");
    let response: Response;
    try {
      response = await transport(RUNLATCH_TESTNET_TARGET.rpc_url, { method: "POST", body, headers: { "Content-Type": "application/json" },
        redirect: "error", credentials: "omit", cache: "no-store", signal });
    } catch { throw Error("DEMO_RPC_UNAVAILABLE"); }
    if (!response.ok || !response.body) throw Error("DEMO_RPC_UNAVAILABLE");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    const abort = () => { void reader.cancel().catch(() => undefined); }; signal.addEventListener("abort", abort, { once: true });
    try {
      for (;;) {
        if (signal.aborted) throw Error("DEMO_RPC_UNAVAILABLE");
        const next = await reader.read(); if (next.done) break;
        size += next.value.length; if (size > 65536) throw Error("DEMO_RPC_LIMIT"); chunks.push(next.value);
      }
    } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (signal.aborted) throw Error("DEMO_RPC_UNAVAILABLE");
    const reply = object(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), 65536));
    if (reply.jsonrpc !== "2.0" || reply.id !== requestId || reply.error !== undefined) throw Error("DEMO_RPC_UNAVAILABLE");
    return object(reply.result);
  }
  async function block(hash?: string): Promise<Block> {
    const h = object((await call("block", hash ? { block_id: hash } : { finality: "final" })).header);
    decodeBase58_32(h.hash); const height = count(h.height, Number.MAX_SAFE_INTEGER), timestamp = time(h.timestamp_nanosec);
    if (!height || hash && h.hash !== hash) throw Error("DEMO_BLOCK_MISMATCH");
    return { hash: h.hash as string, height, timestamp_ns: timestamp };
  }
  async function query(accountId: string, request: Record<string, unknown>, b: Block) {
    const r = await call("query", { ...request, account_id: accountId, block_id: b.hash });
    if (r.block_hash !== b.hash || r.block_height !== b.height) throw Error("DEMO_BLOCK_MISMATCH"); return r;
  }
  async function view(method: "get_operator" | "get_schema_version" | "get_network_tag" | "get_storage_requirements" | "get_project"
    | "get_capsule" | "get_provider" | "get_quote", args: Record<string, unknown>, b: Block) {
    const r = await query(gateAccount, { request_type: "call_function", method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64") }, b);
    if (!Array.isArray(r.result) || r.result.length > 8192 || r.result.some(v => !Number.isInteger(v) || v < 0 || v > 255)) throw Error("DEMO_VIEW_INVALID");
    return parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(r.result)), 8192);
  }
  return {
    async state(kind: DemoKind, publicKey: string) {
      const action = demoSetupAction(kind), accountId = action?.signer_id ?? DEMO_AGENT_SCOPE.agent_id;
      const status = await call("status", []);
      if (status.chain_id !== "testnet" || object(status.sync_info).syncing !== false) throw Error("DEMO_TESTNET_REQUIRED");
      const b = await block(); checkedPublicKey(publicKey);
      const [actor, gate] = await Promise.all([query(accountId, { request_type: "view_account" }, b),
        query(gateAccount, { request_type: "view_account" }, b)]);
      if (actor.locked !== "0" || actor.code_hash !== "11111111111111111111111111111111" || gate.code_hash !== deploymentArtifact.code_hash) throw Error("DEMO_ACCOUNT_CHANGED");
      const [list, direct] = await Promise.all([query(accountId, { request_type: "view_access_key_list" }, b),
        query(accountId, { request_type: "view_access_key", public_key: publicKey }, b)]);
      if (!Array.isArray(list.keys) || list.keys.length !== 1) throw Error("DEMO_KEY_CHANGED");
      const row = object(list.keys[0]), key = object(row.access_key);
      if (row.public_key !== publicKey || key.permission !== "FullAccess" || direct.permission !== "FullAccess" || key.nonce !== direct.nonce)
        throw Error("DEMO_KEY_CHANGED");
      const [owner, schema, network, rawStorage] = await Promise.all([view("get_operator", {}, b), view("get_schema_version", {}, b),
        view("get_network_tag", {}, b), view("get_storage_requirements", {}, b)]);
      const storage = object(rawStorage, ["project_credit", "capsule_credit", "provider_credit", "quote_credit", "scope"]);
      if (owner !== RUNLATCH_TESTNET_TARGET.operator_id || schema !== 2 || network !== "testnet"
        || storage.scope !== "CONSERVATIVE_PREPAID_STATE_LIMITS_NOT_MEASURED_GAS"
        || storage.capsule_credit !== DEMO_CAPSULE_ACTION.args.storage_credit || storage.quote_credit !== demoQuoteDeposit) throw Error("DEMO_GATE_CHANGED");
       const [project, provider, capsule, quote] = await Promise.all([view("get_project", { project_id: DEMO_PROJECT_ID }, b),
         view("get_provider", { provider_id: "db_demo_1108" }, b), view("get_capsule", { capsule_id: DEMO_CAPSULE_ACTION.args.capsule_id }, b),
         view("get_quote", { quote_id: DEMO_QUOTE_ACTION.args.quote.quote_id }, b)]);
       if (kind === "project" && project !== null) throw Error("DEMO_PROJECT_ALREADY_EXISTS");
       const checkedProject = kind === "project" ? null : projectRecord(project, kind !== "capsule"), checkedProvider = parseProvider(provider);
      if (checkedProvider.provider_id !== "db_demo_1108" || checkedProvider.publisher_id !== DEMO_QUOTE_ACTION.signer_id
        || checkedProvider.recipient_id !== DEMO_QUOTE_ACTION.args.quote.recipient_id || !checkedProvider.active
        || checkedProvider.quote_count !== (kind === "agent-key" ? 1 : 0)) throw Error("DEMO_PROVIDER_CHANGED");
       if (["project", "capsule"].includes(kind) ? capsule !== null : capsule === null) throw Error("DEMO_CAPSULE_PREREQUISITE");
       if (!["project", "capsule"].includes(kind)) capsuleRecord(capsule, { kind: "capsule", args: DEMO_CAPSULE_ACTION.args });
      if (kind === "agent-key" ? quote === null : quote !== null) throw Error("DEMO_QUOTE_PREREQUISITE");
       if (BigInt(b.timestamp_ns) >= BigInt(checkedProject?.input.expires_at_ns ?? DEMO_PROJECT_ACTION.args.project.expires_at_ns)
         || kind !== "project" && BigInt(b.timestamp_ns) >= BigInt(DEMO_CAPSULE_ACTION.args.policy.expires_at_ns)) throw Error("DEMO_AUTHORITY_EXPIRED");
      if (kind === "agent-key") {
        const checkedQuote = await parseQuote(quote, gateAccount, [checkedProvider]);
        if (canonicalReviewContent(checkedQuote.terms.input) !== canonicalReviewContent(DEMO_QUOTE_ACTION.args.quote)
          || checkedQuote.consumed || BigInt(b.timestamp_ns) >= BigInt(checkedQuote.terms.input.expires_at_ns)) throw Error("DEMO_QUOTE_PREREQUISITE");
      }
      return { block: b, account: { amount: amount(actor.amount), locked: "0", storage_usage: count(actor.storage_usage, Number.MAX_SAFE_INTEGER),
        code_hash: actor.code_hash as string }, nonce: count(key.nonce, Number.MAX_SAFE_INTEGER).toString(),
        access_keys: list, project: checkedProject, provider: checkedProvider, capsule, quote,
        storage: { project_credit: amount(storage.project_credit), capsule_credit: amount(storage.capsule_credit),
          provider_credit: amount(storage.provider_credit), quote_credit: amount(storage.quote_credit) } };
    },
    async fees(b: Block, input: unknown) {
      const tx = parseDemoTransaction(input);
      const [config, gasPrice] = await Promise.all([call("EXPERIMENTAL_protocol_config", { block_id: b.hash }), call("gas_price", [b.hash])]);
      const runtime = object(config.runtime_config), costs = object(runtime.transaction_costs), actions = object(costs.action_creation_config);
      if (count(config.protocol_version, Number.MAX_SAFE_INTEGER) < 88) throw Error("DEMO_PROTOCOL_UNSUPPORTED");
      const addKey = tx.kind === "agent-key" ? object(actions.add_key_cost) : null;
      const entries = tx.kind === "agent-key"
        ? [[costs.action_receipt_creation_config, 1], [addKey!.function_call_cost, 1],
          [addKey!.function_call_cost_per_byte, Buffer.byteLength("submit_purchase")]] as const
        : [[costs.action_receipt_creation_config, 1], [actions.function_call_cost, 1],
          [actions.function_call_cost_per_byte, Buffer.byteLength(tx.method) + Buffer.byteLength(JSON.stringify(tx.args))]] as const;
      let gas = 0n;
      for (const [value, multiplier] of entries) {
        const fee = object(value); for (const field of [tx.signer_id === tx.receiver_id ? "send_sir" : "send_not_sir", "execution"])
          gas += BigInt(count(fee[field], Number.MAX_SAFE_INTEGER)) * BigInt(multiplier);
      }
      const price = amount(gasPrice.gas_price), storagePrice = amount(runtime.storage_amount_per_byte);
      if (price === "0" || BigInt(storagePrice) * 8192n !== BigInt(demoQuoteDeposit)) throw Error("DEMO_STORAGE_REVIEW_REQUIRED");
      const prepaid = tx.kind === "agent-key" ? "0" : demoGas, budget = (gas + BigInt(prepaid)) * BigInt(price);
      if (budget > 30000000000000000000000n) throw Error("DEMO_GAS_REVIEW_REQUIRED");
      return { protocol_version: config.protocol_version, native_action_gas_estimate: gas.toString(), prepaid_gas: prepaid,
        gas_price_yocto: price, gas_budget_at_current_price_yocto: budget.toString(), storage_price_yocto_per_byte: storagePrice };
    },
    async send(input: unknown, bytes: Uint8Array) {
      const encoded = encodeDemoTransaction(input);
      if (sent || bytes.length !== encoded.unsigned_bytes.length + 65 || bytes.length > 8192
        || !Buffer.from(bytes.subarray(0, -65)).equals(Buffer.from(encoded.unsigned_bytes))
        || !Buffer.from(verifyDemoSignature(input, bytes.slice(-64)).signed_bytes).equals(Buffer.from(bytes))) throw Error("DEMO_SEND_REFUSED");
      sent = true; return call("send_tx", { signed_tx_base64: Buffer.from(bytes).toString("base64"), wait_until: "FINAL" });
    },
    transaction(hash: string, sender: string) { decodeBase58_32(hash); return call("tx", { tx_hash: hash, sender_account_id: sender, wait_until: "FINAL" }); },
    async records(kind: string) {
      const status = await call("status", []);
      if (status.chain_id !== "testnet" || object(status.sync_info).syncing !== false) throw Error("DEMO_TESTNET_REQUIRED");
      const b = await block();
      if ((await query(gateAccount, { request_type: "view_account" }, b)).code_hash !== deploymentArtifact.code_hash) throw Error("DEMO_ACCOUNT_CHANGED");
      if (kind === "project") return { block_hash: b.hash, block_height: b.height,
        project: await view("get_project", { project_id: DEMO_PROJECT_ID }, b) };
      if (kind === "capsule") {
        const [capsule, project] = await Promise.all([view("get_capsule", { capsule_id: DEMO_CAPSULE_ACTION.args.capsule_id }, b),
          view("get_project", { project_id: DEMO_PROJECT_ID }, b)]);
        return { block_hash: b.hash, block_height: b.height, capsule, project };
      }
      if (kind === "quote") {
        const [quote, provider] = await Promise.all([view("get_quote", { quote_id: DEMO_QUOTE_ACTION.args.quote.quote_id }, b),
          view("get_provider", { provider_id: "db_demo_1108" }, b)]);
        return { block_hash: b.hash, block_height: b.height, quote, provider };
      }
      if (kind !== "agent-key") throw Error("DEMO_KIND_INVALID");
      const keys = await query(DEMO_AGENT_SCOPE.agent_id, { request_type: "view_access_key_list", limit: 9 }, b);
      if (keys.next_key !== undefined && keys.next_key !== null) throw Error("DEMO_ACCESS_KEY_LIST_INCOMPLETE");
      return { block_hash: b.hash, block_height: b.height, agent_id: DEMO_AGENT_SCOPE.agent_id, access_keys: keys.keys };
    },
    async proof(input: unknown, execution: ReturnType<typeof inspectDemoExecution>) {
      const status = await call("status", []);
      if (status.chain_id !== "testnet" || object(status.sync_info).syncing !== false) throw Error("DEMO_TESTNET_REQUIRED");
      const tx = parseDemoTransaction(input), historic = await block(execution.execution_block_hash);
      const old = await query(gateAccount, { request_type: "view_account" }, historic);
      if (old.code_hash !== deploymentArtifact.code_hash) throw Error("DEMO_EXECUTION_CODE_UNPROVEN");
      const current = await block();
      if (current.height < historic.height) throw Error("DEMO_FINAL_STATE_UNPROVEN");
      const [currentGate, signerKey] = await Promise.all([query(gateAccount, { request_type: "view_account" }, current),
        query(tx.signer_id, { request_type: "view_access_key", public_key: tx.public_key }, current)]);
      if (currentGate.code_hash !== deploymentArtifact.code_hash || signerKey.permission !== "FullAccess"
        || count(signerKey.nonce, Number.MAX_SAFE_INTEGER).toString() !== tx.nonce) throw Error("DEMO_FINAL_STATE_UNPROVEN");
      if (tx.kind !== "agent-key") {
        const keys = await query(tx.signer_id, { request_type: "view_access_key_list", limit: 9 }, current);
        if (keys.next_key !== undefined && keys.next_key !== null || !Array.isArray(keys.keys) || keys.keys.length !== 1) throw Error("DEMO_FINAL_STATE_UNPROVEN");
        const row = object(keys.keys[0]), key = object(row.access_key);
        if (row.public_key !== tx.public_key || key.permission !== "FullAccess" || count(key.nonce, Number.MAX_SAFE_INTEGER).toString() !== tx.nonce)
          throw Error("DEMO_FINAL_STATE_UNPROVEN");
      }
      if (tx.kind === "project") {
        const project = projectRecord(await view("get_project", { project_id: DEMO_PROJECT_ID }, current), false);
        if (canonicalReviewContent(project) !== canonicalReviewContent(execution.project) || project.created_at_ns !== historic.timestamp_ns)
          throw Error("DEMO_FINAL_STATE_UNPROVEN");
        return { status: "DEMO_PROJECT_CREATION_OBSERVED", network: "testnet", contract_id: gateAccount, project,
          block_hash: current.hash, block_height: current.height, execution_block_hash: historic.hash, execution_block_height: historic.height,
          limitation: "RPC-reported FINAL new work-order creation. Ceiling is unfunded authority; no capsule, quote, key or purchase." };
      }
      if (tx.kind === "capsule") {
        const [rawCapsule, rawProject] = await Promise.all([view("get_capsule", { capsule_id: execution.capsule!.capsule_id }, current),
          view("get_project", { project_id: DEMO_PROJECT_ID }, current)]);
        const capsule = capsuleRecord(rawCapsule, tx), project = projectRecord(rawProject, true);
        if (capsule.created_at_ns !== historic.timestamp_ns || canonicalReviewContent(capsule) !== canonicalReviewContent(execution.capsule)) throw Error("DEMO_FINAL_STATE_UNPROVEN");
        return { status: "DEMO_CAPSULE_CREATION_OBSERVED", network: "testnet", contract_id: gateAccount, capsule, project_revision: project.revision,
          project_allocated_yoctoNEAR: project.allocated_authority, block_hash: current.hash, block_height: current.height,
          execution_block_hash: historic.hash, execution_block_height: historic.height,
          limitation: "RPC-reported FINAL capsule creation and current state only. No quote, restricted key, purchase, provisioning, check or acceptance." };
      }
      if (tx.kind === "quote") {
        const [rawQuote, rawProvider] = await Promise.all([view("get_quote", { quote_id: execution.quote!.terms.input.quote_id }, current),
          view("get_provider", { provider_id: "db_demo_1108" }, current)]);
        const quote = quoteRecord(rawQuote, tx), provider = object(rawProvider, ["provider_id", "publisher_id", "recipient_id", "active", "quote_count"]);
        const canonicalQuote = await parseQuote(rawQuote, gateAccount, [parseProvider(rawProvider)]);
        if (canonicalReviewContent(quote) !== canonicalReviewContent(execution.quote) || provider.quote_count !== 1
          || provider.active !== true || canonicalQuote.terms.publisher_id !== tx.signer_id || quote.published_at_ns !== historic.timestamp_ns) throw Error("DEMO_FINAL_STATE_UNPROVEN");
        return { status: "DEMO_QUOTE_PUBLICATION_OBSERVED", network: "testnet", contract_id: gateAccount, quote, provider_quote_count: provider.quote_count,
          block_hash: current.hash, block_height: current.height, execution_block_hash: historic.hash, execution_block_height: historic.height,
          limitation: "RPC-reported FINAL one-use quote publication only. No purchase approval, settlement, provisioning or acceptance." };
      }
      const keys = await query(DEMO_AGENT_SCOPE.agent_id, { request_type: "view_access_key_list", limit: 9 }, current);
      if (keys.next_key !== undefined && keys.next_key !== null) throw Error("DEMO_ACCESS_KEY_LIST_INCOMPLETE");
      const rows = Array.isArray(keys.keys) ? keys.keys.map(v => object(v)) : [];
      if (rows.length !== 2) throw Error("DEMO_FINAL_STATE_UNPROVEN");
      const restricted = rows.find(row => row.public_key === DEMO_AGENT_SCOPE.public_key), recovery = rows.find(row => row.public_key === tx.public_key);
      const access = restricted ? object(restricted.access_key) : null, permission = access ? object(access.permission) : null;
      const functionCall = permission ? object(permission.FunctionCall, ["allowance", "receiver_id", "method_names"]) : null;
      const initializedNonce = initialRegularKeyNonce(historic.height);
      if (!restricted || !access || count(access.nonce, Number.MAX_SAFE_INTEGER).toString() !== initializedNonce || !permission || permission.FullAccess !== undefined || !functionCall
        || functionCall.receiver_id !== gateAccount || functionCall.allowance !== DEMO_AGENT_SCOPE.max_allowance
        || !Array.isArray(functionCall.method_names) || functionCall.method_names.length !== 1 || functionCall.method_names[0] !== "submit_purchase"
        || !recovery) throw Error("DEMO_FINAL_STATE_UNPROVEN");
      const recoveryAccess = object(recovery.access_key);
      if (recoveryAccess.permission !== "FullAccess" || count(recoveryAccess.nonce, Number.MAX_SAFE_INTEGER).toString() !== tx.nonce) throw Error("DEMO_FINAL_STATE_UNPROVEN");
      return { status: "DEMO_AGENT_KEY_INSTALL_OBSERVED", network: "testnet", contract_id: gateAccount, agent_id: DEMO_AGENT_SCOPE.agent_id,
        restricted_public_key: DEMO_AGENT_SCOPE.public_key, initialized_nonce: initializedNonce,
        nonce_basis: "REGULAR_KEY_EXECUTION_HEIGHT_MINUS_ONE_TIMES_1000000", allowance: functionCall.allowance, receiver_id: functionCall.receiver_id,
        method_names: functionCall.method_names, recovery_public_key: tx.public_key, recovery_retained: true,
        block_hash: current.hash, block_height: current.height, execution_block_hash: historic.hash, execution_block_height: historic.height,
        limitation: "RPC-reported FINAL ordinary function-call key and retained recovery key only. No purchase, settlement or provisioning." };
    },
  };
}
export function inspectDemoExecution(input: unknown, hash: string, raw: unknown) {
  const tx = parseDemoTransaction(input), result = object(raw), observed = object(result.transaction); decodeBase58_32(hash);
  if (encodeDemoTransaction(tx).transaction_hash !== hash || result.final_execution_status !== "FINAL" || observed.hash !== hash
    || observed.signer_id !== tx.signer_id || observed.receiver_id !== tx.receiver_id || observed.public_key !== tx.public_key
    || !Number.isSafeInteger(observed.nonce) || String(observed.nonce) !== tx.nonce) throw Error("DEMO_EXECUTION_UNPROVEN");
  if (!Array.isArray(observed.actions) || observed.actions.length !== 1) throw Error("DEMO_ACTION_MISMATCH");
  if (tx.kind === "agent-key") {
    const action = object(object(observed.actions[0], ["AddKey"]).AddKey, ["public_key", "access_key"]);
    const access = object(action.access_key, ["nonce", "permission"]), permission = object(access.permission, ["FunctionCall"]);
    const functionCall = object(permission.FunctionCall, ["allowance", "receiver_id", "method_names"]);
    if (action.public_key !== tx.action.params.publicKey || access.nonce !== 0 || functionCall.receiver_id !== gateAccount
      || functionCall.allowance !== DEMO_AGENT_SCOPE.max_allowance || !Array.isArray(functionCall.method_names)
      || functionCall.method_names.length !== 1 || functionCall.method_names[0] !== "submit_purchase") throw Error("DEMO_ACTION_MISMATCH");
  } else {
    const action = object(object(observed.actions[0], ["FunctionCall"]).FunctionCall, ["method_name", "args", "gas", "deposit"]);
    if (action.method_name !== tx.method || action.args !== Buffer.from(JSON.stringify(tx.args)).toString("base64")
      || action.gas !== Number(demoGas) || action.deposit !== tx.deposit) throw Error("DEMO_ACTION_MISMATCH");
  }
  const value = object(result.status, ["SuccessValue"]).SuccessValue;
  if (tx.kind === "agent-key" && value !== "") throw Error("DEMO_RETURN_INVALID");
  const parsed = tx.kind === "agent-key" ? null : parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(base64(value, 8192)), 8192);
  const capsule = tx.kind === "capsule" ? capsuleRecord(parsed, tx) : null;
  const quote = tx.kind === "quote" ? quoteRecord(parsed, tx) : null;
  const project = tx.kind === "project" ? projectRecord(parsed, false) : null;
  const initial = object(result.transaction_outcome), initialOutcome = object(initial.outcome), rootId = object(initialOutcome.status, ["SuccessReceiptId"]).SuccessReceiptId;
  decodeBase58_32(initial.block_hash); decodeBase58_32(rootId);
  if (initial.id !== hash || initialOutcome.executor_id !== tx.signer_id || !Array.isArray(initialOutcome.receipt_ids)
    || initialOutcome.receipt_ids.length !== 1 || initialOutcome.receipt_ids[0] !== rootId) throw Error("DEMO_GRAPH_UNPROVEN");
  if (!Array.isArray(result.receipts_outcome) || result.receipts_outcome.length < 1 || result.receipts_outcome.length > 3) throw Error("DEMO_GRAPH_UNPROVEN");
  const entries = result.receipts_outcome.map(v => object(v)), byId = new Map(entries.map(v => [v.id, v])), root = byId.get(rootId);
  if (!root || byId.size !== entries.length) throw Error("DEMO_GRAPH_UNPROVEN");
  const rootOutcome = object(root.outcome);
  if (rootOutcome.executor_id !== tx.receiver_id || object(rootOutcome.status, ["SuccessValue"]).SuccessValue !== value
    || !Array.isArray(rootOutcome.receipt_ids) || rootOutcome.receipt_ids.length !== entries.length - 1
    || new Set(rootOutcome.receipt_ids).size !== rootOutcome.receipt_ids.length) throw Error("DEMO_GRAPH_UNPROVEN");
  let gas = 0n, tokens = 0n;
  for (const entry of [initial, ...entries]) {
    decodeBase58_32(entry.id); decodeBase58_32(entry.block_hash); const outcome = object(entry.outcome);
    gas += BigInt(count(outcome.gas_burnt, Number.MAX_SAFE_INTEGER)); tokens += BigInt(amount(outcome.tokens_burnt));
    if (entry !== initial && entry !== root && (!rootOutcome.receipt_ids.includes(entry.id) || outcome.executor_id !== tx.signer_id
      || object(outcome.status, ["SuccessValue"]).SuccessValue !== "" || !Array.isArray(outcome.receipt_ids) || outcome.receipt_ids.length)) throw Error("DEMO_GRAPH_UNPROVEN");
  }
  return { status: "FINAL_DEMO_ACTION_SUCCEEDED" as const, transaction_hash: hash, execution_block_hash: root.block_hash as string,
    receipt_ids: entries.map(v => v.id), gas_burnt: gas.toString(), tokens_burnt_yoctoNEAR: tokens.toString(), capsule, quote, project };
}
