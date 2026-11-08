import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectPurchaseEvidence, parsePurchaseObservationIntent } from "../../src/lib/near/testnet-evidence.ts";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { commercialQuoteHash } from "../../src/lib/purchasing/hashing.ts";
import { evidenceFixture, evidenceTransport, encode, refs, target } from "./helpers/testnet-evidence.ts";

test("final native success requires matching actions, data dependency, callback and final record", async () => {
  const f = await evidenceFixture(), r = inspectPurchaseEvidence(f.intent, f.raw, f.context);
  assert.equal(r.payment_evidence, "SETTLED"); assert.equal(r.transfer_succeeded, true); assert.equal(r.callback_succeeded, true);
  assert.equal(r.initial_receipt_id, refs.initial); assert.equal(r.callback_receipt_id, refs.callback);
  assert.equal(r.independently_verified, false); assert.equal(r.grants_payment_authority, false);
});
test("confirmed transfer failure reconciles, while callback failure quarantines reservation", async () => {
  const failed = await evidenceFixture("SETTLEMENT_FAILED"), r = inspectPurchaseEvidence(failed.intent, failed.raw, failed.context);
  assert.equal(r.payment_evidence, "SETTLEMENT_FAILED"); assert.equal(r.transfer_succeeded, false); assert.equal(r.callback_succeeded, true);
  assert.equal(r.final_record?.reserved_amount, "0");
  const pending = await evidenceFixture("SETTLEMENT_PENDING"), p = inspectPurchaseEvidence(pending.intent, pending.raw, pending.context);
  assert.equal(p.payment_evidence, "SETTLEMENT_UNVERIFIED"); assert.equal(p.transfer_succeeded, true); assert.equal(p.callback_succeeded, false);
  assert.equal(p.final_record?.reserved_amount, "50"); assert.ok(!JSON.stringify(p).includes("provider-error"));
});
test("owner exact approval uses one yocto, original agent policy and expected request hash", async () => {
  const f = await evidenceFixture("SETTLED", true);
  assert.equal(inspectPurchaseEvidence(f.intent, f.raw, f.context).payment_evidence, "SETTLED");
  f.raw.transaction.actions[0].FunctionCall.deposit = "0";
  assert.throws(() => inspectPurchaseEvidence(f.intent, f.raw, f.context), /TRANSACTION_ACTION_MISMATCH/u);
});
test("structured denial/approval wait are no-payment results, not blockchain failures", async () => {
  for (const state of ["DENIED", "APPROVAL_PENDING"]) {
    const f = await evidenceFixture(state), r = inspectPurchaseEvidence(f.intent, f.raw, f.context);
    assert.equal(r.payment_evidence, "NOT_ATTEMPTED"); assert.equal(r.actual_decision, state === "DENIED" ? "DENIED" : "APPROVAL_REQUIRED");
    assert.equal(r.record_source, "CONTRACT_EXECUTION_RECORD"); assert.equal(r.transfer_receipt_id, null);
  }
});
test("replay denial references original settled record without inheriting its payment", async () => {
  const f = await evidenceFixture(), reply = { ...f.reply, decision: "DENIED", reason_codes: ["REQUEST_REPLAY"], source: "CONTRACT_REJECTED_ATTEMPT" };
  f.raw.receipts = f.raw.receipts.slice(0, 1); f.raw.receipts_outcome = f.raw.receipts_outcome.slice(0, 1);
  f.raw.receipts_outcome[0].outcome.receipt_ids = [];
  f.raw.receipts_outcome[0].outcome.status = { SuccessValue: encode(reply) }; f.raw.status = { SuccessValue: encode(reply) };
  const r = inspectPurchaseEvidence(f.intent, f.raw, f.context);
  assert.equal(r.payment_evidence, "NOT_ATTEMPTED"); assert.equal(r.final_record?.status, "SETTLED");
  assert.equal(r.actual_decision, "DENIED"); assert.equal(r.record_source, "CONTRACT_REJECTED_ATTEMPT");
});
test("ABI/contract execution failure creates no invented surviving denial", async () => {
  const f = await evidenceFixture("DENIED"); f.raw.receipts_outcome[0].outcome.status = { Failure: { private: "untrusted-failure" } };
  f.raw.status = { Failure: { private: "untrusted-failure" } }; f.context.purchase = null;
  const r = inspectPurchaseEvidence(f.intent, f.raw, f.context);
  assert.equal(r.payment_evidence, "NOT_ATTEMPTED"); assert.equal(r.actual_decision, null); assert.equal(r.final_record, null);
  assert.equal(r.record_source, "TRANSACTION_EXECUTION_FAILURE"); assert.ok(!JSON.stringify(r).includes("untrusted-failure"));
});
test("inclusion and incomplete receipt lists never prove settlement", async () => {
  const f = await evidenceFixture(); f.raw.final_execution_status = "INCLUDED_FINAL";
  assert.equal(inspectPurchaseEvidence(f.intent, f.raw, f.context).submission, "NOT_FINAL");
  for (const missing of [0, 1, 2]) {
    const f = await evidenceFixture(); f.raw.receipts.splice(missing, 1);
    assert.equal(inspectPurchaseEvidence(f.intent, f.raw, f.context).payment_evidence, "SETTLEMENT_UNVERIFIED");
  }
});
test("transaction hash/sender/key/receiver and extra/substituted actions fail closed", async () => {
  for (const change of ["hash", "signer_id", "public_key", "receiver_id"] as const) {
    const f = await evidenceFixture(); f.raw.transaction[change] = "wrong.testnet";
    assert.throws(() => inspectPurchaseEvidence(f.intent, f.raw, f.context), /TRANSACTION_IDENTITY_MISMATCH/u);
  }
  const extra = await evidenceFixture(); extra.raw.transaction.actions.push(extra.raw.transaction.actions[0]);
  assert.throws(() => inspectPurchaseEvidence(extra.intent, extra.raw, extra.context));
  const args = await evidenceFixture(); args.raw.transaction.actions[0].FunctionCall.args = encode({ proposal: { ...args.intent.proposal, recipient_id: "intruder.testnet" } });
  assert.throws(() => inspectPurchaseEvidence(args.intent, args.raw, args.context), /TRANSACTION_ARGUMENT_MISMATCH/u);
});
test("recipient, amount, callback args and dependency substitution rejected", async () => {
  const mutations = [
    (f: Awaited<ReturnType<typeof evidenceFixture>>) => { f.raw.receipts[1].receiver_id = "intruder.testnet"; },
    (f: Awaited<ReturnType<typeof evidenceFixture>>) => { f.raw.receipts[1].receipt.Action.actions = [{ Transfer: { deposit: "49" } }]; },
    (f: Awaited<ReturnType<typeof evidenceFixture>>) => { f.raw.receipts[2].receipt.Action.input_data_ids = ["B".repeat(32)]; },
    (f: Awaited<ReturnType<typeof evidenceFixture>>) => { f.raw.receipts[2].receipt.Action.actions = [{ FunctionCall: { method_name: "resolve_purchase", args: encode({ purchase_key: "other:database" }), deposit: "0", gas: 25000000000000 } }]; },
  ];
  for (const change of mutations) { const f = await evidenceFixture(); change(f); assert.throws(() => inspectPurchaseEvidence(f.intent, f.raw, f.context)); }
});
test("duplicate, cyclic and orphan outcome receipt identities rejected", async () => {
  const duplicate = await evidenceFixture(); duplicate.raw.receipts_outcome.push(duplicate.raw.receipts_outcome[1]);
  assert.throws(() => inspectPurchaseEvidence(duplicate.intent, duplicate.raw, duplicate.context), /DUPLICATE_EXECUTION_RECEIPT/u);
  const cycle = await evidenceFixture(); cycle.raw.receipts_outcome[1].outcome.receipt_ids = [refs.initial];
  assert.throws(() => inspectPurchaseEvidence(cycle.intent, cycle.raw, cycle.context), /CYCLIC_OR_SHARED_RECEIPT_GRAPH/u);
  const orphan = await evidenceFixture(); orphan.raw.receipts_outcome[0].outcome.receipt_ids = [refs.transfer];
  assert.throws(() => inspectPurchaseEvidence(orphan.intent, orphan.raw, orphan.context), /ORPHAN_EXECUTION_RECEIPT/u);
});
test("stale views, callback contradictions and released unknown funds rejected", async () => {
  const stale = await evidenceFixture(); stale.context.block = { ...stale.context.block, height: 19, timestamp_ns: "19" };
  assert.throws(() => inspectPurchaseEvidence(stale.intent, stale.raw, stale.context), /STALE_SETTLEMENT_READBACK/u);
  const contradiction = await evidenceFixture(); contradiction.raw.receipts_outcome[1].outcome.status = { Failure: {} };
  assert.throws(() => inspectPurchaseEvidence(contradiction.intent, contradiction.raw, contradiction.context), /SETTLEMENT_OUTCOME_MISMATCH/u);
  const release = await evidenceFixture("SETTLEMENT_PENDING"); release.context.purchase = { ...release.context.purchase!, reserved_amount: "0" };
  assert.throws(() => inspectPurchaseEvidence(release.intent, release.raw, release.context), /UNPROVEN_CALLBACK_RELEASED_FUNDS/u);
});
test("malformed/extra args, excessive gas and invalid intent rejected before RPC", async () => {
  const f = await evidenceFixture();
  for (const value of [{ ...f.intent, expected_request_hash: "f".repeat(64) }, { ...f.intent, gas: "0" }, { ...f.intent, gas: "300000000000001" },
    { ...f.intent, public_key: "full-access-secret-not-allowed" }, { ...f.intent, method: "pay" }, { ...f.intent, proposal: { ...f.intent.proposal, amount: "1" } }]) assert.throws(() => parsePurchaseObservationIntent(value));
  f.raw.transaction.actions[0].FunctionCall.args = Buffer.from('{"proposal":{},"proposal":{}}').toString("base64");
  assert.throws(() => inspectPurchaseEvidence(f.intent, f.raw, f.context), /DUPLICATE_CONTRACT_FIELD/u);
});
test("reader chooses supported receipt status and pins ledger views after transaction lookup", async () => {
  for (const version of ["2.14.0-rc.5", "2.13.1"]) {
    const f = await evidenceFixture(), m = evidenceTransport(f, version);
    const r = await createTestnetReader(target, m.transport).observePurchase(f.intent);
    assert.equal(r.payment_evidence, "SETTLED"); assert.equal(r.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE");
    const index = m.calls.findIndex(c => c.method.endsWith("tx_status"));
    assert.equal(m.calls[index].method, version === "2.13.1" ? "EXPERIMENTAL_tx_status" : "tx_status");
    assert.equal(m.calls[index].params.wait_until, "FINAL"); assert.ok(m.calls.slice(index + 1).some(c => c.method === "block" && c.params.finality === "final"));
    assert.ok(m.calls.length <= 40); assert.ok(!m.calls.some(c => c.method === "send_tx"));
  }
});
test("reader timeout/cancel keeps exact transaction identity and never retries or sends", async () => {
  const f = await evidenceFixture(); let calls = 0;
  const r = await createTestnetReader(target, async () => { calls++; throw new Error("private-provider-error"); }).observePurchase(f.intent);
  assert.equal(r.transaction_hash, refs.tx); assert.equal(r.payment_evidence, "SETTLEMENT_UNVERIFIED"); assert.equal(r.submission, "UNAVAILABLE"); assert.equal(calls, 1);
  assert.ok(!JSON.stringify(r).includes("private-provider-error"));
  const controller = new AbortController(); controller.abort();
  const cancelled = await createTestnetReader(target, async () => { calls++; throw new Error("unreachable"); }).observePurchase(f.intent, controller.signal);
  assert.equal(cancelled.limitation, "TESTNET_READ_CANCELLED"); assert.equal(calls, 1);
});
test("transaction-specific timeout/unknown/shard errors preserve identity without retries", async () => {
  for (const reason of ["TIMEOUT_ERROR", "UNKNOWN_TRANSACTION", "DOES_NOT_TRACK_SHARD", "INTERNAL_ERROR"]) {
    const f = await evidenceFixture(), m = evidenceTransport(f, "2.14.0", method => method === "tx_status"
      ? { error: { code: -32000, message: "never-expose-provider-message", cause: { name: reason } } } : undefined);
    const r = await createTestnetReader(target, m.transport).observePurchase(f.intent);
    assert.equal(r.transaction_hash, refs.tx); assert.equal(r.payment_evidence, "SETTLEMENT_UNVERIFIED");
    assert.equal(m.calls.filter(c => c.method.endsWith("tx_status")).length, 1); assert.ok(!JSON.stringify(r).includes("never-expose-provider-message"));
  }
});
test("status NONE with no transaction data remains not final, rather than becoming failed", async () => {
  const f = await evidenceFixture(), m = evidenceTransport(f, "2.14.0", method => method === "tx_status" ? { result: { final_execution_status: "NONE" } } : undefined);
  const r = await createTestnetReader(target, m.transport).observePurchase(f.intent);
  assert.equal(r.submission, "NOT_FINAL"); assert.equal(r.payment_evidence, "SETTLEMENT_UNVERIFIED"); assert.equal(r.transaction_hash, refs.tx);
});
test("large native amounts stay exact and repeated evidence never produces another payment", async () => {
  const price = "9007199254740993123456789", f = await evidenceFixture("SETTLED", false, price);
  const first = inspectPurchaseEvidence(f.intent, f.raw, f.context), second = inspectPurchaseEvidence(f.intent, f.raw, f.context);
  assert.deepEqual(first, second); assert.equal(first.payment_evidence, "SETTLED"); assert.equal(first.final_record?.canonical_quote?.input.price, price);
  f.raw.receipts[1].receipt.Action.actions = [{ Transfer: { deposit: (BigInt(price) + 1n).toString() } }];
  assert.throws(() => inspectPurchaseEvidence(f.intent, f.raw, f.context), /TRANSFER_CANONICAL_BINDING_MISMATCH/u);
});
test("gas refund receipts do not become provider purchase spend", async () => {
  const f = await evidenceFixture(), refund = "B".repeat(32);
  f.raw.receipts_outcome[2].outcome.receipt_ids.push(refund);
  f.raw.receipts_outcome.push({ id: refund, block_hash: refs.callbackBlock, outcome: { executor_id: "agent.testnet", status: { SuccessValue: "" }, receipt_ids: [] } });
  f.raw.receipts.push({ receipt_id: refund, predecessor_id: "system", receiver_id: "agent.testnet",
    receipt: { Action: { signer_id: "system", signer_public_key: f.intent.public_key, actions: [{ Transfer: { deposit: "1234" } }], input_data_ids: [], output_data_receivers: [] } } });
  const r = inspectPurchaseEvidence(f.intent, f.raw, f.context);
  assert.equal(r.payment_evidence, "SETTLED"); assert.equal(r.transfer_receipt_id, refs.transfer); assert.equal(r.final_record?.canonical_quote?.input.price, "50");
});
test("successful quarantining callback still cannot imply settlement or release commitments", async () => {
  const f = await evidenceFixture("SETTLEMENT_PENDING"), p = { ...f.context.purchase!, reconciliation_required: true };
  f.context.purchase = p; const reply = { ...f.reply, request: p };
  f.raw.receipts_outcome[2].outcome.status = { SuccessValue: encode(reply) }; f.raw.status = { SuccessValue: encode(reply) };
  assert.equal(inspectPurchaseEvidence(f.intent, f.raw, f.context).payment_evidence, "SETTLEMENT_UNVERIFIED");
  f.context.purchase = { ...p, reserved_amount: "0" };
  f.raw.receipts_outcome[2].outcome.status = { SuccessValue: encode({ ...reply, request: f.context.purchase }) };
  f.raw.status = f.raw.receipts_outcome[2].outcome.status;
  assert.throws(() => inspectPurchaseEvidence(f.intent, f.raw, f.context), /UNPROVEN_CALLBACK_RELEASED_FUNDS/u);
});
test("receipt bounds and mismatched block readback never produce a settled result", async () => {
  const many = await evidenceFixture(); many.raw.receipts_outcome = Array(33).fill(many.raw.receipts_outcome[0]);
  assert.throws(() => inspectPurchaseEvidence(many.intent, many.raw, many.context), /CONTRACT_LIST_LIMIT/u);
  const f = await evidenceFixture(), m = evidenceTransport(f, "2.14.0", (method, params, result) => method === "block" && params.block_id
    ? { result: { header: { hash: refs.finalBlock, height: 10, timestamp_nanosec: "10" } } } : { result });
  await assert.rejects(createTestnetReader(target, m.transport).observePurchase(f.intent), /TESTNET_OUTCOME_BLOCK_MISMATCH/u);
});
test("historical initiating/callback code must match, not only the latest contract code", async () => {
  const f = await evidenceFixture(), good = evidenceTransport(f);
  const r = await createTestnetReader(target, good.transport).observePurchase(f.intent);
  assert.ok("execution_code_blocks" in r); assert.deepEqual(r.execution_code_blocks, [refs.initialBlock, refs.callbackBlock]);
  const wrong = evidenceTransport(f, "2.14.0", (method, params, result) => method === "query" && params.request_type === "view_account" && params.block_id === refs.initialBlock
    ? { result: { ...result as object, code_hash: "B".repeat(32) } } : undefined);
  await assert.rejects(createTestnetReader(target, wrong.transport).observePurchase(f.intent), /EXECUTION_CODE_HASH_MISMATCH/u);
});
test("fixed-term settlement retains exact future authority; contingent transfer failure releases it", async () => {
  const f = await evidenceFixture("SETTLED", true, "20"), terms = { ...f.context.quote!.terms,
    input: { ...f.context.quote!.terms.input, recurring: true, commercial_terms: { billing_model: "FIXED_RECURRING" as const, cadence: "MONTHLY" as const,
      period_charge: "20", required_periods: 12, mandatory_fees: "0", known_taxes: "0", setup_fees: "0", auto_renew: false,
      cancellation_terms_hash: "a".repeat(64), source_evidence_hash: "b".repeat(64), future_obligation_contingent_on_initial_payment: true } } };
  const digest = await commercialQuoteHash(terms, "testnet", target.contract_id), proposal = { ...f.intent.proposal, expected_quote_hash: digest };
  const intent = parsePurchaseObservationIntent({ ...f.intent, proposal });
  f.context.quote = { ...f.context.quote!, terms, quote_hash: digest };
  f.context.purchase = { ...f.context.purchase!, proposal, canonical_quote: terms, committed_future_amount: "220" };
  const updateReturn = () => {
    const reply = { ...f.reply, request: f.context.purchase };
    f.raw.receipts_outcome[2].outcome.status = { SuccessValue: encode(reply) }; f.raw.status = { SuccessValue: encode(reply) };
  };
  updateReturn();
  assert.equal(inspectPurchaseEvidence(intent, f.raw, f.context).final_record?.committed_future_amount, "220");
  f.raw.receipts_outcome[1].outcome.status = { Failure: {} };
  f.context.purchase = { ...f.context.purchase, status: "SETTLEMENT_FAILED", committed_future_amount: "0" };
  updateReturn();
  assert.equal(inspectPurchaseEvidence(intent, f.raw, f.context).payment_evidence, "SETTLEMENT_FAILED");
  assert.equal(f.context.quote.consumed, true);
});
test("wrong bound agent key can only be observed as a rolled-back failure, not a successful Gate result", async () => {
  const f = await evidenceFixture("DENIED");
  f.context.capsule = { ...f.snapshot.capsule, policy: { ...f.snapshot.capsule.policy, agent_public_key: `ed25519:${"2".repeat(44)}` } };
  assert.throws(() => inspectPurchaseEvidence(f.intent, f.raw, f.context), /TRANSACTION_AGENT_BINDING_MISMATCH/u);
  f.raw.receipts_outcome[0].outcome.status = { Failure: {} }; f.raw.status = { Failure: {} }; f.context.purchase = null;
  const r = inspectPurchaseEvidence(f.intent, f.raw, f.context);
  assert.equal(r.record_source, "TRANSACTION_EXECUTION_FAILURE"); assert.equal(r.actual_decision, null); assert.equal(r.payment_evidence, "NOT_ATTEMPTED");
});
