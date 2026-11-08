/** Synthetic RPC envelopes only. No network, keys/signing or public-testnet execution. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestnetReader, assertIssuedAgentNonceReadback } from "../../src/lib/near/testnet-rpc.ts";
import { readSignedAgentNonce, assertIssuedSignedAgentNonce } from "../../scripts/near/read-signed-agent-nonce.ts";
import { encodeUnsignedAgentTransaction } from "../../scripts/near/transaction-codec.ts";
import { encodeBase58_32 } from "../../scripts/near/base58.ts";
import { createLocalSequentialKey } from "../../scripts/near/local-sequential-key.ts";
import { object } from "../../src/lib/near/records.ts";
import { evidenceFixture, evidenceTransport, refs, target } from "../frontend/helpers/testnet-evidence.ts";
import { keyFixture, scope } from "../frontend/helpers/action-review.ts";

async function fixture(state = "SETTLED", version = "2.14.0-rc.5", change?: (method: string, params: Record<string, unknown>, result: unknown) => unknown) {
  const f = await evidenceFixture(state), keys = keyFixture(); keys.key.nonce = 8;
  const tx = encodeUnsignedAgentTransaction({ network: "testnet", signer_id: scope.agent_id, public_key: scope.public_key,
    nonce: "8", receiver_id: target.contract_id, block_hash: encodeBase58_32(new Uint8Array(32).fill(30)), method: "submit_purchase",
    args: { proposal: f.intent.proposal }, gas: f.intent.gas, attached_deposit: "0" });
  const identity = { transaction_hash: tx.transaction_hash, transaction: tx.transaction };
  f.intent = { ...f.intent, transaction_hash: identity.transaction_hash };
  Object.assign(f.raw.transaction, { hash: identity.transaction_hash, nonce: 8 });
  f.raw.transaction_outcome.id = identity.transaction_hash;
  const base = evidenceTransport(f, version), calls: { method: string; params: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, target.rpc_url); assert.equal(options?.method, "POST"); assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error"); assert.equal(options.referrerPolicy, "no-referrer"); assert.equal(options.cache, "no-store");
    const r = JSON.parse(String(options.body)); calls.push(r); let result: unknown;
    if (r.method === "query" && r.params.request_type === "view_access_key") result = { ...keys.key, block_hash: refs.finalBlock, block_height: 30 };
    else if (r.method === "query" && r.params.request_type === "view_access_key_list") result = { keys: keys.keys, block_hash: refs.finalBlock, block_height: 30 };
    else result = (await (await base.transport(url, options)).json()).result;
    const envelope = change?.(r.method, r.params, result) ?? { result };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: r.id, ...envelope as object }), { headers: { "content-type": "application/json" } });
  };
  const transport = { transport: fetcher, calls };
  const reader = createTestnetReader(target, transport.transport);
  return { f, keys, identity, reader, transport, read: (signal?: AbortSignal) => readSignedAgentNonce(reader, identity, scope, signal),
    direct: () => reader.reconcileAgentNonce({ intent: f.intent, scope, nonce: identity.transaction.nonce }) };
}

test("exact signed identity -> shared historical settlement checks -> same-final-block restricted nonce without authority", async () => {
  for (const state of ["SETTLED", "SETTLEMENT_FAILED", "DENIED"]) {
    const r = await fixture(state), before = JSON.stringify(r.f), result = await r.read();
    assert.equal(result.nonce, "8"); assert.equal(result.access.nonce, "8");
    assert.equal(result.payment_evidence, state === "DENIED" ? "NOT_ATTEMPTED" : state);
    assert.equal(result.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE");
    assert.equal(result.signing_enabled, false); assert.equal(result.independently_verified, false); assert.equal(result.grants_payment_authority, false);
    assert.equal(JSON.stringify(r.f), before); assert.ok(!("financials" in result)); assert.ok(!("final_record" in result));
    assert.doesNotThrow(() => assertIssuedSignedAgentNonce(result));
    assert.throws(() => assertIssuedSignedAgentNonce({ ...result }), /UNISSUED_SIGNED_AGENT_NONCE/u);
    assert.equal(r.transport.calls.filter(c => c.method.endsWith("tx_status")).length, 1);
    const reads = r.transport.calls.filter(c => c.params.request_type === "view_access_key" || c.params.request_type === "view_access_key_list");
    assert.equal(reads.length, 2);
    assert.ok(reads.every(c => c.params.block_id === result.block.hash && c.params.account_id === scope.agent_id));
    assert.equal(reads[1].params.limit, 9);
    assert.ok(r.transport.calls.length <= 40); assert.ok(r.transport.calls.every(c => ["status", "query", "block", "tx_status"].includes(c.method)));
    const historical = r.transport.calls.filter(c => c.params.request_type === "view_account" && c.params.block_id !== refs.finalBlock);
    assert.equal(historical.length, state === "DENIED" ? 1 : 2);
  }
});

test("older receipt API uses one EXPERIMENTAL lookup, never fallback/retry or ordinary tx-only evidence", async () => {
  const r = await fixture("SETTLED", "2.13.1"), result = await r.read();
  assert.equal(result.payment_evidence, "SETTLED");
  assert.equal(r.transport.calls.filter(c => c.method === "EXPERIMENTAL_tx_status").length, 1);
  assert.ok(!r.transport.calls.some(c => c.method === "tx_status" || c.method === "tx"));
});

test("pending, approval-pending, inclusion-only, missing receipt and failed callback stop before key reads", async () => {
  for (const state of ["SETTLEMENT_PENDING", "APPROVAL_PENDING"]) {
    const r = await fixture(state); await assert.rejects(r.read(), /PRIOR_PURCHASE_UNRESOLVED/u);
    assert.ok(!r.transport.calls.some(c => c.params.request_type === "view_access_key"));
  }
  const included = await fixture(); included.f.raw.final_execution_status = "INCLUDED_FINAL";
  await assert.rejects(included.read(), /PRIOR_TRANSACTION_NOT_FINAL/u);
  const missing = await fixture(); missing.f.raw.receipts.pop();
  await assert.rejects(missing.read(), /PRIOR_PURCHASE_UNRESOLVED/u);
});

test("UNKNOWN_TRANSACTION/method unavailable/HTTP faults remain failures, never retries, code or authority", async () => {
  for (const error of [{ code: -32000, cause: { name: "UNKNOWN_TRANSACTION" } }, { code: -32601 }]) {
    const r = await fixture("SETTLED", "2.14.0", (method) => method === "tx_status" ? { error } : undefined);
    await assert.rejects(r.read(), /PRIOR_TRANSACTION_NOT_FINAL/u);
    assert.equal(r.transport.calls.filter(c => c.method.endsWith("tx_status")).length, 1);
    assert.ok(!r.transport.calls.some(c => c.params.request_type === "view_access_key"));
  }
  const r = await fixture(), reader = createTestnetReader(target, async () => { throw new Error("PRIVATE_CANARY"); });
  await assert.rejects(readSignedAgentNonce(reader, r.identity, scope), /^Error: PRIOR_TRANSACTION_NOT_FINAL$/u);
});

test("higher/lower/fractional/missing/unsafe/string nonce observations never advance or repair the exact identity", async () => {
  for (const nonce of [7, 9, 9007199254740992, -1, 8.5, undefined, "8"]) {
    const tx = await fixture(); Object.assign(tx.f.raw.transaction, { nonce });
    await assert.rejects(tx.read(), /PRIOR_TRANSACTION_NONCE_MISMATCH|INVALID_CONTRACT_COUNT/u);
    assert.ok(!tx.transport.calls.some(c => c.params.request_type === "view_access_key"));
    const key = await fixture(); Object.assign(key.keys.key, { nonce });
    await assert.rejects(key.read(), /FINALIZED_KEY_NONCE_DIVERGED|INVALID_CONTRACT_COUNT/u);
  }
});

test("wrong/missing recovery, broader permission, gas lane, zero/excess allowance and mixed key envelopes fail closed", async () => {
  const changes = [
    (r: Awaited<ReturnType<typeof fixture>>) => { r.keys.keys.pop(); },
    (r: Awaited<ReturnType<typeof fixture>>) => { r.keys.key.permission.FunctionCall.method_names.push("pay"); },
    (r: Awaited<ReturnType<typeof fixture>>) => { r.keys.key.permission.FunctionCall.receiver_id = "other.testnet"; },
    (r: Awaited<ReturnType<typeof fixture>>) => { r.keys.key.permission.FunctionCall.allowance = "0"; },
    (r: Awaited<ReturnType<typeof fixture>>) => { r.keys.key.permission.FunctionCall.allowance = (BigInt(scope.max_allowance) + 1n).toString(); },
    (r: Awaited<ReturnType<typeof fixture>>) => { Object.assign(r.keys.key, { permission: "FullAccess" }); },
    (r: Awaited<ReturnType<typeof fixture>>) => { Object.assign(r.keys.key, { permission: { GasKey: {} } }); },
  ];
  for (const change of changes) { const r = await fixture(); change(r); await assert.rejects(r.read()); }
  for (const patch of [{ block_hash: refs.initialBlock }, { block_height: 29 }, { next_key: scope.public_key }]) {
    const r = await fixture("SETTLED", "2.14.0", (method, params, result) => method === "query" && params.request_type === "view_access_key_list"
      ? { result: { ...object(result), ...patch } } : undefined);
    await assert.rejects(r.read(), /MIXED_TESTNET_BLOCKS|AGENT_ACCESS_KEY_LIST_INCOMPLETE/u);
  }
});

test("historical code mismatch, altered canonical transfer/callback/args and stale ledger remain observer failures", async () => {
  const code = await fixture("SETTLED", "2.14.0", (method, params, result) => method === "query" && params.request_type === "view_account"
    && params.block_id === refs.callbackBlock ? { result: { ...object(result), code_hash: refs.initialBlock } } : undefined);
  await assert.rejects(code.read(), /EXECUTION_CODE_HASH_MISMATCH/u);
  const amount = await fixture(); object(object(amount.f.raw.receipts[1].receipt.Action.actions[0]).Transfer).deposit = "51";
  await assert.rejects(amount.read(), /TRANSFER_CANONICAL_BINDING_MISMATCH/u);
  const callback = await fixture(); callback.f.raw.receipts[2].receipt.Action.input_data_ids = [refs.initial];
  await assert.rejects(callback.read(), /CALLBACK_DEPENDENCY_MISMATCH/u);
  const args = await fixture(); object(object(args.f.raw.transaction.actions[0]).FunctionCall).deposit = "1";
  await assert.rejects(args.read(), /TRANSACTION_ACTION_MISMATCH/u);
});

test("identity hash, target, agent and request configuration rejected before any reads; getters never execute", async () => {
  const r = await fixture();
  await assert.rejects(readSignedAgentNonce(r.reader, { ...r.identity, transaction_hash: refs.tx }, scope), /IDENTITY_HASH_MISMATCH/u);
  await assert.rejects(readSignedAgentNonce(r.reader, r.identity, { ...scope, agent_id: "other.testnet" }), /RECONCILIATION_SCOPE_MISMATCH/u);
  const other = createTestnetReader({ ...target, contract_id: "other.testnet" }, r.transport.transport);
  await assert.rejects(readSignedAgentNonce(other, r.identity, scope), /RECONCILIATION_SCOPE_MISMATCH/u);
  let invoked = false;
  await assert.rejects(readSignedAgentNonce(r.reader, { get transaction() { invoked = true; return {}; }, transaction_hash: refs.tx }, scope));
  await assert.rejects(r.reader.reconcileAgentNonce({ intent: r.f.intent, scope, nonce: "8", secret: "PRIVATE_CANARY" }));
  await assert.rejects(r.reader.reconcileAgentNonce({ intent: r.f.intent, scope, nonce: "9007199254740992" }), /RECONCILIATION_NONCE_UNREADABLE/u);
  assert.equal(invoked, false); assert.equal(r.transport.calls.length, 0);
});

test("issued reader provenance is process-only; cloned or wrong but genuine readback cannot become signed-identity evidence", async () => {
  const r = await fixture(), direct = await r.direct();
  assert.doesNotThrow(() => assertIssuedAgentNonceReadback(direct));
  assert.throws(() => assertIssuedAgentNonceReadback({ ...direct }), /UNISSUED_AGENT_NONCE_READBACK/u);
  await assert.rejects(readSignedAgentNonce({ ...r.reader, reconcileAgentNonce: async () => ({ ...direct }) }, r.identity, scope), /UNISSUED_AGENT_NONCE_READBACK/u);
  const different = await fixture("DENIED");
  const tx = encodeUnsignedAgentTransaction({ ...different.identity.transaction, nonce: "9" });
  different.identity = { transaction: tx.transaction, transaction_hash: tx.transaction_hash };
  Object.assign(different.f.raw.transaction, { nonce: 9, hash: tx.transaction_hash }); different.f.raw.transaction_outcome.id = tx.transaction_hash;
  different.f.intent = { ...different.f.intent, transaction_hash: tx.transaction_hash }; different.keys.key.nonce = 9;
  const genuineOther = await different.reader.reconcileAgentNonce({ intent: different.f.intent, scope, nonce: "9" });
  await assert.rejects(readSignedAgentNonce({ ...r.reader, reconcileAgentNonce: async () => genuineOther }, r.identity, scope), /RECONCILIATION_READBACK_IDENTITY_MISMATCH/u);
});

test("cancelled operation cannot issue a token even if injected final response ignores cancellation", async () => {
  const cancel = new AbortController(), r = await fixture("SETTLED", "2.14.0", (method, params) => {
    if (method === "query" && params.request_type === "view_access_key_list") cancel.abort();
    return undefined;
  });
  await assert.rejects(r.read(cancel.signal), /TESTNET_READ_CANCELLED/u);
  const pre = new AbortController(); pre.abort(); const none = await fixture();
  await assert.rejects(none.read(pre.signal), /PRIOR_TRANSACTION_NOT_FINAL/u);
  assert.equal(none.transport.calls.length, 0);
});

test("rolled-back initiator stays no-payment/no-surviving-denial and reveals no provider failure content", async () => {
  const r = await fixture("DENIED"); r.f.raw.receipts_outcome[0].outcome.status = { Failure: { private: "PRIVATE_CANARY" } };
  r.f.raw.status = { Failure: { private: "PRIVATE_CANARY" } }; r.f.snapshot.purchases = [];
  r.f.snapshot.capsule.request_ids = []; r.f.snapshot.provisioning = [];
  const result = await r.read();
  assert.equal(result.record_source, "TRANSACTION_EXECUTION_FAILURE"); assert.equal(result.actual_decision, null);
  assert.equal(result.payment_evidence, "NOT_ATTEMPTED"); assert.ok(!JSON.stringify(result).includes("CANARY"));
});

test("readbacks cannot unlock the unchanged LOCAL sequential coordinator or perform any journal/money write", async () => {
  const r = await fixture(), result = await r.read();
  const coordinator = await createLocalSequentialKey(`nonce-read-only-${crypto.randomUUID().slice(0, 8)}`);
  // Local coordinator still accepts only its separately issued local-only evidence, not HTTP tokens.
  // @ts-expect-error Intentionally exercise refusal of a differently issued read-only token.
  assert.throws(() => coordinator.forRun(result), /UNISSUED_NONCE_RECONCILIATION/u);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.identity.transaction));
  assert.ok(!("release" in result)); assert.ok(!("signed_bytes" in result)); assert.ok(!("human_acceptance" in result));
});
