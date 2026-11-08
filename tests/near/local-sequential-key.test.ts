/** Sequential demo slots/ephemeral signing/injected receipts only, no network or fund mutation. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createLocalSequentialKey } from "../../scripts/near/local-sequential-key.ts";
import { createLocalKeyGuard } from "../../scripts/near/local-key-guard.ts";
import { createAttemptJournal } from "../../scripts/near/attempt-journal.ts";
import { exerciseLocalSignedRun } from "../../scripts/near/local-runner-exercise.ts";
import { signedRunFixture, acknowledgeTransport } from "./helpers/signed-run.ts";
import { nextRunFixture, reconciliationFixture } from "./helpers/nonce-reconciliation.ts";
import { preparePurchaseReview } from "../../src/lib/near/action-review.ts";
import { inspectSignedAgentEnvelope } from "../../scripts/near/signature-envelope.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

async function fixture() {
  const f = await signedRunFixture(), namespace = `sequential-${randomUUID()}`, coordinator = await createLocalSequentialKey(namespace);
  const directory = new URL(`../../.local/testnet-mvp/key-guard/${namespace}/`, import.meta.url);
  const run = async (data: typeof f, guard = coordinator.forRun(), counter?: () => void) => exerciseLocalSignedRun(data.review, data.confirmation,
    { journal: await createAttemptJournal(namespace), keyGuard: guard, signer: data.signer, freshReview: async () => data.review,
      transport: acknowledgeTransport(counter), nowNs: () => BigInt(data.review.reviewed_at_ns) });
  return { f, namespace, coordinator, directory, run };
}
test("same key can sign/send three distinct requests only with exact prior reconciliation; permanent anchor stays claimed", async () => {
  const t = await fixture(); let calls = 0, data = t.f;
  const first = await t.run(data, t.coordinator.forRun(), () => calls++); assert.equal(first.status, "RETURNED_UNVERIFIED");
  for (const request of ["hosting", "adverse"]) {
    const identity = (await t.coordinator.lastIdentity(data.review))!;
    const reconciliation = (await reconciliationFixture(data, identity)).reconcile();
    data = await nextRunFixture(data, identity.transaction.nonce, request);
    const result = await t.run(data, t.coordinator.forRun(reconciliation), () => calls++);
    assert.equal(result.status, "RETURNED_UNVERIFIED");
    assert.equal((await t.coordinator.lastIdentity(data.review))!.transaction.nonce, (BigInt(identity.transaction.nonce) + 1n).toString());
  }
  assert.equal(calls, 3); assert.equal((await readdir(t.directory)).length, 8);
  const fourth = await nextRunFixture(data, "10", "fourth");
  await assert.rejects(t.coordinator.forRun().claim(fourth.review, fourth.confirmation, BigInt(fourth.review.reviewed_at_ns)), /RUN_LIMIT/u);
  await assert.rejects((await createLocalKeyGuard(t.namespace)).claim(fourth.review, fourth.confirmation, BigInt(fourth.review.reviewed_at_ns)), /KEY_ALREADY_CLAIMED/u);
  const contents = await Promise.all((await readdir(t.directory)).map(n => readFile(new URL(n, t.directory), "utf8")));
  assert.ok(contents.every(s => !s.includes("privateKey") && !s.includes("signed_bytes")));
});
test("restart requires fresh issued reconciliation; old file or cloned result cannot unlock another nonce", async () => {
  const t = await fixture(); await t.run(t.f);
  const next = await nextRunFixture(t.f, "8"), restart = await createLocalSequentialKey(t.namespace);
  await assert.rejects(restart.forRun().claim(next.review, next.confirmation, 40n), /PRIOR_KEY_ATTEMPT_UNRESOLVED/u);
  const r = (await reconciliationFixture(t.f, (await restart.lastIdentity(next.review))!)).reconcile();
  assert.throws(() => restart.forRun({ ...r }), /UNISSUED_NONCE_RECONCILIATION/u);
  assert.equal((await t.run(next, restart.forRun(r))).status, "RETURNED_UNVERIFIED");
  await assert.rejects(t.run(next, restart.forRun(r)), /ATTEMPT_ALREADY_CLAIMED/u);
});
test("competing next requests/restarted coordinators get only one sequential slot and one signature/send", async () => {
  const t = await fixture(); await t.run(t.f);
  const r = (await reconciliationFixture(t.f, (await t.coordinator.lastIdentity(t.f.review))!)).reconcile();
  const a = await nextRunFixture(t.f, "8", "hosting"), b = await nextRunFixture(t.f, "8", "alternative"); let calls = 0;
  const other = await createLocalSequentialKey(t.namespace);
  const results = await Promise.all([t.run(a, t.coordinator.forRun(r), () => calls++), t.run(b, other.forRun(r), () => calls++)]);
  assert.deepEqual(results.map(r => r.status).sort(), ["RETURNED_UNVERIFIED", "STOPPED_BEFORE_INVOCATION"]); assert.equal(calls, 1);
});
test("legacy one-shot anchor cannot be adopted/reset, even when a valid local terminal observation is supplied", async () => {
  const t = await fixture(), legacy = await createLocalKeyGuard(t.namespace);
  const lease = await legacy.claim(t.f.review, t.f.confirmation, 30n);
  const signed = t.f.signer.signReview(t.f.review, t.f.review, t.f.confirmation, 30n); await legacy.capture(lease, signed.signed_bytes);
  const next = await nextRunFixture(t.f, "8");
  await assert.rejects(t.coordinator.forRun().claim(next.review, next.confirmation, 40n), /KEY_ALREADY_CLAIMED/u);
  const verified = inspectSignedAgentEnvelope(signed.signed_bytes);
  const r = (await reconciliationFixture(t.f, { transaction: verified.transaction, transaction_hash: verified.transaction_hash })).reconcile();
  await assert.rejects(t.coordinator.forRun(r).claim(next.review, next.confirmation, 40n), /UNEXPECTED_PRIOR_RECONCILIATION/u);
  assert.equal((await readdir(t.directory)).length, 2);
});
test("claimed but unsigned/partial marker remains blocking after restart, with no stale-lock release", async () => {
  const t = await fixture(); await t.coordinator.forRun().claim(t.f.review, t.f.confirmation, 30n);
  const next = await nextRunFixture(t.f, "7"), restart = await createLocalSequentialKey(t.namespace);
  await assert.rejects(restart.forRun().claim(next.review, next.confirmation, 40n), /PRIOR_KEY_ATTEMPT_UNRESOLVED/u);
  const claim = (await readdir(t.directory)).find(n => n.endsWith(".seq.0.claim.json"))!;
  const signed = new URL(claim.replace(".claim.json", ".signed.json"), t.directory); await writeFile(signed, "PARTIAL", { flag: "wx" });
  await assert.rejects(restart.lastIdentity(next.review)); assert.equal(await readFile(signed, "utf8"), "PARTIAL");
});
test("wrong prior identity, observed nonce, target or block cannot unlock a new slot", async () => {
  const t = await fixture(); await t.run(t.f);
  const r = (await reconciliationFixture(t.f, (await t.coordinator.lastIdentity(t.f.review))!)).reconcile();
  const wrong = (await reconciliationFixture(await signedRunFixture())).reconcile();
  const next = await nextRunFixture(t.f, "8"), differentNonce = await nextRunFixture(t.f, "9");
  await assert.rejects(t.coordinator.forRun(wrong).claim(next.review, next.confirmation, 40n), /RECONCILIATION_MISMATCH/u);
  await assert.rejects(t.coordinator.forRun(r).claim(differentNonce.review, differentNonce.confirmation, 40n), /RECONCILIATION_MISMATCH/u);
  assert.equal((await readdir(t.directory)).length, 4);
});
test("signed identity corruption/extra fields are refused; capture stage is exclusive and no marker is overwritten", async () => {
  const t = await fixture(), guard = t.coordinator.forRun(), lease = await guard.claim(t.f.review, t.f.confirmation, 30n);
  const signed = t.f.signer.signReview(t.f.review, t.f.review, t.f.confirmation, 30n);
  await assert.rejects(guard.capture({ ...lease }, signed.signed_bytes), /UNISSUED_SEQUENTIAL_LEASE/u);
  const results = await Promise.allSettled([guard.capture(lease, signed.signed_bytes), guard.capture(lease, signed.signed_bytes)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const marker = new URL((await readdir(t.directory)).find(n => n.endsWith(".seq.0.signed.json"))!, t.directory);
  const contents = JSON.parse(await readFile(marker, "utf8")); contents.identity.transaction.nonce = "9";
  await writeFile(marker, JSON.stringify(contents)); await assert.rejects(t.coordinator.lastIdentity(t.f.review), /IDENTITY_HASH_MISMATCH/u);
});
test("HTTP/clone/expired review cannot create a sequential marker or anchor", async () => {
  const t = await fixture();
  await assert.rejects(t.coordinator.forRun().claim({ ...t.f.review }, t.f.confirmation, 30n), /UNISSUED_ACTION_REVIEW/u);
  await assert.rejects(t.coordinator.forRun().claim(t.f.review, t.f.confirmation, BigInt(t.f.review.expires_at_ns)), /REVIEW_EXPIRED/u);
  const http = await preparePurchaseReview(t.f.target, t.f.action, { ...t.f.context, transport_source: "EXPLICIT_TESTNET_HTTP_READBACK" });
  await assert.rejects(t.coordinator.forRun().claim(http, { consent: true, review_hash: http.review_hash }, 30n), /PUBLIC_SEQUENTIAL_KEY_NOT_ADMITTED/u);
  assert.deepEqual(await readdir(t.directory), []);
});
test("two separate Node processes with independently issued prior observations compete for one next slot", async () => {
  const t = await fixture(); await t.run(t.f);
  const prior = await reconciliationFixture(t.f, (await t.coordinator.lastIdentity(t.f.review))!);
  const next = await nextRunFixture(t.f, "8");
  // These public records contain no secret or signing port. Each child issues its own LOCAL observation/review.
  const code = `
    import {createLocalSequentialKey} from './scripts/near/local-sequential-key.ts';
    import {reconcileLocalAgentNonce} from './scripts/near/local-nonce-reconciliation.ts';
    import {preparePurchaseReview} from './src/lib/near/action-review.ts';
    const prior=reconcileLocalAgentNonce(${JSON.stringify(prior.input)});
    const review=await preparePurchaseReview(${JSON.stringify(next.target)},${JSON.stringify(next.action)},${JSON.stringify(next.context)});
    const coordinator=await createLocalSequentialKey(${JSON.stringify(t.namespace)});
    try {await coordinator.forRun(prior).claim(review,{consent:true,review_hash:review.review_hash},40n);console.log('CLAIMED');}
    catch {console.log('BLOCKED');}
  `;
  const run = () => promisify(execFile)(process.execPath, ["--input-type=module", "-e", code], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), timeout: 10_000, maxBuffer: 4096 });
  assert.deepEqual((await Promise.all([run(), run()])).map(r => r.stdout.trim()).sort(), ["BLOCKED", "CLAIMED"]);
  assert.equal((await readdir(t.directory)).length, 5);
});
test("unknown send keeps the original request/key identity; exact later local final evidence advances only a distinct request", async () => {
  const t = await fixture(); let calls = 0;
  const journal = await createAttemptJournal(t.namespace);
  const result = await exerciseLocalSignedRun(t.f.review, t.f.confirmation, { journal, keyGuard: t.coordinator.forRun(), signer: t.f.signer,
    freshReview: async () => t.f.review, nowNs: () => 30n, transport: async () => { calls++; throw new Error("UNKNOWN_CANARY"); } });
  assert.equal(result.status, "RESULT_UNKNOWN"); assert.ok(result.intent?.transaction_hash); assert.equal(calls, 1);
  const next = await nextRunFixture(t.f, "8");
  await assert.rejects(t.coordinator.forRun().claim(next.review, next.confirmation, 40n), /PRIOR_KEY_ATTEMPT_UNRESOLVED/u);
  const r = (await reconciliationFixture(t.f, (await t.coordinator.lastIdentity(t.f.review))!)).reconcile();
  await assert.rejects(t.run(t.f, t.coordinator.forRun(r)), /ATTEMPT_ALREADY_CLAIMED/u);
  assert.equal((await t.run(next, t.coordinator.forRun(r), () => calls++)).status, "RETURNED_UNVERIFIED"); assert.equal(calls, 2);
});
test("orphan/gap/oversized/partial capture markers stay fail-closed and are never repaired", async () => {
  const t = await fixture(), guard = t.coordinator.forRun(), lease = await guard.claim(t.f.review, t.f.confirmation, 30n);
  const partial = new URL(`${lease.key_guard_id}.seq.0.signed.json`, t.directory); await writeFile(partial, "PARTIAL", { flag: "wx" });
  const signed = t.f.signer.signReview(t.f.review, t.f.review, t.f.confirmation, 30n);
  await assert.rejects(guard.capture(lease, signed.signed_bytes)); await assert.rejects(guard.capture(lease, signed.signed_bytes), /STAGE_MISMATCH/u);
  assert.equal(await readFile(partial, "utf8"), "PARTIAL");
  const orphan = await fixture(); await orphan.run(orphan.f);
  const key = (await readdir(orphan.directory))[0].slice(0, 64);
  await writeFile(new URL(`${key}.seq.2.signed.json`, orphan.directory), "{}", { flag: "wx" });
  await assert.rejects(orphan.coordinator.lastIdentity(orphan.f.review), /ORPHAN_SEQUENTIAL_MARKER/u);
  const large = await fixture(); await large.run(large.f);
  const marker = new URL((await readdir(large.directory)).find(n => n.endsWith("seq.0.signed.json"))!, large.directory);
  await writeFile(marker, "x".repeat(16_385)); await assert.rejects(large.coordinator.lastIdentity(large.f.review), /UNSAFE_SEQUENTIAL_MARKER/u);
});
test("changed target, allowance/recovery scope or older/mixed block cannot use an issued reconciliation", async () => {
  const t = await fixture(); await t.run(t.f);
  const r = (await reconciliationFixture(t.f, (await t.coordinator.lastIdentity(t.f.review))!)).reconcile();
  const next = await nextRunFixture(t.f, "8");
  const variants = [
    await preparePurchaseReview({ ...next.target, rpc_url: "https://test.rpc.fastnear.com/" }, next.action, next.context),
    await preparePurchaseReview(next.target, next.action, { ...next.context, access: { ...next.context.access, allowance: "1" } }),
    await preparePurchaseReview(next.target, next.action, { ...next.context, block: { ...next.context.block, height: 39, timestamp_ns: "39" } }),
    await preparePurchaseReview(next.target, next.action, { ...next.context, block: { ...next.context.block, hash: t.f.review.reviewed_block.hash } }),
  ];
  for (const review of variants) await assert.rejects(t.coordinator.forRun(r).claim(review, { consent: true, review_hash: review.review_hash }, BigInt(review.reviewed_at_ns)), /RECONCILIATION_MISMATCH/u);
  assert.equal((await readdir(t.directory)).length, 4);
});
