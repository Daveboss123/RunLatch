/** Synthetic unsigned call review only. No wallet/secret/signature/chain execution. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { parseSetupAction, prepareSetupReview, confirmFreshSetupReview } from "../../src/lib/near/setup-review.ts";
import { canonicalReviewContent, reviewContentHash } from "../../src/lib/near/review-content.ts";
import { parseBoundedJson } from "../../src/lib/near/records.ts";
import { commercialQuoteHash } from "../../src/lib/purchasing/hashing.ts";
import { setupFixture, setupTransport } from "./helpers/setup-review.ts";
import { target } from "./helpers/testnet-evidence.ts";

test("project review fixes storage deposit; ceiling is unfunded authority, not a purchase payment", async () => {
  const f = setupFixture(), t = setupTransport(f), action = { ...f.actions.project, args: { project: { ...f.project.input, project_id: "new-project" } } };
  const review = await createTestnetReader(target, t.transport).readSetupReview(action);
  assert.equal(review.call.attached_deposit, "8192"); assert.equal(review.funding.project_ceiling, "300"); assert.equal(review.funding.purchase_funding, "0");
  assert.equal(review.signing_enabled, false); assert.equal(review.grants_payment_authority, false); assert.equal(review.independently_verified, false);
  assert.equal(review.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE"); assert.equal(t.calls.length, 9);
});
test("provider registration binds immutable publisher/recipient and only storage funding", async () => {
  const f = setupFixture(), t = setupTransport(f);
  const action = { ...f.actions.provider, args: { ...f.actions.provider.args, provider_id: "new-provider" } };
  const review = await createTestnetReader(target, t.transport).readSetupReview(action);
  assert.deepEqual(review.call.args, action.args); assert.equal(review.call.attached_deposit, "4096");
  assert.equal(review.funding.purchase_funding, "0"); assert.equal(review.funding.purchase_payment_scheduled, false);
});
test("capsule review preserves whole immutable policy and exact funding plus separate storage", async () => {
  const f = setupFixture(), t = setupTransport(f), review = await createTestnetReader(target, t.transport).readSetupReview(f.actions.capsule);
  assert.deepEqual(review.call.args, f.actions.capsule.args); assert.equal(review.call.attached_deposit, "262444");
  assert.equal(review.funding.purchase_funding, "300"); assert.equal(review.funding.storage_credit, "262144");
  assert.equal(review.call.receiver_id, target.contract_id); assert.equal(review.signer_access.nonce, "7");
  assert.equal(t.calls.length, 11); assert.equal(review.proposed_quote_hash, null);
});
test("provider quote publication shows predicted hash and due-now without approving or sending a purchase", async () => {
  const f = setupFixture(), t = setupTransport(f), review = await createTestnetReader(target, t.transport).readSetupReview(f.actions.quote);
  assert.equal(review.call.signer_id, f.provider.publisher_id); assert.equal(review.call.attached_deposit, "8192");
  assert.equal(review.exposure?.amount_due_now, "50"); assert.equal(review.funding.purchase_funding, "0");
  assert.equal(review.proposed_quote_hash, await commercialQuoteHash({ input: f.quote, publisher_id: f.provider.publisher_id, schema_version: 2 }, "testnet", target.contract_id));
  assert.equal(t.calls.length, 10);
});
test("every setup query is final-block pinned; dispatcher has no broadcast, retry or owner fallback", async () => {
  const f = setupFixture(), t = setupTransport(f); await createTestnetReader(target, t.transport).readSetupReview(f.actions.capsule);
  for (const c of t.calls) {
    assert.ok(["status", "block", "query"].includes(c.method));
    if (c.method === "query") assert.equal(c.params.block_id, f.context.block.hash);
  }
  const key = t.calls.find(c => c.params.request_type === "view_access_key")!;
  assert.equal(key.params.account_id, target.operator_id); assert.equal(key.params.public_key, f.actions.capsule.public_key);
  const mixed = setupTransport(f, (p, v) => p.request_type === "view_access_key" ? { ...v as object, block_hash: "2".repeat(32) } : v);
  await assert.rejects(createTestnetReader(target, mixed.transport).readSetupReview(f.actions.capsule), /MIXED_TESTNET_BLOCKS/u);
});
test("wrong owner/provider role, extra routing/deposit/secret fields and arbitrary methods fail before any network", async () => {
  const f = setupFixture(), t = setupTransport(f), reader = createTestnetReader(target, t.transport);
  for (const action of [{ ...f.actions.capsule, signer_id: f.policy.agent_id }, { ...f.actions.quote, signer_id: target.operator_id },
    { ...f.actions.capsule, receiver_id: "attacker.testnet" }, { ...f.actions.quote, attached_deposit: "50" },
    { ...f.actions.capsule, private_key: "HARMLESS_NOT_A_KEY" }, { ...f.actions.project, method: "pay" }]) {
    await assert.rejects(reader.readSetupReview(action));
  }
  assert.equal(t.calls.length, 0);
});
test("deposit-incapable, missing, gas-lane or unsafe nonce human keys never become signing consent", async () => {
  const f = setupFixture();
  for (const signer_access of [{ nonce: 7, permission: { FunctionCall: { allowance: "1", receiver_id: target.contract_id, method_names: ["create_capsule"] } } },
    { nonce: null, permission: "FullAccess" }, { nonce: Number.MAX_SAFE_INTEGER + 1, permission: "FullAccess" },
    { nonce: 7, permission: { GasKeyFullAccess: {} } }, { nonce: 7, permission: null }]) {
    await assert.rejects(prepareSetupReview(target, f.actions.capsule, { ...f.context, signer_access }));
  }
});
test("already-existing IDs fail closed and do not replace published terms", async () => {
  const f = setupFixture();
  const contexts = [ { ...f.context, project: null, providers: [] }, { ...f.context, project: null, providers: [] }, f.context, { ...f.context, project: null } ];
  for (const [i, action] of Object.values(f.actions).entries()) {
    await assert.rejects(prepareSetupReview(target, action, { ...contexts[i], existing_record: { existing: true } }), /SETUP_ID_ALREADY_EXISTS/u);
  }
  const t = setupTransport(f);
  await assert.rejects(createTestnetReader(target, t.transport).readSetupReview(f.actions.project), /SETUP_ID_ALREADY_EXISTS/u);
});
test("capsule activation review rejects stale, inactive, wrong-owner or substituted project context", async () => {
  const f = setupFixture();
  for (const project of [{ ...f.project, revision: "2" }, { ...f.project, status: "PAUSED" }, { ...f.project, owner_id: "other.testnet" },
    { ...f.project, input: { ...f.project.input, project_id: "other" } }]) {
    await assert.rejects(prepareSetupReview(target, f.actions.capsule, { ...f.context, project }), /SETUP_PROJECT_AUTHORITY_MISMATCH/u);
  }
});
test("project allocation, capsule expiry and storage insufficiency are explicit review failures", async () => {
  const f = setupFixture();
  await assert.rejects(prepareSetupReview(target, f.actions.capsule, { ...f.context, project: { ...f.project, allocated_authority: "1" } }), /SETUP_PROJECT_ALLOCATION_EXCEEDED/u);
  await assert.rejects(prepareSetupReview(target, { ...f.actions.capsule, args: { ...f.actions.capsule.args, storage_credit: "262143" } }, f.context), /SETUP_STORAGE_CREDIT_INSUFFICIENT/u);
  await assert.rejects(prepareSetupReview(target, { ...f.actions.capsule, args: { ...f.actions.capsule.args, policy: { ...f.policy, expires_at_ns: "100000000031" } } }, f.context), /SETUP_CAPSULE_EXCEEDS_PROJECT_EXPIRY/u);
});
test("large yocto amounts remain decimal strings; funding sum overflow, exponents and numeric money reject", async () => {
  const f = setupFixture(), budget = "9007199254740993000000000";
  const action = { ...f.actions.capsule, args: { ...f.actions.capsule.args, policy: { ...f.policy, budget } } };
  const context = { ...f.context, project: { ...f.project, input: { ...f.project.input, budget_ceiling: budget } } };
  const review = await prepareSetupReview(target, action, context);
  assert.equal(review.call.attached_deposit, (BigInt(budget) + 262144n).toString());
  for (const value of [300, "3e2", "-1", "0300", "0", (1n << 128n).toString()]) {
    assert.throws(() => parseSetupAction({ ...action, args: { ...action.args, policy: { ...action.args.policy, budget: value } } }));
  }
  const max = ((1n << 128n) - 1n).toString();
  await assert.rejects(prepareSetupReview(target, { ...action, args: { ...action.args, policy: { ...action.args.policy, budget: max } } },
    { ...context, project: { ...context.project, input: { ...context.project.input, budget_ceiling: max } } }));
});
test("policy schema rejects invalid caps/threshold/scope/quantity/key and extra authority fields", () => {
  const f = setupFixture();
  for (const changed of [{ per_purchase_limit: "301" }, { per_commitment_limit: "0" }, { approval_threshold: "301" },
    { allowed_provider_ids: [] }, { allowed_service_ids: ["x", "x"] }, { allowed_categories: ["a", "b", "c", "d", "e"] },
    { max_quantity: 0 }, { agent_public_key: "secp256k1:not-a-key" }, { owner_id: "attacker.testnet" }, { recurring_policy: "ALLOW_ALL" }]) {
    assert.throws(() => parseSetupAction({ ...f.actions.capsule, args: { ...f.actions.capsule.args, policy: { ...f.policy, ...changed } } }));
  }
});
test("selected provider scope and mutually separated agent role are checked for setup review", async () => {
  const f = setupFixture();
  for (const providers of [[], [{ ...f.provider, active: false }], [{ ...f.provider, provider_id: "wrong" }], [{ ...f.provider, recipient_id: f.policy.agent_id }]]) {
    await assert.rejects(prepareSetupReview(target, f.actions.capsule, { ...f.context, providers }), /SETUP_PROVIDER_SCOPE_MISMATCH/u);
  }
  await assert.rejects(prepareSetupReview(target, { ...f.actions.capsule, args: { ...f.actions.capsule.args, policy: { ...f.policy, agent_id: target.operator_id } } }, f.context), /SETUP_AGENT_ROLE_CONFLICT/u);
});
test("registered provider context cannot change canonical publisher/recipient or silently broaden quote scope", async () => {
  const f = setupFixture();
  for (const provider of [{ ...f.provider, publisher_id: "other.testnet" }, { ...f.provider, recipient_id: "other.testnet" },
    { ...f.provider, active: false }, { ...f.provider, quote_count: 32 }]) {
    await assert.rejects(prepareSetupReview(target, f.actions.quote, { ...f.context, project: null, providers: [provider] }), /SETUP_PUBLISHER_BINDING_MISMATCH/u);
  }
  for (const args of [{ ...f.actions.provider.args, publisher_id: target.operator_id }, { ...f.actions.provider.args, recipient_id: target.contract_id }]) {
    await assert.rejects(prepareSetupReview(target, { ...f.actions.provider, args }, { ...f.context, project: null, providers: [] }), /SETUP_PROVIDER_ROLE_CONFLICT/u);
  }
});
test("fixed recurring quote exposes total and future commitment separately from publication deposit", async () => {
  const f = setupFixture(), quote = { ...f.quote, price: "20", recurring: true, commercial_terms: { billing_model: "FIXED_RECURRING", cadence: "MONTHLY",
    period_charge: "20", required_periods: 12, mandatory_fees: "0", known_taxes: "0", setup_fees: "0", auto_renew: false,
    cancellation_terms_hash: "03".repeat(32), source_evidence_hash: "04".repeat(32), future_obligation_contingent_on_initial_payment: true } };
  const review = await prepareSetupReview(target, { ...f.actions.quote, args: { quote } }, { ...f.context, project: null });
  assert.equal(review.exposure?.known_minimum_commitment, "240"); assert.equal(review.exposure?.committed_future, "220");
  assert.equal(review.call.attached_deposit, "8192"); assert.equal(review.grants_payment_authority, false);
  await assert.rejects(prepareSetupReview(target, { ...f.actions.quote, args: { quote: { ...quote, commercial_terms: { ...quote.commercial_terms, auto_renew: true } } } },
    { ...f.context, project: null }), /SETUP_UNBOUNDED_QUOTE/u);
});
test("previous quote hash/history must match the same provider/service/category/asset/quantity/recurrence", async () => {
  const f = setupFixture(), terms = { input: { ...f.quote, quote_id: "previous" }, publisher_id: f.provider.publisher_id, schema_version: 2 as const };
  const previous = { terms, quote_hash: await commercialQuoteHash(terms, "testnet", target.contract_id), consumed: false, consumed_by: null, published_at_ns: "1" };
  const action = { ...f.actions.quote, args: { quote: { ...f.quote, previous_quote_id: "previous", price: "65" } } };
  const context = { ...f.context, project: null, previous_quote: previous };
  assert.ok((await prepareSetupReview(target, action, context)).proposed_quote_hash);
  await assert.rejects(prepareSetupReview(target, action, { ...context, previous_quote: null }), /SETUP_PREVIOUS_QUOTE_REQUIRED/u);
  await assert.rejects(prepareSetupReview(target, { ...action, args: { quote: { ...action.args.quote, service_id: "other" } } }, context), /SETUP_INCOMPARABLE_PREVIOUS_QUOTE/u);
  await assert.rejects(prepareSetupReview(target, action, { ...context, previous_quote: { ...previous, quote_hash: "05".repeat(32) } }), /CANONICAL_QUOTE_HASH_MISMATCH/u);
});
test("expiry at/after chain time and invalid project timestamps/indices fail closed", async () => {
  const f = setupFixture();
  for (const expiry of ["29", "30"]) await assert.rejects(prepareSetupReview(target, { ...f.actions.quote, args: { quote: { ...f.quote, expires_at_ns: expiry } } },
    { ...f.context, project: null }), /SETUP_REVIEW_EXPIRED/u);
  for (const project of [{ ...f.project, updated_at_ns: "31" }, { ...f.project, created_at_ns: "2" },
    { ...f.project, capsule_ids: ["other", "other"] }, { ...f.project, capsule_ids: ["work"] }]) {
    await assert.rejects(prepareSetupReview(target, f.actions.capsule, { ...f.context, project }), /INVALID_SETUP_PROJECT_STATE/u);
  }
});
test("fresh confirmation requires issued matching call/nonce/storage/context/source and unexpired review", async () => {
  const f = setupFixture(), r = await prepareSetupReview(target, f.actions.capsule, f.context);
  const fresh = await prepareSetupReview(target, f.actions.capsule, { ...f.context, block: { ...f.context.block, height: 31, timestamp_ns: "31" } });
  const confirmation = { review_hash: r.review_hash, consent: true };
  assert.equal(confirmFreshSetupReview(r, fresh, confirmation).signing_enabled, false);
  assert.throws(() => confirmFreshSetupReview({ ...r }, fresh, confirmation), /UNISSUED_SETUP_REVIEW/u);
  assert.throws(() => confirmFreshSetupReview(r, fresh, { ...confirmation, consent: false }), /EXACT_SETUP_CONFIRMATION_REQUIRED/u);
  for (const context of [{ ...f.context, signer_access: { nonce: 8, permission: "FullAccess" } },
    { ...f.context, storage: { ...f.context.storage, provider_credit: "4097" } }, { ...f.context, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" as const }]) {
    const changed = await prepareSetupReview(target, f.actions.capsule, context);
    assert.throws(() => confirmFreshSetupReview(r, changed, confirmation), /SETUP_REVIEW_CHANGED/u);
  }
  const late = await prepareSetupReview(target, f.actions.capsule, { ...f.context, block: { ...f.context.block, timestamp_ns: r.expires_at_ns } });
  assert.throws(() => confirmFreshSetupReview(r, late, confirmation), /SETUP_REVIEW_STALE/u);
});
test("returned input is detached/frozen; getters, cycles, duplicate keys and oversized fields cannot execute", async () => {
  const f = setupFixture(), r = await prepareSetupReview(target, f.actions.capsule, f.context);
  f.policy.allowed_service_ids.push("extra"); f.policy.budget = "1";
  assert.equal(r.action.method, "create_capsule");
  if (r.action.method === "create_capsule") { assert.equal(r.action.args.policy.budget, "300"); assert.deepEqual(r.action.args.policy.allowed_service_ids, ["database-plan"]); }
  assert.ok(Object.isFrozen(r.call.args)); let accessed = false;
  const getter = { ...f.actions.quote, get args() { accessed = true; throw new Error("MUST_NOT_READ"); } };
  assert.throws(() => parseSetupAction(getter)); assert.equal(accessed, false);
  const cycle: Record<string, unknown> = {}; cycle.self = cycle; assert.throws(() => parseSetupAction(cycle), /DEPTH_LIMIT/u);
  assert.throws(() => parseSetupAction({ ...f.actions.project, args: { project: { ...f.project.input, client_ref: "x".repeat(17000) } } }));
  assert.throws(() => canonicalReviewContent({ toJSON: () => { accessed = true; } })); assert.equal(accessed, false);
  assert.throws(() => parseSetupAction(parseBoundedJson('{"method":"create_project","method":"pay"}')), /DUPLICATE_CONTRACT_FIELD/u);
});
test("cancellation/unavailable RPC is sanitized, no writes or mainnet targets are admitted", async () => {
  const f = setupFixture(), t = setupTransport(f), abort = new AbortController(); abort.abort();
  await assert.rejects(createTestnetReader(target, t.transport).readSetupReview(f.actions.capsule, abort.signal), /TESTNET_READ_CANCELLED/u);
  assert.equal(t.calls.length, 0);
  await assert.rejects(createTestnetReader(target, async () => { throw new Error("PRIVATE_CANARY"); }).readSetupReview(f.actions.capsule), /TESTNET_RPC_UNAVAILABLE/u);
  assert.throws(() => createTestnetReader({ ...target, network: "mainnet" }, t.transport));
  assert.throws(() => parseSetupAction({ ...f.actions.quote, args: { quote: { ...f.quote, recipient_id: "publisher.near" } } }));
});
test("shared review encoding preserves deterministic legacy JSON hashes and rejects non-JSON/accessor arrays", async () => {
  assert.equal(canonicalReviewContent({ b: [true, null, "s"], a: 7 }), '{"a":7,"b":[true,null,"s"]}');
  assert.equal(await reviewContentHash({ b: 2, a: 1 }), await reviewContentHash({ a: 1, b: 2 }));
  for (const value of [undefined, NaN, Infinity, 1n, new Date(), [,,], { a: "x".repeat(1_048_576) }]) assert.throws(() => canonicalReviewContent(value));
  let read = false; const array = [1]; Object.defineProperty(array, "0", { get: () => { read = true; return 1; }, enumerable: true });
  assert.throws(() => canonicalReviewContent(array)); assert.equal(read, false);
  const substituted = Object.assign(new Array(1), { foo: 1 });
  assert.throws(() => canonicalReviewContent(substituted), /INVALID_REVIEW_ARRAY/u);
});
test("changing exact gas, policy, target or block direction invalidates fresh setup review", async () => {
  const f = setupFixture(), r = await prepareSetupReview(target, f.actions.capsule, f.context), confirmation = { consent: true, review_hash: r.review_hash };
  for (const action of [{ ...f.actions.capsule, gas: "100000000000001" },
    { ...f.actions.capsule, args: { ...f.actions.capsule.args, policy: { ...f.policy, approval_threshold: "0" } } }]) {
    const changed = await prepareSetupReview(target, action, f.context);
    assert.throws(() => confirmFreshSetupReview(r, changed, confirmation), /SETUP_REVIEW_CHANGED/u);
  }
  const changedTarget = await prepareSetupReview({ ...target, expected_code_hash: "3".repeat(32) }, f.actions.capsule, f.context);
  assert.throws(() => confirmFreshSetupReview(r, changedTarget, confirmation), /SETUP_REVIEW_CHANGED/u);
  const older = await prepareSetupReview(target, f.actions.capsule, { ...f.context, block: { ...f.context.block, height: 29, timestamp_ns: "29" } });
  assert.throws(() => confirmFreshSetupReview(r, older, confirmation), /SETUP_REVIEW_STALE/u);
});
test("asynchronous review copies all inputs before its first await; malformed quotes and contexts fail closed", async () => {
  const f = setupFixture(), promise = prepareSetupReview(target, f.actions.capsule, f.context);
  f.policy.budget = "1"; f.context.signer_access.nonce = 8;
  const r = await promise; assert.equal(r.funding.purchase_funding, "300"); assert.equal(r.signer_access.nonce, "7");
  for (const quote of [{ ...f.quote, quantity: 0 }, { ...f.quote, price: "0" }, { ...f.quote, recurring: true },
    { ...f.quote, asset: "usdc" }, { ...f.quote, recipient_id: "attacker.testnet" }]) {
    await assert.rejects(prepareSetupReview(target, { ...f.actions.quote, args: { quote } }, { ...f.context, project: null }));
  }
  await assert.rejects(prepareSetupReview(target, f.actions.project, { ...f.context, project: null, providers: [], existing_record: undefined }));
});
