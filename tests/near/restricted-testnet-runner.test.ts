/** SYNTHETIC ONLY: generated ephemeral signatures, RPC fixtures/local markers, no real accounts or network. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { confirmTestnetAgentRun } from "../../scripts/near/runner-admission.ts";
import { runRestrictedTestnetPurchase } from "../../scripts/near/restricted-testnet-runner.ts";
import { createSequentialKey, createLocalSequentialKey } from "../../scripts/near/local-sequential-key.ts";
import { createLocalKeyGuard } from "../../scripts/near/local-key-guard.ts";
import { createInjectedTestnetSigning, disposeRestrictedProcessKey } from "../../scripts/near/restricted-process-key.ts";
import { preparePurchaseReview } from "../../src/lib/near/action-review.ts";
import { inspectSignedAgentEnvelope } from "../../scripts/near/signature-envelope.ts";
import { readSignedAgentNonce } from "../../scripts/near/read-signed-agent-nonce.ts";
import { testnetRunFixture, runConsent, currentRunReader, priorRunReader } from "./helpers/testnet-runner.ts";
import { injectedKeyFixture } from "./helpers/process-key.ts";
import { nextRunFixture, reconciliationFixture } from "./helpers/nonce-reconciliation.ts";

test("exact confirmation -> fresh shared RPC review -> request/key claim -> signature/hash capture -> ONE bounded send, never settlement", async () => {
  const t = await testnetRunFixture(), approval = t.confirm(); let entered = 0, signed: ReturnType<typeof inspectSignedAgentEnvelope> | null = null;
  const transport: typeof fetch = async (url, init) => {
    entered++;
    assert.equal(url, t.f.target.rpc_url); assert.equal(init?.method, "POST"); assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error"); assert.equal(init.referrerPolicy, "no-referrer"); assert.equal(init.cache, "no-store");
    const r = JSON.parse(String(init.body)); assert.equal(r.method, "broadcast_tx_async"); assert.equal(r.params.length, 1);
    signed = inspectSignedAgentEnvelope(Buffer.from(r.params[0], "base64"));
    assert.equal(signed.transaction.method, "submit_purchase"); assert.equal(signed.transaction.attached_deposit, "0"); assert.equal(signed.transaction.nonce, "8");
    const req = await readdir(new URL(`../../.local/testnet-mvp/single-attempt/${t.namespace}/`, import.meta.url));
    const keys = await readdir(new URL(`../../.local/testnet-mvp/key-guard/${t.namespace}/`, import.meta.url));
    assert.equal(req.length, 3); assert.equal(keys.length, 4);
    for (const [folder, files] of [["single-attempt", req], ["key-guard", keys]] as const) {
      const text = (await Promise.all(files.map(n => readFile(new URL(`../../.local/testnet-mvp/${folder}/${t.namespace}/${n}`, import.meta.url), "utf8")))).join("");
      assert.ok(text.includes(signed.transaction_hash)); assert.ok(!/privateKey|PRIVATE_KEY|signed_bytes/u.test(text));
    }
    return Response.json({ jsonrpc: "2.0", id: r.id, result: signed.transaction_hash });
  };
  const result = await runRestrictedTestnetPurchase(approval, t.key.handle, { ...t.ports, transport });
  assert.equal(result.status, "RETURNED_UNVERIFIED"); assert.equal(result.broadcast?.status, "ACKNOWLEDGED_UNVERIFIED"); assert.equal(entered, 1);
  assert.equal(result.identity?.transaction.nonce, "8"); assert.equal(result.payment_evidence, "NOT_OBSERVED");
  assert.equal(result.transport_source, "INJECTED_TEST_TRANSPORT_NOT_CHAIN_EVIDENCE"); assert.equal(result.public_execution, "NOT_PROVEN");
  assert.ok(!("signed_bytes" in result)); assert.equal(result.grants_payment_authority, false);
  assert.ok(t.read.calls.some(c => c.params.method_name === "get_quote"));
  await assert.rejects(runRestrictedTestnetPurchase(approval, t.key.handle, { ...t.ports, transport }), /CONFIRMATION_CONSUMED/u);
  // Fresh prior observation fails first: no finalized RPC evidence was supplied for the original.
  await assert.rejects(t.run(), /FRESH_REVIEW_UNAVAILABLE/u); assert.equal(entered, 1);
  disposeRestrictedProcessKey(t.key.handle);
});

test("one explicit call requires exact account/code/endpoint/key/gas/args/native exposure and allowance consent; getters never run", async () => {
  const t = await testnetRunFixture(), c = runConsent(t.f);
  const changes = [{ calls: 2 }, { consent: false }, { authorization: "AI_APPROVED" }, { target: { ...c.target, contract_id: "other.testnet" } },
    { target: { ...c.target, rpc_url: "https://test.rpc.fastnear.com/" } }, { target: { ...c.target, expected_code_hash: "3".repeat(32) } },
    { call: { ...c.call, gas: "1" } }, { call: { ...c.call, attached_deposit: "1" } }, { exposure: { ...c.exposure, amount_due_now: "51" } },
    { scope: { ...c.scope, max_allowance: "1" } }, { scope: { ...c.scope, agent_id: "other.testnet" } }, { secret: "PRIVATE_CANARY" }];
  for (const patch of changes) assert.throws(() => confirmTestnetAgentRun(t.f.review, { ...c, ...patch }, t.namespace));
  let invoked = false;
  assert.throws(() => confirmTestnetAgentRun(t.f.review, { ...c, get scope() { invoked = true; throw Error("PRIVATE_CANARY"); } }, t.namespace));
  assert.equal(invoked, false); assert.equal(t.sends(), 0); disposeRestrictedProcessKey(t.key.handle);
});

test("forged/clone admission and process key, substituted reader/transport or invalid deadline rejected before I/O", async () => {
  const t = await testnetRunFixture(), c = t.confirm();
  await assert.rejects(runRestrictedTestnetPurchase({ ...c }, t.key.handle, t.ports), /UNISSUED_TESTNET_RUN_CONFIRMATION/u);
  await assert.rejects(runRestrictedTestnetPurchase(c, { ...t.key.handle }, t.ports), /UNISSUED_PROCESS_KEY_HANDLE/u);
  await assert.rejects(runRestrictedTestnetPurchase(c, t.key.handle, { ...t.ports, reader: { ...t.ports.reader, target: { ...t.f.target, contract_id: "other.testnet" } } }), /READER_TARGET_MISMATCH/u);
  await assert.rejects(runRestrictedTestnetPurchase(c, t.key.handle, { ...t.ports, transport: globalThis.fetch }), /INJECTED_TRANSPORT_REQUIRED/u);
  for (const timeoutMs of [0, 15_001, 1.2]) await assert.rejects(runRestrictedTestnetPurchase(c, t.key.handle, { ...t.ports, timeoutMs }), /INVALID_INVOCATION_TIMEOUT/u);
  assert.equal(t.read.calls.length, 0); assert.equal(t.sends(), 0); disposeRestrictedProcessKey(t.key.handle);
});

test("HTTP mode fixes production namespace/clock/native transport without invoking network; LOCAL APIs still refuse HTTP", async () => {
  const t = await testnetRunFixture(), http = await preparePurchaseReview(t.f.target, t.f.action, { ...t.f.context, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" });
  const c = { ...runConsent(t.f), review_hash: http.review_hash };
  assert.throws(() => confirmTestnetAgentRun(http, c, t.namespace), /PUBLIC_RUN_NAMESPACE_FIXED/u);
  const admission = confirmTestnetAgentRun(http, c);
  assert.equal(admission.namespace, "working-mvp");
  await assert.rejects(runRestrictedTestnetPurchase(admission, t.key.handle, t.ports), /PUBLIC_RUN_CLOCK_FIXED/u);
  await assert.rejects(runRestrictedTestnetPurchase(admission, t.key.handle, { reader: t.ports.reader, transport: t.ports.transport }), /PUBLIC_RUN_NATIVE_TRANSPORT_REQUIRED/u);
  assert.throws(() => t.key.signer.signReview(http, http, { consent: true, review_hash: http.review_hash }, 30n), /PUBLIC_SIGNING_NOT_ADMITTED/u);
  assert.equal(t.sends(), 0); disposeRestrictedProcessKey(t.key.handle);
});

test("owner/changed call/stale or unissued fresh review refuses before claim/sign/send and never owner fallback", async () => {
  const t = await testnetRunFixture(), other = await preparePurchaseReview(t.f.target, { ...t.f.action, gas: "1" }, t.f.context);
  for (const fresh of [other, { ...t.f.review }]) {
    await assert.rejects(runRestrictedTestnetPurchase(t.confirm(), t.key.handle, { ...t.ports, reader: { ...t.ports.reader, readPurchaseReview: async () => fresh } }), /ACTION_REVIEW_CHANGED|UNISSUED_ACTION_REVIEW/u);
  }
  const owner = { ...t.f.review, action: { ...t.f.action, method: "approve_purchase" as const } };
  assert.throws(() => confirmTestnetAgentRun(owner, runConsent(t.f), t.namespace), /UNISSUED_ACTION_REVIEW/u);
  await assert.rejects(runRestrictedTestnetPurchase(t.confirm(), t.key.handle, { ...t.ports, testNowNs: () => BigInt(t.f.review.expires_at_ns) }), /REVIEW_EXPIRED/u);
  assert.equal(t.sends(), 0); disposeRestrictedProcessKey(t.key.handle);
});

test("wrong/ disposed injected key cannot sign or select recovery/owner authority", async () => {
  const t = await testnetRunFixture(), other = injectedKeyFixture();
  await assert.rejects(runRestrictedTestnetPurchase(t.confirm(), other.handle, t.ports), /KEY_SCOPE_REVIEW_MISMATCH/u);
  disposeRestrictedProcessKey(t.key.handle);
  await assert.rejects(runRestrictedTestnetPurchase(t.confirm(), t.key.handle, t.ports), /PROCESS_KEY_DISPOSED/u);
  assert.equal(t.read.calls.length, 0); assert.equal(t.sends(), 0); disposeRestrictedProcessKey(other.handle);
});

test("unknown response/HTTP error/wrong hash/duplicate fields retain captured identity and claims; NO repeat", async () => {
  for (const mode of ["throw", "http", "hash", "duplicate"]) {
    const t = await testnetRunFixture(); let calls = 0;
    const transport: typeof fetch = async (_url, init) => {
      calls++; const r = JSON.parse(String(init?.body));
      if (mode === "throw") throw Error("PRIVATE_CANARY");
      if (mode === "http") return new Response("PRIVATE_CANARY", { status: 503 });
      if (mode === "hash") return Response.json({ jsonrpc: "2.0", id: r.id, result: "2".repeat(32) });
      return new Response(`{"jsonrpc":"2.0","id":"${r.id}","result":"PRIVATE_CANARY","result":"PRIVATE_CANARY"}`, { headers: { "content-type": "application/json" } });
    };
    const ports = { ...t.ports, transport }, result = await runRestrictedTestnetPurchase(t.confirm(), t.key.handle, ports);
    assert.equal(result.status, "RESULT_UNKNOWN"); assert.ok(result.identity); assert.ok(result.intent);
    assert.equal(result.broadcast?.status, "RESULT_UNKNOWN"); assert.equal(calls, 1); assert.ok(!JSON.stringify(result).includes("PRIVATE_CANARY"));
    await assert.rejects(runRestrictedTestnetPurchase(t.confirm(), t.key.handle, ports), /FRESH_REVIEW_UNAVAILABLE/u); assert.equal(calls, 1);
    disposeRestrictedProcessKey(t.key.handle);
  }
});

test("timeout/cancel/late transport response never finalizes settlement, releases markers or sends again", { timeout: 10_000 }, async context => {
  const t = await testnetRunFixture(); let calls = 0, late: (() => void) | undefined;
  context.after(() => disposeRestrictedProcessKey(t.key.handle));
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let entered: () => void = () => {};
  const transportEntered = new Promise<void>(resolve => { entered = resolve; });
  const transport: typeof fetch = async (_url, init) => { calls++; const r = JSON.parse(String(init?.body));
    return new Promise(resolve => { late = () => resolve(Response.json({ jsonrpc: "2.0", id: r.id, result: r.id.replace("runlatch-local-broadcast-", "") })); entered(); }); };
  const pending = runRestrictedTestnetPurchase(t.confirm(), t.key.handle, { ...t.ports, transport, timeoutMs: 250 });
  // Exercise post-send timeout, not a race with filesystem preparation under CPU load.
  await transportEntered;
  context.mock.timers.tick(249);
  assert.equal(calls, 1);
  context.mock.timers.tick(1);
  const result = await pending;
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.ok(result.identity); assert.equal(calls, 1); late?.();
  await new Promise(resolve => setImmediate(resolve)); assert.equal(result.payment_evidence, "NOT_OBSERVED");
  const cancel = new AbortController(); cancel.abort();
  await assert.rejects(runRestrictedTestnetPurchase(t.confirm(), t.key.handle, { ...t.ports, signal: cancel.signal }), /CANCELLED_BEFORE_INVOCATION/u);
  disposeRestrictedProcessKey(t.key.handle);
});

test("three distinct exact calls re-read prior shared FINAL transfer/callback/key evidence; fourth cannot sign", async () => {
  const t = await testnetRunFixture(); let f = t.f, previous = await t.run();
  assert.equal(previous.status, "RETURNED_UNVERIFIED"); let sends = 1;
  for (const request of ["hosting", "adverse"]) {
    const prior = await priorRunReader(f, previous.identity!), next = await nextRunFixture(f, previous.identity!.transaction.nonce, request), current = currentRunReader(next);
    const admission = t.confirm(next), result = await runRestrictedTestnetPurchase(admission, t.key.handle, {
      reader: { ...current.reader, reconcileAgentNonce: prior.reader.reconcileAgentNonce }, transport: async (_url, init) => {
        sends++; const r = JSON.parse(String(init?.body)); return Response.json({ jsonrpc: "2.0", id: r.id, result: r.id.replace("runlatch-local-broadcast-", "") }); },
      testNowNs: () => BigInt(next.review.reviewed_at_ns) });
    assert.equal(result.status, "RETURNED_UNVERIFIED"); assert.equal(prior.calls.filter(c => c.method === "tx_status").length, 1);
    assert.equal(result.identity?.transaction.nonce, (BigInt(previous.identity!.transaction.nonce) + 1n).toString());
    f = next; previous = result;
  }
  assert.equal(sends, 3);
  const fourth = await nextRunFixture(f, "10", "fourth"), admission = t.confirm(fourth), coordinator = await createSequentialKey(t.namespace, admission);
  await assert.rejects(coordinator.forRun().claim(fourth.review, fourth.confirmation, BigInt(fourth.review.reviewed_at_ns)), /RUN_LIMIT/u);
  disposeRestrictedProcessKey(t.key.handle);
});

test("pending or approval-pending prior cannot unlock another request after restart", async () => {
  for (const state of ["SETTLEMENT_PENDING", "APPROVAL_PENDING"]) {
    const t = await testnetRunFixture(), first = await t.run(), next = await nextRunFixture(t.f, "8"), prior = await priorRunReader(t.f, first.identity!, state);
    const reader = { ...currentRunReader(next).reader, reconcileAgentNonce: prior.reader.reconcileAgentNonce };
    await assert.rejects(runRestrictedTestnetPurchase(t.confirm(next), t.key.handle, { ...t.ports, reader, testNowNs: () => 40n }), /FRESH_REVIEW_UNAVAILABLE/u);
    assert.equal(t.sends(), 1); disposeRestrictedProcessKey(t.key.handle);
  }
});

test("new coordinator accepts only issued identity-bound readbacks, not LOCAL evidence or clones", async () => {
  const t = await testnetRunFixture(), first = await t.run(), next = await nextRunFixture(t.f, "8"), admission = t.confirm(next), coordinator = await createSequentialKey(t.namespace, admission);
  const local = (await reconciliationFixture(t.f, first.identity!)).reconcile();
  assert.throws(() => coordinator.forRun(local), /UNISSUED_SIGNED_AGENT_NONCE/u);
  const prior = await priorRunReader(t.f, first.identity!), readback = await readSignedAgentNonce(prior.reader, first.identity!, admission.scope);
  assert.throws(() => coordinator.forRun({ ...readback }), /UNISSUED_SIGNED_AGENT_NONCE/u);
  const legacy = await createLocalSequentialKey(t.namespace);
  // @ts-expect-error LOCAL coordinator must still refuse the differently issued token at runtime.
  assert.throws(() => legacy.forRun(readback), /UNISSUED_NONCE_RECONCILIATION/u);
  disposeRestrictedProcessKey(t.key.handle);
});

test("legacy one-shot anchor and partial capture remain blocking with no migration/cleanup", async () => {
  const t = await testnetRunFixture(), anchor = await createLocalKeyGuard(t.namespace);
  await anchor.claim(t.f.review, t.f.confirmation, 30n);
  const result = await t.run(); assert.equal(result.status, "STOPPED_BEFORE_INVOCATION"); assert.equal(t.sends(), 0);
  const other = await testnetRunFixture(), admission = other.confirm(), guard = (await createSequentialKey(other.namespace, admission)).forRun();
  const lease = await guard.claim(other.f.review, other.f.confirmation, 30n);
  const file = new URL(`../../.local/testnet-mvp/key-guard/${other.namespace}/${lease.key_guard_id}.seq.0.signed.json`, import.meta.url);
  await writeFile(file, "PARTIAL", { flag: "wx" });
  await assert.rejects(other.run(), /FRESH_REVIEW_UNAVAILABLE/u); assert.equal(await readFile(file, "utf8"), "PARTIAL"); assert.equal(other.sends(), 0);
  disposeRestrictedProcessKey(t.key.handle); disposeRestrictedProcessKey(other.key.handle);
});

test("admitted/local adapters share consumed requests and disposal; no new adapter can re-sign the original", async () => {
  const t = await testnetRunFixture(), admission = t.confirm(), signer = createInjectedTestnetSigning(t.key.handle, admission);
  const signed = signer.signReview(t.f.review, t.f.review, t.f.confirmation, 30n); assert.equal(signed.signature_verified, true);
  assert.throws(() => t.key.signer.signReview(t.f.review, t.f.review, t.f.confirmation, 30n), /SIGNATURE_ALREADY_PREPARED/u);
  disposeRestrictedProcessKey(t.key.handle);
  assert.throws(() => signer.signReview(t.f.review, t.f.review, t.f.confirmation, 30n), /PROCESS_KEY_DISPOSED/u);
});

test("competing exact confirmations for two distinct requests/key get only one bootstrap claim/sign/send", async () => {
  const t = await testnetRunFixture(), other = await nextRunFixture(t.f, "7", "alternative"); let entered = 0, sends = 0, release: (() => void) | undefined;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const run = (f: typeof t.f) => runRestrictedTestnetPurchase(t.confirm(f), t.key.handle, {
    reader: { ...currentRunReader(f).reader, readPurchaseReview: async () => { if (++entered === 2) release!(); await barrier; return f.review; } },
    transport: async (_url, init) => { sends++; const r = JSON.parse(String(init?.body));
      return Response.json({ jsonrpc: "2.0", id: r.id, result: r.id.replace("runlatch-local-broadcast-", "") }); }, testNowNs: () => BigInt(f.review.reviewed_at_ns) });
  const results = await Promise.all([run(t.f), run(other)]);
  assert.deepEqual(results.map(r => r.status).sort(), ["RETURNED_UNVERIFIED", "STOPPED_BEFORE_INVOCATION"]); assert.equal(sends, 1);
  disposeRestrictedProcessKey(t.key.handle);
});

test("public next nonce must itself be safely readable; existing exact codec support does not repair unsafe RPC", async () => {
  const t = await testnetRunFixture(), review = await preparePurchaseReview(t.f.target, t.f.action, { ...t.f.context,
    access: { ...t.f.context.access, nonce: String(Number.MAX_SAFE_INTEGER) } });
  const data = { ...t.f, review }, admission = confirmTestnetAgentRun(review, runConsent(data), t.namespace), signer = createInjectedTestnetSigning(t.key.handle, admission);
  assert.throws(() => signer.signReview(review, review, { consent: true, review_hash: review.review_hash }, 30n), /RECONCILIATION_NONCE_UNREADABLE/u);
  assert.equal(t.sends(), 0); disposeRestrictedProcessKey(t.key.handle);
});

test("cancellation during a signal-ignoring acknowledgement retains unknown identity and never enables re-entry", async () => {
  const t = await testnetRunFixture(), cancel = new AbortController(); let sends = 0;
  const result = await runRestrictedTestnetPurchase(t.confirm(), t.key.handle, { ...t.ports, signal: cancel.signal, transport: async (_url, init) => {
    sends++; const r = JSON.parse(String(init?.body)); cancel.abort();
    return Response.json({ jsonrpc: "2.0", id: r.id, result: r.id.replace("runlatch-local-broadcast-", "") }); } });
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.ok(result.identity); assert.equal(result.payment_evidence, "NOT_OBSERVED"); assert.equal(sends, 1);
  disposeRestrictedProcessKey(t.key.handle);
});
