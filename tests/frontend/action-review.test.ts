import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectRestrictedAccess, parseRestrictedAgentScope } from "../../src/lib/near/agent-access.ts";
import { confirmFreshPurchaseReview, parsePurchaseAction, preparePurchaseReview } from "../../src/lib/near/action-review.ts";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { commercialQuoteHash } from "../../src/lib/purchasing/hashing.ts";
import { keyFixture, reviewFixture, reviewTransport, scope } from "./helpers/action-review.ts";
import { refs, target } from "./helpers/testnet-evidence.ts";

test("ordinary function-call scope requires exact receiver/method, finite positive allowance and recovery key", () => {
  const f = keyFixture(), s = parseRestrictedAgentScope(scope, { ...target, network: "testnet" });
  const access = inspectRestrictedAccess(s, { ...target, network: "testnet" }, f.key, { keys: f.keys });
  assert.equal(access.nonce, "7"); assert.equal(access.allowance, scope.max_allowance); assert.equal(access.recovery_access_observed, true);
  assert.deepEqual(access.method_names, ["submit_purchase"]); assert.match(access.limitation, /not proof of human key control/u);
});
test("scope rejects mainnet/role conflicts/same recovery key and zero or noninteger allowance", () => {
  for (const changed of [{ agent_id: target.operator_id }, { agent_id: target.contract_id }, { agent_id: "agent.near" },
    { recovery_public_key: scope.public_key }, { max_allowance: "0" }, { max_allowance: null }, { max_allowance: 1 }, { extra: true }]) {
    assert.throws(() => parseRestrictedAgentScope({ ...scope, ...changed }, { ...target, network: "testnet" }));
  }
});
test("unlimited/exhausted/excess allowance and wildcard/extra/admin methods fail closed", () => {
  for (const change of [{ allowance: null }, { allowance: "0" }, { allowance: (BigInt(scope.max_allowance) + 1n).toString() },
    { receiver_id: "other.testnet" }, { method_names: [] }, { method_names: ["submit_purchase", "approve_purchase"] }, { method_names: ["pay"] }]) {
    const f = keyFixture(), key = { nonce: 7, permission: { FunctionCall: { ...f.key.permission.FunctionCall, ...change } } };
    assert.throws(() => inspectRestrictedAccess(scope, { ...target, network: "testnet" }, key,
      { keys: [{ public_key: scope.public_key, access_key: key }, f.keys[1]] }));
  }
});
test("full-access and gas keys cannot silently become restricted execution", () => {
  for (const permission of ["FullAccess", { GasKeyFullAccess: { balance: "1", num_nonces: 1 } },
    { GasKeyFunctionCall: { ...keyFixture().key.permission.FunctionCall, balance: "1", num_nonces: 1 } }]) {
    const key = { nonce: 7, permission };
    assert.throws(() => inspectRestrictedAccess(scope, { ...target, network: "testnet" }, key,
      { keys: [{ public_key: scope.public_key, access_key: key }, keyFixture().keys[1]] }));
  }
});
test("missing/duplicate/mismatched key readback, absent recovery and unsafe nonce are rejected", () => {
  const f = keyFixture();
  for (const keys of [[], [f.keys[0]], [f.keys[0], f.keys[0], f.keys[1]], [f.keys[1]],
    [{ ...f.keys[0], access_key: { ...f.key, nonce: 8 } }, f.keys[1]]]) assert.throws(() => inspectRestrictedAccess(scope, { ...target, network: "testnet" }, f.key, { keys }));
  assert.throws(() => inspectRestrictedAccess(scope, { ...target, network: "testnet" }, { ...f.key, nonce: 9007199254740992 }, { keys: f.keys }));
  assert.throws(() => inspectRestrictedAccess(scope, { ...target, network: "testnet" }, f.key, { keys: Array(9).fill(f.keys[0]) }), /CONTRACT_LIST_LIMIT/u);
});
test("readRestrictedAgent uses same final block and the exact agent account without signing", async () => {
  const d = await reviewFixture(), m = reviewTransport(d), r = await createTestnetReader(target, m.transport).readRestrictedAgent(scope);
  assert.equal(r.access.allowance, scope.max_allowance); assert.equal(r.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE");
  assert.equal(r.grants_payment_authority, false); assert.equal(m.calls.length, 9);
  for (const c of m.calls.filter(c => String(c.params.request_type).startsWith("view_access_key"))) {
    assert.equal(c.params.account_id, scope.agent_id); assert.equal(c.params.block_id, refs.finalBlock);
  }
  assert.equal(m.calls.at(-1)?.params.limit, 9);
  assert.ok(!m.calls.some(c => /send|broadcast/u.test(c.method)));
});
test("mixed-block and incomplete key lists fail closed without pagination/recovery writes", async () => {
  const d = await reviewFixture();
  for (const change of [{ block_hash: "B".repeat(32) }, { next_key: scope.recovery_public_key }, { keys: Array(9).fill(d.keys[0]) }]) {
    const m = reviewTransport(d, (_method, params, result) => params.request_type === "view_access_key_list" ? { result: { ...result as object, ...change } } : undefined);
    await assert.rejects(createTestnetReader(target, m.transport).readRestrictedAgent(scope));
    assert.equal(m.calls.length, 9);
  }
});
test("submit review pins exact unsigned call, canonical exposure, ledger and restricted key", async () => {
  const d = await reviewFixture(), m = reviewTransport(d), r = await createTestnetReader(target, m.transport).readPurchaseReview(d.action, scope);
  assert.deepEqual(r.call.args, { proposal: d.action.proposal }); assert.equal(r.call.attached_deposit, "0"); assert.equal(r.call.receiver_id, target.contract_id);
  assert.equal(r.call.gas, "100000000000000"); assert.equal(r.exposure.amount_due_now, "50"); assert.equal(r.exposure.total_commitment, "50");
  assert.equal(r.exposure.future_commitment, "0"); assert.equal(r.exposure.attached_deposit, "0"); assert.equal(r.financials?.available_now, "300");
  assert.equal(r.expires_at_ns, "60000000030"); assert.equal(r.grants_payment_authority, false); assert.equal(r.source, "UNSIGNED_EXACT_PURCHASE_REVIEW");
  assert.equal(m.calls.length, 13); assert.ok(!m.calls.some(c => /send|broadcast/u.test(c.method)));
});
test("approval review binds original pending request and displays one yocto separately from price", async () => {
  const d = await reviewFixture(true), m = reviewTransport(d), r = await createTestnetReader(target, m.transport).readPurchaseReview(d.action, null);
  assert.deepEqual(r.call.args, { capsule_id: "work", request_id: "database", expected_request_hash: d.action.expected_request_hash });
  assert.equal(r.call.signer_id, target.operator_id); assert.equal(r.call.attached_deposit, "1"); assert.equal(r.exposure.amount_due_now, "50");
  assert.equal(r.access, null); assert.equal(m.calls.length, 11); assert.equal(r.grants_payment_authority, false);
});
test("extra recipients/amounts/actions/approval flags and mismatched roles rejected before RPC", async () => {
  const d = await reviewFixture(); let calls = 0;
  const reader = createTestnetReader(target, async () => { calls++; throw new Error("UNEXPECTED_NETWORK"); });
  for (const change of [{ method: "pay" }, { gas: "0" }, { gas: "300000000000001" }, { gas: 100 }, { recipient_id: "intruder.testnet" },
    { expected_request_hash: "a".repeat(64) }, { proposal: { ...d.action.proposal, amount: "1" } }]) {
    assert.throws(() => parsePurchaseAction({ ...d.action, ...change }));
    await assert.rejects(reader.readPurchaseReview({ ...d.action, ...change }, scope));
  }
  await assert.rejects(reader.readPurchaseReview(d.action, null), /ACTION_ROLE_SCOPE_MISMATCH/u);
  await assert.rejects(reader.readPurchaseReview({ ...d.action, signer_id: target.operator_id }, scope), /ACTION_ROLE_SCOPE_MISMATCH/u);
  assert.equal(calls, 0);
});
test("changed project/capsule authority, consumed quote and substituted hashes invalidate review", async () => {
  for (const kind of ["project-status", "capsule-status", "revision", "expired", "consumed", "hash", "agent-key"]) {
    const d = await reviewFixture();
    if (kind === "project-status") d.f.snapshot.project.status = "PAUSED";
    if (kind === "capsule-status") d.f.snapshot.capsule.status = "REVOKED";
    if (kind === "revision") d.f.snapshot.project.revision = "2";
    if (kind === "expired") d.f.snapshot.capsule.policy.expires_at_ns = "30";
    if (kind === "consumed") { d.f.quote.consumed = true; d.f.quote.consumed_by = "other:database"; }
    if (kind === "hash") d.f.quote.quote_hash = "a".repeat(64);
    if (kind === "agent-key") d.f.snapshot.capsule.policy.agent_public_key = scope.recovery_public_key;
    const m = reviewTransport(d);
    await assert.rejects(createTestnetReader(target, m.transport).readPurchaseReview(d.action, scope));
  }
});
test("DENIED/resolved/replayed requests cannot become pending owner approval", async () => {
  for (const state of ["DENIED", "SETTLED", "SETTLEMENT_FAILED", "EXPIRED", "CANCELLED"]) {
    const d = await reviewFixture(true), record = { ...d.f.snapshot.purchases[0], status: state, decision: state === "DENIED" ? "DENIED" : "APPROVED" };
    // Pure signing-boundary check; ledger reducer separately rejects contradictory synthetic states.
    await assert.rejects(preparePurchaseReview(target, d.action, { block: d.f.context.block, snapshot: { ...d.f.snapshot, purchases: [record] },
      provider: d.f.provider, quote: d.f.quote, access: null, transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" }), /ACTION_APPROVAL_NOT_EXACT_PENDING/u);
  }
  const d = await reviewFixture(true), m = reviewTransport(d);
  await assert.rejects(createTestnetReader(target, m.transport).readPurchaseReview({ ...d.action, expected_request_hash: "a".repeat(64) }, null), /ACTION_APPROVAL_NOT_EXACT_PENDING/u);
});
test("fresh same-content confirmation accepts a new block but not a local approval override", async () => {
  const d = await reviewFixture(), m = reviewTransport(d), reader = createTestnetReader(target, m.transport);
  const r = await reader.readPurchaseReview(d.action, scope);
  d.f.context.block = { ...d.f.context.block, timestamp_ns: "31" };
  const fresh = await reader.readPurchaseReview(d.action, scope);
  assert.notEqual(fresh.review_hash, r.review_hash); assert.equal(fresh.state_hash, r.state_hash);
  const c = confirmFreshPurchaseReview(r, fresh, { review_hash: r.review_hash, consent: true });
  assert.equal(c.grants_payment_authority, false); assert.equal(c.status, "LOCAL_EXACT_CONTENT_CONFIRMED");
  for (const input of [{ review_hash: r.review_hash, consent: false }, { review_hash: fresh.review_hash, consent: true },
    { review_hash: r.review_hash, consent: true, approved: true }]) assert.throws(() => confirmFreshPurchaseReview(r, fresh, input));
});
test("nonce/allowance/ledger/action changes invalidate exact review without automatic resend", async () => {
  const d = await reviewFixture(), reader = createTestnetReader(target, reviewTransport(d).transport), r = await reader.readPurchaseReview(d.action, scope);
  d.key.nonce++;
  const changed = await reader.readPurchaseReview(d.action, scope);
  assert.throws(() => confirmFreshPurchaseReview(r, changed, { review_hash: r.review_hash, consent: true }), /ACTION_REVIEW_CHANGED/u);
  d.key.nonce--;
  const changedGas = await reader.readPurchaseReview({ ...d.action, gas: "90000000000000" }, scope);
  assert.throws(() => confirmFreshPurchaseReview(r, changedGas, { review_hash: r.review_hash, consent: true }), /ACTION_REVIEW_CHANGED/u);
  d.key.permission.FunctionCall.allowance = "1";
  const changedAllowance = await reader.readPurchaseReview(d.action, scope);
  assert.throws(() => confirmFreshPurchaseReview(r, changedAllowance, { review_hash: r.review_hash, consent: true }), /ACTION_REVIEW_CHANGED/u);
});
test("review expiration and older blocks are fail-closed even with otherwise unchanged content", async () => {
  const d = await reviewFixture(), reader = createTestnetReader(target, reviewTransport(d).transport), r = await reader.readPurchaseReview(d.action, scope);
  d.f.context.block = { ...d.f.context.block, timestamp_ns: r.expires_at_ns };
  const fresh = await reader.readPurchaseReview(d.action, scope);
  assert.throws(() => confirmFreshPurchaseReview(r, fresh, { review_hash: r.review_hash, consent: true }), /ACTION_REVIEW_STALE/u);
  const older = await preparePurchaseReview(target, d.action, { block: { ...r.reviewed_block, timestamp_ns: "29", height: 29 },
    snapshot: d.f.snapshot, provider: d.f.provider, quote: d.f.quote, access: r.access, transport_source: r.transport_source });
  assert.throws(() => confirmFreshPurchaseReview(r, older, { review_hash: r.review_hash, consent: true }), /ACTION_REVIEW_STALE/u);
  assert.throws(() => confirmFreshPurchaseReview(r, { ...r }, { review_hash: r.review_hash, consent: true }), /UNISSUED_ACTION_REVIEW/u);
});
test("recurring quote review shows full exact exposure without double-subtracting initial payment", async () => {
  const d = await reviewFixture(true), terms = { ...d.f.quote.terms, input: { ...d.f.quote.terms.input, price: "9007199254740993123456789", recurring: true,
    commercial_terms: { billing_model: "FIXED_RECURRING" as const, cadence: "MONTHLY" as const, period_charge: "9007199254740993123456789", required_periods: 12,
      mandatory_fees: "0", known_taxes: "0", setup_fees: "0", auto_renew: false, cancellation_terms_hash: "a".repeat(64), source_evidence_hash: "b".repeat(64),
      future_obligation_contingent_on_initial_payment: true } } };
  const quoteHash = await commercialQuoteHash(terms, "testnet", target.contract_id), proposal = { ...d.action.proposal, expected_quote_hash: quoteHash };
  const r = await preparePurchaseReview(target, { ...d.action, proposal }, { block: d.f.context.block,
    snapshot: { ...d.f.snapshot, purchases: [{ ...d.f.snapshot.purchases[0], proposal, canonical_quote: terms }] }, provider: d.f.provider,
    quote: { ...d.f.quote, terms, quote_hash: quoteHash }, access: null, transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" });
  assert.equal(r.exposure.total_commitment, (BigInt(terms.input.price) * 12n).toString());
  assert.equal(r.exposure.future_commitment, (BigInt(terms.input.price) * 11n).toString()); assert.equal(r.exposure.attached_deposit, "1");
});
test("returned review copies inputs and rejects cyclic/getter/oversized context", async () => {
  const d = await reviewFixture(), r = await createTestnetReader(target, reviewTransport(d).transport).readPurchaseReview(d.action, scope);
  d.f.context.block = { ...d.f.context.block, timestamp_ns: "900" }; d.key.permission.FunctionCall.method_names.push("pay");
  assert.equal(r.reviewed_at_ns, "30"); assert.deepEqual(r.access?.method_names, ["submit_purchase"]);
  assert.ok(Object.isFrozen(r.call)); assert.ok(Object.isFrozen(r.canonical_quote.terms.input));
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  for (const snapshot of [cyclic, { get project() { throw new Error("NEVER_EVALUATE"); } }, { content: "x".repeat(1_048_577) }]) {
    await assert.rejects(preparePurchaseReview(target, d.action, { block: r.reviewed_block, snapshot, provider: d.f.provider,
      quote: d.f.quote, access: null, transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" }));
  }
});
test("cancelled read performs no network calls and provider failures stay sanitized", async () => {
  const d = await reviewFixture(), controller = new AbortController(); controller.abort(); let calls = 0;
  const reader = createTestnetReader(target, async () => { calls++; throw new Error("PRIVATE_PROVIDER_ERROR"); });
  await assert.rejects(reader.readPurchaseReview(d.action, scope, controller.signal), /TESTNET_READ_CANCELLED/u); assert.equal(calls, 0);
  await assert.rejects(reader.readPurchaseReview(d.action, scope), /TESTNET_RPC_UNAVAILABLE/u); assert.equal(calls, 1);
});
test("expired quote or pending approval cannot be confirmed, and ledger corruption fails before review", async () => {
  const d = await reviewFixture(true), context = { block: d.f.context.block, snapshot: d.f.snapshot, provider: d.f.provider,
    quote: d.f.quote, access: null, transport_source: "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE" as const };
  await assert.rejects(preparePurchaseReview(target, d.action, { ...context, block: { ...context.block, timestamp_ns: "100000000030" } }), /ACTION_QUOTE_EXPIRED/u);
  await assert.rejects(preparePurchaseReview(target, d.action, { ...context, block: { ...context.block, timestamp_ns: "90000000030" } }), /ACTION_APPROVAL_EXPIRED/u);
  d.f.snapshot.capsule.spent = "1";
  await assert.rejects(createTestnetReader(target, reviewTransport(d).transport).readPurchaseReview(d.action, null), /OPERATION_SUM_MISMATCH/u);
});
test("reconstructed reviews and transport relabelling are rejected, even with a copied hash", async () => {
  const d = await reviewFixture(), r = await createTestnetReader(target, reviewTransport(d).transport).readPurchaseReview(d.action, scope);
  assert.throws(() => confirmFreshPurchaseReview(JSON.parse(JSON.stringify(r)), r, { consent: true, review_hash: r.review_hash }), /UNISSUED_ACTION_REVIEW/u);
  const relabelled = await preparePurchaseReview(target, d.action, { block: d.f.context.block, snapshot: d.f.snapshot,
    provider: d.f.provider, quote: d.f.quote, access: r.access, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" });
  assert.throws(() => confirmFreshPurchaseReview(r, relabelled, { consent: true, review_hash: r.review_hash }), /ACTION_REVIEW_CHANGED/u);
  d.f.snapshot.evidence_snapshot_hash = "a".repeat(64);
  const changed = await createTestnetReader(target, reviewTransport(d).transport).readPurchaseReview(d.action, scope);
  assert.throws(() => confirmFreshPurchaseReview(r, changed, { consent: true, review_hash: r.review_hash }), /ACTION_REVIEW_CHANGED/u);
});
