import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { inspectOwnerReturnEvidence, parseOwnerReturnIntent } from "../../src/lib/near/owner-return-evidence.ts";
import { object } from "../../src/lib/near/records.ts";
import { ownerReturnFixture } from "./helpers/owner-return.ts";
import { refs, target } from "./helpers/testnet-evidence.ts";

for (const state of ["RETURNED", "FAILED", "PENDING", "NONE"] as const) test(`owner return ${state}: native outcome, callback and ledger stay separate`, async () => {
  const f = await ownerReturnFixture(state), result = inspectOwnerReturnEvidence(f.intent, f.raw, f.context);
  assert.equal(result.owner_return_evidence, state === "FAILED" ? "RETURN_FAILED" : state === "PENDING" ? "RETURN_UNVERIFIED" : state === "NONE" ? "NOT_ATTEMPTED" : "RETURNED");
  assert.equal(result.grants_payment_authority, false); assert.ok(!JSON.stringify(result).includes("PRIVATE_CANARY"));
  const rpc = f.transport(), observed = await createTestnetReader(target, rpc.transport).observeOwnerReturn(f.intent);
  assert.equal(observed.owner_return_evidence, result.owner_return_evidence);
  assert.equal(rpc.calls.filter(c => c.method === "tx_status").length, 1);
  assert.ok(rpc.calls.every(c => ["status", "block", "query", "tx_status"].includes(c.method)));
});

test("owner return malformed identities/amounts/attempts, mismatch and public callbacks never grant a return", async () => {
  const f = await ownerReturnFixture();
  for (const v of [{ ...f.intent, expected_attempt: 0 }, { ...f.intent, gas: 10 }, { ...f.intent, expected_attempt: "1" }, { ...f.intent, amount: "1" }]) assert.throws(() => parseOwnerReturnIntent(v));
  assert.throws(() => inspectOwnerReturnEvidence({ ...f.intent, sender_id: "other.testnet" }, f.raw, f.context), /IDENTITY/u);
  assert.throws(() => inspectOwnerReturnEvidence({ ...f.intent, expected_attempt: 2 }, f.raw, f.context), /SCOPE/u);
});

test("tampered native recipient, value, dependency, callback and graphs fail closed", async () => {
  const mutations = [
    (raw: Record<string, unknown>) => { object((raw.receipts as unknown[])[1]).receiver_id = "other.testnet"; },
    (raw: Record<string, unknown>) => { object(object(object((raw.receipts as unknown[])[1]).receipt).Action).actions = [{ Transfer: { deposit: "249" } }]; },
    (raw: Record<string, unknown>) => { object(object(object((raw.receipts as unknown[])[2]).receipt).Action).input_data_ids = ["B".repeat(32)]; },
    (raw: Record<string, unknown>) => { object(object(object((raw.receipts as unknown[])[2]).receipt).Action).actions = [{ FunctionCall: { method_name: "resolve_purchase", gas: 25000000000000, deposit: "0", args: "e30=" } }]; },
    (raw: Record<string, unknown>) => { (raw.receipts as unknown[]).push((raw.receipts as unknown[])[1]); },
    (raw: Record<string, unknown>) => { object(object((raw.receipts_outcome as unknown[])[1]).outcome).receipt_ids = [refs.initial]; },
  ];
  for (const mutate of mutations) { const f = await ownerReturnFixture(), raw = structuredClone(f.raw); mutate(raw); assert.throws(() => inspectOwnerReturnEvidence(f.intent, raw, f.context)); }
});

test("missing/nonfinal/callback-failed evidence is never returned money or a release", async () => {
  const f = await ownerReturnFixture();
  assert.equal(inspectOwnerReturnEvidence(f.intent, { ...f.raw, receipts: f.raw.receipts.slice(0, 2) }, f.context).owner_return_evidence, "RETURN_UNVERIFIED");
  assert.equal(inspectOwnerReturnEvidence(f.intent, { ...f.raw, final_execution_status: "INCLUDED" }, f.context).submission, "NOT_FINAL");
  const pending = await ownerReturnFixture("PENDING"); object(pending.context.capsule).reserved = "0";
  assert.throws(() => inspectOwnerReturnEvidence(pending.intent, pending.raw, pending.context), /UNPROVEN_RELEASE/u);
});

test("historical code replacement, unknown RPC and mixed-final-block reads cannot confirm owner return", async () => {
  const f = await ownerReturnFixture();
  const badCode = f.transport(); const wrapper: typeof fetch = async (url, options) => {
    const response = await badCode.transport(url, options), json = await response.json(), request = JSON.parse(String(options?.body));
    if (request.params.request_type === "view_account" && request.params.block_id === refs.callbackBlock) json.result.code_hash = "B".repeat(32);
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  };
  await assert.rejects(createTestnetReader(target, wrapper).observeOwnerReturn(f.intent), /CODE_HASH/u);
  const unavailable: typeof fetch = async (url, options) => {
    const request = JSON.parse(String(options?.body)); if (request.method === "tx_status") return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { cause: { name: "UNKNOWN_TRANSACTION" } } }), { headers: { "content-type": "application/json" } });
    return f.transport().transport(url, options);
  };
  assert.equal((await createTestnetReader(target, unavailable).observeOwnerReturn(f.intent)).owner_return_evidence, "RETURN_UNVERIFIED");
});

test("large owner amounts remain exact strings; system gas refunds are not purchase-funding returns", async () => {
  const value = "90071992547409930000000000000", big = await ownerReturnFixture("RETURNED", value);
  object(object(big.context.capsule).policy).budget = (BigInt(value) + 50n).toString();
  assert.equal(inspectOwnerReturnEvidence(big.intent, big.raw, big.context).amount, value);
  const f = await ownerReturnFixture(), gasId = "C".repeat(32), gas = structuredClone(f.raw.receipts[1]);
  gas.receipt_id = gasId; gas.predecessor_id = "system"; gas.receipt.Action.actions = [{ Transfer: { deposit: "7" } }]; gas.receipt.Action.output_data_receivers = [];
  f.raw.receipts.push(gas); f.raw.receipts_outcome[0].outcome.receipt_ids.push(gasId);
  f.raw.receipts_outcome.push({ id: gasId, block_hash: refs.finalBlock, outcome: { executor_id: target.operator_id, status: { SuccessValue: "" }, receipt_ids: [] } });
  Object.assign(f.context.outcome_blocks, { [refs.finalBlock]: f.context.block });
  assert.equal(inspectOwnerReturnEvidence(f.intent, f.raw, f.context).amount, "250");
});

test("cancelled owner-return reads stop before network and never create a new operation", async () => {
  const f = await ownerReturnFixture(), rpc = f.transport(), abort = new AbortController(); abort.abort();
  const result = await createTestnetReader(target, rpc.transport).observeOwnerReturn(f.intent, abort.signal);
  assert.equal(result.owner_return_evidence, "RETURN_UNVERIFIED"); assert.equal(rpc.calls.length, 0);
});
