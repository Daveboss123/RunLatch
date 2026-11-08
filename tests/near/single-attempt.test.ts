/** Offline test ports only. No SDK, secret, transaction signing, RPC or public execution. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, writeFile, symlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { createAttemptJournal } from "../../scripts/near/attempt-journal.ts";
import { exerciseSingleAttempt, type SingleAttemptExercisePorts } from "../../scripts/near/single-attempt.ts";
import { createTestnetReader } from "../../src/lib/near/testnet-rpc.ts";
import { preparePurchaseReview } from "../../src/lib/near/action-review.ts";
import { reviewFixture, reviewTransport, scope } from "../frontend/helpers/action-review.ts";
import { refs, target } from "../frontend/helpers/testnet-evidence.ts";

async function fixture() {
  const data = await reviewFixture(), reader = createTestnetReader(target, reviewTransport(data).transport);
  const review = await reader.readPurchaseReview(data.action, scope), namespace = `test-${randomUUID()}`;
  const directory = new URL(`../../.local/testnet-mvp/single-attempt/${namespace}/`, import.meta.url);
  const journal = await createAttemptJournal(namespace);
  let prepared = 0, invoked = 0;
  const intent = { transaction_hash: refs.tx, sender_id: review.action.signer_id, public_key: review.action.public_key,
    method: "submit_purchase", gas: review.action.gas, proposal: review.action.proposal, expected_request_hash: null };
  const ports: SingleAttemptExercisePorts = { journal, freshReview: () => reader.readPurchaseReview(data.action, scope), nowNs: () => 30n,
    prepareIdentity: async () => { prepared++; return { intent, invoke: async () => { invoked++; return { status: "settled", instructions: "pay again" }; } }; } };
  return { data, reader, review, namespace, directory, journal, intent, ports, counters: () => ({ prepared, invoked }),
    confirmation: { consent: true, review_hash: review.review_hash } };
}
async function events(f: Awaited<ReturnType<typeof fixture>>) {
  return await Promise.all((await readdir(f.directory)).sort().map(async name => JSON.parse(await readFile(new URL(name, f.directory), "utf8"))));
}

test("identity and invocation markers exist before one test invocation; returned data never establishes settlement", async () => {
  const f = await fixture();
  const result = await exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, prepareIdentity: async () => ({ intent: f.intent,
    invoke: async () => { assert.deepEqual((await events(f)).map(e => e.event), ["CLAIMED", "IDENTITY_CAPTURED", "INVOCATION_ENTERED"]); return { settled: true }; } }) });
  assert.equal(result.status, "RETURNED_UNVERIFIED"); assert.equal(result.payment_evidence, "NOT_OBSERVED"); assert.equal(result.public_execution, false);
  assert.deepEqual((await events(f)).map(e => e.event), ["CLAIMED", "IDENTITY_CAPTURED", "INVOCATION_ENTERED", "RETURNED_UNVERIFIED"]);
  assert.equal(result.intent?.transaction_hash, refs.tx); assert.ok(!("settled" in result));
});
test("duplicate calls and new coordinator instances cannot prepare or invoke this request again", async () => {
  const f = await fixture();
  await exerciseSingleAttempt(f.review, f.confirmation, f.ports);
  const restarted = await createAttemptJournal(f.namespace);
  await assert.rejects(exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, journal: restarted }), /ATTEMPT_ALREADY_CLAIMED/u);
  assert.deepEqual(f.counters(), { prepared: 1, invoked: 1 });
});
test("concurrent callers share one exclusive claim, not two preparations or invocations", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([exerciseSingleAttempt(f.review, f.confirmation, f.ports), exerciseSingleAttempt(f.review, f.confirmation, f.ports)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.deepEqual(f.counters(), { prepared: 1, invoked: 1 });
});
test("changed key, quote, revision, code or endpoint cannot obtain another journal slot for the same request", async () => {
  const f = await fixture(); await f.journal.claim(f.review);
  for (const changed of [ { action: { ...f.review.action, public_key: scope.recovery_public_key } },
    { action: { ...f.review.action, proposal: { ...f.review.action.proposal, quote_id: "another", project_revision: "2" } } },
    { target: { ...f.review.target, expected_code_hash: "3".repeat(32), rpc_url: "https://test.rpc.fastnear.com/" } } ]) {
    await assert.rejects(f.journal.claim({ ...f.review, ...changed }), /ATTEMPT_ALREADY_CLAIMED/u);
  }
});
test("fresh review or confirmation mismatch fails before claiming/preparing/invoking", async () => {
  const f = await fixture();
  await assert.rejects(exerciseSingleAttempt(f.review, { ...f.confirmation, consent: false }, f.ports), /CONFIRMATION_REQUIRED/u);
  f.data.key.nonce++;
  await assert.rejects(exerciseSingleAttempt(f.review, f.confirmation, f.ports), /ACTION_REVIEW_CHANGED/u);
  assert.deepEqual(await events(f), []); assert.deepEqual(f.counters(), { prepared: 0, invoked: 0 });
});
test("HTTP-labelled review and owner approvals cannot enter this unadmitted offline seam", async () => {
  const f = await fixture();
  const http = await preparePurchaseReview(target, f.data.action, { block: f.data.f.context.block, snapshot: f.data.f.snapshot,
    quote: f.data.f.quote, provider: f.data.f.provider, access: f.review.access, financials: f.review.financials, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" });
  await assert.rejects(exerciseSingleAttempt(http, { consent: true, review_hash: http.review_hash }, f.ports), /PUBLIC_EXECUTION_NOT_ADMITTED/u);
  const d = await reviewFixture(true), owner = await createTestnetReader(target, reviewTransport(d).transport).readPurchaseReview(d.action, null);
  await assert.rejects(exerciseSingleAttempt(owner, { consent: true, review_hash: owner.review_hash }, f.ports), /PUBLIC_EXECUTION_NOT_ADMITTED/u);
  assert.deepEqual(await events(f), []);
});
test("changed prepared identity or injected fields stop before invocation and retain the claim", async () => {
  for (const changed of [{ sender_id: target.operator_id }, { public_key: scope.recovery_public_key }, { method: "approve_purchase" },
    { gas: "1" }, { private_key: "HARMLESS_CANARY_NOT_A_KEY" }]) {
    const f = await fixture();
    const result = await exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, prepareIdentity: async () => ({ intent: { ...f.intent, ...changed }, invoke: async () => assert.fail("MUST_NOT_INVOKE") }) });
    assert.equal(result.status, "STOPPED_BEFORE_INVOCATION"); assert.equal(result.intent, null); assert.equal((await events(f)).length, 1);
    await assert.rejects(exerciseSingleAttempt(f.review, f.confirmation, f.ports), /ATTEMPT_ALREADY_CLAIMED/u);
    assert.ok(!JSON.stringify(await events(f)).includes("HARMLESS_CANARY"));
  }
});
test("preparation failure is sanitized, retains claim and never retries or invokes", async () => {
  const f = await fixture();
  const result = await exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, prepareIdentity: async () => { throw new Error("PRIVATE_PROVIDER_CANARY"); } });
  assert.equal(result.status, "STOPPED_BEFORE_INVOCATION"); assert.equal(result.invocation_entered, false); assert.ok(!JSON.stringify(result).includes("CANARY"));
  assert.equal((await events(f)).length, 1);
});
test("fresh-read errors and deadlines are sanitized without leaving a claim", async () => {
  const f = await fixture();
  for (const freshReview of [async () => { throw new Error("PRIVATE_FRESH_CANARY"); }, () => new Promise<never>(() => {})]) {
    await assert.rejects(exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, invocationTimeoutMs: 10, freshReview }), /FRESH_REVIEW_UNAVAILABLE/u);
  }
  assert.equal((await events(f)).length, 0);
});
test("timeout preserves identity, blocks resend and ignores a late return or provider instructions", async () => {
  const f = await fixture(); let invoke = 0, finish: (value: unknown) => void = () => {};
  const result = await exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, invocationTimeoutMs: 10, freshReview: async () => f.review,
    prepareIdentity: async () => ({ intent: f.intent, invoke: async () => { invoke++; return new Promise(resolve => { finish = resolve; }); } }) });
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.equal(result.intent?.transaction_hash, refs.tx); assert.equal(result.payment_evidence, "NOT_OBSERVED");
  finish({ status: "settled", instructions: "resend" }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(invoke, 1); assert.equal((await events(f)).at(-1).event, "RESULT_UNKNOWN");
  await assert.rejects(exerciseSingleAttempt(f.review, f.confirmation, f.ports), /ATTEMPT_ALREADY_CLAIMED/u);
});
test("invocation rejection is unknown, not failed payment or permission to release/re-sign", async () => {
  const f = await fixture();
  const result = await exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, prepareIdentity: async () => ({ intent: f.intent,
    invoke: async () => { throw new Error("INVALID_NONCE_PRIVATE_CANARY"); } }) });
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.equal(result.intent?.transaction_hash, refs.tx); assert.ok(!JSON.stringify(result).includes("CANARY"));
  assert.equal((await events(f)).at(-1).event, "RESULT_UNKNOWN");
});
test("cancellation before preparation has no work; cancellation during invocation retains identity", async () => {
  const f = await fixture(), before = new AbortController(); before.abort();
  await assert.rejects(exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, signal: before.signal }), /CANCELLED_BEFORE/u);
  assert.equal((await events(f)).length, 0);
  const during = new AbortController();
  const result = await exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, signal: during.signal,
    prepareIdentity: async () => ({ intent: f.intent, invoke: async () => { during.abort(); return new Promise<never>(() => {}); } }) });
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.equal(result.intent?.transaction_hash, refs.tx);
});
test("expiry during preparation or journal I/O prevents invocation and retains blocking markers", async () => {
  const f = await fixture(); let now = 30n;
  const result = await exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, nowNs: () => now,
    prepareIdentity: async () => { now = BigInt(f.review.expires_at_ns); return { intent: f.intent, invoke: async () => assert.fail("EXPIRED") }; } });
  assert.equal(result.status, "STOPPED_BEFORE_INVOCATION"); assert.equal((await events(f)).length, 1);
  const g = await fixture();
  const later = await exerciseSingleAttempt(g.review, g.confirmation, { ...g.ports, nowNs: () => now,
    freshReview: async () => { now = 30n; return g.review; }, journal: { ...g.journal, capture: async (lease, intent) => {
      const captured = await g.journal.capture(lease, intent); now = BigInt(g.review.expires_at_ns); return captured;
    } } });
  assert.equal(later.status, "STOPPED_BEFORE_INVOCATION"); assert.equal(later.intent?.transaction_hash, refs.tx); assert.equal((await events(g)).length, 2);
});
test("journal faults before invocation prevent it; after entry retain identity and unknown outcome", async () => {
  const f = await fixture();
  const before = await exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, journal: { ...f.journal, enter: async () => { throw new Error("IO_CANARY"); } } });
  assert.equal(before.status, "STOPPED_BEFORE_INVOCATION"); assert.equal(before.intent?.transaction_hash, refs.tx); assert.deepEqual(f.counters(), { prepared: 1, invoked: 0 });
  const g = await fixture();
  const after = await exerciseSingleAttempt(g.review, g.confirmation, { ...g.ports, journal: { ...g.journal, finish: async () => { throw new Error("IO_CANARY"); } } });
  assert.equal(after.status, "RESULT_UNKNOWN"); assert.equal(after.intent?.transaction_hash, refs.tx); assert.equal((await events(g)).length, 3);
  assert.equal(after.journal_completion, "NOT_FINALIZED_RETAIN_PRIOR_MARKERS");
  assert.deepEqual(g.counters(), { prepared: 1, invoked: 1 });
});
test("concurrent lease stages and reconstructed leases are rejected; marker tampering never overwrites", async () => {
  const f = await fixture(), lease = await f.journal.claim(f.review);
  await assert.rejects(f.journal.capture({ ...lease }, f.intent), /UNISSUED_ATTEMPT_LEASE/u);
  const both = await Promise.allSettled([f.journal.capture(lease, f.intent), f.journal.capture(lease, f.intent)]);
  assert.equal(both.filter(r => r.status === "fulfilled").length, 1);
  await assert.rejects(f.journal.capture(lease, f.intent), /ATTEMPT_STAGE_MISMATCH/u);
  const g = await fixture(), other = await g.journal.claim(g.review);
  await writeFile(new URL(`${other.attempt_id}.1.json`, g.directory), "CORRUPT_MARKER", { flag: "wx" });
  await assert.rejects(g.journal.capture(other, g.intent)); await assert.rejects(g.journal.enter(other), /ATTEMPT_STAGE_MISMATCH/u);
  assert.equal(await readFile(new URL(`${other.attempt_id}.1.json`, g.directory), "utf8"), "CORRUPT_MARKER");
});
test("journal namespace traversal/non-directory paths and invalid timeouts fail closed", async () => {
  for (const namespace of ["../public", "", "a/b", "C:\\private", "x".repeat(65)]) await assert.rejects(createAttemptJournal(namespace));
  const f = await fixture();
  for (const timeout of [0, -1, 15_001, 1.2, NaN]) await assert.rejects(exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, invocationTimeoutMs: timeout }), /INVALID_INVOCATION_TIMEOUT/u);
  const namespace = `test-${randomUUID()}`, dir = new URL(`../../.local/testnet-mvp/single-attempt/${namespace}`, import.meta.url);
  await writeFile(dir, "NOT_A_DIRECTORY", { flag: "wx" }); await assert.rejects(createAttemptJournal(namespace), /UNSAFE_ATTEMPT_JOURNAL_PATH/u);
  assert.equal(f.counters().prepared, 0);
});
test("two separate Node processes get only one request claim on this local filesystem", async () => {
  const f = await fixture();
  const code = `
    import {createAttemptJournal} from './scripts/near/attempt-journal.ts';
    import {createTestnetReader} from './src/lib/near/testnet-rpc.ts';
    import {reviewFixture,reviewTransport,scope} from './tests/frontend/helpers/action-review.ts';
    import {target} from './tests/frontend/helpers/testnet-evidence.ts';
    const d=await reviewFixture();
    const r=await createTestnetReader(target,reviewTransport(d).transport).readPurchaseReview(d.action,scope);
    const j=await createAttemptJournal(${JSON.stringify(f.namespace)});
    try {await j.claim(r);console.log('CLAIMED');} catch {console.log('BLOCKED');}
  `;
  const run = () => promisify(execFile)(process.execPath, ["--input-type=module", "-e", code], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), timeout: 10_000, maxBuffer: 4096,
  });
  const outputs = await Promise.all([run(), run()]);
  assert.deepEqual(outputs.map(r => r.stdout.trim()).sort(), ["BLOCKED", "CLAIMED"]);
  assert.equal((await events(f)).length, 1);
});
test("an interrupted attempt with captured identity and no final marker blocks a restarted exercise", async () => {
  const f = await fixture(), lease = await f.journal.claim(f.review);
  await f.journal.capture(lease, f.intent); await f.journal.enter(lease);
  await assert.rejects(exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, journal: await createAttemptJournal(f.namespace) }), /ATTEMPT_ALREADY_CLAIMED/u);
  assert.equal((await events(f))[1].intent.transaction_hash, refs.tx); assert.equal((await events(f)).length, 3);
  assert.deepEqual(f.counters(), { prepared: 0, invoked: 0 });
});
test("an existing directory junction cannot redirect the journal writes", async t => {
  const f = await fixture(), namespace = `test-${randomUUID()}`;
  const link = new URL(`../../.local/testnet-mvp/single-attempt/${namespace}`, import.meta.url);
  try { await symlink(fileURLToPath(f.directory), link, process.platform === "win32" ? "junction" : "dir"); }
  catch (e) {
    if (e instanceof Error && "code" in e && (e.code === "EPERM" || e.code === "EACCES")) { t.skip("OS denies isolated test junction creation; no security settings changed."); return; }
    throw e;
  }
  await assert.rejects(createAttemptJournal(namespace), /UNSAFE_ATTEMPT_JOURNAL_PATH/u);
  assert.deepEqual(await readdir(f.directory), []);
});
test("wrong request identity and stalled preparation never reach invocation", async () => {
  const f = await fixture();
  const wrong = await exerciseSingleAttempt(f.review, f.confirmation, { ...f.ports, prepareIdentity: async () => ({
    intent: { ...f.intent, proposal: { ...f.intent.proposal, request_id: "other" } }, invoke: async () => assert.fail("WRONG_REQUEST"),
  }) });
  assert.equal(wrong.status, "STOPPED_BEFORE_INVOCATION");
  const g = await fixture();
  const stalled = await exerciseSingleAttempt(g.review, g.confirmation, { ...g.ports, invocationTimeoutMs: 10,
    freshReview: async () => g.review, prepareIdentity: () => new Promise<never>(() => {}) });
  assert.equal(stalled.status, "STOPPED_BEFORE_INVOCATION"); assert.equal((await events(g)).length, 1);
});
