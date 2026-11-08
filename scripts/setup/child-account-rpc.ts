/** Fixed credential-free testnet bootstrap reads and one-send. No retries or arbitrary RPC input. */
import { amount, object, parseBoundedJson } from "../../src/lib/near/records.ts";
import { decodeBase58_32 } from "../near/base58.ts";
import { childAccounts, encodeChildTransaction, parentAccount, type ChildTransaction } from "./child-account-codec.ts";

export type ChildTransport = (url: string, input: RequestInit) => Promise<Response>;
const rpcUrl = "https://rpc.testnet.near.org/";
export function childRpc(transport: ChildTransport) {
  let id = 0;
  async function call(method: string, params: unknown) {
    const signal = AbortSignal.timeout(20_000), requestId = `runlatch-child-${++id}`;
    const response = await transport(rpcUrl, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      headers: { "Content-Type": "application/json" }, redirect: "error", credentials: "omit", cache: "no-store", signal });
    if (!response.ok) throw Error("CHILD_RPC_UNAVAILABLE");
    const reader = response.body?.getReader(); if (!reader) throw Error("CHILD_RPC_UNAVAILABLE");
    const abort = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener("abort", abort, { once: true });
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        if (signal.aborted) throw Error("CHILD_RPC_UNAVAILABLE");
        const next = await reader.read(); if (next.done) break;
        size += next.value.length; if (size > 1_048_576) throw Error("CHILD_RPC_LIMIT"); chunks.push(next.value);
      }
    } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    if (signal.aborted) throw Error("CHILD_RPC_UNAVAILABLE");
    const result = object(parseBoundedJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
    if (result.jsonrpc !== "2.0" || result.id !== requestId) throw Error("CHILD_RPC_ID_MISMATCH");
    return result;
  }
  async function result(method: string, params: unknown) {
    const reply = await call(method, params);
    if (reply.error !== undefined) throw Error("CHILD_RPC_UNAVAILABLE"); return object(reply.result);
  }
  async function account(accountId: string, blockHash: string) {
    const reply = await call("query", { request_type: "view_account", account_id: accountId, block_id: blockHash });
    if (reply.error !== undefined) {
      const error = object(reply.error);
      if (error.cause !== undefined && object(error.cause).name === "UNKNOWN_ACCOUNT") return null;
      throw Error("CHILD_ACCOUNT_UNAVAILABLE");
    }
    const data = object(reply.result); if (data.block_hash !== blockHash) throw Error("CHILD_BLOCK_MISMATCH");
    amount(data.amount); amount(data.locked);
    if (!Number.isSafeInteger(data.storage_usage) || (data.storage_usage as number) < 0) throw Error("CHILD_ACCOUNT_UNAVAILABLE");
    return data;
  }
  async function keyList(accountId: string, blockHash: string, publicKey: string) {
    const reply = await result("query", { request_type: "view_access_key_list", account_id: accountId, block_id: blockHash });
    if (reply.block_hash !== blockHash || !Array.isArray(reply.keys) || reply.keys.length !== 1) throw Error("CHILD_KEYS_MISMATCH");
    const key = object(reply.keys[0]), access = object(key.access_key);
    if (key.public_key !== publicKey || access.permission !== "FullAccess" || !Number.isSafeInteger(access.nonce) || (access.nonce as number) < 0) throw Error("CHILD_KEYS_MISMATCH");
    return String(access.nonce);
  }
  return {
    async state(operatorKey: string) {
      const status = await result("status", []);
      if (status.chain_id !== "testnet" || object(status.sync_info).syncing !== false) throw Error("CHILD_TESTNET_REQUIRED");
      const header = object((await result("block", { finality: "final" })).header);
      decodeBase58_32(header.hash);
      if (!Number.isSafeInteger(header.height) || (header.height as number) < 1) throw Error("CHILD_BLOCK_MISMATCH");
      const blockHash = header.hash as string, owner = await account(parentAccount, blockHash);
      if (!owner) throw Error("CHILD_PARENT_UNAVAILABLE");
      const nonce = await keyList(parentAccount, blockHash, operatorKey);
      const accounts = [];
      for (const child of childAccounts) accounts.push({ ...child, account: await account(child.account_id, blockHash) });
      return { block_hash: blockHash, block_height: header.height as number, owner, nonce, accounts };
    },
    async fees(blockHash: string) {
      const config = await result("EXPERIMENTAL_protocol_config", { block_id: blockHash });
      const runtime = object(config.runtime_config), costs = object(runtime.transaction_costs), actions = object(costs.action_creation_config);
      let gas = 0n;
      for (const value of [costs.action_receipt_creation_config, actions.create_account_cost, actions.transfer_cost, object(actions.add_key_cost).full_access_cost]) {
        const fee = object(value);
        for (const field of ["send_not_sir", "execution"]) {
          if (!Number.isSafeInteger(fee[field]) || (fee[field] as number) < 0) throw Error("CHILD_FEE_INVALID");
          gas += BigInt(fee[field] as number);
        }
      }
      const price = amount((await result("gas_price", [blockHash])).gas_price);
      const estimate = gas * BigInt(price);
      if (estimate > 10_000_000_000_000_000_000_000n) throw Error("CHILD_FEE_REVIEW_REQUIRED");
      return { protocol_version: config.protocol_version, gas_units_estimate: gas.toString(), gas_price_yocto: price,
        per_transaction_fee_estimate_yocto: estimate.toString(), storage_price_yocto_per_byte: amount(runtime.storage_amount_per_byte),
        limitation: "Current native-action send+execution estimate, not a hard fee cap. No FunctionCall prepaid-gas field. Final outcomes report actual gas/tokens burnt." };
    },
    async send(bytes: Uint8Array) {
      // One send only. FINAL includes action and refund receipts; errors/timeout retain the prepared identity.
      return result("send_tx", { signed_tx_base64: Buffer.from(bytes).toString("base64"), wait_until: "FINAL" });
    },
    async transaction(hash: string) {
      decodeBase58_32(hash);
      return result("tx", { tx_hash: hash, sender_account_id: parentAccount, wait_until: "FINAL" });
    },
    async childProof(tx: ChildTransaction, minimumHeight: number) {
      const state = await this.state(tx.public_key);
      if (state.block_height < minimumHeight || state.nonce !== tx.nonce) throw Error("CHILD_NONCE_NOT_RECONCILED");
      const child = state.accounts.find(value => value.account_id === tx.receiver_id)?.account;
      if (!child || child.amount !== tx.amount || child.locked !== "0"
        || child.code_hash !== "11111111111111111111111111111111") throw Error("CHILD_BALANCE_UNPROVEN");
      await keyList(tx.receiver_id, state.block_hash, tx.child_public_key);
      return { status: "CHILD_ACCOUNT_OBSERVED", account_id: tx.receiver_id, public_key: tx.child_public_key,
        balance_yoctoNEAR: tx.amount, block_hash: state.block_hash, block_height: state.block_height };
    },
  };
}
export function inspectChildExecution(input: unknown, raw: unknown) {
  const encoded = encodeChildTransaction(input), tx = encoded.transaction, result = object(raw), observed = object(result.transaction);
  if (result.final_execution_status !== "FINAL" || observed.hash !== encoded.transaction_hash
    || observed.signer_id !== tx.signer_id || observed.receiver_id !== tx.receiver_id || observed.public_key !== tx.public_key
    || !Number.isSafeInteger(observed.nonce) || String(observed.nonce) !== tx.nonce) throw Error("CHILD_EXECUTION_UNPROVEN");
  if (!Array.isArray(observed.actions) || observed.actions.length !== 3 || observed.actions[0] !== "CreateAccount") throw Error("CHILD_ACTION_MISMATCH");
  if (object(object(observed.actions[1], ["Transfer"]).Transfer, ["deposit"]).deposit !== tx.amount) throw Error("CHILD_ACTION_MISMATCH");
  const add = object(object(observed.actions[2], ["AddKey"]).AddKey, ["public_key", "access_key"]), access = object(add.access_key, ["nonce", "permission"]);
  if (add.public_key !== tx.child_public_key || access.nonce !== 0 || access.permission !== "FullAccess") throw Error("CHILD_ACTION_MISMATCH");
  const summary = object(result.status, ["SuccessValue"]);
  if (summary.SuccessValue !== "") throw Error("CHILD_EXECUTION_FAILED_OR_UNKNOWN");
  const initial = object(result.transaction_outcome), initialOutcome = object(initial.outcome);
  if (initial.id !== encoded.transaction_hash || initialOutcome.executor_id !== parentAccount) throw Error("CHILD_EXECUTION_UNPROVEN");
  const rootId = object(initialOutcome.status, ["SuccessReceiptId"]).SuccessReceiptId;
  decodeBase58_32(initial.block_hash); decodeBase58_32(rootId);
  if (!Array.isArray(initialOutcome.receipt_ids) || initialOutcome.receipt_ids.length !== 1
    || initialOutcome.receipt_ids[0] !== rootId) throw Error("CHILD_RECEIPTS_UNPROVEN");
  if (!Array.isArray(result.receipts_outcome) || result.receipts_outcome.length < 1 || result.receipts_outcome.length > 16) throw Error("CHILD_RECEIPTS_UNPROVEN");
  const entries = result.receipts_outcome.map(value => object(value)), byId = new Map(entries.map(entry => [entry.id, entry]));
  if (byId.size !== entries.length || !byId.has(rootId)) throw Error("CHILD_RECEIPTS_UNPROVEN");
  const reached = new Set<unknown>(), pending: unknown[] = [rootId];
  while (pending.length) {
    const id = pending.pop(); if (reached.has(id)) throw Error("CHILD_RECEIPTS_UNPROVEN"); reached.add(id);
    const entry = byId.get(id); if (!entry) throw Error("CHILD_RECEIPTS_UNPROVEN");
    decodeBase58_32(entry.id); decodeBase58_32(entry.block_hash);
    const outcome = object(entry.outcome), status = object(outcome.status);
    // Only native creation/key/transfer/refund receipts exist in this scope; no promise-returning contract.
    if (Object.keys(status).length !== 1 || status.SuccessValue !== ""
      || ![tx.signer_id, tx.receiver_id].includes(outcome.executor_id as string)) throw Error("CHILD_EXECUTION_FAILED_OR_UNKNOWN");
    if (!Array.isArray(outcome.receipt_ids) || outcome.receipt_ids.length > 16) throw Error("CHILD_RECEIPTS_UNPROVEN");
    pending.push(...outcome.receipt_ids);
  }
  if (reached.size !== entries.length || object(byId.get(rootId)?.outcome).executor_id !== tx.receiver_id
    || object(object(byId.get(rootId)?.outcome).status).SuccessValue !== "") throw Error("CHILD_RECEIPTS_UNPROVEN");
  return { transaction_hash: encoded.transaction_hash, status: "FINAL_CHILD_ACTIONS_SUCCEEDED", receipt_ids: entries.map(entry => entry.id) };
}
