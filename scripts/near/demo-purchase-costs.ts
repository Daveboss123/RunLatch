/** Fixed read-only account/permission/fee preflight for the approved database call. No generic RPC or signer. */
import { amount, count, object, parseBoundedJson } from "../../src/lib/near/records.ts";
import { canonicalReviewContent as canonical } from "../../src/lib/near/review-content.ts";
import type { PurchaseReview } from "../../src/lib/near/action-review.ts";
import { DEMO_PURCHASE_SCOPE, DEMO_PURCHASE_TARGET, assertDemoPurchaseReview } from "./demo-purchase-scope.ts";

export async function readDemoPurchaseCosts(review: PurchaseReview, transport: typeof fetch = fetch) {
  assertDemoPurchaseReview(review); let id = 0;
  const deadline = AbortSignal.timeout(30_000);
  async function rpc(method: "query" | "gas_price" | "EXPERIMENTAL_protocol_config", params: unknown) {
    if (++id > 4 || deadline.aborted) throw Error("DB_COST_RPC_LIMIT_OR_DEADLINE");
    const requestId = `runlatch-db-cost-${id}`, signal = AbortSignal.any([deadline, AbortSignal.timeout(15_000)]);
    let response: Response;
    try { response = await transport(DEMO_PURCHASE_TARGET.rpc_url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }), signal,
      credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" }); }
    catch { throw Error("DB_COST_RPC_UNAVAILABLE"); }
    if (!response.ok || !response.body || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") throw Error("DB_COST_RPC_HTTP_OR_EMPTY");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    const abort = () => { void reader.cancel().catch(() => undefined); }; signal.addEventListener("abort", abort, { once: true });
    try { for (;;) { if (signal.aborted) throw Error("DB_COST_RPC_TIMEOUT"); const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > 65536) throw Error("DB_COST_RPC_RESPONSE_LIMIT"); chunks.push(part.value); }
    } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (signal.aborted) throw Error("DB_COST_RPC_TIMEOUT");
    const envelope = object(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), 65536));
    if (envelope.jsonrpc !== "2.0" || envelope.id !== requestId || envelope.error !== undefined) throw Error("DB_COST_RPC_ENVELOPE");
    return object(envelope.result);
  }
  const block = review.reviewed_block;
  async function query(request: Record<string, unknown>) {
    const result = await rpc("query", { ...request, account_id: DEMO_PURCHASE_SCOPE.agent_id, block_id: block.hash });
    if (result.block_hash !== block.hash || result.block_height !== block.height) throw Error("DB_COST_MIXED_BLOCKS"); return result;
  }
  const [state, keys, config, gasPrice] = await Promise.all([query({ request_type: "view_account" }),
    query({ request_type: "view_access_key_list", limit: 9 }), rpc("EXPERIMENTAL_protocol_config", { block_id: block.hash }), rpc("gas_price", [block.hash])]);
  if (state.locked !== "0" || state.code_hash !== "11111111111111111111111111111111"
    || keys.next_key !== undefined && keys.next_key !== null || !Array.isArray(keys.keys) || keys.keys.length !== 2) throw Error("DB_COST_AGENT_ACCOUNT_CHANGED");
  const rows = keys.keys.map(v => object(v)), recovery = rows.find(r => r.public_key === DEMO_PURCHASE_SCOPE.recovery_public_key),
    agent = rows.find(r => r.public_key === DEMO_PURCHASE_SCOPE.public_key);
  if (!recovery || object(recovery.access_key).permission !== "FullAccess" || !agent) throw Error("DB_COST_RECOVERY_OR_KEY_MISSING");
  const key = object(agent.access_key), permission = object(key.permission);
  if (count(key.nonce, Number.MAX_SAFE_INTEGER).toString() !== review.access!.nonce || canonical(permission) !== canonical({ FunctionCall: {
    allowance: DEMO_PURCHASE_SCOPE.max_allowance, receiver_id: DEMO_PURCHASE_TARGET.contract_id, method_names: ["submit_purchase"] } })) throw Error("DB_COST_KEY_PERMISSION_CHANGED");
  const runtime = object(config.runtime_config), costs = object(runtime.transaction_costs), actions = object(costs.action_creation_config);
  if (config.chain_id !== "testnet" || count(config.protocol_version, Number.MAX_SAFE_INTEGER) < 88) throw Error("DB_COST_PROTOCOL_UNSUPPORTED");
  let nativeGas = 0n;
  for (const [value, multiplier] of [[costs.action_receipt_creation_config, 1], [actions.function_call_cost, 1],
    [actions.function_call_cost_per_byte, Buffer.byteLength("submit_purchase") + Buffer.byteLength(canonical(review.call.args))]] as const) {
    const fee = object(value); nativeGas += (BigInt(count(fee.send_not_sir, Number.MAX_SAFE_INTEGER)) + BigInt(count(fee.execution, Number.MAX_SAFE_INTEGER))) * BigInt(multiplier);
  }
  const gasPriceYocto = amount(gasPrice.gas_price), storagePrice = amount(runtime.storage_amount_per_byte), balance = amount(state.amount),
    storage = count(state.storage_usage, 1_000_000), gasBudget = (nativeGas + BigInt(review.call.gas)) * BigInt(gasPriceYocto), cushion = 30_000_000_000_000_000_000_000n;
  if (gasPriceYocto === "0" || storagePrice === "0" || gasBudget > BigInt(review.access!.allowance)
    || BigInt(balance) < BigInt(storage) * BigInt(storagePrice) + gasBudget + cushion) throw Error("DB_COST_GAS_ALLOWANCE_OR_BALANCE_INSUFFICIENT");
  return Object.freeze({ account_balance_yoctoNEAR: balance, storage_usage_bytes: storage, storage_price_yocto_per_byte: storagePrice,
    gas_price_yocto: gasPriceYocto, native_action_gas_estimate: nativeGas.toString(), prepaid_gas: review.call.gas,
    gas_budget_at_current_price_yocto: gasBudget.toString(), balance_margin_yoctoNEAR: cushion.toString(),
    attached_deposit: "0", protocol_version: config.protocol_version,
    limitation: "Current-price gas/account collateral preflight only; gas allowance is not the Capsule purchase budget or a fee guarantee." });
}
