/** Full local composition only; no public account, secret input, transfer or provisioning. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createAttemptJournal } from "../../scripts/near/attempt-journal.ts";
import { createLocalKeyGuard } from "../../scripts/near/local-key-guard.ts";
import { exerciseLocalSignedRun } from "../../scripts/near/local-runner-exercise.ts";
import { signedRunFixture, acknowledgeTransport } from "./helpers/signed-run.ts";

async function fixture() {
  const f = await signedRunFixture(), namespace = `runner-${randomUUID()}`;
  const journal = await createAttemptJournal(namespace), keyGuard = await createLocalKeyGuard(namespace);
  const attemptDirectory = new URL(`../../.local/testnet-mvp/single-attempt/${namespace}/`, import.meta.url);
  const keyDirectory = new URL(`../../.local/testnet-mvp/key-guard/${namespace}/`, import.meta.url);
  const ports = { journal, keyGuard, signer: f.signer, freshReview: async () => f.review, transport: acknowledgeTransport(), nowNs: () => 30n };
  return { ...f, namespace, ports, attemptDirectory, keyDirectory };
}
test("request claim -> key claim -> signature/hash capture -> request identity -> entry -> one byte-send, never settlement", async () => {
  const f = await fixture(); let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    const attempts = await readdir(f.attemptDirectory), keys = await readdir(f.keyDirectory);
    assert.equal(attempts.length, 3); assert.equal(keys.length, 2);
    const attemptMarkers = await Promise.all(attempts.map(async name => JSON.parse(await readFile(new URL(name, f.attemptDirectory), "utf8"))));
    const keyMarkers = await Promise.all(keys.map(async name => JSON.parse(await readFile(new URL(name, f.keyDirectory), "utf8"))));
    const identity = attemptMarkers.find(m => m.event === "IDENTITY_CAPTURED").intent.transaction_hash;
    assert.equal(keyMarkers.find(m => m.event === "SIGNED_IDENTITY_CAPTURED").transaction_hash, identity);
    assert.ok(attemptMarkers.some(m => m.event === "INVOCATION_ENTERED"));
    return acknowledgeTransport()(url, init);
  };
  const result = await exerciseLocalSignedRun(f.review, f.confirmation, { ...f.ports, transport });
  assert.equal(result.status, "RETURNED_UNVERIFIED"); assert.equal(result.broadcast?.status, "ACKNOWLEDGED_UNVERIFIED");
  assert.equal(result.payment_evidence, "NOT_OBSERVED"); assert.equal(result.public_execution, false); assert.equal(calls, 1);
  const restarted = { ...f.ports, journal: await createAttemptJournal(f.namespace), keyGuard: await createLocalKeyGuard(f.namespace) };
  await assert.rejects(exerciseLocalSignedRun(f.review, f.confirmation, restarted), /ATTEMPT_ALREADY_CLAIMED/u);
});
test("competing requests using the same local key can sign/send only one", async () => {
  const f = await fixture(), g = await signedRunFixture(f.signer, "hosting"); let calls = 0;
  const transport = acknowledgeTransport(() => calls++);
  const results = await Promise.all([exerciseLocalSignedRun(f.review, f.confirmation, { ...f.ports, transport }),
    exerciseLocalSignedRun(g.review, g.confirmation, { ...f.ports, freshReview: async () => g.review, transport })]);
  assert.deepEqual(results.map(r => r.status).sort(), ["RETURNED_UNVERIFIED", "STOPPED_BEFORE_INVOCATION"]);
  assert.equal(calls, 1); assert.equal((await readdir(f.keyDirectory)).length, 2);
});
test("RPC acknowledgement errors are unknown and both durable claims survive restart without re-sign/send", async () => {
  const f = await fixture(); let calls = 0;
  const transport: typeof fetch = async () => { calls++; throw new Error("PRIVATE_RETRY_CANARY"); };
  const result = await exerciseLocalSignedRun(f.review, f.confirmation, { ...f.ports, transport });
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.equal(result.broadcast?.status, "RESULT_UNKNOWN"); assert.ok(result.intent?.transaction_hash);
  assert.equal(result.journal_completion, "RECORDED"); assert.ok(!JSON.stringify(result).includes("CANARY"));
  const g = await signedRunFixture(f.signer, "different-request");
  const next = await exerciseLocalSignedRun(g.review, g.confirmation, { ...f.ports, freshReview: async () => g.review, transport });
  assert.equal(next.status, "STOPPED_BEFORE_INVOCATION"); assert.equal(calls, 1);
});
test("key marker fault before signature prevents any byte-send and does not reopen request", async () => {
  const f = await fixture(); let calls = 0;
  const result = await exerciseLocalSignedRun(f.review, f.confirmation, { ...f.ports, transport: acknowledgeTransport(() => calls++),
    keyGuard: { ...f.ports.keyGuard, claim: async () => { throw new Error("GUARD_IO_CANARY"); } } });
  assert.equal(result.status, "STOPPED_BEFORE_INVOCATION"); assert.equal(result.intent, null); assert.equal(result.broadcast, null);
  assert.equal(calls, 0); assert.equal((await readdir(f.attemptDirectory)).length, 1); assert.equal((await readdir(f.keyDirectory)).length, 0);
  await assert.rejects(exerciseLocalSignedRun(f.review, f.confirmation, f.ports), /ATTEMPT_ALREADY_CLAIMED/u);
});
test("failure after signing retains key hash even if request identity could not yet be captured", async () => {
  const f = await fixture(); let calls = 0;
  const result = await exerciseLocalSignedRun(f.review, f.confirmation, { ...f.ports, transport: acknowledgeTransport(() => calls++),
    journal: { ...f.ports.journal, capture: async () => { throw new Error("REQUEST_IDENTITY_IO_CANARY"); } } });
  assert.equal(result.status, "STOPPED_BEFORE_INVOCATION"); assert.equal(result.intent, null); assert.equal(calls, 0);
  const keys = await readdir(f.keyDirectory); assert.equal(keys.length, 2);
  const hash = JSON.parse(await readFile(new URL(keys[1], f.keyDirectory), "utf8")).transaction_hash; assert.equal(typeof hash, "string");
  await assert.rejects(f.ports.keyGuard.claim(f.review, f.confirmation, 30n), /KEY_ALREADY_CLAIMED/u);
});
test("expiry during guard I/O, abort before start and default fetch cannot sign or enter transport", async () => {
  const f = await fixture(); let now = 30n, calls = 0;
  const result = await exerciseLocalSignedRun(f.review, f.confirmation, { ...f.ports, nowNs: () => now,
    transport: acknowledgeTransport(() => calls++), keyGuard: { ...f.ports.keyGuard, claim: async (review, consent, time) => {
      const lease = await f.ports.keyGuard.claim(review, consent, time); now = BigInt(review.expires_at_ns); return lease;
    } } });
  assert.equal(result.status, "STOPPED_BEFORE_INVOCATION"); assert.equal(calls, 0); assert.equal((await readdir(f.keyDirectory)).length, 1);
  const g = await fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(exerciseLocalSignedRun(g.review, g.confirmation, { ...g.ports, signal: controller.signal }), /CANCELLED_BEFORE/u);
  await assert.rejects(exerciseLocalSignedRun(g.review, g.confirmation, { ...g.ports, transport: fetch }), /INJECTED_TRANSPORT_REQUIRED/u);
  assert.equal((await readdir(g.attemptDirectory)).length, 0); assert.equal((await readdir(g.keyDirectory)).length, 0);
});
test("outer invocation timeout retains signed identity/entry; a late acknowledgement cannot modify the returned result", async () => {
  const f = await fixture(); let calls = 0, complete: (response: Response) => void = () => {};
  const transport: typeof fetch = async () => { calls++; return new Promise(resolve => { complete = resolve; }); };
  // Keep preparation budget comfortable: injected timeouts are tested separately at 10ms by the send seam.
  const result = await exerciseLocalSignedRun(f.review, f.confirmation, { ...f.ports, transport, timeoutMs: 300 });
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.ok(result.intent?.transaction_hash); assert.equal(result.payment_evidence, "NOT_OBSERVED");
  const saved = JSON.stringify(result);
  complete(Response.json({ jsonrpc: "2.0", id: `runlatch-local-broadcast-${result.intent?.transaction_hash}`, result: result.intent?.transaction_hash }));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(JSON.stringify(result), saved); assert.equal(calls, 1);
  assert.equal((await readdir(f.attemptDirectory)).length, 4); assert.equal((await readdir(f.keyDirectory)).length, 2);
});
test("journal failure after a valid acknowledgement never discards identity or invites another signed run", async () => {
  const f = await fixture(); let calls = 0;
  const result = await exerciseLocalSignedRun(f.review, f.confirmation, { ...f.ports, transport: acknowledgeTransport(() => calls++),
    journal: { ...f.ports.journal, finish: async () => { throw new Error("FINAL_MARKER_IO_CANARY"); } } });
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.equal(result.broadcast?.status, "ACKNOWLEDGED_UNVERIFIED");
  assert.equal(result.journal_completion, "NOT_FINALIZED_RETAIN_PRIOR_MARKERS"); assert.ok(result.intent?.transaction_hash);
  assert.equal((await readdir(f.attemptDirectory)).length, 3); assert.equal(calls, 1);
  await assert.rejects(exerciseLocalSignedRun(f.review, f.confirmation, f.ports), /ATTEMPT_ALREADY_CLAIMED/u);
});
